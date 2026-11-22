// Quantum-record dice for Zeref's replies. JS port of The-beast-box- beastbox/qrec_sampler.py (the two must agree).
// Cory, 2026-11-21 7:00 PM CT: these dice are the DEFAULT in the browser chat; ?greedy=1 (or the toggle) gives
// the old deterministic reply.
// The dice come only from sha256 over RECORDED IBM hardware shot records already public in The-beast-box-
// (quantum-record.json: heart seed v15 / ibm_marrakesh CHSH run + the ibm_fez spark seed). No live quantum,
// no unseeded randomness, no clock: every reply carries a receipt that replays it exactly. It changes how a word piece is
// chosen from his own logits; it never changes his brain. Cory's HF card measured the sampling seed as null for
// accuracy: the record buys provenance and variety, not intelligence.

export const RECORD_FILE = 'quantum-record.json';
export const RECORD_SHA256 = '43d39a4eda3e25784157b9c4d0c7ab4110ca29c0809cb513c2324299a6469709';
export const SCHEMA = 'zeref-quantum-record-v1';

const utf8 = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(text) { return hex(await crypto.subtle.digest('SHA-256', utf8.encode(text))); }

export async function recordSeed(heartSeedSha256, outcomes) { return sha256Hex([SCHEMA, heartSeedSha256, ...outcomes].join('|')); }
export async function turnSeed(recSeed, roll, promptIds) {
  if (!Number.isInteger(roll) || roll < 0) throw new Error('roll must be a non-negative integer');
  return sha256Hex('zeref-qrec-turn-v1|' + recSeed + '|' + roll + '|' + promptIds.join(','));
}
export async function uniform(seed, k) { return parseInt((await sha256Hex(seed + '|' + k)).slice(0, 13), 16) / 2 ** 52; }

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
  const seed = await recordSeed(rec.heart_seed.sha256, rec.sources.map((s) => s.outcomes_sha256));
  if (rec.schema !== SCHEMA || seed !== rec.record_seed_sha256) throw new Error('quantum record seed does not recompute');
  if (rec.sources.some((s) => s.source_class !== 'RECORDED_IBM_HARDWARE')) throw new Error('quantum record has a non-recorded source');
  return rec;
}

export function modeLabel(rec) {
  const s = rec.sampler, c = rec.shots_by_class;
  return 'sampled with quantum-record dice (RECORDED IBM ' + rec.sources.map((x) => x.backend).join(' + ') + ' shot records: ' +
    c.measured_ibm_hardware.toLocaleString('en-US') + ' measured IBM rounds, ' + c.other + ' other; not live quantum) · temperature ' +
    s.temperature + ', top-k ' + s.top_k;
}

// Returns {makePick} for core.reply: makePick(promptIds) -> {pick(lg, k), receipt}.
export function dice(rec, roll) {
  return {
    async makePick(promptIds) {
      const seed = await turnSeed(rec.record_seed_sha256, roll, promptIds);
      const receipt = { mode: 'quantum record', label: 'quantum record (RECORDED IBM ' + rec.sources.map((x) => x.backend + ' ' + x.job_id).join(' + ') + ')',
        shots_by_class: { measured_ibm_hardware: rec.shots_by_class.measured_ibm_hardware, other: rec.shots_by_class.other },
        record_seed_sha256: rec.record_seed_sha256, turn_seed: seed, roll,
        prompt_ids_sha256: await sha256Hex(promptIds.join(',')), temperature: rec.sampler.temperature, top_k: rec.sampler.top_k, live_quantum: false };
      return { receipt, pick: async (lg, k) => pick(lg, await uniform(seed, k), rec.sampler.temperature, rec.sampler.top_k) };
    },
  };
}
