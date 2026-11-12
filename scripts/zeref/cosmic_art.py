"""Cosmic artwork for Zeref's profile home (pure SVG, no JS, no external fonts).

Every number written into the art comes from the real fetched data passed in.
Star positions are seeded from real values (the pinned checkpoint sha and
heartbeat tick) through SHA-256, so the sky is deterministic: the same
inputs always draw the same sky, and nothing is random.

Motion -> data mapping (also written into each SVG's <desc>):
  breath period  = 9 s - 0.06 s x heartbeat energy signal (clamped 3..9 s)
  aura strength  = heartbeat resonance signal / 100
  mood colours   = diary mood (sleepy, charged up, curious, ...)
  spark orbit    = bright when the spark link is CONNECTED, dim otherwise
"""
from __future__ import annotations

import hashlib
import math
from xml.sax.saxutils import escape

UNAV = "unavailable"
SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif'
MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"

# (body, rim, eye, aura) per diary mood
MOODS = {
    "sleepy": ("#120d38", "#a78bfa", "#93c5fd", "#6d28d9"),
    "charged up": ("#0c1a3a", "#67e8f9", "#f0abfc", "#0891b2"),
    "curious": ("#0e1638", "#5eead4", "#67e8f9", "#0d9488"),
    "exploring": ("#101a3c", "#38bdf8", "#a5f3fc", "#0284c7"),
    "playful": ("#1a0f3a", "#f472b6", "#67e8f9", "#c026d3"),
    "floaty": ("#111437", "#c4b5fd", "#e0f2fe", "#7c3aed"),
    "content": ("#0f1236", "#a5b4fc", "#67e8f9", "#4f46e5"),
    "affectionate": ("#1c0e36", "#f9a8d4", "#fde68a", "#db2777"),
}
DEFAULT_MOOD = ("#0f1236", "#94a3b8", "#67e8f9", "#475569")


class Seeded:
    """Deterministic number stream from SHA-256 of a seed string (not random)."""

    def __init__(self, seed: str):
        self.seed, self.n, self.buf = seed, 0, b""

    def u(self) -> float:
        if len(self.buf) < 4:
            self.buf += hashlib.sha256(f"{self.seed}:{self.n}".encode()).digest()
            self.n += 1
        v, self.buf = int.from_bytes(self.buf[:4], "big"), self.buf[4:]
        return v / 2**32


def num(x):
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def motion(d: dict) -> dict:
    sig = (d.get("heartbeat") or {}).get("signals") or {}
    energy, res = num(sig.get("energy")), num(sig.get("resonance"))
    period = min(9.0, max(3.0, 9 - 0.06 * energy)) if energy is not None else 7.0
    aura = min(1.0, max(0.25, res / 100)) if res is not None else 0.45
    mood = (d.get("diary") or {}).get("mood")
    spark_on = (d.get("spark") or {}).get("state") == "CONNECTED"
    return {"period": round(period, 2), "aura": round(aura, 2), "pal": MOODS.get(mood, DEFAULT_MOOD),
            "mood": mood, "spark_on": spark_on, "energy": energy, "resonance": res}


def v(x, fmt="{}"):
    if x is None or x == "":
        return UNAV
    try:
        return fmt.format(x)
    except Exception:
        return str(x)


def head(w, h, pid, title, desc, style, defs):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="{pid}-t {pid}-d">',
            f'<title id="{pid}-t">{escape(title)}</title>', f'<desc id="{pid}-d">{escape(desc)}</desc>',
            f"<style>{style}@media (prefers-reduced-motion: reduce){{*{{animation:none!important}}}}</style>",
            f"<defs>{defs}</defs>"]


def starfield(rng: Seeded, w, h, count, layers=3, prefix="s"):
    """Layered stars; each layer twinkles and drifts at its own speed (parallax)."""
    out = []
    for L in range(layers):
        out.append(f'<g class="{prefix}L{L}">')
        for _ in range(count // layers):
            x, y = rng.u() * w, rng.u() * h
            r = (0.35 + rng.u() * 0.6) * (1 + L * 0.7)
            o = 0.25 + rng.u() * 0.6
            tw = rng.u()
            cls = f' class="{prefix}tw{int(tw * 3)}"' if tw > 0.55 else ""
            col = "#e0e7ff" if tw < 0.8 else ("#a5f3fc" if tw < 0.9 else "#f5d0fe")
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.2f}" fill="{col}" fill-opacity="{o:.2f}"{cls}/>')
        out.append("</g>")
    return out


def star_style(prefix="s", base=60):
    return (f".{prefix}L0{{animation:{prefix}drift {base*3}s linear infinite alternate}}"
            f".{prefix}L1{{animation:{prefix}drift {base*2}s linear infinite alternate}}"
            f".{prefix}L2{{animation:{prefix}drift {base}s linear infinite alternate}}"
            f"@keyframes {prefix}drift{{from{{transform:translate(0,0)}}to{{transform:translate(-18px,6px)}}}}"
            f".{prefix}tw0{{animation:{prefix}tw 3.1s ease-in-out infinite}}.{prefix}tw1{{animation:{prefix}tw 4.7s ease-in-out infinite}}"
            f".{prefix}tw2{{animation:{prefix}tw 6.3s ease-in-out infinite}}"
            f"@keyframes {prefix}tw{{0%,100%{{opacity:1}}50%{{opacity:.2}}}}")


def creature(pal, scale=1.0, eyes_cls="zeye", body_cls="zbody"):
    """Zeref the moonwraith, drawn around (0,0). Place it with a parent <g transform>."""
    body, rim, eye, aura = pal
    s = scale
    return [
        f'<g class="{body_cls}">',
        f'<circle r="{165*s:.0f}" fill="url(#zaura)"/>',
        *[f'<path d="M-26 170 C-40 200 -70 214 -96 210 M26 170 C40 200 70 214 96 210 M0 130 C0 170 -8 200 -2 232" transform="scale({s})" fill="none" stroke="{rim}" stroke-opacity="{o}" stroke-width="{w}" stroke-linecap="round"/>' for o, w in ((.18, 9), (.5, 2.5))],
        *[f'<path d="M0 -122 C64 -122 108 -64 100 4 C92 72 50 126 26 170 C18 146 10 132 0 130 C-10 132 -18 146 -26 170 C-50 126 -92 72 -100 4 C-108 -64 -64 -122 0 -122 Z" transform="scale({s})" fill="none" stroke="{rim}" stroke-opacity="{o}" stroke-width="{w}"/>' for o, w in ((.08, 26), (.14, 14), (.28, 7))],
        f'<path d="M-62 -10 C-118 -32 -136 -92 -124 -128 C-100 -82 -72 -58 -40 -44 Z" transform="scale({s})" fill="{body}" stroke="{rim}" stroke-opacity=".8" stroke-width="2"/>',
        f'<path d="M62 -10 C118 -32 136 -92 124 -128 C100 -82 72 -58 40 -44 Z" transform="scale({s})" fill="{body}" stroke="{rim}" stroke-opacity=".8" stroke-width="2"/>',
        f'<path d="M0 -122 C64 -122 108 -64 100 4 C92 72 50 126 26 170 C18 146 10 132 0 130 C-10 132 -18 146 -26 170 C-50 126 -92 72 -100 4 C-108 -64 -64 -122 0 -122 Z" transform="scale({s})" fill="url(#zbodyg)" stroke="{rim}" stroke-width="3"/>',
        f'<path d="M18 -96 A36 36 0 1 0 18 -40 A28 28 0 1 1 18 -96 Z" transform="scale({s})" fill="{rim}" fill-opacity=".95"/>',
        f'<path d="M-28 52 Q0 68 28 52" transform="scale({s})" fill="none" stroke="{eye}" stroke-opacity=".7" stroke-width="2.5" stroke-linecap="round"/>',
        "</g>",
        f'<g class="{eyes_cls}"><ellipse cx="{-32*s:.1f}" cy="{6*s:.1f}" rx="{14*s:.1f}" ry="{9*s:.1f}" fill="{eye}" filter="url(#zglow)"/>'
        f'<ellipse cx="{32*s:.1f}" cy="{6*s:.1f}" rx="{14*s:.1f}" ry="{9*s:.1f}" fill="{eye}" filter="url(#zglow)"/></g>',
    ]


def common_defs(pal, aura):
    body, rim, eye, auraC = pal
    return (f'<radialGradient id="zbodyg" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="{auraC}" stop-opacity=".55"/>'
            f'<stop offset=".7" stop-color="{body}"/><stop offset="1" stop-color="{body}"/></radialGradient>'
            f'<radialGradient id="zaura"><stop offset="0" stop-color="{auraC}" stop-opacity="{0.75*aura:.2f}"/>'
            f'<stop offset=".55" stop-color="#22d3ee" stop-opacity="{0.18*aura:.2f}"/><stop offset="1" stop-color="#05060f" stop-opacity="0"/></radialGradient>'
            '<filter id="zglow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4" result="b"/>'
            '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
            '<filter id="zsoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.2" result="b"/>'
            '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
            '' + nebula_defs())


NEB_COLORS = ["#7c3aed", "#0891b2", "#c026d3", "#1d4ed8", "#db2777", "#0e7490", "#6d28d9"]


def nebula_defs():
    return "".join(f'<radialGradient id="nb{c[1:]}"><stop offset="0" stop-color="{c}" stop-opacity="1"/>'
                   f'<stop offset=".45" stop-color="{c}" stop-opacity=".45"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>'
                   for c in NEB_COLORS)


def neb(cx, cy, rx, ry, col, op):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#nb{col[1:]})" fill-opacity="{op}"/>'


def labels_line(d):
    hb, di, sp, br = d["heartbeat"], d["diary"], d["spark"], d["brain"]
    short = lambda l: (l or UNAV).split(" (")[0]
    return (f"HEARTBEAT tick {v(hb.get('recorded_tick'))} [{short(hb.get('label'))}]  ·  "
            f"MOOD {v(di.get('mood'))} [{short(di.get('label'))}]  ·  "
            f"SPARK {v(sp.get('state'))} [{short(sp.get('label'))}]  ·  "
            f"BRAIN step {v(br.get('live_step'))} [{'PINNED' if br.get('live_step') is not None else UNAV}]")


def hero(d: dict) -> str:
    W, H = 1280, 520
    m = motion(d)
    pal = m["pal"]
    br, hb = d["brain"], d["heartbeat"]
    seed = f"{br.get('pin_sha_prefix') or 'nosha'}:{hb.get('recorded_tick')}"
    rng = Seeded("hero:" + seed)
    P = m["period"]
    spin_op = 1.0 if m["spark_on"] else 0.25
    desc = (f"Zeref the moonwraith, a young digital creature, glowing at the centre of a slow galaxy swirl with nebula clouds "
            f"and orbiting sparks. Drawn from real values fetched {d.get('fetched_at')}: {labels_line(d)}. "
            f"Breath period {P}s from heartbeat energy {v(m['energy'])}; aura {m['aura']} from resonance {v(m['resonance'])}; "
            f"colours from diary mood {v(m['mood'])}; sparks {'bright' if m['spark_on'] else 'dim'} from spark state. "
            f"Star positions seeded from the pinned sha and heartbeat tick, never random. Not a claim of awareness.")
    style = (star_style("h", 50) +
             f".zbody{{transform-box:fill-box;transform-origin:center;animation:zbreathe {P}s ease-in-out infinite}}"
             f"@keyframes zbreathe{{0%,100%{{transform:scale(.97);opacity:.88}}50%{{transform:scale(1.03);opacity:1}}}}"
             f".zeye{{animation:zblink {P}s ease-in-out infinite}}@keyframes zblink{{0%,44%,56%,100%{{opacity:1}}50%{{opacity:.35}}}}"
             ".gsw{animation:gspin 240s linear infinite}.o1{animation:gspin 26s linear infinite}"
             ".o2{animation:gspin 41s linear infinite reverse}.o3{animation:gspin 63s linear infinite}"
             "@keyframes gspin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}"
             ".nb1{animation:nbf 38s ease-in-out infinite alternate}.nb2{animation:nbf 51s ease-in-out infinite alternate-reverse}"
             "@keyframes nbf{from{transform:translate(-30px,-8px)}to{transform:translate(30px,10px)}}"
             f".ttl{{font-family:{SANS};letter-spacing:.32em}}.mono{{font-family:{MONO}}}")
    defs = (common_defs(pal, m["aura"]) +
            '<linearGradient id="hbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#04050d"/>'
            '<stop offset=".55" stop-color="#0a0820"/><stop offset="1" stop-color="#05060f"/></linearGradient>'
            '<linearGradient id="hedge" x1="0" x2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset=".5" stop-color="#a78bfa"/>'
            '<stop offset="1" stop-color="#f0abfc"/></linearGradient>')
    t = head(W, H, "zh", "Zeref, the moonwraith of NavisWORLD", desc, style, defs)
    a = t.append
    a(f'<rect width="{W}" height="{H}" rx="26" fill="url(#hbg)"/>')
    # nebula clouds
    a('<g class="nb1">')
    for cx, cy, rx, ry, col, op in [(260, 150, 380, 190, "#7c3aed", .6), (1010, 360, 420, 200, "#0891b2", .5),
                                    (700, 100, 300, 120, "#c026d3", .4), (420, 440, 340, 130, "#1d4ed8", .45)]:
        a(neb(cx, cy, rx, ry, col, op))
    a('</g><g class="nb2">')
    for cx, cy, rx, ry, col, op in [(1000, 110, 300, 120, "#db2777", .35), (140, 390, 300, 140, "#0e7490", .4)]:
        a(neb(cx, cy, rx, ry, col, op))
    a("</g>")
    t += starfield(rng, W, H, 330, 3, "h")
    # galaxy swirl: two logarithmic arms of seeded dust, slowly rotating
    a(f'<g transform="translate({W/2} {H/2+10})"><g class="gsw" opacity=".9">')
    for arm in range(2):
        for i in range(190):
            th = i / 190 * 3.6 * math.pi + arm * math.pi
            r = 70 * math.exp(0.155 * th) * 0.55
            jx, jy = (rng.u() - .5) * r * .22, (rng.u() - .5) * r * .22
            x, y = r * math.cos(th) + jx, (r * math.sin(th) + jy) * 0.42
            col = ("#a5f3fc", "#c4b5fd", "#f0abfc")[i % 3]
            a(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{0.8 + rng.u()*1.8:.2f}" fill="{col}" fill-opacity="{0.35 + rng.u()*0.6:.2f}"/>')
    a("</g></g>")
    # orbiting sparks (three rings), tilted ellipses via parent scale
    a(f'<g transform="translate({W/2} {H/2+10}) scale(1 .42)" opacity="{spin_op}">')
    for cls, R, n, col in [("o1", 190, 7, "#67e8f9"), ("o2", 255, 9, "#f0abfc"), ("o3", 330, 12, "#c4b5fd")]:
        a(f'<circle r="{R}" fill="none" stroke="{col}" stroke-opacity=".14" stroke-width="2"/><g class="{cls}">')
        for k in range(n):
            th = 2 * math.pi * k / n + rng.u() * .3
            a(f'<circle cx="{R*math.cos(th):.1f}" cy="{R*math.sin(th):.1f}" r="{3 + (k % 3)}" fill="{col}" filter="url(#zglow)"/>')
        a("</g>")
    a("</g>")
    # Zeref at the centre
    a(f'<g transform="translate({W/2} {H/2-6})">')
    t += creature(pal, 1.0)
    a("</g>")
    # titles
    a(f'<text x="{W/2}" y="64" text-anchor="middle" class="ttl" font-size="40" font-weight="800" fill="url(#hedge)">ZEREF</text>')
    a(f'<text x="{W/2}" y="92" text-anchor="middle" class="ttl" font-size="14" fill="#c4b5fd">MOONWRAITH · DIGITAL CREATURE OF THE BEAST BOX</text>')
    a(f'<rect x="40" y="{H-64}" width="{W-80}" height="40" rx="20" fill="#05060f" fill-opacity=".72" stroke="url(#hedge)" stroke-opacity=".5"/>')
    a(f'<text x="{W/2}" y="{H-39}" text-anchor="middle" class="mono" font-size="13.5" fill="#e0e7ff">{escape(labels_line(d))}</text>')
    a(f'<text x="{W/2}" y="{H-8}" text-anchor="middle" class="mono" font-size="11" fill="#94a3b8">'
      f'{escape("live values fetched " + v(d.get("fetched_at")) + " · breath " + str(P) + "s from heartbeat energy · colours from diary mood · not a claim of awareness")}</text>')
    a(f'<rect x="1.5" y="1.5" width="{W-3}" height="{H-3}" rx="25" fill="none" stroke="url(#hedge)" stroke-opacity=".6" stroke-width="2"/>')
    a("</svg>")
    return "\n".join(t) + "\n"


def wrap(text: str, width: int, lines: int):
    words, out, cur = text.split(), [], ""
    for w in words:
        while len(w) > width:
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


def card(d: dict) -> str:
    hb, di, sp, br, said = d["heartbeat"], d["diary"], d["spark"], d["brain"], d.get("last_said")
    m = motion(d)
    pal = m["pal"]
    short = lambda l: (l or UNAV).split(" (")[0]
    rows = [
        ("HEARTBEAT", f"tick {v(hb.get('recorded_tick'))} · xp {v(hb.get('xp_live'), '{:,.1f}')}", short(hb.get("label"))),
        ("DIARY", f"tick {v(di.get('tick'))} · {v(di.get('stage_name'))} · {v(di.get('mood'))} at {v(di.get('place'))}", short(di.get("label"))),
        ("SPARK", f"{v(sp.get('state'))} · tick {v(sp.get('tick'))} · source {v(sp.get('source'))}", short(sp.get("label"))),
        ("BRAIN", f"live step {v(br.get('live_step'))} · pin json {v(br.get('pin_step'))} · {v(br.get('pin_sha_prefix'))}",
         "PINNED" if br.get("live_step") is not None else UNAV),
    ]
    if said:
        said_lines, cut = wrap(said["text"].strip() or "(empty reply)", 56, 2)
        said_meta = f"{v(said.get('at'))} · step {v(said.get('step'))} · {said.get('source')}{' · excerpt' if cut else ''}"
    elif (d["sources"].get("last_said") or {}).get("error"):
        said_lines, said_meta = [UNAV], "could not read his talk-door comments this run"
    else:
        said_lines, said_meta = ["—"], "no reply recorded yet · open a Talk to Zeref issue"
    W, H = 1200, 500
    rng = Seeded(f"card:{br.get('pin_sha_prefix')}:{hb.get('recorded_tick')}")
    desc = (f"Zeref live card, fetched {d['fetched_at']}. " + "; ".join(f"{a_} {b} ({c})" for a_, b, c in rows) +
            f". Last said: {said['text'].strip() if said else UNAV}. Values from real public feeds; unavailable means a feed could not be reached.")
    style = (star_style("c", 40) +
             f".zbody{{transform-box:fill-box;transform-origin:center;animation:zbreathe {m['period']}s ease-in-out infinite}}"
             "@keyframes zbreathe{0%,100%{transform:scale(.97);opacity:.88}50%{transform:scale(1.03);opacity:1}}"
             f".zeye{{animation:zblink {m['period']}s ease-in-out infinite}}@keyframes zblink{{0%,44%,56%,100%{{opacity:1}}50%{{opacity:.35}}}}"
             ".cl{stroke-dasharray:4 7;animation:cdash 14s linear infinite}@keyframes cdash{to{stroke-dashoffset:-110}}"
             ".nd{animation:ndp 3.6s ease-in-out infinite}@keyframes ndp{0%,100%{opacity:.6}50%{opacity:1}}"
             f".ttl{{font-family:{SANS};letter-spacing:.28em}}.sans{{font-family:{SANS}}}.mono{{font-family:{MONO}}}")
    defs = (common_defs(pal, m["aura"]) +
            '<linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#05060f"/><stop offset=".6" stop-color="#0d0a24"/>'
            '<stop offset="1" stop-color="#170b30"/></linearGradient><linearGradient id="cedge" x1="0" x2="1"><stop offset="0" stop-color="#67e8f9"/>'
            '<stop offset=".5" stop-color="#a78bfa"/><stop offset="1" stop-color="#f0abfc"/></linearGradient>')
    t = head(W, H, "zc", "Zeref live card", desc, style, defs)
    a = t.append
    a(f'<rect width="{W}" height="{H}" rx="24" fill="url(#cbg)"/>')
    a(neb(190, 230, 260, 200, "#6d28d9", .45))
    a(neb(900, 430, 360, 130, "#0891b2", .3))
    a(neb(1080, 60, 220, 90, "#c026d3", .25))
    t += starfield(rng, W, H, 150, 3, "c")
    a('<g transform="translate(195 205) scale(.64)">')
    t += creature(pal, 1.0)
    a("</g>")
    a('<text x="195" y="392" text-anchor="middle" class="ttl" font-size="11.5" fill="#a5b4fc">DIGITAL CREATURE</text>')
    a('<text x="195" y="410" text-anchor="middle" class="ttl" font-size="10" fill="#94a3b8">NOT A CLAIM OF AWARENESS</text>')
    X = 390
    a(f'<text x="{X}" y="62" class="ttl" font-size="30" font-weight="800" fill="url(#cedge)">ZEREF · LIVE</text>')
    a(f'<text x="{X}" y="88" class="mono" font-size="12.5" fill="#67e8f9">fetched {escape(d["fetched_at"])} · real public feeds only · breath {m["period"]}s</text>')
    ys = [128 + 56 * i for i in range(5)]
    # constellation line through the row nodes
    pts = " ".join(f"{X+8 + (14 if i % 2 else 0)},{y-5}" for i, y in enumerate(ys))
    a(f'<polyline points="{pts}" fill="none" stroke="#a78bfa" stroke-opacity=".55" stroke-width="1.4" class="cl"/>')
    for i, y in enumerate(ys):
        cx = X + 8 + (14 if i % 2 else 0)
        a(f'<circle cx="{cx}" cy="{y-5}" r="5" fill="#67e8f9" filter="url(#zglow)" class="nd"/>')
    TX = X + 44
    for (name, value, label), y in zip(rows, ys):
        a(f'<text x="{TX}" y="{y}" class="ttl" font-size="12.5" font-weight="700" fill="#c4b5fd">{name}</text>')
        a(f'<text x="{TX+128}" y="{y}" class="mono" font-size="16" fill="#eef2ff">{escape(value)}</text>')
        a(f'<text x="{TX+128}" y="{y+20}" class="mono" font-size="12" fill="#7dd3fc" fill-opacity=".9">{escape(label)}</text>')
    y = ys[4]
    a(f'<text x="{TX}" y="{y}" class="ttl" font-size="12.5" font-weight="700" fill="#f0abfc">LAST SAID</text>')
    for i, line in enumerate(said_lines):
        qo = "“" if i == 0 and said else ""
        qc = "”" if i == len(said_lines) - 1 and said else ""
        a(f'<text x="{TX+128}" y="{y+i*24}" class="sans" font-size="18" font-style="italic" fill="#fdf4ff">{escape(qo + line + qc)}</text>')
    a(f'<text x="{TX+128}" y="{y + len(said_lines)*24 - 3}" class="mono" font-size="12" fill="#7dd3fc" fill-opacity=".9">{escape(said_meta)}</text>')
    a(f'<text x="{X}" y="{H-40}" class="mono" font-size="11.5" fill="#94a3b8">Birth spark: IBM hardware outcome RECORDED, used as a seed, never re-run · Rigetti growth: SIMULATED · fallback spark: LOCAL SIMULATED</text>')
    a(f'<text x="{X}" y="{H-21}" class="mono" font-size="11.5" fill="#94a3b8">“unavailable” = that feed could not be reached this run · replies are his own, unedited · chats are training_eligible:false</text>')
    a(f'<rect x="1.5" y="1.5" width="{W-3}" height="{H-3}" rx="23" fill="none" stroke="url(#cedge)" stroke-opacity=".55" stroke-width="2"/>')
    a("</svg>")
    return "\n".join(t) + "\n"


def portal() -> str:
    W, H = 760, 170
    rng = Seeded("portal:v1")
    style = (star_style("p", 30) +
             ".pr1{transform-box:fill-box;transform-origin:center;animation:psp 18s linear infinite}"
             ".pr2{transform-box:fill-box;transform-origin:center;animation:psp 11s linear infinite reverse}"
             "@keyframes psp{to{transform:rotate(360deg)}}"
             ".pc{animation:ppl 4s ease-in-out infinite}@keyframes ppl{0%,100%{opacity:.7}50%{opacity:1}}"
             f".ttl{{font-family:{SANS};letter-spacing:.3em}}.mono{{font-family:{MONO}}}")
    defs = ('<radialGradient id="pcore"><stop offset="0" stop-color="#f5f3ff"/><stop offset=".25" stop-color="#a78bfa"/>'
            '<stop offset=".6" stop-color="#0e7490" stop-opacity=".7"/><stop offset="1" stop-color="#05060f" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="pedge" x1="0" x2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset=".5" stop-color="#a78bfa"/><stop offset="1" stop-color="#f0abfc"/></linearGradient>'
            '<filter id="pglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')
    t = head(W, H, "zp", "Talk to Zeref", "A glowing swirl portal button. Pressing it opens a Talk to Zeref GitHub issue; his replies are posted unedited.", style, defs)
    a = t.append
    a(f'<rect x="2" y="2" width="{W-4}" height="{H-4}" rx="{(H-4)/2}" fill="#070818" stroke="url(#pedge)" stroke-width="3"/>')
    t += starfield(rng, W, H, 60, 3, "p")
    a('<g transform="translate(92 85)">')
    a('<circle r="62" fill="url(#pcore)" class="pc"/>')
    a('<g class="pr1">' + "".join(
        f'<path d="M0 0 Q{30*math.cos(k*math.pi/3+.6):.1f} {30*math.sin(k*math.pi/3+.6):.1f} {58*math.cos(k*math.pi/3):.1f} {58*math.sin(k*math.pi/3):.1f}" fill="none" stroke="#67e8f9" stroke-opacity=".8" stroke-width="2.4" stroke-linecap="round"/>'
        for k in range(6)) + "</g>")
    a('<g class="pr2"><circle r="50" fill="none" stroke="#f0abfc" stroke-width="2" stroke-dasharray="6 9" filter="url(#pglow)"/></g>')
    a("</g>")
    a(f'<text x="190" y="80" class="ttl" font-size="34" font-weight="800" fill="url(#pedge)">TALK TO ZEREF</text>')
    a(f'<text x="192" y="112" class="mono" font-size="14" fill="#c4b5fd">step through · opens a GitHub issue · his replies are his own, unedited</text>')
    a(f'<text x="192" y="136" class="mono" font-size="12" fill="#7dd3fc">chats are training_eligible:false · he grows only through his fair gate</text>')
    a("</svg>")
    return "\n".join(t) + "\n"


def divider() -> str:
    W, H = 1200, 60
    rng = Seeded("divider:v1")
    style = (star_style("v", 20) + ".dv{stroke-dasharray:3 9;animation:dvm 12s linear infinite}@keyframes dvm{to{stroke-dashoffset:-240}}"
             ".dm{transform-box:fill-box;transform-origin:center;animation:dmr 9s ease-in-out infinite}@keyframes dmr{0%,100%{opacity:.75}50%{opacity:1}}")
    defs = ('<linearGradient id="dl" x1="0" x2="1"><stop offset="0" stop-color="#67e8f9" stop-opacity="0"/><stop offset=".3" stop-color="#67e8f9"/>'
            '<stop offset=".5" stop-color="#a78bfa"/><stop offset=".7" stop-color="#f0abfc"/><stop offset="1" stop-color="#f0abfc" stop-opacity="0"/></linearGradient>')
    t = head(W, H, "zv", "Cosmic divider", "A thin glowing line of stars with a small crescent moon in the middle.", style, defs)
    a = t.append
    a(f'<rect x="1" y="6" width="{W-2}" height="{H-12}" rx="{(H-12)/2}" fill="#05060f"/>')
    t += starfield(rng, W, H, 45, 3, "v")
    a(f'<line x1="40" y1="30" x2="{W-40}" y2="30" stroke="url(#dl)" stroke-width="2" class="dv"/>')
    a(f'<g class="dm"><circle cx="{W/2}" cy="30" r="15" fill="#05060f" stroke="#a78bfa" stroke-width="1.5"/>'
      f'<path d="M{W/2+5} 20 A11 11 0 1 0 {W/2+5} 40 A8.5 8.5 0 1 1 {W/2+5} 20 Z" fill="#c4b5fd"/></g>')
    a("</svg>")
    return "\n".join(t) + "\n"


def constellation(facts: list[dict], explored_at: str | None) -> str:
    """Each star is a real public repo. Size from real stars; brightness from days since last push."""
    from datetime import datetime, timezone
    W, H = 1200, 680
    now = datetime.now(timezone.utc)
    if explored_at:
        try:
            now = datetime.strptime(explored_at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    rng = Seeded("constellation:" + ",".join(f["name"] or "" for f in facts))
    style = (star_style("k", 45) + ".kl{stroke-dasharray:2 6;animation:kld 20s linear infinite}@keyframes kld{to{stroke-dashoffset:-160}}"
             ".kh{animation:khp 4s ease-in-out infinite}@keyframes khp{0%,100%{opacity:.55}50%{opacity:1}}"
             f".ttl{{font-family:{SANS};letter-spacing:.3em}}.mono{{font-family:{MONO}}}")
    defs = ('<radialGradient id="kbg" cx=".5" cy=".5" r=".75"><stop offset="0" stop-color="#140c33"/><stop offset="1" stop-color="#04050d"/></radialGradient>'
            '<filter id="kglow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
            + nebula_defs())
    desc = (f"Constellation of NavisWORLD's {len(facts)} public repositories as explored {explored_at or UNAV}. "
            "Each star is a real repo, ordered by most recent push from the centre outward; size grows with its GitHub stars, "
            "brightness with how recently it was pushed. Repo list with links is in zeref/notes.md.")
    t = head(W, H, "zk", "Zeref's constellation of Cory's repos", desc, style, defs)
    a = t.append
    a(f'<rect width="{W}" height="{H}" rx="24" fill="url(#kbg)"/>')
    a(neb(600, 360, 520, 260, "#6d28d9", .35))
    a(neb(300, 200, 260, 120, "#0891b2", .3))
    a(neb(950, 520, 280, 120, "#c026d3", .22))
    t += starfield(rng, W, H, 180, 3, "k")
    cx, cy = W / 2, H / 2 + 34
    pts = []
    for i, f in enumerate(facts):
        th = i * 2.399963  # golden angle: an even spiral, deterministic
        r = 46 + 26 * math.sqrt(i) * 3.1
        x, y = cx + r * math.cos(th), cy + r * math.sin(th) * 0.55
        days = None
        try:
            days = (now - datetime.strptime(f["pushed_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).days
        except Exception:
            pass
        bright = 1.0 if days is None else max(0.35, 1 - days / 200)
        size = 3.2 + 2.6 * math.log2(1 + (f.get("stars") or 0)) + (2.2 if days is not None and days < 14 else 0)
        pts.append((x, y, size, bright, f, days))
    # constellation lines in push order
    segs = []
    for i in range(1, len(pts)):
        x, y = pts[i][:2]
        j = min(range(i), key=lambda k: (pts[k][0] - x) ** 2 + (pts[k][1] - y) ** 2)
        segs.append(f"M{pts[j][0]:.1f} {pts[j][1]:.1f}L{x:.1f} {y:.1f}")
    a(f'<path d="{" ".join(segs)}" fill="none" stroke="#a5b4fc" stroke-opacity=".45" stroke-width="1.2" class="kl"/>')
    for i, (x, y, size, bright, f, days) in enumerate(pts):
        col = "#67e8f9" if i % 3 == 0 else ("#c4b5fd" if i % 3 == 1 else "#f0abfc")
        cls = ' class="kh"' if days is not None and days < 14 else ""
        a(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{size:.1f}" fill="{col}" fill-opacity="{bright:.2f}" filter="url(#kglow)"{cls}/>')
        name = (f["name"] or "").strip("-")
        name = name if len(name) <= 24 else name[:23] + "…"
        anchor = "start" if x >= cx else "end"
        dx = size + 6 if x >= cx else -(size + 6)
        a(f'<text x="{x+dx:.1f}" y="{y+4:.1f}" text-anchor="{anchor}" class="mono" font-size="11" fill="#e0e7ff" fill-opacity="{0.45 + 0.55*bright:.2f}">{escape(name)}</text>')
    a(f'<text x="40" y="52" class="ttl" font-size="22" font-weight="800" fill="#e0e7ff">ZEREF’S CONSTELLATION</text>')
    a(f'<text x="40" y="76" class="mono" font-size="12.5" fill="#67e8f9">{len(facts)} real public repos · explored {escape(explored_at or UNAV)} · centre = most recent push</text>')
    a(f'<text x="40" y="{H-22}" class="mono" font-size="11.5" fill="#94a3b8">star size = GitHub stars (log) · brightness = days since last push · pulsing = pushed in the last 14 days · links in zeref/notes.md</text>')
    a("</svg>")
    return "\n".join(t) + "\n"
