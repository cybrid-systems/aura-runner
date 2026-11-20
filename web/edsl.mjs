// Biome EDSL for the world tour. A spec is data: sky, road, light, and a
// short list of landmark names. The renderer stamps those names with the
// same instanced cubes as the rest of the garden. Nothing here is code
// from the model. Contrast and the instance cap are the trial gate.

export const BUDGET_CAP = 150;
export const DECOR_CAP = {
  buildings: 8,
  curbs: 16,
  motes: 8,
  canal: 8,
  signature: 1,
  secondary: 4,
  third: 2,
};

export const BUILTINS = ["garden", "city", "space", "coast"];
export const MOODS = ["day", "night", "sunset", "neon"];
export const STYLES = ["palace", "neon", "deco", "stone", "pastel", "brick", "bay", "wall", "mist", "canal"];
export const PARTS = ["lantern", "petal", "mist", "neon", "dust", "sakura", "none"];
export const PROPS = [
  "pagoda", "palace-gate", "pearl-tower", "spire", "bridge-tower", "eiffel-tower",
  "clock-tower", "colonnade", "bamboo", "palm", "stone-bridge", "battlement",
  "willow", "cypress", "sakura",
];

const STYLE_COST = {
  palace: 3, neon: 3, deco: 3, stone: 2, pastel: 3, brick: 3, bay: 3, wall: 4, mist: 2, canal: 3,
};

const HURDLE = [0.28, 0.62, 0.98];
const GATE = [1, 0.72, 0.18];
const SAMPLE = {
  build: [0.7, 0.2, 0.16],
  roof: [0.2, 0.16, 0.14],
};

function part(dx, dy, dz, sx, sy, sz, rgb, rough = 0.48, emit = 0, shape = 0) {
  return { dx, dy, dz, sx, sy, sz, rgb, rough, emit, shape };
}

// Local offsets, sitting on the ground. Shape 0 is a box and shape 1 is
// the cheap sphere. Marched shapes stay out so SwiftShader does not raymarch.
export function landmarkParts(kind, colors) {
  const c = colors || SAMPLE;
  const build = c.build || SAMPLE.build;
  const roof = c.roof || SAMPLE.roof;
  const gold = [0.95, 0.78, 0.32];
  const lamp = [0.95, 0.22, 0.14];
  const iron = [0.32, 0.26, 0.2];
  const vermilion = [0.8, 0.16, 0.1];
  if (kind === "pagoda") {
    return [
      part(0, 0.7, 0, 1.2, 1.4, 1.2, build, 0.48, 0.04),
      part(0, 1.46, 0, 1.85, 0.12, 1.85, roof, 0.4, 0.06),
      part(0.86, 1.56, 0, 0.22, 0.16, 0.22, gold, 0.3, 0.28),
      part(-0.86, 1.56, 0, 0.22, 0.16, 0.22, gold, 0.3, 0.28),
      part(0, 2.15, 0, 0.9, 1.15, 0.9, build, 0.46, 0.05),
      part(0, 2.78, 0, 1.4, 0.1, 1.4, roof, 0.4, 0.07),
      part(0, 3.32, 0, 0.58, 0.9, 0.58, build, 0.44, 0.06),
      part(0, 3.82, 0, 0.98, 0.1, 0.98, roof, 0.38, 0.1),
      part(0, 4.25, 0, 0.08, 0.72, 0.08, gold, 0.25, 0.5),
      part(0.72, 1.05, 0.2, 0.14, 0.2, 0.14, lamp, 0.2, 0.92, 1),
      part(-0.72, 1.05, 0.2, 0.14, 0.2, 0.14, lamp, 0.2, 0.92, 1),
    ];
  }
  if (kind === "palace-gate") {
    return [
      part(-0.9, 1.2, 0, 0.34, 2.4, 0.34, build, 0.45, 0.04),
      part(0.9, 1.2, 0, 0.34, 2.4, 0.34, build, 0.45, 0.04),
      part(0, 2.5, 0, 2.15, 0.28, 0.46, gold, 0.35, 0.16),
      part(0, 2.82, 0, 2.5, 0.18, 0.78, roof, 0.4, 0.05),
      part(-1.15, 2.96, 0, 0.28, 0.2, 0.28, gold, 0.3, 0.32),
      part(1.15, 2.96, 0, 0.28, 0.2, 0.28, gold, 0.3, 0.32),
      part(0, 2.2, -0.24, 0.4, 0.32, 0.06, gold, 0.25, 0.45),
      part(-0.55, 1.55, -0.22, 0.14, 0.2, 0.14, lamp, 0.2, 0.9, 1),
      part(0.55, 1.55, -0.22, 0.14, 0.2, 0.14, lamp, 0.2, 0.9, 1),
    ];
  }
  if (kind === "pearl-tower") {
    return [
      part(0, 2.2, 0, 0.36, 4.4, 0.36, build, 0.32, 0.1),
      part(0, 1.55, 0, 1.05, 1.05, 1.05, roof, 0.18, 0.62, 1),
      part(0, 2.85, 0, 0.72, 0.72, 0.72, roof, 0.16, 0.75, 1),
      part(0, 3.7, 0, 0.46, 0.46, 0.46, [0.75, 0.95, 1], 0.14, 0.88, 1),
      part(0, 4.55, 0, 0.08, 0.85, 0.08, [0.8, 0.95, 1], 0.2, 0.65),
      part(0, 2.2, 0, 1.25, 0.06, 1.25, [0.55, 0.9, 1], 0.2, 0.8),
    ];
  }
  if (kind === "spire") {
    return [
      part(0, 1.15, 0, 0.9, 2.3, 0.9, build, 0.4, 0.08),
      part(0, 2.7, 0, 0.6, 1.4, 0.6, roof, 0.34, 0.16),
      part(0, 3.7, 0, 0.34, 1.0, 0.34, build, 0.32, 0.22),
      part(0, 4.45, 0, 0.08, 0.75, 0.08, roof, 0.24, 0.6),
      part(0, 2.15, 0, 0.95, 0.12, 0.95, roof, 0.2, 0.78),
    ];
  }
  if (kind === "bridge-tower") {
    return [
      part(-0.9, 1.8, 0, 0.3, 3.6, 0.3, vermilion, 0.4, 0.05),
      part(0.9, 1.8, 0, 0.3, 3.6, 0.3, vermilion, 0.4, 0.05),
      part(0, 3.45, 0, 2.15, 0.18, 0.24, vermilion, 0.35, 0.1),
      part(0, 2.5, 0, 1.8, 0.045, 0.045, [0.16, 0.15, 0.18], 0.3, 0.04),
      part(0, 1.55, 0, 1.8, 0.045, 0.045, [0.16, 0.15, 0.18], 0.3, 0.04),
      part(0, 0.28, 0, 2.3, 0.14, 0.5, [0.45, 0.4, 0.38], 0.5, 0),
      part(-0.9, 3.7, 0, 0.16, 0.16, 0.16, [1, 0.86, 0.42], 0.2, 0.9, 1),
      part(0.9, 3.7, 0, 0.16, 0.16, 0.16, [1, 0.86, 0.42], 0.2, 0.9, 1),
    ];
  }
  if (kind === "eiffel-tower") {
    return [
      part(-1.25, 1.15, 0.05, 0.2, 2.3, 0.2, iron, 0.42, 0.04),
      part(1.25, 1.15, 0.05, 0.2, 2.3, 0.2, iron, 0.42, 0.04),
      part(-0.48, 1.35, -0.12, 0.16, 2.15, 0.16, iron, 0.42, 0.04),
      part(0.48, 1.35, -0.12, 0.16, 2.15, 0.16, iron, 0.42, 0.04),
      part(0, 2.4, 0, 2.7, 0.16, 0.7, iron, 0.4, 0.08),
      part(0, 3.25, 0, 0.34, 1.45, 0.34, iron, 0.35, 0.1),
      part(0, 4.2, 0, 0.08, 0.7, 0.08, [0.62, 0.5, 0.32], 0.25, 0.45),
    ];
  }
  if (kind === "clock-tower") {
    return [
      part(0, 1.8, 0, 0.78, 3.6, 0.78, build, 0.5, 0.03),
      part(0, 3.75, 0, 0.88, 0.7, 0.88, roof, 0.42, 0.05),
      part(0, 2.55, -0.42, 0.4, 0.4, 0.08, [0.96, 0.9, 0.62], 0.2, 0.4, 1),
      part(0, 4.25, 0, 0.98, 0.28, 0.98, roof, 0.4, 0.06),
      part(0, 4.75, 0, 0.08, 0.78, 0.08, [0.35, 0.32, 0.3], 0.3, 0.15),
    ];
  }
  if (kind === "colonnade") {
    return [
      part(-0.95, 0.9, 0, 0.18, 1.8, 0.18, build, 0.45, 0.03),
      part(-0.32, 0.9, 0, 0.18, 1.8, 0.18, build, 0.45, 0.03),
      part(0.32, 0.9, 0, 0.18, 1.8, 0.18, build, 0.45, 0.03),
      part(0.95, 0.9, 0, 0.18, 1.8, 0.18, build, 0.45, 0.03),
      part(0, 1.9, 0, 2.25, 0.18, 0.42, build, 0.42, 0.04),
      part(0, 2.15, 0, 1.55, 0.32, 0.32, roof, 0.4, 0.05),
    ];
  }
  if (kind === "bamboo") {
    const g = [0.22, 0.62, 0.32];
    const g2 = [0.42, 0.78, 0.4];
    return [
      part(-0.18, 1.2, 0, 0.08, 2.4, 0.08, g, 0.4, 0.03),
      part(0.14, 1.45, 0.08, 0.07, 2.9, 0.07, g2, 0.4, 0.04),
      part(0.02, 1.0, -0.12, 0.07, 2.0, 0.07, g, 0.4, 0.03),
      part(0.16, 2.35, 0.05, 0.48, 0.28, 0.48, g2, 0.35, 0.05, 1),
      part(-0.12, 1.85, -0.04, 0.36, 0.22, 0.36, g, 0.35, 0.04, 1),
    ];
  }
  if (kind === "palm") {
    const trunk = [0.55, 0.38, 0.2];
    const leaf = [0.16, 0.55, 0.26];
    return [
      part(0, 0.75, 0, 0.18, 1.5, 0.18, trunk, 0.55, 0),
      part(0.14, 1.7, 0, 0.14, 1.3, 0.14, trunk, 0.5, 0),
      part(0.55, 2.35, 0, 0.85, 0.08, 0.18, leaf, 0.4, 0.05),
      part(-0.5, 2.28, 0.08, 0.75, 0.08, 0.16, leaf, 0.4, 0.05),
      part(0.08, 2.4, 0.48, 0.16, 0.08, 0.75, leaf, 0.4, 0.05),
      part(0.1, 2.32, -0.42, 0.16, 0.08, 0.7, leaf, 0.4, 0.06),
    ];
  }
  if (kind === "stone-bridge") {
    const stone = [0.66, 0.64, 0.6];
    const dark = [0.42, 0.4, 0.38];
    return [
      part(-0.9, 0.5, 0, 0.38, 1.0, 0.58, stone, 0.55, 0.02),
      part(0.9, 0.5, 0, 0.38, 1.0, 0.58, stone, 0.55, 0.02),
      part(0, 0.95, 0, 1.85, 0.16, 0.64, stone, 0.5, 0.03),
      part(0, 0.72, 0, 0.24, 0.24, 0.5, [0.78, 0.76, 0.7], 0.4, 0.06),
      part(-0.55, 1.12, 0, 0.85, 0.08, 0.1, dark, 0.45, 0),
      part(0.55, 1.12, 0, 0.85, 0.08, 0.1, dark, 0.45, 0),
    ];
  }
  if (kind === "battlement") {
    return [
      part(0, 0.75, 0, 2.5, 1.5, 0.48, build, 0.55, 0.03),
      part(-0.9, 1.66, 0, 0.32, 0.34, 0.5, roof, 0.5, 0.03),
      part(-0.3, 1.66, 0, 0.32, 0.34, 0.5, roof, 0.5, 0.03),
      part(0.3, 1.66, 0, 0.32, 0.34, 0.5, roof, 0.5, 0.03),
      part(0.9, 1.66, 0, 0.32, 0.34, 0.5, roof, 0.5, 0.03),
    ];
  }
  if (kind === "willow") {
    const leaf = [0.32, 0.62, 0.32];
    return [
      part(0, 0.7, 0, 0.14, 1.4, 0.14, [0.42, 0.3, 0.18], 0.55, 0),
      part(0.16, 1.45, 0.06, 0.1, 0.85, 0.55, leaf, 0.4, 0.04),
      part(-0.2, 1.3, -0.04, 0.1, 0.9, 0.5, leaf, 0.4, 0.04),
      part(0.04, 1.15, 0.16, 0.55, 0.1, 0.1, leaf, 0.4, 0.05),
    ];
  }
  if (kind === "cypress") {
    return [
      part(0, 0.35, 0, 0.12, 0.7, 0.12, [0.32, 0.22, 0.14], 0.55, 0),
      part(0, 1.7, 0, 0.4, 2.5, 0.4, [0.1, 0.28, 0.16], 0.45, 0.03),
    ];
  }
  if (kind === "sakura") {
    const pink = [0.98, 0.62, 0.74];
    const blush = [1, 0.8, 0.86];
    return [
      part(0, 0.55, 0, 0.14, 1.1, 0.14, [0.4, 0.28, 0.2], 0.55, 0),
      part(0, 1.4, 0, 0.75, 0.55, 0.75, pink, 0.3, 0.1, 1),
      part(0.3, 1.65, 0.1, 0.42, 0.36, 0.42, blush, 0.28, 0.12, 1),
      part(-0.24, 1.2, -0.08, 0.38, 0.32, 0.38, pink, 0.28, 0.1, 1),
    ];
  }
  return [];
}

export function recipeCost(kind) {
  if (!PROPS.includes(kind)) return 99;
  return landmarkParts(kind, SAMPLE).length;
}

function rgb(v) {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && n >= 0 && n <= 1);
}

function gap(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

export function instanceBudget(spec) {
  const props = spec && Array.isArray(spec.props) ? spec.props : [];
  const a = recipeCost(props[0] || "");
  const b = props[1] ? recipeCost(props[1]) : 0;
  const c = props[2] ? recipeCost(props[2]) : 0;
  const style = STYLE_COST[spec && spec.style] || 9;
  const canal = spec && spec.style === "canal" ? DECOR_CAP.canal : 0;
  return DECOR_CAP.buildings * style
    + DECOR_CAP.curbs
    + DECOR_CAP.motes
    + canal
    + a * DECOR_CAP.signature
    + b * DECOR_CAP.secondary
    + c * DECOR_CAP.third;
}

function spec(row) {
  return row;
}

const CITIES = [
  spec({
    id: "beijing", title: "北京", titleEn: "Beijing", region: "china",
    mood: "day", style: "palace", part: "lantern", light: 0.9, fogAmt: 0.16,
    sky: [0.97, 0.8, 0.46], sky1: [1, 0.64, 0.34], fog: [0.98, 0.84, 0.58],
    sun: [1, 0.84, 0.42], path: [0.58, 0.26, 0.16], curb: [0.75, 0.15, 0.12],
    ground: [0.55, 0.46, 0.26], hill: [0.46, 0.3, 0.26], hill2: [0.34, 0.2, 0.22],
    water: [0.28, 0.45, 0.58], build: [0.74, 0.14, 0.12], roof: [0.16, 0.09, 0.08],
    mote: [1, 0.35, 0.18], props: ["pagoda", "palace-gate"],
  }),
  spec({
    id: "shanghai", title: "上海", titleEn: "Shanghai", region: "china",
    mood: "neon", style: "neon", part: "neon", light: 0.9, fogAmt: 0.18,
    sky: [0.16, 0.14, 0.36], sky1: [0.86, 0.3, 0.58], fog: [0.4, 0.22, 0.48],
    sun: [0.55, 0.88, 1], path: [0.24, 0.26, 0.34], curb: [0.15, 0.78, 0.86],
    ground: [0.14, 0.16, 0.26], hill: [0.1, 0.12, 0.26], hill2: [0.16, 0.1, 0.22],
    water: [0.1, 0.28, 0.46], build: [0.12, 0.2, 0.4], roof: [0.4, 0.9, 1],
    mote: [0.25, 0.95, 0.95], props: ["pearl-tower", "spire"],
  }),
  spec({
    id: "hangzhou", title: "杭州", titleEn: "Hangzhou", region: "china",
    mood: "day", style: "mist", part: "petal", light: 0.84, fogAmt: 0.26,
    sky: [0.74, 0.86, 0.92], sky1: [0.96, 0.82, 0.78], fog: [0.86, 0.9, 0.93],
    sun: [1, 0.9, 0.75], path: [0.7, 0.64, 0.52], curb: [0.45, 0.42, 0.38],
    ground: [0.42, 0.62, 0.4], hill: [0.5, 0.62, 0.58], hill2: [0.36, 0.5, 0.48],
    water: [0.35, 0.62, 0.68], build: [0.93, 0.91, 0.86], roof: [0.22, 0.24, 0.28],
    mote: [0.98, 0.75, 0.82], props: ["stone-bridge", "willow"],
  }),
  spec({
    id: "chengdu", title: "成都", titleEn: "Chengdu", region: "china",
    mood: "day", style: "palace", part: "lantern", light: 0.82, fogAmt: 0.22,
    sky: [0.62, 0.84, 0.7], sky1: [0.78, 0.9, 0.72], fog: [0.7, 0.86, 0.74],
    sun: [0.95, 0.9, 0.55], path: [0.5, 0.38, 0.24], curb: [0.3, 0.48, 0.28],
    ground: [0.2, 0.52, 0.3], hill: [0.28, 0.48, 0.36], hill2: [0.18, 0.36, 0.3],
    water: [0.22, 0.48, 0.5], build: [0.68, 0.22, 0.16], roof: [0.2, 0.16, 0.12],
    mote: [1, 0.55, 0.25], props: ["bamboo", "pagoda"],
  }),
  spec({
    id: "xian", title: "西安", titleEn: "Xi'an", region: "china",
    mood: "day", style: "wall", part: "dust", light: 0.86, fogAmt: 0.18,
    sky: [0.96, 0.58, 0.28], sky1: [0.62, 0.3, 0.28], fog: [0.92, 0.58, 0.34],
    sun: [1, 0.62, 0.28], path: [0.52, 0.32, 0.18], curb: [0.48, 0.22, 0.14],
    ground: [0.5, 0.36, 0.22], hill: [0.48, 0.28, 0.2], hill2: [0.36, 0.2, 0.18],
    water: [0.3, 0.4, 0.48], build: [0.62, 0.32, 0.18], roof: [0.28, 0.12, 0.1],
    mote: [1, 0.62, 0.22], props: ["pagoda", "battlement"],
  }),
  spec({
    id: "chongqing", title: "重庆", titleEn: "Chongqing", region: "china",
    mood: "night", style: "neon", part: "lantern", light: 0.8, fogAmt: 0.2,
    sky: [0.28, 0.12, 0.26], sky1: [0.9, 0.34, 0.22], fog: [0.48, 0.22, 0.28],
    sun: [1, 0.48, 0.28], path: [0.32, 0.24, 0.26], curb: [0.55, 0.18, 0.14],
    ground: [0.22, 0.16, 0.2], hill: [0.18, 0.12, 0.16], hill2: [0.12, 0.08, 0.12],
    water: [0.15, 0.22, 0.36], build: [0.4, 0.16, 0.18], roof: [1, 0.45, 0.2],
    mote: [1, 0.55, 0.25], props: ["bridge-tower", "spire"],
  }),
  spec({
    id: "hongkong", title: "香港", titleEn: "Hong Kong", region: "china",
    mood: "neon", style: "bay", part: "neon", light: 0.9, fogAmt: 0.18,
    sky: [0.12, 0.16, 0.38], sky1: [0.95, 0.32, 0.55], fog: [0.35, 0.2, 0.45],
    sun: [0.45, 0.85, 1], path: [0.22, 0.24, 0.32], curb: [0.1, 0.8, 0.75],
    ground: [0.12, 0.14, 0.24], hill: [0.1, 0.14, 0.3], hill2: [0.18, 0.1, 0.28],
    water: [0.08, 0.26, 0.42], build: [0.1, 0.14, 0.32], roof: [0.95, 0.3, 0.55],
    mote: [0.2, 1, 0.85], props: ["spire", "pearl-tower"],
  }),
  spec({
    id: "newyork", title: "纽约", titleEn: "New York", region: "us",
    mood: "day", style: "deco", part: "dust", light: 0.86, fogAmt: 0.16,
    sky: [0.95, 0.62, 0.36], sky1: [0.32, 0.38, 0.62], fog: [0.9, 0.62, 0.42],
    sun: [1, 0.72, 0.38], path: [0.3, 0.3, 0.32], curb: [0.75, 0.65, 0.3],
    ground: [0.28, 0.32, 0.28], hill: [0.25, 0.28, 0.38], hill2: [0.18, 0.2, 0.3],
    water: [0.18, 0.32, 0.48], build: [0.48, 0.46, 0.44], roof: [0.86, 0.72, 0.4],
    mote: [1, 0.8, 0.45], props: ["spire"],
  }),
  spec({
    id: "sanfrancisco", title: "旧金山", titleEn: "San Francisco", region: "us",
    mood: "day", style: "stone", part: "mist", light: 0.88, fogAmt: 0.22,
    sky: [0.46, 0.74, 0.96], sky1: [0.82, 0.9, 0.96], fog: [0.78, 0.86, 0.92],
    sun: [1, 0.95, 0.75], path: [0.55, 0.5, 0.44], curb: [0.7, 0.22, 0.16],
    ground: [0.4, 0.55, 0.42], hill: [0.35, 0.5, 0.58], hill2: [0.22, 0.38, 0.48],
    water: [0.12, 0.42, 0.62], build: [0.78, 0.76, 0.72], roof: [0.55, 0.28, 0.22],
    mote: [0.85, 0.92, 1], props: ["bridge-tower"],
  }),
  spec({
    id: "losangeles", title: "洛杉矶", titleEn: "Los Angeles", region: "us",
    mood: "day", style: "pastel", part: "dust", light: 0.92, fogAmt: 0.14,
    sky: [0.98, 0.55, 0.4], sky1: [0.98, 0.4, 0.55], fog: [0.98, 0.7, 0.58],
    sun: [1, 0.62, 0.4], path: [0.75, 0.64, 0.46], curb: [0.9, 0.55, 0.45],
    ground: [0.55, 0.5, 0.28], hill: [0.55, 0.4, 0.38], hill2: [0.4, 0.28, 0.36],
    water: [0.2, 0.45, 0.62], build: [0.92, 0.78, 0.62], roof: [0.85, 0.45, 0.4],
    mote: [1, 0.7, 0.45], props: ["palm"],
  }),
  spec({
    id: "paris", title: "巴黎", titleEn: "Paris", region: "europe",
    mood: "sunset", style: "stone", part: "lantern", light: 0.82, fogAmt: 0.16,
    sky: [0.55, 0.42, 0.58], sky1: [0.96, 0.55, 0.4], fog: [0.86, 0.64, 0.55],
    sun: [1, 0.7, 0.48], path: [0.48, 0.42, 0.38], curb: [0.62, 0.52, 0.4],
    ground: [0.4, 0.46, 0.32], hill: [0.42, 0.36, 0.4], hill2: [0.3, 0.26, 0.34],
    water: [0.25, 0.4, 0.52], build: [0.91, 0.84, 0.72], roof: [0.38, 0.3, 0.28],
    mote: [1, 0.78, 0.42], props: ["eiffel-tower"],
  }),
  spec({
    id: "london", title: "伦敦", titleEn: "London", region: "europe",
    mood: "day", style: "brick", part: "lantern", light: 0.78, fogAmt: 0.24,
    sky: [0.52, 0.6, 0.7], sky1: [0.7, 0.74, 0.78], fog: [0.68, 0.72, 0.78],
    sun: [0.85, 0.88, 0.92], path: [0.34, 0.34, 0.36], curb: [0.45, 0.28, 0.2],
    ground: [0.32, 0.36, 0.3], hill: [0.35, 0.4, 0.46], hill2: [0.24, 0.28, 0.34],
    water: [0.22, 0.36, 0.46], build: [0.58, 0.5, 0.44], roof: [0.32, 0.22, 0.18],
    mote: [1, 0.78, 0.4], props: ["clock-tower"],
  }),
  spec({
    id: "rome", title: "罗马", titleEn: "Rome", region: "europe",
    mood: "day", style: "stone", part: "dust", light: 0.9, fogAmt: 0.14,
    sky: [0.96, 0.78, 0.48], sky1: [0.98, 0.62, 0.36], fog: [0.96, 0.8, 0.58],
    sun: [1, 0.82, 0.42], path: [0.72, 0.58, 0.4], curb: [0.78, 0.64, 0.42],
    ground: [0.55, 0.5, 0.3], hill: [0.5, 0.42, 0.28], hill2: [0.36, 0.32, 0.24],
    water: [0.22, 0.45, 0.58], build: [0.92, 0.84, 0.68], roof: [0.62, 0.4, 0.28],
    mote: [0.95, 0.8, 0.4], props: ["colonnade", "cypress"],
  }),
  spec({
    id: "venice", title: "威尼斯", titleEn: "Venice", region: "europe",
    mood: "day", style: "canal", part: "mist", light: 0.84, fogAmt: 0.18,
    sky: [0.64, 0.76, 0.9], sky1: [0.96, 0.72, 0.64], fog: [0.78, 0.84, 0.9],
    sun: [1, 0.86, 0.62], path: [0.62, 0.5, 0.52], curb: [0.85, 0.55, 0.55],
    ground: [0.55, 0.58, 0.48], hill: [0.55, 0.58, 0.62], hill2: [0.4, 0.44, 0.52],
    water: [0.2, 0.48, 0.64], build: [0.94, 0.72, 0.7], roof: [0.55, 0.32, 0.4],
    mote: [0.9, 0.85, 0.95], props: ["stone-bridge", "colonnade"],
  }),
  spec({
    id: "tokyo", title: "东京", titleEn: "Tokyo", region: "asia",
    mood: "day", style: "palace", part: "sakura", light: 0.88, fogAmt: 0.14,
    sky: [0.96, 0.74, 0.8], sky1: [0.98, 0.55, 0.62], fog: [0.96, 0.78, 0.84],
    sun: [1, 0.85, 0.75], path: [0.36, 0.34, 0.36], curb: [0.75, 0.2, 0.24],
    ground: [0.4, 0.48, 0.34], hill: [0.55, 0.4, 0.46], hill2: [0.4, 0.28, 0.36],
    water: [0.25, 0.45, 0.58], build: [0.82, 0.16, 0.18], roof: [0.95, 0.95, 0.96],
    mote: [1, 0.7, 0.8], props: ["spire", "sakura"],
  }),
];

const TEMPLATES = [
  spec({
    id: "visit-china", title: "中国", titleEn: "China", region: "china", key: "china-mist",
    mood: "day", style: "mist", part: "petal", light: 0.84, fogAmt: 0.24,
    sky: [0.7, 0.84, 0.78], sky1: [0.9, 0.88, 0.75], fog: [0.78, 0.88, 0.8],
    sun: [1, 0.9, 0.7], path: [0.62, 0.56, 0.4], curb: [0.4, 0.48, 0.32],
    ground: [0.28, 0.55, 0.34], hill: [0.4, 0.58, 0.46], hill2: [0.26, 0.42, 0.36],
    water: [0.28, 0.55, 0.58], build: [0.9, 0.88, 0.82], roof: [0.24, 0.26, 0.28],
    mote: [0.98, 0.78, 0.7], props: ["bamboo", "stone-bridge"],
  }),
  spec({
    id: "visit-china", title: "中国", titleEn: "China", region: "china", key: "china-high",
    mood: "day", style: "wall", part: "dust", light: 0.86, fogAmt: 0.16,
    sky: [0.95, 0.62, 0.36], sky1: [0.7, 0.36, 0.28], fog: [0.92, 0.64, 0.4],
    sun: [1, 0.7, 0.36], path: [0.55, 0.36, 0.22], curb: [0.5, 0.28, 0.16],
    ground: [0.48, 0.36, 0.24], hill: [0.5, 0.32, 0.24], hill2: [0.34, 0.22, 0.2],
    water: [0.28, 0.4, 0.5], build: [0.64, 0.34, 0.2], roof: [0.3, 0.14, 0.12],
    mote: [1, 0.65, 0.28], props: ["pagoda", "battlement"],
  }),
  spec({
    id: "visit-china", title: "中国", titleEn: "China", region: "china", key: "china-lake",
    mood: "day", style: "mist", part: "petal", light: 0.86, fogAmt: 0.22,
    sky: [0.78, 0.86, 0.94], sky1: [0.96, 0.8, 0.76], fog: [0.84, 0.9, 0.94],
    sun: [1, 0.9, 0.72], path: [0.68, 0.6, 0.5], curb: [0.5, 0.46, 0.4],
    ground: [0.4, 0.6, 0.42], hill: [0.48, 0.62, 0.55], hill2: [0.32, 0.48, 0.46],
    water: [0.3, 0.58, 0.66], build: [0.94, 0.92, 0.88], roof: [0.25, 0.28, 0.32],
    mote: [1, 0.78, 0.84], props: ["willow", "stone-bridge"],
  }),
  spec({
    id: "visit-europe", title: "欧洲", titleEn: "Europe", region: "europe", key: "europe-canal",
    mood: "day", style: "canal", part: "mist", light: 0.84, fogAmt: 0.18,
    sky: [0.62, 0.74, 0.88], sky1: [0.95, 0.7, 0.6], fog: [0.76, 0.82, 0.9],
    sun: [1, 0.84, 0.6], path: [0.58, 0.5, 0.48], curb: [0.8, 0.55, 0.5],
    ground: [0.5, 0.55, 0.46], hill: [0.5, 0.55, 0.6], hill2: [0.36, 0.42, 0.5],
    water: [0.18, 0.42, 0.58], build: [0.9, 0.7, 0.62], roof: [0.5, 0.3, 0.34],
    mote: [0.9, 0.86, 0.95], props: ["stone-bridge", "colonnade"],
  }),
  spec({
    id: "visit-europe", title: "欧洲", titleEn: "Europe", region: "europe", key: "europe-stone",
    mood: "day", style: "brick", part: "lantern", light: 0.8, fogAmt: 0.22,
    sky: [0.58, 0.64, 0.74], sky1: [0.78, 0.7, 0.62], fog: [0.7, 0.74, 0.8],
    sun: [0.9, 0.86, 0.7], path: [0.4, 0.38, 0.36], curb: [0.5, 0.36, 0.26],
    ground: [0.36, 0.4, 0.32], hill: [0.4, 0.42, 0.46], hill2: [0.28, 0.3, 0.36],
    water: [0.22, 0.38, 0.48], build: [0.7, 0.64, 0.56], roof: [0.4, 0.28, 0.24],
    mote: [1, 0.78, 0.45], props: ["clock-tower", "colonnade"],
  }),
  spec({
    id: "visit-us", title: "美国", titleEn: "America", region: "us", key: "us-brick",
    mood: "day", style: "deco", part: "dust", light: 0.86, fogAmt: 0.16,
    sky: [0.7, 0.78, 0.9], sky1: [0.95, 0.6, 0.4], fog: [0.85, 0.78, 0.68],
    sun: [1, 0.78, 0.45], path: [0.34, 0.34, 0.36], curb: [0.7, 0.55, 0.3],
    ground: [0.32, 0.38, 0.3], hill: [0.3, 0.36, 0.42], hill2: [0.22, 0.26, 0.34],
    water: [0.18, 0.36, 0.5], build: [0.5, 0.46, 0.44], roof: [0.75, 0.55, 0.35],
    mote: [1, 0.8, 0.5], props: ["spire"],
  }),
  spec({
    id: "visit-asia", title: "亚洲", titleEn: "Asia", region: "asia", key: "asia-neon",
    mood: "neon", style: "neon", part: "neon", light: 0.88, fogAmt: 0.18,
    sky: [0.14, 0.16, 0.34], sky1: [0.9, 0.35, 0.55], fog: [0.4, 0.22, 0.48],
    sun: [0.5, 0.85, 1], path: [0.26, 0.26, 0.34], curb: [0.2, 0.8, 0.8],
    ground: [0.16, 0.18, 0.26], hill: [0.12, 0.14, 0.28], hill2: [0.18, 0.12, 0.24],
    water: [0.1, 0.28, 0.42], build: [0.14, 0.18, 0.36], roof: [0.45, 0.9, 1],
    mote: [0.3, 0.95, 0.95], props: ["spire", "sakura"],
  }),
  spec({
    id: "visit-world", title: "远方", titleEn: "Far away", region: "world", key: "world-palm",
    mood: "day", style: "pastel", part: "dust", light: 0.9, fogAmt: 0.16,
    sky: [0.95, 0.7, 0.5], sky1: [0.98, 0.5, 0.45], fog: [0.96, 0.78, 0.62],
    sun: [1, 0.75, 0.45], path: [0.7, 0.6, 0.45], curb: [0.85, 0.55, 0.4],
    ground: [0.5, 0.52, 0.32], hill: [0.5, 0.42, 0.36], hill2: [0.36, 0.3, 0.32],
    water: [0.2, 0.48, 0.6], build: [0.9, 0.78, 0.62], roof: [0.8, 0.45, 0.38],
    mote: [1, 0.75, 0.5], props: ["palm", "spire"],
  }),
];

const BY_ID = new Map();
for (const row of CITIES) BY_ID.set(row.id, row);
for (const row of TEMPLATES) {
  if (!BY_ID.has(row.id)) BY_ID.set(row.id, row);
}
const BY_KEY = new Map(TEMPLATES.map((row) => [row.key, row]));

export const CITY_IDS = CITIES.map((row) => row.id);
export const VISIT_IDS = ["visit-china", "visit-us", "visit-europe", "visit-asia", "visit-world"];
const TOUR = {
  china: ["beijing", "shanghai", "hangzhou", "chengdu", "xian", "chongqing", "hongkong"],
  us: ["newyork", "sanfrancisco", "losangeles"],
  europe: ["paris", "london", "rome", "venice"],
  world: [
    "beijing", "shanghai", "hangzhou", "chengdu", "xian", "chongqing", "hongkong",
    "newyork", "sanfrancisco", "losangeles", "paris", "london", "rome", "venice", "tokyo",
  ],
};

export function placeIds() {
  return BUILTINS.concat(CITY_IDS, VISIT_IDS);
}

export function isBuiltin(id) {
  return BUILTINS.includes(id);
}

export function specFor(id) {
  return BY_ID.get(id) || null;
}

export function curatedSpecs() {
  return CITIES.concat(TEMPLATES);
}

export function trialSpec(spec) {
  if (!spec || typeof spec !== "object") return { ok: false, why: "form", instances: 0 };
  const id = typeof spec.id === "string" ? spec.id : "";
  if (!/^[a-z][a-z0-9-]{0,15}$/.test(id)) return { ok: false, why: "id", instances: 0 };
  for (const key of ["sky", "sky1", "fog", "sun", "path", "curb", "ground", "hill", "hill2", "water", "build", "roof", "mote"]) {
    if (!rgb(spec[key])) return { ok: false, why: key, instances: 0 };
  }
  const fogAmt = spec.fogAmt;
  const light = spec.light;
  if (typeof fogAmt !== "number" || fogAmt < 0 || fogAmt > 0.3) return { ok: false, why: "fog", instances: 0 };
  if (typeof light !== "number" || light < 0.74 || light > 1) return { ok: false, why: "light", instances: 0 };
  if (!MOODS.includes(spec.mood)) return { ok: false, why: "mood", instances: 0 };
  if (!STYLES.includes(spec.style)) return { ok: false, why: "style", instances: 0 };
  if (!PARTS.includes(spec.part)) return { ok: false, why: "part", instances: 0 };
  const props = spec.props;
  if (!Array.isArray(props) || props.length < 1 || props.length > 3 || props.some((name) => !PROPS.includes(name))) {
    return { ok: false, why: "props", instances: 0 };
  }
  const sum = spec.path[0] + spec.path[1] + spec.path[2];
  if (sum <= 0.45) return { ok: false, why: "path", instances: 0 };
  if (gap(spec.path, HURDLE) < 0.18 || gap(spec.path, GATE) < 0.18) {
    return { ok: false, why: "contrast", instances: 0 };
  }
  const instances = instanceBudget(spec);
  if (instances > BUDGET_CAP) return { ok: false, why: "budget", instances };
  return { ok: true, why: "fair", instances, fog: fogAmt, light, path: sum };
}

function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function takeRgb(v) {
  if (!Array.isArray(v) || v.length < 3) return null;
  return [num(v[0]), num(v[1]), num(v[2])];
}

export function sanitizeSpec(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const spec = {
    id: typeof raw.id === "string" ? raw.id : "",
    title: typeof raw.title === "string" ? raw.title.slice(0, 16) : "",
    titleEn: typeof (raw.titleEn || raw["title-en"]) === "string"
      ? String(raw.titleEn || raw["title-en"]).slice(0, 24) : "",
    region: typeof raw.region === "string" ? raw.region : "",
    mood: raw.mood,
    style: raw.style,
    part: raw.part,
    light: num(raw.light),
    fogAmt: num(raw.fogAmt != null ? raw.fogAmt : raw["fog-amt"]),
    props: Array.isArray(raw.props) ? raw.props.slice(0, 3).map((name) => String(name)) : [],
  };
  for (const key of ["sky", "sky1", "fog", "sun", "path", "curb", "ground", "hill", "hill2", "water", "build", "roof", "mote"]) {
    spec[key] = takeRgb(raw[key]);
  }
  const gate = trialSpec(spec);
  return gate.ok ? spec : null;
}

export function nextPlace(region, current) {
  const list = TOUR[region];
  if (!list) return "";
  const i = list.indexOf(current);
  return list[(i + 1) % list.length];
}

function cloneSpec(row, title) {
  const next = Object.assign({}, row, {
    title: String(title || row.title).slice(0, 16),
    titleEn: String(title || row.titleEn).slice(0, 24),
  });
  for (const key of ["sky", "sky1", "fog", "sun", "path", "curb", "ground", "hill", "hill2", "water", "build", "roof", "mote"]) {
    next[key] = row[key].slice();
  }
  next.props = row.props.slice();
  return next;
}

function hasCjk(text) {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x4e00 && c <= 0x9fff) return true;
  }
  return false;
}

export function nameHash(text) {
  let h = 0;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) % 997;
  return h;
}

function templateKey(name) {
  const s = String(name || "");
  const low = s.toLowerCase();
  if (s.includes("拉萨") || s.includes("藏") || s.includes("疆") || low.includes("lhasa") || low.includes("tibet")) return "china-high";
  if (s.includes("大理") || s.includes("洱") || low.includes("dali")) return "china-lake";
  if (s.includes("桂林") || s.includes("漓") || low.includes("guilin")) return "china-mist";
  if (s.includes("阿姆斯特丹") || s.includes("运河") || low.includes("amsterdam")) return "europe-canal";
  if (s.includes("布拉格") || s.includes("维也纳") || s.includes("柏林") || low.includes("prague") || low.includes("vienna") || low.includes("berlin")) {
    return "europe-stone";
  }
  if (s.includes("芝加哥") || s.includes("波士顿") || s.includes("西雅图") || low.includes("chicago") || low.includes("boston") || low.includes("seattle")) {
    return "us-brick";
  }
  if (s.includes("京都") || s.includes("大阪") || s.includes("首尔") || s.includes("新加坡") || s.includes("曼谷")
    || low.includes("kyoto") || low.includes("osaka") || low.includes("seoul") || low.includes("singapore") || low.includes("bangkok")) {
    return "asia-neon";
  }
  if (hasCjk(s)) return ["china-mist", "china-high", "china-lake"][nameHash(s) % 3];
  return ["europe-stone", "us-brick", "asia-neon", "world-palm"][nameHash(low) % 4];
}

export function fallbackFor(name) {
  const title = String(name || "").trim().slice(0, 16);
  const row = BY_KEY.get(templateKey(title || "city")) || BY_KEY.get("world-palm");
  return cloneSpec(row, title || row.title);
}

const BUILTIN_TITLES = {
  garden: ["Garden", "花园"],
  city: ["City", "城市"],
  space: ["Space", "太空"],
  coast: ["Coast", "海边"],
};

export function placeTitle(id, lang, spec) {
  if (spec && spec.title) return lang === "zh" ? (spec.title || spec.titleEn) : (spec.titleEn || spec.title);
  const row = specFor(id);
  if (row) return lang === "zh" ? row.title : row.titleEn;
  const builtin = BUILTIN_TITLES[id];
  if (builtin) return builtin[lang === "zh" ? 1 : 0];
  return lang === "zh" ? "花园" : "Garden";
}

function word(low, w) {
  return ` ${low} `.includes(` ${w} `);
}

function removing(text, low) {
  return text.includes("去掉") || text.includes("拿掉") || text.includes("不要") || text.includes("删除")
    || text.includes("移除") || low.includes("remove") || low.includes("take away");
}

function soft(text, low) {
  return low.includes("sunny") || low.includes("pink") || low.includes("paint") || low.includes("flower")
    || low.includes("golden") || text.includes("粉色") || text.includes("金色") || text.includes("花朵");
}

const CITY_ALIAS = [
  ["北京", "beijing", "has"], ["beijing", "beijing", "word"], ["peking", "beijing", "word"],
  ["上海", "shanghai", "has"], ["shanghai", "shanghai", "word"],
  ["杭州", "hangzhou", "has"], ["西湖", "hangzhou", "has"], ["hangzhou", "hangzhou", "word"],
  ["成都", "chengdu", "has"], ["chengdu", "chengdu", "word"],
  ["西安", "xian", "has"], ["xi'an", "xian", "has"], ["xi an", "xian", "has"], ["xian", "xian", "word"],
  ["重庆", "chongqing", "has"], ["chongqing", "chongqing", "word"],
  ["香港", "hongkong", "has"], ["hong kong", "hongkong", "has"], ["hongkong", "hongkong", "word"],
  ["纽约", "newyork", "has"], ["new york", "newyork", "has"], ["newyork", "newyork", "word"], ["nyc", "newyork", "word"],
  ["旧金山", "sanfrancisco", "has"], ["san francisco", "sanfrancisco", "has"], ["sanfrancisco", "sanfrancisco", "word"],
  ["洛杉矶", "losangeles", "has"], ["los angeles", "losangeles", "has"], ["losangeles", "losangeles", "word"],
  ["巴黎", "paris", "has"], ["paris", "paris", "word"],
  ["伦敦", "london", "has"], ["london", "london", "word"],
  ["罗马", "rome", "has"], ["rome", "rome", "word"],
  ["威尼斯", "venice", "has"], ["venice", "venice", "word"],
  ["东京", "tokyo", "has"], ["東京", "tokyo", "has"], ["tokyo", "tokyo", "word"],
];

const SKIP_ASK = new Set([
  "花园", "草地", "城市", "都市", "太空", "星空", "宇宙", "海边", "海岸", "海洋", "沙滩",
  "夜晚", "夜景", "黑夜", "晚上", "日落", "黄昏", "霓虹", "赛博", "白天", "晴天",
  "那里", "这里", "前面", "后面", "家里", "快点", "慢点", "左边", "右边",
  "garden", "city", "space", "universe", "coast", "ocean", "beach",
  "night", "day", "sunset", "dusk", "neon", "cyber",
  "there", "here", "home", "faster", "slower", "the city", "the garden",
]);

function hanRun(text, i) {
  let s = "";
  for (let k = i; k < text.length && s.length < 8; k++) {
    const c = text.charCodeAt(k);
    if (c >= 0x4e00 && c <= 0x9fff) s += text[k];
    else break;
  }
  return s;
}

function askName(text, low) {
  if (removing(text, low)) return "";
  const marks = ["前往", "去"];
  for (const mark of marks) {
    const i = text.indexOf(mark);
    if (i >= 0) {
      const name = hanRun(text, i + mark.length);
      if (name.length >= 2 && !SKIP_ASK.has(name)) return name;
    }
  }
  if (text.startsWith("到")) {
    const name = hanRun(text, 1);
    if (name.length >= 2 && !SKIP_ASK.has(name)) return name;
  }
  const keys = ["take me to ", "go to ", "goto "];
  for (const key of keys) {
    const i = low.indexOf(key);
    if (i >= 0) {
      let rest = text.slice(i + key.length).trim().replace(/[^A-Za-z .'-]/g, " ").replace(/\s+/g, " ").trim();
      if (rest.toLowerCase().startsWith("the ")) rest = rest.slice(4).trim();
      rest = rest.slice(0, 24).trim();
      if (rest.length >= 2 && !SKIP_ASK.has(rest.toLowerCase())) return rest;
    }
  }
  return "";
}

function pack(act, name, spec, mood) {
  const title = placeTitle(name, "zh", spec);
  const titleEn = placeTitle(name, "en", spec);
  return { act, name, biome: name, spec: spec || null, mood: mood || null, title, titleEn };
}

// Place phrases only. Speed, friends, and sky props stay in the voice core.
export function resolvePlace(text, current) {
  const raw = String(text || "").trim();
  if (!raw || raw.length > 80) return null;
  const low = raw.toLowerCase();
  if (removing(raw, low)) return null;
  const here = typeof current === "string" ? current : "garden";
  let region = "";
  if (raw.includes("环球旅行") || raw.includes("下一个城市") || raw.includes("下个城市")
    || low.includes("world tour")
    || (word(low, "next") && word(low, "city") && !word(low, "scene") && !word(low, "biome"))) {
    region = "world";
  } else if (raw.includes("中国城市") || raw.includes("去中国") || low.includes("chinese cities") || low.includes("china cities")
    || low.includes("go to china") || word(low, "china")) region = "china";
  else if (raw.includes("美国城市") || raw.includes("去美国") || low.includes("american cities") || low.includes("go to america")
    || word(low, "america")) region = "us";
  else if (raw.includes("欧洲城市") || raw.includes("去欧洲") || low.includes("european cities") || low.includes("go to europe")
    || word(low, "europe")) region = "europe";
  if (region) {
    const id = nextPlace(region, here);
    const row = specFor(id);
    return {
      act: "biome-tour", name: region, biome: id, spec: row, mood: row.mood,
      title: row.title, titleEn: row.titleEn,
    };
  }
  for (const [alias, id, how] of CITY_ALIAS) {
    const hit = how === "word" ? word(low, alias) : (how === "word" ? false : (alias.charCodeAt(0) < 128 ? low.includes(alias) : raw.includes(alias)));
    if (hit) {
      const row = specFor(id);
      return pack("biome", id, row, row.mood);
    }
  }
  if (soft(raw, low)) return null;
  if (raw.includes("换场景") || raw.includes("下一个场景") || raw.includes("下个场景")
    || (word(low, "next") && (word(low, "scene") || word(low, "biome")))
    || (word(low, "switch") && (word(low, "scene") || word(low, "biome")))) {
    const i = Math.max(0, BUILTINS.indexOf(here));
    const id = BUILTINS[(i + 1) % BUILTINS.length];
    return pack("biome-next", id, null, null);
  }
  let builtin = "";
  if (raw.includes("花园") || raw.includes("草地") || word(low, "garden")) builtin = "garden";
  else if (raw.includes("城市") || raw.includes("都市") || word(low, "city")) builtin = "city";
  else if (raw.includes("太空") || raw.includes("星空") || raw.includes("宇宙") || word(low, "space") || word(low, "universe")) builtin = "space";
  else if (raw.includes("海边") || raw.includes("海岸") || raw.includes("海洋") || raw.includes("沙滩")
    || word(low, "coast") || word(low, "ocean") || word(low, "beach")) builtin = "coast";
  if (builtin) return pack("biome", builtin, null, null);
  let mood = "";
  if (raw.includes("夜晚") || raw.includes("夜景") || raw.includes("黑夜") || raw.includes("晚上") || word(low, "night")) mood = "night";
  else if (raw.includes("日落") || raw.includes("黄昏") || word(low, "sunset") || word(low, "dusk")) mood = "sunset";
  else if (raw.includes("霓虹") || raw.includes("赛博") || word(low, "neon") || word(low, "cyber")) mood = "neon";
  else if (raw.includes("白天") || raw.includes("晴天") || word(low, "day")) mood = "day";
  if (mood) {
    const titles = { night: ["Night", "夜晚"], sunset: ["Sunset", "日落"], neon: ["Neon", "霓虹"], day: ["Day", "白天"] };
    const pair = titles[mood];
    return { act: "mood", name: mood, biome: here, spec: null, mood, title: pair[1], titleEn: pair[0] };
  }
  const asked = askName(raw, low);
  if (!asked) return null;
  const made = fallbackFor(asked);
  return {
    act: "biome-ask",
    name: asked,
    biome: made.id,
    spec: made,
    mood: made.mood,
    title: made.title,
    titleEn: made.titleEn,
  };
}
