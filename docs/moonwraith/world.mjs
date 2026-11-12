// A small living world around Zeref on the Pages chat stage: a moonlit
// island, layered parallax sky (midnight / cyan / violet), a few glowing
// crystals and plants, and firefly motes. Motion is SIMULATED. When the
// song plays, sway and pulse come from the real cosmos-audio / dance
// signals (beat, bands, harmonics) and a tiny spring-damper on each
// tuft — no fake beat grid. At idle the same springs are driven by his
// recorded tick and heartbeat (SIMULATED). Seeded with mulberry32 from
// the live-card digest. No Math.random. No new network calls.
import { mulberry32 } from './motion.mjs';

export const WORLD_CAPTION = 'world SIMULATED';
export const WORLD_COUNTS = Object.freeze({
  high: { stars: 140, motes: 16, tufts: 8, nebula: 3 },
  med: { stars: 64, motes: 8, tufts: 5, nebula: 2 },
  low: { stars: 28, motes: 4, tufts: 3, nebula: 1 },
});

function hashInt(hex) {
  const s = String(hex || 'zeref');
  let n = 2166136261;
  for (let i = 0; i < s.length; i++) n = Math.imul(n ^ s.charCodeAt(i), 16777619) >>> 0;
  return n || 1;
}

function softSprite(THREE, inner, mid, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.4, mid);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function paintSky(rng) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#070214');
  sky.addColorStop(0.42, '#14082e');
  sky.addColorStop(0.72, '#1a0b3d');
  sky.addColorStop(1, '#0a2a3a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 512);
  // Nebula blotches — seeded, midnight cyan / violet.
  for (let i = 0; i < 7; i++) {
    const x = rng() * 512, y = rng() * 380 + 20;
    const r = 60 + rng() * 140;
    const neb = g.createRadialGradient(x, y, 0, x, y, r);
    const cyan = rng() > 0.45;
    neb.addColorStop(0, cyan ? 'rgba(80,220,255,0.22)' : 'rgba(160,80,255,0.24)');
    neb.addColorStop(0.45, cyan ? 'rgba(80,120,255,0.10)' : 'rgba(90,30,160,0.12)');
    neb.addColorStop(1, 'rgba(7,2,20,0)');
    g.fillStyle = neb;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Stars
  const n = 180;
  for (let i = 0; i < n; i++) {
    const x = rng() * 512, y = rng() * 512;
    const a = 0.25 + rng() * 0.75;
    const s = rng() < 0.15 ? 1.6 : 0.7 + rng() * 0.7;
    g.fillStyle = rng() < 0.3 ? `rgba(160,230,255,${a})` : `rgba(235,220,255,${a})`;
    g.fillRect(x, y, s, s);
  }
  return c;
}

function stepSpring(s, target, stiffness, zeta, dt) {
  // Semi-implicit Euler, underdamped, same family as physics.mjs.
  const w = Math.sqrt(Math.max(0.0001, stiffness));
  const damp = 2 * zeta * w;
  s.v += ((target - s.x) * stiffness - s.v * damp) * dt;
  s.x += s.v * dt;
  return s.x;
}

/**
 * Build the world around the already-mounted Moonwraith. `origin` is the
 * paw-level point (x, y, z) so the island sits under him without covering
 * his body. Quality steps the draw cost for a 393 px iPhone.
 */
export function makeWorld(THREE, {
  seedHex = 'zeref',
  quality = 'med',
  origin = { x: 0, y: 0, z: 0 },
  reducedMotion = false,
} = {}) {
  const group = new THREE.Group();
  group.name = 'zeref-world';
  const rng = mulberry32(hashInt(seedHex));
  const ox = origin.x || 0, oy = origin.y || 0, oz = origin.z || 0;

  // --- Moonlit island + soft contact shadow (drawn even when shadow maps are off on a phone) ---
  const island = new THREE.Group();
  island.position.set(ox, oy, oz);
  const landMat = new THREE.MeshStandardMaterial({
    color: 0x1a1438, emissive: 0x1a3a55, emissiveIntensity: 0.22,
    roughness: 0.88, metalness: 0.04,
  });
  const land = new THREE.Mesh(new THREE.CircleGeometry(0.72, 40), landMat);
  land.rotation.x = -Math.PI / 2;
  land.receiveShadow = true;
  island.add(land);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.70, 0.035, 8, 40), new THREE.MeshStandardMaterial({
    color: 0x2a2060, emissive: 0x3a5a8a, emissiveIntensity: 0.18, roughness: 0.7,
  }));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.01;
  island.add(lip);
  // Soft contact blob under the paws — does not depend on shadow maps.
  const blobTex = softSprite(THREE, 'rgba(4,0,16,0.55)', 'rgba(4,0,16,0.22)', 'rgba(4,0,16,0)');
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 24),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.85 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.006;
  island.add(blob);
  group.add(island);

  // --- Layered parallax sky ---
  const skyGroup = new THREE.Group();
  const skyCanvas = paintSky(rng);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.needsUpdate = true;
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(6.5, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false }),
  );
  skyGroup.add(sky);
  const nebulaTex = softSprite(THREE, 'rgba(170,120,255,0.85)', 'rgba(60,200,255,0.35)', 'rgba(10,0,30,0)');
  const nebula = [];
  const NEB = [
    { c: [0.55, 0.35, 1], p: [-1.8, 1.15, -2.4], s: 2.6 },
    { c: [0.2, 0.85, 1], p: [2.0, 0.85, -2.1], s: 2.2 },
    { c: [0.7, 0.25, 0.95], p: [0.2, 1.45, -2.6], s: 1.8 },
  ];
  for (let i = 0; i < NEB.length; i++) {
    const n = NEB[i];
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: nebulaTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        color: new THREE.Color(n.c[0], n.c[1], n.c[2]), opacity: 0.55, side: THREE.DoubleSide,
      }),
    );
    m.position.set(ox + n.p[0], oy + n.p[1], oz + n.p[2]);
    m.scale.setScalar(n.s);
    m.userData.home = m.position.clone();
    m.userData.par = 0.18 + i * 0.08;
    nebula.push(m);
    skyGroup.add(m);
  }
  // Star field (points) in a shell, for a little extra twinkle on top of the sky texture.
  const starMax = WORLD_COUNTS.high.stars;
  const starPos = new Float32Array(starMax * 3);
  const starCol = new Float32Array(starMax * 3);
  for (let i = 0; i < starMax; i++) {
    const u = rng(), v = rng();
    const th = u * Math.PI * 2;
    const ph = Math.acos(2 * v - 1);
    const r = 5.4 + rng() * 0.6;
    starPos[i * 3] = ox + r * Math.sin(ph) * Math.cos(th);
    starPos[i * 3 + 1] = oy + Math.abs(r * Math.cos(ph)) * 0.85 + 0.4;
    starPos[i * 3 + 2] = oz + r * Math.sin(ph) * Math.sin(th);
    const cool = rng() > 0.35;
    const a = 0.55 + rng() * 0.45;
    starCol[i * 3] = (cool ? 0.7 : 1) * a;
    starCol[i * 3 + 1] = (cool ? 0.9 : 0.88) * a;
    starCol[i * 3 + 2] = a;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 0.035, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.9, sizeAttenuation: true,
  }));
  skyGroup.add(stars);
  // Soft moon disc (upper-right, behind him) — the rim light in the 3D
  // scene is aimed from roughly this direction.
  const moonTex = softSprite(THREE, 'rgba(255,255,245,1)', 'rgba(200,220,255,0.65)', 'rgba(120,160,255,0)');
  const moon = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: moonTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      color: 0xe8f0ff, opacity: 0.95, side: THREE.DoubleSide,
    }),
  );
  moon.position.set(ox + 1.55, oy + 1.55, oz - 2.15);
  moon.scale.setScalar(0.9);
  moon.userData.home = moon.position.clone();
  skyGroup.add(moon);
  group.add(skyGroup);

  // --- Glowing crystals / plants along the island rim (sides and back, not over the body) ---
  const tufts = [];
  const TUFT_ANG = [2.55, 3.14, 3.72, 4.28, -2.55, -0.95, 2.85, 4.55];
  for (let i = 0; i < TUFT_ANG.length; i++) {
    const ang = TUFT_ANG[i];
    const rad = 0.46 + (rng() * 0.16);
    const kind = i % 3;
    const h = 0.07 + rng() * 0.10;
    const gtu = new THREE.Group();
    const x = ox + Math.cos(ang) * rad;
    const z = oz + Math.sin(ang) * rad;
    gtu.position.set(x, oy + 0.01, z);
    if (kind === 0) {
      const cry = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.035 + rng() * 0.02, 0),
        new THREE.MeshStandardMaterial({
          color: 0xa78bfa, emissive: 0x67e8f9, emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.2,
          transparent: true, opacity: 0.95,
        }),
      );
      cry.position.y = h * 0.55;
      cry.rotation.z = 0.15;
      gtu.add(cry);
    } else {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.009, h, 5),
        new THREE.MeshStandardMaterial({ color: 0x1e3a4a, emissive: 0x14304a, emissiveIntensity: 0.3, roughness: 0.8 }),
      );
      stem.position.y = h * 0.5;
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.018 + rng() * 0.01, 8, 6),
        new THREE.MeshStandardMaterial({
          color: kind === 1 ? 0x67e8f9 : 0xe879f9, emissive: kind === 1 ? 0x67e8f9 : 0xc084fc,
          emissiveIntensity: 0.95, roughness: 0.35, transparent: true, opacity: 0.92,
        }),
      );
      bulb.position.y = h + 0.012;
      gtu.add(stem);
      gtu.add(bulb);
    }
    gtu.userData.spring = { x: 0, v: 0 };
    gtu.userData.phase = rng() * Math.PI * 2;
    gtu.userData.stiff = 28 + rng() * 18;
    gtu.userData.base = gtu.rotation.z;
    tufts.push(gtu);
    island.add(gtu);
  }

  // --- Firefly motes ---
  const moteMax = WORLD_COUNTS.high.motes;
  const motePos = new Float32Array(moteMax * 3);
  const moteHome = [];
  const moteSpring = [];
  for (let i = 0; i < moteMax; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 0.25 + rng() * 0.55;
    const y = oy + 0.06 + rng() * 0.28;
    const x = ox + Math.cos(ang) * rad;
    const z = oz + Math.sin(ang) * rad * 0.85;
    moteHome.push({ x, y, z, phase: rng() * Math.PI * 2, lift: 0.02 + rng() * 0.04 });
    moteSpring.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    motePos[i * 3] = x; motePos[i * 3 + 1] = y; motePos[i * 3 + 2] = z;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({
    map: softSprite(THREE, 'rgba(200,255,255,1)', 'rgba(120,200,255,0.55)', 'rgba(40,0,80,0)'),
    size: 0.055, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85, sizeAttenuation: true,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  group.add(motes);

  let live = {};
  let qName = quality;
  let counts = WORLD_COUNTS[quality] || WORLD_COUNTS.med;

  function applyQuality(q) {
    qName = q;
    counts = WORLD_COUNTS[q] || WORLD_COUNTS.med;
    if (stars.geometry.setDrawRange) stars.geometry.setDrawRange(0, counts.stars);
    if (motes.geometry.setDrawRange) motes.geometry.setDrawRange(0, counts.motes);
    for (let i = 0; i < tufts.length; i++) tufts[i].visible = i < counts.tufts;
    for (let i = 0; i < nebula.length; i++) nebula[i].visible = i < counts.nebula;
  }
  applyQuality(quality);

  function setLive(next) { live = next && typeof next === 'object' ? next : {}; }

  function update(t, sig, { reducedMotion: rm = reducedMotion, camYaw = 0, camBob = 0, dt = 1 / 60 } = {}) {
    const playing = !!(sig && sig.playing);
    const bass = playing ? (sig.bass || 0) : 0;
    const mid = playing ? (sig.mid || 0) : 0;
    const high = playing ? (sig.high || 0) : 0;
    const kick = playing ? (sig.kickHit || sig.kick || 0) : 0;
    const harm = playing ? ((sig.chroma || sig.harmonic || 0) * 0.5 + mid * 0.5 + high * 0.35) : 0;
    const beat = playing ? ((sig.beatPulse || sig.anticip || 0) + kick * 0.6) : 0;
    const hb = (live.heartbeat || {});
    const tick = Number(hb.recorded_tick != null ? hb.recorded_tick : ((live.diary || {}).tick));
    const energy = Number((hb.signals || {}).energy);
    const idleE = Number.isFinite(energy) ? Math.max(0, Math.min(1, energy / 100)) : 0.4;
    const idleTick = Number.isFinite(tick) ? tick : 0;
    const idle = !playing;
    const move = rm ? 0 : 1;
    const dtC = Math.min(0.05, Math.max(0.001, dt));

    // Sky parallax: far layer lags the camera, mid nebula less so.
    skyGroup.rotation.y = camYaw * 0.22 * move;
    sky.rotation.y = t * 0.004 * move;
    stars.rotation.y = t * 0.006 * move;
    for (let i = 0; i < nebula.length; i++) {
      const n = nebula[i];
      if (!n.visible) continue;
      const home = n.userData.home;
      n.position.x = home.x - Math.sin(camYaw) * n.userData.par * move;
      n.position.y = home.y + camBob * 0.4 * move + Math.sin(t * 0.15 + i) * 0.03 * move;
      n.material.opacity = 0.42 + (playing ? beat * 0.25 + high * 0.15 : idleE * 0.12 + 0.08 * Math.sin(t * 0.4 + i));
    }
    // Star twinkle from highs when playing, else a slow tick-driven pulse.
    stars.material.opacity = 0.75 + (playing ? high * 0.25 : 0.1 * Math.sin(t * 0.7 + idleTick * 0.01));
    stars.material.size = 0.032 + (playing ? high * 0.02 : 0);

    // Tuft springs — audio forces when playing, tick/heartbeat at idle.
    for (let i = 0; i < tufts.length; i++) {
      const tu = tufts[i];
      if (!tu.visible) continue;
      const target = rm ? 0 : (
        playing
          ? (bass * 0.18 + kick * 0.28 + harm * 0.12) * Math.sin((sig.musicPhase || t) * 2 + tu.userData.phase)
          : (0.04 + idleE * 0.06) * Math.sin(t * 0.9 + idleTick * 0.07 + tu.userData.phase)
      );
      const x = stepSpring(tu.userData.spring, target * move, tu.userData.stiff, 0.42, dtC);
      tu.rotation.z = tu.userData.base + x;
      tu.rotation.x = x * 0.45;
      const bulb = tu.children[tu.children.length - 1];
      if (bulb && bulb.material && 'emissiveIntensity' in bulb.material) {
        bulb.material.emissiveIntensity = 0.7 + (playing ? beat * 0.7 + mid * 0.35 : 0.2 + idleE * 0.45 + 0.12 * Math.sin(t * 1.3 + i));
      }
    }

    // Mote springs orbit a home point; pulse with beat / heartbeat.
    const arr = motes.geometry.attributes.position.array;
    for (let i = 0; i < counts.motes; i++) {
      const home = moteHome[i];
      const s = moteSpring[i];
      const ph = home.phase + t * (0.4 + (playing ? mid * 0.8 : 0.15));
      const tx = home.x + Math.cos(ph) * 0.04 * move;
      const tz = home.z + Math.sin(ph) * 0.04 * move;
      const ty = home.y + Math.sin(ph * 1.3 + idleTick * 0.05) * home.lift * move
        + (playing ? beat * 0.05 + bass * 0.03 : idleE * 0.02);
      const k = 18, zta = 0.5, damp = 2 * zta * Math.sqrt(k);
      s.vx += ((tx - (home.x + s.x)) * k - s.vx * damp) * dtC;
      s.vy += ((ty - (home.y + s.y)) * k - s.vy * damp) * dtC;
      s.vz += ((tz - (home.z + s.z)) * k - s.vz * damp) * dtC;
      s.x += s.vx * dtC; s.y += s.vy * dtC; s.z += s.vz * dtC;
      arr[i * 3] = home.x + s.x;
      arr[i * 3 + 1] = home.y + s.y;
      arr[i * 3 + 2] = home.z + s.z;
    }
    motes.geometry.attributes.position.needsUpdate = true;
    moteMat.opacity = 0.55 + (playing ? beat * 0.4 + high * 0.25 : 0.2 + idleE * 0.35);
    moteMat.size = 0.045 + (playing ? kick * 0.03 + high * 0.02 : idleE * 0.015);
  }

  return { group, update, setLive, setQuality: applyQuality, caption: WORLD_CAPTION, get quality() { return qName; } };
}

/**
 * A lightweight CSS world behind the 2D portrait fallback. Positions are
 * seeded once. Animation rides existing dance CSS variables and a tick
 * custom property. Does not cover the portrait, the chat, or the card.
 */
export function ensureWorldBackdrop(host, seedHex) {
  if (!host) return null;
  let box = host.querySelector('.mw-world');
  if (box) return box;
  const rng = mulberry32(hashInt(seedHex));
  box = document.createElement('div');
  box.className = 'mw-world';
  box.setAttribute('aria-hidden', 'true');
  const sky = document.createElement('span');
  sky.className = 'mw-world-sky';
  box.appendChild(sky);
  const stars = document.createElement('span');
  stars.className = 'mw-world-stars';
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('i');
    s.style.left = (6 + rng() * 88).toFixed(1) + '%';
    s.style.top = (4 + rng() * 55).toFixed(1) + '%';
    s.style.width = s.style.height = (1 + rng() * 2).toFixed(1) + 'px';
    s.style.animationDelay = (-rng() * 4).toFixed(2) + 's';
    stars.appendChild(s);
  }
  box.appendChild(stars);
  const ground = document.createElement('span');
  ground.className = 'mw-world-ground';
  box.appendChild(ground);
  const motes = document.createElement('span');
  motes.className = 'mw-world-motes';
  for (let i = 0; i < 7; i++) {
    const m = document.createElement('i');
    m.style.left = (12 + rng() * 76).toFixed(1) + '%';
    m.style.bottom = (8 + rng() * 28).toFixed(1) + '%';
    m.style.animationDelay = (-rng() * 5).toFixed(2) + 's';
    m.style.animationDuration = (3.5 + rng() * 2.5).toFixed(2) + 's';
    motes.appendChild(m);
  }
  box.appendChild(motes);
  const portrait = host.querySelector('.portrait');
  if (portrait) host.insertBefore(box, portrait);
  else host.insertBefore(box, host.firstChild);
  return box;
}

export function applyWorldCSS(el, live) {
  if (!el) return;
  const hb = (live && live.heartbeat) || {};
  const tick = hb.recorded_tick != null ? hb.recorded_tick : ((live && live.diary && live.diary.tick) || 0);
  const energy = Number((hb.signals || {}).energy);
  el.style.setProperty('--world-tick', String(Number.isFinite(Number(tick)) ? Number(tick) : 0));
  el.style.setProperty('--world-energy', (Number.isFinite(energy) ? Math.max(0, Math.min(1, energy / 100)) : 0.4).toFixed(3));
}
