// Replay test for Zeref's in-browser brain: every published build x every graph-optimization setting,
// 9 saved prompts, token for token against the torch ground truth (parity-reference.json).
// Measure-only: it never changes which build or setting the chat page uses.
import { ort, readManifest, modelBytes, verifiedTokenizer } from './brain.mjs';
import { reply } from './core.mjs';

const SETTINGS = ['disabled', 'basic', 'all']; // numThreads stays 1: GitHub Pages cannot send cross-origin isolation headers
const $ = (id) => document.getElementById(id);

async function builds() {
  const out = [{ name: 'fp32', man: await readManifest('manifest.json') }];
  try { out.push({ name: 'fp16', man: await readManifest('manifest.fp16.json') }); }
  catch { out.push({ name: 'fp16', man: null }); } // not published on this site yet
  return out;
}

function row(cells, cls) {
  const tr = document.createElement('tr');
  for (const c of cells) { const td = document.createElement('td'); td.textContent = c; tr.append(td); }
  if (cls) tr.children[2].className = cls;
  $('rows').append(tr);
}

export async function runReplay(onPhase = () => {}) {
  const ref = await (await fetch(new URL('parity-reference.json', import.meta.url), { cache: 'no-cache' })).json();
  const result = { schema: 'zeref-browser-replay-v1', userAgent: navigator.userAgent, ort: ort.env.versions, runs: [] };
  for (const b of await builds()) {
    if (!b.man) { result.runs.push({ build: b.name, published: false }); continue; }
    onPhase(b.name + ': downloading + sha256 check');
    const { buf } = await modelBytes(b.man, (p) => onPhase(b.name + ': ' + p.phase), { useCache: false });
    const tok = await verifiedTokenizer(b.man);
    if (ref.checkpoint_sha256 !== b.man.provenance.checkpoint_sha256) throw new Error(b.name + ' build is not the reference checkpoint');
    for (const setting of SETTINGS) {
      onPhase(b.name + ' / ' + setting + ': starting session');
      const session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: setting });
      let ok = 0, pieces = 0, ms = 0; const diffs = [];
      for (const g of ref.greedy) {
        onPhase(b.name + ' / ' + setting + ': ' + JSON.stringify(g.text.slice(0, 32)));
        const t0 = performance.now();
        const r = await reply(ort, session, b.man.dims, tok, g.history, g.text);
        ms += performance.now() - t0; pieces += r.tokenIds.length;
        const same = JSON.stringify(r.tokenIds) === JSON.stringify(g.torch_ids) && JSON.stringify(r.promptIds) === JSON.stringify(g.prompt_ids);
        if (same) ok++;
        else diffs.push({ text: g.text.slice(0, 40), at: r.tokenIds.findIndex((t, i) => t !== g.torch_ids[i]), got: r.text, want: g.reply });
      }
      await session.release();
      result.runs.push({ build: b.name, published: true, onnx_sha256: b.man.onnx.sha256, bytes: b.man.onnx.bytes,
        setting, match: ok + '/' + ref.greedy.length, ms_per_piece: +(ms / Math.max(1, pieces)).toFixed(1), diffs });
    }
  }
  return result;
}

$('go').addEventListener('click', async () => {
  $('go').disabled = true; $('rows').textContent = ''; $('result').textContent = '';
  try {
    const res = await runReplay((t) => { $('phase').textContent = t + '…'; });
    for (const r of res.runs) {
      if (!r.published) { row([r.build, '—', 'not published on this site', '—', '—']); continue; }
      const full = r.match.split('/')[0] === r.match.split('/')[1];
      row([r.build + ' (' + (r.bytes / 1e6).toFixed(1) + ' MB)', 'wasm · opt ' + r.setting + ' · 1 thread', r.match, String(r.ms_per_piece),
        r.diffs.length ? r.diffs[0].text + ' @ piece ' + r.diffs[0].at : '—'], full ? 'ok' : 'bad');
    }
    $('phase').textContent = 'done';
    $('result').textContent = JSON.stringify(res, null, 1);
    window.__zerefReplay = res;
  } catch (err) {
    $('phase').textContent = 'stopped: ' + (err && err.message ? err.message : 'error') + ' (nothing was made up)';
    window.__zerefReplay = { error: String(err && err.message) };
  } finally { $('go').disabled = false; }
});
