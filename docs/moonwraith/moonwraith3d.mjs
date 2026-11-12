// Zeref the Moonwraith in 3D on the Pages chat: the sculpted body from
// The Beast Box (public/creatures3d/zeref.glb), animated with SIMULATED
// motion planned from his recorded state — see motion.mjs. No Math.random.
// A 2D portrait of the same art is the fallback when WebGL cannot run.
import * as THREE from '../robot/vendor/three.module.min.js';
import { OrbitControls } from '../robot/vendor/OrbitControls.js';
import { GLTFLoader } from '../robot/vendor/GLTFLoader.js';
import { RoomEnvironment } from '../robot/vendor/RoomEnvironment.js';
import { loadLive, planFromLive, livePose, applyReaction, ZERO_POSE } from './motion.mjs';
import { tickDance, applyDanceCSS, dancePose, DANCE_CAPTION } from './dance.mjs';
import { applyCosmic, makeQualityGuard } from './cosmic.mjs';
import { makeCosmicParticles, makeSignalRing, ensureSignalReadout } from './particles.mjs';
import { applyEyes, ensureExpressionLegend } from './expression.mjs';
import { makeWorld, WORLD_CAPTION } from './world.mjs';

const san = (n) => String(n).replace(/\s/g, '_').replace(/[\[\]\.:\/]/g, '');

const PHASE_HOLD = { listen: 0.6, think: Infinity, reply: 2.4, error: 1.8, idle: 0 };

export async function mount(el, {
  url = new URL('./zeref.glb', import.meta.url).href,
  onStatus = () => {},
  shadows = null,
  fixedTime = null,
  live = null,
  plan = null,
  reducedMotion = false,
} = {}) {
  if (!plan) {
    const loaded = live ? { live, url: 'provided' } : await loadLive();
    plan = await planFromLive(loaded.live || {});
  }

  const narrow = (el.clientWidth || window.innerWidth || 393) < 600;
  if (shadows == null) shadows = !narrow && !((navigator.deviceMemory || 8) < 4);

  const renderer = new THREE.WebGLRenderer({ antialias: !narrow, alpha: true, preserveDrawingBuffer: fixedTime !== null, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(narrow ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = shadows;
  if (shadows) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.append(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(28, 1, 0.02, 20);

  scene.add(new THREE.HemisphereLight(0xd0c6ff, 0x1a1030, 0.8));
  const key = new THREE.DirectionalLight(0xfff4ff, 2.0);
  key.position.set(0.45, 1.1, 0.7);
  key.castShadow = shadows;
  if (shadows) {
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -0.45, right: 0.45, top: 0.55, bottom: -0.1, near: 0.1, far: 3 });
    key.shadow.bias = -0.0004;
  }
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8fe8ff, 0.62); fill.position.set(-0.6, 0.3, 0.4); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xc084fc, 1.65); rim.position.set(-0.5, 0.5, -0.8); scene.add(rim);
  const magRim = new THREE.DirectionalLight(0xff4da6, 0.35); magRim.position.set(0.6, 0.2, -0.4); scene.add(magRim);
  // Soft moonlight from the visible moon (upper-right, slightly behind).
  const moonLight = new THREE.DirectionalLight(0xb8d8ff, 0.4); moonLight.position.set(1.5, 1.6, -2.0); scene.add(moonLight);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(0.55, 48), new THREE.ShadowMaterial({ opacity: 0.32 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = shadows;
  scene.add(ground);

  onStatus('loading his Moonwraith body…');
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  scene.add(model);

  const bones = {};
  const meshes = [];
  model.traverse((o) => {
    if (o.isBone || o.type === 'Bone' || o.name) {
      const k = san(o.name);
      if (!bones[k]) bones[k] = o;
    }
    if (o.isMesh) {
      o.castShadow = shadows;
      o.receiveShadow = shadows && !o.material.transparent;
      if (o.morphTargetDictionary) meshes.push(o);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        // Keep the sculpted materials; lift the gem / moon / eyes a little so they read on a small phone.
        if (/gem|moon|eye|glow|catch/i.test(m.name || o.name || '')) {
          if ('emissiveIntensity' in m && m.emissiveIntensity < 1.2) m.emissiveIntensity = Math.max(m.emissiveIntensity, 1.15);
        }
      }
    }
  });

  const bone = (n) => bones[san(n)];
  const named = {
    root: bone('root'),
    spine: bone('spine'),
    chest: bone('chest'),
    neck: bone('neck'),
    head: bone('head'),
    ear0L: bone('ear.0.L'),
    ear1L: bone('ear.1.L'),
    ear0R: bone('ear.0.R'),
    ear1R: bone('ear.1.R'),
    wing0L: bone('wing.0.L'),
    wing1L: bone('wing.1.L'),
    wing2L: bone('wing.2.L'),
    wing0R: bone('wing.0.R'),
    wing1R: bone('wing.1.R'),
    wing2R: bone('wing.2.R'),
    tail0: bone('tail.0'),
    tail1: bone('tail.1'),
    tail2: bone('tail.2'),
    tail3: bone('tail.3'),
    tail4: bone('tail.4'),
    legL: bone('leg.L'),
    legR: bone('leg.R'),
    pawL: bone('paw.L'),
    pawR: bone('paw.R'),
  };
  const bind = new Map();
  for (const b of Object.values(named)) {
    if (!b) continue;
    bind.set(b, { q: b.quaternion.clone(), p: b.position.clone(), s: b.scale.clone() });
  }

  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Sit the shadow under the paws; aim the camera at the face (upper third).
  ground.position.y = box.min.y + 0.002;
  const face = new THREE.Vector3(center.x, box.min.y + size.y * 0.52, center.z);
  const radius = Math.max(size.y, size.x, size.z) * 2.05;
  const camHeight = face.y + size.y * 0.10;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.copy(face);
  // Phones: don't steal the vertical scroll. Desktop can drag to turn him.
  const fine = window.matchMedia('(pointer:fine)').matches;
  controls.enableRotate = fine;
  if (!fine) controls.enableRotate = false;

  let userOrbit = false;
  controls.addEventListener('start', () => { userOrbit = true; });
  function placeCamera(yaw, bob = 0) {
    camera.position.set(face.x + Math.sin(yaw) * radius, camHeight + bob, face.z + Math.cos(yaw) * radius);
    camera.lookAt(face);
    controls.target.copy(face);
    controls.update();
  }
  const homeYaw = 0.32;
  placeCamera(homeYaw);

  const seedHex = (plan && plan.digest_hex) || 'zeref';
  const startQ = narrow ? 'med' : 'high';
  const cosmic = applyCosmic(THREE, model, { seedHex, quality: startQ, head: named.head });
  const particles = makeCosmicParticles(THREE, model, { seedHex, quality: startQ });
  const ring = makeSignalRing(THREE, model, { quality: startQ });
  const world = makeWorld(THREE, {
    seedHex,
    quality: startQ,
    origin: { x: center.x, y: box.min.y, z: center.z },
    reducedMotion,
  });
  scene.add(world.group);
  if (live) world.setLive(live);
  const watchQuality = makeQualityGuard({
    setQuality(q) {
      cosmic.setQuality(q);
      particles.setQuality(q);
      ring.setQuality(q);
      world.setQuality(q);
    },
  }, { start: startQ, narrow });
  ensureSignalReadout(el);
  let expr = (plan && plan.expression) || null;
  if (expr) {
    applyEyes(model, expr, { cosmic });
    const legendHost = el.parentElement || el;
    ensureExpressionLegend(legendHost, expr);
  }


  const eul = new THREE.Euler();
  const quat = new THREE.Quaternion();
  function addLocal(b, x, y, z) {
    if (!b || !bind.has(b)) return;
    eul.set(x, y, z);
    b.quaternion.copy(bind.get(b).q).multiply(quat.setFromEuler(eul));
  }

  function applyPose(pose) {
    const breath = pose.breath == null ? 0.5 : pose.breath;
    const br = 1 + 0.06 * (breath * 2 - 1);
    // When physics is driving the body, drop the old pose-target squash
    // (it was stacking and flattening him). Remaining scale stays in 0.9–1.1.
    const rawSq = pose.joints ? 0 : (pose.squash || 0);
    const sq = Math.max(-0.18, Math.min(0.18, rawSq));
    const clampS = (v) => Math.max(0.9, Math.min(1.1, v));
    const sx = clampS(br * (1 + 0.08 * sq));
    const sy = clampS(br * (1 - 0.08 * sq));
    if (named.spine && bind.has(named.spine)) {
      const s = bind.get(named.spine).s;
      named.spine.scale.set(s.x * sx, s.y * sy, s.z * sx);
    }
    if (named.chest && bind.has(named.chest)) {
      const s = bind.get(named.chest).s;
      const cx = clampS(1 + 0.035 * (breath * 2 - 1) + 0.06 * sq);
      named.chest.scale.set(s.x * cx, s.y * clampS(1 - 0.06 * sq), s.z * cx);
    }
    if (named.root && bind.has(named.root)) {
      const b = bind.get(named.root);
      named.root.position.copy(b.p);
      named.root.position.y += pose.hop || 0;
      named.root.position.z += (pose.lean || 0);
      named.root.position.x += pose.driftX || 0;
      const spin = pose.spin || 0;
      eul.set(0, spin, (pose.lean || 0) * 0.8);
      named.root.quaternion.copy(b.q).multiply(quat.setFromEuler(eul));
      named.root.scale.set(b.s.x * clampS(1 + 0.05 * sq), b.s.y * clampS(1 - 0.05 * sq), b.s.z * clampS(1 + 0.05 * sq));
    }
    if (pose.joints) {
      // Physics-integrated joint angles (forces in, spring-damper out).
      for (const [name, e] of Object.entries(pose.joints)) {
        if (named[name]) addLocal(named[name], e[0] || 0, e[1] || 0, e[2] || 0);
      }
    } else {
    // Neck/head split so a turn doesn't crease (same idea as the Beast Box driver).
    const nod = pose.headPitch || 0;
    const yawH = pose.headYaw || 0;
    const tilt = pose.headRoll || 0;
    if (named.neck && named.head) {
      addLocal(named.neck, nod * 0.35, yawH * 0.4, tilt * 0.3);
      addLocal(named.head, nod * 0.65, yawH * 0.6, tilt * 0.7);
    } else {
      addLocal(named.head, nod, yawH, tilt);
    }
    addLocal(named.ear0L, -(pose.earL || 0) * 0.65, 0, (pose.earL || 0) * 0.42);
    addLocal(named.ear0R, -(pose.earR || 0) * 0.65, 0, -(pose.earR || 0) * 0.42);
    addLocal(named.ear1L, -(pose.earTipL || 0) * 0.8, 0, (pose.earTipL || 0) * 0.5);
    addLocal(named.ear1R, -(pose.earTipR || 0) * 0.8, 0, -(pose.earTipR || 0) * 0.5);
    const w = Math.max(-1.7, Math.min(1.7, pose.wing || 0));
    const spread = Math.max(-0.6, Math.min(0.9, pose.wingSpread || 0));
    const tip = Math.max(-1.4, Math.min(1.4, pose.wingTip || 0));
    addLocal(named.wing0L, 0.06 * w, -0.1 * w - 0.18 * spread, -w - 0.35 * spread);
    addLocal(named.wing1L, 0, -0.08 * spread, -w * 0.55 - 0.2 * spread);
    addLocal(named.wing2L, tip * 0.15, 0, -tip * 0.7);
    addLocal(named.wing0R, 0.06 * w, 0.1 * w + 0.18 * spread, w + 0.35 * spread);
    addLocal(named.wing1R, 0, 0.08 * spread, w * 0.55 + 0.2 * spread);
    addLocal(named.wing2R, tip * 0.15, 0, tip * 0.7);
    const tw = Math.max(-1.8, Math.min(1.8, pose.tail || 0));
    const tipT = Math.max(-1.6, Math.min(1.6, pose.tailTip || 0));
    const wave = pose.tailWave || 0;
    addLocal(named.tail0, 0.05 * tw + wave * 0.15, tw * 0.45 + wave * 0.35, 0);
    addLocal(named.tail1, wave * 0.1, tw * 0.55 + wave * 0.5, 0);
    addLocal(named.tail2, 0, tw * 0.7 + wave * 0.7, wave * 0.08);
    addLocal(named.tail3, 0, tw * 0.5 + tipT * 0.55 + wave * 0.85, tipT * 0.15);
    addLocal(named.tail4, 0, tw * 0.35 + tipT * 0.85 + wave * 1.05, tipT * 0.25);
    addLocal(named.chest, pose.chestPitch || 0, pose.chestYaw || 0, 0);
    addLocal(named.spine, pose.spinePitch || 0, pose.spineYaw || 0, pose.spineRoll || 0);
    addLocal(named.legL, (pose.legL || 0) * 0.7, 0, 0);
    addLocal(named.legR, (pose.legR || 0) * 0.7, 0, 0);
    addLocal(named.pawL, (pose.pawL || 0) * 0.5, 0, 0);
    addLocal(named.pawR, (pose.pawR || 0) * 0.5, 0, 0);
    }

    const weights = {
      blink: Math.min(1, Math.max(0, pose.blink || 0)),
      happy: Math.min(1, Math.max(0, pose.happy || 0)),
      scared: Math.min(1, Math.max(0, pose.scared || 0)),
      curious: Math.min(1, Math.max(0, pose.curious || 0)),
      sleepy: Math.min(1, Math.max(0, pose.sleepy || 0)),
      mouth_grin: Math.min(1, Math.max(0, pose.grin || 0)),
      mouth_smile: Math.min(1, Math.max(0, pose.smile || 0)),
      mouth_o: Math.min(1, Math.max(0, pose.mouthO || 0)),
      brows_up: Math.min(1, Math.max(0, pose.browsUp || 0)),
    };
    for (const mesh of meshes) {
      for (const [name, wgt] of Object.entries(weights)) {
        const i = mesh.morphTargetDictionary[name];
        if (i !== undefined) mesh.morphTargetInfluences[i] = wgt;
      }
    }
  }

  let phase = 'idle';
  let phaseAmt = 0;
  let phaseAge = 0;
  let lastLabel = '';
  const clock = new THREE.Clock();
  let raf = 0, visible = true;

  function compose(t) {
    const sig = tickDance();
    applyDanceCSS(el, sig);
    const chatWins = phase !== 'idle' && phaseAmt > 0.25;
    if (reducedMotion) return { ...ZERO_POSE, ...(plan.rest || {}), breath: 0.5 };
    // While the song is playing, the live audio drives the entire body —
    // chat reactions wait until the music stops.
    if (sig && sig.playing) return dancePose(plan.rest, sig);
    if (sig && sig.active && !chatWins) return dancePose(plan.rest, sig);
    let pose = livePose(plan, t);
    const reaction = plan.reactions && plan.reactions[phase];
    if (reaction && phaseAmt > 0.001) pose = applyReaction(pose, reaction, phaseAmt);
    return pose;
  }

  function frame(dt) {
    const t = fixedTime !== null ? fixedTime : clock.getElapsedTime();
    if (!reducedMotion && phase !== 'idle') {
      const hold = PHASE_HOLD[phase] ?? 0;
      phaseAge += dt;
      const target = 1;
      phaseAmt += (target - phaseAmt) * Math.min(1, dt * 8);
      if (hold !== Infinity && phaseAge > hold) {
        // Ease back to idle after a reply or a brief listen/error.
        const u = Math.min(1, (phaseAge - hold) / 0.7);
        phaseAmt = 1 - u;
        if (u >= 1) { phase = 'idle'; phaseAmt = 0; phaseAge = 0; }
      }
    } else if (phaseAmt > 0) {
      phaseAmt = Math.max(0, phaseAmt - dt * 4);
    }
    const pose = compose(t);
    applyPose(pose);
    const sig = tickDance(); // same-frame no-op if compose just ticked
    const chatWins = phase !== 'idle' && phaseAmt > 0.25;
    const songOn = !!(sig && sig.playing) && !reducedMotion;
    const dancing = (songOn || (!!(sig && sig.active) && !chatWins)) && !reducedMotion;
    const musicClock = songOn ? (sig.musicPhase || t) : t;
    cosmic.update(musicClock, songOn ? sig : (dancing ? sig : null));
    particles.update(musicClock, sig, { reducedMotion, wallTime: t });
    ring.update(t, sig);
    if (expr) applyEyes(model, expr, {
      flare: dancing && sig ? (sig.flare || sig.high || 0) : 0,
      pulse: songOn && sig ? ((sig.bass || 0) * 0.55 + (sig.loud || 0) * 0.65 + (sig.kick || 0) * 0.3 + (sig.kickHit || 0) * 0.35) : 0,
      cosmic,
    });
    watchQuality(dt);
    const yawSway = reducedMotion || dancing ? 0 : 0.14 * Math.sin(t * 0.42);
    const bob = (!userOrbit && songOn) ? (pose.camBob || 0) : 0;
    if (!userOrbit) placeCamera(homeYaw + yawSway + (pose.headYaw || 0) * 0.15, bob);
    else controls.update();
    world.update(t, sig, {
      reducedMotion,
      camYaw: homeYaw + yawSway + (pose.headYaw || 0) * 0.15,
      camBob: bob,
      dt,
    });
    const label = (dancing ? DANCE_CAPTION : (plan.caption + (phase !== 'idle' ? ' · ' + phase : ''))) + ' · ' + WORLD_CAPTION;
    if (label !== lastLabel) { onStatus(label); lastLabel = label; }
    renderer.render(scene, camera);
  }

  function resize() {
    const w = el.clientWidth || 360, hh = el.clientHeight || 270;
    renderer.setSize(w, hh, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / Math.max(1, hh);
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(el);

  const loop = () => { raf = 0; if (!visible || document.hidden) return; frame(Math.min(0.05, clock.getDelta())); raf = requestAnimationFrame(loop); };
  const kick = () => { if (!raf && fixedTime === null) raf = requestAnimationFrame(loop); };
  new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); kick(); }).observe(el);
  document.addEventListener('visibilitychange', kick);
  if (fixedTime !== null) frame(0); else kick();

  return {
    plan,
    setLive(nextLive, nextExpr) {
      if (nextLive) world.setLive(nextLive);
      if (nextExpr) {
        expr = nextExpr;
        const legendHost = el.parentElement || el;
        ensureExpressionLegend(legendHost, expr);
      }
    },
    setPhase(next) {
      const p = String(next || 'idle');
      if (p === phase && p !== 'idle') return;
      phase = p;
      phaseAge = 0;
      if (p === 'idle') return;
      // Keep a little of the current blend so a listen→think handoff doesn't pop.
      if (phaseAmt < 0.2) phaseAmt = 0.2;
    },
    get phase() { return phase; },
    renderAt(t, nextPhase, amount) {
      if (nextPhase) { phase = nextPhase; phaseAmt = amount == null ? 1 : amount; phaseAge = 0; }
      fixedTime = t;
      frame(0);
    },
    dispose() {
      cancelAnimationFrame(raf);
      renderer.dispose();
      renderer.domElement.remove();
    },
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
