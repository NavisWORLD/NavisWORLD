// Dance driver for the Moonwraith on the Pages chat.
// When Cory's song is playing, a Web Audio AnalyserNode reads the same-origin
// <audio> element and the creature's moves come from those live frequency
// bands. No Math.random, no fake beat grid: bass, mids, highs and loudness
// are measured, then scaled by rolling per-band peaks so quiet and loud
// passages both read. Onsets are a rise in a band against its own recent
// flux, not a clock.
//
// Band map (legacy 3-band, still used) plus a tighter rhythm/harmonic map
// in rhythm.mjs, all from the same live FFT:
//   kick 40–120 Hz            -> body hop / squash, anticipated when tempo is confident
//   snare 150–400 + 2–5 kHz   -> head snap / ear flick, ear tips follow through
//   hats 6–12 kHz             -> tail-tip flicks / wing-tip shimmer
//   beat phase (if confident) -> body sway / step cycle; downbeat emphasis every 4
//   low tempo confidence      -> pure onsets, no invented grid
//   harmonic energy           -> wing spread and slow wing beats
//   chroma dominant pitch     -> aura / particle hue (12-color wheel)
//   chord / key change        -> a short turn / pose transition
//   melody (centroid / pitch) -> head tilt / gaze
//   bass / mids / highs / RMS, perk, drop, settle, curious stay as they were
//
// While the song is playing, EVERY animated bone and morph is driven by
// those live features (plus a music clock that advances only as loudness
// and flux move — not a wall-clock idle, not a fake metronome). Recorded
// mood from the live card only scales style and amplitude, never timing.
// Quiet passages get a smaller amplitude; motion does not stop. When the
// song pauses or ends, the seeded idle plan takes over again.
//
// Face and eyes (no eye or jaw bones on the sculpt): lid morphs blink
// and squint on snares, phrase boundaries and downbeats; gaze is head
// and neck aiming from centroid and pitch class; iris / crescent glow
// pulses with bass and RMS on top of the recorded mood tint; mouth_o /
// smile / grin follow mid / vocal energy; brows follow mids; the head
// nods on the beat (or the music clock).
//
// The continuous river of features is Cory's COSMOS Music 12-channel
// performance state (ported from infinite-adaptive-audio-12d-universe-engine,
// leak 0.82). Those signals — plus the live rhythm onsets — are applied as
// forces and torques on a spring-damper bone chain (physics.mjs). The body
// is not posed to a target; motion has mass, stiffness, damping and gravity,
// so a kick on the spine travels into the neck, head, wings and tail.
// Face and eyes stay morph/emissive driven as before (no eye or jaw bones).
//
// Label: "dancing to Cory's song · driven by the live audio signal · SIMULATED motion".
// Signal readout: "live audio signal · beat · harmonics" plus BPM/confidence
// and the current pitch class.
// AudioContext is created and resumed inside the visitor's play tap
// (iPhone Safari will not start a context any other way).

import { makeRhythmState, tickRhythm } from './rhythm.mjs';
import { makeCosmosState, tickCosmos } from './cosmos-audio.mjs';
import { makeRig, audioForces, stepPhysics, readPose, resetRig } from './physics.mjs';

export const DANCE_CAPTION = "dancing to Cory's song · driven by the live audio signal · SIMULATED motion";
export { PITCH_CLASSES, RHYTHM_BANDS, chromaHue, chromaRgb } from './rhythm.mjs';

export const BANDS = Object.freeze({
  bass: [30, 140],
  mid: [250, 2000],
  high: [3500, 10000],
});

const FFT = 2048;
const SMOOTH = 0.38;
const FLOOR = 0.07;
const PEAK_TAU = 2.2; // seconds for a rolling peak to fall toward the floor
const ENV_TAU = 0.055;
const ONSET_GAP = 0.18;
const FLUX_TAU = 0.55;

export function bandMean(bins, sampleRate, fftSize, loHz, hiHz) {
  const n = bins.length;
  const i0 = Math.max(1, Math.floor((loHz * fftSize) / sampleRate));
  const i1 = Math.min(n - 1, Math.ceil((hiHz * fftSize) / sampleRate));
  if (i1 < i0) return 0;
  let s = 0, c = 0;
  for (let i = i0; i <= i1; i++) { s += bins[i]; c++; }
  return c ? s / c : 0;
}

export function rms(samples) {
  if (!samples || !samples.length) return 0;
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / samples.length);
}

/** Instant-attack, slow-decay peak; returns value in 0..1 relative to that peak. */
export function normalizePeak(state, value, dt, floor = FLOOR, tau = PEAK_TAU) {
  const v = Math.max(0, value);
  const decay = Math.exp(-Math.max(0, dt) / tau);
  state.peak = Math.max(v, (state.peak || 0) * decay);
  if (state.peak < floor) state.peak = floor;
  return Math.min(1, v / state.peak);
}

export function smoothToward(state, value, dt, tau = ENV_TAU) {
  const a = 1 - Math.exp(-Math.max(0, dt) / tau);
  state.env = (state.env || 0) + (value - (state.env || 0)) * a;
  return state.env;
}

/**
 * Onset when the band envelope rises faster than a rolling flux peak.
 * Returns 1 on a hit, else 0. minGap keeps a kick from retriggering itself.
 */
export function detectOnset(state, env, dt, minGap = ONSET_GAP) {
  const prev = state.prev || 0;
  const flux = Math.max(0, env - prev);
  state.prev = env;
  state.t = (state.t || 0) + dt;
  const decay = Math.exp(-Math.max(0, dt) / FLUX_TAU);
  state.fluxPeak = Math.max(flux, (state.fluxPeak || 0.02) * decay);
  if (state.fluxPeak < 0.02) state.fluxPeak = 0.02;
  const ready = (state.t - (state.last || -10)) >= minGap;
  const hit = ready && flux > 0.12 && flux > 0.55 * state.fluxPeak && env > 0.18;
  if (hit) state.last = state.t;
  return hit ? 1 : 0;
}

/** Spectral centroid in 0..1 (200–4200 Hz mapped). Melody sway reads this. */
export function spectralCentroid(bins, sampleRate, fftSize) {
  if (!bins || !bins.length) return 0;
  const n = bins.length;
  const binHz = sampleRate / fftSize;
  let num = 0, den = 0;
  for (let i = 1; i < n; i++) {
    const mag = bins[i];
    num += mag * i * binHz;
    den += mag;
  }
  if (den < 1) return 0;
  return Math.min(1, Math.max(0, (num / den - 200) / 4000));
}

/**
 * A drop is a large rise in loudness after a stretch of quiet — a real
 * spectral-flux jump, not a metronome. Returns 1 on a hit.
 */
export function detectDrop(state, loudEnv, dt, minGap = 1.1) {
  const prev = state.prev == null ? loudEnv : state.prev;
  const flux = Math.max(0, loudEnv - prev);
  state.prev = loudEnv;
  state.t = (state.t || 0) + dt;
  if (loudEnv < 0.20) state.quietTime = (state.quietTime || 0) + dt;
  else if (loudEnv > 0.28) {
    const quiet = (state.quietTime || 0) >= 0.40;
    state.quietTime = 0;
    const ready = (state.t - (state.last || -20)) >= minGap;
    if (quiet && ready && flux > 0.16 && loudEnv > 0.34) {
      state.last = state.t;
      return 1;
    }
  }
  return 0;
}

/** Curiosity tilt when loudness falls away quickly while the song is still playing. */
export function detectSuddenQuiet(state, loudEnv, dt, playing) {
  const prev = state.prev == null ? loudEnv : state.prev;
  state.prev = loudEnv;
  state.t = (state.t || 0) + dt;
  if (!playing) return 0;
  const ready = (state.t - (state.last || -20)) >= 0.9;
  const hit = ready && prev > 0.32 && loudEnv < 0.14 && (prev - loudEnv) > 0.16;
  if (hit) state.last = state.t;
  return hit ? 1 : 0;
}

/** Startle then pounce amounts from a 0..1 drop progress. */
export function dropPhase(u) {
  if (u <= 0 || u >= 1) return { startle: 0, pounce: 0 };
  const startle = u < 0.28 ? Math.sin((u / 0.28) * Math.PI) : 0;
  const pounce = (u > 0.16 && u < 0.85) ? Math.sin(((u - 0.16) / 0.69) * Math.PI) : 0;
  return { startle, pounce };
}

const ZERO_SIG = Object.freeze({
  bass: 0, mid: 0, high: 0, loud: 0, hop: 0, earFlick: 0, earSide: 1,
  spin: 0, flourish: 0, centroid: 0, sway: 0, perk: 0, settle: 0,
  curious: 0, startle: 0, pounce: 0, drop: 0, flare: 0, playing: false, active: false,
  kick: 0, snare: 0, hat: 0, kickHit: 0, snareHit: 0, hatHit: 0,
  kickFollow: 0, snareFollow: 0, hatFollow: 0,
  bpm: 0, beatConf: 0, beatPhase: 0, barBeat: 0, downbeat: 0, anticip: 0, useGrid: false,
  chromaPc: -1, chromaName: '—', chromaHue: '#a78bfa', chromaConf: 0,
  harmonic: 0, percussive: 0, chordChange: 0, beatPulse: 0,
  musicPhase: 0, blinkEnv: 0, squint: 0, flux: 0,
});

export function dancePose(rest, sig) {
  const r = rest || {};
  const playing = !!(sig && sig.playing);
  const loud = sig.loud || 0;
  // Mood only scales how big the move is, never when it happens.
  const moodAmp = 1 - 0.22 * (r.sleepy || 0);
  // While music is playing he never freezes: a floor keeps the body
  // moving in quiet passages, then amplitude follows RMS / bands.
  const amp = ((playing ? 0.28 : 0) + 0.72 * Math.max(loud, sig.bass || 0, sig.mid || 0, 0.001)) * moodAmp;
  const g = (0.45 + 0.65 * loud) * moodAmp;
  const bass = (sig.bass || 0) * g;
  const mid = (sig.mid || 0) * g;
  const high = (sig.high || 0) * g;
  const hop = (sig.hop || 0);
  const side = sig.earSide < 0 ? -1 : 1;
  const flick = sig.earFlick || 0;
  const fl = sig.flourish || 0;
  const spin = sig.spin || 0;
  const perk = sig.perk || 0;
  const settle = playing ? 0 : (sig.settle || 0);
  const cur = sig.curious || 0;
  const startle = sig.startle || 0;
  const pounce = sig.pounce || 0;
  const sway = sig.sway || 0;
  const flare = sig.flare != null ? sig.flare : high;
  const kick = (sig.kick != null ? sig.kick : bass) * g;
  const snare = sig.snare || 0;
  const hat = sig.hat || 0;
  const harm = sig.harmonic || 0;
  const conf = sig.beatConf || 0;
  const useGrid = !!(sig.useGrid && conf >= 0.5);
  const phase = sig.beatPhase || 0;
  const down = sig.downbeat || 0;
  const anticip = sig.anticip || 0;
  const chord = sig.chordChange || 0;
  const kickHit = sig.kickHit || 0;
  const snareHit = sig.snareHit || 0;
  const hatHit = sig.hatHit || 0;
  const kickF = sig.kickFollow || 0;
  const snareF = sig.snareFollow || 0;
  const hatF = sig.hatFollow || 0;
  const flux = sig.flux || 0;
  const blinkEnv = sig.blinkEnv || 0;
  const squint = sig.squint || 0;
  // Music clock (rate comes from live loudness/flux in tickDance). When a
  // beat grid is confident we prefer that phase for steps and nods.
  const clock = useGrid ? phase * Math.PI * 2 : (sig.musicPhase || 0);
  const step = Math.sin(clock) * amp;
  const swayBeat = Math.sin(clock) * (0.10 + 0.10 * down * (useGrid ? conf : 0)) * amp;
  const wingBeat = (useGrid ? Math.sin(phase * Math.PI) * conf : Math.sin(clock * 0.5)) * (0.22 + harm * 0.55) * amp;
  const nod = (useGrid ? Math.sin(phase * Math.PI * 2) : Math.sin(clock)) * (0.10 + 0.16 * (kick + loud)) * amp;
  const wave = Math.sin(clock) * (0.12 + kick * 0.35 + kickF * 0.4) * amp + kickHit * 0.2;
  const pc = sig.chromaPc == null ? -1 : sig.chromaPc;
  const gaze = pc >= 0 ? ((pc / 11) * 2 - 1) * 0.22 * Math.max(sig.chromaConf || 0, 0.25) : 0;
  const melody = sig.centroid != null ? (sig.centroid - 0.5) : 0;
  const kickHop = hop + anticip * (0.7 + 0.3 * down) + kickHit * 0.25;
  const squash = bass * 0.22 + kick * 0.18 - hop * 0.7 - anticip * 0.45 + fl * 0.08 + startle * 0.7 - pounce * 0.55 + settle * 0.12 + kickHit * 0.15;
  const engage = 1 - settle * 0.85;
  // Face: lid/mouth/brow morphs (no eye or jaw bones on the sculpt).
  const mouth = (mid * 0.55 + (sig.mid || 0) * 0.25 + fl * 0.4 + cur * 0.15) * engage;
  const pose = {
    headYaw: (mid * 0.16 * side + fl * 0.22 * side) * (1 - perk) * engage + sway * 0.55 * engage + cur * 0.18 * side + gaze * engage + snareHit * 0.22 * side + chord * 0.4 * side + Math.sin(clock * 0.5) * 0.04 * amp,
    headPitch: (-0.08 - mid * 0.36 - bass * 0.12 - hop * 0.08 + fl * 0.12) * engage
      + perk * -0.14 + startle * 0.18 + pounce * -0.22 + settle * 0.12 + cur * 0.06
      + snareHit * -0.18 + melody * 0.28 * engage - nod,
    headRoll: (mid * 0.18 * side + fl * 0.28 * side) * engage + cur * 0.32 * side + startle * -0.12 * side + snare * 0.2 * side + gaze * 0.4 + Math.sin(clock * 1.3) * 0.03 * amp,
    earL: (0.12 + mid * 0.5 + (side > 0 ? flick * 1.05 : flick * 0.2) + fl * 0.25) * engage
      + perk * 0.7 + startle * -0.45 + pounce * 0.25 + cur * 0.45 + snareHit * (side > 0 ? 0.7 : 0.2) + Math.sin(clock * 1.1) * 0.08 * amp,
    earR: (0.12 + mid * 0.5 + (side < 0 ? flick * 1.05 : flick * 0.2) + fl * 0.25) * engage
      + perk * 0.7 + startle * -0.45 + pounce * 0.25 + cur * -0.15 + snareHit * (side < 0 ? 0.7 : 0.2) + Math.sin(clock * 1.1 + 0.7) * 0.08 * amp,
    wing: (0.18 + high * 1.05 + bass * 0.28 + hop * 0.2 + fl * 0.7 + harm * 0.7 + wingBeat) * engage + pounce * 0.7 - startle * 0.15,
    tail: ((high * 1.15 + mid * 0.5 + fl * 0.4 + hat * 0.35) * side) * engage + pounce * 0.3 * side + wave * 0.35,
    hop: (kickHop * 0.145 + bass * 0.05 + kick * 0.04 + Math.abs(Math.sin(clock)) * 0.012 * amp) * engage + pounce * 0.12 + startle * -0.012,
    lean: (bass * 0.09 - mid * 0.03 + side * high * 0.05) * engage + perk * 0.05 + pounce * 0.1 + startle * -0.06 + swayBeat + step * 0.04,
    squash,
    spin: spin * Math.PI * 2 + chord * 0.55 * side,
    blink: Math.max(0, Math.min(1, blinkEnv * 0.95 + startle * 0.35 + squint * 0.28)),
    happy: Math.max(r.happy || 0, (0.15 + loud * 0.4 + fl * 0.25) * engage + pounce * 0.35 + perk * 0.2 + down * squint * 0.55 + squint * 0.35),
    curious: fl * 0.2 + perk * 0.45 + cur * 0.75 + Math.max(0, melody) * 0.2,
    sleepy: playing ? squint * 0.22 + blinkEnv * 0.08 : settle * 0.35 + (r.sleepy || 0) * 0.15,
    scared: startle * 0.55,
    grin: (loud * 0.3 + fl * 0.3) * engage + pounce * 0.25 + squint * 0.15,
    smile: Math.max(r.smile || 0, (0.2 + loud * 0.3) * engage + perk * 0.2 + squint * 0.2) * (1 - startle * 0.6),
    mouthO: fl * 0.45 + startle * 0.3 + cur * 0.15 + mouth,
    browsUp: (mid * 0.55 + fl * 0.35) * engage + perk * 0.4 + cur * 0.4 + flare * 0.15 + Math.sin(clock) * 0.08 * mid,
    breath: 0.5 + (useGrid ? Math.sin(phase * Math.PI * 2) : Math.sin(clock)) * (0.22 + 0.35 * loud + 0.2 * kick) * engage,
    flare,
    earTipL: (snareF * (side > 0 ? 0.9 : 0.25) + hatF * 0.2 + mid * 0.12) * engage,
    earTipR: (snareF * (side < 0 ? 0.9 : 0.25) + hatF * 0.2 + mid * 0.12) * engage,
    wingTip: (hatHit * 0.7 + hatF * 0.55 + hat * 0.25 + high * 0.15) * engage,
    tailTip: (hatHit * 1.1 + hatF * 0.8 + hat * 0.35) * side * engage + wave * 0.4,
    // Follow-through down the tail: each segment lags the kick/spine wave.
    tailWave: wave,
    legL: Math.max(0, step) * 0.5 * engage + kickF * 0.12 + (playing ? amp * 0.04 : 0),
    legR: Math.max(0, -step) * 0.5 * engage + kickF * 0.12 + (playing ? amp * 0.04 : 0),
    pawL: Math.max(0, step) * 0.28 * engage + kickF * 0.08,
    pawR: Math.max(0, -step) * 0.28 * engage + kickF * 0.08,
    chestYaw: (swayBeat + gaze * 0.3 + chord * 0.2 * side) * engage,
    chestPitch: (kick * 0.08 - hop * 0.06 + harm * 0.05 + wave * 0.15) * engage,
    wingSpread: (harm * 0.85 + wingBeat + high * 0.15) * engage,
    spinePitch: wave * 0.55 * engage,
    spineYaw: swayBeat * 0.6 * engage + gaze * 0.08,
    spineRoll: step * 0.08 * engage,
    driftX: Math.sin(clock * 0.35) * (0.01 + bass * 0.045 + kick * 0.02) * engage,
    camBob: ((useGrid && down ? (sig.beatPulse || anticip || kickHit) * 0.018 : 0) + kick * 0.01 + Math.sin(clock) * 0.004 * amp) * engage,
    pulse: (bass * 0.55 + loud * 0.65 + kick * 0.3 + (sig.kickHit || 0) * 0.35),
  };
  // When the physics rig has been stepped, body angles come from the
  // simulation (forces in, pose out). Face morphs stay as computed above.
  if (sig && sig.joints) {
    const p = sig.phys || {};
    pose.hop = p.hop || 0;
    pose.driftX = p.driftX || 0;
    pose.lean = p.lean || 0;
    if (p.headPitch != null) pose.headPitch = p.headPitch;
    if (p.headYaw != null) pose.headYaw = p.headYaw;
    if (p.headRoll != null) pose.headRoll = p.headRoll;
    pose.spinePitch = p.spinePitch || 0;
    pose.spineYaw = p.spineYaw || 0;
    pose.spineRoll = p.spineRoll || 0;
    pose.chestPitch = p.chestPitch || 0;
    pose.chestYaw = p.chestYaw || 0;
    pose.joints = sig.joints;
  }
  return pose;
}

function makeTrack() {
  return { peak: FLOOR, env: 0 };
}

const st = {
  ctx: null,
  src: null,
  analyser: null,
  freq: null,
  time: null,
  audio: null,
  playing: false,
  lastTick: 0,
  bass: makeTrack(),
  mid: makeTrack(),
  high: makeTrack(),
  loud: makeTrack(),
  onsetB: { prev: 0, fluxPeak: 0.02, last: -10, t: 0 },
  onsetM: { prev: 0, fluxPeak: 0.02, last: -10, t: 0 },
  hop: 0,
  earFlick: 0,
  earSide: 1,
  spinT: 0,
  flourish: 0,
  bassHits: 0,
  wasRunning: false,
  playAge: 0,
  perkHold: 0,
  perk: makeTrack(),
  settle: makeTrack(),
  curious: makeTrack(),
  flare: makeTrack(),
  sway: makeTrack(),
  centroid: makeTrack(),
  dropT: 0,
  loudAbs: makeTrack(),
  didPlay: false,
  dropDet: { prev: 0, quietTime: 0, last: -20, t: 0 },
  quietDet: { prev: 0, last: -20, t: 0 },
  sig: { ...ZERO_SIG },
  rhythm: makeRhythmState(),
  musicPhase: 0,
  blinkT: 0,
  squint: 0,
  timeRaw: null,
  cosmos: makeCosmosState(),
  rig: makeRig(),
};

function acCtor() {
  return window.AudioContext || window.webkitAudioContext;
}

/** Must be called synchronously from the visitor's play-button tap (iOS). */
export function attachDance(audio) {
  if (!audio) return false;
  const AC = acCtor();
  if (!AC) return false;
  try {
    if (!st.ctx) st.ctx = new AC();
    if (st.ctx.state === 'suspended') {
      const p = st.ctx.resume();
      if (p && typeof p.then === 'function') p.catch(() => {});
    }
    if (!st.src) {
      st.analyser = st.ctx.createAnalyser();
      st.analyser.fftSize = FFT;
      st.analyser.smoothingTimeConstant = SMOOTH;
      st.analyser.minDecibels = -90;
      st.analyser.maxDecibels = -25;
      // A second, unsmoothed analyser for flux / onsets / chroma so tempo
      // tracking is not blurred by the display analyser's 0.38 smoothing.
      st.analyserRaw = st.ctx.createAnalyser();
      st.analyserRaw.fftSize = FFT;
      st.analyserRaw.smoothingTimeConstant = 0;
      st.analyserRaw.minDecibels = -90;
      st.analyserRaw.maxDecibels = -25;
      st.src = st.ctx.createMediaElementSource(audio);
      st.src.connect(st.analyser);
      st.src.connect(st.analyserRaw);
      st.analyser.connect(st.ctx.destination);
      st.freq = new Uint8Array(st.analyser.frequencyBinCount);
      st.freqRaw = new Uint8Array(st.analyserRaw.frequencyBinCount);
      st.time = new Float32Array(st.analyser.fftSize);
      st.timeRaw = new Float32Array(st.analyserRaw.fftSize);
    }
    st.audio = audio;
    if (!audio._zerefDanceBound) {
      audio._zerefDanceBound = true;
      const set = () => { st.playing = !audio.paused; if (st.playing && st.ctx && st.ctx.state === 'suspended') st.ctx.resume().catch(() => {}); };
      audio.addEventListener('play', set);
      audio.addEventListener('pause', set);
      audio.addEventListener('ended', () => { st.playing = false; });
    }
    st.playing = !audio.paused;
    return true;
  } catch {
    return false;
  }
}

export function isDanceActive() {
  return !!(st.sig && st.sig.active);
}

export function currentDance() {
  return st.sig;
}

export function tickDance(nowMs) {
  const now = nowMs == null ? (typeof performance !== 'undefined' ? performance.now() : 0) : nowMs;
  let dt = st.lastTick ? (now - st.lastTick) / 1000 : 0.016;
  if (dt < 0.001) return st.sig; // already stepped this frame
  if (dt > 0.05) dt = 0.05;
  st.lastTick = now;

  let bassR = 0, midR = 0, highR = 0, loudR = 0, centR = 0;
  const running = st.playing && st.analyser && st.ctx && st.ctx.state === 'running';
  if (running) {
    st.analyser.getByteFrequencyData(st.freq);
    st.analyser.getFloatTimeDomainData(st.time);
    if (st.analyserRaw && st.freqRaw) st.analyserRaw.getByteFrequencyData(st.freqRaw);
    if (st.analyserRaw && st.timeRaw) st.analyserRaw.getFloatTimeDomainData(st.timeRaw);
    const sr = st.ctx.sampleRate || 44100;
    const fft = st.analyser.fftSize || FFT;
    // byte bins are 0..255
    bassR = bandMean(st.freq, sr, fft, BANDS.bass[0], BANDS.bass[1]) / 255;
    midR = bandMean(st.freq, sr, fft, BANDS.mid[0], BANDS.mid[1]) / 255;
    highR = bandMean(st.freq, sr, fft, BANDS.high[0], BANDS.high[1]) / 255;
    loudR = Math.min(1, rms(st.time) * 3.2);
    centR = spectralCentroid(st.freq, sr, fft);
  }

  const rhy = tickRhythm(st.rhythm, {
    bins: running ? (st.freqRaw || st.freq) : null,
    sampleRate: (st.ctx && st.ctx.sampleRate) || 44100,
    fftSize: (st.analyser && st.analyser.fftSize) || FFT,
    dt,
    running,
    bandMean,
    normalizePeak,
    smoothToward,
    detectOnset,
  });

  const bassN = normalizePeak(st.bass, bassR, dt);
  const midN = normalizePeak(st.mid, midR, dt);
  const highN = normalizePeak(st.high, highR, dt);
  const loudN = normalizePeak(st.loud, loudR, dt);
  const bassE = smoothToward(st.bass, running ? bassN : 0, dt, running ? ENV_TAU : 0.18);
  const midE = smoothToward(st.mid, running ? midN : 0, dt, running ? ENV_TAU : 0.18);
  const highE = smoothToward(st.high, running ? highN : 0, dt, running ? ENV_TAU : 0.18);
  const loudE = smoothToward(st.loud, running ? loudN : 0, dt, running ? 0.08 : 0.2);

  const centE = smoothToward(st.centroid, running ? centR : 0.5, dt, running ? 0.16 : 0.3);
  const flareE = smoothToward(st.flare, running ? highE : 0, dt, (running && highE > (st.flare.env || 0)) ? 0.04 : 0.16);
  const swayE = smoothToward(st.sway, running ? ((centE * 2 - 1) * 0.7 + midE * 0.15 * st.earSide) : 0, dt, 0.18);
  // Absolute loudness (not peak-normalized) so a real quiet passage still reads as quiet.
  const loudAbs = smoothToward(st.loudAbs, running ? loudR : 0, dt, running ? 0.07 : 0.2);

  if (running) {
    // Music clock: the rate is the live signal, so quiet passages slow down
    // but never freeze, and nothing here is a wall-clock idle or a metronome.
    const rate = 0.45 + loudE * 1.6 + (rhy.flux || 0) * 5 + (rhy.kick || 0) * 0.45 + midE * 0.35;
    st.musicPhase += dt * rate;
    if (rhy.useGrid && rhy.downbeat && (rhy.anticip > 0.7 || rhy.beatPulse)) st.squint = 1;
  }

  if (running && !st.wasRunning) st.perkHold = 1.15;
  st.wasRunning = running;
  st.playAge = running ? (st.playAge || 0) + dt : 0;
  if (running) st.didPlay = true;
  st.perkHold = Math.max(0, st.perkHold - dt);
  const perkE = smoothToward(st.perk, st.perkHold > 0 ? 1 : 0, dt, st.perkHold > 0 ? 0.12 : 0.45);
  const wantSettle = !running; // quiet passages keep moving; only a pause/end sits him down
  const settleE = smoothToward(st.settle, wantSettle ? 1 : 0, dt, wantSettle ? 0.7 : 0.22);

  if (running) {
    if (detectOnset(st.onsetB, bassE, dt)) {
      st.hop = 1;
      st.bassHits += 1;
      // Flourish and spin are triggered by real bass onsets only (no metronome).
      if (bassE > 0.62 && loudE > 0.5) st.flourish = 1;
      if (st.spinT <= 0 && st.bassHits % 4 === 0 && (bassE + loudE) > 0.85) st.spinT = 0.001;
    }
    if (detectOnset(st.onsetM, midE, dt, 0.16) || (rhy.snareHit > 0.85)) {
      st.earFlick = 1;
      st.earSide = -st.earSide;
    }
    if (rhy.kickHit > 0.85 || (rhy.useGrid && rhy.anticip > 0.85)) {
      const boost = 0.85 + 0.15 * (rhy.downbeat || 0);
      st.hop = Math.max(st.hop, boost);
      if (rhy.kickHit > 0.85 && rhy.kick > 0.62 && loudE > 0.5) st.flourish = Math.max(st.flourish, 1);
    }
    if (st.spinT <= 0 && rhy.chordChange > 0.85) st.spinT = 0.001;
    if (st.playAge > 0.8 && detectDrop(st.dropDet, loudAbs, dt) && st.dropT <= 0) st.dropT = 0.001;
    if (detectSuddenQuiet(st.quietDet, loudAbs, dt, true)) st.curious.env = 1;
  } else {
    detectDrop(st.dropDet, loudAbs, dt);
    detectSuddenQuiet(st.quietDet, loudAbs, dt, false);
  }
  if (running) {
    const phrase = ((st.curious && st.curious.env) > 0.85) || (st.dropT > 0 && st.dropT < 0.06);
    if ((rhy.snareHit > 0.8 || phrase) && st.blinkT <= 0) st.blinkT = 0.001;
  }
  if (st.blinkT > 0) {
    st.blinkT += dt / 0.11;
    if (st.blinkT >= 1) st.blinkT = 0;
  }
  st.squint = Math.max(0, (st.squint || 0) - dt / 0.16);
  const blinkEnv = st.blinkT > 0 ? Math.sin(st.blinkT * Math.PI) : 0;
  const curE = smoothToward(st.curious, 0, dt, 0.5); // decays from spikes written to env
  st.hop = Math.max(0, st.hop - dt / 0.18);
  st.earFlick = Math.max(0, st.earFlick - dt / 0.14);
  st.flourish = Math.max(0, st.flourish - dt / 0.28);
  if (st.spinT > 0) {
    st.spinT += dt / 0.55;
    if (st.spinT >= 1) st.spinT = 0;
  }
  if (st.dropT > 0) {
    st.dropT += dt / 0.72;
    if (st.dropT >= 1) st.dropT = 0;
  }
  const ph = dropPhase(st.dropT);

  tickCosmos(st.cosmos, {
    time: running ? (st.timeRaw || st.time) : null,
    sampleRate: (st.ctx && st.ctx.sampleRate) || 44100,
    dt,
    running,
    bpm: rhy.useGrid ? rhy.bpm : 0,
    beatConf: rhy.beatConf || 0,
    stride: 2,
  });
  const forceSig = {
    playing: running,
    bass: bassE, mid: midE, high: highE, loud: loudE,
    hop: st.hop, earFlick: st.earFlick, earSide: st.earSide,
    sway: swayE,
    kick: rhy.kick, snare: rhy.snare, hat: rhy.hat,
    kickHit: rhy.kickHit, snareHit: rhy.snareHit, hatHit: rhy.hatHit,
    bpm: rhy.bpm, beatConf: rhy.beatConf, beatPhase: rhy.beatPhase,
    useGrid: rhy.useGrid, chromaPc: rhy.chromaPc, musicPhase: st.musicPhase,
    cosmos: st.cosmos.v,
    pitchPc: st.cosmos.note ? st.cosmos.note.pc : rhy.chromaPc,
  };
  stepPhysics(st.rig, audioForces(forceSig), dt);
  const phys = readPose(st.rig);
  if (!running && settleE > 0.95 && (st.rig.energy || 0) < 0.002) st.rig = resetRig(st.rig);

  const energy = bassE + midE + highE + loudE + st.hop + perkE + ph.pounce + ph.startle + (st.rig.energy || 0) * 0.15;
  if (!running && settleE > 0.95 && energy < 0.03) st.didPlay = false;
  const winding = st.didPlay && !running;
  const active = running || energy > 0.02 || winding;
  st.sig = {
    bass: bassE,
    mid: midE,
    high: highE,
    loud: loudE,
    hop: st.hop,
    earFlick: st.earFlick,
    earSide: st.earSide,
    spin: st.spinT,
    flourish: st.flourish,
    centroid: centE,
    sway: swayE,
    perk: perkE,
    settle: settleE,
    curious: curE,
    startle: ph.startle,
    pounce: ph.pounce,
    drop: st.dropT,
    flare: flareE,
    playing: running,
    active,
    kick: rhy.kick,
    snare: rhy.snare,
    hat: rhy.hat,
    kickHit: rhy.kickHit,
    snareHit: rhy.snareHit,
    hatHit: rhy.hatHit,
    kickFollow: rhy.kickFollow,
    snareFollow: rhy.snareFollow,
    hatFollow: rhy.hatFollow,
    bpm: rhy.bpm,
    beatConf: rhy.beatConf,
    beatPhase: rhy.beatPhase,
    barBeat: rhy.barBeat,
    downbeat: rhy.downbeat,
    anticip: rhy.anticip,
    useGrid: rhy.useGrid,
    chromaPc: rhy.chromaPc,
    chromaName: rhy.chromaName,
    chromaHue: rhy.chromaHue,
    chromaConf: rhy.chromaConf,
    harmonic: rhy.harmonic,
    percussive: rhy.percussive,
    chordChange: rhy.chordChange,
    beatPulse: rhy.beatPulse,
    musicPhase: st.musicPhase,
    blinkEnv,
    squint: st.squint,
    flux: rhy.flux,
    cosmos: st.cosmos.v,
    cosmosKey: st.cosmos.key,
    pitchHz: st.cosmos.freq,
    pitchLock: st.cosmos.q,
    joints: phys.joints,
    phys,
  };
  return st.sig;
}

/** Write CSS custom properties for the 2D portrait fallback. */
export function applyDanceCSS(el, sig) {
  if (!el) return;
  const active = !!(sig && sig.active);
  const playing = !!(sig && sig.playing);
  el.classList.toggle('dancing', active);
  el.classList.toggle('mw-live-signal', playing);
  const bass = active ? sig.bass : 0;
  const mid = active ? sig.mid : 0;
  const high = active ? sig.high : 0;
  el.style.setProperty('--dance-bass', (bass || 0).toFixed(3));
  el.style.setProperty('--dance-mid', (mid || 0).toFixed(3));
  el.style.setProperty('--dance-high', (high || 0).toFixed(3));
  el.style.setProperty('--dance-loud', (active ? sig.loud : 0).toFixed(3));
  el.style.setProperty('--dance-hop', (active ? sig.hop : 0).toFixed(3));
  el.style.setProperty('--dance-spin', (active ? (sig.spin || 0) : 0).toFixed(3));
  el.style.setProperty('--dance-kick', (active ? (sig.kickHit || sig.kick || 0) : 0).toFixed(3));
  el.style.setProperty('--dance-beat', (active ? ((sig.downbeat ? 1 : 0) * (sig.beatPulse || sig.anticip || 0) + (sig.kickHit || 0) * 0.6) : 0).toFixed(3));
  el.style.setProperty('--dance-hue', (active && sig.chromaHue) ? sig.chromaHue : '#a78bfa');
  const pose2d = (playing || active) ? dancePose({}, sig) : null;
  el.style.setProperty('--dance-gaze', pose2d ? (pose2d.headYaw || 0).toFixed(3) : '0');
  el.style.setProperty('--dance-nod', pose2d ? (pose2d.headPitch || 0).toFixed(3) : '0');
  el.style.setProperty('--dance-blink', pose2d ? (pose2d.blink || 0).toFixed(3) : '0');
  el.style.setProperty('--dance-squint', (active ? (sig.squint || 0) : 0).toFixed(3));
  el.style.setProperty('--dance-breath', pose2d ? (pose2d.breath || 0.5).toFixed(3) : '0.5');
  el.style.setProperty('--dance-pulse', pose2d ? (pose2d.pulse || 0).toFixed(3) : '0');
  el.style.setProperty('--dance-drift', pose2d ? (pose2d.driftX || 0).toFixed(3) : '0');
  el.style.setProperty('--dance-phase', (active ? (sig.musicPhase || 0) : 0).toFixed(3));
  const meter = el.querySelector('.mw-signal');
  if (meter) {
    meter.hidden = !playing && !(sig && sig.active && (sig.settle || 0) < 0.85);
    const label = meter.querySelector('.mw-signal-label');
    if (label) {
      const bits = ['live audio signal · beat · harmonics'];
      if (sig && sig.bpm && sig.useGrid) bits.push(Math.round(sig.bpm) + ' BPM · conf ' + sig.beatConf.toFixed(2));
      else if (sig && sig.bpm) bits.push('~' + Math.round(sig.bpm) + ' BPM · conf ' + (sig.beatConf || 0).toFixed(2) + ' · onsets only');
      else if (playing) bits.push('tempo reading…');
      if (sig && sig.chromaName && sig.chromaName !== '—') bits.push(sig.chromaName);
      else if (playing) bits.push('pitch —');
      label.textContent = bits.join(' · ');
    }
  }
  let react = '';
  if (sig) {
    if ((sig.startle || 0) > 0.25 || (sig.pounce || 0) > 0.25) react = 'drop';
    else if ((sig.perk || 0) > 0.45) react = 'perk';
    else if ((sig.curious || 0) > 0.4) react = 'curious';
    else if ((sig.settle || 0) > 0.6 && sig.active && !sig.playing) react = 'settle';
  }
  if (react) el.dataset.react = react;
  else delete el.dataset.react;
}
