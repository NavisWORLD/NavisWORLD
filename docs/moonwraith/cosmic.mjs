// Cosmic look for the Moonwraith: same GLB rig and silhouette, his purple /
// violet palette with cyan accents, dressed as a little night sky.
// Starfield and nebula in the fur, iridescent membranes on the wings, a glow
// on the moon marks and eyes, and a soft dust aura. Twinkle and drift are
// deterministic (seeded from zeref/live.json + time-based noise). No Math.random.
// On a slow phone the aura and shaders step down automatically.
import { mulberry32 } from './motion.mjs';

const FUR_RE = /zeref_fur|fur/i;
const WING_RE = /zeref_wing|wing/i;
const EYE_RE = /zeref_eye|eye/i;
const GLOW_RE = /zeref_moon|zeref_gem|zeref_glow|zeref_catch|moon|gem/i;
const RIB_RE = /zeref_rib|zeref_wisp|wisp/i;

function hashInt(hex) {
  const s = String(hex || 'zeref');
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (Math.imul(n, 16777619) ^ s.charCodeAt(i)) >>> 0;
  return n || 1;
}

function softSprite(THREE, inner, mid, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.35, mid);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

const STAR_GLSL = `
float cwHash(vec3 p){
  p = fract(p * vec3(443.8975, 397.2973, 491.1871) + uCwSeed);
  p += dot(p, p.yxz + 19.19);
  return fract((p.x + p.y) * p.z);
}
float cwStars(vec3 p, float t){
  vec3 f = floor(p);
  float n = cwHash(f);
  float tw = 0.45 + 0.55 * sin(t * (0.8 + n * 2.6) + n * 6.2831853);
  float d = length(fract(p) - 0.5);
  return smoothstep(0.10, 0.015, d) * step(0.78, n) * tw;
}
vec3 cwNebula(vec3 p, float t){
  float n = 0.0;
  n += 0.60 * sin(p.x * 2.1 + p.y * 1.4 + t * 0.17);
  n += 0.30 * sin(p.y * 3.3 - p.z * 2.0 + t * 0.11 + uCwSeed);
  n += 0.18 * sin((p.x + p.z) * 5.1 - t * 0.23);
  n = clamp(0.5 + 0.5 * n, 0.0, 1.0);
  vec3 vio = vec3(0.45, 0.22, 0.95);
  vec3 cyn = vec3(0.40, 0.85, 1.0);
  return mix(vio, cyn, n) * n;
}
`;

function injectUniforms(shader, extras) {
  shader.uniforms.uCwTime = { value: 0 };
  shader.uniforms.uCwSeed = { value: extras.seed };
  shader.uniforms.uCwPulse = { value: 0 };
  shader.uniforms.uCwGlow = { value: 1 };
}

function patchWorld(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vCwPos;\nvarying vec3 vCwNrm;')
    .replace('#include <project_vertex>', [
      'vCwPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      'vCwNrm = normalize((modelMatrix * vec4(normalize(transformedNormal), 0.0)).xyz);',
      '#include <project_vertex>',
    ].join('\n'));
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vCwPos;\nvarying vec3 vCwNrm;\nuniform float uCwTime;\nuniform float uCwSeed;\nuniform float uCwPulse;\nuniform float uCwGlow;\n' + STAR_GLSL);
}

function patchFur(shader) {
  injectUniforms(shader, { seed: 0 });
  patchWorld(shader);
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
     vec3 cwP = vCwPos * 7.4;
     float stars = cwStars(cwP, uCwTime) + 0.65 * cwStars(cwP * 1.9 + 3.7, uCwTime * 1.15);
     vec3 neb = cwNebula(vCwPos * 2.2, uCwTime);
     float pulse = 0.75 + 0.55 * uCwPulse;
     totalEmissiveRadiance += vec3(0.70, 0.82, 1.0) * stars * (1.15 + uCwGlow * 0.35) * pulse;
     totalEmissiveRadiance += neb * (0.08 + 0.16 * uCwPulse) * uCwGlow;
     vec3 V = normalize(-vViewPosition);
     vec3 N = normalize(vCwNrm);
     float fres = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 2.6);
     totalEmissiveRadiance += vec3(0.55, 0.78, 1.0) * fres * (0.10 + 0.22 * uCwPulse);
    `,
  );
}

function patchWing(shader) {
  injectUniforms(shader, { seed: 0 });
  patchWorld(shader);
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
     vec3 V = normalize(-vViewPosition);
     vec3 N = normalize(vCwNrm);
     float fres = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 1.8);
     vec3 irid = mix(vec3(0.62, 0.28, 1.0), vec3(0.35, 0.95, 1.0), fres);
     irid = mix(irid, vec3(1.0, 0.45, 0.85), 0.35 * sin(uCwTime * 0.4 + vCwPos.y * 4.0 + uCwSeed));
     float stars = cwStars(vCwPos * 11.0, uCwTime);
     float pulse = 0.8 + 0.55 * uCwPulse;
     totalEmissiveRadiance += irid * (0.22 + fres * 0.55) * pulse * uCwGlow;
     totalEmissiveRadiance += vec3(0.8, 0.9, 1.0) * stars * 0.9 * pulse;
     diffuseColor.rgb = mix(diffuseColor.rgb, irid, 0.12 + 0.12 * fres);
     diffuseColor.a = max(diffuseColor.a, 0.62 + fres * 0.18);
    `,
  );
}

function patchGlow(shader, kind) {
  injectUniforms(shader, { seed: 0 });
  patchWorld(shader);
  const extra = kind === 'eye'
    ? `totalEmissiveRadiance *= (1.25 + 0.55 * uCwPulse) * uCwGlow;
       totalEmissiveRadiance += vec3(0.75, 0.55, 1.0) * (0.25 + 0.4 * uCwPulse);`
    : `totalEmissiveRadiance += vec3(0.85, 0.75, 1.0) * (0.55 + 0.7 * uCwPulse) * uCwGlow;
       float stars = cwStars(vCwPos * 14.0, uCwTime);
       totalEmissiveRadiance += vec3(1.0, 0.9, 1.0) * stars * 0.8;`;
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>\n${extra}\n`,
  );
}

function hook(mat, kind, store) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    if (kind === 'fur') patchFur(shader);
    else if (kind === 'wing') patchWing(shader);
    else patchGlow(shader, kind);
    store.push(shader);
  };
  mat.customProgramCacheKey = () => 'cw-' + kind + '-v1';
  mat.needsUpdate = true;
}

function makeAura(THREE, seedHex, count) {
  const rnd = mulberry32(hashInt(seedHex));
  const positions = new Float32Array(count * 3);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const radius = 0.16 + rnd() * 0.28;
    const y0 = 0.04 + rnd() * 0.42;
    const speed = 0.18 + rnd() * 0.45;
    const phase = rnd() * Math.PI * 2;
    const size = 0.7 + rnd() * 1.4;
    seeds.push({ radius, y0, speed, phase, size });
    positions[i * 3] = Math.cos(phase) * radius;
    positions[i * 3 + 1] = y0;
    positions[i * 3 + 2] = Math.sin(phase) * radius;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) sizes[i] = seeds[i].size;
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.PointsMaterial({
    map: softSprite(THREE, 'rgba(220,230,255,1)', 'rgba(140,180,255,0.55)', 'rgba(80,40,160,0)'),
    color: 0xc9e8ff,
    size: 0.042,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.9,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.cwAura = { seeds, positions };
  return pts;
}

function addHalo(THREE, parent, local, color, scale) {
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softSprite(THREE, 'rgba(255,255,255,0.95)', color, 'rgba(40,10,80,0)'),
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
  }));
  spr.position.copy(local);
  spr.scale.setScalar(scale);
  spr.userData.cwHalo = { base: scale };
  parent.add(spr);
  return spr;
}

/**
 * Dress the loaded Moonwraith in his cosmic look. Returns a handle with
 * update() and setQuality(). Does not change the rig or silhouette.
 */
export function applyCosmic(THREE, model, { seedHex = 'zeref', quality = 'high', head = null } = {}) {
  const shaders = [];
  const halos = [];
  const kindOf = (mat, mesh) => {
    const n = ((mat && mat.name) || '') + ' ' + ((mesh && mesh.name) || '');
    if (EYE_RE.test(n)) return 'eye';
    if (WING_RE.test(n)) return 'wing';
    if (GLOW_RE.test(n) || RIB_RE.test(n)) return 'glow';
    if (FUR_RE.test(n)) return 'fur';
    return null;
  };

  model.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      const kind = kindOf(m, o);
      if (!kind) continue;
      if (kind === 'eye' || kind === 'glow') {
        if ('emissiveIntensity' in m) m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, kind === 'eye' ? 1.3 : 1.2);
        if (m.emissive && m.emissive.getHex && m.emissive.getHex() === 0) m.emissive.setHex(kind === 'eye' ? 0xb57bff : 0xbfa0ff);
      }
      if (quality !== 'low') hook(m, kind, shaders);
    }
  });

  // Soft bloom-like halos parented to the head bone (local offsets, since the
  // skinned face is not a child mesh of the bone). Tuned to the chibi head.
  const anchor = head || model;
  if (quality !== 'low' && head) {
    halos.push(addHalo(THREE, head, new THREE.Vector3(-0.038, 0.05, 0.072), 'rgba(180,120,255,0.45)', 0.07));
    halos.push(addHalo(THREE, head, new THREE.Vector3( 0.038, 0.05, 0.072), 'rgba(180,120,255,0.45)', 0.07));
    halos.push(addHalo(THREE, head, new THREE.Vector3( 0.0, 0.10, 0.055), 'rgba(230,210,255,0.4)', 0.06));
  }

  const count = quality === 'high' ? 96 : quality === 'med' ? 48 : 0;
  const aura = count ? makeAura(THREE, seedHex, count) : null;
  if (aura) model.add(aura);

  // A faint cyan back-rim, in addition to the scene rim, parented to the model.
  const auraLight = new THREE.PointLight(0x8fe8ff, 0.22, 1.4, 2);
  auraLight.position.set(0, 0.28, -0.2);
  model.add(auraLight);
  const frontFill = new THREE.PointLight(0xc9a0ff, 0.12, 1.2, 2);
  frontFill.position.set(0, 0.3, 0.35);
  model.add(frontFill);

  let q = quality;
  const seed = (hashInt(seedHex) % 1000) / 1000;

  function pushQuality(next) {
    if (next === q) return;
    q = next;
    if (aura) aura.visible = next !== 'low';
    for (const h of halos) h.visible = next !== 'low';
  }

  function update(t, dance) {
    const pulse = dance && dance.active ? (0.35 * dance.loud + 0.45 * dance.high + 0.2 * dance.bass) : 0;
    for (const sh of shaders) {
      if (sh.uniforms.uCwTime) sh.uniforms.uCwTime.value = t;
      if (sh.uniforms.uCwSeed) sh.uniforms.uCwSeed.value = seed;
      if (sh.uniforms.uCwPulse) sh.uniforms.uCwPulse.value = pulse;
    }
    const glow = 1 + pulse * 0.8;
    for (const h of halos) {
      const b = h.userData.cwHalo.base;
      h.scale.setScalar(b * glow);
      h.material.opacity = 0.7 + pulse * 0.3;
    }
    auraLight.intensity = 0.18 + pulse * 0.55;
    frontFill.intensity = 0.1 + pulse * 0.25;
    if (aura && aura.visible) {
      const rec = aura.userData.cwAura;
      const pos = rec.positions;
      const swell = 1 + pulse * 0.25;
      for (let i = 0; i < rec.seeds.length; i++) {
        const s = rec.seeds[i];
        const a = t * s.speed + s.phase;
        const r = s.radius * swell;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = s.y0 + 0.045 * Math.sin(a * 1.3) + (dance && dance.active ? dance.hop * 0.04 : 0);
        pos[i * 3 + 2] = Math.sin(a * 0.92) * r;
      }
      aura.geometry.attributes.position.needsUpdate = true;
      aura.material.opacity = 0.7 + pulse * 0.3;
    }
  }

  return { update, setQuality: pushQuality, get quality() { return q; } };
}

/** Watch frame times and step the cosmic look down if a phone is struggling. */
export function makeQualityGuard(handle, { start = 'high', narrow = false } = {}) {
  let level = start;
  if (narrow && start === 'high') level = 'med';
  handle.setQuality(level);
  let slow = 0;
  return function observe(dt) {
    if (level === 'low') return level;
    if (dt > 1 / 26) slow += 1;
    else slow = Math.max(0, slow - 1);
    if (slow > 50) {
      level = level === 'high' ? 'med' : 'low';
      handle.setQuality(level);
      slow = 0;
    }
    return level;
  };
}
