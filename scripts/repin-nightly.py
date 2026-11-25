#!/usr/bin/env python3
"""Move the Aura nightly pin to whatever the nightly tag publishes now.

The nightly tag is rebuilt in place, so its commit and both asset digests move
without a new release. scripts/install-aura.sh and the image build compare
those digests exactly, so every rebuild turns the pinned checks red until the
pin moves with it.

This script rewrites the two pin files; it does not decide whether the new
nightly is good. .github/workflows/nightly.yml runs it hourly, gates a moved
nightly with `aura test` and the seeded play review, and commits the pin only
after both pass. The aura-ci image digest is left alone: it is the test
container, not the game's binary, and a stale one still runs.

Usage:
  python3 scripts/repin-nightly.py             # move the pin when it moved
  python3 scripts/repin-nightly.py --dry-run   # report, change nothing
  python3 scripts/repin-nightly.py --release-json rel.json --dry-run
  python3 scripts/repin-nightly.py --check-roundtrip   # offline CI guard
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.error
import urllib.request

AURA = "https://api.github.com/repos/cybrid-systems/aura"
RELEASE = AURA + "/releases/tags/nightly"
COMMIT = AURA + "/commits/"
DOWNLOAD = "https://github.com/cybrid-systems/aura/releases/download/nightly"
ARCHES = ("linux-x86_64", "linux-arm64")
BODY_SHA = re.compile(r"aura nightly @ ([0-9a-f]{7,40})")
NOTES = (
    "Aura main green nightly at {short}; the asset digests are the GitHub release "
    "asset digests. .github/workflows/nightly.yml follows the tag hourly, gates a "
    "moved nightly, and commits the pin; never touch tags or releases."
)

TOKEN = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""


class PinError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(f"repin-nightly: {message}")


def get(url: str, accept: str | None = None) -> bytes:
    request = urllib.request.Request(url)
    request.add_header("User-Agent", "aura-runner-nightly")
    if accept:
        request.add_header("Accept", accept)
    if TOKEN:
        # An authenticated call keeps an hourly schedule off the anonymous limit.
        request.add_header("Authorization", f"Bearer {TOKEN}")
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def json_at(url: str) -> dict:
    return json.loads(get(url, "application/vnd.github+json"))


def full_commit(short: str) -> str:
    """A 40-hex commit; the release body only carries the short form."""
    if len(short) == 40:
        return short
    sha = json_at(COMMIT + short).get("sha") or ""
    if len(sha) != 40 or not sha.startswith(short):
        raise PinError(f"could not resolve nightly commit {short}")
    return sha


def asset_sha(assets: dict[str, dict], arch: str) -> str:
    name = f"aura-nightly-{arch}.tar.gz"
    asset = assets.get(name)
    if asset is None:
        raise PinError(f"the nightly release has no {name}")
    digest = asset.get("digest") or ""
    if digest.startswith("sha256:") and len(digest) == 71:
        return digest[len("sha256:"):]
    # Releases published before asset digests need the .sha256 file.
    body = get(f"{DOWNLOAD}/{name}.sha256")
    want = (body.decode("utf-8", "replace").split() or [""])[0]
    if len(want) != 64:
        raise PinError(f"no usable checksum for {name}")
    return want


def nightly(release: dict | None) -> dict:
    if release is None:
        release = json_at(RELEASE)
    found = BODY_SHA.search(release.get("body") or "")
    if found is None:
        raise PinError("the nightly release body has no 'aura nightly @ <sha>' line")
    short = found.group(1)
    assets = {a.get("name"): a for a in release.get("assets") or []}
    updated = release.get("updated_at") or release.get("published_at") or ""
    if not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", updated):
        raise PinError(f"unexpected release timestamp {updated!r}")
    return {
        "short": short[:9],
        "commit": full_commit(short),
        "updated_at": updated,
        "sha256": {arch: asset_sha(assets, arch) for arch in ARCHES},
    }


def pinned_state(baseline: dict) -> dict:
    """The release state the pin already names, for the offline round trip."""
    aura = baseline["aura"]
    return {
        "short": aura["commit_sha"][:9],
        "commit": aura["commit_sha"],
        "updated_at": aura["nightly_updated_at"],
        "sha256": {arch: aura["assets"][arch]["sha256"] for arch in ARCHES},
    }


def baseline_text(text: str, state: dict) -> str:
    data = json.loads(text)
    aura = data["aura"]
    for arch in ARCHES:
        aura["assets"][arch]["sha256"] = state["sha256"][arch]
    aura["commit_sha"] = state["commit"]
    aura["nightly_updated_at"] = state["updated_at"]
    data["generated_at"] = state["updated_at"]
    data["notes"] = NOTES.format(short=state["short"])
    return json.dumps(data, indent=2, sort_keys=True) + "\n"


def set_key(text: str, key: str, value: str) -> str:
    pattern = re.compile(rf'(?m)^{re.escape(key)}[ \t]*=[ \t]*"[^"\n]*"')
    text, count = pattern.subn(f'{key} = "{value}"', text)
    if count != 1:
        raise PinError(f"aura.toml: expected exactly one {key} line, found {count}")
    return text


def toml_text(text: str, state: dict) -> str:
    text = set_key(text, "aura_commit", state["commit"])
    for arch in ARCHES:
        text = set_key(text, "aura_sha256_" + arch.replace("-", "_"), state["sha256"][arch])
    return text


def self_check(root: pathlib.Path) -> None:
    check = subprocess.run(
        [sys.executable, str(root / "scripts" / "check-baseline.py")],
        capture_output=True,
        text=True,
    )
    if check.returncode != 0:
        raise PinError("check-baseline rejected the rewrite:\n" + check.stderr.strip())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--repo-root", default=str(pathlib.Path(__file__).resolve().parent.parent))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--release-json", help="read the release from a saved API response")
    parser.add_argument(
        "--check-roundtrip",
        action="store_true",
        help="offline: the writer must reproduce the pinned files byte for byte",
    )
    args = parser.parse_args()

    root = pathlib.Path(args.repo_root).resolve()
    baseline_path = root / "baseline" / "aura-baseline.json"
    toml_path = root / "aura.toml"
    old_baseline = baseline_path.read_text()
    old_toml = toml_path.read_text()
    pinned = json.loads(old_baseline)
    was = pinned["aura"]["commit_sha"][:9]

    if args.check_roundtrip:
        state = pinned_state(pinned)
        if baseline_text(old_baseline, state) != old_baseline or toml_text(old_toml, state) != old_toml:
            raise PinError(
                "the writer no longer reproduces baseline/aura-baseline.json and aura.toml; "
                "run scripts/repin-nightly.py against the pinned release and commit the result"
            )
        print(f"roundtrip ok: {state['short']}")
        return 0

    release = json.loads(pathlib.Path(args.release_json).read_text()) if args.release_json else None
    state = nightly(release)
    new_baseline = baseline_text(old_baseline, state)
    new_toml = toml_text(old_toml, state)

    print(f"nightly {state['commit']} ({state['updated_at']})")
    for arch in ARCHES:
        print(f"  {arch:13} {state['sha256'][arch]}")

    if new_baseline == old_baseline and new_toml == old_toml:
        print(f"pin: {was} (unchanged)")
        return 0

    moved = pinned["aura"]["commit_sha"] != state["commit"]
    label = f"{was} -> {state['short']}" if moved else f"{was} (metadata refreshed)"
    if args.dry_run:
        print(f"pin: {label} (dry run, not written)")
        return 0

    baseline_path.write_text(new_baseline)
    toml_path.write_text(new_toml)
    self_check(root)
    print(f"pin: {label} (written)")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.URLError as error:
        sys.exit(f"repin-nightly: network error: {error}")
    except PinError as error:
        print(error, file=sys.stderr)
        sys.exit(1)
