// Unit + stub-session tests for the page mouth's first-token guard (core.mjs).
// No ONNX model is needed: generate() takes its session as a parameter, so the
// tests drive it with canned logits and the real quantum-record pick.
//   node --test docs/zeref-brain/core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyRules, argmax, firstTokenGuard, generate, PAD_ID } from './core.mjs';
import { pick as qrecPick } from './qrec.mjs';
import { ZerefTokenizer } from './tokenizer.mjs';

const tok = new ZerefTokenizer(fs.readFileSync(new URL('./tokenizer.json', import.meta.url), 'utf8'));
// eos_id 2, bos_id 1, vocab 4096 in the live manifest; the stub only needs the ids the tests use.
const DIMS = { n_layers: 1, n_heads: 1, head_dim: 1, state_width: 1, hebbian_dim: 1, eos_id: 2, max_seq_len: 2048 };
const WORD = 5; // a regular word-piece id in the live tokenizer (not a special token)
const fakeOrt = { Tensor: class { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } dispose() {} } };
function stubSession(logitsQueue) {
  let calls = 0;
  const t = () => ({ dispose() {} });
  return {
    run: async () => {
      const data = logitsQueue[Math.min(calls, logitsQueue.length - 1)];
      calls++;
      return { nk: t(), nv: t(), ns: t(), nfast: t(), logits: { data } };
    },
  };
}
// Step-0 logits where EOS is the most likely token and WORD is the top word piece.
// After the first pick the model wants to stop, so generation ends at step 1.
function eosFirstLogits() {
  return [
    new Float32Array([-1, 0, 10, 0, 1, 5, 0, 0]),
    new Float32Array([-1, 0, 10, 0, 1, 1, 0, 0]),
  ];
}

test('firstTokenGuard masks EOS and PAD at step 0 when a word piece is available', () => {
  const lg = new Float32Array([-1, 0, 10, 0, 1, 5, 0, 0]);
  const out = firstTokenGuard(lg, 2);
  assert.equal(out[2], -Infinity);
  assert.equal(out[PAD_ID], -Infinity);
  assert.equal(out[WORD], 5); // every other logit is untouched
  assert.equal(out[4], 1);
});

test('firstTokenGuard changes nothing when no word piece has a finite logit', () => {
  const lg = new Float32Array([-Infinity, -Infinity, 5, -Infinity, -Infinity, -Infinity, -Infinity, -Infinity]);
  const before = Float32Array.from(lg);
  firstTokenGuard(lg, 2);
  assert.deepEqual(Array.from(lg), Array.from(before)); // EOS stays pickable: nothing is invented
});

test('applyRules turns NaN logits into banned (-Infinity), never into a pick', () => {
  const lg = applyRules(new Float32Array([NaN, 1, 2, 3, 4, 5, 6, 7]), []);
  assert.equal(lg[0], -Infinity);
  assert.equal(argmax(lg), 7); // NaN at index 0 no longer poisons argmax into returning token 0
});

test('greedy: step-0 EOS above the top word token still emits the word token', async () => {
  const gen = await generate(fakeOrt, stubSession(eosFirstLogits()), DIMS, [1, 100, 200], { maxNewTokens: 4 });
  assert.deepEqual(gen, [WORD, 2]); // word first, EOS still allowed at step 1: he stops when he wants to
  assert.notEqual(tok.decode(gen).trim(), '');
});

test('quantum-record dice: step-0 EOS above the top word token still emits the word token', async () => {
  // u = 0.5 lands on EOS without the guard (EOS weight dominates at T 0.75, top-k 40).
  const pick = (lg) => qrecPick(lg, 0.5, 0.75, 40);
  const gen = await generate(fakeOrt, stubSession(eosFirstLogits()), DIMS, [1, 100, 200], { maxNewTokens: 4, pick });
  assert.deepEqual(gen, [WORD, 2]);
  assert.notEqual(tok.decode(gen).trim(), '');
});

test('greedy: NaN at index 0 cannot surface PAD as the first token', async () => {
  const queue = [
    new Float32Array([NaN, 0, 10, 0, 1, 5, 0, 0]),
    new Float32Array([-1, 0, 10, 0, 1, 1, 0, 0]),
  ];
  const gen = await generate(fakeOrt, stubSession(queue), DIMS, [1, 100, 200], { maxNewTokens: 4 });
  assert.deepEqual(gen, [WORD, 2]);
});

test('honesty: when no word piece is available the reply stays empty, nothing is invented', async () => {
  // Only EOS has a finite logit: the guard must not invent a token for him.
  const queue = [new Float32Array([-Infinity, -Infinity, 5, -Infinity, -Infinity, -Infinity, -Infinity, -Infinity])];
  const gen = await generate(fakeOrt, stubSession(queue), DIMS, [1, 100, 200], { maxNewTokens: 4 });
  assert.deepEqual(gen, [2]); // exactly the EOS he produced, nothing substituted
  assert.equal(tok.decode(gen), ''); // decodes to no words, as the page reports it
  assert.equal(tok.decode(gen).trim(), ''); // the chat.js empty-reply notice still fires on this
});

test('honesty: the dice pick with no finite logits fails loudly instead of inventing words', () => {
  assert.throws(() => qrecPick(new Float32Array(8).fill(-Infinity), 0.5, 0.75, 40), /every word piece is banned/);
});
