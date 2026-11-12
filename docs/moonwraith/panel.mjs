// The 3D Moonwraith on the chat page: loads only when the stage is on screen
// and the device can run it; otherwise the canonical 2D portrait stays.
// The play-button tap is forwarded here synchronously so iPhone Safari will
// resume the AudioContext that drives his dance.
import { canRun3D } from './moonwraith3d.mjs';
import { attachDance, tickDance, applyDanceCSS, DANCE_CAPTION } from './dance.mjs';
import { ensureSignalReadout } from './particles.mjs';
import { mapExpression, applyExpressionCSS, ensureExpressionLegend } from './expression.mjs';
import { startLiveCard } from './live-card.mjs';
import { ensureWorldBackdrop, applyWorldCSS, WORLD_CAPTION } from './world.mjs';

const el = document.getElementById('moonwraith');
const st = document.getElementById('mw-status');
if (!el) throw new Error('moonwraith stage missing');
ensureSignalReadout(el);
ensureWorldBackdrop(el, 'zeref');

let started = false;
let view = null;

// Own the liveness fetch here (not in chat.js, so the 3-fetch rule stays).
// Overwrites #status / #growth when the public endpoint answers, and falls
// back to the committed zeref/ files if it cannot be read.
startLiveCard({
  document,
  loadFallback: async () => {
    const { loadLive } = await import('./motion.mjs');
    return loadLive();
  },
  onUpdate({ live }) {
    const expr = mapExpression(live || {});
    applyExpressionCSS(el, expr);
    applyWorldCSS(el.querySelector('.mw-world'), live);
    ensureExpressionLegend(el.parentElement || el, expr);
    if (view && typeof view.setLive === 'function') view.setLive(live, expr);
  },
});

window.addEventListener('zeref-song-tap', (e) => {
  const audio = e && e.detail && e.detail.audio;
  if (audio) attachDance(audio);
});

function withWorldCaption(s) {
  const t = String(s || '');
  return t.includes(WORLD_CAPTION) ? t : (t ? t + ' · ' + WORLD_CAPTION : WORLD_CAPTION);
}

function setStatus(s) {
  if (!st) return;
  if (/dancing to Cory's song/.test(String(s))) {
    st.textContent = withWorldCaption(s);
    st.title = withWorldCaption(s);
    return;
  }
  const parts = String(s).split(' · ');
  const last = parts[parts.length - 1];
  const phase = ['listen', 'think', 'reply', 'error'].includes(last) ? last : '';
  st.textContent = withWorldCaption("moves chosen from Zeref's recorded state · SIMULATED motion" + (phase ? ' · ' + phase : ''));
  st.title = s;
}

async function start() {
  if (started) return;
  started = true;
  const c = canRun3D();
  if (!c.ok) {
    st.textContent = withWorldCaption('2D portrait (' + c.why + ') · his canonical Moonwraith art');
    try {
      const { loadLive } = await import('./motion.mjs');
      const { live } = await loadLive();
      const expr = mapExpression(live || {});
      applyExpressionCSS(el, expr);
      ensureExpressionLegend(el.parentElement || el, expr);
    } catch { /* leave the portrait untinted if the live card cannot be read */ }
    return;
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    const { mount } = await import('./moonwraith3d.mjs');
    view = await mount(el, { onStatus: setStatus, reducedMotion: reduced });
    el.querySelector('.portrait')?.remove();
    el.querySelector('.mw-world')?.setAttribute('hidden', '');
    if (reduced) st.textContent = withWorldCaption((view.plan && view.plan.caption ? view.plan.caption + ' · ' : '') + 'still pose (reduced motion is on)');
  } catch (err) {
    st.textContent = withWorldCaption('2D portrait (3D could not start) · his canonical Moonwraith art');
    try {
      const { loadLive } = await import('./motion.mjs');
      const { live } = await loadLive();
      const expr = mapExpression(live || {});
      applyExpressionCSS(el, expr);
      ensureExpressionLegend(el.parentElement || el, expr);
    } catch { /* leave the portrait untinted if the live card cannot be read */ }
  }
}

window.addEventListener('zeref-chat', (e) => {
  const phase = e && e.detail && e.detail.phase;
  if (view && phase) view.setPhase(phase);
});

new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) start(); }).observe(el);

// 2D fallback: still pulse the portrait from the live bands while the song plays.
(function loop2d() {
  requestAnimationFrame(loop2d);
  if (view) return;
  const sig = tickDance();
  applyDanceCSS(el, sig);
  if (sig && sig.active && st && !/thinking|reply|listen/.test(st.textContent || '')) {
    st.textContent = withWorldCaption(DANCE_CAPTION);
    st.title = withWorldCaption(DANCE_CAPTION);
  }
})();
