// Enrich the sculpted Moonwraith — do not replace him. Layered fur shells
// and a few short tuft fins along the ears, tail and chest, plus follow-
// through from the same spring-damper family as physics.mjs. The base fur
// and eye shaders (AO, moon rim, cyan/violet sheen, iris gradient, wet
// glint) live in cosmic.mjs so the recorded iris color stays in one place.
// Seeded with mulberry32. No Math.random. No new network calls.
import { mulberry32 } from './motion.mjs';

export const FUR_SHELLS = Object.freeze({ high: 3, med: 2, low: 0 });
export const FUR_TUFTS = Object.freeze({ high: 8, med: 5, low: 0 });

const FUR_RE = /zeref_fur|fur/i;
const MOON_DIR = { x: 0.55, y: 0.70, z: -0.45 };

function hashInt(hex) {
  const s = String(hex || 'zeref');
  let n = 2166136261;
  for (let i = 0; i < s.length; i++) n = Math.imul(n ^ s.charCodeAt(i), 16777619) >>> 0;
  return n || 1;
}

function stepSpring(s, tx, ty, tz, stiffness, zeta, dt) {
  const w = Math.sqrt(Math.max(0.0001, stiffness));
  const damp = 2 * zeta * w;
  s.vx += ((tx - s.x) * stiffness - s.vx * damp) * dt;
  s.vy += ((ty - s.y) * stiffness - s.vy * damp) * dt;
  s.vz += ((tz - s.z) * stiffness - s.vz * damp) * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;
  return s;
}

function strandTex(THREE) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 128);
  // Deterministic filaments — a few dark-rooted, light-tipped strands.
  const rng = mulberry32(0x46555231); // 'FUR1'
  for (let i = 0; i < 18; i++) {
    const x = 4 + rng() * 56;
    const w = 0.7 + rng() * 1.4;
    const grd = g.createLinearGradient(x, 128, x, 0);
    grd.addColorStop(0, 'rgba(40,20,70,0.0)');
    grd.addColorStop(0.12, 'rgba(70,40,120,0.55)');
    grd.addColorStop(0.55, 'rgba(160,130,220,0.85)');
    grd.addColorStop(0.88, 'rgba(200,230,255,0.55)');
    grd.addColorStop(1, 'rgba(220,240,255,0.0)');
    g.fillStyle = grd;
    g.fillRect(x - w * 0.5, 0, w, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function hookShell(mat, offset, store) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uShellOff = { value: offset };
    shader.uniforms.uFurFollow = shader.uniforms.uFurFollow || { value: [0, 0, 0] };
    shader.uniforms.uMoonDir = shader.uniforms.uMoonDir || { value: [MOON_DIR.x, MOON_DIR.y, MOON_DIR.z] };
    shader.uniforms.uCwTime = shader.uniforms.uCwTime || { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uShellOff;\nuniform vec3 uFurFollow;')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'transformed += objectNormal * uShellOff;',
        'transformed += uFurFollow * (uShellOff * 7.0);',
      ].join('\n'));
    store.push(shader);
  };
  const prevKey = mat.customProgramCacheKey;
  // The default Three cache key reads `this`; call it with the material, never loose.
  mat.customProgramCacheKey = function furShellKey() {
    const base = (typeof prevKey === 'function') ? (prevKey.call(this) || 'fur') : 'fur';
    return String(base) + '-shell-' + offset.toFixed(4);
  };
  mat.needsUpdate = true;
}

function groupGeometry(THREE, geo, group) {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    out.setAttribute(name, geo.attributes[name]);
  }
  if (geo.index) {
    const arr = geo.index.array.subarray(group.start, group.start + group.count);
    out.setIndex(new THREE.BufferAttribute(arr.slice(), 1));
  }
  if (geo.morphAttributes) {
    out.morphAttributes = geo.morphAttributes;
    out.morphTargetsRelative = geo.morphTargetsRelative;
  }
  if (geo.boundingBox) out.boundingBox = geo.boundingBox;
  if (geo.boundingSphere) out.boundingSphere = geo.boundingSphere;
  return out;
}

function furMeshes(THREE, model) {
  const out = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (!Array.isArray(o.material)) {
      const n = ((o.material && o.material.name) || '') + ' ' + (o.name || '');
      if (FUR_RE.test(n)) out.push({ mesh: o, material: o.material, geometry: o.geometry });
      return;
    }
    const groups = (o.geometry && o.geometry.groups) || [];
    o.material.forEach((mat, i) => {
      if (!mat || !FUR_RE.test(mat.name || '')) return;
      const g = groups.find((gr) => gr.materialIndex === i);
      const geometry = g ? groupGeometry(THREE, o.geometry, g) : o.geometry;
      out.push({ mesh: o, material: mat, geometry });
    });
  });
  return out;
}

/**
 * Layer shells and tufts on the already-dressed Moonwraith. `bones` is the
 * named-bone map from moonwraith3d.mjs so tufts ride the ears, tail and chest.
 */
export function enrichFur(THREE, model, {
  seedHex = 'zeref',
  quality = 'med',
  bones = {},
  cosmic = null,
  reducedMotion = false,
} = {}) {
  const group = new THREE.Group();
  group.name = 'zeref-fur';
  model.add(group);
  const rng = mulberry32(hashInt(seedHex));
  const shaders = [];
  const shells = [];
  const tufts = [];
  const tex = strandTex(THREE);
  const sources = furMeshes(THREE, model);
  const maxShells = FUR_SHELLS.high;
  const offsets = [0.0045, 0.009, 0.014];

  for (const src of sources) {
    for (let i = 0; i < maxShells; i++) {
      const mat = (src.material.clone ? src.material.clone() : src.material);
      mat.transparent = true;
      mat.depthWrite = false;
      mat.side = THREE.FrontSide;
      if ('alphaMap' in mat) mat.alphaMap = tex;
      if ('map' in mat && !mat.map) mat.map = tex;
      mat.opacity = 0.42 - i * 0.08;
      hookShell(mat, offsets[i], shaders);
      let shell;
      if (src.mesh.isSkinnedMesh && src.mesh.skeleton) {
        shell = new THREE.SkinnedMesh(src.geometry, mat);
        shell.bind(src.mesh.skeleton, src.mesh.bindMatrix);
      } else {
        shell = new THREE.Mesh(src.geometry, mat);
      }
      shell.name = 'zeref-fur-shell-' + i;
      shell.frustumCulled = false;
      shell.castShadow = false;
      shell.receiveShadow = false;
      shell.renderOrder = (src.renderOrder || 0) + i + 1;
      (src.mesh.parent || model).add(shell);
      shells.push(shell);
    }
  }

  // Short tuft fins on ears, tail and chest — ride the bones, spring-sway.
  const TUFT_SPEC = [
    { bone: 'ear1L', local: [0.012, 0.018, 0.000], len: 0.028, ang: 0.4 },
    { bone: 'ear1R', local: [-0.012, 0.018, 0.000], len: 0.028, ang: -0.4 },
    { bone: 'ear0L', local: [0.016, 0.008, 0.004], len: 0.022, ang: 0.25 },
    { bone: 'ear0R', local: [-0.016, 0.008, 0.004], len: 0.022, ang: -0.25 },
    { bone: 'tail4', local: [0.000, 0.000, -0.012], len: 0.034, ang: 0.15 },
    { bone: 'tail3', local: [0.010, 0.000, -0.006], len: 0.026, ang: 0.2 },
    { bone: 'tail2', local: [-0.010, 0.000, -0.006], len: 0.024, ang: -0.18 },
    { bone: 'chest', local: [0.000, 0.018, 0.028], len: 0.022, ang: 0.0 },
  ];
  const tuftGeo = new THREE.ConeGeometry(0.007, 1, 5, 1, false);
  tuftGeo.translate(0, 0.5, 0); // base at the skin, tip outward
  for (let i = 0; i < TUFT_SPEC.length; i++) {
    const spec = TUFT_SPEC[i];
    const parent = bones[spec.bone];
    if (!parent) continue;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a1848,
      emissive: 0x67e8f9,
      emissiveIntensity: 0.18,
      roughness: 0.85,
      metalness: 0.04,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(tuftGeo, mat);
    mesh.position.set(spec.local[0], spec.local[1], spec.local[2]);
    // Point the tuft roughly outward from the body (local +Y after a tilt).
    mesh.rotation.z = spec.ang;
    mesh.rotation.x = -0.35 + rng() * 0.2;
    mesh.scale.set(0.9 + rng() * 0.25, spec.len, 0.9 + rng() * 0.25);
    mesh.castShadow = false;
    mesh.userData.spring = { x: 0, v: 0 };
    mesh.userData.phase = rng() * Math.PI * 2;
    mesh.userData.stiff = 36 + rng() * 16;
    mesh.userData.baseZ = mesh.rotation.z;
    mesh.userData.baseX = mesh.rotation.x;
    parent.add(mesh);
    tufts.push(mesh);
  }

  // Bone trackers for follow-through (ears, tail tip, chest, head).
  const trackNames = ['head', 'chest', 'tail4', 'ear1L', 'ear1R'];
  const tracks = [];
  const _w = new THREE.Vector3();
  for (const name of trackNames) {
    const b = bones[name];
    if (!b) continue;
    b.getWorldPosition(_w);
    tracks.push({ bone: b, px: _w.x, py: _w.y, pz: _w.z, spring: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 } });
  }
  const follow = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };

  let qName = quality;
  function applyQuality(q) {
    qName = q;
    const nShell = FUR_SHELLS[q] != null ? FUR_SHELLS[q] : FUR_SHELLS.med;
    const nTuft = FUR_TUFTS[q] != null ? FUR_TUFTS[q] : FUR_TUFTS.med;
    for (let i = 0; i < shells.length; i++) {
      // shells are grouped by source then layer: visible if layer < nShell
      const layer = i % maxShells;
      shells[i].visible = layer < nShell;
    }
    for (let i = 0; i < tufts.length; i++) tufts[i].visible = i < nTuft;
  }
  applyQuality(quality);

  function pushFollow(v) {
    for (const sh of shaders) {
      if (sh.uniforms.uFurFollow) sh.uniforms.uFurFollow.value = [v.x, v.y, v.z];
      if (sh.uniforms.uMoonDir) sh.uniforms.uMoonDir.value = [MOON_DIR.x, MOON_DIR.y, MOON_DIR.z];
    }
    if (cosmic && typeof cosmic.setFurFollow === 'function') cosmic.setFurFollow(v);
  }

  function update(t, sig, { reducedMotion: rm = reducedMotion, dt = 1 / 60 } = {}) {
    const dtC = Math.min(0.05, Math.max(0.001, dt));
    const playing = !!(sig && sig.playing);
    const bass = playing ? (sig.bass || 0) : 0;
    const mid = playing ? (sig.mid || 0) : 0;
    const high = playing ? (sig.high || 0) : 0;
    const kick = playing ? (sig.kickHit || sig.kick || 0) : 0;
    const move = rm ? 0 : 1;

    // Follow-through: fur lags bone motion, plus an audio ripple.
    let vx = 0, vy = 0, vz = 0, n = 0;
    for (const tr of tracks) {
      tr.bone.getWorldPosition(_w);
      const dx = (_w.x - tr.px) / dtC;
      const dy = (_w.y - tr.py) / dtC;
      const dz = (_w.z - tr.pz) / dtC;
      tr.px = _w.x; tr.py = _w.y; tr.pz = _w.z;
      // Target is a lag of the bone velocity (opposite the move).
      stepSpring(tr.spring, -dx * 0.06, -dy * 0.06, -dz * 0.06, 28, 0.42, dtC);
      vx += tr.spring.x; vy += tr.spring.y; vz += tr.spring.z; n += 1;
    }
    const inv = n ? 1 / n : 0;
    const audioX = (playing ? (mid - 0.5) * 0.025 + high * 0.012 * Math.sin(t * 11) : 0.006 * Math.sin(t * 1.4));
    const audioY = (playing ? bass * 0.03 + kick * 0.04 : 0.008 * Math.sin(t * 0.9));
    const audioZ = (playing ? (bass * 0.01 - mid * 0.008) : 0.004 * Math.cos(t * 1.1));
    stepSpring(follow, (vx * inv + audioX) * move, (vy * inv + audioY) * move, (vz * inv + audioZ) * move, 22, 0.45, dtC);
    pushFollow(follow);

    for (const sh of shaders) {
      if (sh.uniforms.uCwTime) sh.uniforms.uCwTime.value = t;
    }

    for (let i = 0; i < tufts.length; i++) {
      const tu = tufts[i];
      if (!tu.visible) continue;
      const target = rm ? 0 : (
        playing
          ? (bass * 0.22 + kick * 0.35 + high * 0.12) * Math.sin((sig.musicPhase || t) * 2.2 + tu.userData.phase)
          : 0.06 * Math.sin(t * 1.1 + tu.userData.phase)
      );
      const s = tu.userData.spring;
      const stiff = tu.userData.stiff;
      const w = Math.sqrt(stiff);
      const damp = 2 * 0.4 * w;
      s.v += ((target * move) - s.x) * stiff * dtC - s.v * damp * dtC;
      s.x += s.v * dtC;
      tu.rotation.z = tu.userData.baseZ + s.x;
      tu.rotation.x = tu.userData.baseX + s.x * 0.45 + follow.x * 0.8;
      if (tu.material && 'emissiveIntensity' in tu.material) {
        tu.material.emissiveIntensity = 0.14 + (playing ? bass * 0.2 + high * 0.15 : 0.04 + 0.06 * Math.sin(t * 1.3 + i));
      }
    }
  }

  return { update, setQuality: applyQuality, get quality() { return qName; }, follow };
}
