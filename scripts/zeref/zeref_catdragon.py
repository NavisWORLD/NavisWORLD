"""Zeref the Moonwraith as a cat dragon: profile art only.

Drawn to match his canonical look in NavisWORLD/The-beast-box-:
  - components/zeref-figure.tsx (Cory's Moonwraith vector rig: black fluffy
    kitten-dragon, violet starry eyes, crescent forehead mark, crescent moon
    horns at the ear bases, star-membrane wings, smoky wisp tail, gem choker,
    glowing paw beans, blush, 'w' mouth)
  - lib/zeref/rig-style.mjs ZEREF_SKIN (the canonical palette used below)
  - public/living-core/zeref_ref_cutout.png (reference cutout)
This file never changes his canonical identity; it only draws him for the
GitHub profile. The cat-dragon extras (slit pupils, whiskers, chest scales,
bigger wings, a long spined tail) are styling on the same creature.

Coordinates follow the rig: a 400x400 body space, centred on x=200. The
drawing is wrapped in a nested <svg> so CSS transform-origins stay in that
space wherever it is placed. Animation speeds come from the breath period
passed in (derived from his real heartbeat energy); nothing is random.
"""
from __future__ import annotations

SKIN = {  # ZEREF_SKIN from The-beast-box- lib/zeref/rig-style.mjs
    "fur": ("#3a2a5e", "#1d1430", "#0b0714"), "furSolid": "#160f24", "lid": "#21163a", "stroke": "#5b3b96",
    "ear": ("#d6b4ff", "#7a46d8"), "iris": ("#f0e2ff", "#c69bff", "#7b3cf0", "#2a0d5e"),
    "wing": ("#3c1d78", "#8a4ff0", "#8fe8ff"), "moon": ("#fbf6ff", "#bfa0ff"),
    "tail": ("#0d0818", "#24173f", "#6b3fd0"), "beans": "#b98aff", "brow": "#7a5bb5", "mouth": "#d6b8ff",
    "accent": "#b57bff", "glow": "#8fe8ff",
}


def _star(x, y, r):
    return (f"M{x} {y-r}Q{x+r*.18:.2f} {y-r*.18:.2f} {x+r} {y}Q{x+r*.18:.2f} {y+r*.18:.2f} {x} {y+r}"
            f"Q{x-r*.18:.2f} {y+r*.18:.2f} {x-r} {y}Q{x-r*.18:.2f} {y-r*.18:.2f} {x} {y-r}Z")


def style(p: str, period: float) -> str:
    P = period
    return (
        f".{p}breathe{{transform-box:view-box;transform-origin:200px 352px;animation:{p}br {P}s ease-in-out infinite}}"
        f"@keyframes {p}br{{0%,100%{{transform:scale(1,1)}}50%{{transform:scale(1.018,1.035)}}}}"
        f".{p}head{{transform-box:view-box;transform-origin:200px 240px;animation:{p}hd {P}s ease-in-out infinite}}"
        f"@keyframes {p}hd{{0%,100%{{transform:translate(0,1.5px) rotate(-.6deg)}}50%{{transform:translate(0,-3px) rotate(.6deg)}}}}"
        f".{p}wing{{transform-box:view-box;transform-origin:238px 258px;animation:{p}wg {P*0.55:.2f}s ease-in-out infinite}}"
        f"@keyframes {p}wg{{0%,100%{{transform:rotate(0deg)}}50%{{transform:rotate(-9deg)}}}}"
        f".{p}tail{{transform-box:view-box;transform-origin:252px 328px;animation:{p}tl {P*1.7:.2f}s ease-in-out infinite}}"
        f"@keyframes {p}tl{{0%,100%{{transform:rotate(-5deg)}}50%{{transform:rotate(6deg)}}}}"
        f".{p}lid{{animation:{p}bl {P*1.45:.2f}s linear infinite}}"
        f"@keyframes {p}bl{{0%,90%,100%{{transform:translate(0,0)}}94%{{transform:translate(0,52px)}}}}"
        f".{p}ear{{transform-box:view-box;transform-origin:150px 130px;animation:{p}er {P*2.3:.2f}s ease-in-out infinite}}"
        f"@keyframes {p}er{{0%,80%,88%,100%{{transform:rotate(0deg)}}83%{{transform:rotate(-10deg)}}85%{{transform:rotate(4deg)}}}}"
        f".{p}glow{{animation:{p}gl {P}s ease-in-out infinite}}@keyframes {p}gl{{0%,100%{{opacity:.55}}50%{{opacity:1}}}}"
        f".{p}wisp{{animation:{p}ws {P*1.2:.2f}s ease-in-out infinite alternate}}"
        f"@keyframes {p}ws{{from{{transform:translate(0,0);opacity:.5}}to{{transform:translate(6px,-8px);opacity:.95}}}}"
    )


def defs(p: str, aura: str, aura_strength: float) -> str:
    s = SKIN
    return (
        f'<radialGradient id="{p}aura"><stop offset="0" stop-color="{aura}" stop-opacity="{0.7*aura_strength:.2f}"/>'
        f'<stop offset=".5" stop-color="#6a3fd1" stop-opacity="{0.25*aura_strength:.2f}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>'
        f'<radialGradient id="{p}fur" cx=".4" cy=".28" r=".9"><stop offset="0" stop-color="{s["fur"][0]}"/><stop offset=".45" stop-color="{s["fur"][1]}"/><stop offset="1" stop-color="{s["fur"][2]}"/></radialGradient>'
        f'<radialGradient id="{p}sheen" cx=".5" cy=".15" r=".6"><stop offset="0" stop-color="#b9a0ff" stop-opacity=".35"/><stop offset="1" stop-color="#b9a0ff" stop-opacity="0"/></radialGradient>'
        f'<radialGradient id="{p}iris" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="{s["iris"][0]}"/><stop offset=".25" stop-color="{s["iris"][1]}"/><stop offset=".6" stop-color="{s["iris"][2]}"/><stop offset="1" stop-color="{s["iris"][3]}"/></radialGradient>'
        f'<linearGradient id="{p}ear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{s["ear"][0]}"/><stop offset="1" stop-color="{s["ear"][1]}"/></linearGradient>'
        f'<linearGradient id="{p}wingg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="{s["wing"][0]}"/><stop offset=".55" stop-color="{s["wing"][1]}"/><stop offset="1" stop-color="{s["glow"]}"/></linearGradient>'
        f'<linearGradient id="{p}moon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{s["moon"][0]}"/><stop offset="1" stop-color="{s["moon"][1]}"/></linearGradient>'
        f'<linearGradient id="{p}tailg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="{s["tail"][0]}"/><stop offset=".6" stop-color="{s["tail"][1]}"/><stop offset="1" stop-color="{s["tail"][2]}"/></linearGradient>'
        f'<linearGradient id="{p}belly" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c1f4a"/><stop offset="1" stop-color="#120b22"/></linearGradient>'
        f'<filter id="{p}bloom" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
        f'<clipPath id="{p}bellyclip"><path d="M164 252C150 282 150 330 166 352L234 352C250 330 250 282 236 252Q200 238 164 252Z"/></clipPath>'
        f'<clipPath id="{p}eyeL"><ellipse cx="156" cy="176" rx="35" ry="39"/></clipPath>'
        f'<clipPath id="{p}eyeR"><ellipse cx="244" cy="176" rx="35" ry="39"/></clipPath>'
    )


def _eye(p, side, cx):
    cy = 176
    s = SKIN
    return (
        f'<g clip-path="url(#{p}eye{side})">'
        f'<ellipse cx="{cx}" cy="{cy}" rx="33" ry="37" fill="#05030b"/>'
        f'<ellipse cx="{cx}" cy="{cy+2}" rx="28" ry="32" fill="url(#{p}iris)"/>'
        f'<ellipse cx="{cx}" cy="{cy+2}" rx="20" ry="24" fill="none" stroke="#e9dcff" stroke-opacity=".25" stroke-width="1.2"/>'
        # slit pupil (cat-dragon), with the canonical crescent glint
        f'<path d="M{cx} {cy-20}C{cx+7} {cy-8} {cx+7} {cy+14} {cx} {cy+26}C{cx-7} {cy+14} {cx-7} {cy-8} {cx} {cy-20}Z" fill="#12042a"/>'
        f'<path d="M{cx+2} {cy-2}a5 5 0 1 0 0 10a4 4 0 1 1 0-10z" fill="#c9a6ff" opacity=".6"/>'
        f'<path d="{_star(cx-11, cy-13, 9)}" fill="#fff"/>'
        f'<circle cx="{cx+11}" cy="{cy+13}" r="4" fill="#fff" opacity=".9"/>'
        f'<circle cx="{cx+14}" cy="{cy-6}" r="1.8" fill="#e9dcff"/><circle cx="{cx-12}" cy="{cy+16}" r="1.4" fill="#e9dcff"/>'
        f'<ellipse cx="{cx}" cy="{cy}" rx="33" ry="37" fill="none" stroke="#2a1b45" stroke-width="2.5"/>'
        f'<g class="{p}lid"><rect x="{cx-42}" y="{cy-124}" width="84" height="86" fill="{s["lid"]}"/>'
        f'<path d="M{cx-30} {cy-39}Q{cx} {cy-28} {cx+30} {cy-39}" stroke="#c7a2ff" stroke-width="3.5" stroke-linecap="round" fill="none"/></g>'
        "</g>"
    )


def _wing(p):
    s = SKIN
    membrane = ("M238 262C246 214 282 150 352 96C392 70 432 60 456 64C440 84 436 104 446 124"
                "C424 126 412 142 420 166C398 164 384 180 390 204C368 200 352 216 358 240"
                "C338 236 320 248 322 270C300 262 280 268 268 286Z")
    ribs = ("M244 262C286 196 362 112 456 64M252 266C300 210 360 160 446 124"
            "M262 272C310 232 356 196 420 166M270 280C312 254 344 236 390 204M276 286C304 272 330 260 358 240")
    stars = "".join(f'<path d="{_star(x, y, r)}" fill="#f3e9ff" opacity="{o}"/>' for x, y, r, o in
                    [(330, 168, 6, .95), (382, 134, 4, .85), (300, 222, 4.5, .9), (404, 186, 3, .8), (352, 214, 3, .75), (420, 100, 3.5, .8)])
    dots = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" opacity=".8"/>' for x, y, r in
                   [(316, 196, 1.6), (364, 176, 1.4), (284, 246, 1.5), (398, 150, 1.2), (340, 246, 1.3), (434, 84, 1.2)])
    return (f'<path d="{membrane}" fill="url(#{p}wingg)" fill-opacity=".92" stroke="#1a1030" stroke-width="4" stroke-linejoin="round"/>'
            f'<path d="{membrane}" fill="none" stroke="{s["glow"]}" stroke-opacity=".35" stroke-width="1.5" filter="url(#{p}bloom)"/>'
            f'<path d="{ribs}" stroke="#1a1030" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".85"/>'
            f'<circle cx="456" cy="64" r="4" fill="{s["moon"][1]}"/>{stars}{dots}')


def _ear(p):
    s = SKIN
    return (f'<path d="M112 146Q102 88 120 44Q156 66 182 106Z" fill="url(#{p}fur)" stroke="{s["stroke"]}" stroke-width="2.5" stroke-linejoin="round"/>'
            f'<path d="M124 128Q119 92 127 66Q151 84 167 108Z" fill="url(#{p}ear)"/>'
            f'<path d="M128 120Q130 100 134 84M136 118Q140 102 146 92" stroke="#f5ecff" stroke-opacity=".45" stroke-width="1.4" fill="none" stroke-linecap="round"/>'
            f'<path d="M133 104a9 9 0 1 0 9 -12a7 7 0 1 1 -9 12z" fill="#e7d7ff" opacity=".9"/>'
            f'<path d="M116 46l5 -14M124 52l9 -11M120 49l-6 -10" stroke="#3b2a5c" stroke-width="3" stroke-linecap="round"/>')


def creature(p: str, period: float, aura_color: str, aura_strength: float, x: float, y: float, w: float, h: float,
             view: str = "-80 -10 560 420", overflow: str = "visible") -> str:
    """Return a nested <svg> with Zeref, placed at x,y,w,h. Callers add style(p, period) and defs(p, ...)."""
    s = SKIN
    star = _star
    o = []
    a = o.append
    a(f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{view}" overflow="{overflow}">')
    a(f'<circle cx="200" cy="215" r="230" fill="url(#{p}aura)"/>')
    a('<ellipse cx="200" cy="372" rx="120" ry="13" fill="#05020c" opacity=".55"/>')
    # long spined tail with smoky wisps (behind the body)
    a(f'<g class="{p}tail">')
    a(f'<path d="M244 334C312 352 392 336 420 276C446 220 420 168 384 168C360 168 352 190 368 200C384 206 396 222 388 248'
      f'C374 288 320 306 250 304Z" fill="url(#{p}tailg)" stroke="{s["stroke"]}" stroke-width="2.5"/>')
    spines = "".join(f'<path d="M{x1} {y1}L{x2} {y2}L{x3} {y3}Z" fill="#6b3fd0" opacity=".85"/>' for (x1, y1, x2, y2, x3, y3) in
                     [(300, 306, 310, 292, 318, 306), (336, 300, 350, 286, 354, 300), (368, 284, 384, 274, 382, 290),
                      (392, 260, 410, 256, 400, 272), (402, 230, 420, 232, 404, 244)])
    a(spines)
    scales = "".join(f'<path d="M{cx-7} {cy}Q{cx} {cy+8} {cx+7} {cy}" stroke="#3e2b6e" stroke-width="1.6" fill="none"/>' for cx, cy in
                     [(280, 318), (300, 320), (322, 316), (344, 310), (364, 300), (382, 286), (396, 268)])
    a(scales)
    a(f'<g class="{p}wisp" fill="#4b2f86"><circle cx="380" cy="168" r="9"/><circle cx="366" cy="152" r="6"/><circle cx="388" cy="146" r="4.5"/><circle cx="352" cy="140" r="3.5"/></g>')
    a(f'<circle cx="400" cy="214" r="5" fill="{s["beans"]}" class="{p}glow"/><path d="{star(372, 268, 6)}" fill="#e6d6ff"/>')
    a("</g>")
    # wings: right drawn, left mirrored (the animated group carries no transform attribute)
    a(f'<g class="{p}wing">{_wing(p)}</g>')
    a(f'<g transform="translate(400 0) scale(-1 1)"><g class="{p}wing">{_wing(p)}</g></g>')
    # body: sleek seated dragon-cat with scaled chest
    a(f'<g class="{p}breathe">')
    a(f'<ellipse cx="138" cy="340" rx="32" ry="22" fill="{s["furSolid"]}" stroke="{s["stroke"]}" stroke-width="2"/>')
    a(f'<ellipse cx="262" cy="340" rx="32" ry="22" fill="{s["furSolid"]}" stroke="{s["stroke"]}" stroke-width="2"/>')
    a(f'<path d="M146 244C122 278 120 328 142 354L258 354C280 328 278 278 254 244C236 226 164 226 146 244Z" fill="url(#{p}fur)" stroke="{s["stroke"]}" stroke-width="2.5"/>')
    a(f'<path d="M164 252C150 282 150 330 166 352L234 352C250 330 250 282 236 252Q200 238 164 252Z" fill="url(#{p}belly)"/>')
    rows = []
    for r, yy in enumerate(range(262, 352, 13)):
        off = 0 if r % 2 == 0 else 7
        for xx in range(150 + off, 252, 14):
            rows.append(f'<path d="M{xx-7} {yy}Q{xx} {yy+9} {xx+7} {yy}" stroke="#5a4290" stroke-opacity=".75" stroke-width="1.5" fill="none"/>')
    a(f'<g clip-path="url(#{p}bellyclip)">{"".join(rows)}</g>')
    a('<g fill="#c9a6ff" opacity=".8"><circle cx="150" cy="300" r="2"/><circle cx="250" cy="292" r="2.4"/><circle cx="244" cy="330" r="1.6"/><circle cx="156" cy="330" r="1.6"/></g>')
    for cx in (168, 232):
        a(f'<ellipse cx="{cx}" cy="350" rx="24" ry="16" fill="{s["furSolid"]}" stroke="{s["stroke"]}" stroke-width="2"/>')
        a(f'<path d="M{cx-14} 352l-3 6M{cx} 354l0 7M{cx+14} 352l3 6" stroke="#e9dcff" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"/>')
        a(f'<g fill="{s["beans"]}" class="{p}glow"><ellipse cx="{cx}" cy="352" rx="7" ry="5"/><circle cx="{cx-10}" cy="344" r="3"/><circle cx="{cx}" cy="341" r="3"/><circle cx="{cx+10}" cy="344" r="3"/></g>')
    a("</g>")
    # head
    a(f'<g class="{p}head">')
    a(f'<g class="{p}ear">{_ear(p)}</g>')
    a(f'<g transform="translate(400 0) scale(-1 1)"><g class="{p}ear">{_ear(p)}</g></g>')
    # crescent moon horns, longer and curved like a dragon's
    for d in ("M110 142C84 120 80 84 98 58C96 88 104 116 126 134Z", "M290 142C316 120 320 84 302 58C304 88 296 116 274 134Z"):
        a(f'<path d="{d}" fill="url(#{p}moon)" stroke="#8f74d6" stroke-width="1.5"/>')
        a(f'<path d="{d}" fill="none" stroke="{s["glow"]}" stroke-opacity=".5" stroke-width="2" filter="url(#{p}bloom)"/>')
    a(f'<path d="M104 172C100 112 150 88 200 88C250 88 300 112 296 172C298 188 312 198 320 208C302 206 298 214 302 224'
      f'C288 220 278 228 272 238C250 250 150 250 128 238C122 228 112 220 98 224C102 214 98 206 80 208C88 198 102 188 104 172Z"'
      f' fill="url(#{p}fur)" stroke="{s["stroke"]}" stroke-width="2.5" stroke-linejoin="round"/>')
    a(f'<ellipse cx="200" cy="120" rx="80" ry="34" fill="url(#{p}sheen)"/>')
    a(f'<path d="M176 94L184 70L194 92L204 64L212 92L222 72L226 96Z" fill="{s["fur"][1]}"/>')
    a(f'<path d="M214 102a17 17 0 1 0 0 30a13 13 0 1 1 0 -30z" fill="url(#{p}moon)" class="{p}glow" filter="url(#{p}bloom)"/>')
    a(f'<path d="{star(236, 112, 4)}" fill="#e6d6ff"/>')
    a(f'<path d="M138 132Q156 124 174 130" stroke="{s["brow"]}" stroke-width="4" stroke-linecap="round" fill="none"/>')
    a(f'<path d="M226 130Q244 124 262 132" stroke="{s["brow"]}" stroke-width="4" stroke-linecap="round" fill="none"/>')
    a(_eye(p, "L", 156) + _eye(p, "R", 244))
    a('<ellipse cx="122" cy="214" rx="17" ry="9" fill="#ff7fd6" opacity=".3"/><ellipse cx="278" cy="214" rx="17" ry="9" fill="#ff7fd6" opacity=".3"/>')
    # whiskers
    wh = ("M132 208C110 204 88 204 64 210M132 216C110 216 90 220 70 230M134 222C116 226 100 236 86 250"
          "M268 208C290 204 312 204 336 210M268 216C290 216 310 220 330 230M266 222C284 226 300 236 314 250")
    a(f'<path d="{wh}" stroke="#e9dcff" stroke-opacity=".55" stroke-width="1.6" fill="none" stroke-linecap="round"/>')
    a('<path d="M194 206L206 206L200 213Z" fill="#7b4fc4"/>')
    a(f'<path d="M184 216Q192 228 200 216Q208 228 216 216" stroke="{s["mouth"]}" stroke-width="3" stroke-linecap="round" fill="none"/>')
    a('<path d="M206 219L209 227L212 219Z" fill="#fff" opacity=".9"/>')
    a("</g>")
    # gem choker
    a('<path d="M146 244Q200 266 254 244" stroke="#0a0612" stroke-width="8" fill="none" stroke-linecap="round"/>')
    a('<path d="M146 244Q200 266 254 244" stroke="#6f52a8" stroke-width="2" fill="none" stroke-dasharray="3 5"/>')
    a(f'<path d="M200 250L209 260L200 272L191 260Z" fill="{s["accent"]}" stroke="#f2e6ff" stroke-width="1.5" class="{p}glow" filter="url(#{p}bloom)"/>')
    a('<path d="M224 256a5 5 0 1 0 5 6a4 4 0 1 1 -5 -6z" fill="#e8dcff"/>')
    a("</svg>")
    return "".join(o)
