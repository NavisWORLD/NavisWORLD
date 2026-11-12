import { mount, canRun3D } from './spark3d.mjs';
const el = document.getElementById('spark3d'), st = document.getElementById('spark-status');
const tog = document.getElementById('spark-toggle'), fol = document.getElementById('spark-follow'), load = document.getElementById('spark-load');
const say = (s) => { st.textContent = s; };
async function go() {
  load.hidden = true;
  try {
    const v = await mount(el, { onStatus: say });
    el.querySelector('.poster')?.remove();
    tog.onclick = () => v.toggle(); fol.onclick = () => v.follow();
  } catch (e) { say('3D view could not start here (' + (e && e.message ? e.message : 'error') + '); showing a still render.'); }
}
const c = canRun3D();
if (c.ok && !matchMedia('(prefers-reduced-motion: reduce)').matches) go();
else { say('Showing a still render (' + (c.ok ? 'reduced motion is on' : c.why) + ').'); load.hidden = false; load.onclick = go; }
