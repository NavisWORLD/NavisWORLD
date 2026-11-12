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
  float tw = 0.30 + 0.70 * sin(t * (1.15 + n * 3.4) + n * 6.2831853);
  float d = length(fract(p) - 0.5);
  return smoothstep(0.08, 0.012, d) * step(0.64, n) * tw;
}
vec3 cwNebula(vec3 p, float t){
  float n = 0.0;
  n += 0.50 * sin(p.x * 2.3 + p.y * 1.5 + t * 0.22);
  n += 0.32 * sin(p.y * 3.6 - p.z * 2.2 + t * 0.14 + uCwSeed);
  n += 0.22 * sin((p.x + p.z) * 5.4 - t * 0.28);
  float m = 0.5 + 0.5 * sin(p.z * 2.8 + p.x * 1.7 - t * 0.19 + uCwSeed * 2.0);
  n = clamp(n * 0.55 + 0.45, 0.0, 1.0);
  vec3 vio = vec3(0.62, 0.10, 1.0);
  vec3 cyn = vec3(0.05, 0.95, 1.0);
  vec3 mag = vec3(1.0, 0.12, 0.62);
  return mix(mix(vio, cyn, n), mag, m * 0.55) * (0.35 + 0.65 * n);
}
`;

function injectUniforms(shader, extras) {
  shader.uniforms.uCwTime = { value: 0 };
  shader.uniforms.uCwSeed = { value: extras.seed };
  shader.uniforms.uCwPulse = { value: 0 };
  shader.uniforms.uCwGlow = { value: 1 };
  // Default iris matches the previous fixed eye wash, until expression.mjs sets the recorded color.
  shader.uniforms.uIris = { value: [0.90, 0.55, 1.0] };
  shader.uniforms.uIrisGlow = { value: 1 };
  // Moon direction (world, matches the visible moon) and fur follow-through.
  shader.uniforms.uMoonDir = { value: [0.55, 0.70, -0.45] };
  shader.uniforms.uFurFollow = { value: [0, 0, 0] };
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
    .replace('#include <common>', '#include <common>\nvarying vec3 vCwPos;\nvarying vec3 vCwNrm;\nuniform float uCwTime;\nuniform float uCwSeed;\nuniform float uCwPulse;\nuniform float uCwGlow;\nuniform vec3 uIris;\nuniform float uIrisGlow;\nuniform vec3 uMoonDir;\nuniform vec3 uFurFollow;\n' + STAR_GLSL);
}

function patchFur(shader) {
  injectUniforms(shader, { seed: 0 });
  patchWorld(shader);
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
     vec3 cwP = vCwPos * 8.2;
     float stars = cwStars(cwP, uCwTime) + 0.85 * cwStars(cwP * 2.15 + 3.7, uCwTime * 1.2);
     vec3 neb = cwNebula(vCwPos * 2.6, uCwTime);
     float pulse = 0.85 + 0.7 * uCwPulse;
     float nebMask = pow(clamp(length(neb) / 1.15, 0.0, 1.0), 1.35);
     totalEmissiveRadiance += vec3(0.75, 0.92, 1.0) * stars * (1.95 + uCwGlow * 0.6) * pulse;
     totalEmissiveRadiance += neb * nebMask * (0.22 + 0.24 * uCwPulse) * uCwGlow;
     vec3 V = normalize(-vViewPosition);
     vec3 N = normalize(vCwNrm);
     float fres = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 2.4);
     totalEmissiveRadiance += vec3(0.20, 0.90, 1.0) * fres * (0.22 + 0.38 * uCwPulse);
     // Volume: soft wrap AO so the underside and folds read darker, not flat.
     float wrap = clamp(dot(N, vec3(0.0, 1.0, 0.0)) * 0.65 + 0.35, 0.35, 1.0);
     float cavity = pow(fres, 1.35);
     diffuseColor.rgb *= mix(vec3(0.58, 0.46, 0.72), vec3(1.0), wrap);
     diffuseColor.rgb *= (1.0 - cavity * 0.18);
     // Soft moon rim + a cyan / violet sheen on the silhouette.
     vec3 moonD = normalize(uMoonDir);
     float rimM = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 2.15);
     float moonFacing = pow(clamp(dot(N, moonD), 0.0, 1.0), 0.7);
     totalEmissiveRadiance += vec3(0.75, 0.88, 1.0) * rimM * moonFacing * 0.50;
     totalEmissiveRadiance += vec3(0.62, 0.22, 1.0) * rimM * (1.0 - moonFacing * 0.45) * 0.30;
     float tickle = 0.5 + 0.5 * sin(vCwPos.y * 28.0 + uCwTime * 2.2 + uCwSeed);
     totalEmissiveRadiance += vec3(0.55, 0.85, 1.0) * tickle * length(uFurFollow) * 1.35;
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
     float fres = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 1.65);
     vec3 irid = mix(vec3(0.55, 0.08, 1.0), vec3(0.05, 0.95, 1.0), fres);
     irid = mix(irid, vec3(1.0, 0.12, 0.62), 0.45 * (0.5 + 0.5 * sin(uCwTime * 0.5 + vCwPos.y * 4.2 + uCwSeed)));
     vec3 neb = cwNebula(vCwPos * 3.4, uCwTime);
     float stars = cwStars(vCwPos * 10.0, uCwTime);
     float pulse = 0.9 + 0.7 * uCwPulse;
     totalEmissiveRadiance += irid * (0.48 + fres * 1.15) * pulse * uCwGlow;
     totalEmissiveRadiance += neb * (0.85 + fres * 1.0) * pulse * uCwGlow;
     totalEmissiveRadiance += vec3(0.85, 0.95, 1.0) * stars * 1.55 * pulse;
     vec3 sat = mix(vec3(0.28, 0.05, 0.75), irid, 0.55);
     diffuseColor.rgb *= mix(vec3(1.0), sat, 0.38 + 0.22 * fres);
     diffuseColor.a = max(diffuseColor.a, 0.60 + fres * 0.22);
    `,
  );
}

function patchGlow(shader, kind) {
  injectUniforms(shader, { seed: 0 });
  patchWorld(shader);
  const extra = kind === 'eye'
    ? `// Iris depth from the recorded uIris: a darker rim, a brighter wet
       // center, a specular glint from the moon. No made-up UV pupil —
       // both eyes share one material and there is no pupil morph.
       vec3 eN = normalize(vCwNrm);
       vec3 eV = normalize(-vViewPosition);
       float ndv = clamp(dot(eN, eV), 0.0, 1.0);
       float wet = pow(1.0 - ndv, 3.2);
       float fall = pow(ndv, 0.65);
       vec3 irisDeep = uIris * 0.42;
       vec3 irisLit = uIris * (0.95 + 0.55 * uIrisGlow);
       totalEmissiveRadiance *= uIris * (0.16 + 0.18 * uIrisGlow);
       totalEmissiveRadiance += mix(irisDeep, irisLit, fall) * (0.55 + 0.70 * uIrisGlow);
       totalEmissiveRadiance += uIris * (0.08 + 0.16 * uCwPulse);
       totalEmissiveRadiance += vec3(0.85, 0.95, 1.0) * wet * (0.22 + 0.20 * uIrisGlow);
       vec3 eH = normalize(normalize(uMoonDir) + eV);
       float glint = pow(clamp(dot(eN, eH), 0.0, 1.0), 80.0);
       totalEmissiveRadiance += vec3(1.0) * glint * (0.60 + 0.35 * uIrisGlow);
       totalEmissiveRadiance += vec3(1.0) * 0.03;`
    : `totalEmissiveRadiance += vec3(0.98, 0.86, 1.0) * (1.05 + 1.2 * uCwPulse) * uCwGlow;
       float stars = cwStars(vCwPos * 14.0, uCwTime);
       totalEmissiveRadiance += vec3(1.0, 0.92, 1.0) * stars * 1.35;`;
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
  mat.customProgramCacheKey = () => 'cw-' + kind + '-v4';
  mat.needsUpdate = true;
}

function makeAura(THREE, seedHex, count) {
  const rnd = mulberry32(hashInt(seedHex));
  const positions = new Float32Array(count * 3);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const radius = 0.14 + rnd() * 0.38;
    const y0 = 0.02 + rnd() * 0.50;
    const speed = 0.18 + rnd() * 0.45;
    const phase = rnd() * Math.PI * 2;
    const size = 0.95 + rnd() * 1.9;
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
    map: softSprite(THREE, 'rgba(255,255,255,1)', 'rgba(160,210,255,0.7)', 'rgba(120,30,180,0)'),
    color: 0xd8f0ff,
    size: 0.068,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 1.0,
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
        if ('emissiveIntensity' in m) m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, kind === 'eye' ? 1.15 : 1.75);
        if (m.emissive && m.emissive.getHex && m.emissive.getHex() === 0) m.emissive.setHex(kind === 'eye' ? 0xd090ff : 0xffd6ff);
      }
      if (quality !== 'low') hook(m, kind, shaders);
    }
  });

  // Tight glow + a larger bloom halo, parented to the head bone (local offsets,
  // since the skinned face is not a child mesh of the bone).
  const anchor = head || model;
  if (quality !== 'low' && head) {
    const eyeHalos = [];
    for (const h of [
      addHalo(THREE, head, new THREE.Vector3(-0.038, 0.05, 0.072), 'rgba(210,150,255,0.7)', 0.11),
      addHalo(THREE, head, new THREE.Vector3(-0.038, 0.05, 0.072), 'rgba(120,200,255,0.35)', 0.20),
      addHalo(THREE, head, new THREE.Vector3( 0.038, 0.05, 0.072), 'rgba(210,150,255,0.7)', 0.11),
      addHalo(THREE, head, new THREE.Vector3( 0.038, 0.05, 0.072), 'rgba(120,200,255,0.35)', 0.20),
    ]) { h.userData.cwHalo.eye = true; eyeHalos.push(h); halos.push(h); }
    halos.push(addHalo(THREE, head, new THREE.Vector3( 0.0, 0.10, 0.055), 'rgba(255,230,255,0.75)', 0.10));
    halos.push(addHalo(THREE, head, new THREE.Vector3( 0.0, 0.10, 0.055), 'rgba(200,160,255,0.4)', 0.18));
  }

  const count = quality === 'high' ? 120 : quality === 'med' ? 64 : 0;
  const aura = count ? makeAura(THREE, seedHex, count) : null;
  if (aura) model.add(aura);

  // Soft body bloom behind the torso, plus a cyan back-rim and a magenta fill.
  let bodyBloom = null;
  if (quality !== 'low') {
    bodyBloom = addHalo(THREE, model, new THREE.Vector3(0, 0.22, -0.02), 'rgba(160,90,255,0.28)', 0.50);
    halos.push(bodyBloom);
  }
  const auraLight = new THREE.PointLight(0x8fe8ff, 0.32, 1.55, 2);
  auraLight.position.set(0, 0.28, -0.2);
  model.add(auraLight);
  const frontFill = new THREE.PointLight(0xd080ff, 0.18, 1.3, 2);
  frontFill.position.set(0, 0.3, 0.35);
  model.add(frontFill);
  const magFill = new THREE.PointLight(0xff4da6, 0.12, 1.2, 2);
  magFill.position.set(0.22, 0.18, 0.15);
  model.add(magFill);

  let q = quality;
  const seed = (hashInt(seedHex) % 1000) / 1000;

  function pushQuality(next) {
    if (next === q) return;
    q = next;
    if (aura) aura.visible = next !== 'low';
    for (const h of halos) h.visible = next !== 'low';
  }

  function update(t, dance) {
    const playing = !!(dance && dance.playing);
    const idleGlow = 0.22 + 0.20 * (0.5 + 0.5 * Math.sin(t * 1.35));
    const pulse = playing
      ? (0.35 * dance.loud + 0.35 * (dance.high || 0) + 0.25 * (dance.bass || 0) + 0.25 * (dance.hop || 0) + 0.2 * (dance.pulse || 0) + 0.15)
      : (dance && dance.active
        ? (0.40 * dance.loud + 0.40 * dance.high + 0.25 * dance.bass + 0.3 * (dance.hop || 0))
        : idleGlow);
    for (const sh of shaders) {
      if (sh.uniforms.uCwTime) sh.uniforms.uCwTime.value = t;
      if (sh.uniforms.uCwSeed) sh.uniforms.uCwSeed.value = seed;
      if (sh.uniforms.uCwPulse) sh.uniforms.uCwPulse.value = pulse;
      if (sh.uniforms.uMoonDir) sh.uniforms.uMoonDir.value = [0.55, 0.70, -0.45];
    }
    const glow = 1 + pulse * 0.95;
    for (const h of halos) {
      const b = h.userData.cwHalo.base;
      h.scale.setScalar(b * glow);
      h.material.opacity = 0.75 + pulse * 0.35;
    }
    auraLight.intensity = 0.24 + pulse * 0.4;
    frontFill.intensity = 0.14 + pulse * 0.22;
    magFill.intensity = 0.08 + pulse * 0.18;
    if (aura && aura.visible) {
      const rec = aura.userData.cwAura;
      const pos = rec.positions;
      const swell = 1 + pulse * 0.4;
      for (let i = 0; i < rec.seeds.length; i++) {
        const s = rec.seeds[i];
        const a = t * s.speed + s.phase;
        const r = s.radius * swell;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = s.y0 + 0.055 * Math.sin(a * 1.3) + (dance && dance.active ? dance.hop * 0.06 : 0);
        pos[i * 3 + 2] = Math.sin(a * 0.92) * r;
      }
      aura.geometry.attributes.position.needsUpdate = true;
      aura.material.opacity = 0.85 + pulse * 0.35;
      aura.material.size = 0.068 * (1 + pulse * 0.25);
    }
  }

  function setIris(rgb, glow) {
    const r = rgb && rgb.r != null ? rgb.r : 0.90;
    const g = rgb && rgb.g != null ? rgb.g : 0.55;
    const b = rgb && rgb.b != null ? rgb.b : 1.0;
    const gl = glow == null ? 1 : Math.max(0, Math.min(1.4, Number(glow)));
    for (const sh of shaders) {
      if (sh.uniforms.uIris) sh.uniforms.uIris.value = [r, g, b];
      if (sh.uniforms.uIrisGlow) sh.uniforms.uIrisGlow.value = gl;
    }
    for (const h of halos) {
      if (h.userData && h.userData.cwHalo && h.userData.cwHalo.eye && h.material && h.material.color) {
        h.material.color.setRGB(r, g, b);
        h.material.opacity = 0.55 + 0.4 * gl;
      }
    }
  }

  function setFurFollow(v) {
    const x = v && v.x != null ? v.x : (Array.isArray(v) ? v[0] : 0);
    const y = v && v.y != null ? v.y : (Array.isArray(v) ? v[1] : 0);
    const z = v && v.z != null ? v.z : (Array.isArray(v) ? v[2] : 0);
    for (const sh of shaders) {
      if (sh.uniforms.uFurFollow) sh.uniforms.uFurFollow.value = [x, y, z];
    }
  }

  return { update, setQuality: pushQuality, setIris, setFurFollow, get quality() { return q; } };

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
