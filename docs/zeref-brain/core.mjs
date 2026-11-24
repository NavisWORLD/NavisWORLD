// Zeref's mouth, run on this device. Shared by the page (brain.mjs) and the parity tool.
// The prompt format and the generation loop are ports, line for line, of The-beast-box-:
//   beastbox/guest_hebbian.py assemble_messages({}, history, text)  (no context fields: no senses)
//   models/rawrphos/inference/server.py chat prompt  ("role: content" lines + "\nassistant:", BOS)
//   models/rawrphos/architecture/generation.py (prefill the whole prompt, then one token per call), greedy (temperature 0 = argmax), with the
//   server's repetition_penalty 1.15 over generated ids and no_repeat_ngram 3, EOS stop, 64 max.
// Choosing each word piece: greedy (argmax) unless a pick function is passed. The chat page passes the
// quantum-record dice (qrec.mjs, sha256 over RECORDED IBM shot records; default since Cory's 2026-11-21 7:00 PM CT
// decision). There is no unseeded randomness anywhere: with the same thread and the same receipt, a reply replays exactly.
//
// The history window is the one deliberate divergence from the server. The server caps the replay at
// 6 messages / 1900 bytes. This page counts the assembled prompt in TOKENS against the whole window
// (dims.max_seq_len minus room for the reply), so a real conversation stays in view until the brain
// genuinely runs out of room. Byte counts are a bad proxy for BPE tokens, so the trim is measured
// with the real tokenizer, never estimated. The manifest's decoding block still documents the old
// 6 / 1900 until the next export refresh re-documents the new window; the page never reads those
// values from the manifest.

export const MAX_NEW_TOKENS = 64;
export const REPETITION_PENALTY = Math.fround(1.15); // float32, as torch applies it to float32 logits
export const NO_REPEAT_NGRAM = 3;

export function formatPrompt(messages) {
  return messages.map((m) => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';
}

// The assembled prompt, oldest first, trimmed from the front until it fits the token budget.
// countTokens is (text) => tokenizer.encode(text, true).length, the exact count the reply will
// use; maxPromptTokens is dims.max_seq_len - MAX_NEW_TOKENS (1984 for this brain). The current
// turn is never trimmed: only earlier history goes, oldest first, and the window always starts
// on a user turn. A thread of short messages fits whole (a 40-turn thread of short messages is
// about 1125 tokens); only a thread of very long messages is trimmed, and it is trimmed to the
// most recent turns that fit.
export function assembleMessages(history, text, countTokens, maxPromptTokens) {
  let hist = history.slice();
  while (hist.length && hist[0].role !== 'user') hist = hist.slice(1);
  const build = () => [...hist, { role: 'user', content: text }];
  let msgs = build();
  while (msgs.length > 1 && countTokens(formatPrompt(msgs)) > maxPromptTokens) {
    hist = hist.slice(1);
    while (hist.length && hist[0].role !== 'user') hist = hist.slice(1);
    msgs = build();
  }
  return msgs;
}

export function applyRules(logits, gen) {
  const lg = Float32Array.from(logits);
  if (gen.length) {
    for (const t of new Set(gen)) { const v = lg[t]; lg[t] = v > 0 ? v / REPETITION_PENALTY : v * REPETITION_PENALTY; }
  }
  const n = NO_REPEAT_NGRAM;
  if (gen.length >= n) {
    const a = gen[gen.length - 2], b = gen[gen.length - 1];
    for (let i = 0; i + n - 1 < gen.length; i++) if (gen[i] === a && gen[i + 1] === b) lg[gen[i + 2]] = -Infinity;
  }
  return lg;
}

export function argmax(a) { let m = 0; for (let j = 1; j < a.length; j++) if (a[j] > a[m]) m = j; return m; }

// session: an onnxruntime InferenceSession of the step graph; dims: manifest.dims.
export async function generate(ort, session, dims, promptIds, { maxNewTokens = MAX_NEW_TOKENS, onPiece, pick = null } = {}) {
  const { n_layers: L, n_heads: H, head_dim: Dh, state_width: W, hebbian_dim: n, eos_id } = dims;
  if (promptIds.length + maxNewTokens > dims.max_seq_len) throw new Error('context limit exceeded');
  let pk = new ort.Tensor('float32', new Float32Array(0), [L, 1, H, 0, Dh]);
  let pv = new ort.Tensor('float32', new Float32Array(0), [L, 1, H, 0, Dh]);
  let ps = new ort.Tensor('float32', new Float32Array(0), [L, 1, 0, W]);
  let fast = new ort.Tensor('float32', new Float32Array(n * n), [1, n, n]);
  let logits = null;
  const step = async (ts) => {
    const o = await session.run({ ids: new ort.Tensor('int64', BigInt64Array.from(ts.map(BigInt)), [1, ts.length]), pk, pv, ps, fast });
    for (const old of [pk, pv, ps, fast]) if (old.dispose) try { old.dispose(); } catch { /* cpu tensor */ }
    pk = o.nk; pv = o.nv; ps = o.ns; fast = o.nfast; logits = o.logits.data;
  };
  await step(promptIds); // whole-prompt prefill in one call, as the server does
  const gen = [];
  for (let i = 0; i < maxNewTokens; i++) {
    const t = pick ? await pick(applyRules(logits, gen), i) : argmax(applyRules(logits, gen));
    gen.push(t);
    if (onPiece) onPiece(t, gen);
    if (t === eos_id) break;
    await step([t]);
  }
  return gen;
}

// One turn: history is [{role:'user'|'assistant', content}], text is the visitor's words.
export async function reply(ort, session, dims, tokenizer, history, text, opts = {}) {
  const maxPromptTokens = dims.max_seq_len - MAX_NEW_TOKENS;
  const messages = assembleMessages(history, text, (s) => tokenizer.encode(s, true).length, maxPromptTokens);
  const promptIds = tokenizer.encode(formatPrompt(messages), true);
  const dice = opts.makePick ? await opts.makePick(promptIds) : null; // null = greedy
  const gen = await generate(ort, session, dims, promptIds, { ...opts, pick: dice ? dice.pick : null });
  // dyn12 telemetry (REPORT-ONLY, 2026-11-23): the page brain has no condition54 input -- the
  // ONNX export ships ids/pk/pv/ps/fast only, so the 12D state is never fed here. The reply
  // records that drop honestly with the same schema the native server uses, nulls and all,
  // so a reader never mistakes "no telemetry" for "12D measured zero".
  return { text: tokenizer.decode(gen), messages, promptIds, tokenIds: gen, receipt: dice ? dice.receipt : { mode: 'greedy' },
    dyn12_telemetry: { schema: 'zeref-dyn12-telemetry-v1', condition54_sent: false, prefill: null, last: null } };
}
