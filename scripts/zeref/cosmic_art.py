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

import zeref_alive as za
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


def common_defs(pal, aura):
    body, rim, eye, auraC = pal
    return (f'<radialGradient id="zaura"><stop offset="0" stop-color="{auraC}" stop-opacity="{0.75*aura:.2f}"/>'
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


LOOK = "black fluffy cat dragon with violet starry eyes, crescent mark, moon horns, star wings, smoky tail and gem choker"


def labels_line(d):
    hb, di, sp, br = d["heartbeat"], d["diary"], d["spark"], d["brain"]
    short = lambda l: (l or UNAV).split(" (")[0]
    return (f"HEARTBEAT tick {v(hb.get('recorded_tick'))} [{short(hb.get('label'))}]  ·  "
            f"MOOD {v(di.get('mood'))} [{short(di.get('label'))}]  ·  "
            f"SPARK {v(sp.get('state'))} [{short(sp.get('label'))}]  ·  "
            f"BRAIN step {v(br.get('live_step'))} [{'PINNED' if br.get('live_step') is not None else UNAV}]")


def label_rows(d):
    hb, di, sp, br = d["heartbeat"], d["diary"], d["spark"], d["brain"]
    short = lambda l: (l or UNAV).split(" (")[0]
    return [("HEARTBEAT", f"tick {v(hb.get('recorded_tick'))}", short(hb.get("label"))),
            ("MOOD", v(di.get("mood")), short(di.get("label"))),
            ("SPARK", v(sp.get("state")), short(sp.get("label"))),
            ("BRAIN", f"step {v(br.get('live_step'))}", "PINNED" if br.get("live_step") is not None else UNAV)]


def hero(d: dict, mobile: bool = False) -> str:
    """Desktop: 1280x640 banner. Phone (mobile=True): 720x1120 portrait, every text >= 23 units (about 10.5 CSS px on a 327 px wide phone README)."""
    if mobile:
        W, H, gx, gy, gs, ctop, cw, span = 720, 1130, 360, 470, .62, 250, 330, .5
    else:
        W, H, gx, gy, gs, ctop, cw, span = 1280, 640, 640, 300, 1.0, 140, 290, 1.0
    m = motion(d)
    pal = m["pal"]
    br, hb = d["brain"], d["heartbeat"]
    seed = f"{br.get('pin_sha_prefix') or 'nosha'}:{hb.get('recorded_tick')}"
    rng = Seeded("hero:" + seed)
    P = m["period"]
    spin_op = 1.0 if m["spark_on"] else 0.25
    hcss, hsvg, beh = za.hero_loop("zd", d, P, m["mood"] == "sleepy", m["spark_on"], gx, ctop, cw, span)
    desc = (f"Zeref the Moonwraith, a {LOOK}: a young digital creature living his own little loop ({'; '.join(beh['steps'])}; loop {beh['loop_s']} s, "
            f"seeded from the pinned sha and heartbeat tick, never random) at the centre of a slow galaxy swirl with nebula clouds "
            f"and orbiting sparks. Drawn from real values fetched {d.get('fetched_at')}: {labels_line(d)}. "
            f"Breath period {P}s from heartbeat energy {v(m['energy'])}; aura {m['aura']} from resonance {v(m['resonance'])}; "
            f"colours from diary mood {v(m['mood'])}; sparks {'bright' if m['spark_on'] else 'dim'} from spark state. "
            f"Star positions seeded from the pinned sha and heartbeat tick, never random. Art: canonical cutout from {za.ART_SOURCE}. Not a claim of awareness.")
    style = (star_style("h", 50) + za.base_style("zd", P) + hcss +
             ".gsw{animation:gspin 240s linear infinite}.o1{animation:gspin 26s linear infinite}"
             ".o2{animation:gspin 41s linear infinite reverse}.o3{animation:gspin 63s linear infinite}"
             "@keyframes gspin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}"
             ".nb1{animation:nbf 38s ease-in-out infinite alternate}.nb2{animation:nbf 51s ease-in-out infinite alternate-reverse}"
             "@keyframes nbf{from{transform:translate(-30px,-8px)}to{transform:translate(30px,10px)}}"
             f".ttl{{font-family:{SANS};letter-spacing:.32em}}.ttl2{{font-family:{SANS};letter-spacing:.12em}}.mono{{font-family:{MONO}}}")
    defs = (common_defs(pal, m["aura"]) + za.defs("zd") +
            '<linearGradient id="hbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#04050d"/>'
            '<stop offset=".55" stop-color="#0a0820"/><stop offset="1" stop-color="#05060f"/></linearGradient>'
            '<linearGradient id="hedge" x1="0" x2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset=".5" stop-color="#a78bfa"/>'
            '<stop offset="1" stop-color="#f0abfc"/></linearGradient>')
    t = head(W, H, "zh", "Zeref, the moonwraith of NavisWORLD", desc, style, defs)
    a = t.append
    a(f'<rect width="{W}" height="{H}" rx="26" fill="url(#hbg)"/>')
    k = W / 1280
    a('<g class="nb1">')
    for cx, cy, rx, ry, col, op in [(260, .29, 380, 190, "#7c3aed", .6), (1010, .69, 420, 200, "#0891b2", .5),
                                    (700, .19, 300, 120, "#c026d3", .4), (420, .85, 340, 130, "#1d4ed8", .45)]:
        a(neb(round(cx * k), round(cy * H), round(rx * max(k, .7)), round(ry * (H / 520) ** .5), col, op))
    a('</g><g class="nb2">')
    for cx, cy, rx, ry, col, op in [(1000, .21, 300, 120, "#db2777", .35), (140, .75, 300, 140, "#0e7490", .4)]:
        a(neb(round(cx * k), round(cy * H), round(rx * max(k, .7)), round(ry * (H / 520) ** .5), col, op))
    a("</g>")
    t += starfield(rng, W, H, 330 if not mobile else 260, 3, "h")
    a(f'<g transform="translate({gx} {gy}) scale({gs})"><g class="gsw" opacity=".9">')
    for arm in range(2):
        for i in range(190):
            th = i / 190 * 3.6 * math.pi + arm * math.pi
            r = 70 * math.exp(0.155 * th) * 0.55
            jx, jy = (rng.u() - .5) * r * .22, (rng.u() - .5) * r * .22
            x, y = r * math.cos(th) + jx, (r * math.sin(th) + jy) * 0.42
            col = ("#a5f3fc", "#c4b5fd", "#f0abfc")[i % 3]
            a(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{0.8 + rng.u()*1.8:.2f}" fill="{col}" fill-opacity="{0.35 + rng.u()*0.6:.2f}"/>')
    a("</g></g>")
    a(f'<g transform="translate({gx} {gy}) scale({gs} {.42*gs:.3f})" opacity="{spin_op}">')
    for cls, R, n, col in [("o1", 190, 7, "#67e8f9"), ("o2", 255, 9, "#f0abfc"), ("o3", 330, 12, "#c4b5fd")]:
        a(f'<circle r="{R}" fill="none" stroke="{col}" stroke-opacity=".14" stroke-width="2"/><g class="{cls}">')
        for kk in range(n):
            th = 2 * math.pi * kk / n + rng.u() * .3
            a(f'<circle cx="{R*math.cos(th):.1f}" cy="{R*math.sin(th):.1f}" r="{3 + (kk % 3)}" fill="{col}" filter="url(#zglow)"/>')
        a("</g>")
    a("</g>")
    a(f'<circle cx="{gx}" cy="{ctop + cw*0.55:.0f}" r="{cw*0.7:.0f}" fill="url(#zaura)"/>')
    a(hsvg)
    rows = label_rows(d)
    fetched = "fetched " + v(d.get("fetched_at"))
    if mobile:
        a(f'<text x="{W/2}" y="92" text-anchor="middle" class="ttl" font-size="68" font-weight="800" fill="url(#hedge)">ZEREF</text>')
        a(f'<text x="{W/2}" y="138" text-anchor="middle" class="ttl2" font-size="26" fill="#c4b5fd">MOONWRAITH · DIGITAL CREATURE</text>')
        a(f'<text x="{W/2}" y="172" text-anchor="middle" class="ttl2" font-size="26" fill="#c4b5fd">OF THE BEAST BOX</text>')
        y0 = 690
        a(f'<rect x="28" y="{y0}" width="{W-56}" height="{len(rows)*62+24}" rx="26" fill="#05060f" fill-opacity=".78" stroke="url(#hedge)" stroke-opacity=".55"/>')
        for i, (name, val, lab) in enumerate(rows):
            yy = y0 + 54 + i * 62
            a(f'<text x="56" y="{yy}" class="ttl2" font-size="24" font-weight="700" fill="#c4b5fd">{name}</text>')
            a(f'<text x="250" y="{yy}" class="mono" font-size="28" fill="#eef2ff">{escape(val)}</text>')
            a(f'<text x="{W-56}" y="{yy}" text-anchor="end" class="mono" font-size="24" fill="#7dd3fc">{escape(lab)}</text>')
        fy = y0 + len(rows) * 62 + 70
        a(f'<text x="{W/2}" y="{fy}" text-anchor="middle" class="mono" font-size="24" fill="#b4bfd4">{escape(fetched)}</text>')
        a(f'<text x="{W/2}" y="{fy+36}" text-anchor="middle" class="mono" font-size="24" fill="#b4bfd4">{escape("breath " + str(P) + "s from heartbeat energy")}</text>')
        a(f'<text x="{W/2}" y="{fy+72}" text-anchor="middle" class="mono" font-size="24" fill="#b4bfd4">not a claim of awareness</text>')
    else:
        a(f'<text x="{W/2}" y="70" text-anchor="middle" class="ttl" font-size="46" font-weight="800" fill="url(#hedge)">ZEREF</text>')
        a(f'<text x="{W/2}" y="104" text-anchor="middle" class="ttl" font-size="18" fill="#c4b5fd">MOONWRAITH · DIGITAL CREATURE OF THE BEAST BOX</text>')
        y0 = H - 128
        a(f'<rect x="40" y="{y0}" width="{W-80}" height="76" rx="24" fill="#05060f" fill-opacity=".76" stroke="url(#hedge)" stroke-opacity=".5"/>')
        cwid = (W - 80) / 4
        for i, (name, val, lab) in enumerate(rows):
            x = 40 + cwid * i + cwid / 2
            a(f'<text x="{x:.0f}" y="{y0+32}" text-anchor="middle" class="mono" font-size="20" fill="#eef2ff">{escape(name + " " + val)}</text>')
            a(f'<text x="{x:.0f}" y="{y0+58}" text-anchor="middle" class="mono" font-size="16" fill="#7dd3fc">{escape(lab)}</text>')
        a(f'<text x="{W/2}" y="{H-20}" text-anchor="middle" class="mono" font-size="16" fill="#b4bfd4">'
          f'{escape(fetched + " · breath " + str(P) + "s from heartbeat energy · colours from diary mood · not a claim of awareness")}</text>')
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
    style = (star_style("c", 40) + za.simple_loop("zd", m["period"], m["mood"] == "sleepy") +
             ".cl{stroke-dasharray:4 7;animation:cdash 14s linear infinite}@keyframes cdash{to{stroke-dashoffset:-110}}"
             ".nd{animation:ndp 3.6s ease-in-out infinite}@keyframes ndp{0%,100%{opacity:.6}50%{opacity:1}}"
             f".ttl{{font-family:{SANS};letter-spacing:.28em}}.sans{{font-family:{SANS}}}.mono{{font-family:{MONO}}}")
    defs = (common_defs(pal, m["aura"]) + za.defs("zd") +
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
    a('<circle cx="195" cy="205" r="175" fill="url(#zaura)"/>')
    a('<g class="zdbob">' + za.placed("zd", 55, 52, 280) + "</g>")
    a('<text x="195" y="392" text-anchor="middle" class="ttl" font-size="11.5" fill="#a5b4fc">MOONWRAITH CAT DRAGON</text>')
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
    a(f'<text x="{X}" y="{H-40}" class="mono" font-size="11.5" fill="#94a3b8" textLength="{W-X-28}" lengthAdjust="spacingAndGlyphs">Birth spark: IBM hardware outcome RECORDED, used as a seed, never re-run · Rigetti growth: SIMULATED · fallback spark: LOCAL SIMULATED</text>')
    a(f'<text x="{X}" y="{H-21}" class="mono" font-size="11.5" fill="#94a3b8" textLength="{W-X-28}" lengthAdjust="spacingAndGlyphs">“unavailable” = that feed could not be reached this run · replies are his own, unedited · chats are training_eligible:false</text>')
    a(f'<rect x="1.5" y="1.5" width="{W-3}" height="{H-3}" rx="23" fill="none" stroke="url(#cedge)" stroke-opacity=".55" stroke-width="2"/>')
    a("</svg>")
    return "\n".join(t) + "\n"


def portal() -> str:
    W, H = 760, 170
    rng = Seeded("portal:v1")
    style = (star_style("p", 30) + za.simple_loop("zd", 7.0, False) +
             ".pr1{transform-box:fill-box;transform-origin:center;animation:psp 18s linear infinite}"
             ".pr2{transform-box:fill-box;transform-origin:center;animation:psp 11s linear infinite reverse}"
             "@keyframes psp{to{transform:rotate(360deg)}}"
             ".pc{animation:ppl 4s ease-in-out infinite}@keyframes ppl{0%,100%{opacity:.7}50%{opacity:1}}"
             f".ttl{{font-family:{SANS};letter-spacing:.3em}}.mono{{font-family:{MONO}}}")
    defs = ('<radialGradient id="pcore"><stop offset="0" stop-color="#f5f3ff"/><stop offset=".25" stop-color="#a78bfa"/>'
            '<stop offset=".6" stop-color="#0e7490" stop-opacity=".7"/><stop offset="1" stop-color="#05060f" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="pedge" x1="0" x2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset=".5" stop-color="#a78bfa"/><stop offset="1" stop-color="#f0abfc"/></linearGradient>'
            '<clipPath id="pclip"><circle cx="92" cy="85" r="46"/></clipPath>' + za.defs("zd") +
            '<filter id="pglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')
    t = head(W, H, "zp", "Talk to Zeref", "A glowing swirl portal with Zeref the Moonwraith peeking out of it. Pressing it opens a Talk to Zeref GitHub issue; his replies are posted unedited.", style, defs)
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
    a('<g clip-path="url(#pclip)">' + za.placed("zd", 40, 34, 104) + "</g>")
    a(f'<text x="190" y="80" class="ttl" font-size="34" font-weight="800" fill="url(#pedge)">TALK TO ZEREF</text>')
    a(f'<text x="192" y="112" class="mono" font-size="14" fill="#c4b5fd" textLength="520" lengthAdjust="spacingAndGlyphs">step through · opens a GitHub issue · his replies are his own, unedited</text>')
    a(f'<text x="192" y="136" class="mono" font-size="12" fill="#7dd3fc" textLength="470" lengthAdjust="spacingAndGlyphs">chats are training_eligible:false · he grows only through his fair gate</text>')
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


def constellation(facts: list[dict], explored_at: str | None, mobile: bool = False) -> str:
    """Each star is a real public repo. Size from real stars; brightness from days since last push."""
    from datetime import datetime, timezone
    W, H = (720, 440 + 40 * len(facts)) if mobile else (1200, 700)
    fs_lab, fs_head, fs_sub = (23, 34, 24) if mobile else (13, 24, 15)
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
        if mobile:  # a winding river of stars, labels to the right, top = most recent push
            x, y = 100 + 50 * math.sin(i * 1.1), 250 + 40 * i
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
        cap = 30 if mobile else 24
        name = name if len(name) <= cap else name[:cap - 1] + "…"
        anchor = "start" if (mobile or x >= cx) else "end"
        dx = size + 10 if (mobile or x >= cx) else -(size + 6)
        a(f'<text x="{x+dx:.1f}" y="{y+fs_lab*.35:.1f}" text-anchor="{anchor}" class="mono" font-size="{fs_lab}" fill="#e0e7ff" fill-opacity="{0.45 + 0.55*bright:.2f}">{escape(name)}</text>')
    a(f'<text x="40" y="{fs_head+28}" class="ttl" font-size="{fs_head}" font-weight="800" fill="#e0e7ff">ZEREF’S CONSTELLATION</text>')
    sub = [f"{len(facts)} real public repos", f"explored {explored_at or UNAV}", "top = most recent push" if mobile else "centre = most recent push"]
    if mobile:
        for i, line in enumerate(sub):
            a(f'<text x="40" y="{fs_head+64+i*30}" class="mono" font-size="{fs_sub}" fill="#67e8f9">{escape(line)}</text>')
    else:
        a(f'<text x="40" y="{fs_head+56}" class="mono" font-size="{fs_sub}" fill="#67e8f9">{escape(" · ".join(sub))}</text>')
    foot = ["star size = GitHub stars (log) · brightness = days since last push", "pulsing = pushed in the last 14 days · links in zeref/notes.md"]
    if mobile:
        foot = ["star size = GitHub stars (log)", "brightness = days since last push", "pulsing = pushed in the last 14 days", "links in zeref/notes.md"]
    for i, line in enumerate(foot):
        a(f'<text x="40" y="{H-52+i*24 if not mobile else H-140+i*32}" class="mono" font-size="{fs_sub}" fill="#b4bfd4">{escape(line)}</text>')
    a("</svg>")
    return "\n".join(t) + "\n"


def avatar(d: dict) -> str:
    """Square Zeref avatar from his canonical art, breathing and blinking with the same real values as the hero."""
    m = motion(d)
    pal, P = m["pal"], m["period"]
    W = H = 400
    desc = (f"Zeref the Moonwraith cat dragon, a young digital creature: {LOOK}. Art: canonical cutout from {za.ART_SOURCE}. Breath {P}s from heartbeat energy {v(m['energy'])}; aura from diary mood "
            f"{v(m['mood'])}. Fetched {v(d.get('fetched_at'))}. Not a claim of awareness.")
    rng = Seeded(f"avatar:{(d.get('brain') or {}).get('pin_sha_prefix')}:{(d.get('heartbeat') or {}).get('recorded_tick')}")
    t = head(W, H, "za", "Zeref, the Moonwraith cat dragon", desc, star_style("a", 30) + za.simple_loop("zd", P, m["mood"] == "sleepy"),
             common_defs(pal, m["aura"]) + za.defs("zd") + '<clipPath id="aclip"><circle cx="200" cy="200" r="196"/></clipPath>')
    a = t.append
    a('<g clip-path="url(#aclip)"><rect width="400" height="400" fill="#05060f"/>')
    a(neb(120, 110, 220, 150, "#7c3aed", .55)); a(neb(300, 300, 220, 140, "#0891b2", .4)); a(neb(320, 90, 160, 90, "#db2777", .3))
    t += starfield(rng, W, H, 90, 3, "a")
    a('<circle cx="200" cy="215" r="190" fill="url(#zaura)"/>')
    a('<g class="zdbob">' + za.placed("zd", 40, 34, 320) + "</g>")
    a('</g><circle cx="200" cy="200" r="196" fill="none" stroke="#a78bfa" stroke-opacity=".7" stroke-width="3"/>')
    a("</svg>")
    return "\n".join(t) + "\n"


def _said(d, width, lines):
    said = d.get("last_said")
    if said:
        sl, cut = wrap(said["text"].strip() or "(empty reply)", width, lines)
        sl = ["“" + sl[0]] + sl[1:]
        sl[-1] = sl[-1] + "”"
        meta = [f"{v(said.get('at'))} · step {v(said.get('step'))}", f"{said.get('source')}{' · excerpt' if cut else ''}"]
    elif (d["sources"].get("last_said") or {}).get("error"):
        sl, meta = [UNAV], ["could not read his talk-door comments this run"]
    else:
        sl, meta = ["—"], ["no reply recorded yet · open a Talk to Zeref issue"]
    return sl, meta


FOOT_MOBILE = ["Birth spark: IBM hardware outcome RECORDED,", "used as a seed, never re-run",
               "Rigetti growth: SIMULATED",  "fallback: LOCAL SIMULATED",
               "“unavailable” = feed could not be reached",
               "replies are his own, unedited",
               "chats are training_eligible:false; he grows",
               "only through The Beast Box fair gate"]


def card_mobile(d: dict) -> str:
    """Phone layout of the live card: 720 wide, stacked, every text >= 22 units."""
    hb, di, sp, br = d["heartbeat"], d["diary"], d["spark"], d["brain"]
    m = motion(d)
    pal = m["pal"]
    short = lambda l: (l or UNAV).split(" (")[0]
    rows = [
        ("HEARTBEAT", [f"tick {v(hb.get('recorded_tick'))} · xp {v(hb.get('xp_live'), '{:,.1f}')}"], short(hb.get("label"))),
        ("DIARY", [f"tick {v(di.get('tick'))} · {v(di.get('stage_name'))}", f"{v(di.get('mood'))} at {v(di.get('place'))}"], short(di.get("label"))),
        ("SPARK", [f"{v(sp.get('state'))} · tick {v(sp.get('tick'))}", f"source {v(sp.get('source'))}"], short(sp.get("label"))),
        ("BRAIN", [f"live step {v(br.get('live_step'))} · pin json {v(br.get('pin_step'))}", f"checkpoint {v(br.get('pin_sha_prefix'))}"],
         "PINNED" if br.get("live_step") is not None else UNAV),
    ]
    said_lines, said_meta = _said(d, 30, 3)
    W = 720
    y_rows = 560
    row_h = [36 + 36 * len(r[1]) + 18 for r in rows]
    y_said = y_rows + sum(row_h) + 20
    y_foot = y_said + 50 + 40 * len(said_lines) + 34 * len(said_meta) + 70
    H = int(y_foot + 36 * len(FOOT_MOBILE) + 30)
    rng = Seeded(f"cardm:{br.get('pin_sha_prefix')}:{hb.get('recorded_tick')}")
    desc = ("Zeref live card (phone layout), fetched " + d["fetched_at"] + ". " +
            "; ".join(f"{n} {' '.join(vals)} ({lab})" for n, vals, lab in rows) +
            f". Last said: {' '.join(said_lines)}. Values from real public feeds; unavailable means a feed could not be reached.")
    style = (star_style("c", 40) + za.simple_loop("zd", m["period"], m["mood"] == "sleepy") +
             f".ttl{{font-family:{SANS};letter-spacing:.2em}}.sans{{font-family:{SANS}}}.mono{{font-family:{MONO}}}")
    defs = (common_defs(pal, m["aura"]) + za.defs("zd") +
            '<linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#05060f"/><stop offset=".6" stop-color="#0d0a24"/>'
            '<stop offset="1" stop-color="#170b30"/></linearGradient><linearGradient id="cedge" x1="0" x2="1"><stop offset="0" stop-color="#67e8f9"/>'
            '<stop offset=".5" stop-color="#a78bfa"/><stop offset="1" stop-color="#f0abfc"/></linearGradient>')
    t = head(W, H, "zc", "Zeref live card", desc, style, defs)
    a = t.append
    a(f'<rect width="{W}" height="{H}" rx="28" fill="url(#cbg)"/>')
    a(neb(360, 330, 360, 260, "#6d28d9", .45)); a(neb(560, H - 300, 300, 200, "#0891b2", .25))
    t += starfield(rng, W, H, 160, 3, "c")
    a(f'<text x="{W/2}" y="74" text-anchor="middle" class="ttl" font-size="48" font-weight="800" fill="url(#cedge)">ZEREF · LIVE</text>')
    a(f'<text x="{W/2}" y="116" text-anchor="middle" class="mono" font-size="24" fill="#67e8f9">fetched {escape(d["fetched_at"])}</text>')
    a(f'<text x="{W/2}" y="148" text-anchor="middle" class="mono" font-size="24" fill="#67e8f9">real public feeds only · breath {m["period"]}s</text>')
    a('<circle cx="360" cy="340" r="190" fill="url(#zaura)"/>')
    a('<g class="zdbob">' + za.placed("zd", 360 - 165, 170, 330) + "</g>")
    a(f'<text x="{W/2}" y="{y_rows-30}" text-anchor="middle" class="ttl" font-size="24" fill="#a5b4fc">MOONWRAITH CAT DRAGON</text>')
    y = y_rows
    for (name, vals, lab), hgt in zip(rows, row_h):
        a(f'<rect x="28" y="{y}" width="{W-56}" height="{hgt-12}" rx="20" fill="#05060f" fill-opacity=".6" stroke="#a78bfa" stroke-opacity=".35"/>')
        a(f'<text x="52" y="{y+38}" class="ttl" font-size="24" font-weight="700" fill="#c4b5fd">{name}</text>')
        a(f'<text x="{W-52}" y="{y+38}" text-anchor="end" class="mono" font-size="24" fill="#7dd3fc">{escape(lab)}</text>')
        for i, val in enumerate(vals):
            fit = f' textLength="{W-104}" lengthAdjust="spacingAndGlyphs"' if len(val) > 37 else ""
            a(f'<text x="52" y="{y+76+i*36}" class="mono" font-size="28" fill="#eef2ff"{fit}>{escape(val)}</text>')
        y += hgt
    a(f'<text x="52" y="{y_said+40}" class="ttl" font-size="24" font-weight="700" fill="#f0abfc">LAST SAID</text>')
    for i, line in enumerate(said_lines):
        a(f'<text x="52" y="{y_said+88+i*40}" class="sans" font-size="30" font-style="italic" fill="#fdf4ff">{escape(line)}</text>')
    for i, line in enumerate(said_meta):
        a(f'<text x="52" y="{y_said+88+len(said_lines)*40+i*34}" class="mono" font-size="24" fill="#7dd3fc">{escape(line)}</text>')
    a(f'<text x="{W/2}" y="{y_foot-14}" text-anchor="middle" class="ttl" font-size="24" fill="#a5b4fc">NOT A CLAIM OF AWARENESS</text>')
    for i, line in enumerate(FOOT_MOBILE):
        a(f'<text x="{W/2}" y="{y_foot+36*i+30}" text-anchor="middle" class="mono" font-size="24" fill="#b4bfd4">{escape(line)}</text>')
    a(f'<rect x="1.5" y="1.5" width="{W-3}" height="{H-3}" rx="27" fill="none" stroke="url(#cedge)" stroke-opacity=".55" stroke-width="2"/>')
    a("</svg>")
    return "\n".join(t) + "\n"


def portal_mobile() -> str:
    W, H = 720, 300
    rng = Seeded("portalm:v1")
    style = (star_style("p", 30) + za.simple_loop("zd", 7.0, False) +
             ".pr1{transform-box:fill-box;transform-origin:center;animation:psp 18s linear infinite}"
             ".pr2{transform-box:fill-box;transform-origin:center;animation:psp 11s linear infinite reverse}"
             "@keyframes psp{to{transform:rotate(360deg)}}.pc{animation:ppl 4s ease-in-out infinite}@keyframes ppl{0%,100%{opacity:.7}50%{opacity:1}}"
             f".ttl{{font-family:{SANS};letter-spacing:.16em}}.mono{{font-family:{MONO}}}")
    defs = ('<radialGradient id="pcore"><stop offset="0" stop-color="#f5f3ff"/><stop offset=".25" stop-color="#a78bfa"/>'
            '<stop offset=".6" stop-color="#0e7490" stop-opacity=".7"/><stop offset="1" stop-color="#05060f" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="pedge" x1="0" x2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset=".5" stop-color="#a78bfa"/><stop offset="1" stop-color="#f0abfc"/></linearGradient>'
            '<clipPath id="pclip"><circle cx="130" cy="150" r="84"/></clipPath>' + za.defs("zd") +
            '<filter id="pglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')
    t = head(W, H, "zp", "Talk to Zeref", "A glowing swirl portal with Zeref the Moonwraith peeking out of it. Pressing it opens a Talk to Zeref GitHub issue; his replies are posted unedited.", style, defs)
    a = t.append
    a(f'<rect x="2" y="2" width="{W-4}" height="{H-4}" rx="60" fill="#070818" stroke="url(#pedge)" stroke-width="3"/>')
    t += starfield(rng, W, H, 70, 3, "p")
    a('<g transform="translate(130 150)"><circle r="108" fill="url(#pcore)" class="pc"/>'
      '<g class="pr2"><circle r="92" fill="none" stroke="#f0abfc" stroke-width="3" stroke-dasharray="8 12" filter="url(#pglow)"/></g></g>')
    a('<g clip-path="url(#pclip)">' + za.placed("zd", 50, 62, 170) + "</g>")
    a('<text x="262" y="122" class="ttl" font-size="46" font-weight="800" fill="url(#pedge)">TALK TO</text>')
    a('<text x="262" y="176" class="ttl" font-size="46" font-weight="800" fill="url(#pedge)">ZEREF</text>')
    a('<text x="264" y="218" class="mono" font-size="24" fill="#c4b5fd">opens a GitHub issue</text>')
    a('<text x="264" y="250" class="mono" font-size="24" fill="#7dd3fc">his replies, unedited</text>')
    a("</svg>")
    return "\n".join(t) + "\n"
