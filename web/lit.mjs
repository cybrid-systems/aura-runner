// Lit variants of the mesh shaders. The low path keeps the original
// source and never compiles these. A shadow of 1 matches the low
// lighting line. softKnee moves to the post pass so bloom can see
// the bright pixels.

export const LIGHT_LINE = "vec3 col = vC * (ambient + 0.28 * hemi + uLightAmt * ndl + 0.12 * wrap);";

const PCF = `
uniform sampler2D uShadowMap;
uniform mat4 uShadowMat;
uniform float uShadowOn;
uniform float uPcf;
float shadowTap(vec2 uv, float z) {
  if (uv.x <= 0.002 || uv.y <= 0.002 || uv.x >= 0.998 || uv.y >= 0.998) return 1.0;
  float d = texture(uShadowMap, uv).r;
  return (z - 0.0024) <= d ? 1.0 : 0.0;
}
float shadeShadow(vec3 world) {
  if (uShadowOn < 0.5 || world.y > 0.62) return 1.0;
  vec4 sc = uShadowMat * vec4(world + vec3(0.0, 0.035, 0.0), 1.0);
  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;
  vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
  float s = shadowTap(p.xy, p.z);
  s += shadowTap(p.xy + vec2(texel.x, 0.0), p.z);
  s += shadowTap(p.xy + vec2(0.0, texel.y), p.z);
  s += shadowTap(p.xy + vec2(-texel.x, -texel.y), p.z);
  if (uPcf > 5.0) {
    s += shadowTap(p.xy + vec2(texel.x, texel.y), p.z);
    s += shadowTap(p.xy + vec2(-texel.x, texel.y), p.z);
    s += shadowTap(p.xy + vec2(texel.x, -texel.y), p.z);
    s += shadowTap(p.xy + vec2(-texel.x, 0.0), p.z);
    s += shadowTap(p.xy + vec2(0.0, -texel.y), p.z);
    s *= 0.111111;
  } else {
    s *= 0.25;
  }
  return s;
}
`;

const LIGHT_LIT = `float sh = shadeShadow(vW);
float ao = mix(0.62, 1.0, sh);
float sun = mix(0.35, 1.0, sh);
vec3 col = vC * (ambient * ao + 0.28 * hemi + (uLightAmt * ndl + 0.12 * wrap) * sun);`;

const SKY_KNEE = `  vec3 over = max(c - vec3(0.9), vec3(0.0));
  c = min(max(c, vec3(0.0)), vec3(0.9)) + over / (vec3(1.0) + over * 10.0);
  o = vec4(c, 1.0);`;

const RIM_LINE = "col += vec3(1.0, 0.93, 0.82) * rim * (0.16 + vEmit * 0.22);";
const RIM_LIT = "col += vec3(1.0, 0.97, 0.90) * rim * (0.34 + vEmit * 0.55);";
const FOG_LINE = "fog *= (1.0 - 0.82 * clamp(vEmit, 0.0, 1.0));";
const FOG_LIT = `fog *= (1.0 - 0.82 * clamp(vEmit, 0.0, 1.0));
  fog *= mix(1.0, 0.42, clamp(vW.y * 0.18, 0.0, 1.0));`;

// A slow sheet on the lit sky only. The low sky source does not carry it,
// so a software rasterizer keeps compiling the shader it already had.
const SKY_ANIM = `  if (uSkyAnim > 0.01) {
    float sheet = smoothstep(0.52, 0.9, uv.y) * (0.5 + 0.5 * sin(x * 3.2 + uTime * 0.35));
    vec3 wash = mix(uSky0, uNebula + vec3(0.15, 0.35, 0.25), 0.55);
    c = mix(c, wash, sheet * 0.14 * uSkyAnim);
    float veil = sin(x * 8.0 + uTime * 0.22 + uv.y * 4.0);
    c += vec3(0.55, 0.86, 0.72) * smoothstep(0.55, 0.95, veil) * smoothstep(0.48, 0.82, uv.y) * 0.05 * uSkyAnim;
  }
`;

export const DEPTH_FS = `#version 300 es
precision highp float;
void main() {}`;

export function litFragment(src) {
  if (!src.includes(LIGHT_LINE)) throw new Error("lit shader anchor missing");
  if (!src.includes("out vec4 o;")) throw new Error("lit shader output missing");
  let out = src.replace("out vec4 o;", PCF + "\nout vec4 o;");
  out = out.replace(LIGHT_LINE, LIGHT_LIT);
  out = out.replace(/softKnee\(mix\(col, uFog, fog\)\)/g, "mix(col, uFog, fog)");
  if (out.includes(RIM_LINE)) out = out.replaceAll(RIM_LINE, RIM_LIT);
  if (out.includes(FOG_LINE)) out = out.replaceAll(FOG_LINE, FOG_LIT);
  return out;
}

export function litSky(src) {
  if (!src.includes(SKY_KNEE)) throw new Error("sky knee missing");
  let out = src.replace("uniform float uFlash;", "uniform float uFlash;\nuniform float uSkyAnim;");
  out = out.replace(SKY_KNEE, SKY_ANIM + "  o = vec4(max(c, vec3(0.0)), 1.0);");
  return out;
}

const HIGH_FNS = `
vec3 highShade(vec3 col, vec3 fogCol, float fog, float dist) {
  vec3 haze = mix(fogCol, uHaze, clamp(uAerial, 0.0, 1.0) * 0.7);
  float aerial = min(fog * (1.0 + uAerial * 0.55), 0.34 + uAerial * 0.18);
  vec3 lit = mix(col, haze, clamp(aerial, 0.0, 0.62));
  float gray = dot(lit, vec3(0.299, 0.587, 0.114));
  float far = clamp(dist * 0.0075, 0.0, 1.0) * uAerial;
  return mix(lit, vec3(gray), far * 0.3);
}
float highGloss(float rough, float kind, vec3 halfE, vec3 local) {
  if (uGloss < 0.01) return 0.0;
  if (halfE.y < 0.12 && halfE.x > 0.7 && rough > 0.4 && rough < 0.72 && kind < 0.5 && abs(local.x) < 0.4) return uGloss;
  if (rough < 0.22 && kind < 0.5) return uGloss * 0.8;
  return 0.0;
}
`;

const HIGH_OUT = `vec3 hiCol = highShade(col, uFog, fog, dist);
  float hiG = highGloss(vRough, vKind, vHalf, vL);
  if (hiG > 0.04 && vHalf.y < 0.12) {
    hiCol *= vec3(0.86, 0.91, 0.98);
    float glide = sin(vW.x * 1.7 + vW.z * 0.4 - uTime * 1.35);
    hiCol += vec3(0.7, 0.82, 0.95) * smoothstep(0.78, 0.98, glide) * hiG * 0.16;
  }
  o = vec4(hiCol, hiG);`;

// High-only lighting. Medium keeps litFragment. Gloss lives in alpha
// so a later pass can reflect the road without a second geometry draw.
export function highFragment(src) {
  let out = litFragment(src);
  if (!out.includes("uniform float uPcf;")) throw new Error("high shader pcf missing");
  out = out.replace(
    "uniform float uPcf;\n",
    "uniform float uPcf;\nuniform float uPenumbra;\nuniform float uAerial;\nuniform float uGloss;\nuniform vec3 uHaze;\n",
  );
  out = out.replace(
    "vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));\n",
    `vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
  if (uPenumbra > 0.5) {
    float blocker = texture(uShadowMap, p.xy).r;
    float pen = clamp((p.z - blocker) * uPenumbra, 0.0, 2.8);
    texel *= 1.0 + pen;
  }
`,
  );
  out = out.replace("void main() {", HIGH_FNS + "void main() {");
  out = out.replaceAll("o = vec4(mix(col, uFog, fog), 1.0);", HIGH_OUT);
  out = out.replaceAll("o = vec4(mix(col, uFog, fog), cov);", HIGH_OUT);
  out = out.replace(
    "o = vec4(mix(shade, uFog, fog * 0.7), 1.0);",
    "o = vec4(mix(shade, uFog, fog * 0.7), 0.0);",
  );
  return out;
}

export function highSky(src) {
  const lit = litSky(src);
  if (!lit.includes("o = vec4(max(c, vec3(0.0)), 1.0);")) throw new Error("high sky anchor missing");
  return lit.replace("o = vec4(max(c, vec3(0.0)), 1.0);", "o = vec4(max(c, vec3(0.0)), 0.0);");
}

export function litAnchorsOk(sources) {
  if (!sources || !sources.length) return false;
  for (const src of sources) {
    if (!src.includes(LIGHT_LINE)) return false;
    const lit = litFragment(src);
    if (lit === src) return false;
    if (!lit.includes("shadeShadow")) return false;
    if (lit.includes("softKnee(mix(col, uFog, fog))")) return false;
    if (!src.includes("softKnee(mix(col, uFog, fog))")) return false;
    if (!src.includes(RIM_LINE) || !lit.includes("0.34 + vEmit * 0.55")) return false;
    if (!src.includes(FOG_LINE) || src.includes("vW.y * 0.18")) return false;
    if (!lit.includes("vW.y * 0.18")) return false;
  }
  return true;
}
