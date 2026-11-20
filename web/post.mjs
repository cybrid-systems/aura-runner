// Offscreen scene, one shadow map, and a bounded bloom chain.
// Medium and High add ACES, a scene grade, and FXAA. High can add a
// short radial blur, light shafts, and a quarter-resolution occlusion
// pass. Built only after the tier leaves low. A failed framebuffer
// reports false and the caller drops back to the single pass. Occlusion
// is optional: if its depth texture will not attach, the rest stays.

const POST_VS = `#version 300 es
layout(location=0) in vec2 a;
out vec2 vUv;
void main() {
  vUv = a * 0.5 + 0.5;
  gl_Position = vec4(a, 0.0, 1.0);
}`;

const THRESHOLD_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform float uCut;
in vec2 vUv;
out vec4 o;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  float k = smoothstep(uCut, uCut + 0.22, luma(c));
  o = vec4(c * k, 1.0);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDir;
in vec2 vUv;
out vec4 o;
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.227027;
  c += texture(uTex, vUv + uDir * 1.0).rgb * 0.1945946;
  c += texture(uTex, vUv - uDir * 1.0).rgb * 0.1945946;
  c += texture(uTex, vUv + uDir * 2.0).rgb * 0.1216216;
  c += texture(uTex, vUv - uDir * 2.0).rgb * 0.1216216;
  c += texture(uTex, vUv + uDir * 3.0).rgb * 0.054054;
  c += texture(uTex, vUv - uDir * 3.0).rgb * 0.054054;
  o = vec4(c, 1.0);
}`;

const AO_FS = `#version 300 es
precision highp float;
uniform sampler2D uDepth;
uniform vec2 uRes;
in vec2 vUv;
out vec4 o;
void main() {
  float z = texture(uDepth, vUv).r;
  vec2 px = 2.4 / max(uRes, vec2(1.0));
  float occ = 0.0;
  float sz = texture(uDepth, vUv + vec2(px.x, 0.0)).r;
  float diff = z - sz;
  occ += smoothstep(0.0, 0.008, diff) * (1.0 - smoothstep(0.008, 0.045, diff));
  sz = texture(uDepth, vUv + vec2(-px.x, px.y * 0.65)).r;
  diff = z - sz;
  occ += smoothstep(0.0, 0.008, diff) * (1.0 - smoothstep(0.008, 0.045, diff));
  sz = texture(uDepth, vUv + vec2(px.x * 0.45, -px.y)).r;
  diff = z - sz;
  occ += smoothstep(0.0, 0.008, diff) * (1.0 - smoothstep(0.008, 0.045, diff));
  sz = texture(uDepth, vUv + vec2(-px.x * 0.7, -px.y * 0.8)).r;
  diff = z - sz;
  occ += smoothstep(0.0, 0.008, diff) * (1.0 - smoothstep(0.008, 0.045, diff));
  float k = clamp(1.0 - occ * 0.18, 0.78, 1.0);
  o = vec4(k, k, k, 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uBloom2;
uniform sampler2D uAo;
uniform float uAmt;
uniform float uAmt2;
uniform float uExposure;
uniform float uGrade;
uniform float uSat;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
uniform vec3 uShaftCol;
uniform vec2 uSunUv;
uniform float uShaft;
uniform float uAoAmt;
uniform float uKeep;
uniform float uBack;
uniform float uHit;
in vec2 vUv;
out vec4 o;
// ACES rational fit on the shoulder only. Midtones stay the stylized
// colour; highlights above 0.8 roll off instead of clipping flat.
vec3 acesShoulder(vec3 x) {
  vec3 c = max(x, vec3(0.0));
  vec3 base = min(c, vec3(0.8));
  vec3 h = max(c - vec3(0.8), vec3(0.0));
  float a = 2.51;
  float b = 0.03;
  float c2 = 2.43;
  float d = 0.59;
  float e = 0.14;
  vec3 mapped = (h * (a * h + b)) / (h * (c2 * h + d) + e);
  return clamp(base + mapped * 0.22, 0.0, 1.0);
}
void main() {
  vec3 scene = texture(uScene, vUv).rgb;
  if (uAoAmt > 0.001) scene *= mix(1.0, texture(uAo, vUv).r, uAoAmt);
  vec3 bloom = texture(uBloom, vUv).rgb * (uAmt * (1.0 + uKeep * 1.35));
  bloom += texture(uBloom2, vUv).rgb * uAmt2;
  vec3 shafts = vec3(0.0);
  if (uShaft > 0.001) {
    vec2 dir = (uSunUv - vUv) * 0.16;
    vec2 uv = vUv;
    float wsum = 0.0;
    for (int i = 0; i < 6; i++) {
      uv += dir;
      float w = float(6 - i) / 6.0;
      shafts += texture(uBloom, uv).rgb * w;
      wsum += w;
    }
    shafts = shafts / max(wsum, 0.001) * uShaftCol * uShaft;
  }
  vec3 col = scene * uExposure * (1.0 + uKeep * 0.18) + bloom + shafts;
  col = acesShoulder(col);
  float g = clamp(uGrade, 0.0, 1.0);
  vec3 lifted = col * uGain + uLift;
  float luma = dot(lifted, vec3(0.2126, 0.7152, 0.0722));
  lifted = mix(vec3(luma), lifted, uSat);
  lifted = (lifted - 0.5) * uContrast + 0.5;
  col = mix(col, max(lifted, vec3(0.0)), g);
  if (uKeep > 0.001) col += vec3(1.0, 0.9, 0.62) * uKeep * 0.16;
  if (uBack > 0.001) {
    float vig = smoothstep(0.2, 0.9, length(vUv - vec2(0.5)));
    col = mix(col, col * vec3(0.72, 0.84, 1.0), uBack * 0.8);
    col = mix(col, vec3(0.55, 0.7, 0.88), vig * uBack * 0.45);
  }
  if (uHit > 0.001) col = mix(col, vec3(1.0, 0.96, 0.9), uHit * 0.28);
  o = vec4(max(col, vec3(0.0)), 1.0);
}`;

const FINISH_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uFxaa;
uniform float uBlur;
uniform vec2 uFocus;
in vec2 vUv;
out vec4 o;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  if (uFxaa > 0.5) {
    vec2 px = 1.0 / max(uRes, vec2(1.0));
    float lL = luma(texture(uTex, vUv + vec2(-px.x, 0.0)).rgb);
    float lR = luma(texture(uTex, vUv + vec2(px.x, 0.0)).rgb);
    float lU = luma(texture(uTex, vUv + vec2(0.0, px.y)).rgb);
    float lD = luma(texture(uTex, vUv + vec2(0.0, -px.y)).rgb);
    vec2 dir = vec2(lL - lR, lU - lD);
    float edge = clamp(length(dir) * 6.0, 0.0, 1.0);
    if (edge > 0.04) {
      dir = dir / max(length(dir), 1e-4) * px;
      vec3 a = texture(uTex, vUv + dir * 0.75).rgb;
      vec3 b = texture(uTex, vUv - dir * 0.75).rgb;
      c = mix(c, (a + b) * 0.5, edge * 0.72);
    }
  }
  if (uBlur > 0.001) {
    vec2 dir = (vUv - uFocus) * uBlur * 0.035;
    vec3 acc = c * 0.4;
    acc += texture(uTex, vUv + dir).rgb * 0.2;
    acc += texture(uTex, vUv - dir).rgb * 0.2;
    acc += texture(uTex, vUv + dir * 2.0).rgb * 0.1;
    acc += texture(uTex, vUv - dir * 2.0).rgb * 0.1;
    c = acc;
  }
  o = vec4(c, 1.0);
}`;

function compile(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "shader";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function link(gl, vs, fs) {
  const program = gl.createProgram();
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || "link";
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

function colorTex(gl, w, h, hdr) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const filter = hdr ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return tex;
}

function depthTexture(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  return tex;
}

function target(gl, w, h, hdr, depth, depthAsTex) {
  const tex = colorTex(gl, w, h, hdr);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let rb = null;
  let depthTex = null;
  if (depth && depthAsTex) {
    depthTex = depthTexture(gl, w, h);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  } else if (depth) {
    rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  }
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, rb, depthTex, w, h, ok };
}

function dropTarget(gl, t) {
  if (!t) return;
  if (t.fb) gl.deleteFramebuffer(t.fb);
  if (t.tex) gl.deleteTexture(t.tex);
  if (t.rb) gl.deleteRenderbuffer(t.rb);
  if (t.depthTex) gl.deleteTexture(t.depthTex);
}

export function probeFloat(gl) {
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return false;
  let tex = null;
  let fb = null;
  try {
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, gl.HALF_FLOAT, null);
    fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  } catch {
    return false;
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (fb) gl.deleteFramebuffer(fb);
    if (tex) gl.deleteTexture(tex);
  }
}

export function createPost(gl) {
  const tri = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tri);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const threshold = link(gl, POST_VS, THRESHOLD_FS);
  const blur = link(gl, POST_VS, BLUR_FS);
  const composite = link(gl, POST_VS, COMPOSITE_FS);
  const aoProg = link(gl, POST_VS, AO_FS);
  const finish = link(gl, POST_VS, FINISH_FS);
  const white = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, white);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  const loc = {
    cut: gl.getUniformLocation(threshold, "uCut"),
    cutTex: gl.getUniformLocation(threshold, "uTex"),
    blurTex: gl.getUniformLocation(blur, "uTex"),
    blurDir: gl.getUniformLocation(blur, "uDir"),
    scene: gl.getUniformLocation(composite, "uScene"),
    bloom: gl.getUniformLocation(composite, "uBloom"),
    bloom2: gl.getUniformLocation(composite, "uBloom2"),
    ao: gl.getUniformLocation(composite, "uAo"),
    amt: gl.getUniformLocation(composite, "uAmt"),
    amt2: gl.getUniformLocation(composite, "uAmt2"),
    exposure: gl.getUniformLocation(composite, "uExposure"),
    grade: gl.getUniformLocation(composite, "uGrade"),
    sat: gl.getUniformLocation(composite, "uSat"),
    contrast: gl.getUniformLocation(composite, "uContrast"),
    lift: gl.getUniformLocation(composite, "uLift"),
    gain: gl.getUniformLocation(composite, "uGain"),
    shaftCol: gl.getUniformLocation(composite, "uShaftCol"),
    sunUv: gl.getUniformLocation(composite, "uSunUv"),
    shaft: gl.getUniformLocation(composite, "uShaft"),
    aoAmt: gl.getUniformLocation(composite, "uAoAmt"),
    keep: gl.getUniformLocation(composite, "uKeep"),
    back: gl.getUniformLocation(composite, "uBack"),
    hit: gl.getUniformLocation(composite, "uHit"),
    aoDepth: gl.getUniformLocation(aoProg, "uDepth"),
    aoRes: gl.getUniformLocation(aoProg, "uRes"),
    finTex: gl.getUniformLocation(finish, "uTex"),
    finRes: gl.getUniformLocation(finish, "uRes"),
    finFxaa: gl.getUniformLocation(finish, "uFxaa"),
    finBlur: gl.getUniformLocation(finish, "uBlur"),
    finFocus: gl.getUniformLocation(finish, "uFocus"),
  };
  let scene = null;
  let shadow = null;
  let halfA = null;
  let halfB = null;
  let quartA = null;
  let quartB = null;
  let aoBuf = null;
  let flat = null;
  let aoLive = false;
  let depthDenied = false;
  let failed = false;

  function release() {
    dropTarget(gl, scene);
    dropTarget(gl, shadow);
    dropTarget(gl, halfA);
    dropTarget(gl, halfB);
    dropTarget(gl, quartA);
    dropTarget(gl, quartB);
    dropTarget(gl, aoBuf);
    dropTarget(gl, flat);
    scene = shadow = halfA = halfB = quartA = quartB = aoBuf = flat = null;
    aoLive = false;
  }

  function makeShadow(size) {
    const depth = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depth);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    const color = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, size, size);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex: depth, rb: color, w: size, h: size, ok };
  }

  function ensure(w, h, profile) {
    if (failed) return false;
    try {
      const hdr = !!(profile && profile.hdr);
      const wantDepth = !!(profile && profile.ssao > 0) && !depthDenied;
      if (!scene || scene.w !== w || scene.h !== h || scene.hdr !== hdr || scene.depthTexOn !== wantDepth) {
        dropTarget(gl, scene);
        scene = null;
        try { scene = target(gl, w, h, hdr, true, wantDepth); } catch { scene = null; }
        if ((!scene || !scene.ok) && wantDepth) {
          depthDenied = true;
          if (scene) dropTarget(gl, scene);
          try { scene = target(gl, w, h, hdr, true, false); } catch { scene = null; }
        }
        if (!scene || !scene.ok) return false;
        scene.hdr = hdr;
        scene.depthTexOn = !!(scene.depthTex && wantDepth);
      }
      const size = profile && profile.shadow ? (profile.shadowSize | 0) : 0;
      if (size >= 256 && (!shadow || shadow.w !== size)) {
        dropTarget(gl, shadow);
        shadow = makeShadow(size);
        if (!shadow.ok) return false;
      }
      const chain = profile && profile.chain;
      if (chain === "half") {
        const hw = Math.max(1, Math.min(640, w >> 1));
        const hh = Math.max(1, Math.min(360, h >> 1));
        if (!halfA || halfA.w !== hw || halfA.h !== hh) {
          dropTarget(gl, halfA);
          dropTarget(gl, halfB);
          halfA = target(gl, hw, hh, false, false);
          halfB = target(gl, hw, hh, false, false);
          if (!halfA.ok || !halfB.ok) return false;
        }
      }
      const qw = Math.max(1, Math.min(480, w >> 2));
      const qh = Math.max(1, Math.min(270, h >> 2));
      if (!quartA || quartA.w !== qw || quartA.h !== qh) {
        dropTarget(gl, quartA);
        dropTarget(gl, quartB);
        quartA = target(gl, qw, qh, false, false);
        quartB = target(gl, qw, qh, false, false);
        if (!quartA.ok || !quartB.ok) return false;
      }
      const wantAo = !!(profile && profile.ssao > 0 && scene.depthTex);
      aoLive = false;
      if (wantAo) {
        try {
          if (!aoBuf || aoBuf.w !== qw || aoBuf.h !== qh) {
            dropTarget(gl, aoBuf);
            aoBuf = target(gl, qw, qh, false, false);
          }
          aoLive = !!(aoBuf && aoBuf.ok);
        } catch {
          aoLive = false;
        }
      }
      const wantFlat = !!(profile && (profile.fxaa || profile.blur > 0));
      if (wantFlat) {
        try {
          if (!flat || flat.w !== w || flat.h !== h) {
            dropTarget(gl, flat);
            flat = target(gl, w, h, false, false);
          }
          if (!flat || !flat.ok) flat = null;
        } catch {
          flat = null;
        }
      }
      return !!(scene && scene.ok && quartA && quartA.ok);
    } catch {
      failed = true;
      return false;
    }
  }

  function draw(prog) {
    gl.bindVertexArray(vao);
    gl.useProgram(prog);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function blurPass(src, dirX, dirY, dest) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fb);
    gl.viewport(0, 0, dest.w, dest.h);
    gl.useProgram(blur);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(loc.blurTex, 0);
    gl.uniform2f(loc.blurDir, dirX, dirY);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function present(viewW, viewH, profile, look) {
    if (!scene || !quartA) return false;
    const tone = look || {};
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.colorMask(true, true, true, true);
    const cut = 1.0;
    const wide = profile && profile.chain === "half" && halfA && halfB;
    const first = wide ? halfA : quartA;
    gl.bindFramebuffer(gl.FRAMEBUFFER, first.fb);
    gl.viewport(0, 0, first.w, first.h);
    gl.useProgram(threshold);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.uniform1i(loc.cutTex, 0);
    gl.uniform1f(loc.cut, cut);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    let bloom = quartA;
    let bloom2 = quartA;
    let amt2 = 0;
    if (wide) {
      blurPass(halfA, 1 / halfA.w, 0, halfB);
      blurPass(halfB, 0, 1 / halfB.h, halfA);
      blurPass(halfA, 2 / halfA.w, 0, quartA);
      blurPass(quartA, 0, 1 / quartA.h, quartB);
      bloom = halfA;
      bloom2 = quartB;
      amt2 = (profile.bloomAmt || 0) * 0.55;
    } else {
      blurPass(quartA, 1 / quartA.w, 0, quartB);
      blurPass(quartB, 0, 1 / quartB.h, quartA);
      bloom = quartA;
      bloom2 = quartA;
      amt2 = 0;
    }
    const aoOn = aoLive && scene.depthTex && tone.ao > 0 && aoBuf;
    if (aoOn) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, aoBuf.fb);
      gl.viewport(0, 0, aoBuf.w, aoBuf.h);
      gl.useProgram(aoProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, scene.depthTex);
      gl.uniform1i(loc.aoDepth, 0);
      gl.uniform2f(loc.aoRes, scene.w, scene.h);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    const gradeOn = !!(profile && profile.fxaa) || (tone.blur > 0);
    const dest = gradeOn && flat && flat.ok ? flat.fb : null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dest);
    gl.viewport(0, 0, dest ? flat.w : viewW, dest ? flat.h : viewH);
    gl.useProgram(composite);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.uniform1i(loc.scene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloom.tex);
    gl.uniform1i(loc.bloom, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, bloom2.tex);
    gl.uniform1i(loc.bloom2, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, aoOn ? aoBuf.tex : white);
    gl.uniform1i(loc.ao, 3);
    const amt = profile.bloomAmt || 0;
    const keep = tone.keep > 0 ? tone.keep : 0;
    gl.uniform1f(loc.amt, (wide ? amt * 0.7 : amt) * (1 + keep * 0.35));
    gl.uniform1f(loc.amt2, amt2);
    gl.uniform1f(loc.exposure, tone.exposure > 0 ? tone.exposure : 1);
    gl.uniform1f(loc.grade, tone.grade > 0 ? tone.grade : 0);
    gl.uniform1f(loc.sat, tone.sat > 0 ? tone.sat : 1);
    gl.uniform1f(loc.contrast, tone.contrast > 0 ? tone.contrast : 1);
    const lift = tone.lift || [0, 0, 0];
    const gain = tone.gain || [1, 1, 1];
    const shaftCol = tone.shaftCol || [1, 1, 1];
    const sun = tone.sun || [0.7, 0.75];
    gl.uniform3f(loc.lift, lift[0] || 0, lift[1] || 0, lift[2] || 0);
    gl.uniform3f(loc.gain, gain[0] || 1, gain[1] || 1, gain[2] || 1);
    gl.uniform3f(loc.shaftCol, shaftCol[0] || 1, shaftCol[1] || 1, shaftCol[2] || 1);
    gl.uniform2f(loc.sunUv, sun[0] || 0.7, sun[1] || 0.75);
    gl.uniform1f(loc.shaft, tone.shaft > 0 ? tone.shaft : 0);
    gl.uniform1f(loc.aoAmt, aoOn ? tone.ao : 0);
    gl.uniform1f(loc.keep, keep);
    gl.uniform1f(loc.back, tone.back > 0 ? tone.back : 0);
    gl.uniform1f(loc.hit, tone.hit > 0 ? tone.hit : 0);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (dest) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, viewW, viewH);
      gl.useProgram(finish);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, flat.tex);
      gl.uniform1i(loc.finTex, 0);
      gl.uniform2f(loc.finRes, flat.w, flat.h);
      gl.uniform1f(loc.finFxaa, profile && profile.fxaa ? 1 : 0);
      gl.uniform1f(loc.finBlur, tone.blur > 0 ? tone.blur : 0);
      gl.uniform2f(loc.finFocus, 0.5, 0.62);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.DEPTH_TEST);
    return true;
  }

  return {
    ensure,
    present,
    release,
    failed() { return failed; },
    sceneFb() { return scene && scene.fb; },
    sceneTex() { return scene && scene.tex; },
    shadowFb() { return shadow && shadow.fb; },
    shadowTex() { return shadow && shadow.tex; },
    shadowSize() { return shadow ? shadow.w : 0; },
    aoOn() { return aoLive; },
  };
}
