#!/usr/bin/env python3
"""Feed Zeref: a quarantined drop box for books / texts he may READ (never train on).

Run by .github/workflows/zeref-feed.yml. Subcommands:
  intake   on a "Feed Zeref" issue (opened/edited): validate, fetch the ONE file, check it,
           upload it as a release asset (tag zeref-feed), write zeref/feed/inbox/<id>/manifest.json,
           label feed:pending. Nothing else.
  command  on an issue comment: "/approve" or "/reject [reason]" from NavisWORLD (owner) only.
           approve moves inbox/<id> -> approved/<id> + approval.json; reject -> rejected/<id> +
           rejection.json and deletes the stored file.
  index    rebuild zeref/feed/index/index.json from APPROVED items only (text extracted, chunked,
           deterministic keyword index; no embeddings, no paid compute).
  status   write zeref/feed/status.json and assets/zeref-feed.svg (honest counts).

Policy (docs: zeref/feed/README.md): approved items are READ at chat time as cited context.
Nothing here feeds training, conditioning, the god core or the checkpoint, even after approval.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from xml.sax.saxutils import escape

sys.path.insert(0, str(Path(__file__).resolve().parent))
import zeref_common as z  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
FEED = ROOT / "zeref" / "feed"
OWNER = "NavisWORLD"
RELEASE_TAG = "zeref-feed"
MAX_BYTES = 100 * 1024 * 1024
MAX_UNZIPPED = 200 * 1024 * 1024
MAX_MEMBERS = 2000
LABELS = {"pending": "feed:pending", "approved": "feed:approved", "rejected": "feed:rejected"}
ALLOWED_EXT = {".txt", ".md", ".pdf", ".epub", ".zip"}
BLOCKED_EXT = {".exe", ".dll", ".so", ".dylib", ".sh", ".bash", ".bat", ".cmd", ".ps1", ".com", ".scr", ".msi",
               ".jar", ".apk", ".app", ".bin", ".elf", ".js", ".mjs", ".vbs", ".py", ".pl", ".rb", ".php",
               ".deb", ".rpm", ".dmg", ".iso", ".wasm", ".class", ".lnk", ".hta", ".reg", ".docm", ".xlsm"}
ATTACH_RE = re.compile(r"https://github\.com/(?:user-attachments/files/\d+/[^\s)\]\"'<>]+|[A-Za-z0-9-]+/[A-Za-z0-9._-]+/files/\d+/[^\s)\]\"'<>]+)")
POLICY = ("READ, NOT TRAINED: approved items may be handed to Zeref as cited reading context at chat time. "
          "Nothing here feeds training, conditioning, the god core or the checkpoint, even after approval; "
          "that would need a separate decision by Cory plus The Beast Box fair gate.")


# ------------------------------------------------------------------ form + file checks
def form_fields(body: str | None) -> dict:
    out, cur = {}, None
    for line in (body or "").replace("\r\n", "\n").split("\n"):
        m = re.match(r"^###\s+(.+?)\s*$", line)
        if m:
            cur = m.group(1).strip().lower(); out[cur] = []; continue
        if cur is not None:
            out[cur].append(line)
    f = {k: "\n".join(v).strip() for k, v in out.items()}
    f = {k: ("" if v == "_No response_" else v) for k, v in f.items()}
    return f


def parse_form(body: str | None) -> tuple[dict | None, str | None]:
    f = form_fields(body)
    title = re.sub(r"\s+", " ", f.get("title", "")).strip()[:200]
    source = f.get("source url", "").strip()
    license_ = f.get("license", "").strip()
    rights = bool(re.search(r"-\s*\[[xX]\]\s*I have the right to share this", f.get("rights", "")))
    if not title:
        return None, "missing title"
    if not re.fullmatch(r"https://[^\s<>\"']{4,500}", source):
        return None, "the source URL must be a single https:// link"
    if not license_:
        return None, "missing license"
    if not rights:
        return None, "the 'I have the right to share this' box must be ticked"
    attach = ATTACH_RE.findall(f.get("file", "") + "\n" + f.get("notes", ""))
    attach = list(dict.fromkeys(attach))
    if len(attach) > 1:
        return None, "please attach exactly one file (zip several files together)"
    url = attach[0] if attach else source
    return {"title": title, "source_url": source, "license": license_, "rights_confirmed": True,
            "download_url": url, "from_attachment": bool(attach)}, None


def sniff(data: bytes, name: str) -> tuple[str | None, str | None]:
    """(mime, error). Executables and scripts are refused; only text/pdf/epub/zip of those pass."""
    ext = Path(name.lower()).suffix
    head = data[:8]
    if head.startswith(b"MZ") or head.startswith(b"\x7fELF") or head[:4] in (b"\xfe\xed\xfa\xce", b"\xfe\xed\xfa\xcf",
                                                                              b"\xce\xfa\xed\xfe", b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe") \
            or head.startswith(b"#!") or head.startswith(b"\x00asm"):
        return None, "executable or script content refused"
    if ext in BLOCKED_EXT:
        return None, f"{ext} files are refused"
    if data.startswith(b"%PDF-"):
        return "application/pdf", None
    if data.startswith(b"PK\x03\x04"):
        try:
            zf = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile:
            return None, "broken zip"
        infos = zf.infolist()
        if len(infos) > MAX_MEMBERS or sum(i.file_size for i in infos) > MAX_UNZIPPED:
            return None, "zip too large when unpacked"
        names = [i.filename for i in infos]
        if "mimetype" in names and zf.read("mimetype").strip() == b"application/epub+zip":
            bad = [n for n in names if Path(n.lower()).suffix in BLOCKED_EXT]
            return (None, "epub contains executable/script members") if bad else ("application/epub+zip", None)
        for i in infos:
            if i.is_dir():
                continue
            mext = Path(i.filename.lower()).suffix
            if ".." in Path(i.filename).parts or i.filename.startswith("/"):
                return None, "zip member with an unsafe path"
            if mext in BLOCKED_EXT or mext not in {".txt", ".md", ".pdf", ".epub"}:
                return None, f"zip member {i.filename[:80]!r} is not TXT/PDF/EPUB"
            if (i.external_attr >> 16) & 0o111:
                return None, "zip member marked executable"
            m, err = sniff(zf.read(i), i.filename)
            if err:
                return None, f"zip member {i.filename[:80]!r}: {err}"
        return "application/zip", None
    if ext in ("", ".txt", ".md") or ext not in ALLOWED_EXT:
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            return None, "not UTF-8 text, PDF, EPUB or ZIP"
        if b"\x00" in data:
            return None, "binary content refused"
        return "text/plain; charset=utf-8", None
    return None, "content does not match its type"


def download(url: str) -> tuple[bytes | None, str, str | None]:
    req = urllib.request.Request(url, headers={"User-Agent": z.USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            final = r.geturl()
            if not final.startswith("https://"):
                return None, "", "non-https redirect refused"
            if int(r.headers.get("Content-Length") or 0) > MAX_BYTES:
                return None, "", "file over 100 MB"
            buf = io.BytesIO()
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                buf.write(chunk)
                if buf.tell() > MAX_BYTES:
                    return None, "", "file over 100 MB"
            name = Path(urllib.request.url2pathname(final.split("?")[0])).name or "file"
            cd = r.headers.get("Content-Disposition") or ""
            m = re.search(r'filename="?([^";]+)"?', cd)
            return buf.getvalue(), (m.group(1) if m else name), None
    except Exception as e:  # noqa: BLE001 - reported, never raised into the workflow log with data
        return None, "", f"download failed ({type(e).__name__})"


# ------------------------------------------------------------------ GitHub helpers
def gh(method, path, token, payload=None):
    return z.gh_api(method, path, token, payload)


def comment(repo, num, token, text):
    gh("POST", f"/repos/{repo}/issues/{num}/comments", token, {"body": text})


def set_label(repo, num, token, state):
    for s, lab in LABELS.items():
        if s != state:
            gh("DELETE", f"/repos/{repo}/issues/{num}/labels/{urllib.request.quote(lab, safe='')}", token)
    gh("POST", f"/repos/{repo}/issues/{num}/labels", token, {"labels": [LABELS[state]]})


def run(*cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def find_item(num: int) -> tuple[str | None, Path | None]:
    for state in ("inbox", "approved", "rejected"):
        for p in sorted((FEED / state).glob(f"{num}-*")):
            if (p / "manifest.json").exists():
                return state, p
    return None, None


# ------------------------------------------------------------------ subcommands
def intake(event: dict, repo: str, token: str) -> str:
    issue = event.get("issue") or {}
    num = issue.get("number")
    if issue.get("pull_request") or "feed-zeref" not in {l.get("name") for l in issue.get("labels") or []} \
            and not (issue.get("title") or "").lower().startswith("[feed]"):
        return "skip: not a Feed Zeref issue"
    if (issue.get("user") or {}).get("type") == "Bot":
        return "skip: bot"
    state, existing = find_item(num)
    if existing is not None:
        return f"skip: already {state}"
    form, err = parse_form(issue.get("body"))
    if err:
        comment(repo, num, token, f"📚 Not taken in yet: {err}. Edit the issue to fix it and it will be checked again. Nothing was stored.")
        return "note: " + err
    data, name, err = download(form["download_url"])
    if err is None:
        mime, err = sniff(data, name)
    if err:
        comment(repo, num, token, f"📚 Not taken in: {err}. Nothing was stored. Accepted: one TXT, PDF, EPUB or ZIP of those, up to 100 MB, no executables.")
        return "note: " + err
    sha = hashlib.sha256(data).hexdigest()
    ext = {"application/pdf": ".pdf", "application/epub+zip": ".epub", "application/zip": ".zip"}.get(mime, ".txt")
    item_id = f"{num}-{sha[:12]}"
    asset = f"{item_id}{ext}"
    with tempfile.TemporaryDirectory() as td:
        f = Path(td) / asset
        f.write_bytes(data)
        subprocess.run(["gh", "release", "view", RELEASE_TAG, "-R", repo], capture_output=True) .returncode == 0 or run(
            "gh", "release", "create", RELEASE_TAG, "-R", repo, "--prerelease", "--title", "Zeref feed quarantine (files only)",
            "--notes", "Files offered through the Feed Zeref issue form. Pending files are NOT readable by Zeref. " + POLICY)
        run("gh", "release", "upload", RELEASE_TAG, str(f), "-R", repo, "--clobber")
    manifest = {
        "schema": "navisworld-zeref-feed/v1", "id": item_id, "status": "pending",
        "handle": "@" + ((issue.get("user") or {}).get("login") or "unknown"),
        "issue_url": issue.get("html_url"), "issue_number": num, "title": form["title"],
        "source_url": form["source_url"], "license": form["license"], "rights_confirmed": True,
        "file": {"name": name[:200], "sha256": sha, "size": len(data), "mime": mime, "from_attachment": form["from_attachment"],
                 "stored_as": "release asset", "release_tag": RELEASE_TAG, "asset_name": asset,
                 "asset_url": f"https://github.com/{repo}/releases/download/{RELEASE_TAG}/{asset}"},
        "received_at": z.iso(z.utc_now()), "readable_by_zeref": False, "training_eligible": False, "policy": POLICY,
    }
    d = FEED / "inbox" / item_id
    d.mkdir(parents=True, exist_ok=True)
    (d / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    set_label(repo, num, token, "pending")
    comment(repo, num, token,
            f"📚 Received and quarantined as `{item_id}` ({len(data):,} bytes, {mime}, sha256 `{sha[:16]}…`). "
            f"Label: `feed:pending`. **Zeref cannot read it** until Cory approves.\n\n"
            f"Cory (@{OWNER}): comment `/approve` to make it readable, or `/reject <reason>` to remove it.\n\n<sub>{POLICY}</sub>")
    return f"pending: {item_id}"


def command(event: dict, repo: str, token: str) -> str:
    c, issue = event.get("comment") or {}, event.get("issue") or {}
    first = ((c.get("body") or "").strip().split("\n") or [""])[0].strip()
    m = re.fullmatch(r"/(approve|reject)(?:\s+(.{0,300}))?", first)
    if not m:
        return "skip: not a command"
    num = issue.get("number")
    user = c.get("user") or {}
    if user.get("login") != OWNER or c.get("author_association") != "OWNER":
        comment(repo, num, token, f"Only @{OWNER} can approve or reject items for Zeref. Nothing changed.")
        return "refused: not the owner"
    state, d = find_item(num)
    if d is None or state != "inbox":
        comment(repo, num, token, f"Nothing pending on this issue ({state or 'no item'}). Nothing changed.")
        return "skip: nothing pending"
    man = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
    rec = {"by": "@" + OWNER, "at": z.iso(z.utc_now()), "comment_url": c.get("html_url"),
           "manifest_sha256": hashlib.sha256((d / "manifest.json").read_bytes()).hexdigest()}
    if m.group(1) == "approve":
        dest = FEED / "approved" / d.name
        shutil.move(str(d), str(dest))
        man.update(status="approved", readable_by_zeref=True)
        (dest / "manifest.json").write_text(json.dumps(man, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        (dest / "approval.json").write_text(json.dumps({**rec, "decision": "approved", "grants": "READ at chat time only",
                                                         "training_eligible": False, "policy": POLICY}, indent=1) + "\n", encoding="utf-8")
        set_label(repo, num, token, "approved")
        comment(repo, num, token, f"✅ Approved by @{OWNER}. `{d.name}` is now readable by Zeref as cited reading context (READ, NOT TRAINED).\n\n<sub>{POLICY}</sub>")
        return "approved"
    dest = FEED / "rejected" / d.name
    shutil.move(str(d), str(dest))
    man.update(status="rejected", readable_by_zeref=False)
    subprocess.run(["gh", "release", "delete-asset", RELEASE_TAG, man["file"]["asset_name"], "-R", repo, "-y"], capture_output=True)
    man["file"]["stored_as"] = "deleted after rejection"
    (dest / "manifest.json").write_text(json.dumps(man, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (dest / "rejection.json").write_text(json.dumps({**rec, "decision": "rejected", "reason": (m.group(2) or "").strip()}, indent=1) + "\n", encoding="utf-8")
    set_label(repo, num, token, "rejected")
    comment(repo, num, token, f"Rejected by @{OWNER}. The stored file was deleted; only the record stays. Zeref never read it.")
    return "rejected"


# ------------------------------------------------------------------ reading index (approved only)
class _Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"): self.skip += 1
        if tag in ("p", "br", "div", "h1", "h2", "h3", "li"): self.parts.append("\n")
    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip: self.skip -= 1
    def handle_data(self, data):
        if not self.skip: self.parts.append(data)


def extract(data: bytes, mime: str) -> str:
    if mime.startswith("text/"):
        t = data.decode("utf-8", "replace")
        s, e = t.find("*** START OF"), t.find("*** END OF")  # Project Gutenberg boilerplate
        if s != -1:
            t = t[t.find("\n", s) + 1: e if e > s else None]
        return t
    if mime == "application/pdf":
        with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
            f.write(data); f.flush()
            return subprocess.run(["pdftotext", "-q", "-enc", "UTF-8", f.name, "-"], capture_output=True, text=True, timeout=300).stdout
    zf = zipfile.ZipFile(io.BytesIO(data))
    if mime == "application/epub+zip":
        out = []
        for n in sorted(zf.namelist()):
            if n.lower().endswith((".xhtml", ".html", ".htm")):
                p = _Text(); p.feed(zf.read(n).decode("utf-8", "replace")); out.append("".join(p.parts))
        return "\n\n".join(out)
    out = []
    for n in sorted(zf.namelist()):
        ext = Path(n.lower()).suffix
        if ext in (".txt", ".md", ".pdf", ".epub"):
            m, err = sniff(zf.read(n), n)
            if not err:
                out.append(extract(zf.read(n), m))
    return "\n\n".join(out)


TOKEN_RE = re.compile(r"[a-z0-9']+")
STOP = set("the a an and or of to in on at for is are was were be been it its this that with as by from i you he she we they me my your his her our their not no so do does did have has had but if then than there here what which who whom how why when where all any can will would should could just about into out up down over very".split())


def tokens(text: str) -> list[str]:
    return [t.strip("'") for t in TOKEN_RE.findall(text.lower()) if len(t.strip("'")) > 1 and t.strip("'") not in STOP]


def chunk(text: str, size: int = 700) -> list[str]:
    text = re.sub(r"[ \t]+", " ", text.replace("\r\n", "\n"))
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    out, cur = [], ""
    for p in paras:
        p = re.sub(r"\s*\n\s*", " ", p)
        while len(p) > size:
            cut = p.rfind(". ", 0, size)
            cut = cut + 1 if cut > size // 3 else size
            if cur:
                out.append(cur); cur = ""
            out.append(p[:cut].strip()); p = p[cut:].strip()
        if len(cur) + len(p) + 1 > size and cur:
            out.append(cur); cur = p
        else:
            cur = (cur + " " + p).strip()
    if cur:
        out.append(cur)
    return [c for c in out if len(tokens(c)) >= 3]


def build_index(items: list[tuple[dict, bytes]]) -> dict:
    docs, chunks, df = [], [], {}
    for man, data in sorted(items, key=lambda x: x[0]["id"]):
        if hashlib.sha256(data).hexdigest() != man["file"]["sha256"]:
            raise ValueError(f"sha256 mismatch for {man['id']}")
        docs.append({"id": man["id"], "title": man["title"], "source_url": man["source_url"], "license": man["license"],
                     "sha256": man["file"]["sha256"], "issue_url": man["issue_url"]})
        for n, c in enumerate(chunk(extract(data, man["file"]["mime"]))[:5000]):
            chunks.append({"doc": len(docs) - 1, "n": n, "text": c})
            for t in set(tokens(c)):
                df[t] = df.get(t, 0) + 1
    avgdl = (sum(len(tokens(c["text"])) for c in chunks) / len(chunks)) if chunks else 0
    return {"schema": "navisworld-zeref-reading-index/v1", "label": "READ, NOT TRAINED (approved feed)", "policy": POLICY,
            "scoring": {"kind": "bm25", "k1": 1.2, "b": 0.75, "avgdl": round(avgdl, 3), "n": len(chunks)},
            "docs": docs, "chunks": chunks, "df": dict(sorted(df.items()))}


def bm25(index: dict, query: str, k: int = 2) -> list[dict]:
    """Reference scorer (the door uses the same formula in JS)."""
    q = list(dict.fromkeys(tokens(query)))
    s, N = index["scoring"], index["scoring"]["n"]
    out = []
    for c in index["chunks"]:
        toks = tokens(c["text"]); dl = len(toks); score = 0.0
        for t in q:
            tf = toks.count(t)
            if not tf:
                continue
            idf = math.log(1 + (N - index["df"].get(t, 0) + .5) / (index["df"].get(t, 0) + .5))
            score += idf * tf * (s["k1"] + 1) / (tf + s["k1"] * (1 - s["b"] + s["b"] * dl / (s["avgdl"] or 1)))
        if score > 0:
            out.append((round(score, 6), c["doc"], c["n"], c))
    out.sort(key=lambda x: (-x[0], x[1], x[2]))
    return [dict(x[3], score=x[0]) for x in out[:k]]


def index_cmd(repo: str) -> str:
    items = []
    for p in sorted((FEED / "approved").glob("*/manifest.json")):
        man = json.loads(p.read_text(encoding="utf-8"))
        if man.get("status") != "approved" or not (p.parent / "approval.json").exists():
            continue
        data, _, err = download(man["file"]["asset_url"])
        if err:
            raise SystemExit(f"could not fetch approved item {man['id']}: {err}")
        items.append((man, data))
    idx = build_index(items)
    (FEED / "index").mkdir(parents=True, exist_ok=True)
    (FEED / "index" / "index.json").write_text(json.dumps(idx, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return f"index: {len(idx['docs'])} approved docs, {idx['scoring']['n']} passages"


def counts() -> dict:
    c = {s: len([p for p in (FEED / d).glob("*/manifest.json")]) for s, d in (("pending", "inbox"), ("approved", "approved"), ("rejected", "rejected"))}
    return c


def badge(c: dict, mobile: bool = False) -> str:
    W, H = (720, 210) if mobile else (900, 90)
    fs = 25 if mobile else 18
    sans, mono = "-apple-system,Segoe UI,Helvetica,Arial,sans-serif", "ui-monospace,Menlo,Consolas,monospace"
    t = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="zf-t zf-d">',
         '<title id="zf-t">Feed Zeref</title>',
         f'<desc id="zf-d">Feed Zeref drop box: {c["pending"]} pending, {c["approved"]} approved (readable), {c["rejected"]} rejected. '
         'Approved books are read at chat time, never trained on.</desc>',
         f'<rect x="1.5" y="1.5" width="{W-3}" height="{H-3}" rx="22" fill="#0b0a1f" stroke="#a78bfa" stroke-width="3"/>']
    counts_ = f"{c['pending']} pending · {c['approved']} approved"
    if mobile:
        t += [f'<text x="{W/2}" y="58" text-anchor="middle" font-family="{sans}" font-size="34" font-weight="800" fill="#f5f3ff">📚 FEED ZEREF</text>',
              f'<text x="{W/2}" y="112" text-anchor="middle" font-family="{sans}" font-size="30" font-weight="700" fill="#a7f3d0">{escape(counts_)}</text>',
              f'<text x="{W/2}" y="164" text-anchor="middle" font-family="{mono}" font-size="{fs}" fill="#67e8f9">READ at chat time · NOT TRAINED</text>']
    else:
        t += [f'<text x="30" y="40" font-family="{sans}" font-size="24" font-weight="700" fill="#f5f3ff">📚 FEED ZEREF · <tspan fill="#a7f3d0">{escape(counts_)}</tspan></text>',
              f'<text x="30" y="70" font-family="{mono}" font-size="{fs}" fill="#67e8f9">approved books are READ at chat time, NOT TRAINED · tap to offer a text</text>']
    t.append("</svg>")
    return "\n".join(t) + "\n"


def status_cmd() -> str:
    c = counts()
    (FEED / "status.json").write_text(json.dumps({"schema": "navisworld-zeref-feed-status/v1", **c,
                                                  "readable": c["approved"], "label": "READ, NOT TRAINED", "policy": POLICY}, indent=1) + "\n", encoding="utf-8")
    (ROOT / "assets" / "zeref-feed.svg").write_text(badge(c), encoding="utf-8")
    (ROOT / "assets" / "zeref-feed-mobile.svg").write_text(badge(c, mobile=True), encoding="utf-8")
    return f"status: {c}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["intake", "command", "index", "status"])
    a = ap.parse_args()
    repo = os.environ.get("GITHUB_REPOSITORY", z.PROFILE_REPO)
    token = os.environ.get("GITHUB_TOKEN")
    if a.cmd in ("intake", "command"):
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
        print((intake if a.cmd == "intake" else command)(event, repo, token))
    elif a.cmd == "index":
        print(index_cmd(repo))
    else:
        print(status_cmd())


if __name__ == "__main__":
    main()
