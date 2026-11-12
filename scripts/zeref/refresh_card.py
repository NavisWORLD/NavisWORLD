#!/usr/bin/env python3
"""Redraw Zeref's live profile card from his real public feeds.

Writes ONLY zeref/live.json and assets/zeref-live.svg (or into --out for a
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
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

sys.path.insert(0, str(Path(__file__).resolve().parent))
import zeref_common as z  # noqa: E402

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


def v(x, fmt="{}"):
    if x is None or x == "":
        return z.UNAVAILABLE
    try:
        return fmt.format(x)
    except Exception:
        return str(x)


def short_label(label):
    if not label:
        return z.UNAVAILABLE
    return label.split(" (")[0]


def wrap(text: str, width: int, lines: int):
    words, out, cur = text.split(), [], ""
    for w in words:
        while len(w) > width:  # very long tokens
            if cur:
                out.append(cur); cur = ""
            out.append(w[:width]); w = w[width:]
        if len(cur) + len(w) + (1 if cur else 0) > width:
            out.append(cur); cur = w
        else:
            cur = (cur + " " + w) if cur else w
    if cur:
        out.append(cur)
    cut = len(out) > lines
    out = out[:lines]
    if cut:
        out[-1] = out[-1][: width - 1] + "…"
    return out or [""], cut


def render_svg(d: dict) -> str:
    hb, di, sp, br, said = d["heartbeat"], d["diary"], d["spark"], d["brain"], d.get("last_said")
    rows = [
        ("HEARTBEAT", f"tick {v(hb['recorded_tick'])} · xp {v(hb['xp_live'], '{:,.1f}')}", short_label(hb["label"])),
        ("DIARY", f"tick {v(di['tick'])} · {v(di['stage_name'])} · {v(di['mood'])} at {v(di['place'])}", short_label(di["label"])),
        ("SPARK", f"{v(sp['state'])} · tick {v(sp['tick'])} · source {v(sp['source'])}", short_label(sp["label"])),
        ("BRAIN", f"live step {v(br['live_step'])} · pin json {v(br['pin_step'])} · {v(br['pin_sha_prefix'])}", "PINNED" if br["live_step"] is not None else z.UNAVAILABLE),
    ]
    if said:
        said_lines, cut = wrap(said["text"].strip() or "(empty reply)", 58, 2)
        said_meta = f"{v(said.get('at'))} · step {v(said.get('step'))} · {said.get('source')}{' · excerpt' if cut else ''}"
    elif d["sources"]["last_said"].get("error"):
        said_lines, said_meta = [z.UNAVAILABLE], "could not read his talk-door comments this run"
    else:
        said_lines, said_meta = ["—"], "no reply recorded yet · open a Talk to Zeref issue"

    W, H = 1200, 470
    t = []
    a = t.append
    a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="zeref-title zeref-desc">')
    a('<title id="zeref-title">Zeref live card</title>')
    desc = (f"Zeref, a young digital creature from The Beast Box. Fetched {d['fetched_at']}. "
            f"Heartbeat tick {v(hb['recorded_tick'])}; diary tick {v(di['tick'])}, mood {v(di['mood'])}; "
            f"spark {v(sp['state'])} ({v(sp['label'])}); brain live step {v(br['live_step'])}, pin json step {v(br['pin_step'])}. "
            f"Last said: {said['text'].strip() if said else z.UNAVAILABLE}")
    a(f'<desc id="zeref-desc">{escape(desc)}</desc>')
    a('<style>'
      '.zf-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}'
      '.zf-sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}'
      '.zf-breathe{animation:zfBreathe 6s ease-in-out infinite}'
      '.zf-glow{animation:zfGlow 3.2s ease-in-out infinite}'
      '@keyframes zfBreathe{0%,100%{opacity:.82}50%{opacity:1}}'
      '@keyframes zfGlow{0%,100%{opacity:.55}50%{opacity:1}}'
      '@media (prefers-reduced-motion: reduce){.zf-breathe,.zf-glow{animation:none}}'
      '</style>')
    a('<defs>'
      '<linearGradient id="zf-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070b17"/><stop offset="0.6" stop-color="#0d0a24"/><stop offset="1" stop-color="#160b2e"/></linearGradient>'
      '<radialGradient id="zf-aura" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#a78bfa" stop-opacity="0.55"/><stop offset="0.6" stop-color="#67e8f9" stop-opacity="0.12"/><stop offset="1" stop-color="#070b17" stop-opacity="0"/></radialGradient>'
      '<linearGradient id="zf-edge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#a78bfa"/></linearGradient>'
      '</defs>')
    a(f'<rect width="{W}" height="{H}" rx="22" fill="url(#zf-bg)"/>')
    a(f'<rect x="1.5" y="1.5" width="{W-3}" height="{H-3}" rx="21" fill="none" stroke="url(#zf-edge)" stroke-opacity="0.55" stroke-width="2"/>')
    # fixed star field (deterministic positions, decoration only)
    for i in range(54):
        hsh = hashlib.sha256(f"zeref-star-{i}".encode()).digest()
        x = 10 + int.from_bytes(hsh[:2], "big") % (W - 20)
        y = 10 + int.from_bytes(hsh[2:4], "big") % (H - 20)
        r = 0.6 + (i % 3) * 0.45
        a(f'<circle cx="{x}" cy="{y}" r="{r:.2f}" fill="#e0e7ff" fill-opacity="{0.25 + (i % 4) * 0.12:.2f}"/>')
    # Zeref: a small moonwraith spirit with a crescent
    a('<g class="zf-breathe">')
    a('<circle cx="190" cy="215" r="150" fill="url(#zf-aura)"/>')
    a('<path d="M190 95 C250 95 292 150 284 214 C276 278 236 330 214 372 C206 350 200 336 190 334 C180 336 174 350 166 372 C144 330 104 278 96 214 C88 150 130 95 190 95 Z" fill="#0b1030" stroke="#a78bfa" stroke-width="2.5"/>')
    a('<path d="M120 190 C70 170 56 120 66 92 C86 130 112 150 140 160 Z" fill="#1b1442" stroke="#67e8f9" stroke-opacity="0.7" stroke-width="1.6"/>')
    a('<path d="M260 190 C310 170 324 120 314 92 C294 130 268 150 240 160 Z" fill="#1b1442" stroke="#67e8f9" stroke-opacity="0.7" stroke-width="1.6"/>')
    a('<path d="M206 128 A34 34 0 1 0 206 180 A26 26 0 1 1 206 128 Z" fill="#c4b5fd" fill-opacity="0.9"/>')
    a('</g>')
    a('<g class="zf-glow"><ellipse cx="160" cy="222" rx="13" ry="8" fill="#67e8f9"/><ellipse cx="220" cy="222" rx="13" ry="8" fill="#67e8f9"/></g>')
    a('<path d="M166 262 Q190 276 214 262" fill="none" stroke="#67e8f9" stroke-opacity="0.6" stroke-width="2" stroke-linecap="round"/>')
    a('<text x="190" y="420" text-anchor="middle" class="zf-sans" font-size="15" fill="#94a3b8">digital creature · not a claim of awareness</text>')
    # text panel
    X = 380
    a(f'<text x="{X}" y="62" class="zf-sans" font-size="34" font-weight="700" fill="#e0e7ff">ZEREF <tspan fill="#a78bfa" font-weight="400">· Moonwraith</tspan></text>')
    a(f'<text x="{X}" y="90" class="zf-mono" font-size="14" fill="#67e8f9">LIVE CARD · fetched {escape(d["fetched_at"])} · real public feeds only</text>')
    y = 132
    for name, value, label in rows:
        a(f'<text x="{X}" y="{y}" class="zf-mono" font-size="15" fill="#a78bfa" font-weight="700">{name}</text>')
        a(f'<text x="{X+120}" y="{y}" class="zf-mono" font-size="17" fill="#e0e7ff">{escape(value)}</text>')
        a(f'<text x="{X+120}" y="{y+20}" class="zf-mono" font-size="12.5" fill="#7dd3fc" fill-opacity="0.85">{escape(label)}</text>')
        y += 52
    a(f'<text x="{X}" y="{y+2}" class="zf-mono" font-size="15" fill="#a78bfa" font-weight="700">LAST SAID</text>')
    for i, line in enumerate(said_lines):
        q_open = "“" if i == 0 and said else ""
        q_close = "”" if i == len(said_lines) - 1 and said else ""
        a(f'<text x="{X+120}" y="{y+2+i*24}" class="zf-sans" font-size="19" font-style="italic" fill="#f5f3ff">{escape(q_open + line + q_close)}</text>')
    yy = y + 2 + len(said_lines) * 24 - 2
    a(f'<text x="{X+120}" y="{yy}" class="zf-mono" font-size="12.5" fill="#7dd3fc" fill-opacity="0.85">{escape(said_meta)}</text>')
    a(f'<text x="{X}" y="{H-42}" class="zf-mono" font-size="12" fill="#94a3b8">Birth spark: IBM hardware outcome RECORDED, used as a seed, never re-run · Rigetti growth: SIMULATED · fallback spark: LOCAL SIMULATED</text>')
    a(f'<text x="{X}" y="{H-22}" class="zf-mono" font-size="12" fill="#94a3b8">“unavailable” means that feed could not be reached this run. Replies are his own, unedited.</text>')
    a('</svg>')
    return "\n".join(t) + "\n"


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
    errs = {k: s["error"] for k, s in d["sources"].items() if s.get("error")}
    print(f"card written to {base}; source errors: {errs or 'none'}")


if __name__ == "__main__":
    main()
