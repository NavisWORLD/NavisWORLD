"""Shared helpers for Zeref's little home on the NavisWORLD profile.

Standard library only. Everything here reads real public sources; when a
fetch fails the caller gets an error string and shows "unavailable" rather
than a guessed value. Nothing in this module prints secrets or thread ids.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

SITE = "https://www.beastboxcosmos.xyz"
WORLD_LIVE = SITE + "/api/world/live"
TALK = SITE + "/api/guest/forever"
DIARY_LATEST = "https://raw.githubusercontent.com/NavisWORLD/The-beast-box-/zeref-diary/zeref/latest.json"
PIN_JSON = "https://raw.githubusercontent.com/NavisWORLD/The-beast-box-/main/apps/beastbox-cloud/lib/rawrphos-public-pin.json"
BEAST_BOX_REPO = "https://github.com/NavisWORLD/The-beast-box-"
PROFILE_REPO = "NavisWORLD/NavisWORLD"
USER_AGENT = "NavisWORLD-profile-zeref-door/1 (+https://github.com/NavisWORLD/NavisWORLD)"

# The door's own limits. The site accepts up to 1800 characters, but only
# messages within 1200 UTF-8 bytes carry his continuity context, so the
# door stays under that.
MAX_CHARS = 1000
MAX_BYTES = 1200

FOOTER = ("Zeref is a young digital creature still learning; replies are his own, unedited. "
          "Not a claim of awareness.")
UNAVAILABLE = "unavailable"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_json(url: str, timeout: float = 30, headers: dict | None = None, max_bytes: int = 2_000_000):
    """Return (data, error). error is a short string like 'HTTP 503' or None."""
    h = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    h.update(headers or {})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
            raw = r.read(max_bytes + 1)
            if len(raw) > max_bytes:
                return None, "response too large"
            return json.loads(raw), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}"
    except Exception as e:  # network, timeout, bad JSON
        return None, type(e).__name__


def thread_for(key: str | None, scope: str) -> str | None:
    """A 32-hex forever-door thread id derived from the issue (or explore scope).

    HMAC with a repo secret so the id is tied to this one issue yet cannot be
    computed by anyone reading the public issue. Without a key, no thread is
    sent and the site mints a fresh one per message (no continuity).
    The returned value must never be printed or posted.
    """
    if not key:
        return None
    return hmac.new(key.encode(), ("navisworld-profile-door:" + scope).encode(), hashlib.sha256).hexdigest()[:32]


def talk(text: str, thread: str | None, timeout: float = 90, max_429_wait: int = 60) -> dict:
    """Send one message through the public forever door, exactly like the site does.

    Returns {"ok", "status", "reply", "step", "training_eligible", "error", "at"}.
    The reply is returned verbatim; nothing here edits it.
    """
    body = {"provider": "rawrphos-local", "text": text}
    if thread:
        body["thread"] = thread
    data = json.dumps(body).encode()
    waited = 0
    while True:
        at = iso(utc_now())
        req = urllib.request.Request(TALK, data=data, method="POST", headers={
            "Content-Type": "application/json", "Origin": SITE, "User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                d = json.loads(r.read(200_000))
                status = r.status
        except urllib.error.HTTPError as e:
            status = e.code
            try:
                d = json.loads(e.read(4000))
            except Exception:
                d = {}
            if status == 429 and waited < max_429_wait:
                ra = e.headers.get("Retry-After")
                w = int(ra) if ra and ra.isdigit() else int(d.get("retry_after_seconds") or 30)
                w = max(1, min(w, max_429_wait - waited))
                waited += w
                time.sleep(w)
                continue
            return {"ok": False, "status": status, "reply": None, "step": None,
                    "training_eligible": None, "error": str(d.get("error") or "")[:200], "at": at}
        except Exception as e:
            return {"ok": False, "status": None, "reply": None, "step": None,
                    "training_eligible": None, "error": type(e).__name__, "at": at}
        reply = d.get("reply")
        gt = d.get("guest_thread") if isinstance(d.get("guest_thread"), dict) else {}
        return {"ok": isinstance(reply, str), "status": status, "reply": reply if isinstance(reply, str) else None,
                "step": d.get("step"), "training_eligible": gt.get("training_eligible"),
                "error": None if isinstance(reply, str) else "no reply in response", "at": at}


def fence(text: str) -> str:
    """Wrap text verbatim in a code fence longer than any backtick run inside it.

    Keeps the reply byte-for-byte while stopping markdown, @mentions and links
    in it from rendering or pinging anyone.
    """
    longest = run = 0
    for ch in text:
        run = run + 1 if ch == "`" else 0
        longest = max(longest, run)
    f = "`" * max(3, longest + 1)
    return f"{f}text\n{text}\n{f}"


def gh_api(method: str, path: str, token: str | None, payload=None, timeout: float = 30):
    """Minimal GitHub REST call. Returns (data, error)."""
    url = path if path.startswith("https://") else "https://api.github.com" + path
    h = {"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        h["Authorization"] = "Bearer " + token
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        h["Content-Type"] = "application/json"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=h), timeout=timeout) as r:
            raw = r.read()
            return (json.loads(raw) if raw else {}), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}"
    except Exception as e:
        return None, type(e).__name__
