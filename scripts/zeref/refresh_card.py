#!/usr/bin/env python3
"""Redraw Zeref's live profile card from his real public feeds.

Writes ONLY zeref/live.json and assets/zeref-{live,hero,portal,divider}.svg (or into --out for a
dry run). Every value comes from a fetch made in this run; a failed fetch
shows "unavailable". No randomness, no invented numbers.

Sources:
  - https://www.beastboxcosmos.xyz/api/world/live   (heartbeat, spark, brain)
  - The-beast-box- zeref-diary branch zeref/latest.json (diary tick, mood)
  - The-beast-box- main rawrphos-public-pin.json      (pinned step)
  - Zeref's last reply: newest of his talk-door comments on this repo's
    issues and the verbatim line in zeref/explore.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

sys.path.insert(0, str(Path(__file__).resolve().parent))
import zeref_common as z  # noqa: E402
import cosmic_art as art  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
META_RE = re.compile(r"<!-- zeref-reply v1 (\{.*?\}) -->")


def dig(d, *keys):
    for k in keys:
        if not isinstance(d, dict) or k not in d:
            return None
        d = d[k]
    return d


def last_said_from_issues(token: str | None):
    """Newest verbatim reply Zeref posted through the talk door, or None."""
    data, err = z.gh_api("GET", f"/repos/{z.PROFILE_REPO}/issues/comments?sort=created&direction=desc&per_page=50", token)
    if err or not isinstance(data, list):
        return None, err or "bad response"
    for c in data:
        body = c.get("body") or ""
        m = META_RE.search(body)
        if not m or dig(c, "user", "type") != "Bot":
            continue
        try:
            meta = json.loads(m.group(1))
        except Exception:
            continue
        if meta.get("kind") != "reply" or not isinstance(meta.get("reply"), str):
            continue
        return {"text": meta["reply"], "at": meta.get("at"), "step": meta.get("step"),
                "where": c.get("html_url"), "source": "talk door (issue comment)"}, None
    return None, None


def last_said_from_explore():
    p = ROOT / "zeref" / "explore.json"
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None
    a = d.get("asked")
    if isinstance(a, dict) and isinstance(a.get("reply"), str):
        return {"text": a["reply"], "at": a.get("at"), "step": a.get("step"),
                "where": "zeref/notes.md", "source": "exploring GitHub (zeref/notes.md)"}
    return None


def collect(token: str | None) -> dict:
    now = z.iso(z.utc_now())
    live, live_err = z.get_json(z.WORLD_LIVE)
    diary, diary_err = z.get_json(z.DIARY_LATEST)
    pin, pin_err = z.get_json(z.PIN_JSON)
    said_issue, said_err = last_said_from_issues(token)
    said_explore = last_said_from_explore()
    said = max([s for s in (said_issue, said_explore) if s and s.get("at")], key=lambda s: s["at"], default=None)

    links = dig(live, "links") or {}
    recent = (dig(diary, "recent") or [None])[0] or {}
    out = {
        "schema": "navisworld-zeref-live-card/v1",
        "fetched_at": now,
        "sources": {
            "world_live": {"url": z.WORLD_LIVE, "error": live_err},
            "diary": {"url": z.DIARY_LATEST, "error": diary_err},
            "pin": {"url": z.PIN_JSON, "error": pin_err},
            "last_said": {"error": said_err},
        },
        "heartbeat": {
            "state": dig(links, "liveTick", "state"),
            "label": dig(links, "liveTick", "label"),
            "recorded_tick": dig(links, "liveTick", "recorded_tick"),
            "xp_live": dig(links, "liveTick", "xp_live"),
            "signals": dig(links, "liveTick", "signals"),
        },
        "diary": {
            "label": dig(links, "diary", "label"),
            "tick": dig(diary, "tick"),
            "stage_name": dig(diary, "stage_name"),
            "mood": recent.get("mood"),
            "place": recent.get("place"),
            "last_tick_at": dig(diary, "last_tick_at"),
            "seed_label": dig(diary, "labels", "seed"),
        },
        "spark": {
            "state": dig(links, "spark", "state"),
            "source": dig(links, "spark", "source"),
            "label": dig(links, "spark", "label"),
            "tick": dig(links, "spark", "tick"),
        },
        "brain": {
            "label": dig(links, "brain", "label"),
            "live_step": dig(links, "brain", "step"),
            "live_sha_prefix": dig(links, "brain", "checkpoint_sha256_prefix"),
            "pin_step": dig(pin, "training_steps"),
            "pin_sha_prefix": (dig(pin, "checkpoint_sha256") or "")[:12] or None,
            "pin_release": dig(pin, "promotion", "release_tag"),
        },
        "last_said": said,
    }
    return out


def render_svg(d: dict) -> str:
    return art.card(d)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", help="write into this directory instead of the repo (dry run)")
    args = ap.parse_args()
    token = os.environ.get("GITHUB_TOKEN")
    d = collect(token)
    svg = render_svg(d)
    base = Path(args.out) if args.out else ROOT
    (base / "zeref").mkdir(parents=True, exist_ok=True)
    (base / "assets").mkdir(parents=True, exist_ok=True)
    (base / "zeref" / "live.json").write_text(json.dumps(d, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (base / "assets" / "zeref-live.svg").write_text(svg, encoding="utf-8")
    (base / "assets" / "zeref-hero.svg").write_text(art.hero(d), encoding="utf-8")
    (base / "assets" / "zeref-portal.svg").write_text(art.portal(), encoding="utf-8")
    (base / "assets" / "zeref-divider.svg").write_text(art.divider(), encoding="utf-8")
    errs = {k: s["error"] for k, s in d["sources"].items() if s.get("error")}
    print(f"card written to {base}; source errors: {errs or 'none'}")


if __name__ == "__main__":
    main()
