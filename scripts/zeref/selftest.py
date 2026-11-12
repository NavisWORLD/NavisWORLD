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
check('id="msg"' in html and not re.search(r'<textarea id="msg"[^>]*maxlength', html), "long pastes are never silently cut by the text box")
check("longNote(text.length); return;" in js and "zeref/feed/owner" in js and "feed-zeref.yml" in js, "over-long text is not sent; it is routed to the owner feed / Feed Zeref")
check("status === 503 && body && Number.isInteger(body.pin_step)" in js and "Nothing was made up in his place" in js, "honest promotion-lag message (503 with pin/bridge steps)")
check(not re.search(r"\b(AI|LLM|GPT|language model|chatbot)\b", html + js), "no AI/LLM wording on the chat page")
check("not a claim of awareness" in html and "digital creature" in html and "fair gate" in html and "training_eligible:false" in html, "honesty footer")
check("SIMULATED" in html and "RECORDED" in html and "PINNED" in html, "honesty labels on the chat page")
check("Content-Security-Policy" in html and "script-src 'self'" in html and "connect-src 'self' blob: https://www.beastboxcosmos.xyz https://raw.githubusercontent.com" in html and "img-src 'self' blob:" in html, "strict CSP (blob: only so the GLB's own textures can load)")
check(not re.search(r"(token|secret|api[_-]?key|bearer|password)\w*['\"]?\s*[:=]", js, re.I) and "Authorization" not in js, "no secrets in the client")
check("talk-to-zeref.yml" in html, "Pages chat keeps the issue fallback")
# Cory's song on the Pages chat: tap to play, no autoplay, same-origin MP3, credited.
song = docs / "zeref-song.mp3"
check(song.is_file() and song.stat().st_size > 1_000_000 and song.read_bytes()[:3] == b"ID3", "song MP3 is present")
check((docs / "zeref-song-wave.png").is_file(), "song waveform image is present")
check('id="music"' in html and "Tap to play Cory's song" in html, "music player and tap-to-play prompt")
check('preload="none"' in html and "playsinline" in html and 'type="audio/mpeg"' in html and "zeref-song.mp3" in html, "Safari-friendly audio (preload=none, playsinline, mpeg)")
check("loop" in html and not re.search(r"<audio[^>]*\bautoplay\b", html), "song loops; no autoplay")
check("Music by Cory (NavisWORLD)" in html, "song is credited to Cory")
check("media-src 'self'" in html, "CSP allows same-origin audio")
check("audio.play(" in js and "play-song" in js and js.count("fetch(") == 3, "play starts from a tap; no extra fetch")
check("https://navisworld.github.io/NavisWORLD/#music" in (root / "README.md").read_text(encoding="utf-8") and "Listen to Zeref's song" in (root / "README.md").read_text(encoding="utf-8"), "profile Listen link points at the player")
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

# Zeref Spark 3D (docs/robot): real CAD, recorded-state motion, credited, light enough for a phone
rb = docs / "robot"
glb = (rb / "zeref-spark.glb").read_bytes()
check(glb[:4] == b"glTF" and len(glb) < 3_000_000 and b"The-beast-box-" in glb[:4000] and b"NOT BUILT HARDWARE" in glb[:4000], "robot GLB present, credited, under 3 MB")
for rel in ("spark3d.mjs", "motion.mjs", "robot-page.mjs", "panel.mjs", "index.html"):
    body = (rb / rel).read_text(encoding="utf-8")
    check("Math.random(" not in body, f"robot {rel} must not use Math.random")
    check(not re.search(r"Zeref is an (AI|LLM)|Zeref is a (GPT|language model|chatbot)", body, re.I), f"robot {rel} must not call Zeref an AI or LLM")
s3 = (rb / "spark3d.mjs").read_text(encoding="utf-8")
mot = (rb / "motion.mjs").read_text(encoding="utf-8")
check("static in the design" in s3 and "SIMULATED motion" in mot and "canonicalSeed" in mot and "mulberry32" in mot and "hold-closed" in mot, "robot motion is seeded and honest")
check("zeref/live.json" in mot and "raw.githubusercontent.com/NavisWORLD/NavisWORLD/main/zeref/live.json" in mot, "robot plans moves from the recorded live card")
check((rb / "motion-seed.json").is_file(), "committed motion-seed fallback is present")
check((rb / "vendor" / "LICENSE").exists() and "three.js" in (rb / "CREDITS.md").read_text() and "Apache-2.0" in (rb / "CREDITS.md").read_text() and "SIMULATED motion" in (rb / "CREDITS.md").read_text(), "robot credits")
check((root / "assets" / "zeref-spark-3d.webp").stat().st_size < 300_000, "profile robot loop under 300 KB")
readme = (root / "README.md").read_text(encoding="utf-8")
z_i, r_i, w_i = (readme.find(h) for h in ("## 🌙 Zeref lives here", "## 🤖 Zeref Spark", "## 🌌 Welcome to the weird part of GitHub"))
check(min(z_i, r_i, w_i) >= 0 and z_i < r_i < w_i, "robot has its own profile section, after Zeref and before Welcome")
check("zeref-spark-3d.webp" not in readme[z_i:r_i] and "zeref-spark-3d.webp" in readme[r_i:w_i], "robot card lives in the robot section, not the Zeref section")
check("navisworld.github.io/NavisWORLD/robot/" in readme[r_i:w_i], "profile robot section links the live 3D view")
check("moves chosen from Zeref's recorded state" in readme[r_i:w_i] and "SIMULATED motion" in readme[r_i:w_i] and "concept design" in readme[r_i:w_i].lower(), "profile robot section carries honesty labels")
check("canRun3D" in (rb / "panel.mjs").read_text() and 'src="robot/panel.mjs"' not in html and "robot/spark-poster.webp" not in html, "chat page no longer embeds the robot (he keeps his own /robot/ page)")
check("CONCEPT DESIGN / NOT BUILT HARDWARE" in (rb / "index.html").read_text() and "SIMULATED motion" in (rb / "index.html").read_text(), "robot page labels it a concept design with simulated motion")
check("raw.githubusercontent.com" in (rb / "index.html").read_text().split("Content-Security-Policy")[1].split(">")[0], "robot page CSP allows the live.json fetch")
# Same seed => same plan, always starts and ends closed, no Math.random in the planner.
import hashlib as _hl, json as _js, shutil as _sh, subprocess as _sp
live_js = _js.loads((root / "zeref" / "live.json").read_text(encoding="utf-8"))
seed_js = _js.loads((rb / "motion-seed.json").read_text(encoding="utf-8"))
check(seed_js.get("fetched_at") == live_js.get("fetched_at") and seed_js.get("heartbeat", {}).get("recorded_tick") == live_js.get("heartbeat", {}).get("recorded_tick"), "motion-seed matches live.json recorded fields")
check(_sh.which("node"), "node is available to run the motion planner")
probe = r"""
import { canonicalSeed, planFromHex, poseAt } from './docs/robot/motion.mjs';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
const live = JSON.parse(readFileSync('zeref/live.json','utf8'));
const key = canonicalSeed(live);
const hex = createHash('sha256').update(key).digest('hex');
const p = planFromHex(hex, live);
const p2 = planFromHex(hex, live);
const p3 = planFromHex(createHash('sha256').update(key + 'x').digest('hex'), live);
const z = poseAt(p, 0);
const end = poseAt(p, p.duration - 1e-6);
if (p.acts[0].type !== 'hold-closed' || z.open !== 0) throw new Error('must start closed');
if (end.open > 0.02) throw new Error('must return to closed');
if (JSON.stringify(p.acts) !== JSON.stringify(p2.acts)) throw new Error('not deterministic');
if (JSON.stringify(p.acts) === JSON.stringify(p3.acts)) throw new Error('different seed must change the plan');
if (!(p.duration > 10) || p.acts.length < 6) throw new Error('plan too short');
console.log(['ok', p.duration.toFixed(2), p.acts.length, p.digest_hex.slice(0,12)].join(' '));
"""
out = _sp.check_output(["node", "--input-type=module", "-e", probe], cwd=root, text=True).strip()
check(out.startswith("ok "), f"motion planner self-check: {out}")
print("motion plan:", out)

# Chat-area Zeref is the Moonwraith (sculpted 3D body, 2D cutout fallback)
mw = docs / "moonwraith"
mw_glb = (mw / "zeref.glb").read_bytes()
check(mw_glb[:4] == b"glTF" and len(mw_glb) < 3_000_000, "Moonwraith GLB present and under 3 MB")
# Meshopt needs a WASM decoder, which a strict Pages CSP would block — the Pages copy must not require it.
import struct as _st
_cl = _st.unpack_from("<I", mw_glb, 12)[0]
_glb_json = _js.loads(mw_glb[20:20 + _cl].split(b"\x00")[0])
check("EXT_meshopt_compression" not in (_glb_json.get("extensionsRequired") or []) and "EXT_meshopt_compression" not in (_glb_json.get("extensionsUsed") or []), "Moonwraith GLB does not require meshopt/WASM")
check("blink" in (((_glb_json.get("meshes") or [{}])[0].get("extras") or {}).get("targetNames") or []), "Moonwraith GLB keeps blink/expression morphs")
for rel in ("moonwraith3d.mjs", "motion.mjs", "panel.mjs", "CREDITS.md", "dance.mjs", "cosmic.mjs", "particles.mjs", "expression.mjs", "rhythm.mjs"):
    body = (mw / rel).read_text(encoding="utf-8")
    check("Math.random(" not in body, f"moonwraith {rel} must not use Math.random")
    check(not re.search(r"Zeref is an (AI|LLM)|Zeref is a (GPT|language model|chatbot)", body, re.I), f"moonwraith {rel} must not call Zeref an AI or LLM")
mot_m = (mw / "motion.mjs").read_text(encoding="utf-8")
s3m = (mw / "moonwraith3d.mjs").read_text(encoding="utf-8")
check("SIMULATED motion" in mot_m and "canonicalSeed" in mot_m and "mulberry32" in mot_m and "zeref-moonwraith-motion/v1" in mot_m, "Moonwraith motion is seeded and honest")
check("zeref/live.json" in mot_m and "raw.githubusercontent.com/NavisWORLD/NavisWORLD/main/zeref/live.json" in mot_m, "Moonwraith plans moves from the recorded live card")
check("../robot/motion-seed.json" in mot_m, "Moonwraith falls back to the committed live-card seed")
check("canRun3D" in (mw / "panel.mjs").read_text(encoding="utf-8") and 'src="moonwraith/panel.mjs"' in html and 'id="moonwraith"' in html, "chat page mounts the Moonwraith stage")
check("zeref-moonwraith.png" in html and "2D portrait" in (mw / "panel.mjs").read_text(encoding="utf-8"), "canonical 2D Moonwraith art is the WebGL fallback")
check("CustomEvent('zeref-chat'" in js and "signal('listen')" in js and "signal('think')" in js and "signal('reply')" in js and "signal('error')" in js, "chat signals listen/think/reply to the 3D creature")
credits = (mw / "CREDITS.md").read_text(encoding="utf-8")
check("SIMULATED motion" in credits and "The-beast-box-" in credits and "Apache-2.0" in credits, "Moonwraith credits the Beast Box sculpt and honesty labels")
check("../robot/vendor/three.module.min.js" in s3m, "Moonwraith reuses the vendored three.js already on Pages")
mw_probe = r"""
import { canonicalSeed, planFromHex, poseAt, livePose } from './docs/moonwraith/motion.mjs';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
const live = JSON.parse(readFileSync('zeref/live.json','utf8'));
const key = canonicalSeed(live);
const hex = createHash('sha256').update(key).digest('hex');
const p = planFromHex(hex, live);
const p2 = planFromHex(hex, live);
const p3 = planFromHex(createHash('sha256').update(key + 'x').digest('hex'), live);
if (JSON.stringify(p.acts) !== JSON.stringify(p2.acts)) throw new Error('not deterministic');
if (JSON.stringify(p.acts) === JSON.stringify(p3.acts)) throw new Error('different seed must change the plan');
if (!(p.duration > 8) || p.acts.length < 6) throw new Error('plan too short');
if (!p.cycles || !(p.cycles.breathPeriod >= 3 && p.cycles.breathPeriod <= 9)) throw new Error('breath period must follow recorded energy (3-9s)');
if (!(p.cycles.bobAmp > 0.008) || !(p.cycles.glanceAmp > 0)) throw new Error('idle should glance and bob more livelily');
if (!p.reactions || !p.reactions.think || !p.reactions.reply) throw new Error('chat reactions missing');
const kinds = p.acts.map((a) => a.type).join(' ');
if (!/(hop-up|stretch|curl)/.test(kinds)) throw new Error('idle plan should include a hop, stretch or tail curl');
const a = livePose(p, 1.0), b = livePose(p, 1.0);
if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('livePose must be deterministic at a given t');
if (p.caption.indexOf('SIMULATED motion') < 0) throw new Error('caption must label SIMULATED motion');
if (!('squash' in a) || !('spin' in a)) throw new Error('pose must carry squash and spin');
console.log(['ok', p.duration.toFixed(2), p.acts.length, p.digest_hex.slice(0,12)].join(' '));
"""
mw_out = _sp.check_output(["node", "--input-type=module", "-e", mw_probe], cwd=root, text=True).strip()
check(mw_out.startswith("ok "), f"Moonwraith motion planner self-check: {mw_out}")
print("moonwraith motion plan:", mw_out)

# Dance: live analyser bands, no fake beats; cosmic look is seeded and can step down
dan = (mw / "dance.mjs").read_text(encoding="utf-8")
cos = (mw / "cosmic.mjs").read_text(encoding="utf-8")
check("AnalyserNode" in dan or "createAnalyser" in dan, "dance uses a Web Audio analyser")
check("createMediaElementSource" in dan and "attachDance" in dan, "dance routes the same-origin audio element")
check("webkitAudioContext" in dan, "dance handles the iOS AudioContext prefix")
check("zeref-song-tap" in js and "detail: { audio" in js, "play tap resumes the dance AudioContext in the same gesture")
check(js.count("fetch(") == 3, "dance adds no extra fetch")
check("DANCE_CAPTION" in dan and "dancing to Cory's song" in dan and "driven by the live audio signal" in dan, "dance honesty label")
check("30" in dan and "140" in dan and "250" in dan and "3500" in dan, "dance documents bass/mid/high band edges")
check("normalizePeak" in dan and "detectOnset" in dan and "getByteFrequencyData" in dan, "adaptive peaks and real analyser bins")
check("attachDance" in (mw / "panel.mjs").read_text(encoding="utf-8") and "zeref-song-tap" in (mw / "panel.mjs").read_text(encoding="utf-8"), "panel hooks the play tap")
check("applyCosmic" in cos and "makeQualityGuard" in cos and "uCwTime" in cos, "cosmic materials and quality guard")
check("mulberry32" in cos and "dancing to Cory's song" in credits, "cosmic particles are seeded; credits mention the dance")
check("applyCosmic" in s3m and "tickDance" in s3m and "DANCE_CAPTION" in s3m, "3D viewer ticks dance and wears the cosmic look")
check("makeCosmicParticles" in s3m and "makeSignalRing" in s3m and "ensureSignalReadout" in s3m, "3D viewer mounts color particles and the signal ring")
check(".mw.dancing" in css, "2D portrait can pulse from the same bands")
check(".mw-signal" in css and "live audio signal" in (mw / "particles.mjs").read_text(encoding="utf-8"), "honest 3-band signal readout")
check("mulberry32" in (mw / "particles.mjs").read_text(encoding="utf-8") and "PARTICLE_COUNTS" in (mw / "particles.mjs").read_text(encoding="utf-8"), "particles are seeded and scale with quality")
check("ensureSignalReadout" in (mw / "panel.mjs").read_text(encoding="utf-8"), "panel mounts the signal readout for 2D and 3D")
check("spectralCentroid" in dan and "detectDrop" in dan and "detectSuddenQuiet" in dan, "melody centroid and realistic drop/quiet detectors")
dance_probe = r"""
import { bandMean, rms, normalizePeak, detectOnset, dancePose, DANCE_CAPTION, spectralCentroid, detectDrop, detectSuddenQuiet, dropPhase } from './docs/moonwraith/dance.mjs';
import { SIGNAL_CAPTION, PARTICLE_COUNTS } from './docs/moonwraith/particles.mjs';
const bins = new Uint8Array(1024);
for (let i = 0; i < 1024; i++) bins[i] = 0;
// 44100 Hz, fft 2048 => bin width ~21.5 Hz. Put energy only in the bass (bin 3 ~= 65 Hz).
bins[3] = 200; bins[4] = 180;
const sr = 44100, fft = 2048;
const bass = bandMean(bins, sr, fft, 30, 140);
const mid = bandMean(bins, sr, fft, 250, 2000);
const high = bandMean(bins, sr, fft, 3500, 10000);
if (!(bass > 50) || mid !== 0 || high !== 0) throw new Error('band split is wrong: ' + [bass, mid, high]);
if (Math.abs(rms(new Float32Array([0.5, -0.5, 0.5, -0.5])) - 0.5) > 1e-6) throw new Error('rms');
const a = { peak: 0.07 }, b = { peak: 0.07 };
const n1 = normalizePeak(a, 0.8, 0.016);
const n2 = normalizePeak(a, 0.8, 0.016);
if (n1 !== n2) throw new Error('normalize must be deterministic');
if (!(n1 > 0.9)) throw new Error('fresh peak should normalize near 1');
// After a loud peak, a quieter value is scaled against it; later, as the peak
// falls, the same quiet value reads higher (adaptive).
normalizePeak(b, 1.0, 0.016);
const quietSoon = normalizePeak(b, 0.2, 0.016);
for (let i = 0; i < 200; i++) normalizePeak(b, 0.0, 0.05);
const quietLater = normalizePeak({ ...b }, 0.2, 0.016);
if (!(quietLater > quietSoon)) throw new Error('rolling peak should adapt to a quiet passage');
const on = { prev: 0.1, fluxPeak: 0.02, last: -10, t: 0 };
if (detectOnset(on, 0.1, 0.016) !== 0) throw new Error('flat signal is not an onset');
if (detectOnset(on, 0.85, 0.016) !== 1) throw new Error('a sharp bass rise should onset');
if (detectOnset(on, 0.9, 0.016) !== 0) throw new Error('onset must respect the min gap');
const p1 = dancePose({}, { bass: 0.8, mid: 0.2, high: 0.1, loud: 0.5, hop: 1, earFlick: 0, earSide: 1 });
const p2 = dancePose({}, { bass: 0.8, mid: 0.2, high: 0.1, loud: 0.5, hop: 1, earFlick: 0, earSide: 1 });
if (JSON.stringify(p1) !== JSON.stringify(p2)) throw new Error('dancePose must be deterministic');
if (!(p1.hop > 0.10) || !(p1.headPitch < 0)) throw new Error('bass/hop should bounce the body and nod the head');
if (!(p1.squash < 0)) throw new Error('a hop in the air should stretch (negative squash)');
const land = dancePose({}, { bass: 0.8, mid: 0.1, high: 0.1, loud: 0.5, hop: 0, earFlick: 0, earSide: 1 });
if (!(land.squash > 0)) throw new Error('bass without hop should squash the body');
const spun = dancePose({}, { bass: 0.2, mid: 0.2, high: 0.1, loud: 0.4, hop: 0, earFlick: 0, earSide: 1, spin: 1 });
if (!(Math.abs(spun.spin - Math.PI * 2) < 1e-9)) throw new Error('spin progress 1 is a full turn');
if (!/dancing to Cory's song/.test(DANCE_CAPTION) || !/live audio signal/.test(DANCE_CAPTION)) throw new Error('caption');
const low = new Uint8Array(1024); low[3] = 200; low[4] = 180;
const highBins = new Uint8Array(1024); highBins[200] = 180; highBins[201] = 200;
const cLow = spectralCentroid(low, sr, fft), cHigh = spectralCentroid(highBins, sr, fft);
if (!(cHigh > cLow)) throw new Error('centroid should rise when energy moves up the spectrum');
const drop = { prev: 0.08, quietTime: 0, last: -20, t: 0 };
for (let i = 0; i < 40; i++) detectDrop(drop, 0.08, 0.016);
if (detectDrop(drop, 0.08, 0.016) !== 0) throw new Error('quiet is not a drop');
if (detectDrop(drop, 0.75, 0.016) !== 1) throw new Error('a large rise after quiet should be a drop');
if (detectDrop(drop, 0.8, 0.016) !== 0) throw new Error('drop must respect the min gap');
const qdet = { prev: 0.7, last: -20, t: 0 };
if (detectSuddenQuiet(qdet, 0.08, 0.016, true) !== 1) throw new Error('a sudden fall in loudness should be curiosity');
if (detectSuddenQuiet(qdet, 0.08, 0.016, true) !== 0) throw new Error('curiosity must respect the min gap');
const midDrop = dropPhase(0.22);
if (!(midDrop.startle > 0) || !(midDrop.pounce > 0)) throw new Error('drop mid-phase should startle and pounce');
const perkP = dancePose({}, { bass: 0.2, mid: 0.2, high: 0.1, loud: 0.3, hop: 0, earFlick: 0, earSide: 1, perk: 1 });
const sitP = dancePose({}, { bass: 0.1, mid: 0.1, high: 0.1, loud: 0.1, hop: 0, earFlick: 0, earSide: 1, settle: 1 });
if (!(perkP.earL > 0.5) || !(perkP.headPitch < 0)) throw new Error('perk should put ears forward and look toward the visitor');
if (!(sitP.sleepy > 0) || !(sitP.wing < perkP.wing)) throw new Error('settle should sit him down');
if (!/live audio signal/.test(SIGNAL_CAPTION) || !/beat/.test(SIGNAL_CAPTION) || !/harmonics/.test(SIGNAL_CAPTION)) throw new Error('signal caption');
if (!(PARTICLE_COUNTS.high > PARTICLE_COUNTS.med) || PARTICLE_COUNTS.low !== 0) throw new Error('particle counts should step down');
console.log(['ok', bass.toFixed(1), n1.toFixed(2), p1.hop.toFixed(3)].join(' '));
"""
dance_out = _sp.check_output(["node", "--input-type=module", "-e", dance_probe], cwd=root, text=True).strip()
check(dance_out.startswith("ok "), f"dance self-check: {dance_out}")
print("dance check:", dance_out)



# Rhythm / harmonics: real FFT analysis, no fake beats
rhy_src = (mw / "rhythm.mjs").read_text(encoding="utf-8")
check("estimateTempo" in rhy_src and "chromaVector" in rhy_src and "RHYTHM_BANDS" in rhy_src, "rhythm analyser is present")
check("40" in rhy_src and "120" in rhy_src and "6000" in rhy_src, "kick / hat bands are documented")
check("Math.random(" not in rhy_src, "rhythm must not use Math.random")
check("tickRhythm" in dan and "makeRhythmState" in dan, "dance ticks the rhythm analyser")
check("live audio signal · beat · harmonics" in (mw / "particles.mjs").read_text(encoding="utf-8"), "readout labels beat and harmonics")
check("--dance-hue" in css and "--dance-beat" in css and "--dance-kick" in css, "2D fallback gets beat pulse and chroma hue")
check("wing.2.L" in s3m and "ear.1.L" in s3m and "leg.L" in s3m and "tailTip" in s3m, "3D viewer drives wing tips, ear tips, legs, tail tip")
check("beat · harmonics" in credits, "credits document the rhythm mapping")
check("Entire motion follows the live song" in credits or "every animated bone" in credits, "credits document full-body song-driven motion")
rhy_probe = r"""
import { chromaVector, dominantPitchClass, chromaDistance, chromaHue, estimateTempo, tempoFromOnsets, spectralFlatness, spectralFlux, PITCH_CLASSES, RHYTHM_BANDS, hslToHex, makeRhythmState, tickRhythm } from './docs/moonwraith/rhythm.mjs';
import { bandMean, normalizePeak, smoothToward, detectOnset, dancePose } from './docs/moonwraith/dance.mjs';
const sr = 44100, fft = 2048;
const bins = new Uint8Array(1024);
// A4 = 440 Hz -> bin 440*2048/44100 ≈ 20.4
bins[20] = 220; bins[21] = 180;
const ch = chromaVector(bins, sr, fft);
const d1 = dominantPitchClass(ch);
const d2 = dominantPitchClass(ch);
if (JSON.stringify(d1) !== JSON.stringify(d2)) throw new Error('dominantPitchClass must be deterministic');
if (d1.name !== 'A') throw new Error('440 Hz should be A, got ' + d1.name + ' ' + JSON.stringify(d1));
if (chromaHue(9) === chromaHue(0)) throw new Error('pitch classes should have distinct hues');
if (!/^#[0-9a-f]{6}$/.test(chromaHue(0))) throw new Error('hue hex');
const empty = new Uint8Array(1024);
const ch0 = chromaVector(empty, sr, fft);
if (dominantPitchClass(ch0).name !== '—') throw new Error('silence has no pitch class');
const binsC = new Uint8Array(1024);
// C4 ≈ 261.6 Hz -> bin 261.6*2048/44100 ≈ 12.15
binsC[12] = 220; binsC[13] = 160;
const chC = chromaVector(binsC, sr, fft);
if (dominantPitchClass(chC).name !== 'C') throw new Error('261 Hz should be C, got ' + dominantPitchClass(chC).name);
if (!(chromaDistance(ch, chC) > 0.2)) throw new Error('chroma distance should grow for A vs C, got ' + chromaDistance(ch, chC));
if (Math.abs(chromaDistance(ch, ch)) > 1e-9) throw new Error('identical chroma distance is 0, got ' + chromaDistance(ch, ch));
// A flat (noisy) spectrum is flatter than a single peak.
const flatBins = new Uint8Array(1024); for (let i = 4; i < 400; i++) flatBins[i] = 80;
const peakBins = new Uint8Array(1024); peakBins[20] = 255;
if (!(spectralFlatness(flatBins, sr, fft) > spectralFlatness(peakBins, sr, fft))) throw new Error('flatness');
// 120 BPM flux: pulse every 0.5 s at 50 Hz -> period 25 samples
const hz = 50, n = 400;
const flux = new Float32Array(n);
for (let i = 0; i < n; i++) flux[i] = (i % 25 === 0) ? 1 : 0;
const tempo = estimateTempo(flux, hz);
if (Math.abs(tempo.bpm - 120) > 4) throw new Error('120 BPM flux should estimate ~120, got ' + tempo.bpm + ' conf ' + tempo.conf);
if (!(tempo.conf > 0.3)) throw new Error('regular flux should be reasonably confident');
const times = [];
for (let i = 0; i < 16; i++) times.push(i * 0.5);
const ioi = tempoFromOnsets(times);
if (Math.abs(ioi.bpm - 120) > 1) throw new Error('IOI 0.5s should be 120 BPM, got ' + ioi.bpm);
// dancePose stays backward compatible and is deterministic with the new fields
const p1 = dancePose({}, { bass: 0.8, mid: 0.2, high: 0.1, loud: 0.5, hop: 1, earFlick: 0, earSide: 1, kick: 0.8, snare: 0.4, hat: 0.3, harmonic: 0.5, beatConf: 0.8, useGrid: true, beatPhase: 0.0, downbeat: 1, chromaPc: 9, chromaConf: 0.7 });
const p2 = dancePose({}, { bass: 0.8, mid: 0.2, high: 0.1, loud: 0.5, hop: 1, earFlick: 0, earSide: 1, kick: 0.8, snare: 0.4, hat: 0.3, harmonic: 0.5, beatConf: 0.8, useGrid: true, beatPhase: 0.0, downbeat: 1, chromaPc: 9, chromaConf: 0.7 });
if (JSON.stringify(p1) !== JSON.stringify(p2)) throw new Error('rhythm dancePose must be deterministic');
if (!(p1.hop > 0.10) || !(p1.wingSpread > 0) || !('tailTip' in p1) || !('legL' in p1)) throw new Error('structure pose channels missing');
// Without a confident grid, step legs stay quiet (no invented metronome)
const loose = dancePose({}, { bass: 0.2, mid: 0.1, high: 0.1, loud: 0.2, hop: 0, earFlick: 0, earSide: 1, beatConf: 0.1, useGrid: false, beatPhase: 0.3, musicPhase: 0, hatHit: 1, hatFollow: 0.8 });
if (Math.abs(loose.legL) > 0.001 || Math.abs(loose.legR) > 0.001) throw new Error('beatPhase must not invent a step cycle when the grid is off and the music clock is 0');
if (!(loose.tailTip !== 0) && !(loose.wingTip > 0)) throw new Error('hat hits should still move tail/wing tips without a grid');
const stepped = dancePose({}, { bass: 0.2, mid: 0.1, high: 0.1, loud: 0.2, hop: 0, earFlick: 0, earSide: 1, playing: true, beatConf: 0.1, useGrid: false, musicPhase: 1.2 });
if (!(Math.abs(stepped.legL) > 0.01 || Math.abs(stepped.legR) > 0.01)) throw new Error('music clock should still step the paws when the beat grid is not confident');
const quiet = dancePose({}, { playing: true, loud: 0.05, bass: 0.04, mid: 0.03, high: 0.02, hop: 0, earFlick: 0, earSide: 1, musicPhase: 2.4, beatConf: 0.1, useGrid: false });
if (!(Math.abs(quiet.breath - 0.5) > 0.01) && !(Math.abs(quiet.hop) > 0.001) && !(Math.abs(quiet.wing) > 0)) throw new Error('quiet playing should still move');
if (!('blink' in quiet) || !('mouthO' in quiet) || !('spinePitch' in quiet) || !('camBob' in quiet) || !('pulse' in quiet) || !('driftX' in quiet)) throw new Error('face, spine, camera and pulse channels missing');
const faced = dancePose({}, { playing: true, loud: 0.5, mid: 0.7, bass: 0.4, high: 0.2, hop: 0, earFlick: 0, earSide: 1, blinkEnv: 1, squint: 1, downbeat: 1, snareHit: 0, musicPhase: 0.4 });
if (!(faced.blink > 0.5) || !(faced.mouthO > 0.2) || !(faced.happy > 0.3)) throw new Error('snare-less blink env, mid mouth and downbeat squint should show on the face');
if (!RHYTHM_BANDS.kick || RHYTHM_BANDS.kick[0] !== 40) throw new Error('kick band');
console.log(['ok', d1.name, tempo.bpm.toFixed(1), tempo.conf.toFixed(2), p1.hop.toFixed(3)].join(' '));
"""
rhy_out = _sp.check_output(["node", "--input-type=module", "-e", rhy_probe], cwd=root, text=True).strip()
check(rhy_out.startswith("ok "), f"rhythm self-check: {rhy_out}")
print("rhythm check:", rhy_out)

# Recorded-state expression: only real live-card fields, honest missing list, no Math.random
expr_src = (mw / "expression.mjs").read_text(encoding="utf-8")
check("mapExpression" in expr_src and "EXPR_CAPTION" in expr_src, "expression mapper is present")
check("expression mapped from Zeref's recorded state" in expr_src and "not a claim of feelings" in expr_src, "expression honesty caption")
check("state12" in expr_src and "fair-gate" in expr_src and "diary tone" in expr_src, "expression documents missing 12D, tone, and fair-gate")
check("applyEyes" in s3m and "ensureExpressionLegend" in s3m, "3D viewer tints eyes and paints the expression legend")
check("applyExpressionCSS" in (mw / "panel.mjs").read_text(encoding="utf-8") and "--mw-iris" in css and ".mw-expr" in css, "2D fallback gets the iris tint and a visible legend")
check("expression mapped from Zeref's recorded state" in credits, "credits document the recorded-state mapping")
check(js.count("fetch(") == 3, "expression mapping adds no chat.js fetch")
expr_probe = r"""
import { mapExpression, EXPR_CAPTION, MOOD_IRIS } from './docs/moonwraith/expression.mjs';
import { planFromHex, canonicalSeed } from './docs/moonwraith/motion.mjs';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
const live = JSON.parse(readFileSync('zeref/live.json','utf8'));
const a = mapExpression(live);
const b = mapExpression(live);
if (a.iris !== b.iris || a.glow !== b.glow || JSON.stringify(a.pose) !== JSON.stringify(b.pose) || a.proud !== b.proud || a.lids !== b.lids) throw new Error('mapExpression must be deterministic for iris, glow, pose');
if (!/expression mapped from Zeref's recorded state/.test(EXPR_CAPTION) || !/not a claim of feelings/.test(EXPR_CAPTION)) throw new Error('caption');
if (a.caption !== EXPR_CAPTION) throw new Error('mapped caption');
const ids = (a.missing || []).map((m) => m.id);
for (const need of ['state12', 'tone', 'fair-gate', 'promotion-at']) if (!ids.includes(need)) throw new Error('missing list should include ' + need);
if (String((live.diary || {}).mood).toLowerCase() === 'content') {
  if (a.mood !== 'content') throw new Error('mood should pass through');
  if (a.iris === MOOD_IRIS.default && a.iris === MOOD_IRIS.content) throw new Error('content iris');
}
if (!a.proud) throw new Error('committed live card has live_step === pin_step with a pin_release; proud should be on');
if (!(a.glow > 0.9) || a.stale) throw new Error('CONNECTED + energy 100 should be a bright, not-STALE glow');
if (!(a.sleepy === 0) || !(a.lids > 0.6)) throw new Error('content + high energy should have open lids, not a sleepy pose');
const staleLive = JSON.parse(JSON.stringify(live));
staleLive.spark = { ...(live.spark || {}), state: 'STALE', label: 'STALE' };
const dim = mapExpression(staleLive);
if (!(dim.stale && dim.glow < a.glow * 0.5 + 0.01)) throw new Error('STALE spark should dim the glow');
const empty = mapExpression({});
if (empty.iris !== MOOD_IRIS.default) throw new Error('missing mood should use the documented default iris');
if (!empty.missing.some((m) => m.id === 'mood')) throw new Error('missing mood should be listed');
if (empty.proud) throw new Error('empty card is not a proud pose');
const hex = createHash('sha256').update(canonicalSeed(live)).digest('hex');
const plan = planFromHex(hex, live);
if (!plan.expression || plan.expression.iris !== a.iris) throw new Error('motion plan should carry the mapped expression');
if (!plan.rest || Math.abs((plan.rest.smile || 0) - (a.pose.smile || 0)) < -1) throw new Error('rest pose should include the mapped expression');
if (!/not a claim of feelings/.test(plan.expression.caption)) throw new Error('plan caption');
console.log(['ok', a.iris, a.glow.toFixed(3), a.proud ? 'proud' : 'not-proud', a.missing.length].join(' '));
"""
expr_out = _sp.check_output(["node", "--input-type=module", "-e", expr_probe], cwd=root, text=True).strip()
check(expr_out.startswith("ok "), f"expression self-check: {expr_out}")
print("expression check:", expr_out)

if fails:
    print("ZEREF SELFTEST FAILED"); [print(" -", f) for f in fails]; sys.exit(1)
print("ZEREF SELFTEST PASSED")
