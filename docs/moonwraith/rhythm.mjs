// Rhythm and harmonic analysis for the Moonwraith's dance, from the same
// live AnalyserNode / FFT the page already reads. No Math.random, no fake
// beat grid, no metronome: onsets, tempo, beat phase, chroma and
// harmonic/percussive split are measured from the audio that is playing.
//
// Bands (Hz):
//   kick        40–120
//   snare body  150–400  +  snare noise  2000–5000
//   hi-hat      6000–12000
// Tempo is an autocorrelation of a short spectral-flux history, checked
// against inter-onset intervals. A beat-phase tracker can anticipate a
// beat when confidence is high; when confidence is low the body follows
// pure onsets only. Downbeat emphasis (every 4) is used only while the
// grid is confident.
//
// Harmonics: 12-bin chroma, spectral flatness (harmonic vs percussive),
// dominant pitch class, and chroma-vector jumps as chord/key changes.
//
// This is a display mapping of the live signal, not a claim of feelings.

export const PITCH_CLASSES = Object.freeze(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);

export const RHYTHM_BANDS = Object.freeze({
  kick: [40, 120],
  snareBody: [150, 400],
  snareNoise: [2000, 5000],
  hat: [6000, 12000],
});

export const BPM_MIN = 60;
export const BPM_MAX = 180;
export const FLUX_HZ = 50;
export const FLUX_SECS = 8;
export const FLUX_N = FLUX_HZ * FLUX_SECS;

const BEAT_CONF_USE = 0.50; // below this, motion falls back to pure onsets

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function hslToHex(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = l - c / 2;
  const hex = (v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0');
  return '#' + hex(r) + hex(g) + hex(b);
}

/** 12 hues on a color wheel, C = red, stepping 30°. Unknown pitch → a muted violet. */
export function chromaHue(pc) {
  if (pc == null || pc < 0 || pc > 11) return '#a78bfa';
  return hslToHex(pc * 30, 0.72, 0.58);
}

export function chromaRgb(pc) {
  const hex = chromaHue(pc);
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/**
 * 12-bin chroma from FFT magnitudes. Energy is weighted into neighboring
 * pitch classes so a bin that sits between two notes is not snapped hard.
 */
export function chromaVector(bins, sampleRate, fftSize) {
  const chroma = new Float32Array(12);
  if (!bins || !bins.length) return chroma;
  const n = bins.length;
  const binHz = sampleRate / fftSize;
  for (let i = 1; i < n; i++) {
    const f = i * binHz;
    if (f < 80 || f > 5000) continue;
    const mag = bins[i] / 255;
    if (mag <= 0) continue;
    const midi = 69 + 12 * Math.log2(f / 440);
    const pc = ((midi % 12) + 12) % 12;
    const i0 = Math.floor(pc) % 12;
    const frac = pc - Math.floor(pc);
    const w = mag * mag;
    chroma[i0] += w * (1 - frac);
    chroma[(i0 + 1) % 12] += w * frac;
  }
  let s = 0;
  for (let i = 0; i < 12; i++) s += chroma[i];
  if (s > 1e-12) for (let i = 0; i < 12; i++) chroma[i] /= s;
  return chroma;
}

export function dominantPitchClass(chroma, minShare = 0.11) {
  let best = 0, v = -1, second = 0;
  if (!chroma) return { pc: -1, name: '—', conf: 0, value: 0 };
  for (let i = 0; i < 12; i++) {
    const x = chroma[i] || 0;
    if (x > v) { second = v; v = x; best = i; }
    else if (x > second) second = x;
  }
  if (v < minShare) return { pc: -1, name: '—', conf: 0, value: v < 0 ? 0 : v };
  const conf = v > 0 ? (v - Math.max(0, second)) / v : 0;
  return { pc: best, name: PITCH_CLASSES[best], conf, value: v };
}

/** Cosine distance in 0..2 (0 = same direction). */
export function chromaDistance(a, b) {
  if (!a || !b) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < 12; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Spectral flatness of power in a band: 1 = noise-like, 0 = tonal / a single peak. */
export function spectralFlatness(bins, sampleRate, fftSize, loHz = 80, hiHz = 8000) {
  if (!bins || !bins.length) return 0.5;
  const n = bins.length;
  const i0 = Math.max(1, Math.floor((loHz * fftSize) / sampleRate));
  const i1 = Math.min(n - 1, Math.ceil((hiHz * fftSize) / sampleRate));
  if (i1 < i0) return 0.5;
  let sum = 0, logSum = 0, c = 0;
  for (let i = i0; i <= i1; i++) {
    const p = (bins[i] / 255) * (bins[i] / 255) + 1e-8;
    sum += p;
    logSum += Math.log(p);
    c++;
  }
  if (!c) return 0.5;
  const arith = sum / c;
  const geo = Math.exp(logSum / c);
  return clamp01(geo / arith);
}

/** Half-wave-rectified spectral flux, normalized by bin count. */
export function spectralFlux(bins, prev) {
  if (!bins || !bins.length || !prev || prev.length !== bins.length) return 0;
  let s = 0;
  for (let i = 1; i < bins.length; i++) s += Math.max(0, bins[i] - prev[i]);
  return s / (bins.length * 255);
}

/**
 * Autocorrelation tempo from a spectral-flux history sampled at `hz`.
 * Returns { bpm, conf, lag }. conf is peak prominence in 0..1, 0 if the
 * buffer is too short or the peak is not clear.
 */
export function estimateTempo(flux, hz = FLUX_HZ) {
  const n = flux && flux.length ? flux.length : 0;
  const lag0 = Math.max(2, Math.round(hz * 60 / BPM_MAX));
  const lag1 = Math.min(n - 2, Math.round(hz * 60 / BPM_MIN));
  if (n < lag1 + 8 || lag1 <= lag0) return { bpm: 0, conf: 0, lag: 0 };
  let mean = 0;
  for (let i = 0; i < n; i++) mean += flux[i];
  mean /= n;
  let var_ = 0;
  for (let i = 0; i < n; i++) {
    const d = flux[i] - mean;
    var_ += d * d;
  }
  if (var_ < 1e-8) return { bpm: 0, conf: 0, lag: 0 };

  let bestLag = lag0, best = -Infinity, second = -Infinity;
  const ac = new Float32Array(lag1 + 1);
  for (let lag = lag0; lag <= lag1; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += (flux[i] - mean) * (flux[i - lag] - mean);
    ac[lag] = s / var_;
    if (ac[lag] > best) { second = best; best = ac[lag]; bestLag = lag; }
    else if (ac[lag] > second) second = ac[lag];
  }

  // Prefer a mid-range BPM (70–140) when a half/double lag is almost as strong,
  // so a 160 BPM reading that is really 80 does not win by default.
  const score = (lag) => {
    if (lag < lag0 || lag > lag1) return -Infinity;
    const bpm = 60 / (lag / hz);
    const mid = bpm >= 70 && bpm <= 140 ? 0.12 : 0;
    return (ac[lag] || 0) + mid;
  };
  const half = Math.round(bestLag / 2);
  const dbl = bestLag * 2;
  let pick = bestLag;
  if (score(half) > score(pick) * 0.92) pick = half;
  if (score(dbl) > score(pick) * 0.92) pick = dbl;
  const bpmAt = (lag) => 60 / (lag / hz);
  // Fold double-time peaks (tight 8th-note flux often wins at 2x, e.g. 172 vs 86)
  // down to the 70–140 felt beat. Do not fold a 120 pulse down to 60.
  if (bpmAt(pick) > 140 && dbl <= lag1 && (ac[dbl] || 0) >= 0.18 * best) pick = dbl;
  if (bpmAt(pick) < 70 && half >= lag0 && (ac[half] || 0) >= 0.18 * best) pick = half;

  const bpm = 60 / (pick / hz);
  if (!(bpm >= BPM_MIN && bpm <= BPM_MAX)) return { bpm: 0, conf: 0, lag: pick };
  // A periodic pulse has strong peaks at 2x / 3x the period; those are not
  // competing tempi, so they should not drag confidence down.
  let rival = 0;
  for (let lag = lag0; lag <= lag1; lag++) {
    if (lag === pick) continue;
    const ratio = lag / pick;
    const harmonic = Math.abs(ratio - Math.round(ratio)) < 0.1
      || Math.abs((pick / lag) - Math.round(pick / lag)) < 0.1;
    if (harmonic) continue;
    if (ac[lag] > rival) rival = ac[lag];
  }
  const prom = best > 0 ? clamp01((best - Math.max(0, rival)) / (best + 0.05)) : 0;
  const conf = clamp01(0.2 + prom * (0.5 + 0.3 * Math.min(1, n / (FLUX_HZ * 4))));
  return { bpm, conf, lag: pick };
}

/** Median inter-onset interval converted to BPM, from a list of onset times (seconds). */
export function tempoFromOnsets(times, minBpm = BPM_MIN, maxBpm = BPM_MAX) {
  if (!times || times.length < 4) return { bpm: 0, conf: 0 };
  const iois = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d >= 60 / maxBpm && d <= 60 / minBpm) iois.push(d);
  }
  if (iois.length < 3) return { bpm: 0, conf: 0 };
  iois.sort((a, b) => a - b);
  const mid = iois[Math.floor(iois.length / 2)];
  const bpm = 60 / mid;
  // How tightly the IOIs cluster around the median.
  let near = 0;
  for (let i = 0; i < iois.length; i++) if (Math.abs(iois[i] - mid) < mid * 0.12) near++;
  const conf = clamp01(near / iois.length);
  return { bpm, conf };
}

export function makeRhythmState() {
  return {
    prevBins: null,
    flux: new Float32Array(FLUX_N),
    fluxI: 0,
    fluxFilled: 0,
    accTime: 0,
    accFlux: 0,
    lastTempoAt: -10,
    t: 0,
    bpm: 0,
    beatConf: 0,
    phase: 0,
    barBeat: 0,
    barKick: [0, 0, 0, 0],
    downbeatSlot: 0,
    anticipUsed: false,
    gridOn: false,
    onsetTimes: [],
    chroma: new Float32Array(12),
    chromaSlow: new Float32Array(12),
    lastChordAt: -10,
    chordEnv: 0,
    kick: { peak: 0.07, env: 0 },
    snare: { peak: 0.07, env: 0 },
    hat: { peak: 0.07, env: 0 },
    onsetK: { prev: 0, fluxPeak: 0.02, last: -10, t: 0 },
    onsetS: { prev: 0, fluxPeak: 0.02, last: -10, t: 0 },
    onsetH: { prev: 0, fluxPeak: 0.02, last: -10, t: 0 },
    onsetF: { prev: 0, fluxPeak: 0.02, last: -10, t: 0 },
    kickHit: 0,
    snareHit: 0,
    hatHit: 0,
    kickFollow: { env: 0 },
    snareFollow: { env: 0 },
    hatFollow: { env: 0 },
    peek: { env: 0 },
  };
}

function writeFlux(rs, v) {
  rs.flux[rs.fluxI] = v;
  rs.fluxI = (rs.fluxI + 1) % FLUX_N;
  if (rs.fluxFilled < FLUX_N) rs.fluxFilled += 1;
}

function fluxTimeline(rs) {
  // Oldest-to-newest view of the ring, or a shorter prefix while filling.
  const n = rs.fluxFilled;
  const out = new Float32Array(n);
  const start = n < FLUX_N ? 0 : rs.fluxI;
  for (let i = 0; i < n; i++) out[i] = rs.flux[(start + i) % FLUX_N];
  return out;
}

/**
 * Advance rhythm state from one FFT frame. `bandMean`, `normalizePeak`,
 * `smoothToward` and `detectOnset` are passed in from dance.mjs so the
 * envelopes share the same helpers.
 */
export function tickRhythm(rs, ctx) {
  const dt = ctx.dt;
  const running = !!ctx.running;
  const bandMean = ctx.bandMean;
  const normalizePeak = ctx.normalizePeak;
  const smoothToward = ctx.smoothToward;
  const detectOnset = ctx.detectOnset;
  rs.t = (rs.t || 0) + dt;

  let kickR = 0, snareR = 0, hatR = 0, flux = 0, flat = 0.5;
  let bins = ctx.bins;
  const sr = ctx.sampleRate || 44100;
  const fft = ctx.fftSize || 2048;

  if (running && bins && bins.length) {
    kickR = bandMean(bins, sr, fft, RHYTHM_BANDS.kick[0], RHYTHM_BANDS.kick[1]) / 255;
    const body = bandMean(bins, sr, fft, RHYTHM_BANDS.snareBody[0], RHYTHM_BANDS.snareBody[1]) / 255;
    const noise = bandMean(bins, sr, fft, RHYTHM_BANDS.snareNoise[0], RHYTHM_BANDS.snareNoise[1]) / 255;
    snareR = body * 0.58 + noise * 0.42;
    hatR = bandMean(bins, sr, fft, RHYTHM_BANDS.hat[0], RHYTHM_BANDS.hat[1]) / 255;
    flux = spectralFlux(bins, rs.prevBins);
    if (!rs.prevBins || rs.prevBins.length !== bins.length) rs.prevBins = new Uint8Array(bins.length);
    rs.prevBins.set(bins);
    flat = spectralFlatness(bins, sr, fft, 80, 8000);
    const raw = chromaVector(bins, sr, fft);
    const aFast = 1 - Math.exp(-dt / 0.12);
    const aSlow = 1 - Math.exp(-dt / 0.85);
    for (let i = 0; i < 12; i++) {
      rs.chroma[i] += (raw[i] - rs.chroma[i]) * aFast;
      rs.chromaSlow[i] += (rs.chroma[i] - rs.chromaSlow[i]) * aSlow;
    }
  } else {
    const a = 1 - Math.exp(-dt / 0.25);
    for (let i = 0; i < 12; i++) {
      rs.chroma[i] += (0 - rs.chroma[i]) * a;
    }
    flat = 0.5;
  }

  const kickN = normalizePeak(rs.kick, kickR, dt);
  const snareN = normalizePeak(rs.snare, snareR, dt);
  const hatN = normalizePeak(rs.hat, hatR, dt);
  const kickE = smoothToward(rs.kick, running ? kickN : 0, dt, running ? 0.045 : 0.16);
  const snareE = smoothToward(rs.snare, running ? snareN : 0, dt, running ? 0.04 : 0.16);
  const hatE = smoothToward(rs.hat, running ? hatN : 0, dt, running ? 0.03 : 0.14);

  let kickHit = 0, snareHit = 0, hatHit = 0, fluxHit = 0;
  if (running) {
    kickHit = detectOnset(rs.onsetK, kickE, dt, 0.16);
    snareHit = detectOnset(rs.onsetS, snareE, dt, 0.14);
    hatHit = detectOnset(rs.onsetH, hatE, dt, 0.07);
    fluxHit = detectOnset(rs.onsetF, Math.min(1, flux * 8 + kickE * 0.5), dt, 0.12);
    // A snare usually has hat-band noise too; don't also fire a hat on the same frame.
    if (snareHit && hatHit) hatHit = 0;
  }
  if (kickHit) rs.kickHit = 1;
  if (snareHit) rs.snareHit = 1;
  if (hatHit) rs.hatHit = 1;
  rs.kickHit = Math.max(0, rs.kickHit - dt / 0.16);
  rs.snareHit = Math.max(0, rs.snareHit - dt / 0.12);
  rs.hatHit = Math.max(0, rs.hatHit - dt / 0.08);

  // Follow-through: the same hits, delayed, so tips lag the base.
  const kickF = smoothToward(rs.kickFollow, rs.kickHit, dt, 0.07);
  const snareF = smoothToward(rs.snareFollow, rs.snareHit, dt, 0.06);
  const hatF = smoothToward(rs.hatFollow, rs.hatHit + hatE * 0.35, dt, 0.05);

  // Flux history at a fixed 50 Hz, then a tempo estimate a few times a second.
  if (running) {
    rs.accTime += dt;
    rs.accFlux = Math.max(rs.accFlux, flux);
    const hop = 1 / FLUX_HZ;
    while (rs.accTime >= hop) {
      writeFlux(rs, rs.accFlux);
      rs.accFlux = 0;
      rs.accTime -= hop;
    }
    if (fluxHit || kickHit) {
      rs.onsetTimes.push(rs.t);
      if (rs.onsetTimes.length > 48) rs.onsetTimes.shift();
      // Drop onsets older than the flux window.
      const cut = rs.t - FLUX_SECS;
      while (rs.onsetTimes.length && rs.onsetTimes[0] < cut) rs.onsetTimes.shift();
    }
    if (rs.t - rs.lastTempoAt > 0.28 && rs.fluxFilled > FLUX_HZ * 2) {
      rs.lastTempoAt = rs.t;
      const ac = estimateTempo(fluxTimeline(rs), FLUX_HZ);
      const ioi = tempoFromOnsets(rs.onsetTimes);
      let bpm = ac.bpm, conf = ac.conf;
      if (ioi.bpm > 0) {
        const ratio = bpm > 0 ? ioi.bpm / bpm : 0;
        const agrees = bpm > 0 && (Math.abs(ioi.bpm - bpm) < 8
          || Math.abs(ratio - 2) < 0.12 || Math.abs(ratio - 0.5) < 0.08);
        if (agrees) conf = clamp01(conf * 0.55 + ioi.conf * 0.45 + 0.12);
        else if (ac.conf < ioi.conf && ioi.conf > 0.45) { bpm = ioi.bpm; conf = ioi.conf * 0.8; }
      }
      // Smooth the published BPM so the number does not chatter.
      if (bpm > 0) {
        if (!rs.bpm) rs.bpm = bpm;
        else if (Math.abs(bpm - rs.bpm) / rs.bpm < 0.12) rs.bpm += (bpm - rs.bpm) * 0.35;
        else if (conf > rs.beatConf + 0.15) rs.bpm += (bpm - rs.bpm) * 0.2;
      }
      rs.beatConf += (conf - rs.beatConf) * (conf >= rs.beatConf ? 0.4 : 0.15);
    }
  } else {
    rs.beatConf = Math.max(0, rs.beatConf - dt * 0.5);
  }

  // Beat-phase tracker. Anticipates the next beat only while confidence is high.
  let anticip = 0, downbeat = 0, beatPulse = 0;
  const enter = BEAT_CONF_USE;
  const exit = 0.35;
  const useGrid = rs.bpm >= BPM_MIN && (rs.gridOn
    ? rs.beatConf >= exit
    : rs.beatConf >= enter);
  rs.gridOn = !!(running && useGrid);
  if (running && useGrid) {
    const period = 60 / rs.bpm;
    const before = rs.phase || 0;
    rs.phase = before + dt / period;
    let frac = rs.phase - Math.floor(rs.phase);
    // Pull the phase toward 0 when a real kick or flux onset lands near a beat.
    if ((kickHit || fluxHit) && (frac < 0.22 || frac > 0.78)) {
      const target = frac < 0.5 ? 0 : 1;
      rs.phase += (target - frac) * 0.45;
    }
    const wrapped = rs.phase >= 1;
    rs.phase = rs.phase - Math.floor(rs.phase);
    if (rs.phase < 0) rs.phase += 1;
    if (wrapped) {
      beatPulse = 1;
      rs.barBeat = (rs.barBeat + 1) % 4;
      rs.anticipUsed = false;
    }
    const timeToBeat = (1 - rs.phase) * period;
    if (timeToBeat < 0.07 && !rs.anticipUsed) {
      anticip = 1 - timeToBeat / 0.07;
      if (anticip > 0.85) rs.anticipUsed = true;
    }
    if (kickHit) {
      const slot = rs.barBeat % 4;
      rs.barKick[slot] = (rs.barKick[slot] || 0) * 0.85 + kickE;
      let best = 0, bi = 0;
      for (let i = 0; i < 4; i++) if ((rs.barKick[i] || 0) > best) { best = rs.barKick[i]; bi = i; }
      rs.downbeatSlot = bi;
    }
    downbeat = (rs.barBeat === rs.downbeatSlot) ? 1 : 0;
  } else if (running) {
    // Low confidence: do not invent a grid. Phase just idles.
    anticip = 0;
    downbeat = 0;
  }

  const dom = dominantPitchClass(rs.chroma);
  const dist = chromaDistance(rs.chroma, rs.chromaSlow);
  let chord = 0;
  if (running && dist > 0.28 && dom.value > 0.16 && (rs.t - rs.lastChordAt) > 0.8) {
    rs.lastChordAt = rs.t;
    rs.chordEnv = 1;
  }
  rs.chordEnv = Math.max(0, (rs.chordEnv || 0) - dt / 0.45);
  chord = rs.chordEnv;

  const harmonic = clamp01(1 - flat);
  const percussive = clamp01(flat);

  return {
    kick: kickE,
    snare: snareE,
    hat: hatE,
    kickHit: rs.kickHit,
    snareHit: rs.snareHit,
    hatHit: rs.hatHit,
    kickFollow: kickF,
    snareFollow: snareF,
    hatFollow: hatF,
    flux,
    bpm: rs.bpm || 0,
    beatConf: rs.beatConf || 0,
    beatPhase: rs.phase || 0,
    barBeat: rs.barBeat || 0,
    downbeat,
    anticip,
    useGrid,
    chroma: rs.chroma,
    chromaPc: dom.pc,
    chromaName: dom.name,
    chromaHue: chromaHue(dom.pc),
    chromaConf: dom.conf,
    harmonic,
    percussive,
    flatness: flat,
    chordChange: chord,
    beatPulse,
  };
}

export { BEAT_CONF_USE };
