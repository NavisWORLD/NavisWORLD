// Live profile card: poll the bridge's public liveness endpoint and paint
// the status / growth / expression legend from that payload. chat.js keeps
// its three fetches (live.json, feed status, guest door). This module owns
// the liveness fetch. If the endpoint cannot be read (CORS, network, bad
// schema), fall back to the committed zeref/ files. No Math.random.
// LIVE describes payload freshness (generated_at); SIMULATED / RECORDED /
// PINNED describe origin and are never dropped.

export const LIVENESS_URL = 'https://www.beastboxcosmos.xyz/api/cosmos/liveness';
export const FRESH_MS = 2 * 60 * 1000;
export const POLL_MS = 15 * 1000;

export function ageMs(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  return Math.max(0, now - t);
}

export function formatAge(ms) {
  if (ms == null || !Number.isFinite(ms)) return null;
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + ' s ago';
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return m + 'm';
  const h = Math.round((m / 60) * 10) / 10;
  return h + 'h';
}

/**
 * LIVE when generated_at (or fetched_at) is younger than ~2 minutes.
 * STALE · Xm only when the payload itself is older than that.
 * Spark-channel STALE is a field label, not this badge.
 */
export function freshnessBadge(iso, now = Date.now(), origin = null) {
  const age = ageMs(iso, now);
  const originBit = origin ? ' · ' + origin : '';
  if (age == null) return { kind: 'UNKNOWN', text: 'freshness unknown' + originBit, ageMs: null, fresh: false };
  if (age < FRESH_MS) {
    return { kind: 'LIVE', text: 'LIVE · ' + formatAge(age) + originBit, ageMs: age, fresh: true };
  }
  const m = Math.max(1, Math.round(age / 60000));
  return { kind: 'STALE', text: 'STALE · ' + m + 'm' + originBit, ageMs: age, fresh: false };
}

export function shortProvenance(label) {
  const t = String(label || '');
  // "LOCAL SIMULATED" is a single origin token and must win over a bare SIMULATED.
  if (/LOCAL SIMULATED/i.test(t)) return 'LOCAL SIMULATED';
  // The first provenance token wins. A later parenthetical (e.g. a RECORDED
  // diary whose "growth circuit is Rigetti SIMULATED") must not override a
  // leading RECORDED mood label.
  const first = (t.match(/\b(RECORDED|PINNED|STALE|SIMULATED)\b/i) || [])[0];
  if (!first) return '';
  const u = first.toUpperCase();
  if (u === 'RECORDED' || u === 'PINNED' || u === 'STALE' || u === 'SIMULATED') return u;
  return '';
}

/** Heartbeat origin for the LIVE badge (LIVE describes freshness; this is origin). */
export function badgeOrigin(live) {
  const hb = (live && live.heartbeat) || {};
  return shortProvenance(hb.label) || null;
}

export function formatChicago(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return fmt.format(new Date(t)) + ' CT';
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map a beastbox-liveness/v1 document onto the live-card shape expression.mjs
 * already reads, plus the newly published public-safe fields.
 */
export function livenessToLive(doc) {
  if (!doc || doc.schema !== 'beastbox-liveness/v1') return null;
  const links = (doc.life_signals && doc.life_signals.links) || {};
  const spark = links.spark || {};
  const tick = links.liveTick || {};
  const diary = doc.diary && doc.diary.state !== 'DOWN' ? doc.diary : {};
  const brain = doc.brain || {};
  const bridge = doc.bridge && doc.bridge.state !== 'DOWN' ? doc.bridge : {};
  const promo = doc.promotion || {};
  const learn = doc.learning || {};
  return {
    schema: 'beastbox-liveness/v1',
    fetched_at: doc.generated_at || null,
    generated_at: doc.generated_at || null,
    source: 'liveness',
    heartbeat: {
      state: tick.state || null,
      label: tick.label || null,
      recorded_tick: tick.recorded_tick != null ? tick.recorded_tick : (diary.tick != null ? diary.tick : null),
      signals: tick.signals || null,
      xp_live: tick.xp_live != null ? tick.xp_live : null,
    },
    diary: {
      tick: diary.tick != null ? diary.tick : null,
      xp: diary.xp != null ? diary.xp : null,
      bond: diary.bond != null ? diary.bond : null,
      stage: diary.stage != null ? diary.stage : null,
      stage_name: diary.stage_name || null,
      last_tick_at: diary.last_tick_at || null,
      mood: diary.mood || null,
      learning: diary.learning || null,
      label: diary.label || null,
      verified: diary.verified === true,
    },
    spark: {
      state: spark.state || null,
      label: spark.label || null,
      tick: spark.tick != null ? spark.tick : null,
    },
    brain: {
      live_step: num(bridge.served_step) != null ? num(bridge.served_step) : num(brain.step),
      pin_step: num(bridge.pin_step) != null ? num(bridge.pin_step) : num(brain.step),
      pin_release: promo.release_tag || null,
      label: brain.label || null,
    },
    promotion: doc.promotion || null,
    gate: doc.gate || null,
    fair_gate: doc.fair_gate || null,
    lived_state: doc.lived_state || null,
    learning: learn,
  };
}

export function renderStatus(live) {
  const hb = (live && live.heartbeat) || {};
  const dy = (live && live.diary) || {};
  const sp = (live && live.spark) || {};
  const tick = hb.recorded_tick != null ? hb.recorded_tick : 'unavailable';
  const tickLab = shortProvenance(hb.label) || 'unavailable';
  const mood = dy.mood ? dy.mood : 'mood unpublished';
  const moodLab = shortProvenance(dy.label) || (dy.mood ? 'RECORDED' : 'unavailable');
  const sparkState = sp.state || 'unavailable';
  const sparkLab = shortProvenance(sp.label) || sparkState;
  return 'tick ' + tick + ' (' + tickLab + ') · ' + mood + ' (' + moodLab + ') · spark ' + sparkState + ' (' + sparkLab + ')';
}

export function renderGrowth(live, badge) {
  const br = (live && live.brain) || {};
  const learn = (live && live.learning) || {};
  const tr = learn.training || {};
  const promo = (live && live.promotion) || {};
  const bits = [];
  if (badge && badge.text) bits.push(badge.text);
  if (tr.status === 'in_progress' || tr.status === 'queued') {
    bits.push('training ' + tr.status + (tr.job ? ' (' + tr.job + ')' : ''));
    if (tr.cycle != null) bits.push('cycle ' + tr.cycle);
    if (tr.step != null) bits.push('run step ' + tr.step);
  } else if (tr.status === 'completed') {
    bits.push('training completed' + (tr.conclusion ? ' (' + tr.conclusion + ')' : ''));
  } else if (tr.state === 'DOWN') {
    bits.push('training status unreachable');
  }
  const pin = br.pin_step != null ? br.pin_step : (learn.pin_step != null ? learn.pin_step : null);
  if (pin != null) bits.push('pin ' + pin);
  if (promo.promoted_at) {
    const when = formatChicago(promo.promoted_at) || promo.promoted_at;
    bits.push('last promotion ' + when);
  } else if (promo.release_tag) {
    bits.push('last promotion tag ' + promo.release_tag);
  }
  if (promo.release_tag && promo.promoted_at) bits.push(promo.release_tag);
  return bits.join(' · ') || 'growth unavailable';
}

export function applyLiveCardDom(doc, live, badge, source) {
  if (!doc || typeof doc.getElementById !== 'function') return;
  const status = doc.getElementById('status');
  const growth = doc.getElementById('growth');
  const line = renderStatus(live);
  const grow = renderGrowth(live, badge);
  if (status) {
    status.textContent = line;
    status.title = (source === 'liveness' ? 'from public liveness' : 'fallback: committed zeref/ files') + ' — ' + line;
  }
  if (growth) {
    growth.textContent = grow;
    growth.classList.add('mw-live-growth');
    growth.dataset.fresh = badge && badge.kind ? badge.kind : '';
    growth.title = grow;
  }
}

export async function fetchLiveness(fetchImpl = fetch) {
  const r = await fetchImpl(LIVENESS_URL, { cache: 'no-store', credentials: 'omit' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const doc = await r.json();
  const live = livenessToLive(doc);
  if (!live) throw new Error('unexpected liveness schema');
  return { live, source: 'liveness', doc };
}

/**
 * Poll liveness every 15s (and refresh the age string every second).
 * loadFallback should return { live } from the committed zeref/ files.
 */
export function startLiveCard({
  intervalMs = POLL_MS,
  fetchImpl = fetch,
  loadFallback,
  onUpdate,
  document: doc,
} = {}) {
  let stopped = false;
  let lastLive = null;
  let lastSource = 'fallback';
  let pollTimer = 0;
  let ageTimer = 0;

  function emit(live, source) {
    lastLive = live;
    lastSource = source;
    const badge = freshnessBadge(live && (live.generated_at || live.fetched_at), Date.now(), badgeOrigin(live));
    if (doc) applyLiveCardDom(doc, live, badge, source);
    if (typeof onUpdate === 'function') onUpdate({ live, source, badge });
  }

  async function poll() {
    if (stopped) return;
    try {
      const got = await fetchLiveness(fetchImpl);
      emit(got.live, 'liveness');
    } catch {
      if (typeof loadFallback === 'function') {
        try {
          const fb = await loadFallback();
          emit((fb && fb.live) || {}, 'fallback');
        } catch {
          emit(lastLive || {}, lastSource === 'liveness' ? 'liveness' : 'fallback');
        }
      } else {
        emit(lastLive || {}, lastSource);
      }
    }
  }

  poll();
  pollTimer = setInterval(poll, intervalMs);
  ageTimer = setInterval(() => {
    if (stopped || !lastLive) return;
    const badge = freshnessBadge(lastLive.generated_at || lastLive.fetched_at, Date.now(), badgeOrigin(lastLive));
    if (doc) applyLiveCardDom(doc, lastLive, badge, lastSource);
  }, 1000);

  return function stop() {
    stopped = true;
    if (pollTimer) clearInterval(pollTimer);
    if (ageTimer) clearInterval(ageTimer);
  };
}
