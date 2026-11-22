// The page tree matches the worldline rules: keep, rollback, rewind, cap, no secrets.
import { WORLD_CAP, WORLD_KEY, adoptDecision, blankWorld, cleanSnap, saveWorld, snapOk, worldAdd, worldRewind } from "../web/world.mjs";

function fail(name) {
  console.error("world " + name);
  process.exit(1);
}

function snap(motif, deck, g, air) {
  return {
    seed: 42,
    level: 2,
    form: 0,
    pace: 0,
    band: 0,
    g,
    jump: 11.2,
    slide: 0.48,
    speed: 8,
    air,
    magnet: 0,
    hue: 0,
    coyote: 0.12,
    forgive: 0.12,
    motif,
    scene: "(garden (sky 0.55 0.72 0.95) (ground 0.42 0.68 0.38) (flower daisy 0.45) (light 0.82))",
    pals: "(pals (pal kitten mochi 0.95 0.62 0.35 hop) (pal car beep 0.3 0.55 0.95 pace))",
    loot: "coin",
    bend: 0.38,
    deck,
    "chase-speed": 2.1,
    "chase-cool": 0.42,
    "chase-at": 0.42,
    "chase-commit": 7.5,
    sky: [0.55, 0.72, 0.95],
    ground: [0.42, 0.68, 0.38],
    flower: "daisy",
    density: 0.45,
    light: 0.82,
    fog: 0.22,
  };
}

const phrase = snap("(seq (ground 8))", [], 32, 0);
const cards = snap("", ["light", "double"], 22, 1);
if (!snapOk(phrase) || !snapOk(cards)) fail("snap");

const a = worldAdd(blankWorld(), "KEEP", "fair", "motif", "A new shape bloomed", phrase, 100);
const b = worldAdd(a.tree, "ROLLBACK", "geometry", "motif", "That shape drifted away", phrase, 101);
const c = worldAdd(b.tree, "KEEP", "fair", "cards", "Cards together", cards, 102);
const tree = c.tree;
const nodeA = tree.nodes.find((n) => n.id === a.id);
const nodeB = tree.nodes.find((n) => n.id === b.id);
const nodeC = tree.nodes.find((n) => n.id === c.id);
if (!nodeA || !nodeB || !nodeC) fail("three");
if (nodeA.kind !== "KEEP" || nodeB.kind !== "ROLLBACK" || nodeC.kind !== "KEEP") fail("kinds");
if (nodeB.why !== "geometry" || nodeC.arm !== "cards") fail("marks");
if (nodeB.parent !== a.id || nodeC.parent !== a.id || tree.tip !== c.id) fail("parents");
if (nodeB.snap) fail("roll-snap");

const again = worldAdd(tree, "KEEP", "fair", "motif", "A new shape bloomed", phrase, 103);
if (again.id === a.id) fail("same-cue");

const back = worldRewind(tree, a.id);
if (!back.ok || back.tree.tip !== a.id) fail("rewind");
if (!back.tree.nodes.find((n) => n.id === b.id) || !back.tree.nodes.find((n) => n.id === c.id)) fail("kept-b");
if (back.tree.nodes.length !== tree.nodes.length) fail("length");
if (back.snap.motif !== "(seq (ground 8))" || back.snap.deck.length !== 0 || Math.abs(back.snap.g - 32) > 0.05) fail("snap-a");

const refused = worldRewind(tree, b.id);
if (refused.ok || refused.tree.tip !== tree.tip) fail("rollback");

let full = blankWorld();
for (let i = 1; i <= 30; i++) full = worldAdd(full, "KEEP", "level", "run", "Level clear", phrase, 200 + i).tree;
if (full.nodes.length > WORLD_CAP || !full.nodes.some((n) => n.id === full.tip)) fail("cap");

const loud = { ...phrase, audio: "clip", key: "sk-live" };
if (snapOk(loud) || cleanSnap(loud)) fail("audio");
const quiet = worldAdd(blankWorld(), "KEEP", "fair", "motif", "Bloom", loud, 9);
const bag = { getItem: () => null, setItem(k, v) { this.value = v; this.key = k; } };
const saved = saveWorld(bag, quiet.tree);
if (bag.key !== WORLD_KEY || WORLD_KEY === "lumen-record" || WORLD_KEY === "lumen-cards") fail("key");
if (bag.value.includes("clip") || bag.value.includes("sk-live") || bag.value.includes("\"audio\"") || bag.value.includes("\"key\"")) {
  fail("persist");
}
if (saved.nodes[0].snap) fail("stored");

const weak = { ...phrase, g: 5 };
const sword = { ...phrase, deck: ["sword"] };
const edited = snap("", ["light", "double"], 24, 1);
const drift = snap("", ["light", "double"], 22, 0);
if (snapOk(weak) || snapOk(sword) || snapOk(drift)) fail("bounds");
if (!snapOk(edited)) fail("primer-g");
if (snapOk({ ...phrase, mood: "dark" }) || snapOk({ ...phrase, biome: "Bad" })) fail("venue");
if (!snapOk({ ...phrase, biome: "mars" })) fail("mars");
if (!snapOk({ ...phrase, biome: "space", mood: "neon" })) fail("venue-ok");
const cleaned = cleanSnap(phrase);
if (!cleaned || cleaned.biome !== "garden" || cleaned.mood !== "day") fail("venue-default");
if (cleanSnap({ ...phrase, biome: "city", mood: "sunset" }).biome !== "city") fail("venue-keep");
if (cleanSnap({ ...phrase, biome: "city", mood: "sunset" }).mood !== "sunset") fail("mood-keep");
const lavaMood = cleanSnap({ ...phrase, biome: "lava-canyon", mood: "0.28" });
if (!lavaMood || lavaMood.biome !== "lava-canyon" || lavaMood.mood !== "0.28") fail("custom-mood");
const keptSpec = {
  id: "lava-canyon",
  sky: [0.42, 0.16, 0.18],
  road: [0.7, 0.42, 0.28],
  ground: [0.22, 0.16, 0.16],
  fogAmt: 0.18,
  light: 0.78,
  form: "(biome lava-canyon)",
};
const withSpec = cleanSnap({ ...phrase, biome: "lava-canyon", mood: "0.28", spec: keptSpec });
if (!withSpec || !withSpec.spec || withSpec.spec.id !== "lava-canyon" || withSpec.spec.form !== keptSpec.form) fail("spec");
const badSpec = cleanSnap({ ...phrase, spec: { id: "Bad", form: "x" } });
if (!badSpec || badSpec.spec) fail("bad-spec");
if (JSON.stringify(cleanSnap(phrase)).includes("\"key\"") || JSON.stringify(cleanSnap(phrase)).includes("\"audio\"")) fail("phrase-secret");

const adopted = adoptDecision(blankWorld(), {
  op: "decision", kind: "KEEP", why: "fair", arm: "motif", cue: "A new shape bloomed",
  world: "w9-5", parent: "", snap: phrase,
});
const rolled = adoptDecision(adopted, {
  op: "decision", kind: "ROLLBACK", why: "geometry", arm: "motif", cue: "That shape drifted away",
  world: "w9-6", parent: "w9-5", snap: { ...phrase, audio: true },
});
if (rolled.nodes.length !== 2 || rolled.tip !== "w9-5") fail("adopt");
if (rolled.nodes[1].snap) fail("adopt-audio");
const dup = adoptDecision(rolled, { kind: "KEEP", world: "w9-5", cue: "other", snap: cards });
if (dup !== rolled || dup.nodes.length !== 2) fail("dup");

console.log("world ok");
