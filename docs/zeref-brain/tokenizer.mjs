// Byte-level BPE tokenizer for Zeref's mouth: a JS port of the checkpoint's own tokenizer.json
// (HuggingFace `tokenizers`, ByteLevel pre-tokenizer with the GPT-2 regex, no normalizer,
// 4 special tokens). Verified against Python token ids by tools/zeref-brain-parity.mjs.
const GPT2_SPLIT = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

function bytesToUnicode() {
  const bs = [];
  for (let i = 33; i <= 126; i++) bs.push(i);
  for (let i = 161; i <= 172; i++) bs.push(i);
  for (let i = 174; i <= 255; i++) bs.push(i);
  const cs = bs.slice(); let n = 0;
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n); n++; }
  const enc = new Array(256), dec = new Map();
  bs.forEach((b, i) => { enc[b] = String.fromCodePoint(cs[i]); dec.set(String.fromCodePoint(cs[i]), b); });
  return { enc, dec };
}

export class ZerefTokenizer {
  constructor(json) {
    const t = typeof json === 'string' ? JSON.parse(json) : json;
    if (!t.model || t.model.type !== 'BPE') throw new Error('expected a BPE tokenizer');
    if (t.normalizer) throw new Error('unexpected normalizer');
    const pre = t.pre_tokenizer || {};
    if (pre.type !== 'ByteLevel' || pre.add_prefix_space || pre.use_regex === false) throw new Error('unexpected pre-tokenizer');
    this.vocab = t.model.vocab;
    this.idToToken = [];
    for (const [k, v] of Object.entries(this.vocab)) this.idToToken[v] = k;
    this.ranks = new Map();
    t.model.merges.forEach((m, i) => { const [a, b] = Array.isArray(m) ? m : m.split(' '); this.ranks.set(a + '\u0000' + b, i); });
    this.added = (t.added_tokens || []).map((x) => ({ content: x.content, id: x.id, special: !!x.special }));
    this.specialIds = new Set(this.added.filter((x) => x.special).map((x) => x.id));
    this.unk = t.model.unk_token != null ? this.vocab[t.model.unk_token] : undefined;
    const { enc, dec } = bytesToUnicode(); this.byteEnc = enc; this.byteDec = dec;
    this.cache = new Map();
    this.bos_id = 1; this.eos_id = 2;
    this.utf8 = new TextEncoder();
  }

  bpe(word) {
    const hit = this.cache.get(word); if (hit) return hit;
    let parts = Array.from(word);
    while (parts.length > 1) {
      let best = -1, bestRank = Infinity;
      for (let i = 0; i < parts.length - 1; i++) {
        const r = this.ranks.get(parts[i] + '\u0000' + parts[i + 1]);
        if (r !== undefined && r < bestRank) { bestRank = r; best = i; }
      }
      if (best < 0) break;
      const a = parts[best], b = parts[best + 1], merged = [];
      for (let i = 0; i < parts.length; ) {
        if (i < parts.length - 1 && parts[i] === a && parts[i + 1] === b) { merged.push(a + b); i += 2; }
        else { merged.push(parts[i]); i += 1; }
      }
      parts = merged;
    }
    const ids = [];
    for (const p of parts) {
      const id = this.vocab[p];
      if (id !== undefined) ids.push(id);
      else for (const ch of Array.from(p)) { const c = this.vocab[ch]; ids.push(c !== undefined ? c : this.unk); }
    }
    if (this.cache.size < 50000) this.cache.set(word, ids);
    return ids;
  }

  encodeOrdinary(text) {
    const out = [];
    for (const m of text.matchAll(GPT2_SPLIT)) {
      let s = '';
      for (const b of this.utf8.encode(m[0])) s += this.byteEnc[b];
      if (s) out.push(...this.bpe(s));
    }
    return out;
  }

  // Same as RawrphosTokenizer.encode(text, add_bos): added/special tokens written in the text are
  // matched first (as the Python backend does), the rest is byte-level BPE.
  encode(text, addBos = false) {
    const ids = addBos ? [this.bos_id] : [];
    let rest = text;
    while (rest.length) {
      let at = -1, tok = null;
      for (const a of this.added) {
        const i = rest.indexOf(a.content);
        if (i >= 0 && (at < 0 || i < at || (i === at && a.content.length > tok.content.length))) { at = i; tok = a; }
      }
      if (at < 0) { ids.push(...this.encodeOrdinary(rest)); break; }
      if (at > 0) ids.push(...this.encodeOrdinary(rest.slice(0, at)));
      ids.push(tok.id);
      rest = rest.slice(at + tok.content.length);
    }
    return ids;
  }

  // Same as RawrphosTokenizer.decode(ids): special tokens skipped, bytes decoded as UTF-8 (lossy).
  decode(ids) {
    const bytes = [];
    for (const id of ids) {
      if (this.specialIds.has(id)) continue;
      const tok = this.idToToken[id];
      if (tok === undefined) throw new Error('invalid token id');
      for (const ch of Array.from(tok)) {
        const b = this.byteDec.get(ch);
        if (b === undefined) bytes.push(...this.utf8.encode(ch)); else bytes.push(b);
      }
    }
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }
}
