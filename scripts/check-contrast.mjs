// Pink gardens used to fog the bars and pots out of view. The mesh haze
// is capped, and an emissive obstacle keeps a saturated colour at the
// distance where the old fog had already washed it out.
import { palette, fogStrength, obstacleFog, mixRgb } from "../web/render.mjs";

const pink = {
  sky: [0.95, 0.45, 0.55],
  ground: [0.35, 0.72, 0.32],
  flower: "tulip",
  light: 0.9,
  fog: 0.95,
};
const pal = palette(0, pink);
const dist = 36;
const fogT = fogStrength(dist, pink.fog);
const gateFog = obstacleFog(dist, pink.fog, 0.78);
const potFog = obstacleFog(dist, pink.fog, 0.48);
const gate = mixRgb(pal.gate, pal.fog, gateFog);
const pot = mixRgb(pal.pot, pal.fog, potFog);
const old = Math.min(1, 1 - Math.exp(-dist * 0.028) + 0.35 * Math.max(0, Math.min(1, (dist - 28) / 30)));

if (!(fogT <= 0.38)) throw new Error("fog cap failed " + fogT);
if (!(gateFog < 0.2)) throw new Error("gate still lost in fog " + gateFog);
if (!(potFog < 0.25)) throw new Error("pot still lost in fog " + potFog);
if (!(gate[0] - gate[2] > 0.35)) throw new Error("gate no longer reads orange " + gate);
if (!(pot[0] - pot[2] > 0.28)) throw new Error("pot no longer reads warm " + pot);
if (!(old > 0.7 && fogT < old * 0.55)) throw new Error("haze was not reduced");
if (!(pal.fogAmt === 0.95)) throw new Error("scene fog was rewritten before the cap");

console.log(
  `contrast ok fog ${fogT.toFixed(3)} gateFog ${gateFog.toFixed(3)} ` +
  `gate ${gate.map((n) => n.toFixed(2)).join(",")} pot ${pot.map((n) => n.toFixed(2)).join(",")}`,
);
