// Eye color, iris glow, and a rest expression mapped from Zeref's REAL
// recorded state in zeref/live.json (the public live card this page already
// reads). Only fields that actually exist are used. If a signal is missing,
// a documented neutral default is used and the legend says so.
// This is a display mapping of recorded numbers and labels, not a claim of
// feelings or consciousness, and it does not call Zeref an AI or a language
// model. No Math.random. No writes to training, pins, or gates.
//
// Song reactions still override body motion; these signals set the base
// mood and the iris / glow, which stay in place while he dances.

export const EXPR_CAPTION = "expression mapped from Zeref's recorded state · not a claim of feelings";

// Documented iris hues for recorded diary moods. Anything else (or a missing
// mood) uses the neutral default and is listed as such.
export const MOOD_IRIS = Object.freeze({
  content: '#c026d3',
  calm: '#3b82f6',
  sleepy: '#4f46e5',
  tired: '#4338ca',
  curious: '#22d3ee',
  excited: '#f0abfc',
  playful: '#e879f9',
  default: '#7c3aed',
});

const STALE_MS = 2 * 60 * 1000; // payload freshness window; LIVE if generated_at/fetched_at is younger than this

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function shortLabel(s) {
  const t = String(s || '');
  if (/LOCAL SIMULATED/i.test(t)) return 'LOCAL SIMULATED';
  if (/STALE/i.test(t)) return 'STALE';
  if (/SIMULATED/i.test(t)) return 'SIMULATED';
  if (/RECORDED/i.test(t)) return 'RECORDED';
  if (/PINNED/i.test(t)) return 'PINNED';
  return t.split('(')[0].trim().slice(0, 28) || 'unavailable';
}

function parseTime(s) {
  const t = Date.parse(s || '');
  return Number.isFinite(t) ? t : null;
}

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  if (!Number.isFinite(n)) return { r: 0.65, g: 0.55, b: 0.98 };
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const k = clamp01(t);
  const r = Math.round((A.r + (B.r - A.r) * k) * 255);
  const g = Math.round((A.g + (B.g - A.g) * k) * 255);
  const bl = Math.round((A.b + (B.b - A.b) * k) * 255);
  return '#' + [r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function freshness(live) {
  // LIVE / STALE describes payload freshness only. A spark channel that is
  // STALE stays a field label; it does not flip the card badge or dim the glow.
  const fetched = parseTime(live.generated_at || live.fetched_at);
  let ageMs = null;
  let ageH = null;
  if (fetched != null) {
    ageMs = Math.max(0, Date.now() - fetched);
    ageH = ageMs / 3600000;
  }
  const stale = ageMs == null ? false : ageMs >= STALE_MS;
  const bits = [];
  if (stale) bits.push('payload older than 2 min');
  const sp = live.spark || {};
  const hb = live.heartbeat || {};
  const spState = String(sp.state || '').toUpperCase();
  const hbState = String(hb.state || '').toUpperCase();
  return { stale, bits, ageH, ageMs, sparkState: spState || null, heartbeatState: hbState || null };
}

/**
 * Map a live-card snapshot to iris color, glow, and a rest expression.
 * Deterministic for a given `live` object (freshness age uses fetched_at
 * only as a recorded timestamp compared with now, never as chance).
 */
export function mapExpression(live = {}) {
  const hb = live.heartbeat || {};
  const sg = hb.signals || {};
  const dy = live.diary || {};
  const sp = live.spark || {};
  const br = live.brain || {};
  const missing = [];
  const rows = [];

  // Published public-safe fields are shown as rows below. Only list a field
  // as unavailable when this snapshot does not carry it at all (fallback
  // zeref/ files). An explicit "unpublished" status is a real public result,
  // not a missing read.
  const lived = live.lived_state || null;
  const promo = live.promotion || null;
  const gate = live.gate || null;
  const fairGate = live.fair_gate || null;
  if (!lived) {
    missing.push({
      id: 'state12',
      name: '12D lived state (state12 / dyn12)',
      note: 'not in this snapshot (liveness publishes an explicit unpublished status when the public surface has no live 12-D vector)',
    });
  } else if (lived.status !== 'published' || !Array.isArray(lived.state12)) {
    // shown as a published row, not as a generic unavailable line
  }
  if (dy.mood == null || dy.mood === '') {
    // diary tone is not a separate published field; mood is the affective field
    missing.push({
      id: 'tone',
      name: 'diary tone',
      note: 'the diary publishes mood, not a separate tone field; mood is also missing from this snapshot',
    });
  }
  if (!gate && !fairGate) {
    missing.push({
      id: 'fair-gate',
      name: 'fair-gate result',
      note: 'not in this snapshot',
    });
  }
  if (!promo) {
    missing.push({
      id: 'promotion-at',
      name: 'last promotion time',
      note: 'not in this snapshot',
    });
  }

  const moodRaw = dy.mood == null || dy.mood === '' ? null : String(dy.mood);
  const mood = moodRaw ? moodRaw.toLowerCase() : null;
  const knownMood = !!(mood && MOOD_IRIS[mood]);
  const irisBase = knownMood ? MOOD_IRIS[mood] : MOOD_IRIS.default;
  if (!moodRaw) missing.push({ id: 'mood', name: 'diary mood', note: 'unavailable in this snapshot · neutral iris' });

  const energy = num(sg.energy);
  const signal = num(sg.signal);
  const memory = num(sg.memory);
  const resonance = num(sg.resonance);
  if (energy == null) missing.push({ id: 'energy', name: 'heartbeat energy', note: 'unavailable · mid glow' });
  if (signal == null) missing.push({ id: 'signal', name: 'heartbeat signal', note: 'unavailable' });
  if (resonance == null) missing.push({ id: 'resonance', name: 'heartbeat resonance', note: 'unavailable · no hue accent' });

  // Slight cyan accent as recorded resonance rises. Neutral (no shift) if missing.
  const res01 = resonance == null ? 0.5 : clamp01(resonance / 100);
  const iris = mixHex(irisBase, '#67e8f9', resonance == null ? 0 : (res01 - 0.5) * 0.22);

  const fresh = freshness(live);
  const energy01 = energy == null ? 0.5 : clamp01(energy / 100);
  const signal01 = signal == null ? energy01 : clamp01(signal / 100);
  const arousal = (energy == null && signal == null) ? 0.5 : (energy01 + signal01) / (energy == null || signal == null ? 1 : 2);
  let glow = 0.35 + energy01 * 0.65;
  if (fresh.stale) glow *= 0.45;

  const sleepyMood = !!(mood && /sleep|tired/.test(mood));
  // Sleepy lids when the recorded diary mood is sleepy/tired, or energy is low.
  // Last training-run time is not published, so we do not invent "training idle".
  const sleepy = sleepyMood ? 0.55 + (1 - energy01) * 0.25 : (energy != null && energy < 35 ? 0.3 + (1 - energy01) * 0.2 : 0);
  const lids = clamp01(0.15 + arousal * 0.7 - sleepy * 0.55); // 1 = open
  const pupil = clamp01(0.45 + (1 - arousal) * 0.3 + sleepy * 0.15); // 1 = more open / softer

  const liveStep = num(br.live_step);
  const pinStep = num(br.pin_step);
  const pinRelease = br.pin_release ? String(br.pin_release) : null;
  const proud = !!(pinRelease && liveStep != null && pinStep != null && liveStep === pinStep);

  const pose = {
    sleepy,
    smile: sleepyMood ? 0.08 : (mood === 'content' || mood === 'calm' ? 0.28 : 0.18),
    happy: (mood === 'excited' || mood === 'playful') ? 0.3 : (proud ? 0.22 : 0),
    grin: proud ? 0.2 : 0,
    curious: mood === 'curious' ? 0.45 : 0,
    browsUp: proud ? 0.2 : (mood === 'curious' ? 0.25 : 0),
    earL: sleepy ? -0.12 : (mood === 'playful' || mood === 'excited' ? 0.2 : 0.06),
    earR: sleepy ? -0.12 : (mood === 'playful' || mood === 'excited' ? 0.2 : 0.06),
    tail: sleepy ? -0.08 : (res01 - 0.4) * 0.25,
    wing: sleepy ? -0.05 : (proud ? 0.2 : (res01 - 0.4) * 0.2),
    hop: 0,
  };

  const ageNote = fresh.ageMs == null
    ? 'freshness unknown'
    : (fresh.stale
      ? 'STALE · ' + Math.max(1, Math.round(fresh.ageMs / 60000)) + 'm'
      : 'LIVE · ' + (fresh.ageMs < 60000 ? Math.round(fresh.ageMs / 1000) + ' s ago' : Math.round(fresh.ageMs / 60000) + 'm'));
  rows.push({
    id: 'iris',
    label: 'iris',
    value: moodRaw ? moodRaw + (knownMood ? '' : ' (unlisted · default iris)') : 'mood unavailable · default iris',
    source: moodRaw ? 'diary.mood RECORDED' : 'default',
    swatch: iris,
  });
  rows.push({
    id: 'glow',
    label: 'glow',
    value: (energy == null ? 'mid (default)' : 'energy ' + energy)
      + (fresh.stale ? ' · dimmed (' + (fresh.bits.join('; ') || 'STALE') + ')' : ' · full')
      + ' · ' + ageNote,
    source: 'heartbeat energy SIMULATED; glow dims only when the payload itself is STALE (older than ~2 min), not when the spark channel is STALE',
  });
  rows.push({
    id: 'lids',
    label: 'lids',
    value: 'open ' + lids.toFixed(2) + (sleepy > 0.05 ? ' · sleepy ' + sleepy.toFixed(2) : ''),
    source: 'energy + signal + mood; no pupil morph on the sculpt, so lids are the proxy',
  });
  rows.push({
    id: 'posture',
    label: 'rest',
    value: (moodRaw ? 'mood ' + moodRaw : 'neutral') + (resonance != null ? ', resonance ' + resonance : '') + (proud ? ' · proud (served step matches pin)' : ''),
    source: 'diary.mood + resonance; proud uses live_step === pin_step',
  });
  rows.push({
    id: 'signals',
    label: 'signals',
    value: 'spark ' + (sp.state || 'unavailable') + ' · ' + shortLabel(sp.label)
      + ' · heartbeat ' + (hb.state || 'unavailable') + ' tick ' + (hb.recorded_tick ?? 'unavailable') + ' ' + shortLabel(hb.label)
      + ' · training ' + (liveStep ?? 'unavailable') + (pinStep != null ? ' / pin ' + pinStep : '') + (pinRelease ? ' · ' + pinRelease : ''),
    source: 'spark (IBM RECORDED seed / Rigetti SIMULATED / LOCAL SIMULATED / STALE) · heartbeat SIMULATED · brain PINNED',
  });
  if (lived) {
    const published = lived.status === 'published' && Array.isArray(lived.state12) && lived.state12.length === 12;
    rows.push({
      id: 'state12',
      label: '12D lived state',
      value: published
        ? lived.state12.map((n) => Number(n).toFixed(3)).join(' ')
        : (lived.status || 'unpublished') + (lived.reason ? ' · ' + lived.reason : ''),
      source: (lived.source || 'public liveness') + (lived.label ? ' · ' + lived.label : ''),
    });
  }
  if (dy.mood) {
    rows.push({
      id: 'mood-tone',
      label: 'diary mood',
      value: String(dy.mood) + ' (the published affective field; the diary has no separate tone)',
      source: 'diary.mood RECORDED',
    });
  }
  if (gate) {
    const gbits = [];
    if (gate.schema) gbits.push(gate.schema);
    if (gate.chat_not_worse === true) gbits.push('chat_not_worse true');
    else if (gate.chat_not_worse === false) gbits.push('chat_not_worse false');
    if (gate.candidate_leaks != null) gbits.push('leaks ' + gate.candidate_leaks);
    if (gate.result) gbits.push(gate.result);
    rows.push({
      id: 'gate',
      label: 'published gate',
      value: gbits.join(' · ') || 'published',
      source: (gate.source || 'public pin') + (gate.label ? ' · ' + gate.label : ''),
    });
  }
  if (fairGate) {
    rows.push({
      id: 'fair-gate',
      label: 'fair-gate',
      value: (fairGate.status || '') + (fairGate.note ? ' · ' + fairGate.note : ''),
      source: fairGate.label || 'unpublished as a global live field',
    });
  }
  if (promo) {
    const when = promo.promoted_at || 'time not on this snapshot';
    rows.push({
      id: 'promotion',
      label: 'last promotion',
      value: (promo.release_tag || 'tag unavailable') + ' · ' + when + (promo.step != null ? ' · step ' + promo.step : ''),
      source: (promo.source || 'public pin') + (promo.label ? ' · ' + promo.label : ''),
    });
  }
  const learn = live.learning || {};
  const tr = learn.training || {};
  if (learn.training || learn.diary || learn.pin_step != null) {
    const lbits = [];
    if (tr.status) lbits.push(tr.status);
    else if (tr.state) lbits.push(tr.state);
    if (tr.job) lbits.push(tr.job);
    if (tr.cycle != null) lbits.push('cycle ' + tr.cycle);
    if (tr.step != null) lbits.push('run step ' + tr.step);
    if (learn.pin_step != null || (live.brain && live.brain.pin_step != null)) {
      lbits.push('pin ' + (learn.pin_step != null ? learn.pin_step : live.brain.pin_step));
    }
    if (promo && promo.promoted_at) lbits.push('last promotion ' + promo.promoted_at);
    rows.push({
      id: 'learning',
      label: 'learning',
      value: lbits.join(' · ') || 'status unread',
      source: (tr.source || tr.label || 'public Actions + pin') + '',
    });
  }
  if (missing.length) {
    rows.push({
      id: 'missing',
      label: 'unavailable',
      value: missing.map((m) => m.name).join('; '),
      source: 'not in this snapshot; shown as a neutral default, not invented',
      missing: true,
    });
  }

  const miss = rows.filter((r) => r.missing);
  const kept = rows.filter((r) => !r.missing);
  rows.length = 0;
  rows.push(...miss, ...kept);

  return {
    iris,
    irisRgb: hexToRgb(iris),
    glow,
    lids,
    pupil,
    sleepy,
    proud,
    arousal,
    pose,
    mood: moodRaw,
    stale: fresh.stale,
    staleBits: fresh.bits,
    missing,
    rows,
    caption: EXPR_CAPTION,
    fetched_at: live.fetched_at || null,
  };
}

/** CSS / overlay for the 2D portrait fallback (a tint and eye glow, not a new drawing). */
export function applyExpressionCSS(el, expr) {
  if (!el || !expr) return;
  el.style.setProperty('--mw-iris', expr.iris || MOOD_IRIS.default);
  el.style.setProperty('--mw-glow', (expr.glow != null ? expr.glow : 0.5).toFixed(3));
  el.style.setProperty('--mw-lids', (expr.lids != null ? expr.lids : 0.6).toFixed(3));
  if (el.querySelector && el.querySelector('.portrait')) el.classList.add('mw-expressed');
}

/** Paint the legend under the stage. Returns the element. */
export function ensureExpressionLegend(host, expr) {
  if (!host) return null;
  let box = host.querySelector('.mw-expr');
  if (!box) {
    box = document.createElement('div');
    box.className = 'mw-expr';
    const cap = document.createElement('p');
    cap.className = 'mw-expr-cap';
    box.appendChild(cap);
    const list = document.createElement('ul');
    list.className = 'mw-expr-legend';
    box.appendChild(list);
    const capEl = host.querySelector('.mw-cap');
    if (capEl && capEl.parentElement === host) capEl.insertAdjacentElement('afterend', box);
    else host.appendChild(box);
  }
  const cap = box.querySelector('.mw-expr-cap');
  if (cap) cap.textContent = (expr && expr.caption) || EXPR_CAPTION;
  const list = box.querySelector('.mw-expr-legend');
  if (list) {
    while (list.firstChild) list.removeChild(list.firstChild);
    const rows = (expr && expr.rows) || [];
    for (const row of rows) {
      const li = document.createElement('li');
      if (row.missing) li.className = 'missing';
      if (row.swatch) {
        const sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.background = row.swatch;
        li.appendChild(sw);
      }
      const b = document.createElement('b');
      b.textContent = row.label;
      li.appendChild(b);
      li.appendChild(document.createTextNode(' · ' + row.value));
      if (row.source) {
        li.title = row.label + ' — ' + row.source;
        const src = document.createElement('span');
        src.className = 'src';
        src.textContent = ' (' + row.source + ')';
        li.appendChild(src);
      }
      list.appendChild(li);
    }
  }
  return box;
}

/**
 * Tint the sculpted eye (and a little of the moon / catch) with the mapped
 * iris and glow. Both eyes share one material, and there is no pupil morph,
 * so pupil size is approximated with lids + glow, not a made-up UV pupil.
 */
export function applyEyes(model, expr, { flare = 0, cosmic = null, pulse = 0 } = {}) {
  if (!model || !expr) return;
  const rgb = expr.irisRgb || hexToRgb(expr.iris);
  // Mood tint stays the base color; bass / RMS only pulse the brightness.
  const glow = (expr.glow || 0.5) * (1 + Math.max(0, flare) * 0.7 + Math.max(0, pulse) * 0.85);
  const sleepy = expr.sleepy || 0;
  const eyeI = 0.45 + glow * 0.40 - sleepy * 0.15;
  if (cosmic && typeof cosmic.setIris === 'function') cosmic.setIris(rgb, glow);
  model.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || !m.name) continue;
      const n = m.name;
      if (/zeref_eye|eye/i.test(n)) {
        if (m.color) m.color.setRGB(rgb.r, rgb.g, rgb.b);
        if (m.emissive) m.emissive.setRGB(rgb.r, rgb.g, rgb.b);
        if ('emissiveIntensity' in m) m.emissiveIntensity = eyeI;
        m.needsUpdate = true;
      } else if (/zeref_moon|zeref_glow|zeref_catch|zeref_gem/i.test(n)) {
        if (m.emissive && 'emissiveIntensity' in m) {
          // Keep the sculpted hue; only lift intensity with the recorded glow.
          m.emissiveIntensity = Math.max(1.1, 1.05 + glow * 0.6);
        }
      }
    }
  });
}

export { hexToRgb, mixHex, STALE_MS };
