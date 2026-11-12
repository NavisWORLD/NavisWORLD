// Dance driver for the Moonwraith on the Pages chat.
// When Cory's song is playing, a Web Audio AnalyserNode reads the same-origin
// <audio> element and the creature's moves come from those live frequency
// bands. No Math.random, no fake beat grid: bass, mids, highs and loudness
// are measured, then scaled by rolling per-band peaks so quiet and loud
// passages both read. Onsets are a rise in a band against its own recent
// flux, not a clock.
//
// Band map:
//   bass / kick (30–140 Hz)  -> body bounce + onset hops with squash/stretch
//   mids (250–2000 Hz)       -> head bob + mid-onset ear flicks
//   highs (3500–10000 Hz)    -> wing flutter + tail swish
//   overall loudness (RMS)   -> energy / how big the moves are
//   strong bass onsets       -> flourish pose; every 4th strong kick can spin
//   audio start              -> perk up, ears forward, look at the visitor
//   big flux after quiet     -> startle, then pounce (a real drop)
//   spectral centroid / mids -> melody sway (smoothed)
//   highs                    -> eyes and crescent flare
//   fade or pause            -> gradually settle and sit
//   sudden quiet             -> curious head tilt
//
// Label: "dancing to Cory's song · driven by the live audio signal".
// Signal readout: "live audio signal · bass mid high".
// AudioContext is created and resumed inside the visitor's play tap
// (iPhone Safari will not start a context any other way).

export const DANCE_CAPTION = "dancing to Cory's song · driven by the live audio signal";

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
});

export function dancePose(rest, sig) {
  const r = rest || {};
  const g = 0.5 + 0.6 * (sig.loud || 0); // overall energy scales the moves
  const bass = (sig.bass || 0) * g;
  const mid = (sig.mid || 0) * g;
  const high = (sig.high || 0) * g;
  const hop = (sig.hop || 0);
  const side = sig.earSide < 0 ? -1 : 1;
  const flick = sig.earFlick || 0;
  const fl = sig.flourish || 0;
  const spin = sig.spin || 0; // 0..1 progress of a full turn; 0 when not spinning
  const perk = sig.perk || 0;
  const settle = sig.settle || 0;
  const cur = sig.curious || 0;
  const startle = sig.startle || 0;
  const pounce = sig.pounce || 0;
  const sway = sig.sway || 0;
  const flare = sig.flare != null ? sig.flare : high;
  // In the air (hop high) he stretches; as the hop lands he squashes; bass also compresses the chest.
  const squash = bass * 0.22 - hop * 0.7 + fl * 0.08 + startle * 0.7 - pounce * 0.55 + settle * 0.12;
  const engage = 1 - settle * 0.85;
  return {
    headYaw: (mid * 0.16 * side + fl * 0.22 * side) * (1 - perk) * engage + sway * 0.55 * engage + cur * 0.18 * side,
    headPitch: (-0.10 - mid * 0.48 - bass * 0.16 - hop * 0.08 + fl * 0.12) * engage
      + perk * -0.14 + startle * 0.18 + pounce * -0.22 + settle * 0.12 + cur * 0.06,
    headRoll: (mid * 0.18 * side + fl * 0.28 * side) * engage + cur * 0.32 * side + startle * -0.12 * side,
    earL: (0.12 + mid * 0.4 + (side > 0 ? flick * 1.05 : flick * 0.2) + fl * 0.25) * engage
      + perk * 0.7 + startle * -0.45 + pounce * 0.25 + cur * 0.45,
    earR: (0.12 + mid * 0.4 + (side < 0 ? flick * 1.05 : flick * 0.2) + fl * 0.25) * engage
      + perk * 0.7 + startle * -0.45 + pounce * 0.25 + cur * -0.15,
    wing: (0.18 + high * 1.25 + bass * 0.28 + hop * 0.2 + fl * 0.7) * engage + pounce * 0.7 - startle * 0.15,
    tail: ((high * 1.35 + mid * 0.5 + fl * 0.4) * side) * engage + pounce * 0.3 * side,
    hop: (hop * 0.145 + bass * 0.05) * engage + pounce * 0.12 + startle * -0.012,
    lean: (bass * 0.09 - mid * 0.03 + side * high * 0.05) * engage + perk * 0.05 + pounce * 0.1 + startle * -0.06,
    squash,
    spin: spin * Math.PI * 2,
    blink: startle * 0.35,
    happy: Math.max(r.happy || 0, (0.2 + (sig.loud || 0) * 0.45 + fl * 0.25) * engage + pounce * 0.35 + perk * 0.2),
    curious: fl * 0.2 + perk * 0.45 + cur * 0.75,
    sleepy: settle * 0.35,
    scared: startle * 0.55,
    grin: ((sig.loud || 0) * 0.35 + fl * 0.3) * engage + pounce * 0.25,
    smile: Math.max(r.smile || 0, (0.25 + (sig.loud || 0) * 0.35) * engage + perk * 0.2) * (1 - startle * 0.6),
    mouthO: fl * 0.55 + startle * 0.35 + cur * 0.2,
    browsUp: (mid * 0.3 + fl * 0.35) * engage + perk * 0.4 + cur * 0.55 + flare * 0.15,
    breath: 0.5 + (bass * 0.55 + hop * 0.25) * engage,
    flare,
  };
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
      st.src = st.ctx.createMediaElementSource(audio);
      st.src.connect(st.analyser);
      st.analyser.connect(st.ctx.destination);
      st.freq = new Uint8Array(st.analyser.frequencyBinCount);
      st.time = new Float32Array(st.analyser.fftSize);
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
    const sr = st.ctx.sampleRate || 44100;
    const fft = st.analyser.fftSize || FFT;
    // byte bins are 0..255
    bassR = bandMean(st.freq, sr, fft, BANDS.bass[0], BANDS.bass[1]) / 255;
    midR = bandMean(st.freq, sr, fft, BANDS.mid[0], BANDS.mid[1]) / 255;
    highR = bandMean(st.freq, sr, fft, BANDS.high[0], BANDS.high[1]) / 255;
    loudR = Math.min(1, rms(st.time) * 3.2);
    centR = spectralCentroid(st.freq, sr, fft);
  }

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

  if (running && !st.wasRunning) st.perkHold = 1.15;
  st.wasRunning = running;
  st.playAge = running ? (st.playAge || 0) + dt : 0;
  if (running) st.didPlay = true;
  st.perkHold = Math.max(0, st.perkHold - dt);
  const perkE = smoothToward(st.perk, st.perkHold > 0 ? 1 : 0, dt, st.perkHold > 0 ? 0.12 : 0.45);
  const wantSettle = !running || loudE < 0.12;
  const settleE = smoothToward(st.settle, wantSettle ? 1 : 0, dt, wantSettle ? 0.7 : 0.22);

  if (running) {
    if (detectOnset(st.onsetB, bassE, dt)) {
      st.hop = 1;
      st.bassHits += 1;
      // Flourish and spin are triggered by real bass onsets only (no metronome).
      if (bassE > 0.62 && loudE > 0.5) st.flourish = 1;
      if (st.spinT <= 0 && st.bassHits % 4 === 0 && (bassE + loudE) > 0.85) st.spinT = 0.001;
    }
    if (detectOnset(st.onsetM, midE, dt, 0.16)) {
      st.earFlick = 1;
      st.earSide = -st.earSide;
    }
    if (st.playAge > 0.8 && detectDrop(st.dropDet, loudAbs, dt) && st.dropT <= 0) st.dropT = 0.001;
    if (detectSuddenQuiet(st.quietDet, loudAbs, dt, true)) st.curious.env = 1;
  } else {
    detectDrop(st.dropDet, loudAbs, dt);
    detectSuddenQuiet(st.quietDet, loudAbs, dt, false);
  }
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

  const energy = bassE + midE + highE + loudE + st.hop + perkE + ph.pounce + ph.startle;
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
  const meter = el.querySelector('.mw-signal');
  if (meter) meter.hidden = !playing && !(sig && sig.active && (sig.settle || 0) < 0.85);
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
