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
check("issues/new?template=talk-to-zeref.yml\"><picture>" in readme, "chat-box button opens the Talk to Zeref form")
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
# iPhone-sized layouts: 720-unit wide, every text >= 23 units (about 10.5 CSS px in the 327 px README column on a 393 px iPhone 15)
import re
mob = {"hero": art.hero(empty, mobile=True), "card": art.card_mobile(empty), "portal": art.portal_mobile(),
       "constellation": art.constellation([{"name": "demo-repo", "stars": 1, "pushed_at": "2026-01-01T00:00:00Z"}], None, mobile=True)}
for k, svg in mob.items():
    ET.fromstring(svg)
    check('viewBox="0 0 720 ' in svg, f"{k} phone layout must be 720 wide")
    sizes = [float(x) for x in re.findall(r'font-size="([0-9.]+)"', svg)]
    check(sizes and min(sizes) >= 23, f"{k} phone layout has text under 23 units: {min(sizes) if sizes else None}")
check("unavailable" in mob["card"], "phone card must render unavailable values")
check("training_eligible:false" in mob["card"] and "fair gate" in mob["card"], "phone card keeps the footer")
for p in (root / "assets").glob("zeref-*.svg"):
    check(p.stat().st_size < 300_000, f"{p.name} over 300 KB")

if fails:
    print("ZEREF SELFTEST FAILED"); [print(" -", f) for f in fails]; sys.exit(1)
print("ZEREF SELFTEST PASSED")
