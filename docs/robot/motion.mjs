// Zeref Spark motion planner.
// Choice and order of moves come from SHA-256 of Zeref's recorded state
// (zeref/live.json: heartbeat, diary, spark, brain, last-said time, fetched_at),
// then a mulberry32 PRNG seeded only with the first 4 bytes of that digest.
// No Math.random, no wall-clock chance, no fake liveness. The same recorded
// state always yields the same sequence; a later refresh of the live card
// yields a different one. Limb, head and ear motion is SIMULATED: those parts
// are static in the CAD, and the caption says so. Shell open/close follows
// the real split on the design's y=0 seam.
//
// Label: "moves chosen from Zeref's recorded state · SIMULATED motion".
// Concept design, not built hardware. Zeref is a digital creature.

export const ZERO_POSE = Object.freeze({
  open: 0,
  yaw: 0.6,
  headYaw: 0,
  headPitch: 0,
  earL: 0,
  earR: 0,
  armL: 0,
  armR: 0,
  legL: 0,
  legR: 0,
});

const MOOD_BAGS = {
  content: ['pause', 'turn', 'look', 'ear', 'open', 'close', 'arm', 'pause', 'peek', 'turn'],
  sleepy: ['pause', 'pause', 'look', 'close', 'peek', 'ear', 'turn', 'pause'],
  tired: ['pause', 'pause', 'look', 'close', 'peek', 'ear', 'turn', 'pause'],
  curious: ['open', 'arm', 'turn', 'peek', 'ear', 'look', 'arm', 'close', 'turn', 'look'],
  excited: ['open', 'arm', 'turn', 'peek', 'ear', 'look', 'wave', 'close', 'turn'],
  playful: ['arm', 'peek', 'turn', 'ear', 'open', 'wave', 'look', 'close', 'turn'],
  calm: ['pause', 'look', 'turn', 'ear', 'peek', 'close', 'pause', 'open'],
  default: ['open', 'close', 'turn', 'look', 'arm', 'pause', 'ear', 'peek', 'shift'],
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
    'zeref-spark-motion/v1',
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

/** Station LED channel 0..2, offset by the recorded spark tick so a later tick shifts the cycle. */
export function stationAt(t, sparkTick = 0) {
  const base = (Number(sparkTick) || 0) >>> 0;
  return (base + Math.floor((((t % 6) + 6) % 6) / 2)) % 3;
}

export function poseAt(plan, t) {
  const L = plan.duration;
  if (!L) return copyPose(plan.acts[0] ? plan.acts[0].from : ZERO_POSE);
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

function bagFor(mood) {
  const k = String(mood || '').toLowerCase();
  return MOOD_BAGS[k] || MOOD_BAGS.default;
}

function captionFor(live, hex) {
  const hb = live.heartbeat || {};
  const dy = live.diary || {};
  const sp = live.spark || {};
  const bits = ['moves chosen from Zeref\'s recorded state', 'SIMULATED motion'];
  if (hb.recorded_tick != null) bits.push('heartbeat tick ' + hb.recorded_tick + ' (SIMULATED)');
  if (dy.mood) bits.push('diary ' + dy.mood + ' (RECORDED)');
  if (sp.tick != null) bits.push('spark tick ' + sp.tick + (sp.label ? ' (' + shortLabel(sp.label) + ')' : ''));
  if ((live.brain || {}).live_step != null) bits.push('brain step ' + live.brain.live_step + ' (PINNED)');
  if (live.fetched_at) bits.push('as of ' + live.fetched_at);
  else bits.push('recorded state unavailable · fallback seed ' + hex.slice(0, 12));
  return bits.join(' · ');
}

function shortLabel(s) {
  const t = String(s);
  if (/LOCAL SIMULATED/i.test(t)) return 'LOCAL SIMULATED';
  if (/SIMULATED/i.test(t)) return 'SIMULATED';
  if (/RECORDED/i.test(t)) return 'RECORDED';
  if (/PINNED/i.test(t)) return 'PINNED';
  return t.split('(')[0].trim().slice(0, 24);
}

export function planFromHex(hex, live = {}) {
  const seed = parseInt(String(hex).slice(0, 8), 16) >>> 0;
  const rnd = mulberry32(seed);
  const hb = live.heartbeat || {};
  const sg = hb.signals || {};
  const dy = live.diary || {};
  const energy = Number(sg.energy);
  const tempo = Number.isFinite(energy) ? (1.15 - 0.3 * Math.min(1, Math.max(0, energy / 100))) : 1;
  const dur = (lo, hi) => (lo + rnd() * (hi - lo)) * tempo;

  const startYaw = 0.25 + rnd() * 1.1;
  let pose = { ...ZERO_POSE, yaw: startYaw };
  const acts = [];
  let t = 0;

  function push(type, to, length) {
    const from = copyPose(pose);
    const t0 = t;
    t += length;
    const end = copyPose(to);
    acts.push({ t0, t1: t, type, from, to: end });
    pose = copyPose(end);
  }

  // The creature always begins closed, then the recorded seed picks what happens next.
  push('hold-closed', copyPose(pose), dur(1.4, 3.2));

  const bag = bagFor(dy.mood);
  const n = 8 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const typ = bag[Math.floor(rnd() * bag.length)];
    const next = copyPose(pose);
    if (typ === 'pause') {
      push('pause', next, dur(0.5, 2.4));
    } else if (typ === 'open') {
      next.open = 0.55 + rnd() * 0.45;
      push('open', next, dur(1.6, 3.2));
    } else if (typ === 'close') {
      next.open = 0;
      push('close', next, dur(1.4, 2.8));
    } else if (typ === 'turn') {
      next.yaw = pose.yaw + (0.4 + rnd() * 1.4) * (rnd() < 0.5 ? -1 : 1);
      push('turn', next, dur(1.2, 2.8));
    } else if (typ === 'look') {
      next.headYaw = (rnd() * 2 - 1) * 0.7;
      next.headPitch = (rnd() * 2 - 1) * 0.35;
      push('look', next, dur(0.8, 1.8));
      if (rnd() < 0.6) {
        const back = copyPose(next);
        back.headYaw = 0;
        back.headPitch = 0;
        push('look-center', back, dur(0.6, 1.4));
      }
    } else if (typ === 'ear') {
      next.earL = (rnd() * 2 - 1) * 0.7;
      next.earR = (rnd() * 2 - 1) * 0.7;
      push('ear', next, dur(0.35, 0.8));
      const back = copyPose(next);
      back.earL = 0;
      back.earR = 0;
      push('ear-back', back, dur(0.35, 0.8));
    } else if (typ === 'arm' || typ === 'wave') {
      const which = rnd();
      if (typ === 'wave' || which < 0.4) {
        next.armL = 0.7 + rnd() * 0.8;
        if (typ === 'wave') next.armR = 0.6 + rnd() * 0.6;
      } else if (which < 0.8) {
        next.armR = 0.7 + rnd() * 0.8;
      } else {
        next.armL = 0.7 + rnd() * 0.7;
        next.armR = 0.7 + rnd() * 0.7;
      }
      if (rnd() < 0.5) next.armL *= -1;
      if (rnd() < 0.5) next.armR *= -1;
      push('arm', next, dur(0.7, 1.6));
      const back = copyPose(next);
      back.armL = 0;
      back.armR = 0;
      push('arm-back', back, dur(0.6, 1.4));
    } else if (typ === 'peek') {
      next.open = 0.22 + rnd() * 0.28;
      push('peek-open', next, dur(0.8, 1.5));
      push('peek-hold', copyPose(next), dur(0.4, 1.2));
      const back = copyPose(next);
      back.open = 0;
      push('peek-close', back, dur(0.8, 1.5));
    } else if (typ === 'shift') {
      next.legL = (rnd() * 2 - 1) * 0.18;
      next.legR = (rnd() * 2 - 1) * 0.18;
      push('shift', next, dur(0.6, 1.3));
      const back = copyPose(next);
      back.legL = 0;
      back.legR = 0;
      push('shift-back', back, dur(0.6, 1.3));
    } else {
      push('pause', next, dur(0.5, 1.2));
    }
  }

  // If the bag happened to skip a whole kind of move, add one of each missing
  // kind from the same seed so the creature still looks around, twitches and
  // waves — timing and direction stay unpredictable, not a fixed loop.
  const kinds = new Set(acts.map((a) => a.type));
  if (![...kinds].some((k) => k === 'arm' || k === 'wave')) {
    const next = copyPose(pose);
    next.armL = (0.7 + rnd() * 0.8) * (rnd() < 0.5 ? -1 : 1);
    next.armR = rnd() < 0.5 ? (0.6 + rnd() * 0.6) * (rnd() < 0.5 ? -1 : 1) : pose.armR;
    push('arm', next, dur(0.7, 1.6));
    const back = copyPose(next); back.armL = 0; back.armR = 0;
    push('arm-back', back, dur(0.6, 1.4));
  }
  if (!kinds.has('look')) {
    const next = copyPose(pose);
    next.headYaw = (rnd() * 2 - 1) * 0.7;
    next.headPitch = (rnd() * 2 - 1) * 0.35;
    push('look', next, dur(0.8, 1.8));
    const back = copyPose(next); back.headYaw = 0; back.headPitch = 0;
    push('look-center', back, dur(0.6, 1.4));
  }
  if (!kinds.has('ear')) {
    const next = copyPose(pose);
    next.earL = (rnd() * 2 - 1) * 0.7;
    next.earR = (rnd() * 2 - 1) * 0.7;
    push('ear', next, dur(0.35, 0.8));
    const back = copyPose(next); back.earL = 0; back.earR = 0;
    push('ear-back', back, dur(0.35, 0.8));
  }

  const needsRest = pose.open > 0.02
    || pose.armL || pose.armR || pose.headYaw || pose.headPitch
    || pose.earL || pose.earR || pose.legL || pose.legR
    || Math.abs(pose.yaw - startYaw) > 0.05;
  if (needsRest) {
    const rest = copyPose(pose);
    rest.open = 0;
    rest.headYaw = 0;
    rest.headPitch = 0;
    rest.earL = 0;
    rest.earR = 0;
    rest.armL = 0;
    rest.armR = 0;
    rest.legL = 0;
    rest.legR = 0;
    rest.yaw = startYaw;
    push('return', rest, dur(1.6, 3.0));
  }
  push('end-closed', copyPose(pose), dur(0.6, 1.4));

  return {
    version: 'zeref-spark-motion/v1',
    digest_hex: String(hex),
    duration: t,
    start_closed: true,
    acts,
    caption: captionFor(live, String(hex)),
    source: {
      fetched_at: live.fetched_at ?? null,
      heartbeat_tick: hb.recorded_tick ?? null,
      heartbeat_label: hb.label ?? null,
      mood: dy.mood ?? null,
      diary_label: dy.label ?? null,
      spark_tick: (live.spark || {}).tick ?? null,
      spark_label: (live.spark || {}).label ?? null,
      brain_step: (live.brain || {}).live_step ?? null,
    },
  };
}

export async function planFromLive(live = {}) {
  const hex = await digestHex(canonicalSeed(live));
  return planFromHex(hex, live);
}

export async function loadLive(urls) {
  const list = urls || [
    LIVE_REMOTE,
    new URL('./motion-seed.json', import.meta.url).href,
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
