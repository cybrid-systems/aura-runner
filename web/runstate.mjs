// Venue, mood, and the cumulative multiplier. Twins of lib/biome.aura.
// A level gate keeps the combo. The multiplier resets on a new run only.
// World cities are pinned on top of that cycle. A voice switch keeps
// the combo and the distance the camera is following.

import { nextPlace, specFor } from "./edsl.mjs";

export const BIOMES = ["garden", "city", "space", "coast"];
export const MOODS = ["day", "night", "sunset", "neon"];
export const MULT_CAP = 8;
export const CHAL_NEED = 3;

export function clampMult(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 1) return 1;
  if (v >= MULT_CAP) return MULT_CAP;
  return Math.floor(v);
}

export function biomeForLevel(level) {
  const n = Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
  return BIOMES[(n - 1) % BIOMES.length];
}

export function nextBiome(name) {
  const i = Math.max(0, BIOMES.indexOf(name));
  return BIOMES[(i + 1) % BIOMES.length];
}

export function addMult(mult, steps) {
  const m = clampMult(mult);
  const g = Number.isFinite(steps) && steps > 0 ? Math.floor(steps) : 0;
  const next = clampMult(m + g);
  return { mult: next, gain: next - m };
}

export function seeCoin(coins, done, mult) {
  const n = Number.isFinite(coins) && coins > 0 ? Math.floor(coins) : 0;
  const m = clampMult(mult);
  if (done) return { coins: n, done: true, mult: m, gain: 0 };
  const next = n + 1;
  if (next >= CHAL_NEED) {
    const got = addMult(m, 1);
    return { coins: next, done: true, mult: got.mult, gain: got.gain };
  }
  return { coins: next, done: false, mult: m, gain: 0 };
}

export function evoWhat(prevForm, nextForm, nextLevel) {
  const a = Number.isFinite(prevForm) && prevForm >= 0 ? Math.floor(prevForm) : 0;
  const b = Number.isFinite(nextForm) && nextForm >= 0 ? Math.floor(nextForm) : 0;
  const lv = Number.isFinite(nextLevel) && nextLevel >= 1 ? Math.floor(nextLevel) : 1;
  if (b > a) return "harder";
  if (b < a) return "ease";
  if (lv === 2 || lv === 3) return "hero";
  return "rival";
}

const BIOME_TITLE = {
  garden: ["Garden", "花园"],
  city: ["City", "城市"],
  space: ["Space", "太空"],
  coast: ["Coast", "海边"],
};
const MOOD_TITLE = {
  day: ["Day", "白天"],
  night: ["Night", "夜晚"],
  sunset: ["Sunset", "日落"],
  neon: ["Neon", "霓虹"],
};
const WHAT_LINE = {
  harder: ["Trickier path", "路更难一点"],
  ease: ["Gentler path", "路轻松一点"],
  hero: ["Hero shines", "英雄发光"],
  rival: ["New rival", "新对手"],
};

function zhIndex(lang) {
  return lang === "zh" ? 1 : 0;
}

export function biomeTitle(name, lang) {
  const spec = specFor(name);
  if (spec) return lang === "zh" ? spec.title : spec.titleEn;
  const row = BIOME_TITLE[name] || BIOME_TITLE.garden;
  return row[zhIndex(lang)];
}

export function moodTitle(name, lang) {
  const row = MOOD_TITLE[name] || MOOD_TITLE.day;
  return row[zhIndex(lang)];
}

export function evoLine(level, biome, mult, gain, what, lang) {
  const g = Number.isFinite(gain) && gain > 0 ? Math.floor(gain) : 0;
  const head = lang === "zh" ? `第${level | 0}关` : `Level ${level | 0}`;
  const plus = g > 0 ? ` +${g}` : "";
  const story = (WHAT_LINE[what] || WHAT_LINE.rival)[zhIndex(lang)];
  return `${head} · ${biomeTitle(biome, lang)} · ×${clampMult(mult)}${plus} · ${story}`;
}

export function venueLine(place, mult, lang) {
  const title = specFor(place) || BIOME_TITLE[place] ? biomeTitle(place, lang) : moodTitle(place, lang);
  return `${title} · ×${clampMult(mult)}`;
}

// The page keeps combo and comboUntil. plan.form is the pace the gate chose.
export function onLevelGate(state, plan) {
  const level = (Number(state.level) || 1) + 1;
  const form = plan && Number.isFinite(plan.form) ? plan.form : state.form;
  const added = addMult(state.mult, 1);
  return {
    level,
    form,
    mult: added.mult,
    gain: added.gain,
    combo: state.combo,
    comboUntil: state.comboUntil,
    distance: state.distance,
    biome: biomeForLevel(level),
    mood: state.mood,
    chalCoins: 0,
    chalDone: false,
    what: evoWhat(state.form, form, level),
  };
}

// A spoken venue or light. Distance, level, and combo stay put.
export function applyVoice(state, intent) {
  const next = {
    level: state.level,
    distance: state.distance,
    combo: state.combo,
    comboUntil: state.comboUntil,
    mult: state.mult,
    biome: state.biome,
    mood: state.mood,
    pinned: !!state.pinned,
    banner: "",
  };
  if (!intent || typeof intent.act !== "string") return next;
  if (intent.act === "biome" && (BIOMES.includes(intent.name) || specFor(intent.name))) {
    next.biome = intent.name;
    next.pinned = true;
    next.banner = "venue";
    const spec = specFor(intent.name);
    if (spec) {
      next.mood = spec.mood;
      next.spec = spec;
    }
  } else if (intent.act === "biome-tour") {
    const id = nextPlace(intent.name, state.biome);
    const spec = specFor(id);
    if (id && spec) {
      next.biome = id;
      next.mood = spec.mood;
      next.spec = spec;
      next.pinned = true;
      next.banner = "venue";
    }
  } else if (intent.act === "biome-ask" && intent.spec && intent.spec.id) {
    next.biome = intent.spec.id;
    next.mood = intent.spec.mood;
    next.spec = intent.spec;
    next.pinned = true;
    next.banner = "venue";
  } else if (intent.act === "biome-next") {
    next.biome = nextBiome(state.biome);
    next.pinned = true;
    next.banner = "venue";
  } else if (intent.act === "mood" && MOODS.includes(intent.name)) {
    next.mood = intent.name;
    next.banner = "mood";
  }
  return next;
}
