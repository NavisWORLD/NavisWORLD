// The 3D Moonwraith on the chat page: loads only when the stage is on screen
// and the device can run it; otherwise the canonical 2D portrait stays.
import { canRun3D } from './moonwraith3d.mjs';

const el = document.getElementById('moonwraith');
const st = document.getElementById('mw-status');
if (!el) throw new Error('moonwraith stage missing');

let started = false;
let view = null;

async function start() {
  if (started) return;
  started = true;
  const c = canRun3D();
  if (!c.ok) {
    st.textContent = '2D portrait (' + c.why + ') · his canonical Moonwraith art';
    return;
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    const { mount } = await import('./moonwraith3d.mjs');
    view = await mount(el, { onStatus: (s) => {
      const parts = String(s).split(' · ');
      const last = parts[parts.length - 1];
      const phase = ['listen', 'think', 'reply', 'error'].includes(last) ? last : '';
      st.textContent = "moves chosen from Zeref's recorded state · SIMULATED motion" + (phase ? ' · ' + phase : '');
      st.title = s;
    }, reducedMotion: reduced });
    el.querySelector('.portrait')?.remove();
    if (reduced) st.textContent = (view.plan && view.plan.caption ? view.plan.caption + ' · ' : '') + 'still pose (reduced motion is on)';
  } catch (err) {
    st.textContent = '2D portrait (3D could not start) · his canonical Moonwraith art';
  }
}

window.addEventListener('zeref-chat', (e) => {
  const phase = e && e.detail && e.detail.phase;
  if (view && phase) view.setPhase(phase);
});

new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) start(); }).observe(el);
