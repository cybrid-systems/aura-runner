// Local music folder. The bridge serves these files and nothing else.
// The same rules live in scripts/lumen_config.py (the host has no Node
// on the Mac path). Keep the messages and the extension list in step.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const AUDIO_EXTS = Object.freeze([".mp3", ".ogg", ".wav", ".m4a", ".flac"]);
const EXT_SET = new Set(AUDIO_EXTS);

export function musicOrder(value) {
  return String(value || "").trim().toLowerCase() === "ordered" ? "ordered" : "shuffle";
}

export function mimeFor(name) {
  switch (path.extname(String(name || "")).toLowerCase()) {
    case ".mp3": return "audio/mpeg";
    case ".ogg": return "audio/ogg";
    case ".wav": return "audio/wav";
    case ".m4a": return "audio/mp4";
    case ".flac": return "audio/flac";
    default: return "";
  }
}

export function musicMessage(reason, folder) {
  if (reason === "missing") return `Music folder not found (${folder}). Using synthesized music.`;
  if (reason === "not-dir") return `Music path is not a folder (${folder}). Using synthesized music.`;
  if (reason === "unreadable") return `Music folder could not be read (${folder}). Using synthesized music.`;
  if (reason === "empty") return "Music folder is empty. Add mp3, ogg, wav, m4a, or flac files. Using synthesized music.";
  if (reason === "unsupported") return "No supported tracks in that folder (mp3, ogg, wav, m4a, flac). Using synthesized music.";
  return "";
}

export function expandMusicDir(value) {
  let dir = String(value || "").trim();
  if (!dir) return "";
  if (dir === "~") dir = os.homedir();
  else if (dir.startsWith("~/")) dir = path.join(os.homedir(), dir.slice(2));
  if (!path.isAbsolute(dir)) dir = path.resolve(dir);
  if (dir.length > 1) dir = dir.replace(/\/+$/, "");
  return dir;
}

function inside(rootReal, fileReal) {
  return fileReal === rootReal || fileReal.startsWith(rootReal + path.sep);
}

export function discoverMusic(value) {
  const folder = expandMusicDir(value);
  if (!folder) return { ok: false, reason: "unset", message: "", tracks: [], folder: "" };
  let st;
  try {
    st = fs.statSync(folder);
  } catch {
    return { ok: false, reason: "missing", message: musicMessage("missing", folder), tracks: [], folder };
  }
  if (!st.isDirectory()) {
    return { ok: false, reason: "not-dir", message: musicMessage("not-dir", folder), tracks: [], folder };
  }
  let rootReal;
  try {
    rootReal = fs.realpathSync(folder);
  } catch {
    return { ok: false, reason: "unreadable", message: musicMessage("unreadable", folder), tracks: [], folder };
  }
  let entries;
  try {
    entries = fs.readdirSync(folder);
  } catch {
    return { ok: false, reason: "unreadable", message: musicMessage("unreadable", folder), tracks: [], folder };
  }
  const names = [];
  let others = false;
  for (const name of entries) {
    if (!name || name.startsWith(".")) continue;
    const full = path.join(folder, name);
    let info;
    try {
      info = fs.statSync(full);
    } catch {
      continue;
    }
    if (!info.isFile()) continue;
    let real;
    try {
      real = fs.realpathSync(full);
    } catch {
      continue;
    }
    if (!inside(rootReal, real)) continue;
    if (EXT_SET.has(path.extname(name).toLowerCase())) names.push(name);
    else others = true;
  }
  names.sort((a, b) => {
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    if (al < bl) return -1;
    if (al > bl) return 1;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  if (!names.length && !others) {
    return { ok: false, reason: "empty", message: musicMessage("empty", folder), tracks: [], folder };
  }
  if (!names.length) {
    return { ok: false, reason: "unsupported", message: musicMessage("unsupported", folder), tracks: [], folder };
  }
  const tracks = names.map((name) => ({
    name,
    file: path.join(folder, name),
    url: "/music/t/" + encodeURIComponent(name),
  }));
  return { ok: true, reason: "ok", message: "", tracks, folder };
}

export function trackByName(found, name) {
  if (!found || !found.ok) return null;
  const base = path.basename(String(name || ""));
  if (!base || base !== name || base.includes("..")) return null;
  return found.tracks.find((row) => row.name === base) || null;
}
