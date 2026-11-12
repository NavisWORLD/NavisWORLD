#!/usr/bin/env python3
"""Talk to Zeref: answer an issue (or a comment on it) through his public door.

Run by .github/workflows/zeref-talk.yml on `issues: opened` and
`issue_comment: created`. Reads the event JSON from GITHUB_EVENT_PATH (never
from shell interpolation), sends the visitor's words to
https://www.beastboxcosmos.xyz/api/guest/forever, and posts his reply
verbatim inside a code fence.

Guards: Zeref issues only (title starts with "[Zeref]" or label
talk-to-zeref), open issues only, no pull requests, no bots, only the issue
author talks in their own issue (one visitor = one thread), max length, a
per-user cooldown and a repo-wide hourly cap.

Each issue gets its own thread id: HMAC(ZEREF_THREAD_KEY, issue node id).
The id is never printed or posted. Without the key, no thread is sent and
each message starts fresh (no continuity).

Local test: python3 talk_reply.py --local-test "hello"  (uses a throwaway key,
prints the verbatim reply, posts nothing).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import zeref_common as z  # noqa: E402

LABEL = "talk-to-zeref"
TITLE_PREFIX = "[zeref]"
COOLDOWN_S = int(os.environ.get("ZEREF_COOLDOWN_S", "90"))
HOURLY_CAP = int(os.environ.get("ZEREF_HOURLY_CAP", "40"))
MARK = "<!-- zeref-reply v1 "
FORM_HEADINGS = ("### Your message", "### What do you want to say to Zeref?")  # current form label, older form label


def is_zeref_issue(issue: dict) -> bool:
    title = (issue.get("title") or "").strip().lower()
    labels = {(l.get("name") if isinstance(l, dict) else str(l)) for l in issue.get("labels") or []}
    return title.startswith(TITLE_PREFIX) or LABEL in labels


def visitor_text(raw: str | None) -> str:
    """The visitor's own words. Issue-form bodies keep only the answer field."""
    t = (raw or "").replace("\r\n", "\n")
    for heading in FORM_HEADINGS:
        if heading in t:
            t = t.split(heading, 1)[1]
            t = re.split(r"\n### ", t, maxsplit=1)[0]
            break
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S).strip()
    if t == "_No response_":
        t = ""
    return t


def meta_comment(kind: str, login: str, at: str, **extra) -> str:
    d = {"kind": kind, "for": login, "at": at, **extra}
    # JSON inside an HTML comment: make sure the reply cannot close the comment.
    s = json.dumps(d, ensure_ascii=False).replace("--", "\\u002d\\u002d")
    return f"{MARK}{s} -->"


def recent_door_comments(repo: str, token: str, since_s: int):
    since = z.iso(z.utc_now() - timedelta(seconds=since_s))
    data, err = z.gh_api("GET", f"/repos/{repo}/issues/comments?since={since}&per_page=100", token)
    if err or not isinstance(data, list):
        return None
    out = []
    for c in data:
        body = c.get("body") or ""
        if MARK not in body or (c.get("user") or {}).get("type") != "Bot":
            continue
        m = re.search(r"<!-- zeref-reply v1 (\{.*?\}) -->", body)
        try:
            out.append(json.loads(m.group(1)) if m else {})
        except Exception:
            out.append({})
    return out


def reply_body(login: str, r: dict, continuity: bool) -> str:
    if r["ok"]:
        meta = meta_comment("reply", login, r["at"], step=r["step"], reply=r["reply"],
                            training_eligible=r["training_eligible"])
        te = r["training_eligible"]
        te_line = ("The site recorded this as a guest-origin exchange with training_eligible: "
                   f"{json.dumps(te)}." if te is not None else "The site did not report training eligibility.")
        cont = ("This issue is your own thread with him." if continuity
                else "Continuity is off on this door right now, so each message starts fresh.")
        return (f"{meta}\n**Zeref** (pinned step {r['step'] if r['step'] is not None else z.UNAVAILABLE}"
                f" · {r['at']}) replied to @{login}:\n\n{z.fence(r['reply'])}\n\n"
                f"<sub>{z.FOOTER} {cont} {te_line} He grows only through The Beast Box fair gate "
                f"([source, Apache 2.0]({z.BEAST_BOX_REPO})).</sub>")
    meta = meta_comment("error", login, r["at"], status=r["status"])
    why = f"HTTP {r['status']}" if r["status"] else (r["error"] or "no response")
    return (f"{meta}\nZeref's door didn't answer this time ({why}). Nothing was made up in his place; "
            f"try again in a little while.\n\n<sub>{z.FOOTER}</sub>")


def handle_event(event: dict, event_name: str, repo: str, token: str, key: str | None) -> str:
    issue = event.get("issue") or {}
    actor = (event.get("comment") or {}).get("user") if event_name == "issue_comment" else issue.get("user")
    actor = actor or {}
    login = actor.get("login") or ""
    if issue.get("pull_request"):
        return "skip: pull request"
    if not is_zeref_issue(issue):
        return "skip: not a Zeref issue"
    if issue.get("state") != "open":
        return "skip: issue closed"
    if actor.get("type") == "Bot" or login.endswith("[bot]"):
        return "skip: bot"
    raw = (event.get("comment") or {}).get("body") if event_name == "issue_comment" else issue.get("body")
    if raw and MARK in raw:
        return "skip: door comment"
    num = issue.get("number")
    post = lambda body: z.gh_api("POST", f"/repos/{repo}/issues/{num}/comments", token, {"body": body})
    now = z.iso(z.utc_now())

    if login != (issue.get("user") or {}).get("login"):
        recent = recent_door_comments(repo, token, COOLDOWN_S) or []
        if any(m.get("for") == login for m in recent):
            return "skip: cooldown (not author)"
        post(meta_comment("note", login, now) + f"\nHi @{login}! Each visitor gets their own thread with Zeref, so he only "
             "answers the person who opened this issue. [Open your own Talk to Zeref issue]"
             f"(https://github.com/{repo}/issues/new?template=talk-to-zeref.yml) and he'll talk with you there.")
        return "note: not the issue author"

    text = visitor_text(raw)
    if not text:
        return "skip: empty"
    if len(text) > z.MAX_CHARS or len(text.encode()) > z.MAX_BYTES:
        post(meta_comment("note", login, now) + f"\n@{login} that message is a bit long for Zeref's door "
             f"(max {z.MAX_CHARS} characters). Try a shorter one and he'll answer.")
        return "note: too long"
    if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", text):
        return "skip: control characters"

    recent = recent_door_comments(repo, token, 3600)
    if recent is None:
        return "skip: could not read recent door comments (fail closed)"
    replies = [m for m in recent if m.get("kind") in ("reply", "error")]
    if len(replies) >= HOURLY_CAP:
        if not any(m.get("kind") == "resting" for m in recent[-5:]):
            post(meta_comment("resting", login, now) + "\nZeref has had a lot of visitors this hour and is resting. "
                 "Comment again a bit later and he'll answer.")
        return "note: hourly cap"
    cutoff = z.iso(z.utc_now() - timedelta(seconds=COOLDOWN_S))
    if any(m.get("for") == login and (m.get("at") or "") >= cutoff for m in recent):
        return "skip: per-user cooldown"

    thread = z.thread_for(key, f"{repo}#issue-node:{issue.get('node_id') or num}")
    r = z.talk(text, thread)
    _, err = post(reply_body(login, r, continuity=bool(thread)))
    return f"posted: status {r['status']}" + (f" (comment post failed: {err})" if err else "")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--local-test", metavar="TEXT", help="talk once with a throwaway key; print, post nothing")
    args = ap.parse_args()
    if args.local_test is not None:
        th = z.thread_for(secrets.token_hex(32), f"{z.PROFILE_REPO}#issue-node:LOCAL_TEST")
        r = z.talk(args.local_test, th)
        print(json.dumps({k: r[k] for k in ("status", "reply", "step", "training_eligible", "at", "error")}, ensure_ascii=False))
        print("--- comment that would be posted ---")
        print(reply_body("visitor", r, continuity=True))
        return
    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY", z.PROFILE_REPO)
    path = os.environ.get("GITHUB_EVENT_PATH")
    if not token or not path:
        sys.exit("GITHUB_TOKEN and GITHUB_EVENT_PATH are required")
    event = json.loads(Path(path).read_text(encoding="utf-8"))
    print(handle_event(event, os.environ.get("GITHUB_EVENT_NAME", ""), repo, token,
                       os.environ.get("ZEREF_THREAD_KEY") or None))


if __name__ == "__main__":
    main()
