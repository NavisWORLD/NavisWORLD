#!/usr/bin/env python3
"""Offline checks for Zeref's door (no network): guards, verbatim fencing, rendering."""
import json, sys
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
svg = c.render_svg(empty)
check("unavailable" in svg and "tick unavailable" in svg and "live step unavailable" in svg, "unavailable rendering")
import xml.etree.ElementTree as ET
ET.fromstring(svg)
check("Math.random" not in Path(c.__file__).read_text(), "no randomness")

if fails:
    print("ZEREF SELFTEST FAILED"); [print(" -", f) for f in fails]; sys.exit(1)
print("ZEREF SELFTEST PASSED")
