// Cosmic color particles and a small 3-band signal ring around the Moonwraith.
// Particles are instanced points (one draw call, positions on the GPU). Color
// and emission come from the live AnalyserNode signal only:
//   bass onsets  -> radial bursts
//   mids         -> swirl / orbit speed
//   highs        -> sparkle / twinkle and a shift toward bright gold
//   RMS loudness -> how many are visible (density)
// At idle a faint slow drift is seeded from SHA-256/mulberry32 of zeref/live.json.
// Spawn jitter uses that same PRNG. No Math.random.
// On a slow phone the count steps down with the cosmic quality guard.
import { mulberry32 } from './motion.mjs';

export const SIGNAL_CAPTION = 'live audio signal · beat · harmonics';

export const PARTICLE_COUNTS = Object.freeze({ high: 192, med: 80, low: 0 });

const COLORS = [
  [0.05, 0.95, 1.00], // cyan
  [0.62, 0.16, 1.00], // violet
  [1.00, 0.12, 0.62], // magenta
  [1.00, 0.84, 0.35], // gold
];

function hashInt(hex) {
  const s = String(hex || 'zeref');
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (Math.imul(n, 16777619) ^ s.charCodeAt(i)) >>> 0;
  return n || 1;
}

function softSprite(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(220,200,255,0.7)');
  grd.addColorStop(1, 'rgba(80,20,140,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

const VERT = `
attribute float aRadius;
attribute float aPhase;
attribute float aY0;
attribute float aSize;
attribute float aKind;
attribute float aBirth;
attribute float aIndex;
attribute vec3 aColor;
attribute vec3 aVel;
uniform float uTime;
uniform float uSwirl;
uniform float uTwinkle;
uniform float uDensity;
uniform float uCap;
uniform float uSize;
uniform float uPixelRatio;
uniform float uReduced;
uniform float uMusic;
uniform vec3 uHue;
uniform float uHueMix;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float hidden = step(uCap, aIndex);
  vec3 p;
  float life = 1.0;
  if (aKind > 0.5) {
    float age = max(0.0, uTime - aBirth);
    life = 1.0 - clamp(age / 0.55, 0.0, 1.0);
    p = vec3(0.0, 0.18, 0.0) + aVel * age + vec3(0.0, -0.28 * age * age, 0.0);
  } else {
    float spd = mix(0.12, 0.12 + uSwirl * 1.65, 1.0 - uReduced);
    float clock = uMusic;
    float ang = aPhase + clock * spd;
    float r = aRadius * (0.92 + 0.12 * sin(clock * 0.55 + aPhase));
    p = vec3(cos(ang) * r, aY0 + 0.04 * sin(ang * 1.25 + aPhase), sin(ang * 0.92) * r);
    float slot = aIndex / max(uCap, 1.0);
    life = 1.0 - smoothstep(uDensity, uDensity + 0.08, slot);
  }
  life *= 1.0 - hidden;
  vec3 lit = mix(aColor, vec3(1.0, 0.92, 0.62), clamp(uTwinkle * 0.7, 0.0, 0.85));
  vColor = mix(lit, uHue, clamp(uHueMix, 0.0, 0.85));
  vAlpha = life * (0.45 + 0.55 * uTwinkle * step(0.5, aKind) + 0.35 * (1.0 - aKind));
  if (aKind < 0.5) vAlpha *= 0.75 + 0.45 * uDensity;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = max(0.0, aSize * uSize * uPixelRatio * (0.7 + uTwinkle * 0.7) * life / max(0.35, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  float a = tex.a * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor * tex.rgb, a);
}
`;

function capFor(quality) {
  if (quality === 'high') return PARTICLE_COUNTS.high;
  if (quality === 'med') return PARTICLE_COUNTS.med;
  return PARTICLE_COUNTS.low;
}

/**
 * Colorful cosmic points around the model. Call update(t, sig) each frame.
 * setQuality() hides or caps the count with the cosmic quality guard.
 */
export function makeCosmicParticles(THREE, parent, { seedHex = 'zeref', quality = 'high' } = {}) {
  const max = PARTICLE_COUNTS.high;
  const rnd = mulberry32(hashInt(seedHex) ^ 0xC05C1C);
  const radius = new Float32Array(max);
  const phase = new Float32Array(max);
  const y0 = new Float32Array(max);
  const size = new Float32Array(max);
  const kind = new Float32Array(max);
  const birth = new Float32Array(max);
  const index = new Float32Array(max);
  const color = new Float32Array(max * 3);
  const vel = new Float32Array(max * 3);
  const dummy = new Float32Array(max * 3);

  for (let i = 0; i < max; i++) {
    index[i] = i;
    radius[i] = 0.16 + rnd() * 0.42;
    phase[i] = rnd() * Math.PI * 2;
    y0[i] = 0.04 + rnd() * 0.46;
    size[i] = 0.9 + rnd() * 1.8;
    kind[i] = 0;
    birth[i] = -10;
    const c = COLORS[Math.floor(rnd() * COLORS.length) % COLORS.length];
    color[i * 3] = c[0];
    color[i * 3 + 1] = c[1];
    color[i * 3 + 2] = c[2];
    dummy[i * 3] = Math.cos(phase[i]) * radius[i];
    dummy[i * 3 + 1] = y0[i];
    dummy[i * 3 + 2] = Math.sin(phase[i]) * radius[i];
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(dummy, 3));
  geo.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aY0', new THREE.BufferAttribute(y0, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  geo.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1));
  geo.setAttribute('aIndex', new THREE.BufferAttribute(index, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));

  const uniforms = {
    uTime: { value: 0 },
    uSwirl: { value: 0 },
    uTwinkle: { value: 0 },
    uDensity: { value: 0.2 },
    uCap: { value: capFor(quality) },
    uSize: { value: 22 },
    uPixelRatio: { value: Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1) },
    uReduced: { value: 0 },
    uMusic: { value: 0 },
    uHue: { value: [0.62, 0.16, 1.0] },
    uHueMix: { value: 0 },
    uMap: { value: softSprite(THREE) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.visible = quality !== 'low';
  if (parent) parent.add(pts);

  const burstStart = 96; // high-count orbit slots; bursts recycle the rest
  let burstCursor = 0;
  let lastBurstAt = -10;
  let q = quality;
  const spawnRnd = mulberry32(hashInt(seedHex) ^ 0xB00757);

  function spawnBurst(t, n) {
    const cap = uniforms.uCap.value;
    if (cap <= 0) return;
    const pool = Math.max(8, cap - burstStart);
    const count = Math.min(n, pool);
    for (let k = 0; k < count; k++) {
      const i = burstStart + (burstCursor++ % pool);
      if (i >= cap) continue;
      const az = spawnRnd() * Math.PI * 2;
      const elv = (spawnRnd() - 0.28) * 1.2;
      const sp = 0.38 + spawnRnd() * 0.62;
      vel[i * 3] = Math.cos(az) * Math.cos(elv) * sp;
      vel[i * 3 + 1] = Math.sin(elv) * sp + 0.18;
      vel[i * 3 + 2] = Math.sin(az) * Math.cos(elv) * sp;
      kind[i] = 1;
      birth[i] = t;
    }
    geo.attributes.aVel.needsUpdate = true;
    geo.attributes.aKind.needsUpdate = true;
    geo.attributes.aBirth.needsUpdate = true;
  }

  function setQuality(next) {
    q = next;
    uniforms.uCap.value = capFor(next);
    pts.visible = next !== 'low';
  }

  function update(t, sig, { reducedMotion = false, wallTime = null } = {}) {
    const playing = !!(sig && sig.playing);
    const loud = (sig && sig.loud) || 0;
    const mid = (sig && sig.mid) || 0;
    const high = (sig && (sig.flare != null ? sig.flare : sig.high)) || 0;
    const wall = wallTime == null ? t : wallTime;
    uniforms.uTime.value = wall;
    uniforms.uMusic.value = t;
    uniforms.uReduced.value = reducedMotion ? 1 : 0;
    uniforms.uSwirl.value = reducedMotion ? 0 : (playing ? Math.max(0.18, mid + (sig.loud || 0) * 0.35) : 0.12);
    uniforms.uTwinkle.value = reducedMotion ? 0 : (playing ? Math.max(0.12, high + (sig.hat || 0) * 0.4 + (sig.loud || 0) * 0.15) : 0.15 + 0.1 * Math.sin(wall * 0.9));
    uniforms.uDensity.value = reducedMotion
      ? 0.12
      : (playing ? 0.28 + loud * 0.72 : 0.32);
    if (playing && sig && sig.chromaPc >= 0 && sig.chromaHue) {
      const h = sig.chromaHue;
      const n = parseInt(String(h).replace('#', ''), 16);
      if (Number.isFinite(n)) {
        uniforms.uHue.value = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
        uniforms.uHueMix.value = 0.35 + 0.4 * (sig.chromaConf || 0);
      }
    } else {
      uniforms.uHueMix.value = playing ? uniforms.uHueMix.value * 0.92 : 0;
    }
    if (!reducedMotion && playing && sig && ((sig.hop || 0) > 0.85 || (sig.kickHit || 0) > 0.85) && (wall - lastBurstAt) > 0.12) {
      // A bass-onset hop is ~1 at the trigger frame; fire a radial burst from that real onset.
      lastBurstAt = wall;
      const n = q === 'high' ? 14 : 8;
      spawnBurst(wall, n);
    }
  }

  return { update, setQuality, get quality() { return q; }, object: pts };
}

/**
 * Three colored arcs around his paws, lit by the live bass / mid / high bands.
 */
export function makeSignalRing(THREE, parent, { quality = 'high' } = {}) {
  const group = new THREE.Group();
  group.position.set(0, 0.10, 0);
  const colors = [0x8fe8ff, 0xc084fc, 0xffd76a];
  const meshes = colors.map((hex, i) => {
    const geo = new THREE.TorusGeometry(0.31, 0.011, 8, 48, Math.PI * 0.55);
    const mat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.rotation.z = i * ((Math.PI * 2) / 3);
    group.add(mesh);
    return mesh;
  });
  if (parent) parent.add(group);
  let q = quality;
  group.visible = quality !== 'low';

  function setQuality(next) {
    q = next;
    group.visible = next !== 'low';
  }

  function update(t, sig) {
    const playing = !!(sig && sig.playing);
    const bands = [(sig && sig.bass) || 0, (sig && sig.mid) || 0, (sig && sig.high) || 0];
    const fade = playing ? 1 : 0.15;
    for (let i = 0; i < 3; i++) {
      const v = bands[i];
      meshes[i].material.opacity = (0.22 + v * 0.75) * fade;
      const s = 1 + v * 0.08;
      meshes[i].scale.set(s, s, 1);
    }
    group.visible = q !== 'low';
  }

  return { update, setQuality, object: group };
}

/** Build the small on-stage meter (also used by the 2D fallback). */
export function ensureSignalReadout(el) {
  if (!el) return null;
  let box = el.querySelector('.mw-signal');
  if (box) return box;
  box = document.createElement('div');
  box.className = 'mw-signal';
  box.hidden = true;
  const label = document.createElement('span');
  label.className = 'mw-signal-label';
  label.textContent = SIGNAL_CAPTION;
  const bars = document.createElement('span');
  bars.className = 'mw-signal-bars';
  bars.setAttribute('aria-hidden', 'true');
  for (const name of ['bass', 'mid', 'high']) {
    const i = document.createElement('i');
    i.className = name;
    bars.appendChild(i);
  }
  box.appendChild(label);
  box.appendChild(bars);
  el.appendChild(box);
  return box;
}
