// Biome EDSL on the view side. A mix spec keeps obstacle colours, clamps
// the prop budget, and does not invent a venue the gate would refuse.
import { acceptSpec, dressPalette, palette, specInstances, surfaceBand, takeVenue, worldPlan } from "../web/render.mjs";

function sameObstacle(a, b) {
  for (const key of ["hurdle", "hurdleTop", "gate", "coin", "pot", "potRim"]) {
    if (a[key].join(",") !== b[key].join(",")) return false;
  }
  return true;
}

const garden = dressPalette(palette(0, null), "garden", "day");
const city = dressPalette(palette(0, null), "city", "day");
if (city.path.join(",") !== "0.22,0.24,0.28") throw new Error("city road moved " + city.path);
if (garden.custom) throw new Error("garden daylight became a mix");

const lava = acceptSpec({
  id: "lava-canyon",
  label: "Lava Canyon",
  recipe: "mix",
  sky: [0.42, 0.16, 0.18],
  horizon: [0.86, 0.4, 0.22],
  fog: [0.55, 0.28, 0.22],
  fogAmt: 0.9,
  body: "sun",
  road: [0.48, 0.3, 0.22],
  curb: [0.32, 0.18, 0.14],
  ground: [0.18, 0.16, 0.18],
  surface: "lava",
  light: 0.72,
  mood: 0.84,
  particles: "embers",
  particleAmt: 0.36,
  props: [
    { kind: "rock", density: 0.9, scale: 3 },
    { kind: "arch", density: 0.18, scale: 0.95 },
    { kind: "nope", density: 1, scale: 1 },
  ],
});
if (!lava || lava.id !== "lava-canyon") throw new Error("lava spec dropped");
if (!(lava.fogAmt <= 0.38)) throw new Error("fog not clamped " + lava.fogAmt);
if (!(lava.props[0].density <= 0.55 && lava.props[0].scale <= 1.45)) throw new Error("prop budget not clamped");
if (lava.props.some((row) => row.kind === "nope")) throw new Error("unknown prop kept");
if (!(specInstances(lava) <= 168)) throw new Error("instances " + specInstances(lava));

const dressed = dressPalette(palette(0, null), "garden", "day", lava);
if (!dressed.custom || dressed.biome !== "lava-canyon") throw new Error("mix did not dress");
if (!sameObstacle(dressed, garden)) throw new Error("obstacles recolored");
if (dressed.path[0] !== 0.48) throw new Error("road ignored the spec");

const builtin = acceptSpec({ ...lava, id: "city", recipe: "city" });
const still = dressPalette(palette(0, null), "city", "sunset", builtin);
if (still.custom) throw new Error("built-in recipe left the polished path");
if (still.biome !== "city" || still.mood !== "sunset") throw new Error("built-in venue lost");

if (acceptSpec({ id: "Bad", recipe: "mix" })) throw new Error("bad id accepted");

const beijing = acceptSpec({
  id: "beijing",
  label: "Beijing",
  recipe: "mix",
  sky: [0.55, 0.62, 0.78],
  horizon: [0.95, 0.72, 0.45],
  fog: [0.9, 0.75, 0.55],
  fogAmt: 0.2,
  body: "sun",
  road: [0.35, 0.32, 0.28],
  curb: [0.45, 0.28, 0.22],
  ground: [0.32, 0.34, 0.3],
  surface: "stone",
  light: 0.8,
  mood: 0.5,
  particles: "none",
  particleAmt: 0,
  props: [{ kind: "pagoda", density: 0.2, scale: 1 }],
});
if (!beijing || beijing.id !== "beijing") throw new Error("beijing spec dropped");
const fromGarden = takeVenue({ name: "garden", spec: null }, { biome: "city", spec: false });
if (fromGarden.name !== "city" || fromGarden.spec) throw new Error("city wish kept the garden");
const stale = takeVenue({ name: "beijing", spec: beijing }, { biome: "city" });
if (stale.name !== "city" || stale.spec) throw new Error("city wish kept a stale mix");
const kept = takeVenue({ name: "garden", spec: null }, { biome: "beijing", spec: beijing });
if (!kept.spec || kept.name !== "beijing" || kept.spec.id !== "beijing") throw new Error("named city mix dropped");
const foreign = takeVenue({ name: "garden", spec: null }, { biome: "city", spec: beijing });
if (foreign.name !== "city" || foreign.spec) throw new Error("city message kept another mix");
const held = takeVenue({ name: "beijing", spec: beijing }, {});
if (!held.spec || held.name !== "beijing") throw new Error("an empty tick cleared the city");

const canyon = takeVenue({ name: "garden", spec: null }, { biome: "lava-canyon", spec: lava });
if (!canyon.spec || canyon.name !== "lava-canyon") throw new Error("lava-canyon was clamped");
const mars = takeVenue({ name: "garden", spec: null }, { biome: "mars" });
if (mars.name !== "mars" || mars.spec) throw new Error("a legal id with no spec was dropped");
if (lava.form !== "") throw new Error("a missing form rejected the spec");

const sand = acceptSpec({
  id: "sand-dunes",
  recipe: "mix",
  sky: [0.96, 0.74, 0.46],
  horizon: [0.98, 0.86, 0.62],
  fog: [0.94, 0.82, 0.58],
  fogAmt: 0.14,
  body: "sun",
  road: [0.72, 0.58, 0.36],
  curb: [0.55, 0.4, 0.24],
  ground: [0.86, 0.72, 0.42],
  surface: "sand",
  light: 0.88,
  mood: 0.72,
  particles: "sparkles",
  particleAmt: 0.36,
  props: [{ kind: "rock", density: 0.32, scale: 0.9 }, { kind: "palm", density: 0.22, scale: 1.05 }],
  form: "(biome sand-dunes)",
});
const sandNight = dressPalette(palette(0, null), "sand-dunes", "night", sand);
if (!sandNight.custom || sandNight.sky0[0] < 0.9) throw new Error("night pulled the desert sky");
if (sandNight.path[0] !== 0.72) throw new Error("desert road ignored the spec");

const low = worldPlan(sand, "low");
const lowAgain = worldPlan(sand, "low");
const high = worldPlan(sand, "high");
if (low !== lowAgain) throw new Error("the same world did not reuse its plan");
if (high === low) throw new Error("tiers shared one plan");
if (!(low.particleAmt <= 0.1) || !(low.props[0].density < sand.props[0].density)) throw new Error("low plan was not lighter");
if (high.particleAmt !== sand.particleAmt) throw new Error("high plan changed the particle amount");
if (low.id !== "sand-dunes" || high.id !== "sand-dunes") throw new Error("plan lost its id");

if (surfaceBand({ custom: 1, surface: "sand" }) !== 3) throw new Error("sand band");
if (surfaceBand({ custom: 1, surface: "dust" }) !== 3) throw new Error("dust band");
if (surfaceBand({ custom: 1, surface: "reef" }) !== 2) throw new Error("reef band");
if (surfaceBand({ custom: 1, surface: "grass" }) !== 0) throw new Error("other custom band");
if (surfaceBand({ custom: 0, surface: "sand" }) !== 4) throw new Error("built-in band");
if (surfaceBand({ custom: 1, surface: "ice" }) !== 5) throw new Error("ice band");

console.log("edsl view ok instances " + specInstances(lava).toFixed(1));
