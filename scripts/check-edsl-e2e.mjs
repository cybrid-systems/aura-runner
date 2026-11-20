// Curated world cities pass the same contrast and instance budget the
// Aura trial enforces. Voice switches keep the combo and the distance
// the camera follows.
import { dressPalette, palette } from "../web/render.mjs";
import { applyVoice } from "../web/runstate.mjs";
import {
  curatedSpecs,
  fallbackFor,
  resolvePlace,
  trialSpec,
} from "../web/edsl.mjs";

let failed = 0;
function check(name, ok) {
  if (!ok) {
    failed += 1;
    console.error("fail", name);
  } else {
    console.log("ok", name);
  }
}

const garden = palette(0, null);
const baseKeys = ["hurdle", "hurdleTop", "gate", "coin", "pot", "potRim", "spring"];
function sameObstacle(a, b) {
  return baseKeys.every((k) => a[k].every((n, i) => n === b[k][i]));
}

for (const spec of curatedSpecs()) {
  const gate = trialSpec(spec);
  const label = spec.key || spec.id;
  check(`${label}-trial`, gate.ok && gate.instances <= 150 && gate.fog <= 0.3 && gate.light >= 0.74);
  for (const mood of ["day", "night", "sunset", "neon"]) {
    const pal = dressPalette(palette(0, null), spec.id, mood, spec);
    check(`${label}-${mood}-obstacle`, sameObstacle(pal, garden));
    check(`${label}-${mood}-fog`, pal.fogAmt <= 0.38 && pal.lightAmt >= 0.62);
    check(`${label}-${mood}-path`, pal.path[0] + pal.path[1] + pal.path[2] > 0.35);
  }
}

const held = {
  level: 2, distance: 140, combo: 4, comboUntil: 9000, mult: 3, biome: "city", mood: "day", pinned: false,
};
function stayed(next, biome) {
  return next.biome === biome && next.combo === 4 && next.comboUntil === 9000
    && next.distance === 140 && next.level === 2 && next.mult === 3 && next.pinned;
}

const phrases = [
  ["去北京", "beijing"], ["北京", "beijing"], ["beijing", "beijing"],
  ["去上海", "shanghai"], ["上海", "shanghai"], ["shanghai", "shanghai"],
  ["杭州", "hangzhou"], ["西湖", "hangzhou"], ["hangzhou", "hangzhou"],
  ["成都", "chengdu"], ["chengdu", "chengdu"],
  ["西安", "xian"], ["xian", "xian"],
  ["重庆", "chongqing"], ["chongqing", "chongqing"],
  ["香港", "hongkong"], ["hong kong", "hongkong"],
  ["纽约", "newyork"], ["new york", "newyork"],
  ["旧金山", "sanfrancisco"], ["san francisco", "sanfrancisco"],
  ["洛杉矶", "losangeles"], ["los angeles", "losangeles"],
  ["巴黎", "paris"], ["paris", "paris"],
  ["伦敦", "london"], ["london", "london"],
  ["罗马", "rome"], ["rome", "rome"],
  ["威尼斯", "venice"], ["venice", "venice"],
  ["东京", "tokyo"], ["tokyo", "tokyo"],
];
for (const [text, biome] of phrases) {
  const hit = resolvePlace(text, "city");
  const next = applyVoice(held, { act: hit.act, name: hit.act === "biome" ? hit.name : hit.name, spec: hit.spec });
  check(`voice-${text}`, hit && hit.biome === biome && stayed(next, biome));
}

check("tour-china", resolvePlace("去中国", "garden").biome === "beijing");
check("tour-china-next", resolvePlace("中国城市", "beijing").biome === "shanghai");
check("tour-us", resolvePlace("去美国", "garden").biome === "newyork");
check("tour-us-next", resolvePlace("美国城市", "newyork").biome === "sanfrancisco");
check("tour-eu", resolvePlace("去欧洲", "garden").biome === "paris");
check("tour-eu-next", resolvePlace("欧洲城市", "paris").biome === "london");
check("tour-world", resolvePlace("环球旅行", "london").biome === "rome");
check("tour-next", resolvePlace("下一个城市", "tokyo").biome === "beijing");
check("tour-en", resolvePlace("world tour", "venice").biome === "tokyo");
check("tour-en-next", resolvePlace("next city", "paris").biome === "london");
check("builtin-garden", resolvePlace("花园", "beijing").biome === "garden" && resolvePlace("花园", "beijing").spec == null);
check("builtin-city", resolvePlace("城市", "beijing").biome === "city");
check("mood-night", resolvePlace("夜晚", "paris").act === "mood" && resolvePlace("夜晚", "paris").mood === "night");
check("soft", resolvePlace("sunny garden", "city") == null);
check("not-speed", resolvePlace("跑快点", "city") == null);

const asks = [
  ["去桂林", "visit-china", "china-mist"],
  ["去拉萨", "visit-china", "china-high"],
  ["去大理", "visit-china", "china-lake"],
  ["去阿姆斯特丹", "visit-europe", "europe-canal"],
  ["去芝加哥", "visit-us", "us-brick"],
  ["go to Prague", "visit-europe", "europe-stone"],
];
for (const [text, id, key] of asks) {
  const hit = resolvePlace(text, "city");
  const spec = fallbackFor(hit.name);
  const next = applyVoice(held, { act: "biome-ask", name: hit.name, spec });
  check(`ask-${text}`, hit.act === "biome-ask" && hit.biome === id && spec.key === key
    && trialSpec(spec).ok && stayed(next, id) && next.distance === 140);
}

const paris = dressPalette(palette(0, null), "paris", "sunset");
const sf = dressPalette(palette(0, null), "sanfrancisco", "day");
const beijing = dressPalette(palette(0, null), "beijing", "day");
check("paris-look", paris.edsl && paris.edsl.props[0] === "eiffel-tower" && paris.sky1[0] > paris.sky1[2]);
check("sf-look", sf.edsl && sf.edsl.props[0] === "bridge-tower" && sf.sky0[2] > sf.sky0[0]);
check("beijing-look", beijing.edsl && beijing.build[0] > beijing.build[2] && beijing.sky0[0] > 0.9);

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("edsl e2e ok");
