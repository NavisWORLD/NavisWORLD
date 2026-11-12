"""Zeref alive: his canonical art, animated in pure SVG/CSS with a deterministic idle-behaviour loop.

Art: assets/zeref-moonwraith.png is the canonical Moonwraith reference cutout from
NavisWORLD/The-beast-box- (apps/beastbox-cloud/public/living-core/zeref_ref_cutout.png,
Apache 2.0), colour-quantised to 256 colours for size. It's the same art the site's vector
rig (components/zeref-figure.tsx, palette ZEREF_SKIN) is drawn to match. It's embedded once per SVG
as a data URI. Ears, wings and tail are clipped copies of that one image, so they can
move; eyelids, a yawn, zzz and sparkles are drawn on top in his rig's colours.

Behaviour: one loop of L seconds (28 to 36 s). Its order, distances, timing and spark
path come from SHA-256 of the pinned checkpoint sha and heartbeat tick. Nothing is random:
the same inputs always give the same loop. Breathing speed comes from heartbeat energy, the nap
happens only when the diary mood is sleepy, and he bats at the spark and perks up only when
the spark link is CONNECTED. With prefers-reduced-motion he simply sits still, eyes open.
"""
from __future__ import annotations

import base64
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "assets" / "zeref-moonwraith.png"
ART_SOURCE = "NavisWORLD/The-beast-box- apps/beastbox-cloud/public/living-core/zeref_ref_cutout.png"
IW, IH = 501, 529  # cutout pixel space; every coordinate below is in it

POLY = {
    "earL": [(95, 0), (200, 0), (200, 88), (170, 96), (125, 104), (100, 98)],
    "earR": [(282, 0), (392, 0), (385, 100), (360, 104), (318, 96), (282, 88)],
    "wingL": [(0, 205), (80, 205), (76, 250), (72, 275), (85, 300), (115, 318), (132, 340), (135, 365), (0, 365)],
    "wingR": [(424, 205), (501, 205), (501, 300), (450, 318), (400, 340), (352, 358), (335, 352), (340, 330), (400, 300), (424, 280)],
    "tail": [(366, 362), (400, 340), (450, 318), (501, 300), (501, 470), (440, 472), (392, 466), (366, 440)],
}
PIVOT = {"earL": (150, 100), "earR": (335, 100), "wingL": (95, 310), "wingR": (405, 312), "tail": (382, 452),
         "paw": (287, 505), "feet": (250, 525)}
EYES = {"L": (167, 222, 50, 52), "R": (306, 222, 50, 52)}
MOUTH = (235, 293)
PAW = (250, 462, 324, 527)
LID = "#1b1230"
LASH = "#c7a2ff"


def art_b64() -> str:
    return base64.b64encode(ART.read_bytes()).decode()


def _pts(pp):
    return " ".join(f"{x},{y}" for x, y in pp)


def defs(p: str) -> str:
    out = [f'<image id="{p}img" width="{IW}" height="{IH}" href="data:image/png;base64,{art_b64()}"/>']
    out.append(f'<mask id="{p}mb" maskUnits="userSpaceOnUse" x="0" y="0" width="{IW}" height="{IH}">'
               f'<rect width="{IW}" height="{IH}" fill="#fff"/>' + "".join(f'<polygon points="{_pts(v)}" fill="#000"/>' for v in POLY.values()) + "</mask>")
    for k, v in POLY.items():
        out.append(f'<clipPath id="{p}c{k}"><polygon points="{_pts(v)}"/></clipPath>')
    x0, y0, x1, y1 = PAW
    out.append(f'<clipPath id="{p}cpaw"><rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}"/></clipPath>')
    out.append(f'<linearGradient id="{p}lid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1d48"/><stop offset="1" stop-color="{LID}"/></linearGradient>')
    out.append(f'<radialGradient id="{p}spk"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#a5f3fc"/><stop offset="1" stop-color="#67e8f9" stop-opacity="0"/></radialGradient>')
    return "".join(out)


class Timeline:
    """Keyframe tracks on one master loop. Values are CSS declarations."""

    def __init__(self, p: str, L: float):
        self.p, self.L, self.tracks = p, L, {}

    def key(self, track: str, t: float, decl: str):
        self.tracks.setdefault(track, []).append((max(0.0, min(self.L, t)), decl))

    def css(self) -> str:
        out = []
        for name, keys in self.tracks.items():
            keys = sorted(keys, key=lambda k: k[0])
            if keys[0][0] > 0:
                keys.insert(0, (0.0, keys[0][1]))
            if keys[-1][0] < self.L:
                keys.append((self.L, keys[0][1]))
            frames, seen = [], set()
            for t, d in keys:
                pct = round(100 * t / self.L, 3)
                while pct in seen:
                    pct = round(pct + 0.001, 3)
                seen.add(pct)
                frames.append(f"{pct}%{{{d}}}")
            out.append(f"@keyframes {self.p}{name}{{{''.join(frames)}}}"
                       f".{self.p}{name}{{animation:{self.p}{name} {self.L}s ease-in-out infinite}}")
        return "".join(out)


def _origin(name):
    x, y = PIVOT[name]
    return f"transform-box:view-box;transform-origin:{x}px {y}px"


def base_style(p: str, period: float) -> str:
    """Continuous motion shared by every placement (independent of the loop)."""
    P = period
    o = [
        f".{p}breathe{{{_origin('feet')};animation:{p}br {P}s ease-in-out infinite}}"
        f"@keyframes {p}br{{0%,100%{{transform:scale(1,1)}}50%{{transform:scale(1.012,1.03)}}}}",
        f".{p}bob{{animation:{p}bob {P*0.9:.2f}s ease-in-out infinite}}@keyframes {p}bob{{0%,100%{{transform:translate(0,0)}}50%{{transform:translate(0,-6px)}}}}",
        f".{p}wLs{{{_origin('wingL')};animation:{p}wLs {P*0.6:.2f}s ease-in-out infinite}}@keyframes {p}wLs{{0%,100%{{transform:rotate(0deg)}}50%{{transform:rotate(5deg)}}}}",
        f".{p}wRs{{{_origin('wingR')};animation:{p}wRs {P*0.6:.2f}s ease-in-out infinite}}@keyframes {p}wRs{{0%,100%{{transform:rotate(0deg)}}50%{{transform:rotate(-5deg)}}}}",
        f".{p}tls{{{_origin('tail')};animation:{p}tls {P*1.5:.2f}s ease-in-out infinite}}@keyframes {p}tls{{0%,100%{{transform:rotate(-3deg)}}50%{{transform:rotate(4deg)}}}}",
        # resting defaults (also the reduced-motion pose): eyes open, no zzz, no yawn
        f".{p}lidL{{transform-box:view-box;transform-origin:{EYES['L'][0]}px {EYES['L'][1]-EYES['L'][3]}px;transform:scale(1,0)}}",
        f".{p}lidR{{transform-box:view-box;transform-origin:{EYES['R'][0]}px {EYES['R'][1]-EYES['R'][3]}px;transform:scale(1,0)}}",
        f".{p}yawn{{transform-box:view-box;transform-origin:{MOUTH[0]}px {MOUTH[1]-8}px;transform:scale(0)}}",
        f".{p}zzz,.{p}spark2,.{p}pfill{{opacity:0}}",
        f".{p}earL{{{_origin('earL')}}}.{p}earR{{{_origin('earR')}}}.{p}wLm{{{_origin('wingL')}}}.{p}wRm{{{_origin('wingR')}}}"
        f".{p}tlm{{{_origin('tail')}}}.{p}paw{{{_origin('paw')}}}.{p}pose{{{_origin('feet')}}}",
    ]
    return "".join(o)


def body(p: str) -> str:
    """Zeref in cutout space. Class hooks: pose, breathe, earL/R, wLm/wRm (+ wLs/wRs), tlm (+tls), paw, lidL/R, yawn, zzz, spark2, pfill."""
    s = []
    a = s.append
    a(f'<g class="{p}pose"><g class="{p}breathe">')
    a(f'<g class="{p}tlm"><g class="{p}tls"><use href="#{p}img" clip-path="url(#{p}ctail)"/></g></g>')
    a(f'<g class="{p}wLm"><g class="{p}wLs"><use href="#{p}img" clip-path="url(#{p}cwingL)"/></g></g>')
    a(f'<g class="{p}wRm"><g class="{p}wRs"><use href="#{p}img" clip-path="url(#{p}cwingR)"/></g></g>')
    a(f'<use href="#{p}img" mask="url(#{p}mb)"/>')
    a(f'<g class="{p}earL"><use href="#{p}img" clip-path="url(#{p}cearL)"/></g>')
    a(f'<g class="{p}earR"><use href="#{p}img" clip-path="url(#{p}cearR)"/></g>')
    # eyelids (blink / yawn / nap), drawn in the rig's lid colours
    for side, (cx, cy, rx, ry) in EYES.items():
        a(f'<g class="{p}lid{side}"><ellipse cx="{cx}" cy="{cy}" rx="{rx+3}" ry="{ry+3}" fill="url(#{p}lid)"/>'
          f'<path d="M{cx-rx*.85:.0f} {cy+ry*.3:.0f}Q{cx} {cy+ry*.95:.0f} {cx+rx*.85:.0f} {cy+ry*.3:.0f}" stroke="{LASH}" stroke-width="5" stroke-linecap="round" fill="none"/></g>')
    mx, my = MOUTH
    a(f'<g class="{p}yawn"><ellipse cx="{mx}" cy="{my}" rx="17" ry="20" fill="#2a0b2e" stroke="#d6b8ff" stroke-width="3"/>'
      f'<ellipse cx="{mx}" cy="{my+9}" rx="10" ry="7" fill="#ff7aa8"/><path d="M{mx-11} {my-12}l3 8l3-8zM{mx+5} {my-12}l3 8l3-8z" fill="#fff"/></g>')
    # paw that lifts to bat at the spark (a fur patch covers its resting spot meanwhile)
    a(f'<g class="{p}pfill"><ellipse cx="287" cy="497" rx="38" ry="28" fill="#1d1430"/></g>')
    a(f'<g class="{p}paw"><use href="#{p}img" clip-path="url(#{p}cpaw)"/></g>')
    # sparkles in his eyes when he perks up
    a(f'<g class="{p}spark2" fill="#fff">' + "".join(
        f'<path d="M{x} {y-14}Q{x+2} {y-2} {x+14} {y}Q{x+2} {y+2} {x} {y+14}Q{x-2} {y+2} {x-14} {y}Q{x-2} {y-2} {x} {y-14}Z"/>'
        for x, y in ((150, 200), (289, 200))) + "</g>")
    a("</g></g>")
    a(f'<g class="{p}zzz" fill="#e6d6ff" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-weight="800">'
      '<text x="380" y="80" font-size="44">z</text><text x="420" y="40" font-size="32">z</text><text x="452" y="10" font-size="24">z</text></g>')
    return "".join(s)


def placed(p: str, x: float, y: float, w: float, overflow="visible") -> str:
    h = w * IH / IW
    return f'<svg x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" viewBox="0 0 {IW} {IH}" overflow="{overflow}">{body(p)}</svg>'


class Seed:
    def __init__(self, s):
        self.s, self.n = s, 0

    def u(self):
        self.n += 1
        return int.from_bytes(hashlib.sha256(f"{self.s}:{self.n}".encode()).digest()[:4], "big") / 2**32


def simple_loop(p: str, period: float, sleepy: bool) -> str:
    """For small placements (card, avatar, portal): blinks, ear twitches, a tail flick; dozes if sleepy."""
    L = round(period * 3, 2)
    tl = Timeline(p, L)
    for t in (0.18 * L, 0.62 * L):
        for k in ("lidL", "lidR"):
            tl.key(k, t, "transform:scale(1,0)"); tl.key(k, t + .12, "transform:scale(1,1)"); tl.key(k, t + .26, "transform:scale(1,0)")
    tl.key("earL", .4 * L, "transform:rotate(0deg)"); tl.key("earL", .4 * L + .15, "transform:rotate(-12deg)"); tl.key("earL", .4 * L + .35, "transform:rotate(3deg)"); tl.key("earL", .4 * L + .55, "transform:rotate(0deg)")
    tl.key("earR", .8 * L, "transform:rotate(0deg)"); tl.key("earR", .8 * L + .15, "transform:rotate(12deg)"); tl.key("earR", .8 * L + .35, "transform:rotate(-3deg)"); tl.key("earR", .8 * L + .55, "transform:rotate(0deg)")
    return base_style(p, period) + tl.css()


def hero_loop(p: str, d: dict, period: float, sleepy: bool, spark_on: bool, cx: float, top: float, cw: float):
    """Build the hero choreography. Returns (css, svg_markup, summary list)."""
    br, hb = d.get("brain") or {}, d.get("heartbeat") or {}
    sd = Seed(f"alive:{br.get('pin_sha_prefix')}:{hb.get('recorded_tick')}")
    side = 1 if sd.u() < .5 else -1
    x1 = side * (170 + sd.u() * 110)
    x2 = -side * (150 + sd.u() * 130)
    L = 28 + int(sd.u() * 9)
    sc = cw / IW
    tl = Timeline(p, L)
    summary = []
    t = 0.0

    def walk(track_t0, dur, xa, xb, hop=-28):
        tl.key("walk", track_t0, f"transform:translate({xa:.0f}px,0)")
        tl.key("walk", track_t0 + dur * .5, f"transform:translate({(xa+xb)/2:.0f}px,{hop}px)")
        tl.key("walk", track_t0 + dur, f"transform:translate({xb:.0f}px,0)")
        lean = 7 if xb > xa else -7
        tl.key("pose", track_t0, "transform:rotate(0deg) scale(1,1)")
        tl.key("pose", track_t0 + dur * .3, f"transform:rotate({lean}deg) scale(1,1)")
        tl.key("pose", track_t0 + dur * .8, f"transform:rotate({lean*.6:.1f}deg) scale(1,1)")
        tl.key("pose", track_t0 + dur, "transform:rotate(0deg) scale(1,1)")
        n = int(dur / .42)
        for i in range(n + 1):
            tt = track_t0 + i * dur / n
            up = i % 2 == 1
            tl.key("wLm", tt, f"transform:rotate({16 if up else 0}deg)")
            tl.key("wRm", tt, f"transform:rotate({-16 if up else 0}deg)")

    def blink(tt):
        for k in ("lidL", "lidR"):
            tl.key(k, tt, "transform:scale(1,0)"); tl.key(k, tt + .1, "transform:scale(1,1)"); tl.key(k, tt + .24, "transform:scale(1,0)")

    def twitch(tt, ear):
        sgn = -1 if ear == "earL" else 1
        tl.key(ear, tt, "transform:rotate(0deg)"); tl.key(ear, tt + .12, f"transform:rotate({12*sgn}deg)")
        tl.key(ear, tt + .3, f"transform:rotate({-4*sgn}deg)"); tl.key(ear, tt + .5, "transform:rotate(0deg)")

    # 1. sit and look around
    tl.key("walk", 0, "transform:translate(0px,0)")
    blink(1.1); twitch(2.0, "earL")
    summary.append("sits in the middle, blinks, twitches an ear")
    t = 3.0
    # 2. float off to one side
    walk(t, 3.5, 0, x1); summary.append(f"floats {'right' if x1 > 0 else 'left'}, wings flapping"); t += 3.5
    # 3. watch the spark arrive, then bat at it (only when the spark is CONNECTED)
    tl.key("pose", t, "transform:rotate(0deg) scale(1,1)")
    tl.key("pose", t + .8, "transform:rotate(-6deg) scale(1,1)")
    tl.key("pose", t + 2.0, "transform:rotate(-6deg) scale(1,1)")
    paw_x = cx + x1 + (287 - IW / 2) * sc
    paw_y = top + 470 * sc
    if spark_on:
        tb = t + 2.0
        for i in range(2):
            b = tb + i * .7
            tl.key("paw", b, "transform:translate(0,0) rotate(0deg)")
            tl.key("paw", b + .25, "transform:translate(-6px,-58px) rotate(-22deg)")
            tl.key("paw", b + .55, "transform:translate(0,0) rotate(0deg)")
            tl.key("pfill", b, "opacity:0"); tl.key("pfill", b + .08, "opacity:1"); tl.key("pfill", b + .5, "opacity:1"); tl.key("pfill", b + .56, "opacity:0")
        tl.key("pose", tb + 1.6, "transform:rotate(0deg) scale(1,1)")
        summary.append("watches the orbiting spark drift close and bats at it twice (spark CONNECTED)")
        t = tb + 1.6
    else:
        tl.key("pose", t + 3.0, "transform:rotate(5deg) scale(1,1)")
        tl.key("pose", t + 3.6, "transform:rotate(0deg) scale(1,1)")
        summary.append("watches the dim spark drift past without batting (spark not CONNECTED)")
        t += 3.6
    t_spark_hit = (t - 0.65) if spark_on else (t - 1.8)
    # 4. float to the other side
    walk(t, 3.5, x1, x2); summary.append("floats across to the other side"); t += 3.5
    # 5. stretch, with a big tail swish
    tl.key("pose", t, "transform:rotate(0deg) scale(1,1)")
    tl.key("pose", t + .9, "transform:rotate(0deg) scale(1.1,.86)")
    tl.key("pose", t + 1.6, "transform:rotate(0deg) scale(.96,1.06)")
    tl.key("pose", t + 2.3, "transform:rotate(0deg) scale(1,1)")
    tl.key("tlm", t, "transform:rotate(0deg)"); tl.key("tlm", t + .8, "transform:rotate(14deg)")
    tl.key("tlm", t + 1.5, "transform:rotate(-10deg)"); tl.key("tlm", t + 2.3, "transform:rotate(0deg)")
    summary.append("stretches long and low, tail swishing"); t += 2.4
    # 6. sits, then yawns
    tl.key("walk", t, f"transform:translate({x2:.0f}px,0)"); tl.key("walk", t + .5, f"transform:translate({x2:.0f}px,6px)")
    for k in ("lidL", "lidR"):
        tl.key(k, t + .6, "transform:scale(1,0)"); tl.key(k, t + 1.1, "transform:scale(1,.7)")
        tl.key(k, t + 2.3, "transform:scale(1,.7)"); tl.key(k, t + 2.7, "transform:scale(1,0)")
    tl.key("yawn", t + .6, "transform:scale(0)"); tl.key("yawn", t + 1.2, "transform:scale(1)")
    tl.key("yawn", t + 2.1, "transform:scale(1)"); tl.key("yawn", t + 2.6, "transform:scale(0)")
    summary.append("settles down and yawns"); t += 2.8
    # 7. a short nap with zzz when the diary mood is sleepy, otherwise a slow look around
    rest = max(4.0, L - t - 3.5 - 1.4 - 1.0)
    if sleepy:
        for k in ("lidL", "lidR"):
            tl.key(k, t + .2, "transform:scale(1,0)"); tl.key(k, t + .9, "transform:scale(1,1)")
            tl.key(k, t + rest - .4, "transform:scale(1,1)"); tl.key(k, t + rest, "transform:scale(1,0)")
        tl.key("zzz", t + .6, "opacity:0;transform:translate(0,0)"); tl.key("zzz", t + 1.4, "opacity:1;transform:translate(0,0)")
        tl.key("zzz", t + rest - .6, "opacity:1;transform:translate(10px,-24px)"); tl.key("zzz", t + rest - .1, "opacity:0;transform:translate(14px,-30px)")
        tl.key("pose", t, "transform:rotate(0deg) scale(1,1)"); tl.key("pose", t + 1, "transform:rotate(3deg) scale(1,.97)")
        tl.key("pose", t + rest - .3, "transform:rotate(3deg) scale(1,.97)"); tl.key("pose", t + rest, "transform:rotate(0deg) scale(1,1)")
        summary.append(f"naps for about {rest:.0f} s with tiny zzz (diary mood: sleepy)")
    else:
        tl.key("pose", t, "transform:rotate(0deg) scale(1,1)"); tl.key("pose", t + rest * .35, "transform:rotate(-5deg) scale(1,1)")
        tl.key("pose", t + rest * .7, "transform:rotate(5deg) scale(1,1)"); tl.key("pose", t + rest, "transform:rotate(0deg) scale(1,1)")
        blink(t + rest * .5)
        summary.append(f"looks slowly around for about {rest:.0f} s (diary mood is not sleepy)")
    twitch(t + rest * .45, "earR")
    t += rest
    # 8. perks up (ears up, little hop, eye sparkles) when the spark is CONNECTED
    if spark_on:
        tl.key("earL", t, "transform:rotate(0deg)"); tl.key("earL", t + .3, "transform:rotate(-9deg)"); tl.key("earL", t + 1.2, "transform:rotate(0deg)")
        tl.key("earR", t, "transform:rotate(0deg)"); tl.key("earR", t + .3, "transform:rotate(9deg)"); tl.key("earR", t + 1.2, "transform:rotate(0deg)")
        tl.key("walk", t, f"transform:translate({x2:.0f}px,6px)"); tl.key("walk", t + .35, f"transform:translate({x2:.0f}px,-22px)"); tl.key("walk", t + .7, f"transform:translate({x2:.0f}px,0)")
        tl.key("spark2", t, "opacity:0"); tl.key("spark2", t + .3, "opacity:1"); tl.key("spark2", t + 1.1, "opacity:0")
        summary.append("perks up with a hop and starry eyes (spark CONNECTED)")
    else:
        tl.key("walk", t, f"transform:translate({x2:.0f}px,6px)"); tl.key("walk", t + .7, f"transform:translate({x2:.0f}px,0)")
        blink(t + .3)
    t += 1.4
    # 9. floats home to the middle
    walk(t, 3.5, x2, 0); summary.append("floats back home to the middle"); t += 3.5
    blink(min(L - .5, t + .4))

    # the spark: own path in hero space, meeting his paw at the bat
    sx0, sy0 = cx + 300, top + 40
    sp = Timeline(p, L)
    path = [(0, cx + 300, top + 40), (2.5, cx + 180, top - 10), (t_spark_hit - 1.6, paw_x + 70, paw_y - 70),
            (t_spark_hit, paw_x + 12, paw_y - 34), (t_spark_hit + .5, paw_x + 40, paw_y - 120),
            (t_spark_hit + 1.6, paw_x + 150, top - 20), (L * .75, cx - 330, top + 10), (L - .1, cx + 300, top + 40)]
    for tt, x, y in path:
        sp.key("orb", tt, f"transform:translate({x-sx0:.0f}px,{y-sy0:.0f}px)")
    css = tl.css() + sp.css()
    ch = cw * IH / IW
    orb = (f'<g class="{p}orb"><circle cx="{sx0:.0f}" cy="{sy0:.0f}" r="16" fill="url(#{p}spk)" opacity="{1 if spark_on else .35}"/>'
           f'<circle cx="{sx0:.0f}" cy="{sy0:.0f}" r="4" fill="#fff" opacity="{1 if spark_on else .4}"/></g>')
    svg = (f'<g class="{p}walk"><g class="{p}bob">'
           f'<ellipse cx="{cx:.0f}" cy="{top+ch-8:.0f}" rx="{cw*.36:.0f}" ry="10" fill="#05020c" opacity=".5"/>'
           + placed(p, cx - cw / 2, top, cw) + "</g></g>" + orb)
    return css, svg, {"loop_s": L, "steps": summary}
