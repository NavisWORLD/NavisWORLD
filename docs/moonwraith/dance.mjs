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
//
// Label: "dancing to Cory's song · driven by the live audio signal".
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

const ZERO_SIG = Object.freeze({
  bass: 0, mid: 0, high: 0, loud: 0, hop: 0, earFlick: 0, earSide: 1,
  spin: 0, flourish: 0, active: false,
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
  // In the air (hop high) he stretches; as the hop lands he squashes; bass also compresses the chest.
  const squash = bass * 0.22 - hop * 0.7 + fl * 0.08;
  return {
    headYaw: mid * 0.16 * side + fl * 0.22 * side,
    headPitch: -0.10 - mid * 0.48 - bass * 0.16 - hop * 0.08 + fl * 0.12,
    headRoll: mid * 0.18 * side + fl * 0.28 * side,
    earL: 0.12 + mid * 0.4 + (side > 0 ? flick * 1.05 : flick * 0.2) + fl * 0.25,
    earR: 0.12 + mid * 0.4 + (side < 0 ? flick * 1.05 : flick * 0.2) + fl * 0.25,
    wing: 0.18 + high * 1.25 + bass * 0.28 + hop * 0.2 + fl * 0.7,
    tail: (high * 1.35 + mid * 0.5 + fl * 0.4) * side,
    hop: hop * 0.145 + bass * 0.05,
    lean: bass * 0.09 - mid * 0.03 + side * high * 0.05,
    squash,
    spin: spin * Math.PI * 2,
    blink: 0,
    happy: Math.max(r.happy || 0, 0.2 + (sig.loud || 0) * 0.45 + fl * 0.25),
    curious: fl * 0.2,
    sleepy: 0,
    scared: 0,
    grin: (sig.loud || 0) * 0.35 + fl * 0.3,
    smile: Math.max(r.smile || 0, 0.25 + (sig.loud || 0) * 0.35),
    mouthO: fl * 0.55,
    browsUp: mid * 0.3 + fl * 0.35,
    breath: 0.5 + bass * 0.55 + hop * 0.25,
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

  let bassR = 0, midR = 0, highR = 0, loudR = 0;
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
  }

  const bassN = normalizePeak(st.bass, bassR, dt);
  const midN = normalizePeak(st.mid, midR, dt);
  const highN = normalizePeak(st.high, highR, dt);
  const loudN = normalizePeak(st.loud, loudR, dt);
  const bassE = smoothToward(st.bass, running ? bassN : 0, dt, running ? ENV_TAU : 0.18);
  const midE = smoothToward(st.mid, running ? midN : 0, dt, running ? ENV_TAU : 0.18);
  const highE = smoothToward(st.high, running ? highN : 0, dt, running ? ENV_TAU : 0.18);
  const loudE = smoothToward(st.loud, running ? loudN : 0, dt, running ? 0.08 : 0.2);

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
  }
  st.hop = Math.max(0, st.hop - dt / 0.18);
  st.earFlick = Math.max(0, st.earFlick - dt / 0.14);
  st.flourish = Math.max(0, st.flourish - dt / 0.28);
  if (st.spinT > 0) {
    st.spinT += dt / 0.55;
    if (st.spinT >= 1) st.spinT = 0;
  }

  const energy = bassE + midE + highE + loudE + st.hop;
  const active = running || energy > 0.02;
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
    active,
  };
  return st.sig;
}

/** Write CSS custom properties for the 2D portrait fallback. */
export function applyDanceCSS(el, sig) {
  if (!el) return;
  if (!sig || !sig.active) {
    el.classList.remove('dancing');
    return;
  }
  el.classList.add('dancing');
  el.style.setProperty('--dance-bass', sig.bass.toFixed(3));
  el.style.setProperty('--dance-mid', sig.mid.toFixed(3));
  el.style.setProperty('--dance-high', sig.high.toFixed(3));
  el.style.setProperty('--dance-loud', sig.loud.toFixed(3));
  el.style.setProperty('--dance-hop', sig.hop.toFixed(3));
  el.style.setProperty('--dance-spin', (sig.spin || 0).toFixed(3));
}
