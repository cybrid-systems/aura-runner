// Sculpture forms: nested transforms, the contract, and a safe fallback.
import { dressPalette, palette } from "../web/render.mjs";
import {
  DRESS_CITY, DRESS_CAP, PRIM_NAMES, activeDress, dressHash, dressMutate, expandDress, setActiveDress,
} from "../web/dress.mjs";

function fail(msg) {
  throw new Error(msg);
}

const kept = expandDress(DRESS_CITY);
if (!kept.ok) fail("default rolled back " + kept.why);
if (kept.count !== 6) fail("default cubes " + kept.count);
if (kept.motion !== 3 || kept.depth !== 3) fail("default behaviour");
if (kept.count > DRESS_CAP) fail("default over the cap");
for (const site of kept.sites) {
  for (const cube of site.cubes) {
    const lat = Math.abs(site.side * 6.5 + cube.x) - Math.hypot(cube.sx, cube.sz) / 2;
    if (lat < 4.6) fail("default sits on the lane");
  }
}

const lane = expandDress("(dress city (place 1 0 (move -2.4 0 0 (shard 0.8 trim))))");
if (lane.ok || lane.why !== "clearance") fail("lane " + lane.why);
const tall = expandDress("(dress city (place 1 0 (stack 4 0.8 (shard 1.6 trim))))");
if (tall.ok || tall.why !== "sight") fail("tall " + tall.why);
const huge = expandDress("(dress city (mirror (place 1 0 (stack 4 0.3 (ring 0.8 trim)))))");
if (huge.ok || huge.why !== "budget") fail("huge " + huge.why);
const broken = expandDress("(dress city (nope))");
if (broken.ok || broken.why !== "shape") fail("broken " + broken.why);
const dull = expandDress("(dress city (place 1 0 (box 0.2 0.2 0.2 trim)))");
if (dull.ok || dull.why !== "read") fail("read " + dull.why);

const joined = expandDress("(dress city (place 1 0 (join (shard 0.8 trim) (lantern sun))))");
if (!joined.ok || joined.count !== 3) fail("join " + joined.why + " " + joined.count);

const nested = expandDress("(dress city (mirror (place 1 0 (yaw 0.08 (float 0.4 (recur 2 0.65 (arch 1.1 1.0 flower)))))))");
if (!nested.ok) fail("nested " + nested.why);
if (nested.depth < 2 || nested.motion < 1) fail("nested behaviour");

const before = activeDress();
const bad = setActiveDress("(dress city (slide (shard 1 trim)))");
if (bad.ok || activeDress() !== before) fail("illegal form replaced the seed");

const hashes = new Set();
const prims = new Set();
const ops = new Set();
const motions = new Set();
for (let seed = 1; seed <= 300; seed++) {
  const form = dressMutate(DRESS_CITY, seed);
  const ev = expandDress(form);
  if (!ev.ok) fail("mutate left the contract " + seed + " " + ev.why + " " + form);
  hashes.add(dressHash(form));
  motions.add(ev.motion);
  for (const name of PRIM_NAMES) {
    if (form.includes("(" + name + " ")) prims.add(name);
  }
  for (const op of ["float", "spin", "stack", "recur", "join", "mirror", "yaw", "scale"]) {
    if (form.includes("(" + op + " ")) ops.add(op);
  }
}
if (hashes.size < 80) fail("only " + hashes.size + " structures in 300 seeds");
if (prims.size < PRIM_NAMES.length) fail("primitives " + [...prims].join(","));
if (ops.size < 6) fail("transforms " + [...ops].join(","));
if (motions.size < 3) fail("motion cells " + [...motions].join(","));

const city = dressPalette(palette(0, null), "city", "day");
if (!city.wall) fail("city lost its grade while the sculpture loaded");

console.log(`dress ok cubes ${kept.count} hashes ${hashes.size} prims ${prims.size} ops ${ops.size}`);
