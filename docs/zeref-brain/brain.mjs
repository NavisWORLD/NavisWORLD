// Loads Zeref's pinned brain into THIS browser and runs it here. No server, no other model.
// Files come only from this site (same origin). Each chunk and the rebuilt ONNX file are checked
// against the sha256 values in manifest.json before use; a mismatch stops everything (no fallback).
// The verified file is kept in Cache Storage, keyed by its sha256, so the next visit skips the download.
import * as ort from './ort/ort.wasm.min.mjs';
import { ZerefTokenizer } from './tokenizer.mjs';
import { reply } from './core.mjs';
import { loadRecord } from './qrec.mjs';

const BASE = new URL('./', import.meta.url);
const CACHE = 'zeref-brain-v1';

ort.env.wasm.wasmPaths = new URL('./ort/', import.meta.url).href;
ort.env.wasm.numThreads = 1; // GitHub Pages cannot send cross-origin isolation headers
ort.env.wasm.proxy = false;

async function sha256Hex(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function readManifest() {
  const r = await fetch(new URL('manifest.json', BASE), { cache: 'no-cache' });
  if (!r.ok) throw new Error('manifest HTTP ' + r.status);
  return r.json();
}

async function cachedModel(man) {
  if (!('caches' in self)) return null;
  try {
    const c = await caches.open(CACHE);
    const hit = await c.match(new URL('zeref-step.onnx?sha256=' + man.onnx.sha256, BASE).href);
    if (!hit) return null;
    const buf = new Uint8Array(await hit.arrayBuffer());
    if (buf.byteLength === man.onnx.bytes && (await sha256Hex(buf)) === man.onnx.sha256) return buf;
    await c.delete(hit.url || new URL('zeref-step.onnx?sha256=' + man.onnx.sha256, BASE).href);
  } catch { /* storage unavailable: download instead */ }
  return null;
}

async function storeModel(man, buf) {
  if (!('caches' in self)) return false;
  try {
    const c = await caches.open(CACHE);
    for (const req of await c.keys()) if (!req.url.endsWith(man.onnx.sha256)) await c.delete(req); // older pins
    await c.put(new URL('zeref-step.onnx?sha256=' + man.onnx.sha256, BASE).href,
      new Response(buf, { headers: { 'Content-Type': 'application/octet-stream' } }));
    return true;
  } catch { return false; }
}

// onProgress({phase, loaded, total})
export async function loadBrain(man, onProgress = () => {}) {
  const t0 = performance.now();
  let buf = await cachedModel(man), from = 'cache';
  if (buf) onProgress({ phase: 'verified from this device\'s cache', loaded: man.onnx.bytes, total: man.onnx.bytes });
  else {
    from = 'download';
    buf = new Uint8Array(man.onnx.bytes);
    let off = 0;
    for (const ch of man.onnx.chunks) {
      const r = await fetch(new URL(ch.file, BASE), { cache: 'no-cache' });
      if (!r.ok || !r.body) throw new Error(ch.file + ' HTTP ' + r.status);
      const start = off, reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (off + value.byteLength > buf.byteLength) throw new Error('download larger than the manifest says');
        buf.set(value, off); off += value.byteLength;
        onProgress({ phase: 'downloading', loaded: off, total: man.onnx.bytes });
      }
      if (off - start !== ch.bytes || (await sha256Hex(buf.subarray(start, off))) !== ch.sha256)
        throw new Error(ch.file + ' failed its sha256 check');
    }
    onProgress({ phase: 'checking sha256', loaded: off, total: man.onnx.bytes });
    if (off !== man.onnx.bytes || (await sha256Hex(buf)) !== man.onnx.sha256) throw new Error('rebuilt brain failed its sha256 check');
  }
  const tr = await fetch(new URL(man.tokenizer.file, BASE), { cache: 'no-cache' });
  if (!tr.ok) throw new Error('tokenizer HTTP ' + tr.status);
  const tbuf = new Uint8Array(await tr.arrayBuffer());
  if ((await sha256Hex(tbuf)) !== man.tokenizer.sha256) throw new Error('tokenizer failed its sha256 check');
  const tokenizer = new ZerefTokenizer(new TextDecoder().decode(tbuf));
  // The quantum-record dice (default reply mode). If the record can't be read or verified, the page says so
  // and replies stay greedy; nothing is invented in its place.
  let record = null, recordError = null;
  try { record = await loadRecord(BASE); } catch (err) { recordError = err && err.message ? err.message : 'quantum record unavailable'; }
  onProgress({ phase: 'starting his brain', loaded: man.onnx.bytes, total: man.onnx.bytes });
  const session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'disabled' });
  const cached = from === 'download' ? await storeModel(man, buf) : true;
  buf = null;
  return {
    manifest: man, from, cached, seconds: (performance.now() - t0) / 1000,
    sha256: man.onnx.sha256, record, recordError,
    talk: (history, text, opts) => reply(ort, session, man.dims, tokenizer, history, text, opts),
  };
}
