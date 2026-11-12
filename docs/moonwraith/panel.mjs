// The 3D Moonwraith on the chat page: loads only when the stage is on screen
// and the device can run it; otherwise the canonical 2D portrait stays.
// The play-button tap is forwarded here synchronously so iPhone Safari will
// resume the AudioContext that drives his dance.
import { canRun3D } from './moonwraith3d.mjs';
import { attachDance, tickDance, applyDanceCSS, DANCE_CAPTION } from './dance.mjs';
import { ensureSignalReadout } from './particles.mjs';
import { mapExpression, applyExpressionCSS, ensureExpressionLegend } from './expression.mjs';

const el = document.getElementById('moonwraith');
const st = document.getElementById('mw-status');
if (!el) throw new Error('moonwraith stage missing');
ensureSignalReadout(el);

let started = false;
let view = null;

window.addEventListener('zeref-song-tap', (e) => {
  const audio = e && e.detail && e.detail.audio;
  if (audio) attachDance(audio);
});

function setStatus(s) {
  if (!st) return;
  if (/dancing to Cory's song/.test(String(s))) {
    st.textContent = s;
    st.title = s;
    return;
  }
  const parts = String(s).split(' · ');
  const last = parts[parts.length - 1];
  const phase = ['listen', 'think', 'reply', 'error'].includes(last) ? last : '';
  st.textContent = "moves chosen from Zeref's recorded state · SIMULATED motion" + (phase ? ' · ' + phase : '');
  st.title = s;
}

async function start() {
  if (started) return;
  started = true;
  const c = canRun3D();
  if (!c.ok) {
    st.textContent = '2D portrait (' + c.why + ') · his canonical Moonwraith art';
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
    if (reduced) st.textContent = (view.plan && view.plan.caption ? view.plan.caption + ' · ' : '') + 'still pose (reduced motion is on)';
  } catch (err) {
    st.textContent = '2D portrait (3D could not start) · his canonical Moonwraith art';
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
    st.textContent = DANCE_CAPTION;
    st.title = DANCE_CAPTION;
  }
})();
