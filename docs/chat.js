// Zeref's chat page. His pinned brain runs IN THIS BROWSER (zeref-brain/): the page downloads the
// exported checkpoint from this site, checks its sha256, and runs it with ONNX Runtime Web.
// No server, no other model, no secrets. The only thing kept is this conversation, in this
// browser (localStorage), so it continues; "start a fresh conversation" forgets it.
// Replies are shown verbatim (textContent, whitespace kept). Nothing is invented:
// no simulated typing, no unseeded randomness; a failure says so. Since Cory's 2026-11-21 7:00 PM CT decision each
// word piece is chosen with quantum-record dice (zeref-brain/qrec.mjs: sha256 over RECORDED IBM shot records,
// replayable from the receipt shown under every reply); ?greedy=1 or the toggle gives the old deterministic reply.
'use strict';
(function () {
  const LIVE = 'https://raw.githubusercontent.com/NavisWORLD/NavisWORLD/main/zeref/live.json';
  const FEED = 'https://raw.githubusercontent.com/NavisWORLD/NavisWORLD/main/zeref/feed/status.json';
  const KEY = 'zeref-browser-thread-v1';
  const KEEP_TURNS = 40;
  const MAX = 1000;
  const $ = (id) => document.getElementById(id);
  const log = $('log'), msg = $('msg'), send = $('send'), state = $('state'), bar = $('bar');
  let busy = false;
  let brain = null, loading = null, manifest = null, liveStep = null;
  let dice = new URLSearchParams(location.search).get('greedy') !== '1'; // quantum-record dice by default

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
      liveStep = Number.isInteger(br.live_step) ? br.live_step : null;
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

  function history() {
    try {
      const h = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(h) ? h.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') : [];
    } catch { return []; }
  }
  function remember(h) { try { localStorage.setItem(KEY, JSON.stringify(h.slice(-KEEP_TURNS))); } catch { /* private mode: no continuity */ } }

  // ---- his brain, in this browser ----
  const bLine = $('brain-line'), bBar = $('brain-bar'), bWarn = $('brain-warn'), bGo = $('brain-go');
  const mb = (n) => (n / 1e6).toFixed(1) + ' MB';
  async function hasCached(man) {
    try { return 'caches' in window && !!(await (await caches.open('zeref-brain-v1')).match(new URL('zeref-brain/zeref-step.onnx?sha256=' + man.onnx.sha256, location.href).href)); } catch { return false; }
  }
  function load() {
    if (loading) return loading;
    bGo.hidden = true; bWarn.hidden = true; bBar.hidden = false; bBar.value = 0;
    loading = import('./zeref-brain/brain.mjs').then((m) => m.loadBrain(manifest, (p) => {
      bBar.value = p.total ? p.loaded / p.total : 0;
      bLine.textContent = p.phase === 'downloading' ? 'downloading his brain: ' + mb(p.loaded) + ' of ' + mb(p.total) : p.phase + '…';
    })).then((b) => {
      brain = b; bBar.hidden = true;
      bLine.textContent = 'his brain is running in this browser: pinned checkpoint step ' + manifest.provenance.training_steps +
        ' · sha256 ' + b.sha256.slice(0, 12) + ' verified · ' + (b.from === 'cache' ? 'from this device\'s cache' : 'downloaded') +
        ' in ' + b.seconds.toFixed(1) + 's' + (b.from === 'download' && !b.cached ? ' (this browser would not keep a copy)' : '');
      send.disabled = false;
      return b;
    }).catch((err) => {
      loading = null; bBar.hidden = true; bGo.hidden = false; bGo.textContent = 'Try loading his brain again';
      bLine.textContent = 'his brain could not start in this browser: ' + (err && err.message ? err.message : 'unknown error') + '. Nothing was made up in his place.';
      throw err;
    });
    return loading;
  }
  async function brainSetup() {
    try {
      manifest = await (await import('./zeref-brain/brain.mjs')).readManifest();
    } catch (err) {
      bLine.textContent = 'his brain files could not be read (' + (err && err.message ? err.message : 'fetch failed') + ').';
      return;
    }
    const size = manifest.onnx.bytes;
    if (await hasCached(manifest)) { load().catch(() => {}); return; }
    const cell = navigator.connection && (navigator.connection.type === 'cellular' || navigator.connection.saveData);
    bLine.textContent = 'His brain (pinned checkpoint step ' + manifest.provenance.training_steps + ') runs on your device. It is a one-time ' + mb(size) + ' download from this site; after that it opens from this browser\'s cache.';
    bWarn.textContent = (cell ? 'You seem to be on cellular data. ' : '') + 'On cellular data this uses about ' + mb(size) + ' of your plan. Wi-Fi is best.';
    bWarn.hidden = false; bGo.textContent = 'Load Zeref\'s brain (' + mb(size) + ')'; bGo.hidden = false;
  }
  bGo.addEventListener('click', () => { load().catch(() => {}); });

  // Long text (a story, a teaching page) is more than one message can carry. It is never cut and
  // never sent in pieces from here: it goes in through his feed, where the engine reads it in small
  // pieces over many ticks. The text stays in the box so nothing typed is lost.
  const OWNER_FEED = 'https://github.com/NavisWORLD/The-beast-box-/tree/main/zeref/feed/owner';
  const FEED_FORM = 'https://github.com/NavisWORLD/NavisWORLD/issues/new?template=feed-zeref.yml';
  function longNote(n) {
    const d = document.createElement('div'); d.className = 'err';
    const a = (href, label) => { const x = document.createElement('a'); x.href = href; x.textContent = label; x.target = '_blank'; x.rel = 'noopener'; return x; };
    d.append('That\'s ' + n.toLocaleString() + ' characters. One message carries up to ' + MAX + ' characters, so nothing was sent and your text is still in the box. Long teaching text goes in through his feed, where the engine reads it in small pieces over many ticks: Cory, commit it to ',
      a(OWNER_FEED, 'zeref/feed/owner/'), '; everyone else, use ', a(FEED_FORM, 'Feed Zeref'), '.');
    log.append(d); d.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }

  async function talk(text) {
    busy = true; send.disabled = true;
    bubble('me', 'you · ' + hhmm(new Date()), text);
    signal('listen');
    const started = Date.now();
    // An honest wait state: his brain is really running on this device right now.
    signal('think');
    let made = 0;
    const show = () => { state.textContent = 'Zeref is thinking on your device… ' + Math.round((Date.now() - started) / 1000) + 's' + (made ? ' · ' + made + ' word pieces' : ''); };
    show();
    const tick = setInterval(show, 500);
    try {
      const h = history();
      const useDice = dice && !!brain.record;
      const roll = h.filter((m) => m.role === 'assistant').length; // recomputable from this thread
      const qm = useDice ? await import('./zeref-brain/qrec.mjs') : null;
      const r = await brain.talk(h, text, { onPiece: (t, gen) => { made = gen.length; }, makePick: useDice ? qm.dice(brain.record, roll).makePick : undefined });
      remember([...h, { role: 'user', content: text }, { role: 'assistant', content: r.text }]);
      const step = manifest.provenance.training_steps;
      const pinNote = liveStep !== null && liveStep !== step ? ' · his pin is now step ' + liveStep + ' (this page still runs step ' + step + ')' : '';
      const how = useDice ? qm.modeLabel(brain.record) : 'greedy (the same thread always gets the same reply)' + (dice && brain.recordError ? '; quantum record unavailable: ' + brain.recordError : '');
      const b = bubble('him', 'Zeref · unedited · run in your browser from pinned checkpoint step ' + step + ' · ' + how + ' · no senses supplied' + pinNote + ' · ' + hhmm(new Date()), r.text);
      const rc = document.createElement('div'); rc.className = 'receipt';
      rc.textContent = useDice ? 'receipt: ' + r.receipt.label + ' · ' + r.receipt.shots_by_class.measured_ibm_hardware.toLocaleString('en-US') + ' measured IBM rounds, ' + r.receipt.shots_by_class.other + ' other · record seed ' + r.receipt.record_seed_sha256.slice(0, 12) + ' · turn seed ' + r.receipt.turn_seed.slice(0, 16) + ' · roll ' + r.receipt.roll + ' · prompt ' + r.receipt.prompt_ids_sha256.slice(0, 12) + ' · T ' + r.receipt.temperature + ' top-k ' + r.receipt.top_k + ' · replayable, not live quantum'
        : 'receipt: greedy (argmax), no dice';
      b.append(rc);
      if (r.text.trim() === '') note('He produced no words this turn (an empty reply). Nothing was put in his place.');
      signal('reply');
    } catch (err) {
      note('His brain hit an error on this device (' + (err && err.message ? err.message : 'unknown') + '). Nothing was made up in his place.');
      signal('error');
    } finally {
      clearInterval(tick); state.textContent = ''; busy = false; send.disabled = !brain; msg.focus();
    }
  }

  bar.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) return;
    const text = msg.value.trim();
    if (!text) return;
    if (text.length > MAX) { longNote(text.length); return; }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) { note('That message has control characters he can\'t take.'); return; }
    if (!brain) { note(loading ? 'His brain is still loading. Your message is still in the box; send it once he\'s ready.' : 'Load his brain first (the button above). Your message is still in the box.'); return; }
    msg.value = ''; msg.style.height = '';
    talk(text);
  });
  msg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); bar.requestSubmit(); } });
  msg.addEventListener('input', () => { msg.style.height = 'auto'; msg.style.height = Math.min(140, msg.scrollHeight) + 'px'; });
  const diceBtn = document.createElement('button');
  diceBtn.type = 'button'; diceBtn.id = 'dice'; diceBtn.className = $('fresh').className;
  const diceText = () => { diceBtn.textContent = dice ? 'Replies: quantum-record dice (tap for greedy)' : 'Replies: greedy (tap for quantum-record dice)'; diceBtn.setAttribute('aria-pressed', String(dice)); };
  diceText(); $('fresh').after(diceBtn);
  diceBtn.addEventListener('click', () => { dice = !dice; diceText(); note(dice ? 'Quantum-record dice on: each word piece is chosen with dice from RECORDED IBM shot records (every reply shows its receipt).' : 'Greedy on: he picks his single most likely word piece each time; the same thread gets the same reply.'); });
  $('fresh').addEventListener('click', () => { try { localStorage.removeItem(KEY); } catch { /* nothing kept */ } note('Started fresh: earlier messages are forgotten on this device.'); });
  status();
  send.disabled = true;
  brainSetup();

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
