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

function mixTone(rgb, s) {
  return [rgb[0] * s, rgb[1] * s, rgb[2] * s];
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

// The camera looks down +Z. With that view, world +X is the left side of
// the screen. The sim stores lane 0 (left) at negative X, so the render
// negates lateral positions. Input still sends lane -1 for Left.
export function worldX(simX) {
  return -simX;
}

export function cameraPose(simLx, simY, simZ, fovy = 0.95) {
  const rx = worldX(simLx);
  return {
    eye: [rx * 0.55, 2.15, simZ - 4.4],
    at: [rx * 0.2, 0.95 + simY * 0.2, simZ + 8],
    fovy,
  };
}

function mulMatPoint(m, p) {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] * p[3];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] * p[3];
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] * p[3];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] * p[3];
  return [x, y, z, w];
}

// Project a sim position with a camera fixed on the centre lane. Screen x
// grows to the right. After a Left press, this value must fall.
export function screenX(simLx, simY, simZ, width, height) {
  const pose = cameraPose(0, 0, simZ);
  const proj = new Float32Array(16);
  const viewM = new Float32Array(16);
  perspective(proj, pose.fovy, width / height, 0.08, 80);
  lookAt(viewM, pose.eye, pose.at, [0, 1, 0]);
  const viewP = mulMatPoint(viewM, [worldX(simLx), 0.8 + simY, simZ, 1]);
  const clip = mulMatPoint(proj, viewP);
  const ndcX = clip[0] / clip[3];
  return (ndcX * 0.5 + 0.5) * width;
}

const SKY_VS = `#version 300 es
layout(location=0) in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const SKY_FS = `#version 300 es
precision highp float;
uniform vec3 uSky0; uniform vec3 uSky1; uniform vec3 uHill; uniform vec2 uRes;
uniform float uTime; uniform float uCamZ;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = mix(uSky0, uSky1, smoothstep(0.0, 0.85, uv.y));
  float parallax = uCamZ * 0.015;
  float h1 = 0.34 + 0.05 * sin(uv.x * 9.0 + parallax);
  float h2 = 0.24 + 0.04 * sin(uv.x * 16.0 + 1.7 + parallax * 1.6);
  if (uv.y < h1) c = mix(c, uHill, 0.55);
  if (uv.y < h2) c = mix(c, uHill * 0.78, 0.85);
  vec2 sun = uv - vec2(0.78, 0.74);
  float sd = length(sun);
  c += vec3(1.0, 0.95, 0.75) * smoothstep(0.28, 0.0, sd);
  c += vec3(1.0, 0.85, 0.55) * smoothstep(0.08, 0.0, sd);
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
flat out vec3 vCenter;
flat out vec3 vHalf;
flat out float vShape;
void main() {
  vec3 world = aPos * iSize.xyz + iPos.xyz;
  vL = aPos;
  vN = aNrm;
  vW = world;
  vC = iColor.rgb;
  vCenter = iPos.xyz;
  vHalf = iSize.xyz * 0.5;
  vShape = iPos.w;
  gl_Position = uProj * uView * vec4(world, 1.0);
}`;

const MESH_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec3 vC; in vec3 vL;
flat in vec3 vCenter; flat in vec3 vHalf; flat in float vShape;
uniform vec3 uEye; uniform vec3 uFog; uniform vec3 uLight;
out vec4 o;
void main() {
  vec3 n = normalize(vN);
  vec3 rd = normalize(vW - uEye);
  if (vShape > 0.5 && vShape < 1.5) {
    float r = min(min(vHalf.x, vHalf.y), vHalf.z);
    vec3 oc = uEye - vCenter;
    float b = dot(oc, rd);
    float h = b * b - (dot(oc, oc) - r * r);
    if (h < 0.0) discard;
    vec3 hit = uEye + rd * (-b - sqrt(h));
    n = normalize(hit - vCenter);
  } else if (vShape > 1.5 && vShape < 2.5) {
    if (abs(vL.x) + abs(vL.y) + abs(vL.z) > 0.78) discard;
    n = normalize(vec3(sign(vL.x), sign(vL.y), sign(vL.z)));
  } else {
    float edge = min(min(0.5 - abs(vL.x), 0.5 - abs(vL.y)), 0.5 - abs(vL.z));
    n = normalize(vN + vL * smoothstep(0.12, 0.0, edge));
  }
  vec3 viewDir = normalize(uEye - vW);
  float ndl = max(dot(n, uLight), 0.0);
  float hemi = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = vC * (0.24 + 0.36 * hemi + 0.62 * ndl);
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.4);
  col += vec3(1.0, 0.95, 0.85) * rim * 0.28;
  float spec = pow(max(dot(n, normalize(uLight + viewDir)), 0.0), vShape > 1.5 && vShape < 2.5 ? 48.0 : 28.0);
  col += vec3(1.0, 0.96, 0.86) * spec * (vShape > 1.5 && vShape < 2.5 ? 0.85 : 0.22);
  if (vShape < 0.5) {
    float edge = min(min(0.5 - abs(vL.x), 0.5 - abs(vL.y)), 0.5 - abs(vL.z));
    col *= 0.78 + 0.22 * smoothstep(0.0, 0.14, edge);
  }
  float fog = smoothstep(14.0, 52.0, length(vW - uEye));
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
    hill: gl.getUniformLocation(sky, "uHill"),
    res: gl.getUniformLocation(sky, "uRes"),
    time: gl.getUniformLocation(sky, "uTime"),
    camZ: gl.getUniformLocation(sky, "uCamZ"),
    proj: gl.getUniformLocation(mesh, "uProj"),
    view: gl.getUniformLocation(mesh, "uView"),
    eye: gl.getUniformLocation(mesh, "uEye"),
    fog: gl.getUniformLocation(mesh, "uFog"),
    light: gl.getUniformLocation(mesh, "uLight"),
  };
  let w = 1;
  let h = 1;
  let camX = 0;
  let camZ = 0;
  let camFov = 0.95;
  const sparks = new Float32Array(28 * 5);

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

  function burst(x, y, z, rgb) {
    for (let i = 0; i < 28; i++) {
      if (sparks[i * 5 + 4] > 0) continue;
      const a = (i / 28) * Math.PI * 2;
      sparks[i * 5] = x;
      sparks[i * 5 + 1] = y;
      sparks[i * 5 + 2] = z;
      sparks[i * 5 + 3] = a;
      sparks[i * 5 + 4] = 0.45;
      break;
    }
    void rgb;
  }

  function frame(st) {
    const pal = palette(st.hue || 0);
    const px = st.lx || 0;
    const py = st.y || 0;
    const pz = st.x || 0;
    const rx = worldX(px);
    const follow = st.reduced ? 1 : 0.14;
    camX += (rx - camX) * follow;
    camZ += (pz - camZ) * (st.reduced ? 1 : 0.2);
    const wantFov = py > 0.35 ? 1.05 : 0.92;
    camFov += (wantFov - camFov) * (st.reduced ? 1 : 0.08);
    const bob = st.reduced ? 0 : Math.sin(st.time * 8) * 0.025;
    const eye = [camX * 0.55, 2.2 + bob, camZ - 4.6];
    const at = [camX * 0.15, 1.0 + py * 0.15, camZ + 8.0];
    perspective(proj, camFov, w / h, 0.08, 90);
    lookAt(view, eye, at, [0, 1, 0]);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(sky);
    gl.uniform3fv(u.sky0, pal.sky0);
    gl.uniform3fv(u.sky1, pal.sky1);
    gl.uniform3fv(u.hill, pal.hill || pal.fog);
    gl.uniform1f(u.time, st.time || 0);
    gl.uniform1f(u.camZ, camZ);
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
    const z1 = pz + 46;
    const wx = worldX;
    for (let z = Math.floor(z0 / 2) * 2; z < z1; z += 2) {
      for (let lane = 0; lane < 3; lane++) {
        const cx = wx(laneX(lane));
        const cz = z + 1;
        if (gapAt(pieces, cz, lane)) push(cx, -0.85, cz, 1.65, 0.55, 1.92, 0, pal.pit);
        else push(cx, -0.06, cz, 1.65, 0.14, 1.92, 0, lane === 1 ? pal.ground : mixTone(pal.ground, 0.92));
      }
      push(wx(-3.6), -0.18, z + 1, 2.4, 0.28, 1.92, 0, pal.edge);
      push(wx(3.6), -0.18, z + 1, 2.4, 0.28, 1.92, 0, pal.edge);
      if (((z / 2) | 0) % 4 === 0) {
        const sway = st.reduced ? 0 : Math.sin(st.time * 1.4 + z) * 0.08;
        for (const side of [-1, 1]) {
          const tx = wx(side * 6.2);
          push(tx, 0.4, z + 1, 0.22, 0.8, 0.22, 0, [0.45, 0.32, 0.22]);
          push(tx + sway, 1.15, z + 1, 0.9, 0.8, 0.9, 1, side < 0 ? [0.35, 0.72, 0.42] : [0.42, 0.78, 0.48]);
        }
      }
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
        const cx = wx(laneX(lane));
        const span = wide ? 5.2 : 1.35;
        push(cx, h * 0.5, zc, wide ? span : 1.25, h, depth, 0, pal.hurdle);
      } else if (k === 4) {
        const bottom = q[4];
        const bar = q[3];
        push(0, bottom + bar * 0.5, zc, 5.3, bar, Math.max(0.28, depth * 0.4), 0, pal.gate);
        push(wx(-2.45), bottom * 0.5, zc, 0.28, bottom, 0.28, 0, pal.gate);
        push(wx(2.45), bottom * 0.5, zc, 0.28, bottom, 0.28, 0, pal.gate);
      } else if (k === 5) {
        const bobc = st.reduced ? 0 : Math.sin(st.time * 3 + q[1]) * 0.08;
        push(wx(laneX(lane)), q[4] + bobc, zc, 0.4, 0.4, 0.4, 2, pal.coin);
      } else if (k === 6) {
        push(wx(laneX(lane)), 0.1, zc, Math.max(0.7, q[2]), 0.16, 0.7, 0, pal.spring);
        push(wx(laneX(lane)), 0.32, zc, 0.36, 0.28, 0.36, 1, pal.spring);
      } else if (k === 7) {
        push(wx(laneX(lane < 0 ? 1 : lane)), q[3] * 0.5, zc, 1.2, q[3], depth, 0, pal.block);
      }
    }
    if (st.event === "coin" || st.event === "spring" || st.event === "lane") burst(rx, py + 0.8, pz);
    const air = py > 0.08;
    const sliding = st.slide > 0;
    const swing = st.reduced || air || sliding ? 0 : Math.sin(st.time * 11);
    const squash = air ? 1.12 : 1;
    const bodyH = (sliding ? 0.48 : 0.86) * squash;
    const bodyY = py + (sliding ? 0.32 : 0.55 * squash);
    push(rx, 0.035, pz, 0.9, 0.04, 0.7, 0, [0.1, 0.12, 0.16]);
    if (!sliding) {
      push(wx(px - 0.16), 0.22, pz + swing * 0.22, 0.16, 0.4, 0.18, 0, [0.85, 0.3, 0.48]);
      push(wx(px + 0.16), 0.22, pz - swing * 0.22, 0.16, 0.4, 0.18, 0, [0.85, 0.3, 0.48]);
    }
    push(rx, bodyY, pz, sliding ? 0.85 : 0.62, bodyH, sliding ? 0.7 : 0.48, 0, pal.player);
    if (!sliding) {
      const hy = py + 1.15 * squash;
      push(rx, hy, pz + 0.06, 0.42, 0.38, 0.4, 1, [1, 0.9, 0.78]);
      push(wx(px - 0.1), hy + 0.02, pz + 0.22, 0.09, 0.09, 0.06, 0, [0.16, 0.12, 0.22]);
      push(wx(px + 0.1), hy + 0.02, pz + 0.22, 0.09, 0.09, 0.06, 0, [0.16, 0.12, 0.22]);
      const flame = st.reduced ? 0 : Math.sin(st.time * 14) * 0.05;
      push(rx, hy + 0.36 + flame, pz, 0.18, 0.32, 0.18, 1, [1, 0.72, 0.22]);
    } else {
      push(rx, py + 0.48, pz + 0.22, 0.36, 0.2, 0.28, 1, [1, 0.9, 0.78]);
    }
    for (let i = 0; i < 28; i++) {
      const life = sparks[i * 5 + 4];
      if (life <= 0) continue;
      const a = sparks[i * 5 + 3];
      sparks[i * 5] += Math.cos(a) * 0.04;
      sparks[i * 5 + 1] += 0.03;
      sparks[i * 5 + 2] += Math.sin(a) * 0.04;
      sparks[i * 5 + 4] = life - 0.016;
      push(sparks[i * 5], sparks[i * 5 + 1], sparks[i * 5 + 2], 0.1, 0.1, 0.1, 1, pal.coin);
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
