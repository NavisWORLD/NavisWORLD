// Zeref Spark in 3D: the companion robot CAD from The Beast Box ("beast spark robot", CAD v0.2,
// Apache-2.0, CONCEPT DESIGN / NOT BUILT HARDWARE), packed unchanged into zeref-spark.glb.
// What moves is what the design really has: the split shells open on their y=0 seam to show the
// internals (ESP32-S3 cradle, sensor sled, battery tray), the eye / ear / chest LED rings pulse,
// and the crystal-reading station cycles its white / 365 nm UV / 940 nm IR LEDs (GPIO 1 / 2 / 21).
// The limbs are static in the design, so they stay still. Every motion is a pure function of time:
// no randomness, same loop every visit.
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { toCreasedNormals } from './vendor/BufferGeometryUtils.js';

export const LOOP = 16;              // seconds per assemble -> open -> close loop
const STATION = [['white', 0xffffff], ['UV 365 nm', 0x8a2cff], ['IR 940 nm', 0x7a0018]];
const ease = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

/** Opening amount 0..1 at loop time t (s): closed, open, hold, close. */
export function openAt(t) {
  const u = ((t % LOOP) + LOOP) % LOOP;
  if (u < 4) return 0;
  if (u < 7) return ease((u - 4) / 3);
  if (u < 11) return 1;
  if (u < 14) return 1 - ease((u - 11) / 3);
  return 0;
}
/** Station LED channel index at time t (2 s each). */
export function stationAt(t) { return Math.floor((((t % 6) + 6) % 6) / 2); }

export async function mount(el, { url = new URL('./zeref-spark.glb', import.meta.url).href, onStatus = () => {}, shadows = true, fixedTime = null } = {}) {
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
  const parts = [], glows = [];
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
  // centre on the pedestal, sitting on the ground
  const box = new THREE.Box3().setFromObject(model);
  model.position.sub(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
  const h = box.max.y - box.min.y;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, h * 0.55, 0);
  controls.enableDamping = true; controls.minDistance = 0.18; controls.maxDistance = 1.4;
  controls.autoRotate = fixedTime === null; controls.autoRotateSpeed = 1.2;
  controls.update();

  // opening vectors in CAD millimetres (node space under the root): shells split at y=0 go apart on y,
  // the head lifts off the torso, everything else drifts out a little from the model centre
  const all = new THREE.Box3();
  const centres = new Map();
  for (const n of model.children[0].children) {
    const b = new THREE.Box3().setFromBufferAttribute(n.children.length ? n.children[0].geometry.attributes.position : n.geometry.attributes.position);
    const c = b.getCenter(new THREE.Vector3()); centres.set(n, c); all.union(b);
  }
  const mid = all.getCenter(new THREE.Vector3());
  for (const [n, c] of centres) {
    const name = n.name;
    const v = new THREE.Vector3();
    if (/ZS-5/.test(name)) v.set(0, 0, 0);                                  // pedestal + tube stay put
    else {
      if (/shell_front|visor|face_carrier|eye_lightpipe|chest_center_lens|chest_ring|chest_core/.test(name)) v.y = -38;
      else if (/shell_back/.test(name)) v.y = 30;
      else v.y = Math.sign(c.y - mid.y) * 6;
      if (/^ZS-1|ZS-2|PX_led_eye|PX_speaker|PX_lipo|PX_led_ring12_pod/.test(name)) v.z += 34;  // head group lifts
      if (/ZS-2/.test(name)) v.x += Math.sign(c.x - mid.x) * 18;              // ear pods out sideways
      if (/ZS-40/.test(name)) v.x += Math.sign(c.x - mid.x) * 16;             // limbs out on their pegs
    }
    n.userData.home = n.position.clone(); n.userData.open = v;
  }

  let manual = null; // null = follow the loop; 0/1 = user choice
  const clock = new THREE.Clock();
  let raf = 0, visible = true, last = '';
  function frame() {
    const t = fixedTime !== null ? fixedTime : clock.getElapsedTime();
    const k = manual === null ? openAt(t) : manual;
    for (const n of centres.keys()) n.position.copy(n.userData.home).addScaledVector(n.userData.open, k);
    const pulse = 0.75 + 0.25 * Math.sin(t * 2 * Math.PI / 3.2);
    for (const g of glows) g.material.emissive.copy(g.userData.baseEmissive).multiplyScalar(g.name.startsWith('PX_led_') && g.name.match(/white|uv|ir/) ? 0.05 : pulse * 1.6);
    const s = stationAt(t);
    if (crystal) { crystal.material.emissive.setHex(STATION[s][1]); crystal.material.emissiveIntensity = 0.9; }
    for (const g of glows) if (/PX_led_(white|uv365|ir940)/.test(g.name)) g.material.emissiveIntensity = g.name.includes(['white', 'uv365', 'ir940'][s]) ? 30 : 0.02;
    const label = `station LED: ${STATION[s][0]} · shells ${k > 0.98 ? 'open' : k < 0.02 ? 'closed' : 'moving'}`;
    if (label !== last) { onStatus(label); last = label; }
    controls.update();
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
    toggle() { manual = manual === null ? (openAt(clock.getElapsedTime()) > 0.5 ? 0 : 1) : manual === 1 ? 0 : 1; controls.autoRotate = false; return manual; },
    follow() { manual = null; controls.autoRotate = true; },
    renderAt(t, angle) { const r = Math.hypot(camera.position.x, camera.position.z); camera.position.x = Math.sin(angle) * r; camera.position.z = Math.cos(angle) * r; controls.update(); const kk = openAt(t); for (const n of centres.keys()) n.position.copy(n.userData.home).addScaledVector(n.userData.open, kk); fixedTime = t; frame(); },
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
