// Quantum-record dice for Zeref's replies, full loop (v2). JS port of The-beast-box-
// beastbox/qrec_sampler.py (the two must agree).
// Cory, 2026-11-21 7:00 PM CT: these dice are the DEFAULT in the browser chat; ?greedy=1 (or the toggle) gives
// the old deterministic reply. Cory, 2026-11-23 11:06 PM CT: run the full loop, the dice draws from the
// WHOLE archive, not just two jobs.
// The dice come only from RECORDED shot records already public in phera-ra/QC67_cosmo
// (rev b414724c, data/quantum_measurements_public.jsonl): one parity bit per recorded shot,
// shuffled by a fixed modular permutation into quantum-dice-table.bin. No live quantum,
// no unseeded randomness, no clock: every reply carries a receipt that replays it exactly. It changes how a word piece is
// chosen from his own logits; it never changes his brain. Cory's HF card measured the sampling seed as null for
// accuracy: the record buys provenance and variety, not intelligence.

export const RECORD_FILE = 'quantum-record.json';
export const RECORD_SHA256 = 'b726ffa782fea022d49b9b7cfb00e1660db7da9921542572d578e9a2305fb32a';
export const SCHEMA = 'zeref-quantum-record-v2';
export const TABLE_FILE = 'quantum-dice-table.bin';
export const TABLE_SHA256 = 'fdd6ad7f41578b9654adc168d4982a3b7f787d355543915e3bac7bc317f910d5';
export const TABLE_BITS = 11354112;

const utf8 = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(text) { return hex(await crypto.subtle.digest('SHA-256', utf8.encode(text))); }
export async function sha256HexBytes(buf) { return hex(await crypto.subtle.digest('SHA-256', buf)); }

export async function recordSeed(heartSeedSha256, tableSha256) { return sha256Hex([SCHEMA, heartSeedSha256, tableSha256].join('|')); }
export async function turnSeed(recSeed, roll, promptIds) {
  if (!Number.isInteger(roll) || roll < 0) throw new Error('roll must be a non-negative integer');
  return sha256Hex('zeref-qrec-turn-v1|' + recSeed + '|' + roll + '|' + promptIds.join(','));
}

// One bit of the packed table (MSB-first packing). Every bit is one recorded shot's parity bit.
export function tableBit(table, pos) {
  if (!Number.isInteger(pos) || pos < 0 || pos >= TABLE_BITS) throw new Error('table position out of range');
  return (table[pos >> 3] >> (7 - (pos & 7))) & 1;
}

// The uniform for word piece k: 52 table bits at a hash-derived position, / 2^52.
// pos = int(sha256(turn_seed + '|' + k)[:13], 16) mod (TABLE_BITS - 52), so the same
// turn and k always read the same 52 recorded bits, and any turn replays exactly.
export async function uniform(table, seed, k) {
  if (table.length * 8 < TABLE_BITS) throw new Error('dice table is short');
  const pos = parseInt((await sha256Hex(seed + '|' + k)).slice(0, 13), 16) % (TABLE_BITS - 52);
  let u = 0;
  for (let i = 0; i < 52; i++) u = u * 2 + tableBit(table, pos + i);
  return { u: u / 2 ** 52, pos };
}

// logits: float32 values AFTER the server rules (repetition 1.15, no-repeat-3); -Infinity = banned.
export function pick(logits, u, temperature, topK) {
  if (!(u >= 0 && u < 1) || !(temperature > 0) || !(topK >= 1)) throw new Error('bad sampler arguments');
  const finite = [];
  for (let i = 0; i < logits.length; i++) if (Number.isFinite(logits[i])) finite.push(i);
  if (!finite.length) throw new Error('every word piece is banned');
  const kept = finite.sort((a, b) => (logits[b] - logits[a]) || (a - b)).slice(0, topK).sort((a, b) => a - b);
  let m = -Infinity; for (const i of kept) if (logits[i] > m) m = logits[i];
  const w = kept.map((i) => Math.exp((logits[i] - m) / temperature));
  let total = 0; for (const x of w) total += x;
  const target = u * total;
  let run = 0;
  for (let j = 0; j < kept.length; j++) { run += w[j]; if (run > target) return kept[j]; }
  return kept[kept.length - 1];
}

export async function loadRecord(base) {
  const r = await fetch(new URL(RECORD_FILE, base), { cache: 'no-cache' });
  if (!r.ok) throw new Error('quantum record HTTP ' + r.status);
  const text = await r.text();
  if ((await sha256Hex(text)) !== RECORD_SHA256) throw new Error('quantum record failed its sha256 check');
  const rec = JSON.parse(text);
  const seed = await recordSeed(rec.heart_seed.sha256, rec.table.sha256);
  if (rec.schema !== SCHEMA || seed !== rec.record_seed_sha256) throw new Error('quantum record seed does not recompute');
  if (rec.table.bits !== TABLE_BITS || rec.table.bytes * 8 !== TABLE_BITS) throw new Error('quantum record table size mismatch');
  if (rec.shots_by_class.total_in_table !== TABLE_BITS) throw new Error('quantum record shot count mismatch');
  if (rec.shots_by_class.other !== 0) throw new Error('quantum record has an uncounted class');
  const t = await fetch(new URL(TABLE_FILE, base), { cache: 'no-cache' });
  if (!t.ok) throw new Error('dice table HTTP ' + t.status);
  const buf = new Uint8Array(await t.arrayBuffer());
  if (buf.byteLength !== rec.table.bytes || (await sha256HexBytes(buf)) !== rec.table.sha256) throw new Error('dice table failed its sha256 check');
  rec.tableBytes = buf;
  return rec;
}

export function modeLabel(rec) {
  const s = rec.sampler, c = rec.shots_by_class;
  return 'sampled with quantum-record dice (RECORDED archive ' + rec.archive.repo + '@' + rec.archive.rev.slice(0, 8) + ': ' +
    c.total_in_table.toLocaleString('en-US') + ' shots: ' +
    c.measured_ibm_hardware.toLocaleString('en-US') + ' IBM hardware + ' +
    c.legacy_unlabelled.toLocaleString('en-US') + ' legacy unlabelled, ' + c.other + ' other; not live quantum) · temperature ' +
    s.temperature + ', top-k ' + s.top_k;
}

// Returns {makePick} for core.reply: makePick(promptIds) -> {pick(lg, k), receipt}.
export function dice(rec, roll) {
  return {
    async makePick(promptIds) {
      const seed = await turnSeed(rec.record_seed_sha256, roll, promptIds);
      const receipt = { mode: 'quantum record', label: 'quantum record (RECORDED archive ' + rec.archive.repo + '@' + rec.archive.rev.slice(0, 8) + ': ' + rec.shots_by_class.total_in_table.toLocaleString('en-US') + ' shots)',
        archive_rev: rec.archive.rev, table_sha256: rec.table.sha256,
        shots_by_class: { measured_ibm_hardware: rec.shots_by_class.measured_ibm_hardware, legacy_unlabelled: rec.shots_by_class.legacy_unlabelled, classical_simulator_excluded: rec.shots_by_class.classical_simulator_excluded, total_in_table: rec.shots_by_class.total_in_table, other: rec.shots_by_class.other },
        record_seed_sha256: rec.record_seed_sha256, turn_seed: seed, roll,
        prompt_ids_sha256: await sha256Hex(promptIds.join(',')), temperature: rec.sampler.temperature, top_k: rec.sampler.top_k, live_quantum: false };
      return { receipt, pick: async (lg, k) => pick(lg, (await uniform(rec.tableBytes, seed, k)).u, rec.sampler.temperature, rec.sampler.top_k) };
    },
  };
}
