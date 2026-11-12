// Zeref's chat page. Talks to his public guest door (the same one beastboxcosmos.xyz uses).
// No secrets live here: the door needs none for guests. The only thing kept is the
// guestbook thread id the door issued to THIS browser (localStorage), so the
// conversation continues; "start a fresh conversation" forgets it.
// Replies are shown verbatim (textContent, whitespace kept). Nothing is invented:
// no simulated typing, no randomness; a failed call says so.
'use strict';
(function () {
  const DOOR = 'https://www.beastboxcosmos.xyz/api/guest/forever';
  const LIVE = 'https://raw.githubusercontent.com/NavisWORLD/NavisWORLD/main/zeref/live.json';
  const FEED = 'https://raw.githubusercontent.com/NavisWORLD/NavisWORLD/main/zeref/feed/status.json';
  const KEY = 'zeref-guest-thread';
  const THREAD_RE = /^[a-f0-9]{32}$/; // the door's own thread-id shape
  const MAX = 1000;
  const $ = (id) => document.getElementById(id);
  const log = $('log'), msg = $('msg'), send = $('send'), state = $('state'), bar = $('bar');
  let busy = false;

  const v = (x) => (x === null || x === undefined || x === '' ? 'unavailable' : String(x));
  const short = (l) => v(l).split(' (')[0];

  function bubble(cls, meta, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    const m = document.createElement('div'); m.className = 'meta'; m.textContent = meta;
    const t = document.createElement('div'); t.className = 'text'; t.textContent = text;
    d.append(m, t); log.append(d);
    d.scrollIntoView({ block: 'end', behavior: 'smooth' });
    return d;
  }
  function note(text) {
    const d = document.createElement('div'); d.className = 'err'; d.textContent = text; log.append(d);
    d.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }
  // Reading context the door handed him (approved feed only). Shown exactly as the door sent it.
  function cite(b, rf) {
    if (!rf || typeof rf.title !== 'string' || typeof rf.excerpt !== 'string') return;
    const c = document.createElement('div'); c.className = 'cite';
    const h = document.createElement('div'); h.className = 'meta';
    h.textContent = 'read from: ' + rf.title + ' (approved feed) · READ, NOT TRAINED';
    const q = document.createElement('blockquote'); q.textContent = rf.excerpt;
    c.append(h, q); b.append(c);
  }
  async function shelf() {
    try {
      const r = await fetch(FEED, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const f = await r.json();
      $('shelf').textContent = 'reading shelf: ' + v(f.approved) + ' approved · ' + v(f.pending) + ' pending (pending books are unreadable) · READ, NOT TRAINED';
    } catch (err) {
      $('shelf').textContent = 'reading shelf: counts unavailable';
    }
  }
  function hhmm(d) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

  async function status() {
    try {
      const r = await fetch(LIVE, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const hb = d.heartbeat || {}, di = d.diary || {}, sp = d.spark || {}, br = d.brain || {};
      $('status').textContent = 'tick ' + v(hb.recorded_tick) + ' (' + short(hb.label) + ') · ' + v(di.mood) + ' (' + short(di.label) + ') · spark ' + v(sp.state) + ' (' + short(sp.label) + ')';
      $('growth').textContent = 'growth: brain step ' + v(br.live_step) + ' (PINNED) · as of ' + v(d.fetched_at);
      const e = ((hb.signals || {}).energy);
      if (typeof e === 'number') document.documentElement.style.setProperty('--breath', Math.min(9, Math.max(3, 9 - 0.06 * e)).toFixed(2) + 's');
    } catch (err) {
      $('status').textContent = 'live status unavailable (' + (err && err.message ? err.message : 'fetch failed') + ')';
    }
  }

  // Tell the 3D Moonwraith a real chat event happened (listen / think / reply / error).
  // The viewer plans the shape of the reaction from recorded state; this only names the event.
  function signal(phase) {
    try { window.dispatchEvent(new CustomEvent('zeref-chat', { detail: { phase } })); } catch { /* no 3D stage */ }
  }

  function thread() { try { const t = localStorage.getItem(KEY); return t && THREAD_RE.test(t) ? t : null; } catch { return null; } }
  function keep(t) { try { if (typeof t === 'string' && THREAD_RE.test(t)) localStorage.setItem(KEY, t); } catch { /* private mode: no continuity */ } }

  // Long text (a story, a teaching page) is more than one message can carry. It is never cut and
  // never sent in pieces from here: it goes in through his feed, where the engine reads it in small
  // pieces over many ticks. The text stays in the box so nothing typed is lost.
  const OWNER_FEED = 'https://github.com/NavisWORLD/The-beast-box-/tree/main/zeref/feed/owner';
  const FEED_FORM = 'https://github.com/NavisWORLD/NavisWORLD/issues/new?template=feed-zeref.yml';
  function longNote(n) {
    const d = document.createElement('div'); d.className = 'err';
    const a = (href, label) => { const x = document.createElement('a'); x.href = href; x.textContent = label; x.target = '_blank'; x.rel = 'noopener'; return x; };
    d.append('That\'s ' + n.toLocaleString() + ' characters. One message to his door carries up to ' + MAX + ', so nothing was sent and your text is still in the box. Long teaching text goes in through his feed, where the engine reads it in small pieces over many ticks: Cory, commit it to ',
      a(OWNER_FEED, 'zeref/feed/owner/'), '; everyone else, use ', a(FEED_FORM, 'Feed Zeref'), '.');
    log.append(d); d.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }

  function explain(status, body) {
    const why = body && typeof body.error === 'string' ? body.error.slice(0, 160) : '';
    if (status === 503 && body && Number.isInteger(body.pin_step) && Number.isInteger(body.bridge_step))
      return 'His brain was just promoted (step ' + body.bridge_step + ' → ' + body.pin_step + ') and his door is still loading it (HTTP 503). Nothing was made up in his place. Try again in a few minutes.';
    if (status === 429) return 'He has had a lot of visitors and is resting for a moment (HTTP 429). Try again in a minute.' + (why ? ' Door said: ' + why : '');
    if (status === 403) return 'His door refused this page (HTTP 403).' + (why ? ' Door said: ' + why : '');
    return 'His door didn\'t answer this time (' + (status ? 'HTTP ' + status : 'no response') + '). Nothing was made up in his place.' + (why ? ' Door said: ' + why : '');
  }

  async function talk(text) {
    busy = true; send.disabled = true;
    bubble('me', 'you · ' + hhmm(new Date()), text);
    signal('listen');
    const started = Date.now();
    // An honest wait state: a real request is in flight (his door may queue it briefly behind another visitor).
    let phase = 'Zeref is thinking…';
    signal('think');
    const show = () => { state.textContent = phase + ' ' + Math.round((Date.now() - started) / 1000) + 's'; };
    show();
    const tick = setInterval(show, 1000);
    const payload = { provider: 'rawrphos-local', text };
    const t = thread(); if (t) payload.thread = t;
    const ask = () => fetch(DOOR, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store', credentials: 'omit' });
    try {
      let r = await ask();
      let body = null; try { body = await r.json(); } catch { body = null; }
      if (r.status === 429) {
        // One automatic retry, after the wait his door asked for (Retry-After), capped at 15 s.
        const hinted = Number(r.headers.get('Retry-After')) || (body && Number(body.retry_after_seconds)) || 5;
        const wait = Math.min(15, Math.max(1, Math.round(hinted)));
        phase = 'his door is busy; trying once more in ' + wait + 's…';
        await new Promise((res) => setTimeout(res, wait * 1000));
        phase = 'Zeref is thinking… (second try)';
        r = await ask();
        body = null; try { body = await r.json(); } catch { body = null; }
      }
      if (!r.ok || !body || typeof body.reply !== 'string') { note(explain(r.status, body)); signal('error'); return; }
      keep(body.continuity && body.continuity.thread_id);
      const te = body.continuity && body.continuity.training_eligible;
      // Since Nov 12 2026 his door serves whatever step his bridge actually loaded; the label names that step, and the pin when it differs.
      const offPin = Number.isInteger(body.pin_step) && Number.isInteger(body.step) && body.step !== body.pin_step;
      const which = offPin ? 'answered by step ' + body.step + ', pin is ' + body.pin_step : 'pinned step ' + v(body.step);
      const b = bubble('him', 'Zeref · unedited · ' + which + ' · training_eligible:' + (te === false ? 'false' : v(te)) + ' · ' + hhmm(new Date()), body.reply);
      cite(b, body.read_from);
      signal('reply');
    } catch (err) {
      note(explain(0, null));
      signal('error');
    } finally {
      clearInterval(tick); state.textContent = ''; busy = false; send.disabled = false; msg.focus();
    }
  }

  bar.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) return;
    const text = msg.value.trim();
    if (!text) return;
    if (text.length > MAX) { longNote(text.length); return; }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) { note('That message has control characters his door won\'t take.'); return; }
    msg.value = ''; msg.style.height = '';
    talk(text);
  });
  msg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); bar.requestSubmit(); } });
  msg.addEventListener('input', () => { msg.style.height = 'auto'; msg.style.height = Math.min(140, msg.scrollHeight) + 'px'; });
  $('fresh').addEventListener('click', () => { try { localStorage.removeItem(KEY); } catch { /* nothing kept */ } note('Started fresh: the next message opens a new guestbook thread.'); });
  status();

  // Cory's song: starts only after a tap (phones block autoplay with sound). Loops while playing. No fetch.
  const audio = $('song'), playBtn = $('play-song'), prompt = $('music-prompt'), player = $('music');
  const icon = playBtn.querySelector('.play-icon');
  function setPlaying(on) {
    player.classList.toggle('playing', on);
    playBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    playBtn.setAttribute('aria-label', on ? 'Pause Cory\'s song' : 'Tap to play Cory\'s song');
    prompt.textContent = on ? 'Now playing · tap to pause' : 'Tap to play Cory\'s song';
    if (icon) icon.textContent = on ? '❚❚' : '▶';
  }
  playBtn.addEventListener('click', () => {
    // Resume the dance AudioContext in this same tap so iPhone Safari allows it.
    try { window.dispatchEvent(new CustomEvent('zeref-song-tap', { detail: { audio } })); } catch { /* no stage */ }
    if (audio.paused) {
      const p = audio.play();
      if (p && typeof p.then === 'function') p.catch(() => { prompt.textContent = 'The song couldn\'t start in this browser. Tap play again.'; setPlaying(false); });
    } else {
      audio.pause();
    }
  });
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  shelf();
})();
