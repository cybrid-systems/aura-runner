// The badge tree. Layout runs only when the panel is open. A kept node
// can be asked for again. A turned-away node stays, with its reason.
export const WORLD_CAP = 24;
export const WORLD_KEY = "lumen-world";

const LOOTS = new Set(["coin", "blossom", "apple", "star", "gem"]);
const FLOWERS = new Set(["daisy", "tulip", "blossom", "buttercup"]);

export function blankWorld() {
  return { nodes: [], tip: "", n: 0 };
}

function clip(s, n) {
  const t = typeof s === "string" ? s : "";
  return t.length > n ? t.slice(0, n) : t;
}

function inject(s) {
  return s.includes("\"") || s.includes("\\") || s.includes("\n");
}

function phrase(s, n) {
  return typeof s === "string" && s.length <= n && !inject(s);
}

function truthy(v) {
  if (!v) return false;
  if (typeof v === "string") return v.length > 0;
  if (typeof v === "number") return v !== 0;
  return true;
}

function numIn(n, lo, hi) {
  return typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
}

function intIn(n, lo, hi) {
  return numIn(n, lo, hi) && Math.abs(n - Math.floor(n)) < 0.011;
}

function near(a, b) {
  return Math.abs(a - b) < 0.051;
}

function cardBase(s) {
  if (typeof s !== "string") return null;
  const i = s.indexOf(".");
  const base = i < 0 ? s : s.slice(0, i);
  const ver = i < 0 ? "1" : s.slice(i + 1);
  if (ver !== "1") return null;
  if (base !== "light" && base !== "double" && base !== "magnet") return null;
  return base;
}

function deckOf(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > 3) return null;
  const got = { light: false, double: false, magnet: false };
  for (const item of raw) {
    const base = cardBase(item);
    if (!base) return null;
    got[base] = true;
  }
  return ["light", "double", "magnet"].filter((id) => got[id]);
}

function channels(v) {
  return Array.isArray(v) && v.length === 3 && v.every((n) => numIn(n, 0, 1));
}

export function snapOk(snap) {
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return false;
  if (truthy(snap.audio) || truthy(snap.key) || truthy(snap.token) || truthy(snap.api) || truthy(snap.secret)) {
    return false;
  }
  const deck = deckOf(snap.deck);
  const speed = snap.speed;
  const chase = snap["chase-speed"];
  if (!deck) return false;
  return numIn(snap.seed, 0.001, 1e12)
    && intIn(snap.level, 1, 40)
    && intIn(snap.form, 0, 4)
    && intIn(snap.pace, 0, 4)
    && intIn(snap.band, 0, 4)
    && numIn(snap.g, 18, 40)
    && numIn(snap.jump, 9, 16)
    && numIn(snap.slide, 0.2, 1)
    && numIn(speed, 6, 16)
    && numIn(snap.hue, 0, 8)
    && numIn(snap.coyote, 0, 0.5)
    && numIn(snap.forgive, 0, 0.5)
    && numIn(snap.air, 0, 1)
    && numIn(snap.magnet, 0, 3)
    && (deck.includes("double") ? near(snap.air, 1) : near(snap.air, 0))
    && (deck.includes("magnet") ? near(snap.magnet, 2.4) : near(snap.magnet, 0))
    && phrase(snap.motif || "", 400)
    && phrase(snap.scene || "", 400)
    && phrase(snap.pals || "", 800)
    && LOOTS.has(snap.loot)
    && FLOWERS.has(snap.flower)
    && channels(snap.sky)
    && channels(snap.ground)
    && numIn(snap.density, 0.15, 1)
    && numIn(snap.light, 0.5, 1)
    && numIn(snap.fog, 0, 0.38)
    && numIn(snap.bend, 0, 0.65)
    && typeof chase === "number"
    && chase >= 1.6
    && chase < speed
    && chase < speed * 0.45
    && numIn(snap["chase-cool"], 0.28, 0.7)
    && numIn(snap["chase-at"], 0.32, 0.55)
    && numIn(snap["chase-commit"], 5.5, 11);
}

export function cleanSnap(snap) {
  if (!snapOk(snap)) return null;
  const deck = deckOf(snap.deck);
  return {
    seed: snap.seed,
    level: Math.floor(snap.level),
    form: Math.floor(snap.form),
    pace: Math.floor(snap.pace),
    band: Math.floor(snap.band),
    g: snap.g,
    jump: snap.jump,
    slide: snap.slide,
    speed: snap.speed,
    air: snap.air,
    magnet: snap.magnet,
    hue: snap.hue,
    coyote: snap.coyote,
    forgive: snap.forgive,
    motif: snap.motif || "",
    scene: snap.scene || "",
    pals: snap.pals || "",
    loot: snap.loot,
    bend: snap.bend,
    deck,
    "chase-speed": snap["chase-speed"],
    "chase-cool": snap["chase-cool"],
    "chase-at": snap["chase-at"],
    "chase-commit": snap["chase-commit"],
    sky: snap.sky.slice(0, 3),
    ground: snap.ground.slice(0, 3),
    flower: snap.flower,
    density: snap.density,
    light: snap.light,
    fog: snap.fog,
  };
}

function trim(nodes, tip) {
  const next = nodes.slice();
  while (next.length > WORLD_CAP) {
    const i = next.findIndex((n) => n.id !== tip);
    if (i < 0) break;
    next.splice(i, 1);
  }
  return next;
}

export function worldAdd(tree, kind, why, arm, cue, snap, stamp) {
  const base = tree && Array.isArray(tree.nodes) ? tree : blankWorld();
  if (kind !== "KEEP" && kind !== "ROLLBACK") {
    return { tree: base, id: "", parent: "", snap: null };
  }
  const n = (base.n || 0) + 1;
  const id = `w${n}-${Math.floor(Number(stamp) || 0)}`;
  const parent = typeof base.tip === "string" ? base.tip : "";
  const kept = kind === "KEEP";
  const clean = kept ? cleanSnap(snap) : null;
  const node = {
    id,
    parent,
    kind,
    why: clip(why, 24),
    arm: clip(arm, 16),
    cue: clip(cue, 80),
    snap: clean,
  };
  const tip = kept ? id : parent;
  const next = { nodes: trim(base.nodes.concat(node), tip), tip, n };
  return { tree: next, id, parent, snap: clean };
}

export function worldRewind(tree, id) {
  const base = tree && Array.isArray(tree.nodes) ? tree : blankWorld();
  const node = base.nodes.find((n) => n.id === id);
  if (!node) return { ok: false, tree: base, why: "missing", snap: null };
  if (node.kind !== "KEEP" || !snapOk(node.snap)) {
    return { ok: false, tree: base, why: "rollback", snap: null };
  }
  return {
    ok: true,
    tree: { nodes: base.nodes, tip: id, n: base.n || 0 },
    why: "keep",
    snap: cleanSnap(node.snap),
  };
}

function nodeFrom(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.id) return null;
  const kind = raw.kind === "ROLLBACK" ? "ROLLBACK" : raw.kind === "KEEP" ? "KEEP" : null;
  if (!kind) return null;
  return {
    id: raw.id.slice(0, 48),
    parent: typeof raw.parent === "string" ? raw.parent : "",
    kind,
    why: clip(raw.why, 24),
    arm: clip(raw.arm, 16),
    cue: clip(raw.cue, 80),
    snap: kind === "KEEP" ? cleanSnap(raw.snap) : null,
  };
}

export function normalize(raw) {
  const blank = blankWorld();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return blank;
  const nodes = [];
  const seen = new Set();
  const list = Array.isArray(raw.nodes) ? raw.nodes : [];
  for (const item of list) {
    const node = nodeFrom(item);
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    nodes.push(node);
  }
  const tip = typeof raw.tip === "string" && seen.has(raw.tip) ? raw.tip : "";
  return { nodes: trim(nodes, tip), tip, n: Math.max(0, Math.floor(Number(raw.n) || nodes.length)) };
}

export function adoptDecision(tree, msg) {
  const base = normalize(tree);
  if (!msg || (msg.kind !== "KEEP" && msg.kind !== "ROLLBACK")) return tree || base;
  const id = typeof msg.world === "string" ? msg.world : "";
  if (!id || base.nodes.some((n) => n.id === id)) return tree || base;
  const node = nodeFrom({
    id,
    parent: msg.parent || "",
    kind: msg.kind,
    why: msg.why,
    arm: msg.arm,
    cue: msg.cue,
    snap: msg.snap,
  });
  if (!node) return tree || base;
  const tip = node.kind === "KEEP" ? node.id : base.tip;
  return { nodes: trim(base.nodes.concat(node), tip), tip, n: (base.n || 0) + 1 };
}

export function loadWorld(storage) {
  try {
    return normalize(JSON.parse(storage.getItem(WORLD_KEY) || "null"));
  } catch {
    return blankWorld();
  }
}

export function saveWorld(storage, tree) {
  const clean = normalize(tree);
  try {
    storage.setItem(WORLD_KEY, JSON.stringify(clean));
  } catch {
    /* the page still holds this tree */
  }
  return clean;
}

function rowEl(node, depth, now, onPick) {
  const li = document.createElement("li");
  li.style.paddingLeft = `${Math.min(depth, 5) * 14}px`;
  if (now) li.classList.add("now");
  if (node.kind === "ROLLBACK") li.classList.add("rollback");
  const title = document.createElement("strong");
  title.textContent = node.cue || node.why || "";
  li.append(title);
  if (node.kind === "ROLLBACK") {
    const sub = document.createElement("span");
    sub.textContent = node.why || "";
    li.append(sub);
  } else if (node.snap) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "back";
    button.textContent = "回到这里再跑";
    button.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onPick(node);
    });
    li.append(button);
  }
  return li;
}

// Called when the badge opens, or when a note arrives while it is open.
export function paintWorld(listEl, tree, onPick) {
  if (!listEl) return;
  listEl.replaceChildren();
  const base = normalize(tree);
  if (!base.nodes.length) {
    const li = document.createElement("li");
    li.textContent = "The path is still new";
    listEl.append(li);
    return;
  }
  const ids = new Set(base.nodes.map((n) => n.id));
  const kids = new Map();
  for (const node of base.nodes) {
    const parent = node.parent && ids.has(node.parent) ? node.parent : "";
    if (!kids.has(parent)) kids.set(parent, []);
    kids.get(parent).push(node);
  }
  const walk = (id, depth) => {
    for (const node of kids.get(id) || []) {
      listEl.append(rowEl(node, depth, node.id === base.tip, onPick));
      walk(node.id, depth + 1);
    }
  };
  walk("", 0);
}
