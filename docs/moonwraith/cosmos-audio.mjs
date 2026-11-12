// Faithful port of Cory's COSMOS Music / Infinite Adaptive Audio
// feature extraction and leaky 12-channel performance state.
//
// Source (GPL-3.0-only, not vendored into this Apache-2.0 repo):
//   NavisWORLD/infinite-adaptive-audio-12d-universe-engine
//     COSMOS_MUSIC_SUITE/app/src/sensors.js
//       — VoiceSensor energy, phrase flux, normalized autocorrelation pitch
//     COSMOS_MUSIC_SUITE/app/src/state.js
//       — inferKey, PerformanceState leak integrator
//     COSMOS_MUSIC_SUITE/app/src/app.js
//       — harmonicTension, tempoCoherence helpers
//     COSMOS_MUSIC_SUITE/bindings/javascript/src/index.mjs
//       — synapticStep (same leak, salience memory)
//     COSMOS_MUSIC_SUITE/python/src/cosmos_music/pitch.py
//       — first-peak subharmonic guard on the autocorrelation
//
// This file is original Apache-2.0 code that follows those algorithms and
// constants (energy×7, flux×8, autocorr q>0.28, pcs when q>0.35, leak 0.82,
// tanh(1.5·salience) memory). We analyze the already-playing song through
// the existing AnalyserNode; we do not open a microphone, motion, or PPG
// sensor, so those three channel groups stay at 0. No Math.random.

export const COSMOS_LEAK = 0.82;
export const STATE_NAMES = [
  'voice energy', 'pitch lock', 'phrase flux', 'tempo coherence',
  'motion energy', 'tilt x', 'tilt y', 'rotation flux',
  'pulse phase', 'pulse stability', 'harmonic tension', 'synaptic memory',
];
export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export function hzToNote(hz) {
  if (!hz) return null;
  const m = 69 + 12 * Math.log2(hz / 440);
  const n = Math.round(m);
  return {
    midi: n,
    pc: (n % 12 + 12) % 12,
    name: NOTES[(n % 12 + 12) % 12] + (Math.floor(n / 12) - 1),
    confidence: Math.max(0, 1 - Math.abs(m - n)),
  };
}

// Normalized autocorrelation pitch, 70–1000 Hz, same threshold as sensors.js.
// `stride` lets a mobile client decimate (stride=2 halves the rate and the cost)
// without changing the estimator itself.
export function estimatePitch(buf, sampleRate, stride = 1) {
  const step = Math.max(1, stride | 0);
  const sr = sampleRate / step;
  const n = Math.floor(buf.length / step);
  if (n < 32 || sr <= 0) return { hz: 0, q: 0 };
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i * step];
  mean /= n;
  const x = new Float32Array(n);
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const v = buf[i * step] - mean;
    x[i] = v;
    energy += v * v;
  }
  if (energy < 1e-5) return { hz: 0, q: 0 };
  const lo = Math.max(1, Math.floor(sr / 1000));
  const hi = Math.min(Math.floor(sr / 70), Math.floor(n / 2));
  // Collect normalized correlations, then take the first peak above
  // 0.92 of the global max (same subharmonic guard as
  // COSMOS_MUSIC_SUITE/python/src/cosmos_music/pitch.py). The JS
  // VoiceSensor used the global max alone, which locks a pure tone at
  // a 2×/4× lag; the Python estimator in the same engine is the one
  // we follow for pitch.
  const corrs = [];
  for (let lag = lo; lag <= hi; lag++) {
    let num = 0, a = 0, b = 0;
    const lim = n - lag;
    for (let i = 0; i < lim; i++) {
      const u = x[i];
      const v = x[i + lag];
      num += u * v;
      a += u * u;
      b += v * v;
    }
    corrs.push(num / Math.sqrt(a * b || 1));
  }
  let best = -1;
  let bestI = 0;
  for (let i = 0; i < corrs.length; i++) {
    if (corrs[i] > best) { best = corrs[i]; bestI = i; }
  }
  if (best <= 0.28) return { hz: 0, q: Math.max(0, best) };
  const threshold = Math.max(0.35, best * 0.92);
  let pick = bestI;
  for (let i = 1; i < corrs.length - 1; i++) {
    if (corrs[i] >= threshold && corrs[i] >= corrs[i - 1] && corrs[i] >= corrs[i + 1]) {
      pick = i;
      best = corrs[i];
      break;
    }
  }
  return { hz: sr / (lo + pick), q: Math.min(1, Math.max(0, best)) };
}

export function voiceFeatures(buf, sampleRate, prevEnergy = 0, stride = 2) {
  const n = buf.length;
  let e = 0;
  for (let i = 0; i < n; i++) e += buf[i] * buf[i];
  const energy = Math.min(1, Math.sqrt(e / Math.max(1, n)) * 7);
  const flux = Math.min(1, Math.abs(energy - prevEnergy) * 8);
  const pitch = estimatePitch(buf, sampleRate, stride);
  return { energy, flux, prevEnergy: energy, freq: pitch.hz, q: pitch.q };
}

export function inferKey(points) {
  if (!points || !points.length) return { root: 0, mode: 'major', q: 0 };
  let best = { score: -1e9, root: 0, mode: 'major', q: 0 };
  for (let root = 0; root < 12; root++) {
    for (const [mode, scale] of [['major', MAJOR], ['minor', MINOR]]) {
      const allowed = new Set(scale.map((x) => (root + x) % 12));
      let score = 0;
      let total = 0;
      for (const p of points) {
        const w = p.w || 1;
        score += w * (allowed.has(p.pc) ? 1 : -0.55);
        total += Math.abs(w);
      }
      if (score > best.score) {
        best = {
          score,
          root,
          mode,
          q: Math.max(0, Math.min(1, (score / (total || 1) + 0.55) / 1.55)),
        };
      }
    }
  }
  return best;
}

export function harmonicTension(note, key) {
  if (!note) return 0;
  const scale = key.mode === 'minor' ? MINOR : MAJOR;
  return scale.includes((note.pc - key.root + 12) % 12) ? 0.15 : 0.8;
}

// Engine fallback when there is no pulse / beat grid: not a fake metronome.
export function tempoCoherence(pulseBpm, pulseStability, voiceEnergy) {
  if (!pulseBpm) return voiceEnergy > 0.08 ? 0.45 : 0.2;
  return Math.max(0, Math.min(1, pulseStability || 0));
}

function clip(value, low, high) {
  const n = Number(value ?? 0);
  return Math.max(low, Math.min(high, Number.isFinite(n) ? n : 0));
}

export function synapticStep(previous, input = {}, leak = COSMOS_LEAK) {
  const p = [...previous].map(Number);
  if (p.length !== 12) throw new RangeError('expected 12 state values');
  const l = clip(leak, 0, 0.999);
  const bpm = Math.max(0, Number(input.bpm ?? 0));
  const dt = Math.max(0, Number(input.dt ?? 0.05));
  const phase = bpm > 0 ? (p[8] + (dt * bpm) / 60) % 1 : 0;
  const target = [
    clip(input.voiceEnergy ?? input.voice_energy, 0, 1),
    clip(input.pitchLock ?? input.pitch_lock, 0, 1),
    clip(input.phraseFlux ?? input.phrase_flux, 0, 1),
    clip(input.tempoCoherence ?? input.tempo_coherence, 0, 1),
    clip(input.motionEnergy ?? input.motion_energy, 0, 1),
    clip(input.tiltX ?? input.tilt_x, -1, 1),
    clip(input.tiltY ?? input.tilt_y, -1, 1),
    clip(input.rotationFlux ?? input.rotation_flux, 0, 1),
    phase,
    clip(input.pulseStability ?? input.pulse_stability, 0, 1),
    clip(input.harmonicTension ?? input.harmonic_tension, 0, 1),
    0,
  ];
  const out = new Array(12).fill(0);
  for (let i = 0; i < 11; i++) out[i] = l * p[i] + (1 - l) * target[i];
  const salience = (out[0] + out[1] + out[4] + out[9]) / 4;
  out[11] = l * p[11] + (1 - l) * Math.tanh(1.5 * salience);
  return out;
}

export function makeCosmosState() {
  return {
    v: new Array(12).fill(0),
    pcs: [],
    prevEnergy: 0,
    freq: 0,
    q: 0,
    key: { root: 0, mode: 'major', q: 0 },
    note: null,
  };
}

// Feed one AnalyserNode time-domain frame into the 12-channel river.
// Motion / PPG stay at 0. Tempo uses a real beat grid when one is locked.
export function tickCosmos(state, { time, sampleRate, dt, running, bpm = 0, beatConf = 0, stride = 2 } = {}) {
  if (!state) state = makeCosmosState();
  if (!running || !time || !time.length) {
    state.v = synapticStep(state.v, { dt, bpm: 0, voiceEnergy: 0, pitchLock: 0, phraseFlux: 0, tempoCoherence: 0, pulseStability: 0, harmonicTension: 0 }, COSMOS_LEAK);
    return state;
  }
  const feat = voiceFeatures(time, sampleRate || 44100, state.prevEnergy, stride);
  state.prevEnergy = feat.prevEnergy;
  state.freq = feat.freq;
  state.q = feat.q;
  if (feat.freq && feat.q > 0.35) {
    const n = hzToNote(feat.freq);
    if (n) {
      state.pcs.push({ pc: n.pc, w: feat.q * Math.max(0.1, feat.energy) });
      if (state.pcs.length > 50) state.pcs.shift();
      state.note = n;
    }
  } else {
    state.note = feat.freq ? hzToNote(feat.freq) : null;
  }
  if (state.pcs.length >= 5) state.key = inferKey(state.pcs);
  const usePulse = bpm > 0 && beatConf >= 0.35;
  const input = {
    dt,
    voiceEnergy: feat.energy,
    pitchLock: feat.q,
    phraseFlux: feat.flux,
    tempoCoherence: tempoCoherence(usePulse ? bpm : 0, beatConf, feat.energy),
    motionEnergy: 0,
    tiltX: 0,
    tiltY: 0,
    rotationFlux: 0,
    bpm: usePulse ? bpm : 0,
    pulseStability: usePulse ? Math.max(0, Math.min(1, beatConf)) : 0,
    harmonicTension: harmonicTension(state.note, state.key),
  };
  state.v = synapticStep(state.v, input, COSMOS_LEAK);
  return state;
}
