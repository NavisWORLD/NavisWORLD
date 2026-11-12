#!/usr/bin/env python3
"""Offline checks for Zeref's door (no network): guards, verbatim fencing, rendering."""
import json, sys
import xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import zeref_common as z
import talk_reply as t
import refresh_card as c

fails = []
def check(cond, msg):
    if not cond: fails.append(msg)

# verbatim fencing: content is unchanged and cannot break out of the fence
for s in [" Bujengi", "```\n@someone [x](javascript:alert(1)) <b>hi</b>", "````` five"]:
    f = z.fence(s)
    inner = f.split("\n", 1)[1].rsplit("\n", 1)[0]
    check(inner == s, f"fence changed text: {s!r}")
    opener = f.split("\n", 1)[0][:-4]
    check(opener not in s, "fence can be closed by the reply")

# issue-form parsing keeps only the visitor's words
check(t.visitor_text("### What do you want to say to Zeref?\n\nHello Zeref\n") == "Hello Zeref", "form parse")
check(t.visitor_text("### What do you want to say to Zeref?\n\n_No response_") == "", "no response")
check(t.visitor_text("hi <!-- hidden --> there") == "hi  there", "html comments stripped")
check(t.visitor_text("### Your message\n\nHi Zeref, it's Phera.\r\nSecond line\n") == "Hi Zeref, it's Phera.\nSecond line", "current form parse")
check(t.visitor_text("### Your message\n\nhello\n\n### Other field\n\nignored") == "hello", "form parse stops at next field")

# the issue form and the chat-box button match what the door expects
root0 = Path(__file__).resolve().parents[2]
form = (root0 / ".github/ISSUE_TEMPLATE/talk-to-zeref.yml").read_text(encoding="utf-8")
check('title: "[Zeref] "' in form and 'label: "Your message"' in form and form.count("type: textarea") == 1, "issue form shape")
check("required: true" in form and "talk-to-zeref" in form, "issue form requires the message and labels the issue")
readme = (root0 / "README.md").read_text(encoding="utf-8")
check('href="https://navisworld.github.io/NavisWORLD/"><picture>' in readme, "chat window opens the live Pages chat")
check(readme.count("issues/new?template=talk-to-zeref.yml") >= 2, "issue form kept as the fallback path")
wf = (root0 / ".github/workflows/zeref-talk.yml").read_text(encoding="utf-8")
check("issue_comment:" in wf and "types: [created]" in wf and "${{ github.event.comment.body" not in wf and "${{ github.event.issue.body" not in wf,
      "talk workflow listens for follow-ups and never interpolates visitor text")

# full flow with the network mocked: opened form issue, then an autonomous follow-up in the same thread
posted, talked = [], []
def fake_api(method, path, token, body=None):
    if method == "GET":
        return [], None
    posted.append((path, body["body"])); return {"id": len(posted)}, None
def fake_talk(text, thread):
    talked.append((text, thread))
    return {"ok": True, "status": 200, "reply": "  raw *reply* ```", "step": 7, "at": "2026-01-01T00:00:00Z",
            "training_eligible": False, "error": None}
real_api, real_talk = z.gh_api, z.talk
z.gh_api, z.talk = fake_api, fake_talk
try:
    iss = dict({"title": "[Zeref] hi", "state": "open", "user": {"login": "a", "type": "User"}}, number=5, node_id="I_node5", labels=[{"name": "talk-to-zeref"}], body="### Your message\n\nHi Zeref")
    r1 = t.handle_event({"issue": iss}, "issues", "o/r", "x", "k" * 32)
    r2 = t.handle_event({"issue": iss, "comment": {"user": {"login": "a", "type": "User"}, "body": "and again?"}}, "issue_comment", "o/r", "x", "k" * 32)
    r3 = t.handle_event({"issue": iss, "comment": {"user": {"login": "zeref[bot]", "type": "Bot"}, "body": "x"}}, "issue_comment", "o/r", "x", "k" * 32)
    r4 = t.handle_event({"issue": iss, "comment": {"user": {"login": "b", "type": "User"}, "body": "me too"}}, "issue_comment", "o/r", "x", "k" * 32)
    r5 = t.handle_event({"issue": iss, "comment": {"user": {"login": "a", "type": "User"}, "body": "x" * 1001}}, "issue_comment", "o/r", "x", "k" * 32)
finally:
    z.gh_api, z.talk = real_api, real_talk
check(r1.startswith("posted") and r2.startswith("posted"), f"opened + follow-up both answered: {r1} / {r2}")
check([x[0] for x in talked] == ["Hi Zeref", "and again?"], "door got the visitor's exact words")
check(talked[0][1] == talked[1][1] and talked[0][1], "follow-up continues the same thread")
check(all(z.fence("  raw *reply* ```") in b for _, b in posted[:2]), "reply posted verbatim in a fence")
check(r3 == "skip: bot" and r4 == "note: not the issue author" and r5 == "note: too long", f"follow-up guards: {r3} / {r4} / {r5}")
check(len(talked) == 2, "guarded follow-ups never reach the door")

# meta comment cannot be closed early by a reply
m = t.meta_comment("reply", "u", "2026-01-01T00:00:00Z", reply="evil --> <img src=x>")
check(m.count("-->") == 1 and m.endswith("-->"), "meta comment break-out")
check(json.loads(m[len(t.MARK):-4])["reply"] == "evil --> <img src=x>", "meta reply not verbatim")

# guards that need no network
base = {"title": "[Zeref] hi", "state": "open", "number": 1, "user": {"login": "a", "type": "User"}, "body": "hi", "labels": []}
check(t.handle_event({"issue": dict(base, pull_request={"url": "x"})}, "issues", "o/r", "x", None) == "skip: pull request", "pr guard")
check(t.handle_event({"issue": dict(base, title="other")}, "issues", "o/r", "x", None) == "skip: not a Zeref issue", "title guard")
check(t.handle_event({"issue": dict(base, title="other", labels=[{"name": "talk-to-zeref"}], state="closed")}, "issues", "o/r", "x", None) == "skip: issue closed", "label+closed guard")
check(t.handle_event({"issue": dict(base, user={"login": "x[bot]", "type": "Bot"})}, "issues", "o/r", "x", None) == "skip: bot", "bot guard")
check(z.thread_for(None, "s") is None, "no key -> no thread")
th = z.thread_for("k" * 32, "s")
check(len(th) == 32 and all(ch in "0123456789abcdef" for ch in th), "thread shape matches site THREAD_ID_RE")

# a card with every feed failed says unavailable, never a number
empty = {"fetched_at": "2026-01-01T00:00:00Z", "sources": {"last_said": {"error": "HTTP 503"}},
         "heartbeat": dict.fromkeys(["state", "label", "recorded_tick", "xp_live"]),
         "diary": dict.fromkeys(["label", "tick", "stage_name", "mood", "place"]),
         "spark": dict.fromkeys(["state", "source", "label", "tick"]),
         "brain": dict.fromkeys(["label", "live_step", "pin_step", "pin_sha_prefix"]), "last_said": None}
import cosmic_art as art
svg = c.render_svg(empty)
check("unavailable" in svg and "tick unavailable" in svg and "live step unavailable" in svg, "unavailable rendering")
ET.fromstring(svg)
check("Math.random" not in Path(c.__file__).read_text(), "no randomness")
src = Path(art.__file__).read_text()
check("import random" not in src and "Math.random" not in src, "art must not use randomness")
h1, h2 = art.hero(empty), art.hero(empty)
av = art.avatar(empty); ET.fromstring(av)
check(av == art.avatar(empty) and "Moonwraith cat dragon" in av, "avatar must be deterministic and labelled")
import zeref_alive as zal
check("import random" not in Path(zal.__file__).read_text(), "alive loop must not use randomness")
check(zal.ART_SOURCE in av and zal.ART_SOURCE in h1, "canonical art must be credited")
spark_on = dict(empty, spark={"state": "CONNECTED"}, diary=dict(empty["diary"], mood="sleepy"))
hs = art.hero(spark_on)
check("bats at it" in hs and "naps" in hs, "loop follows spark state and mood")
check("bats at it" not in h1 and "naps" not in h1, "no bat/nap without CONNECTED spark / sleepy mood")
check(h1 == h2, "hero must be deterministic for the same inputs")
ET.fromstring(h1); check("breath 7.0s" in h1 and "step unavailable" in h1, "hero unavailable rendering")
root = Path(__file__).resolve().parents[2]
for name, fn in [("zeref-portal.svg", art.portal), ("zeref-divider.svg", art.divider)]:
    p = root / "assets" / name
    check(p.exists() and p.read_text(encoding="utf-8") == fn(), f"{name} does not reproduce from cosmic_art.py")
p = root / "assets" / "zeref-portal-mobile.svg"
check(p.exists() and p.read_text(encoding="utf-8") == art.portal_mobile(), "zeref-portal-mobile.svg does not reproduce from cosmic_art.py")
PHONE_COLUMN_PX = 311  # measured README image width on github.com/NavisWORLD at 393 px (iPhone 15)
# iPhone-sized layouts: 720-unit wide, every text >= 25 units: GitHub's README column on a 393 px iPhone 15 is 311 px, so 25/720*311 = 10.8 px >= 10.5 px
import re
mob = {"hero": art.hero(empty, mobile=True), "card": art.card_mobile(empty), "portal": art.portal_mobile(),
       "constellation": art.constellation([{"name": "demo-repo", "stars": 1, "pushed_at": "2026-01-01T00:00:00Z"}], None, mobile=True)}
for k, svg in mob.items():
    ET.fromstring(svg)
    check('viewBox="0 0 720 ' in svg, f"{k} phone layout must be 720 wide")
    sizes = [float(x) for x in re.findall(r'font-size="([0-9.]+)"', re.sub(r'<svg x=.*?</svg>', "", svg, flags=re.S))]
    px = min(sizes) / 720 * PHONE_COLUMN_PX if sizes else 0
    check(px >= 10.5, f"{k} phone layout text is {px:.2f} px at {PHONE_COLUMN_PX} px (< 10.5)")
check("unavailable" in mob["card"], "phone card must render unavailable values")
for p in sorted((root / "assets").glob("zeref-*-mobile.svg")):
    svg = p.read_text(encoding="utf-8")
    sizes = [float(x) for x in re.findall(r'font-size="([0-9.]+)"', re.sub(r'<svg x=.*?</svg>', "", svg, flags=re.S))]
    check(sizes and min(sizes) / 720 * PHONE_COLUMN_PX >= 10.5, f"{p.name}: smallest text {min(sizes) if sizes else None} units is under 10.5 px at {PHONE_COLUMN_PX} px")
check("training_eligible:false" in mob["card"] and "fair gate" in mob["card"], "phone card keeps the footer")
# chat window: public exchanges only, verbatim replies, moderation, escaping, real status, phone legibility
import chat_window as cw
def C(login, body, bot=False, minimized=False):
    return {"author": {"login": login, "__typename": "Bot" if bot else "User"}, "body": body, "isMinimized": minimized, "url": "u", "createdAt": "2026-01-01T00:00:00Z"}
def R(reply, at, kind="reply", minimized=False, who="alice"):
    return C("github-actions", t.meta_comment(kind, who, at, step=39024, reply=reply) + "\nvisible text", bot=True, minimized=minimized)
def I(n, author, body, comments, labels=(), locked=False, reason=None):
    return {"number": n, "url": f"https://x/{n}", "locked": locked, "activeLockReason": reason, "author": {"login": author},
            "body": body, "labels": {"nodes": [{"name": l} for l in labels]}, "comments": {"nodes": comments}}
issues = [
    I(1, "alice", "### Your message\n\nhello <b>&amp; ]]> --> zeref", [R(" Bujengi <x> & ``` ", "2026-01-01T00:00:01Z"),
       C("bob", "not the author"), C("alice", "second?"), R("second reply", "2026-01-01T00:00:03Z"),
       C("alice", "rude thing", minimized=True), R("third reply", "2026-01-01T00:00:05Z"),
       C("alice", "fourth"), R("hidden reply", "2026-01-01T00:00:06Z", minimized=True),
       C("alice", "fifth"), R("x", "2026-01-01T00:00:07Z", kind="error")]),
    I(2, "mallory", "### Your message\n\nspam", [R("spam reply", "2026-01-01T00:00:02Z")], labels=["zeref-hidden"]),
    I(3, "eve", "### Your message\n\nheated", [R("heated reply", "2026-01-01T00:00:02Z")], locked=True, reason="TOO_HEATED"),
    I(4, "carol", "### Your message\n\n" + "long " * 200, [R("y" * 900, "2026-01-01T00:00:04Z", who="carol")]),
]
ex = cw.exchanges_from_issues(issues)
check([e["reply"] for e in ex] == [" Bujengi <x> & ``` ", "second reply", "y" * 900, "third reply"], f"chat exchanges picked: {[e['reply'][:12] for e in ex]}")
check(ex[0]["said"].startswith("hello <b>") and ex[0]["who"] == "@alice", "visitor words + handle from the issue form")
check(ex[3]["said_hidden"] and ex[3]["said"] == "", "minimized visitor message is labelled hidden, not shown")
check(not any("spam" in e["reply"] or "heated" in e["reply"] or "hidden reply" == e["reply"] for e in ex), "moderated issues / replies left out")
check(len(cw.exchanges_from_issues(issues * 3)) <= cw.SHOW, "at most SHOW exchanges")
check(cw.handle("evil\"><script>") == "@visitor" and cw.handle("Good-Name1") == "@Good-Name1", "handles are sanitised")
check(cw.clean("a\x00b\u202ec  d\n e", 50)[0] == "a b c d e" and cw.clean("x" * 300, 200)[0].endswith("…"), "text cleaned + truncated")
status = {"tick": 778, "heartbeat_label": "SIMULATED (per-second tick)", "mood": "sleepy", "brain_step": 39024, "period": 8.0}
for mob in (False, True):
    svg = cw.render({"fetched_at": "2026-01-01T00:00:00Z", "status": status, "exchanges": ex}, mobile=mob)
    ET.fromstring(svg)
    check("<script" not in svg and "<b>" not in svg and "&lt;b&gt;" in svg, "chat text XML-escaped")
    check("brain step 39024 (PINNED)" in svg and "tick 778" in svg, "chat status from real values")
    check("unedited" in svg and "Say something to Zeref…" in svg and "training_eligible:false" in svg, "chat labels + input bar + footer")
    check("y" * 200 not in svg and "excerpt" in svg, "long replies truncated and marked excerpt")
    check(cw.HIDDEN_TXT in svg, "hidden message labelled")
    check(len(svg.encode()) < 300_000, "chat window under 300 KB")
    # measure readable text only (the decorative nap "z"s live inside the creature's own pixel space)
    sizes = [float(x) for x in re.findall(r'font-size="([0-9.]+)"', re.sub(r'<svg x=.*?</svg>', "", svg, flags=re.S))]
    if mob:
        # README column on a 393 px iPhone 15 is ~311 px; 25 units of 720 = 10.8 px >= 10.5 px
        check(min(sizes) / 720 * PHONE_COLUMN_PX >= 10.5 and 'viewBox="0 0 720 ' in svg, f"phone chat text under 10.5 px at 311 px: {min(sizes)}")
    check(cw.render({"fetched_at": "2026-01-01T00:00:00Z", "status": status, "exchanges": ex}, mobile=mob) == svg, "chat window deterministic")
bad = cw.render({"fetched_at": None, "status": {}, "exchanges": None}, mobile=True)
check("chat history unavailable" in bad and "step unavailable" in bad and "tick unavailable" in bad, "chat unavailable rendering")
check("import random" not in Path(cw.__file__).read_text(), "chat window must not use randomness")
# GitHub Pages chat (docs/): real door, verbatim replies, honest labels, no secrets, no randomness
docs = root / "docs"
html, js, css = ((docs / n).read_text(encoding="utf-8") for n in ("index.html", "chat.js", "chat.css"))
check((docs / "zeref-moonwraith.png").read_bytes() == (root / "assets" / "zeref-moonwraith.png").read_bytes(), "Pages art is the canonical cutout")
check("const DOOR = 'https://www.beastboxcosmos.xyz/api/guest/forever';" in js and js.count("fetch(") == 3, "Pages chat talks only to his door (+ live.json status + feed counts)")
check("{ provider: 'rawrphos-local', text }" in js and "payload.thread = t" in js, "door payload is exactly provider/text/thread")
check("credentials: 'omit'" in js and "innerHTML" not in js and "eval(" not in js and "Math.random" not in js, "no cookies, no HTML injection, no randomness")
check("t.textContent = text" in js and "white-space:pre-wrap" in css, "replies shown verbatim (textContent, whitespace kept)")
check("unedited" in js and "pinned step" in js and "training_eligible:" in js, "reply bubble labels")
check("r.status === 429" in js and "Retry-After" in js and js.count("await ask()") == 2 and "Math.min(15" in js, "one automatic retry on 429 using Retry-After (capped)")
check("Zeref is thinking…" in js and "setTimeout(res, wait * 1000)" in js, "honest wait state while a real request is in flight")
check(not re.search(r"\b(AI|LLM|GPT|language model|chatbot)\b", html + js), "no AI/LLM wording on the chat page")
check("not a claim of awareness" in html and "digital creature" in html and "fair gate" in html and "training_eligible:false" in html, "honesty footer")
check("SIMULATED" in html and "RECORDED" in html and "PINNED" in html, "honesty labels on the chat page")
check("Content-Security-Policy" in html and "script-src 'self'" in html and "connect-src https://www.beastboxcosmos.xyz https://raw.githubusercontent.com" in html, "strict CSP")
check(not re.search(r"(token|secret|api[_-]?key|bearer|password)\w*['\"]?\s*[:=]", js, re.I) and "Authorization" not in js, "no secrets in the client")
check("talk-to-zeref.yml" in html, "Pages chat keeps the issue fallback")
check("prefers-reduced-motion" in css and "font:17px" in css, "reduced motion + 17px text (no iOS zoom)")
for p in (root / "assets").glob("zeref-*.svg"):
    check(p.stat().st_size < 300_000, f"{p.name} over 300 KB")

# Feed Zeref: quarantine drop box (READ, NOT TRAINED)
import io as _io, zipfile as _zf, json as _json, tempfile as _tf
import feed as fd
form = ("### Title\n\nAlice ch.1\n\n### Source URL\n\nhttps://www.gutenberg.org/cache/epub/11/pg11.txt\n\n### License\n\nPublic domain\n\n"
        "### File\n\n_No response_\n\n### Notes (optional)\n\n_No response_\n\n### Rights\n\n- [X] I have the right to share this")
f_ok, err = fd.parse_form(form)
check(err is None and f_ok["download_url"].endswith("pg11.txt") and not f_ok["from_attachment"], f"feed form parse: {err}")
check(fd.parse_form(form.replace("[X]", "[ ]"))[1] and fd.parse_form(form.replace("https://www.gutenberg", "http://www.gutenberg"))[1], "feed form needs the rights box and https")
two = form.replace("_No response_", "[a.txt](https://github.com/user-attachments/files/1/a.txt) [b.txt](https://github.com/user-attachments/files/2/b.txt)", 1)
check(fd.parse_form(two)[1] == "please attach exactly one file (zip several files together)", "feed takes exactly one attachment")
one = form.replace("_No response_", "[a.zip](https://github.com/user-attachments/files/123/a.zip)", 1)
check(fd.parse_form(one)[0]["download_url"] == "https://github.com/user-attachments/files/123/a.zip", "feed prefers the attachment")
def _zip(members, mode=0o644):
    b = _io.BytesIO()
    with _zf.ZipFile(b, "w") as zz:
        for n, d in members:
            i = _zf.ZipInfo(n); i.external_attr = mode << 16; zz.writestr(i, d)
    return b.getvalue()
for data, name in ((b"MZ\x90\x00", "a.txt"), (b"\x7fELF\x02", "a.bin"), (b"#!/bin/sh\nrm -rf /", "a.txt"), (b"hello", "run.sh"),
                   (_zip([("a.exe", b"MZ")]), "a.zip"), (_zip([("a.txt", b"hi")], 0o755), "a.zip"), (_zip([("../a.txt", b"hi")]), "a.zip"),
                   (_zip([("a.txt", b"#!/usr/bin/env python")]), "a.zip"), (b"\xff\xfe\x00\x01binary", "a.dat")):
    check(fd.sniff(data, name)[0] is None, f"feed must refuse {name} {data[:6]!r}")
check(fd.sniff(b"%PDF-1.4 ...", "a.pdf")[0] == "application/pdf", "feed accepts pdf")
check(fd.sniff("Once upon a time…".encode(), "a.txt")[0].startswith("text/plain"), "feed accepts utf-8 text")
check(fd.sniff(_zip([("mimetype", b"application/epub+zip"), ("OEBPS/c1.xhtml", b"<p>hi</p>")]), "b.epub")[0] == "application/epub+zip", "feed accepts epub")
check(fd.sniff(_zip([("a.txt", b"hi"), ("b.pdf", b"%PDF-1.4")]), "c.zip")[0] == "application/zip", "feed accepts a zip of texts")
check(fd.MAX_BYTES == 100 * 1024 * 1024, "100 MB cap")
book = ("*** START OF THE PROJECT GUTENBERG EBOOK X ***\n" + "\n\n".join(
    [f"Chapter {i}. The white rabbit ran past Alice and the clock struck {i}. She followed it down the hole." for i in range(30)]
    + ["The Cheshire cat grinned and slowly vanished, leaving only the grin behind in the moonlight."]) + "\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\nlicense boilerplate")
data = book.encode()
man = {"id": "1-abc", "title": "Alice", "source_url": "https://x", "license": "Public domain", "issue_url": "https://i",
       "file": {"sha256": __import__("hashlib").sha256(data).hexdigest(), "mime": "text/plain; charset=utf-8"}}
idx = fd.build_index([(man, data)])
check(idx == fd.build_index([(man, data)]) and idx["scoring"]["n"] >= 2 and "boilerplate" not in _json.dumps(idx), "reading index deterministic, Gutenberg boilerplate stripped")
check(idx["label"] == "READ, NOT TRAINED (approved feed)" and "god core" in idx["policy"], "index carries the READ, NOT TRAINED policy")
top = fd.bm25(idx, "Did you see the cheshire cat grin?")
check(top and "Cheshire" in top[0]["text"], "bm25 retrieves the matching passage")
try:
    fd.build_index([(dict(man, file=dict(man["file"], sha256="0" * 64)), data)]); check(False, "sha mismatch must fail")
except ValueError:
    pass
with _tf.TemporaryDirectory() as td:
    old = fd.FEED; fd.FEED = Path(td)
    try:
        for st in ("inbox", "approved", "rejected"):
            (fd.FEED / st).mkdir()
        (fd.FEED / "inbox" / "7-aaa").mkdir(); (fd.FEED / "inbox" / "7-aaa" / "manifest.json").write_text(_json.dumps(dict(man, status="pending")))
        check(fd.counts() == {"pending": 1, "approved": 0, "rejected": 0}, "honest counts")
        check(fd.build_index([])["scoring"]["n"] == 0, "empty index")
        idx_items = [p for p in (fd.FEED / "approved").glob("*/manifest.json")]
        check(not idx_items, "pending items are never indexed")
        calls = []
        fd.comment = lambda *a: calls.append(("c",) + a[1:2]); fd.set_label = lambda *a: calls.append(("l",) + a)
        ev = {"comment": {"body": "/approve", "user": {"login": "someone"}, "author_association": "NONE"}, "issue": {"number": 7}}
        check(fd.command(ev, "NavisWORLD/NavisWORLD", None) == "refused: not the owner" and (fd.FEED / "inbox" / "7-aaa").exists(), "only NavisWORLD can approve")
        ev["comment"].update(user={"login": "NavisWORLD"}, author_association="COLLABORATOR")
        check(fd.command(ev, "NavisWORLD/NavisWORLD", None) == "refused: not the owner", "owner login must also be the OWNER association")
        ev["comment"].update(author_association="OWNER", body="please /approve")
        check(fd.command(ev, "NavisWORLD/NavisWORLD", None) == "skip: not a command", "command must start the comment")
        ev["comment"].update(body="/approve")
        check(fd.command(ev, "NavisWORLD/NavisWORLD", None) == "approved" and (fd.FEED / "approved" / "7-aaa" / "approval.json").exists(), "owner /approve moves it with a record")
        ap_ = _json.loads((fd.FEED / "approved" / "7-aaa" / "approval.json").read_text())
        check(ap_["training_eligible"] is False and ap_["grants"] == "READ at chat time only", "approval grants reading only")
    finally:
        fd.FEED = old
wf = (root / ".github" / "workflows" / "zeref-feed.yml").read_text()
check("git add -A zeref/feed assets/zeref-feed.svg assets/zeref-feed-mobile.svg" in wf and "${{ github.event.issue" not in wf.split("run:", 1)[1], "feed workflow commits only feed files; no event text in shell")
form_yml = (root / ".github" / "ISSUE_TEMPLATE" / "feed-zeref.yml").read_text()
check("I have the right to share this" in form_yml and "required: true" in form_yml and "Public domain" in form_yml, "Feed Zeref form")
check("import random" not in Path(fd.__file__).read_text() and "embedding" not in Path(fd.__file__).read_text().lower().replace("no embeddings", ""), "feed: no randomness, no embeddings")
check("const FEED = 'https://raw.githubusercontent.com/NavisWORLD/NavisWORLD/main/zeref/feed/status.json';" in js and "READ, NOT TRAINED" in js and "(approved feed)" in js, "Pages chat shows shelf counts and reading citations")

if fails:
    print("ZEREF SELFTEST FAILED"); [print(" -", f) for f in fails]; sys.exit(1)
print("ZEREF SELFTEST PASSED")
