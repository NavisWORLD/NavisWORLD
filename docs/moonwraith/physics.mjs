// Per-bone spring-damper physics for the chat-area Moonwraith.
// Audio features are applied as forces and torques, never as pose targets.
// Fixed 120 Hz semi-implicit Euler, deterministic, no Math.random.
// Motion travels down each chain because a child inherits its parent's
// angular acceleration (inertial lag), so a kick on the spine becomes a
// wave through the neck, head, and tail with overlap and follow-through.
//
// He is a floating cosmic creature: gravityScale is nearly zero on the
// body, with only a tiny droop on the tail and ears. A strong spring
// restores root, spine and head to the upright/hover rest pose.
// Chains are underdamped (zeta 0.35–0.5) so waves overshoot. Head roll
// is clamped to 15 degrees. Scale squash is not applied here — the
// renderer clamps total scale to 0.9–1.1 and must not stack the old
// pose-target squash on top of this simulation.

export const HEAD_ROLL_MAX = 15 * Math.PI / 180; // ~15 degrees; never more

export function dampingFor(mass, stiffness, zeta) {
  return 2 * zeta * Math.sqrt(Math.max(0, stiffness * mass));
}

export const PHYSICS = {
  hz: 120,
  maxSubsteps: 8,
  gravity: 9.8,
  leak: 0.82, // same river leak as the COSMOS performance state
  restitution: 0,
  headRollMax: HEAD_ROLL_MAX,
  // Underdamped so waves overshoot, then the upright spring brings him back.
  root: {
    mass: 1.4,
    stiffness: 62,       // strong hover-height restore
    zeta: 0.45,
    gravityScale: 0.02,  // nearly weightless
    restY: 0.035,        // slight hover, not a slump on the floor
    limitY: 0.16,
    limitX: 0.08,
  },
  // mass is inertia. inherit is how strongly a child lags a parent's alpha.
  // zeta 0.35–0.5 (underdamped). gravityScale is ~0 on the body.
  chains: {
    spine: {
      names: ['spine', 'chest', 'neck', 'head'],
      mass: [1.15, 1.0, 0.62, 0.42],
      stiffness: [58, 54, 50, 56], // strong upright restore
      zeta: 0.42,
      limit: [0.28, 0.30, 0.32, 0.35],
      rollLimit: [0.16, 0.18, 0.22, HEAD_ROLL_MAX],
      gravityScale: [0.01, 0.01, 0.015, 0.02],
      inherit: 0.85,
    },
    tail: {
      names: ['tail0', 'tail1', 'tail2', 'tail3', 'tail4'],
      mass: [0.55, 0.42, 0.32, 0.24, 0.18],
      stiffness: [16, 12, 9, 7, 5],
      zeta: 0.36,
      limit: [0.9, 1.05, 1.2, 1.35, 1.5],
      gravityScale: [0.02, 0.022, 0.025, 0.028, 0.03], // tiny droop only
      inherit: 0.95,
    },
    wingL: {
      names: ['wing0L', 'wing1L', 'wing2L'],
      mass: [0.5, 0.32, 0.2],
      stiffness: [20, 14, 10],
      zeta: 0.36,
      limit: [1.1, 1.25, 1.4],
      gravityScale: [0.01, 0.012, 0.015],
      inherit: 0.9,
    },
    wingR: {
      names: ['wing0R', 'wing1R', 'wing2R'],
      mass: [0.5, 0.32, 0.2],
      stiffness: [20, 14, 10],
      zeta: 0.36,
      limit: [1.1, 1.25, 1.4],
      gravityScale: [0.01, 0.012, 0.015],
      inherit: 0.9,
    },
    earL: {
      names: ['ear0L', 'ear1L'],
      mass: [0.22, 0.14],
      stiffness: [28, 20],
      zeta: 0.4,
      limit: [0.55, 0.7],
      gravityScale: [0.02, 0.03],
      inherit: 0.9,
    },
    earR: {
      names: ['ear0R', 'ear1R'],
      mass: [0.22, 0.14],
      stiffness: [28, 20],
      zeta: 0.4,
      limit: [0.55, 0.7],
      gravityScale: [0.02, 0.03],
      inherit: 0.9,
    },
    legL: {
      names: ['legL', 'pawL'],
      mass: [0.7, 0.28],
      stiffness: [40, 30],
      zeta: 0.45,
      limit: [0.55, 0.45],
      gravityScale: [0.01, 0.015],
      inherit: 0.8,
    },
    legR: {
      names: ['legR', 'pawR'],
      mass: [0.7, 0.28],
      stiffness: [40, 30],
      zeta: 0.45,
      limit: [0.55, 0.45],
      gravityScale: [0.01, 0.015],
      inherit: 0.8,
    },
  },
  // Display-unit newtons / newton-metres. Applied to joints, not written as poses.
  forces: {
    voiceLift: 28,
    kickImpulse: 70,
    bassHold: 12,
    midSpine: 10,
    fluxEar: 16,
    fluxTail: 24,
    tensionWing: 28,
    hatWing: 18,
    snareHead: 14,
    phaseNod: 22,
    pitchGaze: 12,
    memoryAmp: 0.55,
    quietFloor: 4,
    drift: 6,
    stepLeg: 18,
    hoverHold: 8,
    hoverBob: 10,
    undulate: 7,
  },
};

function makeJoint(mass, stiffness, zeta, limit, gravityScale, rollLimit) {
  return {
    mass,
    k: stiffness,
    c: dampingFor(mass, stiffness, zeta),
    zeta,
    limit,
    rollLimit: rollLimit == null ? limit : rollLimit,
    gScale: gravityScale,
    th: [0, 0, 0],
    w: [0, 0, 0],
    alpha: [0, 0, 0],
  };
}

export function makeRig() {
  const r = PHYSICS.root;
  r.damping = dampingFor(r.mass, r.stiffness, r.zeta);
  const chains = {};
  for (const [key, spec] of Object.entries(PHYSICS.chains)) {
    chains[key] = spec.names.map((_, i) => makeJoint(
      spec.mass[i],
      spec.stiffness[i],
      spec.zeta,
      spec.limit[i],
      spec.gravityScale[i],
      spec.rollLimit ? spec.rollLimit[i] : spec.limit[i],
    ));
  }
  return {
    acc: 0,
    rootY: r.restY || 0, rootVy: 0, rootAy: 0,
    rootX: 0, rootVx: 0, rootAx: 0,
    chains,
    energy: 0,
  };
}

function clampAxis(j, axis) {
  const lim = axis === 2 ? j.rollLimit : j.limit;
  if (j.th[axis] > lim) { j.th[axis] = lim; j.w[axis] = 0; }
  else if (j.th[axis] < -lim) { j.th[axis] = -lim; j.w[axis] = 0; }
}

function stepJoint(j, ext, dt, parentAlpha, inherit) {
  for (let a = 0; a < 3; a++) {
    let tau = -j.k * j.th[a] - j.c * j.w[a] + (ext[a] || 0);
    if (a === 0) tau += j.mass * PHYSICS.gravity * j.gScale * Math.sin(j.th[a]);
    if (parentAlpha) tau -= inherit * parentAlpha[a] * j.mass;
    const alpha = tau / j.mass;
    j.w[a] += alpha * dt;
    j.th[a] += j.w[a] * dt;
    clampAxis(j, a);
    j.alpha[a] = alpha;
  }
}

function stepChain(joints, inherit, forcesByIndex, dt) {
  let parentAlpha = null;
  for (let i = 0; i < joints.length; i++) {
    const ext = forcesByIndex[i] || [0, 0, 0];
    stepJoint(joints[i], ext, dt, parentAlpha, inherit);
    parentAlpha = joints[i].alpha;
  }
}

function stepRoot(rig, fy, fx, dt) {
  const r = PHYSICS.root;
  const restY = r.restY || 0;
  const c = r.damping == null ? dampingFor(r.mass, r.stiffness, r.zeta || 0.45) : r.damping;
  const ay = (fy / r.mass) - PHYSICS.gravity * r.gravityScale - (r.stiffness / r.mass) * (rig.rootY - restY) - (c / r.mass) * rig.rootVy;
  rig.rootVy += ay * dt;
  rig.rootY += rig.rootVy * dt;
  if (rig.rootY > r.limitY) { rig.rootY = r.limitY; rig.rootVy = 0; }
  if (rig.rootY < 0) { rig.rootY = 0; rig.rootVy = Math.max(0, rig.rootVy); }
  rig.rootAy = ay;
  const ax = (fx / r.mass) - (r.stiffness / r.mass) * rig.rootX - (r.damping / r.mass) * rig.rootVx;
  rig.rootVx += ax * dt;
  rig.rootX += rig.rootVx * dt;
  if (rig.rootX > r.limitX) { rig.rootX = r.limitX; rig.rootVx = 0; }
  if (rig.rootX < -r.limitX) { rig.rootX = -r.limitX; rig.rootVx = 0; }
  rig.rootAx = ax;
}

export function audioForces(sig) {
  const c = sig.cosmos || sig.v || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const F = PHYSICS.forces;
  const mem = 1 + F.memoryAmp * (c[11] || 0);
  const play = !!sig.playing;
  const floor = play ? F.quietFloor : 0;
  const side = sig.earSide || 1;
  const pc = (sig.pitchPc != null ? sig.pitchPc : (sig.chromaPc || 0));
  const gaze = Math.sin((pc * Math.PI) / 6);
  const phase = (c[8] != null && sig.useGrid) ? c[8] : (sig.useGrid ? (sig.beatPhase || 0) : 0);
  const coh = c[3] || 0;
  const energy = c[0] || 0;
  const flux = c[2] || 0;
  const lock = c[1] || 0;
  const tension = c[10] || 0;
  const kickI = sig.kickHit || 0;
  const snareI = sig.snareHit || 0;
  const hatI = sig.hatHit || 0;
  const bass = sig.bass || 0;
  const mid = sig.mid || 0;
  const high = sig.high || 0;
  const nod = F.phaseNod * coh * Math.sin(phase * Math.PI * 2);
  const clock = sig.musicPhase || 0;
  const step = (sig.useGrid ? Math.sin((sig.beatPhase || 0) * Math.PI * 2) : Math.sin(clock)) * (0.5 + energy);
  // Slow river-driven hover / undulation (synaptic memory + energy + flux).
  // Clock is the music clock, not wall time.
  const river = (c[11] || 0) * 0.5 + energy * 0.35 + flux * 0.15;
  const slow = clock * 0.45;
  const hover = play ? ((F.hoverHold || 0) * (0.35 + river) + (F.hoverBob || 0) * river * Math.sin(slow)) : 0;
  const und = play ? (F.undulate || 0) * (0.25 + river) : 0;

  const z = (p, y, r) => [p * mem, y * mem, r * mem];
  return {
    rootY: mem * (F.voiceLift * energy + F.kickImpulse * kickI + F.bassHold * bass + floor * (0.35 + energy) + hover),
    rootX: mem * F.drift * (bass * 0.7 + energy * 0.3) * ((sig.sway || 0) + gaze * 0.25),
    spine: [
      z(-F.kickImpulse * 0.25 * kickI - F.bassHold * 0.15 * bass - F.midSpine * mid * 0.2 + und * Math.sin(slow), F.midSpine * (sig.sway || 0) * 0.5 + und * 0.35 * Math.sin(slow * 0.7), F.snareHead * 0.2 * snareI * side),
      z(-F.midSpine * mid * 0.35 + und * 0.8 * Math.sin(slow + 0.4), F.midSpine * (sig.sway || 0) * 0.35, 0),
      z(nod * 0.45 + und * 0.5 * Math.sin(slow + 0.8), F.pitchGaze * lock * gaze * 0.45, F.snareHead * 0.25 * snareI * side),
      z(nod * 0.6 + F.snareHead * 0.1 * (sig.snare || 0), F.pitchGaze * lock * gaze, F.snareHead * 0.35 * snareI * side),
    ],
    tail: [
      z(F.fluxTail * flux * 0.35 + F.kickImpulse * 0.12 * kickI, F.fluxTail * (0.4 + bass) * side * 0.4, F.hatWing * hatI * 0.2),
      z(F.fluxTail * flux * 0.3, F.fluxTail * (0.4 + bass) * side * 0.55, 0),
      z(0, F.fluxTail * high * side * 0.4 + F.hatWing * hatI * 0.35 * side, F.fluxTail * flux * 0.2 * side),
      z(0, F.fluxTail * high * side * 0.55 + F.hatWing * hatI * 0.5 * side, F.hatWing * hatI * 0.2),
      z(0, F.fluxTail * high * side * 0.7 + F.hatWing * hatI * 0.7 * side, F.hatWing * hatI * 0.3),
    ],
    wingL: [
      z(F.tensionWing * tension * 0.35, -F.tensionWing * (0.4 + lock) * 0.25, -(F.tensionWing * (0.5 + energy) + F.hatWing * hatI)),
      z(0, -F.tensionWing * 0.15, -(F.tensionWing * (0.35 + energy) * 0.7 + F.hatWing * hatI * 0.5)),
      z(F.hatWing * hatI * 0.2, 0, -(F.hatWing * (hatI + high) * 0.8)),
    ],
    wingR: [
      z(F.tensionWing * tension * 0.35, F.tensionWing * (0.4 + lock) * 0.25, F.tensionWing * (0.5 + energy) + F.hatWing * hatI),
      z(0, F.tensionWing * 0.15, F.tensionWing * (0.35 + energy) * 0.7 + F.hatWing * hatI * 0.5),
      z(F.hatWing * hatI * 0.2, 0, F.hatWing * (hatI + high) * 0.8),
    ],
    earL: [
      z(-F.fluxEar * (mid * 0.5 + flux) * (side > 0 ? 1 : 0.35), 0, F.fluxEar * (mid * 0.4 + flux) * (side > 0 ? 1 : 0.35)),
      z(-F.fluxEar * mid * 0.35, 0, F.fluxEar * (flux + (sig.earFlick || 0)) * 0.5),
    ],
    earR: [
      z(-F.fluxEar * (mid * 0.5 + flux) * (side < 0 ? 1 : 0.35), 0, -F.fluxEar * (mid * 0.4 + flux) * (side < 0 ? 1 : 0.35)),
      z(-F.fluxEar * mid * 0.35, 0, -F.fluxEar * (flux + (sig.earFlick || 0)) * 0.5),
    ],
    legL: [
      z(F.stepLeg * Math.max(0, step) + F.kickImpulse * 0.2 * kickI, 0, 0),
      z(F.stepLeg * 0.45 * Math.max(0, step) + F.kickImpulse * 0.1 * kickI, 0, 0),
    ],
    legR: [
      z(F.stepLeg * Math.max(0, -step) + F.kickImpulse * 0.2 * kickI, 0, 0),
      z(F.stepLeg * 0.45 * Math.max(0, -step) + F.kickImpulse * 0.1 * kickI, 0, 0),
    ],
  };
}

function kinetic(rig) {
  let e = PHYSICS.root.mass * (rig.rootVy * rig.rootVy + rig.rootVx * rig.rootVx);
  e += PHYSICS.root.stiffness * (rig.rootY * rig.rootY + rig.rootX * rig.rootX);
  for (const joints of Object.values(rig.chains)) {
    for (const j of joints) {
      e += j.mass * (j.w[0] * j.w[0] + j.w[1] * j.w[1] + j.w[2] * j.w[2]);
      e += j.k * (j.th[0] * j.th[0] + j.th[1] * j.th[1] + j.th[2] * j.th[2]);
    }
  }
  return e;
}

export function stepPhysics(rig, forces, dt) {
  if (!rig) return makeRig();
  if (!dt || dt <= 0) return rig;
  rig.acc += Math.min(0.05, dt);
  const h = 1 / PHYSICS.hz;
  let guard = 0;
  const f = forces || {};
  while (rig.acc >= h && guard++ < PHYSICS.maxSubsteps) {
    stepRoot(rig, f.rootY || 0, f.rootX || 0, h);
    for (const [key, joints] of Object.entries(rig.chains)) {
      const inherit = PHYSICS.chains[key].inherit;
      stepChain(joints, inherit, f[key] || [], h);
    }
    rig.acc -= h;
  }
  rig.energy = kinetic(rig);
  return rig;
}

export function resetRig(rig) {
  const next = makeRig();
  if (rig) next.acc = 0;
  return next;
}

const NAME_OF = {};
for (const [key, spec] of Object.entries(PHYSICS.chains)) {
  spec.names.forEach((name, i) => { NAME_OF[name] = [key, i]; });
}

export function readPose(rig) {
  const joints = {};
  if (!rig) return { hop: 0, driftX: 0, lean: 0, joints, energy: 0 };
  for (const [name, loc] of Object.entries(NAME_OF)) {
    const j = rig.chains[loc[0]][loc[1]];
    joints[name] = [j.th[0], j.th[1], j.th[2]];
  }
  const head = joints.head || [0, 0, 0];
  const neck = joints.neck || [0, 0, 0];
  return {
    hop: rig.rootY,
    driftX: rig.rootX,
    lean: (joints.spine ? joints.spine[0] : 0) * 0.25,
    headPitch: head[0] + neck[0] * 0.4,
    headYaw: head[1] + neck[1] * 0.4,
    headRoll: Math.max(-HEAD_ROLL_MAX, Math.min(HEAD_ROLL_MAX, head[2] + neck[2] * 0.4)),
    spinePitch: joints.spine ? joints.spine[0] : 0,
    spineYaw: joints.spine ? joints.spine[1] : 0,
    spineRoll: joints.spine ? joints.spine[2] : 0,
    chestPitch: joints.chest ? joints.chest[0] : 0,
    chestYaw: joints.chest ? joints.chest[1] : 0,
    joints,
    energy: rig.energy || 0,
  };
}
