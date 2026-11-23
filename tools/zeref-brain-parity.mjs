// Parity check for Zeref's in-browser brain (docs/zeref-brain) against the Python ground truth
// written by The-beast-box-/scripts/zeref_onnx_export.py (docs/zeref-brain/parity-reference.json).
//   npm i --no-save onnxruntime-web@1.31.1 && node tools/zeref-brain-parity.mjs
// Checks: chunk + whole-file sha256 vs manifest; JS tokenizer ids/decoding vs Python on every case;
// full pipeline (message assembly -> prompt ids -> greedy token ids -> text) vs the torch Engine,
// using ONNX Runtime Web's WASM backend with the same session options as the page.
// Verdict: a case whose assembly did not change must match the reference exactly; a case whose
// assembly changed under the token-budgeted window passes when its prompt fits the window and the
// reply is non-empty (the reference was generated from the old 6-message / 1900-byte assembly).
import * as ort from 'onnxruntime-web';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { ZerefTokenizer } from '../docs/zeref-brain/tokenizer.mjs';
import { reply, MAX_NEW_TOKENS } from '../docs/zeref-brain/core.mjs';

const D = fileURLToPath(new URL('../docs/zeref-brain/', import.meta.url));
const man = JSON.parse(fs.readFileSync(D + 'manifest.json', 'utf8'));
const ref = JSON.parse(fs.readFileSync(D + 'parity-reference.json', 'utf8'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
let fail = 0;
const parts = man.onnx.chunks.map((c) => { const b = fs.readFileSync(D + c.file); if (b.length !== c.bytes || sha(b) !== c.sha256) { fail++; console.log('chunk sha FAIL', c.file); } return b; });
const buf = Buffer.concat(parts);
const fileOk = buf.length === man.onnx.bytes && sha(buf) === man.onnx.sha256; fail += !fileOk;
const tokJson = fs.readFileSync(D + man.tokenizer.file); const tokOk = sha(tokJson) === man.tokenizer.sha256; fail += !tokOk;
console.log(`onnx sha256 ${fileOk ? 'OK' : 'FAIL'} (${man.onnx.sha256.slice(0, 12)}), tokenizer sha256 ${tokOk ? 'OK' : 'FAIL'}, chunks ${parts.length}`);

const tok = new ZerefTokenizer(tokJson.toString('utf8'));
let tOk = 0;
for (const c of ref.tokenizer) {
  const same = JSON.stringify(tok.encode(c.text)) === JSON.stringify(c.ids) && tok.decode(c.ids) === c.decoded;
  tOk += same; if (!same) console.log('tokenizer DIFF', JSON.stringify(c.text));
}
console.log(`tokenizer parity ${tOk}/${ref.tokenizer.length}`); fail += ref.tokenizer.length - tOk;

ort.env.wasm.numThreads = man.browser_session_options.numThreads;
const t0 = performance.now();
const session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: man.browser_session_options.graphOptimizationLevel });
console.log(`session create ${Math.round(performance.now() - t0)} ms`);
let gOk = 0;
const cases = [];
for (let i = 0; i < ref.greedy.length; i++) {
  const g = ref.greedy[i];
  const t1 = performance.now();
  const r = await reply(ort, session, man.dims, tok, g.history, g.text);
  const assemblyChanged = JSON.stringify(r.messages) !== JSON.stringify(g.messages);
  const same = !assemblyChanged && JSON.stringify(r.promptIds) === JSON.stringify(g.prompt_ids)
    && JSON.stringify(r.tokenIds) === JSON.stringify(g.torch_ids) && r.text === g.reply;
  gOk += same;
  cases.push({ i, assembly_changed: assemblyChanged, match: same, prompt_tokens: r.promptIds.length, reply: r.text });
  console.log(`${same ? 'OK  ' : assemblyChanged ? 'CHANGED' : 'DIFF'} ${JSON.stringify(g.text.slice(0, 48))} -> ${JSON.stringify(r.text)} (${Math.round(performance.now() - t1)} ms)`);
}
console.log(`greedy full-pipeline parity ${gOk}/${ref.greedy.length} (pin step ${man.provenance.training_steps}, checkpoint ${man.provenance.checkpoint_sha256.slice(0, 12)})`);
console.log('SUMMARY ' + JSON.stringify({ tokenizer: tOk + '/' + ref.tokenizer.length, greedy: cases }));
// Verdict. The reference was generated from the server's old 6-message / 1900-byte assembly, so
// a case whose assembly changed under the new token-budgeted window cannot match the old
// reference and is not a regression. It passes when its prompt fits the window (prompt tokens
// plus the reply budget stay inside max_seq_len) and the reply is non-empty. A case whose
// assembly did not change must still match the reference exactly, token for token.
for (const c of cases) {
  if (!c.assembly_changed) { if (!c.match) fail++; }
  else if (c.prompt_tokens + MAX_NEW_TOKENS > man.dims.max_seq_len || !c.reply.trim()) fail++;
}
process.exit(fail ? 1 : 0);
