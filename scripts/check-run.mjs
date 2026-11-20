// Multiplier, combo, venues, and obstacle contrast across biomes.
import { awardPickup, praise } from "../web/score.mjs";
import { dressPalette, palette } from "../web/render.mjs";
import {
  addMult,
  applyVoice,
  biomeForLevel,
  evoLine,
  nextBiome,
  onLevelGate,
  seeCoin,
} from "../web/runstate.mjs";

let failed = 0;
function check(name, ok) {
  if (!ok) {
    failed += 1;
    console.error("fail", name);
  } else {
    console.log("ok", name);
  }
}

const plain = awardPickup(25, 0, 0, 1000, 1, 0);
check("coin-x1", plain.gained === 25 && plain.extra === 0 && plain.combo === 1);

const row = awardPickup(25, 2, 9999, 0, 1, 0);
check("combo-x1", row.gained === 75 && row.extra === 50 && row.combo === 3);

const scaled = awardPickup(25, 2, 9999, 0, 1, 0, 2);
check("combo-x2", scaled.gained === 150 && scaled.extra === 125 && scaled.combo === 3);

const nice = praise(1, 0, 3);
check("skill-x3", nice.points === 60 && nice.text === "Nice! +60");

const gate = onLevelGate({
  level: 1, form: 0, mult: 1, combo: 4, comboUntil: 9000, distance: 140, biome: "garden", mood: "day",
}, { form: 1 });
check("gate-combo", gate.combo === 4 && gate.comboUntil === 9000 && gate.distance === 140);
check("gate-mult", gate.mult === 2 && gate.gain === 1 && gate.level === 2);
check("gate-biome", gate.biome === "city" && gate.what === "harder" && gate.chalCoins === 0);

const again = onLevelGate({
  level: 2, form: 1, mult: gate.mult, combo: gate.combo, comboUntil: gate.comboUntil,
  distance: 280, biome: "city", mood: "sunset",
}, { form: 1 });
check("gate2", again.combo === 4 && again.mult === 3 && again.biome === "space" && again.mood === "sunset" && again.what === "hero");

check("cycle", [1, 2, 3, 4, 5, 6].map(biomeForLevel).join(",") === "garden,city,space,coast,garden,city");
check("next", nextBiome("coast") === "garden" && nextBiome("city") === "space");

const coins = [0, 1, 2].reduce((s) => seeCoin(s.coins, s.done, s.mult), { coins: 0, done: false, mult: 1 });
check("chal", coins.done && coins.mult === 2 && coins.gain === 1 && seeCoin(coins.coins, true, coins.mult).gain === 0);

const cap = addMult(8, 1);
check("cap", cap.mult === 8 && cap.gain === 0);

const said = applyVoice({
  level: 2, distance: 90, combo: 3, comboUntil: 4000, mult: 2, biome: "city", mood: "day", pinned: false,
}, { act: "biome", name: "space" });
check("voice-biome", said.biome === "space" && said.pinned && said.combo === 3 && said.distance === 90 && said.level === 2 && said.mult === 2);

const mood = applyVoice(said, { act: "mood", name: "night" });
check("voice-mood", mood.mood === "night" && mood.biome === "space" && mood.combo === 3 && mood.distance === 90 && mood.banner === "mood");

const hop = applyVoice(mood, { act: "biome-next", name: "next" });
check("voice-next", hop.biome === "coast" && hop.combo === 3 && hop.level === 2);

check("banner", evoLine(2, "city", 2, 1, "harder", "en") === "Level 2 · City · ×2 +1 · Trickier path");
check("banner-zh", evoLine(2, "city", 2, 1, "harder", "zh") === "第2关 · 城市 · ×2 +1 · 路更难一点");

const garden = palette(0, null);
const dressed = dressPalette(garden, "garden", "day");
check("garden-sky", dressed.sky0.every((n, i) => n === garden.sky0[i]) && dressed.stars === 0 && dressed.disc === 1);
check("garden-road", dressed.path.every((n, i) => n === garden.path[i]));

function sameObstacle(a, b) {
  return ["hurdle", "hurdleTop", "gate", "coin", "pot", "potRim", "spring"].every((k) => a[k].every((n, i) => n === b[k][i]));
}

for (const biome of ["city", "space", "coast"]) {
  for (const mood of ["day", "night", "sunset", "neon"]) {
    const pal = dressPalette(palette(0, null), biome, mood);
    check(`${biome}-${mood}-obstacle`, sameObstacle(pal, garden));
    check(`${biome}-${mood}-fog`, pal.fogAmt <= 0.38 && pal.lightAmt >= 0.62);
    check(`${biome}-${mood}-path`, pal.path[0] + pal.path[1] + pal.path[2] > 0.35);
  }
}

const space = dressPalette(palette(0, null), "space", "day");
const city = dressPalette(palette(0, null), "city", "day");
check("space-sky", space.stars === 1 && space.sky0[2] > space.sky0[0]);
check("city-sky", city.sky1[0] > city.sky1[2] && city.path[0] < 0.35);

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("run ok");
