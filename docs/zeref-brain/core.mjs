// Zeref's mouth, run on this device. Shared by the page (brain.mjs) and the parity tool.
// Ports, line for line, of The-beast-box-:
//   beastbox/guest_hebbian.py assemble_messages({}, history, text)  (no context fields: no senses)
//   models/rawrphos/inference/server.py chat prompt  ("role: content" lines + "\nassistant:", BOS)
//   models/rawrphos/architecture/generation.py (prefill the whole prompt, then one token per call), greedy (temperature 0 = argmax), with the
//   server's repetition_penalty 1.15 over generated ids and no_repeat_ngram 3, EOS stop, 64 max.
// No randomness anywhere: the same thread always gets the same reply from the same checkpoint.

export const SERVED_REPLAY_MESSAGES = 6;
export const MAX_ASSEMBLED_BYTES = 1900;
export const MAX_NEW_TOKENS = 64;
export const REPETITION_PENALTY = Math.fround(1.15); // float32, as torch applies it to float32 logits
export const NO_REPEAT_NGRAM = 3;

const utf8 = new TextEncoder();
export function formatPrompt(messages) {
  return messages.map((m) => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';
}
const formattedBytes = (messages) => utf8.encode(formatPrompt(messages)).length;

export function assembleMessages(history, text) {
  let hist = history.slice(-SERVED_REPLAY_MESSAGES);
  while (hist.length && hist[0].role !== 'user') hist = hist.slice(1);
  const build = () => [...hist.slice(-SERVED_REPLAY_MESSAGES), { role: 'user', content: text }];
  let msgs = build();
  while (formattedBytes(msgs) > MAX_ASSEMBLED_BYTES && hist.length) {
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
export async function generate(ort, session, dims, promptIds, { maxNewTokens = MAX_NEW_TOKENS, onToken } = {}) {
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
    const t = argmax(applyRules(logits, gen));
    gen.push(t);
    if (onToken) onToken(t, gen);
    if (t === eos_id) break;
    await step([t]);
  }
  return gen;
}

// One turn: history is [{role:'user'|'assistant', content}], text is the visitor's words.
export async function reply(ort, session, dims, tokenizer, history, text, opts = {}) {
  const messages = assembleMessages(history, text);
  const promptIds = tokenizer.encode(formatPrompt(messages), true);
  const gen = await generate(ort, session, dims, promptIds, opts);
  return { text: tokenizer.decode(gen), messages, promptIds, tokenIds: gen };
}
