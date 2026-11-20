// Offscreen scene, one shadow map, and a bounded bloom chain.
// Built only after the tier leaves low. A failed framebuffer reports
// false and the caller drops back to the single pass.

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

const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uBloom2;
uniform float uAmt;
uniform float uAmt2;
uniform float uExposure;
in vec2 vUv;
out vec4 o;
vec3 softKnee(vec3 c) {
  c = max(c, vec3(0.0)) * uExposure;
  vec3 over = max(c - vec3(0.9), vec3(0.0));
  return min(c, vec3(0.9)) + over / (vec3(1.0) + over * 10.0);
}
void main() {
  vec3 scene = texture(uScene, vUv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb * uAmt;
  bloom += texture(uBloom2, vUv).rgb * uAmt2;
  o = vec4(softKnee(scene + bloom), 1.0);
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

function target(gl, w, h, hdr, depth) {
  const tex = colorTex(gl, w, h, hdr);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let rb = null;
  if (depth) {
    rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  }
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, rb, w, h, ok };
}

function dropTarget(gl, t) {
  if (!t) return;
  if (t.fb) gl.deleteFramebuffer(t.fb);
  if (t.tex) gl.deleteTexture(t.tex);
  if (t.rb) gl.deleteRenderbuffer(t.rb);
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
  const loc = {
    cut: gl.getUniformLocation(threshold, "uCut"),
    cutTex: gl.getUniformLocation(threshold, "uTex"),
    blurTex: gl.getUniformLocation(blur, "uTex"),
    blurDir: gl.getUniformLocation(blur, "uDir"),
    scene: gl.getUniformLocation(composite, "uScene"),
    bloom: gl.getUniformLocation(composite, "uBloom"),
    bloom2: gl.getUniformLocation(composite, "uBloom2"),
    amt: gl.getUniformLocation(composite, "uAmt"),
    amt2: gl.getUniformLocation(composite, "uAmt2"),
    exposure: gl.getUniformLocation(composite, "uExposure"),
  };
  let scene = null;
  let shadow = null;
  let halfA = null;
  let halfB = null;
  let quartA = null;
  let quartB = null;
  let failed = false;

  function release() {
    dropTarget(gl, scene);
    dropTarget(gl, shadow);
    dropTarget(gl, halfA);
    dropTarget(gl, halfB);
    dropTarget(gl, quartA);
    dropTarget(gl, quartB);
    scene = shadow = halfA = halfB = quartA = quartB = null;
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
      if (!scene || scene.w !== w || scene.h !== h || scene.hdr !== hdr) {
        dropTarget(gl, scene);
        scene = target(gl, w, h, hdr, true);
        scene.hdr = hdr;
        if (!scene.ok) return false;
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

  function present(viewW, viewH, profile) {
    if (!scene || !quartA) return false;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.colorMask(true, true, true, true);
    const cut = 0.86;
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, viewW, viewH);
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
    const amt = profile.bloomAmt || 0;
    gl.uniform1f(loc.amt, wide ? amt * 0.7 : amt);
    gl.uniform1f(loc.amt2, amt2);
    gl.uniform1f(loc.exposure, 1.0);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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
  };
}
