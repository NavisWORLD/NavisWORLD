// The 3D robot panel on the chat page: loads only when the panel is open and on screen,
// and only on devices that can run it; otherwise the still render stays.
import { canRun3D } from './spark3d.mjs';
const box = document.getElementById('spark'), el = document.getElementById('spark3d'), st = document.getElementById('spark-status');
let started = false;
async function start() {
  if (started || !box.open) return;
  started = true;
  const c = canRun3D();
  if (!c.ok) { st.textContent = 'still render (' + c.why + ')'; return; }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { st.textContent = 'still render (reduced motion is on)'; return; }
  try {
    const { mount } = await import('./spark3d.mjs');
    await mount(el, { onStatus: (s) => { st.textContent = s; }, shadows: true });
    el.querySelector('.poster')?.remove();
  } catch (e) { st.textContent = 'still render (3D could not start)'; }
}
new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) start(); }).observe(el);
box.addEventListener('toggle', start);
