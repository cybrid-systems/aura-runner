// Third-person WebGL2 renderer. One instanced draw of unit cubes covers the
// road, crates, gates, coins and the runner. The sim's forward axis is Z
// and its lane offset is X.

const MAX = 480;
const STRIDE = 12;

const HUES = [
  { sky0: [0.45, 0.72, 1], sky1: [1, 0.84, 0.62], fog: [0.72, 0.84, 0.98], ground: [0.34, 0.62, 0.4], edge: [0.24, 0.48, 0.32], hurdle: [0.28, 0.4, 0.92], gate: [0.98, 0.58, 0.18], coin: [1, 0.82, 0.28], spring: [0.56, 0.36, 0.95], block: [0.93, 0.55, 0.38], player: [1, 0.42, 0.58], pit: [0.12, 0.22, 0.38] },
  { sky0: [0.98, 0.55, 0.48], sky1: [1, 0.82, 0.7], fog: [1, 0.78, 0.7], ground: [0.32, 0.66, 0.52], edge: [0.22, 0.5, 0.42], hurdle: [0.86, 0.32, 0.52], gate: [0.25, 0.42, 0.86], coin: [1, 0.9, 0.45], spring: [0.3, 0.7, 0.48], block: [0.95, 0.7, 0.4], player: [1, 0.55, 0.32], pit: [0.2, 0.28, 0.45] },
  { sky0: [0.16, 0.18, 0.38], sky1: [0.42, 0.32, 0.62], fog: [0.28, 0.3, 0.48], ground: [0.18, 0.32, 0.4], edge: [0.12, 0.22, 0.3], hurdle: [0.95, 0.72, 0.32], gate: [0.62, 0.78, 1], coin: [1, 0.86, 0.45], spring: [0.4, 0.85, 0.72], block: [0.45, 0.4, 0.7], player: [1, 0.78, 0.38], pit: [0.05, 0.08, 0.16] },
  { sky0: [0.42, 0.78, 0.92], sky1: [0.9, 0.95, 1], fog: [0.75, 0.88, 0.95], ground: [0.4, 0.68, 0.58], edge: [0.28, 0.52, 0.48], hurdle: [0.18, 0.5, 0.58], gate: [0.95, 0.42, 0.38], coin: [1, 0.74, 0.3], spring: [0.9, 0.42, 0.55], block: [0.85, 0.55, 0.4], player: [0.35, 0.45, 0.92], pit: [0.12, 0.28, 0.4] },
  { sky0: [1, 0.62, 0.32], sky1: [1, 0.88, 0.62], fog: [1, 0.78, 0.55], ground: [0.52, 0.58, 0.26], edge: [0.4, 0.42, 0.18], hurdle: [0.48, 0.28, 0.72], gate: [0.15, 0.42, 0.5], coin: [1, 0.55, 0.28], spring: [0.88, 0.3, 0.38], block: [0.72, 0.4, 0.22], player: [0.95, 0.35, 0.4], pit: [0.25, 0.18, 0.12] },
  { sky0: [0.28, 0.7, 0.78], sky1: [0.72, 0.94, 0.9], fog: [0.62, 0.84, 0.82], ground: [0.22, 0.55, 0.48], edge: [0.14, 0.4, 0.38], hurdle: [0.92, 0.45, 0.25], gate: [0.52, 0.28, 0.72], coin: [1, 0.88, 0.4], spring: [0.95, 0.55, 0.7], block: [0.85, 0.78, 0.55], player: [0.96, 0.96, 0.98], pit: [0.08, 0.28, 0.38] },
];

function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function palette(h) {
  const n = HUES.length;
  const f = ((h % n) + n) % n;
  const i = Math.floor(f);
  const t = f - i;
  const A = HUES[i];
  const B = HUES[(i + 1) % n];
  const out = {};
  for (const k of Object.keys(A)) out[k] = mix3(A[k], B[k], t);
  return out;
}

function cube() {
  const faces = [
    { n: [1, 0, 0], p: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
    { n: [-1, 0, 0], p: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
    { n: [0, 1, 0], p: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]] },
    { n: [0, -1, 0], p: [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]] },
    { n: [0, 0, 1], p: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { n: [0, 0, -1], p: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
  ];
  const out = [];
  const order = [0, 1, 2, 0, 2, 3];
  for (const f of faces) {
    for (const i of order) {
      out.push(f.p[i][0], f.p[i][1], f.p[i][2], f.n[0], f.n[1], f.n[2]);
    }
  }
  return new Float32Array(out);
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
  return s;
}

function link(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
  return p;
}

function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
  out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
  return out;
}

function lookAt(out, eye, at, up) {
  let z0 = eye[0] - at[0];
  let z1 = eye[1] - at[1];
  let z2 = eye[2] - at[2];
  let len = Math.hypot(z0, z1, z2) || 1;
  z0 /= len; z1 /= len; z2 /= len;
  let x0 = up[1] * z2 - up[2] * z1;
  let x1 = up[2] * z0 - up[0] * z2;
  let x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2);
  if (!len) { x0 = 0; x1 = 0; x2 = 0; }
  else { len = 1 / len; x0 *= len; x1 *= len; x2 *= len; }
  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;
  out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
  out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
  out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
  return out;
}

function laneX(lane) {
  return lane < 0 ? 0 : (lane - 1) * 1.8;
}

const SKY_VS = `#version 300 es
layout(location=0) in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const SKY_FS = `#version 300 es
precision highp float;
uniform vec3 uSky0; uniform vec3 uSky1; uniform vec2 uRes;
out vec4 o;
void main() {
  float y = gl_FragCoord.y / uRes.y;
  vec3 c = mix(uSky0, uSky1, smoothstep(0.0, 1.0, y));
  vec2 sun = gl_FragCoord.xy / uRes - vec2(0.78, 0.72);
  c += vec3(1.0, 0.92, 0.7) * smoothstep(0.22, 0.0, length(sun));
  o = vec4(c, 1.0);
}`;

const MESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 iPos;
layout(location=3) in vec4 iSize;
layout(location=4) in vec4 iColor;
uniform mat4 uProj;
uniform mat4 uView;
out vec3 vN;
out vec3 vW;
out vec3 vC;
out vec3 vL;
flat out float vShape;
void main() {
  vec3 world = aPos * iSize.xyz + iPos.xyz;
  vL = aPos;
  vN = aNrm;
  vW = world;
  vC = iColor.rgb;
  vShape = iPos.w;
  gl_Position = uProj * uView * vec4(world, 1.0);
}`;

const MESH_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec3 vC; in vec3 vL; flat in float vShape;
uniform vec3 uEye; uniform vec3 uFog; uniform vec3 uLight;
out vec4 o;
void main() {
  if (vShape > 0.5 && vShape < 1.5 && length(vL) > 0.5) discard;
  if (vShape > 1.5 && vShape < 2.5 && abs(vL.x) + abs(vL.y) + abs(vL.z) > 0.78) discard;
  vec3 n = normalize(vShape > 0.5 && vShape < 2.5 ? vL : vN);
  float ndl = max(dot(n, uLight), 0.0);
  float hemi = 0.45 + 0.55 * clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = vC * (0.28 + 0.42 * hemi + 0.55 * ndl);
  col += vec3(1.0, 0.9, 0.7) * pow(max(dot(n, normalize(uLight + normalize(uEye - vW))), 0.0), 24.0) * 0.18;
  float fog = smoothstep(12.0, 46.0, length(vW - uEye));
  o = vec4(mix(col, uFog, fog), 1.0);
}`;

export function createRenderer(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;
  const sky = link(gl, SKY_VS, SKY_FS);
  const mesh = link(gl, MESH_VS, MESH_FS);
  const tri = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tri);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const cubeBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, cube(), gl.STATIC_DRAW);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.bufferData(gl.ARRAY_BUFFER, MAX * STRIDE * 4, gl.DYNAMIC_DRAW);
  const data = new Float32Array(MAX * STRIDE);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  for (let i = 0; i < 3; i++) {
    gl.enableVertexAttribArray(2 + i);
    gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
    gl.vertexAttribDivisor(2 + i, 1);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  const proj = new Float32Array(16);
  const view = new Float32Array(16);
  const u = {
    sky0: gl.getUniformLocation(sky, "uSky0"),
    sky1: gl.getUniformLocation(sky, "uSky1"),
    res: gl.getUniformLocation(sky, "uRes"),
    proj: gl.getUniformLocation(mesh, "uProj"),
    view: gl.getUniformLocation(mesh, "uView"),
    eye: gl.getUniformLocation(mesh, "uEye"),
    fog: gl.getUniformLocation(mesh, "uFog"),
    light: gl.getUniformLocation(mesh, "uLight"),
  };
  let w = 1;
  let h = 1;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }

  let n = 0;
  function push(x, y, z, sx, sy, sz, shape, rgb) {
    if (n >= MAX) return;
    const o = n * STRIDE;
    data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = shape;
    data[o + 4] = sx; data[o + 5] = sy; data[o + 6] = sz; data[o + 7] = 0;
    data[o + 8] = rgb[0]; data[o + 9] = rgb[1]; data[o + 10] = rgb[2]; data[o + 11] = 1;
    n++;
  }

  function gapAt(pieces, z, lane) {
    for (let i = 0; i < pieces.length; i++) {
      const q = pieces[i];
      if (q[0] !== 2) continue;
      const pl = q.length > 5 ? q[5] : -1;
      if (pl >= 0 && pl !== lane) continue;
      if (z >= q[1] && z < q[1] + q[2]) return true;
    }
    return false;
  }

  function frame(st) {
    const pal = palette(st.hue || 0);
    const px = st.lx || 0;
    const py = st.y || 0;
    const pz = st.x || 0;
    const bob = st.reduced ? 0 : Math.sin(st.time * 8) * 0.03;
    const eye = [px * 0.55, 2.15 + bob, pz - 4.4];
    const at = [px * 0.2, 0.95 + py * 0.2, pz + 8.0];
    perspective(proj, 0.95, w / h, 0.08, 80);
    lookAt(view, eye, at, [0, 1, 0]);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(sky);
    gl.uniform3fv(u.sky0, pal.sky0);
    gl.uniform3fv(u.sky1, pal.sky1);
    gl.uniform2f(u.res, w, h);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    n = 0;
    const pieces = st.pieces;
    const z0 = pz - 8;
    const z1 = pz + 48;
    for (let z = Math.floor(z0 / 2) * 2; z < z1; z += 2) {
      for (let lane = 0; lane < 3; lane++) {
        const cx = laneX(lane);
        const cz = z + 1;
        if (gapAt(pieces, cz, lane)) push(cx, -0.85, cz, 1.7, 0.7, 1.95, 0, pal.pit);
        else push(cx, -0.08, cz, 1.7, 0.16, 1.95, 0, pal.ground);
      }
      push(-3.5, -0.2, z + 1, 2.2, 0.3, 1.95, 0, pal.edge);
      push(3.5, -0.2, z + 1, 2.2, 0.3, 1.95, 0, pal.edge);
    }
    for (let i = 0; i < pieces.length; i++) {
      const q = pieces[i];
      const k = q[0];
      if (k === 0 || k === 1 || k === 2) continue;
      const zc = q[1] + q[2] * 0.5;
      if (zc < z0 || zc > z1) continue;
      const lane = q.length > 5 ? q[5] : -1;
      const depth = Math.max(0.45, q[2]);
      if (k === 3) {
        const h = q[3];
        const wide = lane < 0;
        const cx = laneX(lane);
        const span = wide ? 5.4 : 1.45;
        push(cx, h * 0.5, zc, wide ? span : 1.35, h, depth, 0, pal.hurdle);
      } else if (k === 4) {
        const bottom = q[4];
        const bar = q[3];
        push(0, bottom + bar * 0.5, zc, 5.5, bar, Math.max(0.28, depth * 0.45), 0, pal.gate);
        push(-2.5, bottom * 0.5, zc, 0.28, bottom, 0.28, 0, pal.gate);
        push(2.5, bottom * 0.5, zc, 0.28, bottom, 0.28, 0, pal.gate);
      } else if (k === 5) {
        const bobc = st.reduced ? 0 : Math.sin(st.time * 3 + q[1]) * 0.08;
        push(laneX(lane), q[4] + bobc, zc, 0.42, 0.42, 0.42, 2, pal.coin);
      } else if (k === 6) {
        push(laneX(lane), 0.12, zc, Math.max(0.7, q[2]), 0.18, 0.7, 0, pal.spring);
      } else if (k === 7) {
        push(laneX(lane < 0 ? 1 : lane), q[3] * 0.5, zc, 1.25, q[3], depth, 0, pal.block);
      }
    }
    const bodyY = py + (st.slide > 0 ? 0.38 : 0.62);
    const bodyH = st.slide > 0 ? 0.5 : 0.95;
    push(px, 0.04, pz, 0.85, 0.05, 0.85, 0, [0.08, 0.1, 0.14]);
    push(px, bodyY, pz, 0.72, bodyH, 0.55, 0, pal.player);
    if (st.slide <= 0) {
      push(px, py + 1.28, pz + 0.06, 0.46, 0.42, 0.42, 0, [1, 0.9, 0.78]);
      push(px - 0.12, py + 1.32, pz + 0.24, 0.12, 0.12, 0.08, 0, [0.15, 0.12, 0.2]);
      push(px + 0.12, py + 1.32, pz + 0.24, 0.12, 0.12, 0.08, 0, [0.15, 0.12, 0.2]);
      const flame = st.reduced ? 0 : Math.sin(st.time * 14) * 0.05;
      push(px, py + 1.68 + flame, pz, 0.22, 0.36, 0.22, 0, [1, 0.72, 0.22]);
    } else {
      push(px, py + 0.55, pz + 0.2, 0.4, 0.22, 0.28, 0, [1, 0.9, 0.78]);
    }
    gl.useProgram(mesh);
    gl.uniformMatrix4fv(u.proj, false, proj);
    gl.uniformMatrix4fv(u.view, false, view);
    gl.uniform3f(u.eye, eye[0], eye[1], eye[2]);
    gl.uniform3fv(u.fog, pal.fog);
    gl.uniform3f(u.light, 0.32, 0.86, 0.28);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * STRIDE));
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, n);
    return n;
  }

  return { gl, resize, frame };
}
