# Feed Zeref: the reading drop box

Anyone can offer Zeref a book or text through the **[Feed Zeref issue form](https://github.com/NavisWORLD/NavisWORLD/issues/new?template=feed-zeref.yml)**: title, source URL, license, a required *"I have the right to share this"* box, and one file (TXT, PDF, EPUB or a ZIP of those; EPUB may need zipping for GitHub to attach it).

## What happens

| Step | Where | Who |
|---|---|---|
| The file is downloaded (from the issue attachment, or the source URL if nothing is attached), capped at **100 MB**, type-checked by content (executables, scripts and unknown binaries are refused; ZIPs may hold only TXT/MD/PDF/EPUB, no executable bits, no unsafe paths, ≤ 200 MB unpacked) | `.github/workflows/zeref-feed.yml` → `scripts/zeref/feed.py intake` | automatic |
| The file is stored as a **release asset** on the `zeref-feed` pre-release (never in plain git). A `manifest.json` (handle, issue url, source, license, sha256, size, mime, timestamp) lands in `zeref/feed/inbox/<issue>-<sha12>/` and the issue gets **`feed:pending`** | quarantine | automatic |
| `/approve` → moved to `zeref/feed/approved/<id>/` with `approval.json`, label `feed:approved` | issue comment | **@NavisWORLD only** (repo owner) |
| `/reject <reason>` → moved to `zeref/feed/rejected/<id>/` with `rejection.json`, the stored file is deleted, label `feed:rejected` | issue comment | **@NavisWORLD only** |
| The reading index `zeref/feed/index/index.json` is rebuilt from **approved items only** (sha256 re-verified, text extracted, ~420-character passages (so a passage fits his 300-byte reading slot), BM25 keyword stats; deterministic, no embeddings, no paid compute) | `feed.py index` | automatic |
| Honest counts: `zeref/feed/status.json`, `assets/zeref-feed{,-mobile}.svg` (profile) and the Pages chat "reading shelf" line | `feed.py status` | automatic |

## What "approved" means: READ, NOT TRAINED

When a visitor chats with him on his [Pages chat](https://navisworld.github.io/NavisWORLD/), his guest door may look up the best-matching approved passage for the visitor's message and hand it to him as **reading context**. His reply then shows `read from: <title> (approved feed)` with the passage, labelled **READ, NOT TRAINED**.

**Nothing here feeds his training, conditioning, the god core or his checkpoint, even after approval.** His pinned brain step and checkpoint stay exactly as they are, and chats stay `training_eligible:false`. Any future training ingestion would need a **separate decision by Cory plus The Beast Box fair gate**; approving a book here is not that decision.

Pending and rejected items are never in the index, so Zeref cannot read them.
