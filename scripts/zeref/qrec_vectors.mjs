// Writes / checks the shared quantum-record dice vectors (scripts/zeref/qrec-vectors.json).
// The same file is checked by The-beast-box- tests/test_qrec_sampler.py against the Python twin.
//   node scripts/zeref/qrec_vectors.mjs          -> check (exit 1 on any difference)
//   node scripts/zeref/qrec_vectors.mjs --write  -> regenerate
import fs from 'fs';
import { sha256Hex, turnSeed, uniform, pick, recordSeed } from '../../docs/zeref-brain/qrec.mjs';

const rec = JSON.parse(fs.readFileSync(new URL('../../docs/zeref-brain/quantum-record.json', import.meta.url), 'utf8'));
const OUT = new URL('./qrec-vectors.json', import.meta.url);
const cases = [];
for (let c = 0; c < 12; c++) {
  const h = await sha256Hex('qrec-vector-logits|' + c);
  const logits = [];
  for (let j = 0; j < 200; j++) {
    const x = parseInt((await sha256Hex(h + '|' + j)).slice(0, 8), 16) / 2 ** 32;
    logits.push(c === 3 && j % 7 === 0 ? -Infinity : Math.fround((c === 5 ? Math.round(x * 4) : x * 20) - 10)); // case 5: many ties
  }
  const promptIds = [1, 100 + c, 200 + c, 7];
  const roll = c % 4, T = c === 7 ? 1.3 : 0.75, K = c === 9 ? 5 : 40;
  const seed = await turnSeed(rec.record_seed_sha256, roll, promptIds);
  const picks = [];
  for (let k = 0; k < 8; k++) { const u = await uniform(seed, k); picks.push({ k, u, pick: pick(logits, u, T, K) }); }
  cases.push({ roll, prompt_ids: promptIds, temperature: T, top_k: K, turn_seed: seed,
    logits: logits.map((v) => (Number.isFinite(v) ? v : null)), picks });
}
const doc = { schema: 'zeref-qrec-vectors-v1', record_seed_sha256: rec.record_seed_sha256,
  record_seed_recomputed: await recordSeed(rec.heart_seed.sha256, rec.sources.map((s) => s.outcomes_sha256)), cases };
if (process.argv.includes('--write')) { fs.writeFileSync(OUT, JSON.stringify(doc) + '\n'); console.log('wrote', cases.length, 'cases'); }
else {
  const want = fs.readFileSync(OUT, 'utf8').trim();
  const same = want === JSON.stringify(doc);
  console.log(same ? 'ok qrec vectors ' + cases.length * 8 + ' picks' : 'DIFF qrec vectors');
  process.exit(same ? 0 : 1);
}
