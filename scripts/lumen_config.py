#!/usr/bin/env python3
"""Resolve Lumen Run settings.

Precedence for the model, the API address, the music folder, and the
play order: process environment, then lumen.toml, then .env, then the
built-in default.

The API key is the other way around for the two files, so ./play.sh
--setup wins over a key left in lumen.toml: process environment, then
.env, then lumen.toml. The key is never printed. --show and --json
report only its length. --export-file and --container-env write it into
a mode 0600 file for the process that has to see it.
"""
import argparse
import json
import os
import re
import shlex
import sys

DEEPSEEK_URL = "https://api.deepseek.com/v1"
DEEPSEEK_MODEL = "deepseek-flash"
NOTICE = "MiniMax is no longer a preset. Using saved API settings if present, otherwise playing offline."
AUDIO_EXTS = (".mp3", ".ogg", ".wav", ".m4a", ".flac")
CONTAINER_MUSIC = "/music"
KNOWN = ("music_dir", "music_order", "base_url", "model", "api_key")
ENV_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*\Z")
PASSTHROUGH = ("LLM_TIMEOUT", "AURA_HTTP_TIMEOUT")


class ConfigError(Exception):
    pass


def script_root():
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(here)


def resolve_root():
    raw = os.environ.get("LUMEN_ROOT", "").strip()
    if raw:
        return os.path.abspath(os.path.expanduser(raw))
    return script_root()


def env_path(root):
    raw = os.environ.get("LUMEN_ENV_FILE", "").strip()
    if raw:
        return os.path.abspath(os.path.expanduser(raw))
    return os.path.join(root, ".env")


def config_path(root):
    raw = os.environ.get("LUMEN_CONFIG", "").strip()
    if raw:
        return os.path.abspath(os.path.expanduser(raw))
    return os.path.join(root, "lumen.toml")


def parse_env(text):
    found = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not ENV_NAME.match(key):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        found[key] = value
    return found


def _unescape(body, quote):
    out = []
    i = 0
    while i < len(body):
        if body[i] == "\\" and i + 1 < len(body) and body[i + 1] in ("\\", quote):
            out.append(body[i + 1])
            i += 2
            continue
        out.append(body[i])
        i += 1
    return "".join(out)


def parse_toml(text):
    found = {}
    for lineno, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ConfigError("lumen.toml:%d: expected name = \"value\"" % lineno)
        key, rest = line.split("=", 1)
        key = key.strip()
        rest = rest.strip()
        if not ENV_NAME.match(key):
            raise ConfigError("lumen.toml:%d: this line could not be read" % lineno)
        if not rest:
            raise ConfigError("lumen.toml:%d: this line could not be read" % lineno)
        if rest[0] in "'\"":
            quote = rest[0]
            body = []
            i = 1
            closed = False
            while i < len(rest):
                if rest[i] == "\\" and i + 1 < len(rest):
                    body.append(rest[i:i + 2])
                    i += 2
                    continue
                if rest[i] == quote:
                    closed = True
                    i += 1
                    break
                body.append(rest[i])
                i += 1
            if not closed:
                raise ConfigError("lumen.toml:%d: this line could not be read" % lineno)
            tail = rest[i:].strip()
            if tail and not tail.startswith("#"):
                raise ConfigError("lumen.toml:%d: this line could not be read" % lineno)
            found[key] = _unescape("".join(body), quote)
            continue
        if " #" in rest:
            rest = rest.split(" #", 1)[0].rstrip()
        found[key] = rest.strip()
    return found


def read_file(path, parser):
    if not path or not os.path.isfile(path):
        return {}
    try:
        with open(path, encoding="utf-8") as handle:
            return parser(handle.read())
    except ConfigError:
        raise
    except OSError as err:
        raise ConfigError("could not read %s" % os.path.basename(path)) from err


def toml_quote(value):
    return '"%s"' % (
        str(value).replace("\\", "\\\\").replace('"', '\\"')
    )


def expand_dir(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    raw = os.path.expanduser(raw)
    raw = os.path.abspath(raw)
    if len(raw) > 1:
        raw = raw.rstrip("/")
    return raw


def music_message(reason, folder):
    if reason == "missing":
        return "Music folder not found (%s). Using synthesized music." % folder
    if reason == "not-dir":
        return "Music path is not a folder (%s). Using synthesized music." % folder
    if reason == "unreadable":
        return "Music folder could not be read (%s). Using synthesized music." % folder
    if reason == "empty":
        return (
            "Music folder is empty. Add mp3, ogg, wav, m4a, or flac files. "
            "Using synthesized music."
        )
    if reason == "unsupported":
        return (
            "No supported tracks in that folder (mp3, ogg, wav, m4a, flac). "
            "Using synthesized music."
        )
    return ""


def _inside(root_real, file_real):
    return file_real == root_real or file_real.startswith(root_real + os.sep)


def discover(value):
    folder = expand_dir(value)
    empty = {"ok": False, "reason": "unset", "message": "", "tracks": [], "folder": ""}
    if not folder:
        return empty
    if not os.path.exists(folder):
        return {
            "ok": False, "reason": "missing", "folder": folder, "tracks": [],
            "message": music_message("missing", folder),
        }
    if not os.path.isdir(folder):
        return {
            "ok": False, "reason": "not-dir", "folder": folder, "tracks": [],
            "message": music_message("not-dir", folder),
        }
    try:
        root_real = os.path.realpath(folder)
        entries = os.listdir(folder)
    except OSError:
        return {
            "ok": False, "reason": "unreadable", "folder": folder, "tracks": [],
            "message": music_message("unreadable", folder),
        }
    names = []
    others = False
    for name in entries:
        if not name or name.startswith("."):
            continue
        full = os.path.join(folder, name)
        if not os.path.isfile(full):
            continue
        try:
            real = os.path.realpath(full)
        except OSError:
            continue
        if not _inside(root_real, real):
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext in AUDIO_EXTS:
            names.append(name)
        else:
            others = True
    names.sort(key=lambda item: (item.lower(), item))
    if not names and not others:
        return {
            "ok": False, "reason": "empty", "folder": folder, "tracks": [],
            "message": music_message("empty", folder),
        }
    if not names:
        return {
            "ok": False, "reason": "unsupported", "folder": folder, "tracks": [],
            "message": music_message("unsupported", folder),
        }
    return {"ok": True, "reason": "ok", "folder": folder, "tracks": names, "message": ""}


def pick(pairs, default=""):
    for value, source in pairs:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text, source
    return default, "default"


def truthy_minimax(mapping):
    if not mapping:
        return False
    if str(mapping.get("LUMEN_LLM", "")).strip() == "minimax":
        return True
    for name in ("LUMEN_MINIMAX_KEY", "LUMEN_MINIMAX_URL", "LUMEN_MINIMAX_MODEL"):
        if str(mapping.get(name, "")).strip():
            return True
    return False


class Settings(object):
    def __init__(self):
        self.api_key = ""
        self.api_key_source = "none"
        self.base_url = ""
        self.base_url_source = "default"
        self.model = ""
        self.model_source = "default"
        self.music_dir = ""
        self.music_dir_source = "default"
        self.music_order = "shuffle"
        self.music_order_source = "default"
        self.music_order_raw = ""
        self.preset = "off"
        self.explicit_off = False
        self.minimax_notice = ""
        self.music = discover("")
        self.passthrough = {}
        self.order_warning = ""


def load_layers(root=None):
    root = root or resolve_root()
    dotenv = read_file(env_path(root), parse_env)
    config = read_file(config_path(root), parse_toml)
    return root, dotenv, config


def resolve(environ=None, dotenv=None, config=None):
    environ = os.environ if environ is None else environ
    dotenv = dotenv or {}
    config = config or {}
    settings = Settings()
    if truthy_minimax(environ) or truthy_minimax(dotenv):
        settings.minimax_notice = NOTICE

    def nonempty(mapping, name):
        return str((mapping or {}).get(name, "") or "").strip()

    key_env = nonempty(environ, "LLM_API_KEY")
    key_dotenv = nonempty(dotenv, "LLM_API_KEY")
    off_env = nonempty(environ, "LUMEN_LLM_OFF") == "1"
    off_dotenv = nonempty(dotenv, "LUMEN_LLM_OFF") == "1"
    # A skip (LUMEN_LLM_OFF=1) beats the DeepSeek key file and a key that
    # lives only in lumen.toml. A key in the terminal, or in the same .env,
    # still turns AI on.
    if off_env and not key_env:
        settings.explicit_off = True
    elif off_dotenv and not key_env and not key_dotenv:
        settings.explicit_off = True
    if settings.explicit_off:
        settings.api_key = ""
        settings.api_key_source = "none"
    else:
        settings.api_key, settings.api_key_source = pick((
            (environ.get("LLM_API_KEY"), "environment"),
            (dotenv.get("LLM_API_KEY"), ".env"),
            (config.get("api_key"), "lumen.toml"),
        ))
        if not settings.api_key:
            settings.api_key_source = "none"

    url, url_source = pick((
        (environ.get("LLM_BASE_URL"), "environment"),
        (config.get("base_url"), "lumen.toml"),
        (dotenv.get("LLM_BASE_URL"), ".env"),
    ))
    model, model_source = pick((
        (environ.get("LLM_MODEL"), "environment"),
        (config.get("model"), "lumen.toml"),
        (dotenv.get("LLM_MODEL"), ".env"),
    ))
    if url and not (url.startswith("http://") or url.startswith("https://")):
        sys.stderr.write("base_url should start with http:// or https://. Ignoring it.\n")
        url, url_source = "", "default"
    custom_url = bool(url) and url.rstrip("/") != DEEPSEEK_URL
    custom_model = bool(model) and model != DEEPSEEK_MODEL
    if settings.api_key and not custom_url and not custom_model:
        settings.preset = "deepseek"
        if not url:
            url, url_source = DEEPSEEK_URL, "default"
        if not model:
            model, model_source = DEEPSEEK_MODEL, "default"
    elif settings.api_key:
        settings.preset = "generic"
        if not url:
            url, url_source = DEEPSEEK_URL, "default"
        if not model:
            model, model_source = DEEPSEEK_MODEL, "default"
    else:
        settings.preset = "off"
    settings.base_url = url.rstrip("/") if url else ""
    settings.base_url_source = url_source
    settings.model = model
    settings.model_source = model_source

    music, music_source = pick((
        (environ.get("LUMEN_MUSIC_DIR"), "environment"),
        (config.get("music_dir"), "lumen.toml"),
        (dotenv.get("LUMEN_MUSIC_DIR"), ".env"),
    ))
    settings.music_dir = expand_dir(music) if music else ""
    settings.music_dir_source = music_source if settings.music_dir else "default"
    order, order_source = pick((
        (environ.get("LUMEN_MUSIC_ORDER"), "environment"),
        (config.get("music_order"), "lumen.toml"),
        (dotenv.get("LUMEN_MUSIC_ORDER"), ".env"),
    ))
    settings.music_order_raw = order
    if order and order.lower() not in ("shuffle", "ordered"):
        settings.order_warning = (
            "music_order %r is not shuffle or ordered. Using shuffle." % order
        )
        settings.music_order = "shuffle"
    elif order.lower() == "ordered":
        settings.music_order = "ordered"
        settings.music_order_source = order_source
    else:
        settings.music_order = "shuffle"
        settings.music_order_source = order_source if order else "default"
    settings.music = discover(settings.music_dir)

    passed = {}
    for name in PASSTHROUGH:
        value, _source = pick((
            (environ.get(name), "environment"),
            (dotenv.get(name), ".env"),
        ))
        if value:
            passed[name] = value
    settings.passthrough = passed
    return settings


def warn(settings):
    if settings.order_warning:
        sys.stderr.write(settings.order_warning + "\n")
    if settings.minimax_notice:
        sys.stderr.write(settings.minimax_notice + "\n")


def guard(text, key):
    if key and len(key) >= 8 and key in text:
        raise SystemExit("refusing to print the API key")


def public_view(settings):
    music = settings.music
    mount = []
    folder = settings.music_dir
    reason = music.get("reason")
    if folder and ":" not in folder and reason not in ("unset", "missing", "not-dir", "unreadable"):
        if os.path.isdir(folder):
            mount = ["-v", "%s:%s:ro" % (folder, CONTAINER_MUSIC)]
    return {
        "preset": settings.preset,
        "model": settings.model,
        "model_source": settings.model_source,
        "base_url": settings.base_url,
        "base_url_source": settings.base_url_source,
        "api_key_set": bool(settings.api_key),
        "api_key_length": len(settings.api_key),
        "api_key_source": settings.api_key_source,
        "music_dir": settings.music_dir,
        "music_dir_source": settings.music_dir_source,
        "music_order": settings.music_order,
        "music_order_source": settings.music_order_source,
        "music_ok": bool(music.get("ok")),
        "music_count": len(music.get("tracks") or []),
        "music_tracks": list(music.get("tracks") or []),
        "music_message": music.get("message") or "",
        "music_reason": music.get("reason") or "unset",
        "minimax_notice": settings.minimax_notice,
        "explicit_off": settings.explicit_off,
        "docker_mount": mount,
    }


def render_show(settings):
    lines = ["Lumen Run", ""]
    if settings.preset == "deepseek":
        lines.append("AI: DeepSeek V4.1 Flash")
    elif settings.preset == "generic":
        lines.append("AI: custom OpenAI-compatible service")
    else:
        lines.append("AI: off (the game runs without an API key)")
    lines.append("  model: %s  (%s)" % (settings.model or "(none)", settings.model_source))
    lines.append("  address: %s  (%s)" % (settings.base_url or "(none)", settings.base_url_source))
    if settings.api_key:
        lines.append(
            "  api key: set, %d characters  (%s)"
            % (len(settings.api_key), settings.api_key_source)
        )
    else:
        lines.append("  api key: not set")
    lines.append("")
    if settings.music_dir:
        lines.append("Music folder: %s  (%s)" % (settings.music_dir, settings.music_dir_source))
        lines.append("  order: %s  (%s)" % (settings.music_order, settings.music_order_source))
        if settings.music.get("ok"):
            lines.append("  tracks: %d" % len(settings.music.get("tracks") or []))
        else:
            lines.append("  tracks: none")
            if settings.music.get("message"):
                lines.append("  note: %s" % settings.music["message"])
    else:
        lines.append("Music: synthesized (no folder set)")
    if settings.minimax_notice:
        lines.append("")
        lines.append(settings.minimax_notice)
    lines.append("")
    return "\n".join(lines)


def shell_assign(name, value):
    return "%s=%s" % (name, shlex.quote(str(value)))


def export_script(settings):
    lines = ["# Generated for this run. The API key is in this file.", ""]
    if settings.api_key:
        lines.append("export %s" % shell_assign("LLM_API_KEY", settings.api_key))
        lines.append("export %s" % shell_assign("LLM_BASE_URL", settings.base_url))
        lines.append("export %s" % shell_assign("LLM_MODEL", settings.model))
        lines.append("unset LUMEN_LLM_OFF")
        if settings.preset == "deepseek":
            lines.append("export LUMEN_LLM=deepseek")
            lines.append("export %s" % shell_assign("LUMEN_DEEPSEEK_KEY", settings.api_key))
            lines.append("export %s" % shell_assign("LUMEN_DEEPSEEK_URL", settings.base_url))
            lines.append("export %s" % shell_assign("LUMEN_DEEPSEEK_MODEL", settings.model))
        else:
            lines.append("unset LUMEN_LLM")
            lines.append("unset LUMEN_DEEPSEEK_KEY LUMEN_DEEPSEEK_URL LUMEN_DEEPSEEK_MODEL")
    else:
        lines.append("unset LLM_API_KEY LLM_BASE_URL LLM_MODEL")
        lines.append("unset LUMEN_LLM LUMEN_DEEPSEEK_KEY LUMEN_DEEPSEEK_URL LUMEN_DEEPSEEK_MODEL")
        if settings.explicit_off:
            lines.append("export LUMEN_LLM_OFF=1")
        else:
            lines.append("unset LUMEN_LLM_OFF")
    lines.append("unset LUMEN_MINIMAX_KEY LUMEN_MINIMAX_URL LUMEN_MINIMAX_MODEL")
    if settings.music_dir:
        lines.append("export %s" % shell_assign("LUMEN_MUSIC_DIR", settings.music_dir))
        lines.append("export %s" % shell_assign("LUMEN_MUSIC_ORDER", settings.music_order))
        reason = (settings.music.get("reason") or "")
        if reason in ("missing", "not-dir", "unreadable"):
            lines.append("export %s" % shell_assign("LUMEN_MUSIC_REASON", reason))
        else:
            lines.append("unset LUMEN_MUSIC_REASON")
    else:
        lines.append("unset LUMEN_MUSIC_DIR LUMEN_MUSIC_ORDER LUMEN_MUSIC_REASON")
    for name, value in settings.passthrough.items():
        lines.append("export %s" % shell_assign(name, value))
    lines.append("")
    return "\n".join(lines)


def write_private(path, body):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    fd = os.open(path, flags, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(body)
            fd = None
    finally:
        if fd is not None:
            os.close(fd)
    os.chmod(path, 0o600)


def container_env_body(settings):
    lines = ["# Generated by ./play.sh for one run. Do not share it."]
    if settings.api_key:
        lines.append("LLM_API_KEY=%s" % settings.api_key)
        lines.append("LLM_BASE_URL=%s" % settings.base_url)
        lines.append("LLM_MODEL=%s" % settings.model)
        if settings.preset == "deepseek":
            lines.append("LUMEN_LLM=deepseek")
            lines.append("LUMEN_DEEPSEEK_KEY=%s" % settings.api_key)
            lines.append("LUMEN_DEEPSEEK_URL=%s" % settings.base_url)
            lines.append("LUMEN_DEEPSEEK_MODEL=%s" % settings.model)
    else:
        lines.append("LUMEN_LLM_OFF=1")
    view = public_view(settings)
    if view["docker_mount"]:
        lines.append("LUMEN_MUSIC_DIR=%s" % CONTAINER_MUSIC)
        lines.append("LUMEN_MUSIC_ORDER=%s" % settings.music_order)
    elif settings.music_dir and view["music_reason"] in ("missing", "not-dir", "unreadable"):
        # The folder is not mounted. The bridge still needs the reason so
        # /music.json matches the notice ./play.sh already printed.
        lines.append("LUMEN_MUSIC_DIR=%s" % settings.music_dir)
        lines.append("LUMEN_MUSIC_REASON=%s" % view["music_reason"])
        lines.append("LUMEN_MUSIC_ORDER=%s" % settings.music_order)
    for name, value in settings.passthrough.items():
        if "\n" in value or "\r" in value:
            raise ConfigError("%s contains a line break" % name)
        lines.append("%s=%s" % (name, value))
    for line in lines:
        if "\n" in line[line.find("=") + 1:] if "=" in line else "":
            raise ConfigError("a setting contains a line break")
    lines.append("")
    return "\n".join(lines)


def docker_shell(settings):
    view = public_view(settings)
    mount = view["docker_mount"]
    if settings.music_dir and ":" in settings.music_dir:
        sys.stderr.write("Music folder paths cannot contain ':'. Using synthesized music.\n")
        mount = []
    lines = []
    if mount:
        lines.append("music_mount=(-v %s)" % shlex.quote(mount[1]))
    else:
        lines.append("music_mount=()")
    lines.append(shell_assign("music_order", settings.music_order))
    lines.append("llm_on=%d" % (1 if settings.api_key else 0))
    lines.append(shell_assign("llm_base", settings.base_url))
    lines.append(shell_assign("llm_model", settings.model))
    text = "\n".join(lines) + "\n"
    guard(text, settings.api_key)
    return text


def render_toml(values):
    lines = [
        "# Lumen Run settings. ./play.sh rewrites the music folder in this file.",
        "# A value already set in the terminal wins. Then this file, then .env.",
        "# The API key stays in .env. ./play.sh --config shows the key only as a length.",
        "",
    ]
    music = values.get("music_dir", "").strip()
    if music:
        lines.append("music_dir = %s" % toml_quote(music))
    else:
        lines.append('# music_dir = "/Users/you/Music/lumen"')
    order = values.get("music_order", "").strip().lower()
    if order == "ordered":
        lines.append('music_order = "ordered"')
    else:
        lines.append('# music_order = "shuffle"')
    lines.append("")
    lines.append("# Another OpenAI-compatible service. Leave unset for DeepSeek V4.1 Flash.")
    base = values.get("base_url", "").strip()
    model = values.get("model", "").strip()
    if base:
        lines.append("base_url = %s" % toml_quote(base))
    else:
        lines.append('# base_url = "https://example.com/v1"')
    if model:
        lines.append("model = %s" % toml_quote(model))
    else:
        lines.append('# model = "your-model"')
    key = values.get("api_key", "").strip()
    if key:
        lines.append("")
        lines.append("# Prefer .env for this. It is here because it was already in this file.")
        lines.append("api_key = %s" % toml_quote(key))
    lines.append("")
    return "\n".join(lines)


def write_config(path, updates):
    current = {}
    if os.path.isfile(path):
        current = read_file(path, parse_toml)
    for key, value in updates.items():
        if value:
            current[key] = value
        else:
            current.pop(key, None)
    body = render_toml(current)
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    mode = 0o600 if str(current.get("api_key", "")).strip() else 0o644
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    fd = os.open(path, flags, mode)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(body)
            fd = None
    finally:
        if fd is not None:
            os.close(fd)
    os.chmod(path, mode)


def check_music(folder):
    found = discover(folder)
    reason = found["reason"]
    if reason in ("missing", "not-dir", "unset", "unreadable"):
        sys.stdout.write((found["message"] or "That music folder was not found.") + "\n")
        return 1
    count = len(found["tracks"])
    if reason == "ok":
        order = "shuffle"
        try:
            order = current().music_order
        except ConfigError:
            order = "shuffle"
        noun = "track" if count == 1 else "tracks"
        sys.stdout.write("%d %s will loop (%s).\n" % (count, noun, order))
        return 0
    sys.stdout.write(found["message"] + "\n")
    return 0


def music_line(settings):
    if not settings.music_dir:
        return ""
    music = settings.music
    if music.get("ok"):
        count = len(music.get("tracks") or [])
        noun = "track" if count == 1 else "tracks"
        return "Music: %d %s (%s)." % (count, noun, settings.music_order)
    return music.get("message") or ""


def current():
    _root, dotenv, config = load_layers()
    return resolve(os.environ, dotenv, config)


def emit_public(text, settings):
    guard(text, settings.api_key)
    sys.stdout.write(text)


def main(argv):
    parser = argparse.ArgumentParser(description="Resolve Lumen Run settings.")
    parser.add_argument("--show", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--export-file")
    parser.add_argument("--notice", action="store_true")
    parser.add_argument("--music-line", action="store_true")
    parser.add_argument("--preset", action="store_true")
    parser.add_argument("--check-music")
    parser.add_argument("--write-music", default=None)
    parser.add_argument("--docker-sh", action="store_true")
    parser.add_argument("--container-env")
    args = parser.parse_args(argv)

    modes = [
        args.show, args.json, bool(args.export_file), args.notice, args.music_line,
        args.preset, args.check_music is not None, args.write_music is not None, args.docker_sh,
    ]
    if sum(1 for item in modes if item) != 1:
        parser.error("choose one of --show, --json, --export-file, --notice, --music-line, --preset, --check-music, --write-music, --docker-sh")
    if args.container_env and not args.docker_sh:
        parser.error("--container-env is used with --docker-sh")

    try:
        if args.check_music is not None:
            return check_music(args.check_music)
        if args.write_music is not None:
            path = config_path(resolve_root())
            folder = expand_dir(args.write_music) if str(args.write_music).strip() else ""
            if folder and not os.path.isdir(folder):
                raise ConfigError("music folder was not found")
            write_config(path, {"music_dir": folder})
            return 0
        settings = current()
        if args.notice:
            if settings.minimax_notice:
                sys.stderr.write(settings.minimax_notice + "\n")
            return 0
        if args.music_line:
            line = music_line(settings)
            if line:
                guard(line, settings.api_key)
                sys.stdout.write(line + "\n")
            return 0
        if args.preset:
            sys.stdout.write(settings.preset + "\n")
            return 0
        if args.show:
            if settings.order_warning:
                sys.stderr.write(settings.order_warning + "\n")
            emit_public(render_show(settings), settings)
            return 0
        if args.json:
            if settings.order_warning:
                sys.stderr.write(settings.order_warning + "\n")
            blob = json.dumps(public_view(settings), indent=2) + "\n"
            emit_public(blob, settings)
            return 0
        if args.export_file:
            warn(settings)
            write_private(args.export_file, export_script(settings))
            return 0
        if args.docker_sh:
            if args.container_env:
                write_private(args.container_env, container_env_body(settings))
            emit_public(docker_shell(settings), settings)
            return 0
    except ConfigError as err:
        sys.stderr.write(str(err) + "\n")
        return 1
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
