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

export const DEPTH_FS = `#version 300 es
precision highp float;
void main() {}`;

export function litFragment(src) {
  if (!src.includes(LIGHT_LINE)) throw new Error("lit shader anchor missing");
  if (!src.includes("out vec4 o;")) throw new Error("lit shader output missing");
  let out = src.replace("out vec4 o;", PCF + "\nout vec4 o;");
  out = out.replace(LIGHT_LINE, LIGHT_LIT);
  out = out.replace(/softKnee\(mix\(col, uFog, fog\)\)/g, "mix(col, uFog, fog)");
  return out;
}

export function litSky(src) {
  if (!src.includes(SKY_KNEE)) throw new Error("sky knee missing");
  return src.replace(SKY_KNEE, "  o = vec4(max(c, vec3(0.0)), 1.0);");
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
  }
  return true;
}
