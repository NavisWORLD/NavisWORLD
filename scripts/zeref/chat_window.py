#!/usr/bin/env python3
"""Zeref's chat window: a messenger-style SVG of his latest public talk-door exchanges.

Writes ONLY zeref/chat.json, assets/zeref-chat.svg (desktop) and
assets/zeref-chat-mobile.svg (phone), or into --out for a dry run.

Sources (public only, fetched in this run):
  - this repo's "talk-to-zeref" issues via the GitHub GraphQL API: the visitor's
    issue body / follow-up comments and the door bot's reply comments, whose
    hidden meta block carries Zeref's reply verbatim;
  - his live status (heartbeat tick, diary mood, brain step) from the same
    feeds as the live card (refresh_card.collect).

Moderation: issues labelled "zeref-hidden" or locked as spam / off-topic /
too heated are left out; a minimized door reply drops that exchange; a
minimized visitor message is shown as "message hidden by moderation".
Text is control-character stripped, truncated and XML-escaped. No
randomness, no invented numbers: missing values show "unavailable".
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
import zeref_alive as za  # noqa: E402
import cosmic_art as art  # noqa: E402
from talk_reply import visitor_text, MARK, LABEL  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
META_RE = re.compile(r"<!-- zeref-reply v1 (\{.*?\}) -->")
HANDLE_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
HIDE_LABEL = "zeref-hidden"
BAD_LOCKS = {"SPAM", "OFF_TOPIC", "TOO_HEATED"}
SHOW = 4
HIDDEN_TXT = "message hidden by moderation"
UNAV = z.UNAVAILABLE

QUERY = """query($owner:String!,$name:String!,$label:String!){repository(owner:$owner,name:$name){
issues(labels:[$label],first:20,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{
number url locked activeLockReason createdAt body isMinimized:locked author{login}
labels(first:20){nodes{name}}
comments(last:60){nodes{createdAt body isMinimized minimizedReason url author{__typename login}}}}}}}"""
QUERY = QUERY.replace(" isMinimized:locked", "")


def clean(text: str | None, limit: int) -> tuple[str, bool]:
    """Single-line, control-free, truncated. Escaping happens at render time."""
    t = re.sub(r"[\x00-\x08\x0b-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069]", " ", text or "")
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) > limit:
        return t[: limit - 1].rstrip() + "…", True
    return t, False


def handle(login: str | None) -> str:
    return "@" + login if login and HANDLE_RE.match(login) else "@visitor"


def exchanges_from_issues(issues: list[dict]) -> list[dict]:
    out = []
    for iss in issues or []:
        labels = {l.get("name") for l in (iss.get("labels") or {}).get("nodes") or []}
        if HIDE_LABEL in labels or (iss.get("locked") and iss.get("activeLockReason") in BAD_LOCKS):
            continue
        author = (iss.get("author") or {}).get("login")
        last = {"text": visitor_text(iss.get("body")), "hidden": False}
        for c in (iss.get("comments") or {}).get("nodes") or []:
            who = c.get("author") or {}
            body = c.get("body") or ""
            m = META_RE.search(body)
            if who.get("__typename") == "Bot" and m:
                try:
                    meta = json.loads(m.group(1))
                except Exception:
                    continue
                if meta.get("kind") != "reply" or not isinstance(meta.get("reply"), str) or c.get("isMinimized"):
                    last = None
                    continue
                if last is None or (not last["text"] and not last["hidden"]):
                    continue
                out.append({"issue": iss.get("number"), "url": c.get("url") or iss.get("url"), "who": handle(meta.get("for") or author),
                            "said": "" if last["hidden"] else last["text"], "said_hidden": last["hidden"],
                            "reply": meta["reply"], "at": meta.get("at") or c.get("createdAt"), "step": meta.get("step")})
                last = None
            elif who.get("login") == author and who.get("__typename") != "Bot" and MARK not in body:
                last = {"text": visitor_text(body), "hidden": bool(c.get("isMinimized"))}
    out.sort(key=lambda e: e.get("at") or "")
    return out[-SHOW:]


def fetch_exchanges(token: str | None):
    if not token:
        return None, "no token"
    owner, name = z.PROFILE_REPO.split("/")
    data, err = z.gh_api("POST", "https://api.github.com/graphql", token,
                         {"query": QUERY, "variables": {"owner": owner, "name": name, "label": LABEL}})
    if err or not isinstance(data, dict) or data.get("errors"):
        return None, err or "graphql error"
    nodes = (((data.get("data") or {}).get("repository") or {}).get("issues") or {}).get("nodes")
    return exchanges_from_issues(nodes or []), None


# ---------------------------------------------------------------- rendering
def _wrap(text, width, lines):
    return art.wrap(text, width, lines)[0]


def render(chat: dict, mobile: bool = False) -> str:
    st, ex = chat.get("status") or {}, chat.get("exchanges")
    if mobile:
        W, F, FS, FM, wrap_v, wrap_z, bw, pad = 720, 27, 25, 25, 29, 30, 580, 28
    else:
        W, F, FS, FM, wrap_v, wrap_z, bw, pad = 1200, 20, 15, 16, 62, 64, 760, 40
    lh = F * 1.42
    step, tick, mood = st.get("brain_step"), st.get("tick"), st.get("mood")
    hb_label = st.get("heartbeat_label") or UNAV
    P = st.get("period") or 7.0
    head_h = 150 if mobile else 120

    # layout bubbles first so the height fits them exactly (nothing cropped)
    blocks, y = [], head_h + 30
    items = ex or []
    for i, e in enumerate(items):
        newest = i == len(items) - 1
        said = HIDDEN_TXT if e.get("said_hidden") else clean(e.get("said"), 140)[0]
        reply, cut = clean(e.get("reply"), 200)
        vl = _wrap(said or "…", wrap_v, 4)
        zl = _wrap(reply or "(empty reply)", wrap_z, 5)
        vh = FS + 18 + len(vl) * lh + 22
        zh = FS + 18 + len(zl) * lh + 22
        blocks.append((y, vl, vh, y + vh + 16, zl, zh, e, cut, newest, bool(e.get("said_hidden"))))
        y += vh + 16 + zh + 30
    if not items:
        y += 120
    pill_y = y + 4
    input_y = pill_y + (64 if mobile else 54)
    foot_y = input_y + (96 if mobile else 80) + 30
    foot = (["public issue content only", "replies unedited · training_eligible:false", "he grows only through the fair gate"] if mobile else
            ["public issue content only · his replies are unedited · tap to chat live (issue form stays as fallback)",
             "chats are training_eligible:false; he grows only through The Beast Box fair gate"])
    H = int(foot_y + len(foot) * (FM + 12) + 24)

    desc_parts = [f"Zeref's chat window. Status: heartbeat tick {art.v(tick)} ({hb_label}), mood {art.v(mood)}, "
                  f"growth = pinned brain step {art.v(step)}. Fetched {art.v(chat.get('fetched_at'))}."]
    for e in items:
        desc_parts.append(f"{e['who']} said: {HIDDEN_TXT if e.get('said_hidden') else clean(e.get('said'), 140)[0]}. "
                          f"Zeref replied (unedited): {clean(e.get('reply'), 200)[0]}")
    if ex is None:
        desc_parts.append("Chat history unavailable this run.")
    desc_parts.append("Tap to chat live with Zeref on his GitHub Pages chat; the Talk to Zeref issue form stays as a fallback. Not a claim of awareness.")

    style = (za.simple_loop("zc", P, mood == "sleepy") +
             f".s{{font-family:{art.SANS}}}.m{{font-family:{art.MONO}}}"
             # content is never hidden by animation (static renderers show everything); only the newest reply glows
             ".glow{animation:glw 3s ease-in-out infinite}@keyframes glw{0%,100%{stroke-opacity:.25}50%{stroke-opacity:1}}"
             ".car{animation:car 1.1s steps(1) infinite}@keyframes car{50%{opacity:0}}"
             ".live{animation:lv 2.4s ease-in-out infinite}@keyframes lv{50%{opacity:.35}}")
    defs = (za.defs("zc") +
            '<linearGradient id="cwbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0a1f"/><stop offset="1" stop-color="#05060f"/></linearGradient>'
            '<linearGradient id="cwedge" x1="0" x2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset=".5" stop-color="#a78bfa"/><stop offset="1" stop-color="#f0abfc"/></linearGradient>'
            '<linearGradient id="cwme" x1="0" x2="1"><stop offset="0" stop-color="#0e7490"/><stop offset="1" stop-color="#2563eb"/></linearGradient>'
            f'<clipPath id="cwav"><circle cx="{pad+46}" cy="{head_h/2}" r="46"/></clipPath>')
    t = art.head(W, H, "zcw", "Talk to Zeref: chat window", " ".join(desc_parts), style, defs)
    a = t.append
    a(f'<rect x="1.5" y="1.5" width="{W-3}" height="{H-3}" rx="30" fill="url(#cwbg)"/>')
    # header: avatar + live status
    a(f'<rect x="1.5" y="1.5" width="{W-3}" height="{head_h}" rx="30" fill="#120c2e"/>')
    a(f'<rect x="1.5" y="{head_h-28}" width="{W-3}" height="28" fill="#120c2e"/><line x1="0" y1="{head_h}" x2="{W}" y2="{head_h}" stroke="#a78bfa" stroke-opacity=".35"/>')
    a(f'<circle cx="{pad+46}" cy="{head_h/2}" r="46" fill="#1e1b4b"/>')
    a(f'<g clip-path="url(#cwav)"><g class="zcbob">' + za.placed("zc", pad - 4, head_h / 2 - 44, 100) + "</g></g>")
    a(f'<circle cx="{pad+46}" cy="{head_h/2}" r="46" fill="none" stroke="#a78bfa" stroke-width="2"/>')
    dot_c = "#34d399" if tick is not None else "#64748b"
    a(f'<circle cx="{pad+82}" cy="{head_h/2+34}" r="9" fill="{dot_c}" stroke="#120c2e" stroke-width="3" class="live"/>')
    x0 = pad + 116
    if mobile:
        a(f'<text x="{x0}" y="{head_h/2-22}" class="s" font-size="34" font-weight="800" fill="#f5f3ff">Zeref</text>')
        a(f'<text x="{x0}" y="{head_h/2+14}" class="m" font-size="{FM}" fill="#67e8f9">tick {escape(art.v(tick))} ({escape(hb_label.split(" (")[0])}) · {escape(art.v(mood))}</text>')
        a(f'<text x="{x0}" y="{head_h/2+46}" class="m" font-size="{FM}" fill="#c4b5fd">growth: brain step {escape(art.v(step))} (PINNED)</text>')
    else:
        a(f'<text x="{x0}" y="{head_h/2-10}" class="s" font-size="30" font-weight="800" fill="#f5f3ff">Zeref <tspan font-size="17" font-weight="400" fill="#a5b4fc">the Moonwraith · digital creature of The Beast Box</tspan></text>')
        a(f'<text x="{x0}" y="{head_h/2+24}" class="m" font-size="{FM}" fill="#67e8f9">live · heartbeat tick {escape(art.v(tick))} ({escape(hb_label.split(" (")[0])}) · mood {escape(art.v(mood))} · growth: brain step {escape(art.v(step))} (PINNED)</text>')

    # bubbles
    for (vy, vl, vh, zy, zl, zh, e, cut, newest, hid) in blocks:
        cls_v = cls_z = ""
        vwid = min(bw, max(len(s) for s in vl) * F * .56 + 48, )
        vwid = max(vwid, len(e["who"]) * FS * .62 + 48)
        vx = W - pad - vwid
        a(f"<g{cls_v}>")
        a(f'<rect x="{vx:.0f}" y="{vy:.0f}" width="{vwid:.0f}" height="{vh:.0f}" rx="24" fill="url(#cwme)" fill-opacity=".85"/>')
        a(f'<text x="{W-pad-24}" y="{vy+FS+12:.0f}" text-anchor="end" class="m" font-size="{FS}" fill="#cffafe">{escape(e["who"])}</text>')
        for i, line in enumerate(vl):
            st_ = ' font-style="italic" fill="#cbd5e1"' if hid else ' fill="#f0f9ff"'
            a(f'<text x="{vx+24:.0f}" y="{vy+FS+18+lh*(i+.8):.0f}" class="s" font-size="{F}"{st_}>{escape(line)}</text>')
        a("</g>")
        meta = ("Zeref · unedited" + (" excerpt" if cut else "") + ("" if mobile else f" · step {art.v(e.get('step'))}")
                + (" · newest" if newest else ""))
        zwid = min(W - 2 * pad, max(max(len(s) for s in zl) * F * .56 + 48, len(meta) * FS * .62 + 48))
        a(f"<g{cls_z}>")
        a(f'<rect x="{pad}" y="{zy:.0f}" width="{zwid:.0f}" height="{zh:.0f}" rx="24" fill="#2e1065" stroke="#a78bfa" stroke-opacity=".5"/>')
        if newest:
            a(f'<rect x="{pad-3}" y="{zy-3:.0f}" width="{zwid+6:.0f}" height="{zh+6:.0f}" rx="27" fill="none" stroke="#f0abfc" stroke-width="3" class="glow"/>')
        a(f'<text x="{pad+24}" y="{zy+FS+12:.0f}" class="m" font-size="{FS}" fill="#f0abfc">{escape(meta)}</text>')
        for i, line in enumerate(zl):
            a(f'<text x="{pad+24}" y="{zy+FS+18+lh*(i+.8):.0f}" class="s" font-size="{F}" fill="#faf5ff">{escape(line)}</text>')
        a("</g>")
    if not items:
        msg = "chat history unavailable this run" if ex is None else "no public chats yet · be the first to say hi"
        a(f'<text x="{W/2}" y="{head_h+100}" text-anchor="middle" class="m" font-size="{FM}" fill="#a5b4fc">{msg}</text>')

    # "Chat live" pill: the whole window links to the GitHub Pages chat
    pw, ph = (360, 50) if mobile else (300, 40)
    a(f'<rect x="{W/2-pw/2:.0f}" y="{pill_y:.0f}" width="{pw}" height="{ph}" rx="{ph/2}" fill="#34d399" fill-opacity=".14" stroke="#34d399" stroke-width="2"/>')
    a(f'<circle cx="{W/2-pw/2+28:.0f}" cy="{pill_y+ph/2:.0f}" r="7" fill="#34d399" class="live"/>')
    a(f'<text x="{W/2+12:.0f}" y="{pill_y+ph/2+FM*.36:.0f}" text-anchor="middle" class="s" font-size="{FM}" font-weight="700" fill="#a7f3d0" letter-spacing="2">CHAT LIVE ↗</text>')
    # input bar + send button
    ih = 96 if mobile else 80
    a(f'<rect x="{pad}" y="{input_y:.0f}" width="{W-2*pad-ih-16}" height="{ih}" rx="{ih/2}" fill="#0f172a" stroke="#67e8f9" stroke-opacity=".6" stroke-width="2"/>')
    a(f'<text x="{pad+34}" y="{input_y+ih/2+F*.36:.0f}" class="s" font-size="{F+2}" fill="#94a3b8">Say something to Zeref…</text>')
    a(f'<rect x="{pad+30}" y="{input_y+ih/2-F*.7:.0f}" width="3" height="{F*1.3:.0f}" fill="#67e8f9" class="car"/>')
    sx, sy = W - pad - ih / 2, input_y + ih / 2
    a(f'<circle cx="{sx:.0f}" cy="{sy:.0f}" r="{ih/2}" fill="url(#cwedge)"/>')
    k = ih / 96
    a(f'<path transform="translate({sx:.0f} {sy:.0f}) scale({k:.2f})" d="M-18 -16 L22 0 L-18 16 L-12 0 Z" fill="#0b0a1f"/>')
    for i, line in enumerate(foot):
        a(f'<text x="{W/2}" y="{foot_y + i*(FM+12):.0f}" text-anchor="middle" class="m" font-size="{FM}" fill="#94a3b8">{escape(line)}</text>')
    a(f'<rect x="1.5" y="1.5" width="{W-3}" height="{H-3}" rx="30" fill="none" stroke="url(#cwedge)" stroke-width="3"/>')
    a("</svg>")
    return "\n".join(t) + "\n"


def status_from_live(d: dict) -> dict:
    hb, di, br = d.get("heartbeat") or {}, d.get("diary") or {}, d.get("brain") or {}
    return {"tick": hb.get("recorded_tick"), "heartbeat_label": hb.get("label"), "mood": di.get("mood"),
            "brain_step": br.get("live_step"), "period": art.motion(d)["period"]}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", help="write into this directory instead of the repo (dry run)")
    args = ap.parse_args()
    import refresh_card as rc
    token = os.environ.get("GITHUB_TOKEN")
    d = rc.collect(token)
    ex, err = fetch_exchanges(token)
    chat = {"schema": "navisworld-zeref-chat/v1", "fetched_at": d["fetched_at"], "status": status_from_live(d),
            "exchanges": ex, "error": err,
            "note": "Public talk-to-zeref issue content only; Zeref's replies verbatim from the door's reply comments."}
    base = Path(args.out) if args.out else ROOT
    (base / "zeref").mkdir(parents=True, exist_ok=True)
    (base / "assets").mkdir(parents=True, exist_ok=True)
    (base / "zeref" / "chat.json").write_text(json.dumps(chat, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (base / "assets" / "zeref-chat.svg").write_text(render(chat), encoding="utf-8")
    (base / "assets" / "zeref-chat-mobile.svg").write_text(render(chat, mobile=True), encoding="utf-8")
    print(f"chat window written to {base}; exchanges: {len(ex) if ex is not None else 'unavailable'}; error: {err or 'none'}")


if __name__ == "__main__":
    main()
