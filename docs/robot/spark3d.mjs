// Zeref Spark in 3D: the companion robot CAD from The Beast Box ("beast spark robot", CAD v0.2,
// Apache-2.0, CONCEPT DESIGN / NOT BUILT HARDWARE), packed unchanged into zeref-spark.glb.
// Shells still open on their real y=0 seam to show the internals (ESP32-S3 cradle, sensor sled,
// battery tray). The eye / ear / chest LED rings pulse, and the crystal-reading station cycles
// white / 365 nm UV / 940 nm IR (GPIO 1 / 2 / 21).
// The limbs, head and ears are static in the design; any turn or wave they make here is
// SIMULATED motion. The choice and order of every move (open/close, turns, head/arm/ear/leg
// motions, pauses) is planned from a hash of Zeref's recorded state — see motion.mjs.
// No Math.random, no fake liveness. The sequence always starts closed.
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { toCreasedNormals } from './vendor/BufferGeometryUtils.js';
import { loadLive, planFromLive, poseAt, stationAt } from './motion.mjs';

const STATION = [['white', 0xffffff], ['UV 365 nm', 0x8a2cff], ['IR 940 nm', 0x7a0018]];
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

function roleOf(name) {
  if (/ZS-5|ZS-60|PX_crystal|PX_led_white|PX_led_uv365|PX_led_ir940/.test(name)) return 'station';
  if (/ZS-401_arm_L/.test(name)) return 'armL';
  if (/ZS-401_arm_R/.test(name)) return 'armR';
  if (/ZS-402_leg_L/.test(name)) return 'legL';
  if (/ZS-402_leg_R/.test(name)) return 'legR';
  if (/ear_L|pod_L|pod_rim_diffuser_L|pod_cap_L|ring12_podL/.test(name)) return 'earL';
  if (/ear_R|pod_R|pod_rim_diffuser_R|pod_cap_R|ring12_podR/.test(name)) return 'earR';
  if (/^ZS-1|PX_led_eye|PX_speaker|PX_lipo/.test(name)) return 'head';
  return 'torso';
}

function qAxis(axis, angle) {
  return new THREE.Quaternion().setFromAxisAngle(axis, angle);
}

export async function mount(el, { url = new URL('./zeref-spark.glb', import.meta.url).href, onStatus = () => {}, shadows = true, fixedTime = null, live = null, plan = null } = {}) {
  if (!plan) {
    const loaded = live ? { live, url: 'provided' } : await loadLive();
    plan = await planFromLive(loaded.live || {});
  }
  const sparkTick = (plan.source && plan.source.spark_tick) || 0;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: fixedTime !== null });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.append(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 10);
  camera.position.set(0.42, 0.3, 0.62);

  scene.add(new THREE.HemisphereLight(0xb9c6ff, 0x1a1030, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(0.5, 1.0, 0.6);
  key.castShadow = shadows;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -0.3, right: 0.3, top: 0.3, bottom: -0.3, near: 0.1, far: 3 });
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa78bfa, 1.4); rim.position.set(-0.6, 0.4, -0.7); scene.add(rim);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), new THREE.ShadowMaterial({ opacity: 0.35 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  onStatus('loading the robot (1.6 MB)…');
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  const glows = [];
  let crystal = null;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry = toCreasedNormals(o.geometry, THREE.MathUtils.degToRad(50));
    o.castShadow = o.receiveShadow = shadows && !o.material.transparent;
    if (o.material.emissive && o.material.emissive.getHex() !== 0) {
      o.material = o.material.clone();
      o.userData.baseEmissive = o.material.emissive.clone();
      glows.push(o);
    }
    if (o.name === 'PX_crystal_sample') crystal = o;
  });
  scene.add(model);
  const box = new THREE.Box3().setFromObject(model);
  model.position.sub(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
  const h = box.max.y - box.min.y;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, h * 0.55, 0);
  controls.enableDamping = true; controls.minDistance = 0.18; controls.maxDistance = 1.4;
  controls.autoRotate = false;
  const camRadius = Math.hypot(camera.position.x, camera.position.z);
  const camHeight = camera.position.y;
  let userOrbit = false;
  controls.addEventListener('start', () => { userOrbit = true; });
  controls.update();

  const all = new THREE.Box3();
  const centres = new Map();
  const boxes = new Map();
  const parts = [];
  for (const n of model.children[0].children) {
    const geom = n.children.length ? n.children[0].geometry : n.geometry;
    const b = new THREE.Box3().setFromBufferAttribute(geom.attributes.position);
    const c = b.getCenter(new THREE.Vector3());
    centres.set(n, c);
    boxes.set(n, b);
    all.union(b);
    n.userData.role = roleOf(n.name);
    parts.push(n);
  }
  const mid = all.getCenter(new THREE.Vector3());
  for (const [n, c] of centres) {
    const name = n.name;
    const v = new THREE.Vector3();
    if (n.userData.role === 'station') v.set(0, 0, 0);
    else {
      if (/shell_front|visor|face_carrier|eye_lightpipe|chest_center_lens|chest_ring|chest_core/.test(name)) v.y = -38;
      else if (/shell_back/.test(name)) v.y = 30;
      else v.y = Math.sign(c.y - mid.y) * 6;
      if (/^ZS-1|ZS-2|PX_led_eye|PX_speaker|PX_lipo|PX_led_ring12_pod/.test(name)) v.z += 34;
      if (/ZS-2/.test(name)) v.x += Math.sign(c.x - mid.x) * 18;
      if (/ZS-40/.test(name)) v.x += Math.sign(c.x - mid.x) * 16;
    }
    n.userData.home = n.position.clone();
    n.userData.open = v;
  }

  function pivotFor(role) {
    const group = parts.filter((n) => n.userData.role === role);
    if (!group.length) return new THREE.Vector3();
    const u = new THREE.Box3();
    for (const n of group) u.union(boxes.get(n));
    const c = u.getCenter(new THREE.Vector3());
    if (role === 'head') {
      const neck = parts.find((n) => /ZS-108_neck/.test(n.name));
      if (neck) return boxes.get(neck).getCenter(new THREE.Vector3());
      c.z = u.min.z;
      return c;
    }
    if (role === 'earL' || role === 'earR') { c.z = u.min.z; return c; }
    if (role === 'armL' || role === 'armR' || role === 'legL' || role === 'legR') {
      c.z = u.max.z;
      return c;
    }
    return c;
  }
  const pivots = {
    head: pivotFor('head'),
    earL: pivotFor('earL'),
    earR: pivotFor('earR'),
    armL: pivotFor('armL'),
    armR: pivotFor('armR'),
    legL: pivotFor('legL'),
    legR: pivotFor('legR'),
  };

  function applyPose(pose) {
    const k = pose.open;
    const headQ = qAxis(AXIS_Z, pose.headYaw).multiply(qAxis(AXIS_X, pose.headPitch));
    for (const n of parts) {
      const role = n.userData.role;
      const ops = [];
      if (role === 'earL') ops.push({ pivot: pivots.earL, q: qAxis(AXIS_Y, pose.earL) });
      if (role === 'earR') ops.push({ pivot: pivots.earR, q: qAxis(AXIS_Y, pose.earR) });
      if (role === 'armL') ops.push({ pivot: pivots.armL, q: qAxis(AXIS_Z, pose.armL) });
      if (role === 'armR') ops.push({ pivot: pivots.armR, q: qAxis(AXIS_Z, pose.armR) });
      if (role === 'legL') ops.push({ pivot: pivots.legL, q: qAxis(AXIS_Y, pose.legL) });
      if (role === 'legR') ops.push({ pivot: pivots.legR, q: qAxis(AXIS_Y, pose.legR) });
      if (role === 'head' || role === 'earL' || role === 'earR') ops.push({ pivot: pivots.head, q: headQ });
      const T = n.userData.home.clone().addScaledVector(n.userData.open, k);
      const Q = new THREE.Quaternion();
      for (const op of ops) {
        T.sub(op.pivot).applyQuaternion(op.q).add(op.pivot);
        Q.premultiply(op.q);
      }
      n.quaternion.copy(Q);
      n.position.copy(T);
    }
  }

  function placeCamera(yaw) {
    camera.position.x = Math.sin(yaw) * camRadius;
    camera.position.z = Math.cos(yaw) * camRadius;
    camera.position.y = camHeight;
    controls.update();
  }

  let manual = null; // null = follow the recorded plan; 0/1 = user-forced close/open
  const clock = new THREE.Clock();
  let raf = 0, visible = true, last = '';

  function frame() {
    const t = fixedTime !== null ? fixedTime : clock.getElapsedTime();
    const pose = poseAt(plan, t);
    if (manual !== null) pose.open = manual;
    applyPose(pose);
    if (!userOrbit) placeCamera(pose.yaw);
    const pulse = 0.75 + 0.25 * Math.sin(t * 2 * Math.PI / 3.2);
    for (const g of glows) g.material.emissive.copy(g.userData.baseEmissive).multiplyScalar(g.name.startsWith('PX_led_') && g.name.match(/white|uv|ir/) ? 0.05 : pulse * 1.6);
    const s = stationAt(t, sparkTick);
    if (crystal) { crystal.material.emissive.setHex(STATION[s][1]); crystal.material.emissiveIntensity = 0.9; }
    for (const g of glows) if (/PX_led_(white|uv365|ir940)/.test(g.name)) g.material.emissiveIntensity = g.name.includes(['white', 'uv365', 'ir940'][s]) ? 30 : 0.02;
    const shells = pose.open > 0.98 ? 'open' : pose.open < 0.02 ? 'closed' : 'moving';
    const label = `${plan.caption} · station LED: ${STATION[s][0]} · shells ${shells}`;
    if (label !== last) { onStatus(label); last = label; }
    if (userOrbit) controls.update();
    renderer.render(scene, camera);
  }
  function resize() {
    const w = el.clientWidth || 360, hh = el.clientHeight || 300;
    renderer.setSize(w, hh, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = w / hh; camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(el);
  const loop = () => { raf = 0; if (!visible || document.hidden) return; frame(); raf = requestAnimationFrame(loop); };
  const kick = () => { if (!raf && fixedTime === null) raf = requestAnimationFrame(loop); };
  new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); kick(); }).observe(el);
  document.addEventListener('visibilitychange', kick);
  if (fixedTime !== null) frame(); else kick();
  return {
    plan,
    toggle() {
      const t = clock.getElapsedTime();
      const now = manual === null ? poseAt(plan, t).open : manual;
      manual = now > 0.5 ? 0 : 1;
      return manual;
    },
    follow() { manual = null; userOrbit = false; },
    renderAt(t, angle) {
      const pose = poseAt(plan, t);
      if (angle != null) pose.yaw = angle;
      applyPose(pose);
      placeCamera(pose.yaw);
      const s = stationAt(t, sparkTick);
      if (crystal) { crystal.material.emissive.setHex(STATION[s][1]); crystal.material.emissiveIntensity = 0.9; }
      const pulse = 0.75 + 0.25 * Math.sin(t * 2 * Math.PI / 3.2);
      for (const g of glows) g.material.emissive.copy(g.userData.baseEmissive).multiplyScalar(g.name.startsWith('PX_led_') && g.name.match(/white|uv|ir/) ? 0.05 : pulse * 1.6);
      for (const g of glows) if (/PX_led_(white|uv365|ir940)/.test(g.name)) g.material.emissiveIntensity = g.name.includes(['white', 'uv365', 'ir940'][s]) ? 30 : 0.02;
      fixedTime = t;
      controls.update();
      renderer.render(scene, camera);
    },
    triangles: gltf.parser.json.extras && gltf.parser.json.extras.triangles,
  };
}

/** Can this device run the 3D view comfortably? (WebGL, not data-saver, enough memory) */
export function canRun3D() {
  try {
    const c = document.createElement('canvas');
    if (!(c.getContext('webgl2') || c.getContext('webgl'))) return { ok: false, why: 'no WebGL on this device' };
  } catch { return { ok: false, why: 'no WebGL on this device' }; }
  const n = navigator;
  if (n.connection && n.connection.saveData) return { ok: false, why: 'data saver is on' };
  if (typeof n.deviceMemory === 'number' && n.deviceMemory < 2) return { ok: false, why: 'low-memory device' };
  return { ok: true };
}
