// The level step, seen from the view: a venue's props rotate with the
// shift, a moon night moves the disc without touching a painted world,
// and a painted world keeps its own sky.
import { BIOME_PROPS, VENUE_PROP_KINDS, dressPalette, palette, propOrder } from "../web/render.mjs";

let failed = 0;
function check(name, ok) {
  if (!ok) {
    failed += 1;
    console.error("fail", name);
  } else {
    console.log("ok", name);
  }
}

const base = palette(0, null);
const kinds = (rows) => rows.map((r) => r.kind).join(",");

check("garden-pool", kinds(propOrder("garden", 0)) === "tree,bush,fern,mushroom");
check("shift-rotates", kinds(propOrder("garden", 1)) === "bush,fern,mushroom,tree");
check("shift-wraps", kinds(propOrder("garden", 7)) === kinds(propOrder("garden", 3)));
check("shift-negative", kinds(propOrder("garden", -1)) === kinds(propOrder("garden", 3)));
check("unknown-biome", kinds(propOrder("nowhere", 0)) === kinds(propOrder("garden", 0)));
check("all-pools-drawn", Object.values(BIOME_PROPS).every((pool) => pool.every((p) => VENUE_PROP_KINDS.has(p.kind))));
check("pool-shape", Object.values(BIOME_PROPS).every((pool) => pool.length >= 3
  && pool.every((p) => p.density > 0 && p.density <= 0.55 && p.scale >= 0.55 && p.scale <= 1.45)));

const moon = dressPalette(base, "garden", "night", null, { body: "moon", uv: [0.3, 0.7], shift: 2 });
check("moon-pale", moon.sun[0] > 0.7 && moon.sun[2] > 0.9);
check("moon-stars", moon.stars >= 0.7);
check("sun-uv-applied", moon.sunUv[0] === 0.3 && moon.sunUv[1] === 0.7);
check("props-rotated", kinds(moon.props) === kinds(propOrder("garden", 2)));

const stars = dressPalette(base, "space", "night", null, { body: "stars", uv: [0.5, 0.8], shift: 0 });
check("stars-full", stars.stars === 1 && stars.disc <= 0.2);

const noon = dressPalette(base, "garden", "day", null, { body: "sun", uv: [0.2, 0.56], shift: 0 });
check("sun-keeps-disc", noon.disc === 1);

const spec = {
  id: "painted-place", label: "painted", recipe: "mix",
  sky: [0.2, 0.3, 0.6], horizon: [0.9, 0.5, 0.4], fog: [0.8, 0.6, 0.5], fogAmt: 0.2,
  body: "sun", road: [0.5, 0.4, 0.3], curb: [0.4, 0.3, 0.2], ground: [0.3, 0.5, 0.3],
  surface: "stone", light: 0.8, mood: 0.5, particles: "none", particleAmt: 0,
  props: [{ kind: "rock", density: 0.2, scale: 1 }], form: "",
};
const painted = dressPalette(base, "garden", "night", spec, { body: "moon", uv: [0.1, 0.9], shift: 3 });
check("painted-body-wins", painted.disc === 1);
check("painted-props-win", kinds(painted.props) === "rock");
check("painted-uv-kept", painted.sunUv[0] !== 0.1);

const thin = dressPalette(base, "coast", "sunset", null, undefined);
check("no-step-keeps-scale", !thin.props);

if (failed) {
  console.error(`sky check failed: ${failed}`);
  process.exit(1);
}
console.log("sky ok");
