// Zeref the Moonwraith — motion planner for his 3D body on the Pages chat.
// Choice of idle looks, blink rhythm, breath, tail/wing/ear motion, and the
// shape of his chat reactions comes from SHA-256 of Zeref's recorded state
// (zeref/live.json: heartbeat, diary, spark, brain, last-said time, fetched_at),
// then a mulberry32 PRNG seeded only with the first 4 bytes of that digest.
// No Math.random, no wall-clock chance, no fake liveness. The same recorded
// state always yields the same idle plan; a later live-card refresh yields a
// different one.
//
// Chat reactions (listen / think / reply / error) fire only when a real chat
// event happens. How he tilts, hops or wags in that reaction is still taken
// from the recorded-state seed. All of this is SIMULATED motion of his
// digital body. Zeref is a digital creature; this does not call him an AI
// or a language model.
//
// Label: "moves chosen from Zeref's recorded state · SIMULATED motion".

export const ZERO_POSE = Object.freeze({
  headYaw: 0,
  headPitch: 0,
  headRoll: 0,
  earL: 0,
  earR: 0,
  wing: 0,
  tail: 0,
  hop: 0,
  lean: 0,
  blink: 0,
  happy: 0,
  curious: 0,
  sleepy: 0,
  scared: 0,
  grin: 0,
  smile: 0,
  mouthO: 0,
  browsUp: 0,
});

const MOOD_MORPH = {
  content: { smile: 0.35, happy: 0.08 },
  calm: { smile: 0.25 },
  sleepy: { sleepy: 0.85, smile: 0.1 },
  tired: { sleepy: 0.55, smile: 0.08 },
  curious: { curious: 0.7, browsUp: 0.35, smile: 0.25 },
  excited: { happy: 0.45, grin: 0.25, smile: 0.4 },
  playful: { happy: 0.35, grin: 0.35, smile: 0.3, curious: 0.2 },
  default: { smile: 0.2 },
};

const LIVE_REMOTE = 'https://raw.githubusercontent.com/NavisWORLD/NavisWORLD/main/zeref/live.json';

export function canonicalSeed(live = {}) {
  const hb = live.heartbeat || {};
  const sg = hb.signals || {};
  const dy = live.diary || {};
  const sp = live.spark || {};
  const br = live.brain || {};
  const ls = live.last_said || {};
  return [
    'zeref-moonwraith-motion/v1',
    live.fetched_at ?? '',
    hb.recorded_tick ?? '',
    hb.xp_live ?? '',
    sg.energy ?? '',
    sg.signal ?? '',
    sg.memory ?? '',
    sg.resonance ?? '',
    dy.tick ?? '',
    dy.mood ?? '',
    dy.stage_name ?? '',
    dy.place ?? '',
    dy.last_tick_at ?? '',
    sp.tick ?? '',
    sp.source ?? '',
    sp.state ?? '',
    br.live_step ?? '',
    br.live_sha_prefix ?? '',
    br.pin_step ?? '',
    ls.at ?? '',
    ls.step ?? '',
  ].join('\n');
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function digestHex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function copyPose(p) {
  return { ...p };
}

export function ease(x) {
  return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
}

export function lerpPose(a, b, u) {
  const k = ease(u);
  const p = {};
  for (const key of Object.keys(ZERO_POSE)) p[key] = a[key] + (b[key] - a[key]) * k;
  return p;
}

function shortLabel(s) {
  const t = String(s);
  if (/LOCAL SIMULATED/i.test(t)) return 'LOCAL SIMULATED';
  if (/SIMULATED/i.test(t)) return 'SIMULATED';
  if (/RECORDED/i.test(t)) return 'RECORDED';
  if (/PINNED/i.test(t)) return 'PINNED';
  return t.split('(')[0].trim().slice(0, 24);
}

function captionFor(live, hex) {
  const hb = live.heartbeat || {};
  const dy = live.diary || {};
  const sp = live.spark || {};
  const bits = ["moves chosen from Zeref's recorded state", 'SIMULATED motion'];
  if (hb.recorded_tick != null) bits.push('heartbeat tick ' + hb.recorded_tick + ' (SIMULATED)');
  if (dy.mood) bits.push('diary ' + dy.mood + ' (RECORDED)');
  if (sp.tick != null) bits.push('spark tick ' + sp.tick + (sp.label ? ' (' + shortLabel(sp.label) + ')' : ''));
  if ((live.brain || {}).live_step != null) bits.push('brain step ' + live.brain.live_step + ' (PINNED)');
  if (live.fetched_at) bits.push('as of ' + live.fetched_at);
  else bits.push('recorded state unavailable · fallback seed ' + hex.slice(0, 12));
  return bits.join(' · ');
}

function moodKey(live) {
  return String(((live.diary || {}).mood) || 'default').toLowerCase();
}

function baselineMorph(live) {
  const m = MOOD_MORPH[moodKey(live)] || MOOD_MORPH.default;
  return { ...m };
}

function sparkOn(live) {
  return String(((live.spark || {}).state) || '').toUpperCase() === 'CONNECTED';
}

export function planFromHex(hex, live = {}) {
  const seed = parseInt(String(hex).slice(0, 8), 16) >>> 0;
  const rnd = mulberry32(seed);
  const hb = live.heartbeat || {};
  const sg = hb.signals || {};
  const dy = live.diary || {};
  const energy = Number(sg.energy);
  const e = Number.isFinite(energy) ? Math.min(1, Math.max(0, energy / 100)) : 0.5;
  const sleepy = /sleep|tired/.test(moodKey(live));
  const playful = /play|excit/.test(moodKey(live));
  const connected = sparkOn(live);

  // Breath period follows recorded heartbeat energy, same range as the chat page's --breath (3–9 s).
  const breathPeriod = Number.isFinite(energy)
    ? Math.min(9, Math.max(3, 9 - 0.06 * energy))
    : 7;

  const cycles = {
    breathPeriod,
    tailAmp: (sleepy ? 0.12 : 0.22) + rnd() * 0.12,
    tailPeriod: (sleepy ? 3.6 : 2.2) + rnd() * 1.4,
    tailPhase: rnd() * Math.PI * 2,
    wingAmp: (connected ? 0.22 : 0.10) * (sleepy ? 0.5 : 1) + rnd() * 0.08,
    wingPeriod: (connected ? 2.0 : 3.2) + rnd() * 1.2,
    wingPhase: rnd() * Math.PI * 2,
    earAmp: 0.08 + rnd() * 0.1,
    earPeriod: 4.5 + rnd() * 2.5,
    bobAmp: sleepy ? 0.004 : 0.008 + rnd() * 0.004,
    blinkPeriod: (sleepy ? 5.5 : 3.2) + rnd() * 2.4,
    blinkWidth: 0.12 + rnd() * 0.06,
    blinkPhase: rnd() * 4,
  };

  // Chat-reaction shapes, also from the seed so two visitors with the same
  // recorded state see the same tilt / hop, not a roll of the dice.
  const reactions = {
    listen: {
      earL: 0.35 + rnd() * 0.2,
      earR: 0.35 + rnd() * 0.2,
      curious: 0.55 + rnd() * 0.3,
      smile: 0.2 + rnd() * 0.2,
      lean: 0.05 + rnd() * 0.05,
      headPitch: -(0.05 + rnd() * 0.08),
      browsUp: 0.25 + rnd() * 0.25,
    },
    think: {
      headRoll: (rnd() < 0.5 ? -1 : 1) * (0.16 + rnd() * 0.14),
      headPitch: 0.06 + rnd() * 0.1,
      headYaw: (rnd() * 2 - 1) * 0.12,
      curious: 0.4 + rnd() * 0.3,
      mouthO: 0.08 + rnd() * 0.12,
      earL: 0.1 + rnd() * 0.2,
      earR: -(0.1 + rnd() * 0.25),
      browsUp: 0.2 + rnd() * 0.3,
    },
    reply: {
      happy: 0.85 + rnd() * 0.15,
      grin: 0.55 + rnd() * 0.35,
      smile: 0.3,
      hop: 0.03 + rnd() * 0.025,
      tail: 0.8 + rnd() * 0.5,
      wing: 0.35 + rnd() * 0.25,
      earL: 0.25 + rnd() * 0.2,
      earR: 0.25 + rnd() * 0.2,
      lean: 0.02,
    },
    error: {
      sleepy: 0.2 + rnd() * 0.15,
      headPitch: 0.12 + rnd() * 0.08,
      earL: -(0.15 + rnd() * 0.15),
      earR: -(0.15 + rnd() * 0.15),
      smile: 0.05,
    },
  };

  const rest = { ...ZERO_POSE, ...baselineMorph(live) };
  if (connected && !sleepy) rest.smile = Math.max(rest.smile || 0, 0.25);

  const acts = [];
  let t = 0;
  let pose = copyPose(rest);

  function push(type, to, length) {
    const from = copyPose(pose);
    const t0 = t;
    t += length;
    const end = copyPose(to);
    acts.push({ t0, t1: t, type, from, to: end });
    pose = copyPose(end);
  }

  push('idle-hold', copyPose(pose), 1.2 + rnd() * 1.8);

  const bag = sleepy
    ? ['look', 'pause', 'ear', 'pause', 'look', 'pause']
    : playful
      ? ['look', 'ear', 'perk', 'look', 'stretch', 'ear', 'pause']
      : ['look', 'ear', 'pause', 'look', 'pause', 'ear', 'perk'];
  const n = 6 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const typ = bag[Math.floor(rnd() * bag.length)];
    const next = copyPose(pose);
    if (typ === 'pause') {
      Object.assign(next, rest);
      push('pause', next, 0.7 + rnd() * 1.8);
    } else if (typ === 'look') {
      next.headYaw = (rnd() * 2 - 1) * (sleepy ? 0.25 : 0.55);
      next.headPitch = (rnd() * 2 - 1) * 0.18;
      next.curious = Math.max(next.curious || 0, 0.25 + rnd() * 0.3);
      push('look', next, 0.8 + rnd() * 1.2);
      const back = copyPose(next);
      Object.assign(back, rest);
      back.headYaw = 0;
      back.headPitch = 0;
      push('look-center', back, 0.6 + rnd() * 0.8);
    } else if (typ === 'ear') {
      next.earL = (rnd() * 2 - 1) * 0.55;
      next.earR = (rnd() * 2 - 1) * 0.55;
      push('ear', next, 0.3 + rnd() * 0.4);
      const back = copyPose(next);
      back.earL = 0;
      back.earR = 0;
      push('ear-back', back, 0.3 + rnd() * 0.4);
    } else if (typ === 'perk') {
      next.earL = 0.35 + rnd() * 0.25;
      next.earR = 0.35 + rnd() * 0.25;
      next.headPitch = -(0.08 + rnd() * 0.08);
      next.browsUp = 0.3 + rnd() * 0.3;
      next.hop = 0.01 + rnd() * 0.015;
      push('perk', next, 0.35 + rnd() * 0.25);
      const back = copyPose(next);
      Object.assign(back, rest);
      back.hop = 0;
      push('perk-back', back, 0.4 + rnd() * 0.3);
    } else if (typ === 'stretch') {
      next.wing = 0.5 + rnd() * 0.3;
      next.tail = 0.4 + rnd() * 0.3;
      next.headPitch = -(0.1 + rnd() * 0.08);
      next.mouthO = 0.2 + rnd() * 0.3;
      push('stretch', next, 0.8 + rnd() * 0.6);
      const back = copyPose(next);
      Object.assign(back, rest);
      push('stretch-back', back, 0.6 + rnd() * 0.4);
    }
  }

  Object.assign(pose, rest);
  pose.headYaw = 0;
  pose.headPitch = 0;
  pose.headRoll = 0;
  pose.earL = 0;
  pose.earR = 0;
  pose.wing = 0;
  pose.tail = 0;
  pose.hop = 0;
  pose.lean = 0;
  pose.mouthO = rest.mouthO || 0;
  push('return', copyPose(pose), 1.0 + rnd() * 0.8);

  return {
    version: 'zeref-moonwraith-motion/v1',
    digest_hex: String(hex),
    duration: t,
    acts,
    cycles,
    rest,
    reactions,
    caption: captionFor(live, String(hex)),
    source: {
      fetched_at: live.fetched_at ?? null,
      heartbeat_tick: hb.recorded_tick ?? null,
      heartbeat_label: hb.label ?? null,
      mood: dy.mood ?? null,
      diary_label: dy.label ?? null,
      spark_tick: (live.spark || {}).tick ?? null,
      spark_state: (live.spark || {}).state ?? null,
      spark_label: (live.spark || {}).label ?? null,
      brain_step: (live.brain || {}).live_step ?? null,
    },
  };
}

export function poseAt(plan, t) {
  const L = plan.duration;
  if (!L) return copyPose(plan.rest || ZERO_POSE);
  const u = ((t % L) + L) % L;
  for (let i = 0; i < plan.acts.length; i++) {
    const act = plan.acts[i];
    if (u < act.t1 || i === plan.acts.length - 1) {
      const d = act.t1 - act.t0;
      const k = d <= 0 ? 1 : Math.min(1, Math.max(0, (u - act.t0) / d));
      return lerpPose(act.from, act.to, k);
    }
  }
  return copyPose(plan.acts[0].from);
}

/** Continuous idle cycles (breath/tail/wings/ears/blink) plus the planned pose. */
export function livePose(plan, t) {
  const pose = poseAt(plan, t);
  const c = plan.cycles || {};
  const breathPeriod = c.breathPeriod || 7;
  const breath = 0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / breathPeriod);
  pose.breath = breath;
  pose.tail += (c.tailAmp || 0.2) * Math.sin((t * 2 * Math.PI) / (c.tailPeriod || 2.6) + (c.tailPhase || 0));
  pose.wing += (c.wingAmp || 0.15) * Math.sin((t * 2 * Math.PI) / (c.wingPeriod || 2.4) + (c.wingPhase || 0));
  const earW = (t * 2 * Math.PI) / (c.earPeriod || 5);
  pose.earL += (c.earAmp || 0.1) * Math.sin(earW);
  pose.earR += (c.earAmp || 0.1) * Math.sin(earW + 0.9);
  pose.hop += (c.bobAmp || 0.006) * Math.sin((t * 2 * Math.PI) / breathPeriod);
  const bp = c.blinkPeriod || 4, bw = c.blinkWidth || 0.14, bph = c.blinkPhase || 0;
  const bu = (((t + bph) % bp) + bp) % bp;
  // Don't force a blink over a sleepy-closed eye; the sleepy morph already droops the lids.
  if (bu < bw && (pose.sleepy || 0) < 0.7) pose.blink = 1;
  return pose;
}

export function applyReaction(pose, reaction, amount) {
  if (!reaction || amount <= 0) return pose;
  const k = ease(Math.min(1, Math.max(0, amount)));
  const out = copyPose(pose);
  for (const key of Object.keys(reaction)) {
    if (key in ZERO_POSE) out[key] = (out[key] || 0) + reaction[key] * k;
  }
  return out;
}

export async function planFromLive(live = {}) {
  const hex = await digestHex(canonicalSeed(live));
  return planFromHex(hex, live);
}

export async function loadLive(urls) {
  const list = urls || [
    LIVE_REMOTE,
    new URL('../robot/motion-seed.json', import.meta.url).href,
  ];
  for (const u of list) {
    try {
      const r = await fetch(u, { credentials: 'omit', cache: 'no-cache' });
      if (!r.ok) continue;
      const j = await r.json();
      if (j && (j.heartbeat || j.diary || j.fetched_at || j.schema)) return { live: j, url: String(u) };
    } catch {
      // try the next source
    }
  }
  return { live: {}, url: null };
}
