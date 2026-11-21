// Biome EDSL on the view side. A mix spec keeps obstacle colours, clamps
// the prop budget, and does not invent a venue the gate would refuse.
import { acceptSpec, dressPalette, palette, specInstances, takeVenue } from "../web/render.mjs";

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

console.log("edsl view ok instances " + specInstances(lava).toFixed(1));
