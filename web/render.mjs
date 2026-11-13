// Third-person WebGL2 view of the Lumen garden. One instanced draw of
// unit cubes, shaded as beveled toys, spheres and seeds. The sim's
// forward axis is Z and its lane offset is X.
//
// The camera looks down +Z, so world +X is screen-left. The sim stores
// lane 0 (left) at negative X, and the renderer negates lateral positions.
// Input still sends lane -1 for Left.

const MAX = 520;
const STRIDE = 12;

function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function mul(rgb, s) {
  return [rgb[0] * s, rgb[1] * s, rgb[2] * s];
}

const FLOWERS = {
  daisy: [[0.98, 0.98, 0.94], [1.0, 0.86, 0.42]],
  tulip: [[0.93, 0.28, 0.42], [0.98, 0.55, 0.68]],
  blossom: [[0.98, 0.62, 0.78], [0.74, 0.46, 0.86]],
  buttercup: [[1.0, 0.88, 0.22], [0.98, 0.7, 0.28]],
};

function flowerPair(kind) {
  return FLOWERS[kind] || FLOWERS.daisy;
}

// Sky, ground, flowers and light come from the kept garden phrase.
// Hue still warms the hills a little when an obstacle phrase is kept.
// Obstacle colors stay put so a hurdle, a gate and a pot stay readable.
function palette(h, scene) {
  const t = Math.max(0, Math.min(1, (h || 0) / 5));
  const sky = (scene && scene.sky) || [0.55, 0.72, 0.95];
  const ground = (scene && scene.ground) || [0.42, 0.68, 0.38];
  const light = scene && typeof scene.light === "number" ? scene.light : 0.82;
  const bloom = flowerPair(scene && scene.flower);
  const skyLift = 0.78 + 0.22 * light;
  return {
    sky0: mul(sky, skyLift),
    sky1: mix3(mul(sky, skyLift), [1.0, 0.72, 0.48], 0.42),
    fog: mix3(mul(sky, 0.9), [1.0, 0.78, 0.58], 0.35),
    hill: mix3([0.55, 0.66, 0.74], [0.32, 0.28, 0.48], t),
    hill2: mix3([0.40, 0.55, 0.62], [0.24, 0.22, 0.38], t),
    soil: mix3([0.45, 0.32, 0.22], [0.28, 0.20, 0.22], t),
    grass: ground,
    grassL: mix3(ground, [1, 1, 1], 0.14),
    grassR: mix3(ground, [0.1, 0.15, 0.08], 0.12),
    path: mix3([0.93, 0.78, 0.52], [0.62, 0.46, 0.40], t),
    hedge: mix3([0.22, 0.46, 0.28], [0.14, 0.32, 0.26], t),
    water: [0.18, 0.55, 0.62],
    lily: [0.55, 0.78, 0.42],
    hurdle: [0.33, 0.58, 0.90],
    hurdleTop: [0.62, 0.82, 0.98],
    gate: [0.96, 0.66, 0.28],
    coin: [1.0, 0.84, 0.32],
    spring: [0.92, 0.42, 0.62],
    pot: [0.86, 0.46, 0.30],
    potRim: [0.96, 0.72, 0.48],
    trunk: [0.46, 0.32, 0.22],
    leaf: [0.30, 0.66, 0.40],
    leaf2: [0.42, 0.74, 0.46],
    flower: bloom[0],
    flower2: bloom[1],
    lightAmt: light,
    density: scene && typeof scene.density === "number" ? scene.density : 0.45,
    body: [0.95, 0.48, 0.42],
    bodyDeep: [0.78, 0.32, 0.38],
    head: [1.0, 0.90, 0.78],
    cape: [1.0, 0.78, 0.38],
    sun: mix3(mul(sky, skyLift), [1.0, 0.92, 0.72], 0.35),
    sunUv: [0.74 - t * 0.08, 0.78 - t * 0.22],
  };
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
    for (const i of order) out.push(f.p[i][0], f.p[i][1], f.p[i][2], f.n[0], f.n[1], f.n[2]);
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
uniform vec3 uSky0; uniform vec3 uSky1; uniform vec3 uHill; uniform vec3 uHill2;
uniform vec3 uSunCol; uniform vec2 uSun; uniform vec2 uRes;
uniform float uTime; uniform float uCamZ;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float horizon = smoothstep(0.0, 0.72, uv.y);
  vec3 c = mix(uSky1, uSky0, horizon);
  float haze = exp(-max(uv.y - 0.18, 0.0) * 3.2);
  c = mix(c, uSky1, haze * 0.35);
  float parallax = uCamZ * 0.012;
  float h1 = 0.30 + 0.045 * sin(uv.x * 7.0 + parallax);
  float h2 = 0.22 + 0.035 * sin(uv.x * 15.0 + 1.4 + parallax * 1.7);
  if (uv.y < h1) c = mix(c, uHill, smoothstep(h1, h1 - 0.08, uv.y));
  if (uv.y < h2) c = mix(c, uHill2, 0.9);
  float cloud = sin(uv.x * 5.0 + parallax);
  c = mix(c, vec3(1.0, 0.95, 0.88), smoothstep(0.2, 0.9, cloud) * smoothstep(0.4, 0.75, uv.y) * 0.22);
  vec2 sun = uv - uSun;
  float sd = length(sun);
  c += uSunCol * smoothstep(0.14, 0.0, sd) * 0.5;
  c += vec3(1.0, 0.97, 0.9) * smoothstep(0.035, 0.0, sd);
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
flat out float vRough;
flat out float vEmit;
void main() {
  vec3 world = aPos * iSize.xyz + iPos.xyz;
  vL = aPos;
  vN = aNrm;
  vW = world;
  vC = iColor.rgb;
  vCenter = iPos.xyz;
  vHalf = iSize.xyz * 0.5;
  vShape = iPos.w;
  vRough = iSize.w;
  vEmit = iColor.a;
  gl_Position = uProj * uView * vec4(world, 1.0);
}`;

const MESH_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec3 vC; in vec3 vL;
flat in vec3 vCenter; flat in vec3 vHalf; flat in float vShape;
flat in float vRough; flat in float vEmit;
uniform vec3 uEye; uniform vec3 uFog; uniform vec3 uLight; uniform float uTime;
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
    if (abs(vL.x) + abs(vL.y) + abs(vL.z) > 0.82) discard;
    n = normalize(vec3(sign(vL.x), sign(vL.y), sign(vL.z)));
  } else {
    float edge = min(min(0.5 - abs(vL.x), 0.5 - abs(vL.y)), 0.5 - abs(vL.z));
    n = normalize(vN + vL * smoothstep(0.16, 0.0, edge) * 0.85);
  }
  vec3 viewDir = normalize(uEye - vW);
  float ndl = max(dot(n, uLight), 0.0);
  float hemi = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  float wrap = clamp(dot(n, uLight) * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = vC * (0.22 + 0.28 * hemi + 0.55 * ndl + 0.12 * wrap);
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.2);
  col += vec3(1.0, 0.93, 0.82) * rim * (0.18 + vEmit * 0.25);
  float specPow = mix(56.0, 10.0, clamp(vRough, 0.0, 1.0));
  float spec = pow(max(dot(n, normalize(uLight + viewDir)), 0.0), specPow);
  col += vec3(1.0, 0.96, 0.88) * spec * mix(0.55, 0.08, clamp(vRough, 0.0, 1.0));
  if (vShape < 0.5) {
    float edge = min(min(0.5 - abs(vL.x), 0.5 - abs(vL.y)), 0.5 - abs(vL.z));
    col *= 0.76 + 0.24 * smoothstep(0.0, 0.16, edge);
    if (vHalf.y < 0.12) col *= 1.0 - 0.22 * smoothstep(0.32, 0.48, abs(vL.x));
  }
  float under = smoothstep(-0.15, -0.48, vL.y);
  col *= 1.0 - 0.32 * under * (1.0 - vEmit);
  float pulse = 0.85 + 0.15 * sin(uTime * 3.0 + vCenter.z);
  col += vC * vEmit * pulse;
  float dist = length(vW - uEye);
  float fog = 1.0 - exp(-dist * 0.028);
  fog = clamp(fog + smoothstep(28.0, 58.0, dist) * 0.35, 0.0, 1.0);
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
    hill2: gl.getUniformLocation(sky, "uHill2"),
    sunCol: gl.getUniformLocation(sky, "uSunCol"),
    sun: gl.getUniformLocation(sky, "uSun"),
    res: gl.getUniformLocation(sky, "uRes"),
    time: gl.getUniformLocation(sky, "uTime"),
    camZ: gl.getUniformLocation(sky, "uCamZ"),
    proj: gl.getUniformLocation(mesh, "uProj"),
    view: gl.getUniformLocation(mesh, "uView"),
    eye: gl.getUniformLocation(mesh, "uEye"),
    fog: gl.getUniformLocation(mesh, "uFog"),
    light: gl.getUniformLocation(mesh, "uLight"),
    mtime: gl.getUniformLocation(mesh, "uTime"),
  };
  let w = 1;
  let h = 1;
  let camX = 0;
  let camY = 2.15;
  let camZ = 0;
  let camFov = 0.92;
  let prevY = 0;
  let prevLx = 0;
  let lean = 0;
  let land = 0;
  let pulse = 0;
  let prevSpeed = 5;
  let prevG = 32;
  let reject = 0;
  const sparks = new Float32Array(36 * 8);

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
  function push(x, y, z, sx, sy, sz, shape, rgb, rough = 0.62, emit = 0) {
    if (n >= MAX) return;
    const o = n * STRIDE;
    data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = shape;
    data[o + 4] = sx; data[o + 5] = sy; data[o + 6] = sz; data[o + 7] = rough;
    data[o + 8] = rgb[0]; data[o + 9] = rgb[1]; data[o + 10] = rgb[2]; data[o + 11] = emit;
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

  function burst(x, y, z, rgb, count, lift) {
    let left = count;
    for (let i = 0; i < 36 && left > 0; i++) {
      const o = i * 8;
      if (sparks[o + 6] > 0) continue;
      const a = (i / 36) * Math.PI * 2;
      sparks[o] = x;
      sparks[o + 1] = y;
      sparks[o + 2] = z;
      sparks[o + 3] = Math.cos(a);
      sparks[o + 4] = Math.sin(a);
      sparks[o + 5] = lift;
      sparks[o + 6] = 0.55;
      sparks[o + 7] = i;
      left--;
    }
    void rgb;
  }

  function sproutOf(q, pz) {
    if (!q.born) return 1;
    const dist = q[1] - pz;
    if (dist <= 9) return 1;
    if (dist >= 24) return 0.18;
    const t = (24 - dist) / 15;
    return 0.18 + 0.82 * (t * t * (3 - 2 * t));
  }

  function frame(st) {
    const pal = palette(st.hue || 0, st.scene);
    const px = st.lx || 0;
    const py = st.y || 0;
    const pz = st.x || 0;
    const speed = st.speed || 5;
    const grav = st.g || 32;
    const alive = st.alive !== false;
    const rx = worldX(px);
    const reduced = !!st.reduced;
    if (Math.abs(speed - prevSpeed) > 0.05 || Math.abs(grav - prevG) > 0.05) pulse = 1;
    prevSpeed = speed;
    prevG = grav;
    if (py <= 0.02 && prevY > 0.18) land = 1;
    prevY = py;
    const lxDelta = px - prevLx;
    prevLx = px;
    lean += ((reduced ? 0 : -lxDelta * 6) - lean) * (reduced ? 1 : 0.2);
    land = Math.max(0, land - (reduced ? 1 : 0.08));
    pulse = Math.max(0, pulse - (reduced ? 1 : 0.015));
    if (st.reject) reject = 1;
    reject = Math.max(0, reject - 0.01);
    const follow = reduced ? 1 : 0.12;
    camX += (rx - camX) * follow;
    camZ += (pz - camZ) * (reduced ? 1 : 0.18);
    const floaty = Math.max(0, (32 - grav) * 0.03);
    const wantY = 2.25 + floaty + (py > 0.4 ? 0.18 : 0) - land * 0.16;
    camY += (wantY - camY) * (reduced ? 1 : 0.08);
    const wantFov = (py > 0.35 ? 1.04 : 0.9) + Math.min(0.1, Math.max(0, speed - 5) * 0.025) + pulse * 0.04;
    camFov += (wantFov - camFov) * (reduced ? 1 : 0.08);
    const bob = reduced || !alive ? 0 : Math.sin(st.time * (8 + speed * 0.25)) * 0.02;
    const eye = [camX * 0.62 + lean * 0.15, camY + bob, camZ - 4.7];
    const at = [camX * 0.22, 0.95 + py * 0.18 + floaty * 0.4, camZ + 7.4];
    perspective(proj, camFov, w / h, 0.08, 96);
    lookAt(view, eye, at, [0, 1, 0]);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(sky);
    gl.uniform3fv(u.sky0, pal.sky0);
    gl.uniform3fv(u.sky1, pal.sky1);
    gl.uniform3fv(u.hill, pal.hill);
    gl.uniform3fv(u.hill2, pal.hill2);
    gl.uniform3fv(u.sunCol, pal.sun);
    gl.uniform2f(u.sun, pal.sunUv[0], pal.sunUv[1]);
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
    const z1 = pz + 42;
    const wx = worldX;
    for (let z = Math.floor(z0 / 2) * 2; z < z1; z += 2) {
      const cz = z + 1;
      const dist = cz - pz;
      for (let lane = 0; lane < 3; lane++) {
        const cx = wx(laneX(lane));
        if (gapAt(pieces, cz, lane)) {
          push(cx, -0.06, cz, 1.72, 0.1, 2.02, 0, pal.water, 0.12, 0.1);
        } else {
          const top = lane === 1 ? pal.path : lane === 0 ? pal.grassL : pal.grassR;
          push(cx, 0.02, cz, 1.74, 0.12, 2.02, 0, top, lane === 1 ? 0.55 : 0.8, 0);
        }
      }
      if (dist < 36 && ((z / 2) | 0) % 2 === 0) {
        push(wx(-3.35), 0.1, cz, 0.72, 0.22, 4.06, 0, pal.hedge, 0.8, 0);
        push(wx(3.35), 0.1, cz, 0.72, 0.22, 4.06, 0, pal.hedge, 0.8, 0);
      }
      if (dist < 30 && ((z / 2) | 0) % 6 === 0) {
        const sway = reduced ? 0 : Math.sin(st.time * 1.2 + z * 0.2) * 0.05;
        for (const side of [-1, 1]) {
          const tx = wx(side * 5.4);
          push(tx, 0.42, cz, 0.16, 0.84, 0.16, 0, pal.trunk, 0.8, 0);
          const nearTree = dist < 16;
          push(tx + sway, 1.2, cz, 1.05, 0.95, 1.05, nearTree ? 1 : 0, side < 0 ? pal.leaf : pal.leaf2, 0.72, 0.02);
        }
      }
      const stride = pal.density >= 0.75 ? 2 : pal.density >= 0.4 ? 4 : 8;
      if (dist < 24 && ((z / 2) | 0) % stride === 0) {
        const bloom = ((z / 2) | 0) % 4 === 0 ? pal.flower : pal.flower2;
        const side = ((z / 2) | 0) % 8 === 0 ? -1 : 1;
        push(wx(side * 2.55), 0.22, cz, 0.22, 0.22, 0.22, 1, bloom, 0.35, 0.35);
        if (pal.density >= 0.75) {
          push(wx(-side * 2.15), 0.18, cz + 0.4, 0.16, 0.28, 0.16, 1, pal.flower2, 0.3, 0.4);
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
      const sc = sproutOf(q, pz);
      const depth = Math.max(0.45, q[2]);
      const glow = q.born ? 0.16 : 0;
      if (k === 3) {
        const hh = q[3] * sc;
        const wide = lane < 0;
        const cx = wx(laneX(lane));
        const span = (wide ? 5.15 : 1.28) * (wide ? 1 : sc);
        push(cx, hh * 0.42, zc, wide ? span : 1.22 * sc, hh, depth * sc, 0, pal.hurdle, 0.48, glow);
        push(cx, hh * 0.92, zc, (wide ? span * 0.98 : 1.28 * sc), Math.max(0.12, hh * 0.22), depth * 0.9 * sc, 0, pal.hurdleTop, 0.4, 0.08 + glow);
      } else if (k === 4) {
        const bottom = q[4];
        const bar = q[3];
        push(0, (bottom + bar * 0.5) * sc + (1 - sc) * 0.2, zc, 5.2 * sc, bar * sc, Math.max(0.22, depth * 0.35), 0, pal.gate, 0.32, 0.45 + glow);
        push(wx(-2.35), bottom * 0.5 * sc, zc, 0.28, bottom * sc, 0.28, 0, pal.gate, 0.4, 0.12);
        push(wx(2.35), bottom * 0.5 * sc, zc, 0.28, bottom * sc, 0.28, 0, pal.gate, 0.4, 0.12);
      } else if (k === 5) {
        const bobc = reduced ? 0 : Math.sin(st.time * 3.2 + q[1]) * 0.08;
        const s = 0.34 * sc;
        push(wx(laneX(lane)), (q[4] + bobc) * sc, zc, s, s, s, 2, pal.coin, 0.12, 0.95);
      } else if (k === 6) {
        push(wx(laneX(lane)), 0.06, zc, Math.max(0.7, q[2]) * sc, 0.1, 0.72 * sc, 0, pal.spring, 0.35, 0.2);
        push(wx(laneX(lane)), 0.28 * sc, zc, 0.32 * sc, 0.32 * sc, 0.32 * sc, 1, pal.spring, 0.3, 0.55);
      } else if (k === 7) {
        const cx = wx(laneX(lane < 0 ? 1 : lane));
        const pot = 1.05 * sc;
        push(cx, 0.28 * sc, zc, pot, 0.5 * sc, pot, 0, pal.pot, 0.42, glow);
        push(cx, 0.62 * sc, zc, pot * 1.05, 0.16 * sc, pot * 1.05, 0, pal.potRim, 0.35, 0.05);
        push(cx, 0.95 * sc, zc, 0.55 * sc, 0.42 * sc, 0.55 * sc, 1, pal.leaf, 0.55, 0.08);
      }
    }

    if (st.event === "coin") burst(rx, py + 0.9, pz, pal.coin, 8, 0.05);
    if (st.event === "spring") burst(rx, py + 0.4, pz, pal.spring, 8, 0.08);
    if (st.near) burst(rx, py + 0.7, pz + 0.4, pal.sun, 6, 0.02);
    if (land > 0.85) burst(rx, 0.15, pz, pal.path, 4, 0.01);
    if (st.reject) burst(rx, 1.6, pz + 2, pal.flower, 10, 0.06);

    const air = py > 0.08;
    const sliding = st.slide > 0;
    const freq = reduced || !alive ? 0 : (9.2 + speed * 0.35);
    const swing = Math.sin((st.time || 0) * freq);
    const stride = Math.cos((st.time || 0) * freq);
    const squash = !alive ? 1 : air ? 1.14 : 1 - land * 0.16;
    const widen = !alive ? 1 : air ? 0.9 : 1 + land * 0.12;
    const leanX = reduced ? 0 : lean * 0.35;
    const blink = st.stumble > 0.05 && !reduced && Math.sin((st.time || 0) * 28) > 0.15;
    if (alive && !blink) {
      push(rx, 0.02, pz, sliding ? 0.95 : 0.62, 0.025, sliding ? 0.9 : 0.5, 0, [0.18, 0.12, 0.08], 1, 0);
      if (!sliding) {
        const leg = air ? -0.12 : swing * 0.32;
        push(wx(px - 0.16) + leanX, py + 0.22, pz + leg, 0.14, 0.4, 0.15, 0, pal.bodyDeep, 0.45, 0.02);
        push(wx(px + 0.16) + leanX, py + 0.22, pz - leg, 0.14, 0.4, 0.15, 0, pal.bodyDeep, 0.45, 0.02);
      }
      const torsoY = py + (sliding ? 0.3 : 0.5 * squash);
      const torso = sliding ? 0.52 : 0.46 * widen;
      push(rx + leanX, torsoY, pz, torso, sliding ? 0.3 : 0.42 * squash, sliding ? 0.62 : 0.4, 0, pal.body, 0.35, 0.14);
      push(rx + (reduced ? 0 : stride * 0.04), torsoY - 0.02, pz - 0.28, 0.1, 0.08, 0.22, 0, pal.cape, 0.2, 0.9);
      const hy = torsoY + (sliding ? 0.16 : 0.34 * squash);
      const hz = pz + (sliding ? 0.16 : 0);
      push(rx + leanX * 0.2, hy, hz, sliding ? 0.32 : 0.44, sliding ? 0.26 : 0.4, sliding ? 0.3 : 0.4, 1, pal.head, 0.2, 0.28);
      if (!sliding) {
        const flame = reduced ? 0 : Math.sin(st.time * 11) * 0.035;
        push(rx + leanX * 0.15, hy + 0.32 + flame + pulse * 0.05, hz - 0.02, 0.13, 0.3, 0.13, 1, pal.cape, 0.12, 1);
      }
      const trailN = reduced ? 0 : Math.min(6, 3 + Math.floor(Math.max(0, speed - 5)));
      for (let t = 1; t <= trailN; t++) {
        const fade = 1 - t / (trailN + 1);
        const s = 0.12 * fade;
        push(rx - lean * 0.1 * t, 0.35 + fade * 0.15, pz - 0.45 - t * (0.28 + speed * 0.02), s, s, s, 2, pal.cape, 0.15, 0.35 + fade * 0.5);
      }
    } else if (!alive) {
      const rest = 0.22 + (reduced ? 0 : Math.sin(st.time * 2) * 0.03);
      push(rx, 0.04, pz, 0.7, 0.03, 0.55, 0, [0.15, 0.1, 0.08], 1, 0);
      push(rx, rest, pz, 0.36, 0.36, 0.36, 1, pal.cape, 0.2, 0.9);
      push(rx, rest + 0.28, pz, 0.14, 0.22, 0.14, 1, pal.sun, 0.15, 1);
    }

    for (let i = 0; i < 36; i++) {
      const o = i * 8;
      const life = sparks[o + 6];
      if (life <= 0) continue;
      sparks[o] += sparks[o + 3] * 0.045;
      sparks[o + 1] += sparks[o + 5] + 0.012;
      sparks[o + 2] += sparks[o + 4] * 0.045;
      sparks[o + 5] *= 0.96;
      sparks[o + 6] = life - 0.014;
      const s = 0.08 + life * 0.08;
      const tint = (sparks[o + 7] % 2) ? pal.coin : pal.flower;
      push(sparks[o], sparks[o + 1], sparks[o + 2], s, s, s, 1, tint, 0.2, 0.7);
    }
    if (reject > 0.2 && !reduced && (n < MAX - 4)) {
      const petal = Math.sin(st.time * 3) * 0.4;
      push(rx + petal, 1.8 + reject, pz + 1.5, 0.12, 0.08, 0.12, 1, pal.flower, 0.3, 0.4);
      push(rx - petal, 2.1 + reject * 0.5, pz + 2.2, 0.1, 0.07, 0.1, 1, pal.flower2, 0.3, 0.35);
    }

    gl.useProgram(mesh);
    gl.uniformMatrix4fv(u.proj, false, proj);
    gl.uniformMatrix4fv(u.view, false, view);
    gl.uniform3f(u.eye, eye[0], eye[1], eye[2]);
    gl.uniform3fv(u.fog, pal.fog);
    const lift = floaty + pulse * 0.15;
    const sun = 0.55 + 0.55 * pal.lightAmt;
    gl.uniform3f(u.light, 0.42 * sun + pulse * 0.1, (0.78 + lift) * sun, 0.28 * sun);
    gl.uniform1f(u.mtime, st.time || 0);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * STRIDE));
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, n);
    return n;
  }

  return { gl, resize, frame };
}
