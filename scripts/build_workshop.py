#!/usr/bin/env python3
"""Draw repository-owned workshop SVGs. No raster art, remote fonts or scripts.

Placement lives on outer groups; motion lives on inner groups. A CSS transform
must never replace the translation that puts the Beast inside its room.
"""
from pathlib import Path
from html import escape
import argparse
import random

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"

STYLE = """
text{font-family:ui-rounded,'Trebuchet MS',system-ui,sans-serif;fill:#fff2d8}
.label{font-weight:700;letter-spacing:1px}.ink{fill:#352017}.mono{font-family:ui-monospace,monospace}
.breathe{animation:breathe 4.8s ease-in-out infinite;transform-box:fill-box;transform-origin:center bottom}
.eyes{animation:blink 6.7s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.tail{animation:tail 6s ease-in-out infinite;transform-box:fill-box;transform-origin:left bottom}
.wing{animation:wing 7s ease-in-out infinite;transform-box:fill-box;transform-origin:right bottom}
.float{animation:float 6.5s ease-in-out infinite}.twinkle{animation:twinkle 6s ease-in-out infinite}
.sway{animation:sway 8s ease-in-out infinite;transform-box:fill-box;transform-origin:center bottom}
.pulse{animation:pulse 5.8s ease-in-out infinite}.steam{animation:steam 7s ease-in-out infinite}
.cursor{animation:cursor 2s steps(1,end) infinite}.trail{stroke-dasharray:3 18;animation:trail 16s linear infinite}
.orbit{animation:orbit 55s linear infinite;transform-origin:0px 0px}
.munch{animation:munch 4.8s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.012,1.022)}}
@keyframes blink{0%,90%,96%,100%{transform:scaleY(1)}93%,94%{transform:scaleY(.07)}}
@keyframes tail{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(4deg)}}
@keyframes wing{0%,100%{transform:rotate(0)}50%{transform:rotate(-3deg)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes twinkle{0%,100%{opacity:.38}50%{opacity:.85}}
@keyframes sway{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(1.5deg)}}
@keyframes pulse{0%,100%{opacity:.55}50%{opacity:.9}}
@keyframes steam{0%,100%{opacity:.15;transform:translateY(0)}50%{opacity:.5;transform:translateY(-9px)}}
@keyframes cursor{0%,65%,100%{opacity:1}70%,95%{opacity:.25}}
@keyframes trail{to{stroke-dashoffset:-168}}
@keyframes orbit{to{transform:rotate(360deg)}}
@keyframes munch{0%,65%,100%{transform:scale(1)}72%,86%{transform:scale(1.03,.96)}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
"""

DEFS = """
<linearGradient id="night" x2=".85" y2="1"><stop stop-color="#10142d"/><stop offset=".55" stop-color="#181735"/><stop offset="1" stop-color="#090e20"/></linearGradient>
<radialGradient id="nebula"><stop stop-color="#6d397b" stop-opacity=".45"/><stop offset="1" stop-color="#161b38" stop-opacity="0"/></radialGradient>
<linearGradient id="wood" x2="0" y2="1"><stop stop-color="#96572f"/><stop offset=".25" stop-color="#66351f"/><stop offset=".8" stop-color="#3b211b"/><stop offset="1" stop-color="#8a4c2c"/></linearGradient>
<linearGradient id="brass" x2=".8" y2="1"><stop stop-color="#fff0b0"/><stop offset=".25" stop-color="#d9a95c"/><stop offset=".6" stop-color="#886031"/><stop offset="1" stop-color="#edc685"/></linearGradient>
<linearGradient id="hide" x2=".5" y2="1"><stop stop-color="#9a7060"/><stop offset=".3" stop-color="#765346"/><stop offset="1" stop-color="#493334"/></linearGradient>
<linearGradient id="flame" x2=".65" y2="1"><stop stop-color="#ffd97b"/><stop offset=".32" stop-color="#ff9c49"/><stop offset=".65" stop-color="#ef602e"/><stop offset="1" stop-color="#a33237"/></linearGradient>
<linearGradient id="glass" x2="1" y2=".8"><stop stop-color="#8cefff" stop-opacity=".14"/><stop offset=".45" stop-color="#59a7dd" stop-opacity=".02"/><stop offset="1" stop-color="#b8efff" stop-opacity=".14"/></linearGradient>
<radialGradient id="lamp"><stop stop-color="#ffe1a0" stop-opacity=".22"/><stop offset="1" stop-color="#ffd98c" stop-opacity="0"/></radialGradient>
<radialGradient id="aura"><stop stop-color="#65e6ff" stop-opacity=".25"/><stop offset="1" stop-color="#63d7ff" stop-opacity="0"/></radialGradient>
<pattern id="grain" width="160" height="36" patternUnits="userSpaceOnUse"><path d="M-20 8Q30 0 75 10T180 9M-20 26Q36 16 72 27T180 25M40 18q22-9 50 0" fill="none" stroke="#e5a968" stroke-width="1" opacity=".14"/></pattern>
<pattern id="pixels" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M0 23H24M23 0V24" stroke="#78bcb1" opacity=".08"/></pattern>
<filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
"""


def txt(x, y, value, size=26, fill=None, anchor="middle", cls="label"):
    color = f' style="fill:{fill}"' if fill else ""
    return f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" class="{cls}"{color}>{escape(value)}</text>'


def group(x, y, scale, body, rotation=0):
    return f'<g transform="translate({x} {y}) rotate({rotation}) scale({scale})">{body}</g>'


def star(x, y, size=5, color="#ffd890", animate=True):
    c = ' class="twinkle"' if animate else ""
    return f'<path{c} d="M{x-size} {y}q{size} 0 {size} {-size}q0 {size} {size} {size}q{-size} 0 {-size} {size}q0 {-size} {-size} {-size}" fill="{color}"/>'


def sky(w, h, seed=27):
    rng = random.Random(seed)
    s = f'<rect width="{w}" height="{h}" rx="26" fill="url(#night)"/><ellipse cx="{w*.68}" cy="{h*.37}" rx="{w*.42}" ry="{h*.52}" fill="url(#nebula)"/>'
    for i in range(34):
        x, y = rng.randrange(20, w-20), rng.randrange(18, h-18)
        s += f'<circle cx="{x}" cy="{y}" r="{rng.choice([1,1,1.5,2])}" fill="#fff0be" opacity=".35"/>'
    return s


def plank(x, y, w, h=18):
    return f'<rect x="{x}" y="{y+8}" width="{w}" height="{h}" rx="4" fill="#241618"/><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="url(#wood)"/><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="url(#grain)"/><path d="M{x+4} {y+3}h{w-8}" stroke="#d3985e" stroke-width="2" opacity=".65"/>'


def plaque(x, y, w, label, size=24):
    return f'<rect x="{x-w/2}" y="{y-24}" width="{w}" height="36" rx="5" fill="#322520" stroke="#b78e55" stroke-width="1.5"/>' + txt(x, y, label, size, "#ffe3ac")


def beast(pose="idle", goggles=False):
    """The same walnut dragon: amber eyes, fire wings, burgundy toes, save tag.

    Local origin is between the feet. Poses retain the same face/body paths.
    Animation never applies to the instance's placement transform.
    """
    asleep = pose == "sleep"
    body = '''<g class="breathe" stroke="#382932" stroke-width="3" stroke-linejoin="round">
<g class="tail"><path d="M67-47q82 25 83-24q-2-23-18-17q12 24-13 22q-23-2-39-20" fill="url(#hide)"/><path d="M140-75q-17-11-10-31q10 15 17 10q14-8 9-24q25 26-3 45" fill="url(#flame)" stroke="#8f3d35"/></g>
<g class="wing"><path d="M-42-82q-65-21-91-77q31 15 45 8q-27-35-20-63q30 33 51 38q5-23 18-39q7 35 31 53L-12-98Z" fill="url(#flame)" stroke="#a84036"/><path d="M-104-174q29 18 59 55M-88-147q19 15 47 30M-55-174l14 57" fill="none" stroke="#ffc873" stroke-width="3" opacity=".7"/></g>
<path d="M53-99q43-16 54-63q-14 11-29 10q8-24 4-38q-18 21-29 27q-6-16-16-20q2 24-8 40Z" fill="url(#flame)" stroke="#a84036"/>
<ellipse cx="2" cy="-55" rx="73" ry="67" fill="url(#hide)"/>
<path d="M-31-85q41-28 69 10q12 51-29 69q-43-10-46-39" fill="#c59e79" stroke="none"/>
<path d="M-28-47q29 9 60-3M-24-29q20 7 45-2" fill="none" stroke="#9a735d" stroke-width="2"/>
<path d="M-40-110q-25-18-18-53l28 18q15-25 48-26q35-4 55 28q33 4 37 29q7 28-29 40q-56 29-109-8q-11-10-12-28" fill="url(#hide)"/>
<path d="M-47-159l7-31q19 19 22 32M42-158l12-30q11 19 10 36" fill="#efbd66" stroke="#725039"/>
<path d="M-31-157q32-28 66-7" stroke="#c19472" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M39-117q48-13 63 7q4 28-47 31q-25-1-26-10" fill="#9c7560" stroke="none"/>
<path d="M54-89q24 7 40-7" fill="none" stroke="#3e2d32" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="85" cy="-110" rx="3" ry="2" fill="#342833" stroke="none"/>
<path d="M-35-99l-9 5M-26-89l-7 5M-15-103l-5 5" stroke="#be906f" stroke-width="3" stroke-linecap="round"/>
<path d="M-46-22q-29-9-39 6q-12 19 15 22h34q19-8 7-25" fill="#84394a"/>
<path d="M31-20q-10 27 16 26h33q28-3 14-21q-10-14-37-9" fill="#84394a"/>
<path d="M-70-2v5M-54-1v5M59 0v4M75-1v5" stroke="#bc6570" stroke-width="3"/>
<path d="M-23-75q26 14 53 0" fill="none" stroke="#514153" stroke-width="6"/>
<path d="M3-70l12 12-12 14-12-14Z" fill="#65e8ef" stroke="#e9ffff" stroke-width="1.5"/>
'''
    if asleep:
        body += '<path d="M-21-126q10 11 21 0M27-131q12 10 23-1" fill="none" stroke="#2d2730" stroke-width="4" stroke-linecap="round"/>'
    else:
        body += '''<g class="eyes" stroke="none"><ellipse cx="-10" cy="-129" rx="11" ry="14" fill="#ffd566"/><ellipse cx="38" cy="-133" rx="15" ry="16" fill="#ffd566"/><ellipse cx="-5" cy="-128" rx="5" ry="9" fill="#252231"/><ellipse cx="43" cy="-133" rx="6" ry="10" fill="#252231"/><circle cx="-7" cy="-134" r="3" fill="#fff7dc"/><circle cx="40" cy="-139" r="4" fill="#fff7dc"/></g>'''
        body += '<path d="M-24-146q11-5 20-1M24-153q15-6 28 0" stroke="#48323a" stroke-width="3" fill="none" stroke-linecap="round"/>'
    if pose in ("feed", "crystal"):
        body += '<path d="M-51-64q13-20 35-17q14 14 3 23q-21 2-33 15M55-65q-7-16-21-15q-14 16-3 22l28 15" fill="url(#hide)"/>'
        body += group(73, -85, .40, crystal("#ffd581")) if pose == "feed" else group(12, -73, .65, crystal("#ffd581"))
    elif pose == "wave":
        body += '<path d="M-51-65q-47-8-42-53q4-10 11-8q9 1 6 13q8 13 14 17q8-23 20-15q13 14 2 26" fill="url(#hide)"/>'
        body += '<path d="M64-65q22 14 13 28q-10 17-27 3" fill="url(#hide)"/>'
    elif pose == "game":
        body += '<path d="M-54-60q9-23 28-13l19 28M64-61q-9-22-28-14L18-46" fill="url(#hide)"/>'
        body += '<rect x="-31" y="-59" width="70" height="34" rx="12" fill="#9874cd" stroke="#c8a5e8"/><rect x="-6" y="-53" width="26" height="19" rx="3" fill="#8be2bb"/><path d="M-23-43h10m-5-5v10" stroke="#3c3157" stroke-width="3"/><circle cx="30" cy="-43" r="3" fill="#f5bbd2"/>'
    elif pose == "think":
        body += '<path d="M-58-59q15-40 31-40q20 8 7 27L-42-41M62-59q20 9 17 25q-12 19-27 0" fill="url(#hide)"/>'
    else:
        body += '<path d="M-58-70q-21 9-18 30q11 16 27 1l11-22M60-68q25 11 22 27q-10 18-26 1L47-61" fill="url(#hide)"/>'
    if goggles:
        body += '<g stroke="#e0b672" stroke-width="4"><path d="M-35-134h11m22 0h17m41 0h15" fill="none"/><rect x="-26" y="-146" width="31" height="28" rx="8" fill="#8cefff" fill-opacity=".2"/><rect x="20" y="-149" width="38" height="29" rx="8" fill="#8cefff" fill-opacity=".2"/></g>'
    if pose == "feed":
        body += '<path class="munch" d="M66-90q12 3 20-2q-4 15-11 14q-10-2-9-12" fill="#342533" stroke="none"/>'
    body += '</g>'
    if asleep:
        body += star(84, -179, 5, "#9fbcff") + '<path class="steam" d="M96-163h10l-10 11h10" stroke="#aebfed" stroke-width="2" fill="none"/>'
    return body


def crystal(color="#89e7ff"):
    return f'<g class="float"><path d="M0-49L22-18 15 15 0 25-16 14-24-15Z" fill="{color}" fill-opacity=".7" stroke="#d5f8ff" stroke-width="2"/><path d="M0-49L-6-9 0 25 8-7 0-49M-24-15l18 6 28-9M-6-9l-10 23" fill="none" stroke="#f2fdff" stroke-opacity=".45"/></g>'


def plant():
    return '<path d="M-17-6h35l-5 26h-26Z" fill="#c67650" stroke="#75433a" stroke-width="2"/><path d="M0-6v-55M0-36q-28-24-29-7q3 18 29 13M0-22q26-35 32-19q0 20-32 26" fill="#5a9b83" stroke="#82c4a0" stroke-width="2"/>'


def book(label="CST", color="#344867"):
    return f'<path d="M-33-74H30v76H-33q-8-1-8-9v-60q0-7 8-7" fill="{color}" stroke="#b99a62" stroke-width="2"/><path d="M-32-70v67M-29-3H28M-29-8H28" stroke="#e4c895" stroke-width="2"/><path d="M-18-53h33M-18-44h24" stroke="#c9a973" stroke-width="1.5"/>' + txt(0, -21, label, 18, "#f8dca8")


def terminal():
    return '<rect x="-96" y="-108" width="192" height="115" rx="12" fill="#302e37" stroke="#928075" stroke-width="3"/><rect x="-84" y="-96" width="168" height="83" rx="5" fill="#0c252b"/><path d="M-71-77l8 6-8 6M-51-71h43M-72-51h88M-72-39h62" stroke="#8bdfc4" stroke-width="3" fill="none" stroke-linecap="round"/><rect class="cursor" x="-72" y="-26" width="7" height="7" fill="#c4f8cc"/><path d="M-80 12L80 12 99 25H-98Z" fill="#736268" stroke="#ac9390" stroke-width="2"/><path d="M-49 18H49" stroke="#c1aaa2"/>'


def coffee():
    return '<ellipse cx="0" cy="6" rx="38" ry="8" fill="#1e1823" opacity=".5"/><path d="M-25-44h50v40q-2 15-25 15q-23 0-25-15Z" fill="#ece0c9" stroke="#9c7e67" stroke-width="2"/><path d="M26-36q31-4 24 20q-3 12-24 7" fill="none" stroke="#e3ccb2" stroke-width="7"/><ellipse cx="0" cy="-44" rx="25" ry="7" fill="#503d35" stroke="#ffdfa8" stroke-width="2"/><path class="steam" d="M-10-58q-12-12-1-24M10-57q12-16-2-26" fill="none" stroke="#ffedcf" stroke-width="3" opacity=".4"/>' + star(0, -20, 7, "#b77764", False)


def lamp():
    return '<ellipse cx="0" cy="0" rx="37" ry="8" fill="url(#brass)"/><path d="M0-5L-25-72 8-118" fill="none" stroke="#b99252" stroke-width="9" stroke-linecap="round"/><circle cx="-25" cy="-72" r="8" fill="#f7d698" stroke="#80623d" stroke-width="3"/><path d="M-8-136q23-16 44 5L51-109H-20Z" fill="url(#brass)" stroke="#bd945b" stroke-width="2"/><ellipse cx="14" cy="-108" rx="28" ry="6" fill="#ffe3a2"/><ellipse class="pulse" cx="14" cy="-63" rx="87" ry="95" fill="url(#lamp)"/>'


def handheld(big=False):
    # Portrait purple handheld. World representation is an illustration, not a capture.
    b = '<rect x="-82" y="-188" width="164" height="224" rx="28" fill="#5b4789" stroke="#b995d7" stroke-width="4"/><path d="M-66-178H56q17 0 18 19V2" fill="none" stroke="#c5a2e7" stroke-opacity=".6" stroke-width="3"/><rect x="-65" y="-164" width="130" height="111" rx="10" fill="#2c2b4b" stroke="#40345f" stroke-width="4"/><rect x="-54" y="-153" width="108" height="88" rx="3" fill="#163a43"/><path d="M-54-84l25-15 22 8 31-22 30 19V-65H-54Z" fill="#548778"/><rect x="-54" y="-153" width="108" height="88" fill="url(#pixels)"/>'
    # Same fire wing, hide, eye and burgundy feet expressed as a small pixel sprite.
    b += '<g shape-rendering="crispEdges"><path d="M-21-118v-18h6v6h6v-6h6v18h6v6H-15v-6Z" fill="#ff9650"/><path d="M-9-116h24v6h6v6h6v12H21v6H-9v-6h-6v-18h6Z" fill="#9b735e"/><path d="M9-110h6v6H9Z" fill="#ffd869"/><path d="M-9-87H3v6H-9ZM9-87H21v6H9Z" fill="#a24a5b"/></g>'
    b += '<path d="M-52-25h17v-17h15v17h17v15h-17V7h-15v-17h-17Z" fill="#342b45" stroke="#9f80b5" stroke-width="2"/><circle cx="48" cy="-15" r="12" fill="#c888ab" stroke="#e5b3c8" stroke-width="2"/><circle cx="24" cy="3" r="12" fill="#c888ab" stroke="#e5b3c8" stroke-width="2"/><path d="M-2 17l17-7M-23 22l17-7M45 17v9m8-12v9m8-12v9" stroke="#382d51" stroke-width="4" stroke-linecap="round"/><circle class="pulse" cx="-66" cy="-128" r="3" fill="#b9f58c"/>'
    if big:
        b += txt(0, -170, "LOST COSMOS", 9, "#e6cafa")
    return b


def cartridge(label="SAVE"):
    return '<rect x="-35" y="-48" width="70" height="65" rx="6" fill="#605466" stroke="#b998c0" stroke-width="2"/><rect x="-27" y="-40" width="54" height="29" rx="4" fill="#dad2b1"/><path d="M-23 7h46" stroke="#d7b974" stroke-width="8"/>' + txt(0, -20, label, 15, "#47334b")


def familiar(kind):
    if kind == "rawr":
        return '<g class="float"><path d="M-25-18l-22-24 3 34-24 7 37 15M22-18l21-24-2 32 24 10-37 13" fill="#8161b7" stroke="#a387d3" stroke-width="2"/><path d="M-29 1q-12-39 4-55l13 15q16-13 29-1l16-16q19 26 3 58q14 20-3 27h-63q-17-8 1-28" fill="#a787df" stroke="#4d3c77" stroke-width="3"/><path d="M-25 28q-37 16-41-3" fill="none" stroke="#9972d3" stroke-width="9"/><ellipse cx="-11" cy="-9" rx="5" ry="8" fill="#f5e0ff"/><ellipse cx="14" cy="-9" rx="5" ry="8" fill="#f5e0ff"/><path d="M-3 8q6 6 13 0" fill="none" stroke="#4c3570" stroke-width="2"/></g>' + star(3, -35, 7, "#ffeaae", False)
    if kind == "phos":
        return '<g class="float"><circle class="pulse" r="51" fill="url(#aura)"/><circle r="33" fill="#86e9e6" stroke="#c8ffed" stroke-width="2"/><path d="M-29 9q-33 13-28 0M29 9q33 13 28 0" stroke="#74d8dc" stroke-width="6" fill="none" stroke-linecap="round"/><ellipse cx="-10" cy="-3" rx="4" ry="7" fill="#274657"/><ellipse cx="11" cy="-3" rx="4" ry="7" fill="#274657"/><path d="M-6 13q7 8 14 0" fill="none" stroke="#316777" stroke-width="2"/><ellipse cx="-12" cy="-18" rx="10" ry="5" fill="#eafff2" opacity=".6"/></g>'
    if kind == "samgo":
        return '<g class="sway"><path d="M-13-14h26v55q0 12-13 12q-13 0-13-12Z" fill="#f4c58b" stroke="#9b653e" stroke-width="2"/><path d="M-45-13q5-59 44-55q39-4 47 55q-38 19-91 0" fill="#e39a4f" stroke="#925b40" stroke-width="3"/><path d="M-39-17q38 16 76 0" fill="none" stroke="#ffe0a0" stroke-width="3"/><circle cx="-14" cy="-40" r="8" fill="#ffe7ac"/><circle cx="21" cy="-29" r="6" fill="#ffe7ac"/><ellipse cx="-5" cy="15" rx="3" ry="5" fill="#62423a"/><ellipse cx="7" cy="15" rx="3" ry="5" fill="#62423a"/><path d="M-27 20q-26 8-25-6M22 20q27 8 29-6" stroke="#d49c64" stroke-width="5" fill="none" stroke-linecap="round"/></g>'
    return '<g class="float"><path d="M0-60L43-25 34 27 0 52-34 27-43-25Z" fill="#6e396c" stroke="#e58ebd" stroke-width="3"/><path d="M0-60v112M-43-25L0-4 43-25M-34 27L0-4 34 27" fill="none" stroke="#cf80ba" stroke-width="2"/><path d="M-43-12l-15 15 8 21M43-12l15 15-8 21" stroke="#eb9bd0" stroke-width="3" fill="none"/><ellipse cx="-12" cy="-4" rx="4" ry="7" fill="#ffe2f2"/><ellipse cx="12" cy="-4" rx="4" ry="7" fill="#ffe2f2"/><path d="M-5 14h10" stroke="#ffb4d4" stroke-width="2"/></g>'


def cypher():
    return '<rect x="-82" y="-58" width="164" height="100" rx="12" fill="#475255" stroke="#bea06b" stroke-width="3"/><path d="M-70-48H70V27H-70Z" fill="#1b2d39" stroke="#738b8b" stroke-width="2"/><path d="M-45-21h32q12 0 12 16v11M43-21H17Q3-21 3-6V7" fill="none" stroke="#80d8d5" stroke-width="3"/><g fill="#e4b868"><circle cx="-49" cy="-22" r="6"/><circle cx="49" cy="-22" r="6"/><circle cx="0" cy="10" r="6"/></g><path d="M-75 46h150M-75 57h150" stroke="#b18b61" stroke-width="4"/><circle class="pulse" cx="58" cy="11" r="4" fill="#c2eac0"/>'


def terrarium():
    return '<path d="M-42-69q-22 73-2 102q45 23 88 0q20-29-2-102Z" fill="url(#glass)" stroke="#9ac0cb" stroke-width="2"/><rect x="-44" y="-76" width="88" height="12" rx="6" fill="#b49261"/><ellipse cx="0" cy="27" rx="42" ry="12" fill="#203449"/><g class="sway"><ellipse cx="0" cy="-6" rx="35" ry="17" fill="#8069ae" opacity=".65"/><ellipse cx="10" cy="-9" rx="22" ry="26" fill="#7dacce" opacity=".4"/><path d="M-22 22q11-38 22-14q13-18 23 17" fill="#bf7aab" opacity=".5"/></g><path d="M-36-49q-7 41-3 55" stroke="#e2efff" stroke-width="3" fill="none" opacity=".4"/>' + star(3, -10, 6)


def socket():
    return '<ellipse cx="0" cy="18" rx="53" ry="14" fill="#354551" stroke="#a7bdb0" stroke-width="3"/><path d="M-30 5V-32q0-25 30-25q30 0 30 25V5" fill="#101d2c" stroke="#93d6c5" stroke-width="5"/><path d="M-20 0V-32q0-15 20-15q20 0 20 15V0" fill="none" stroke="#678e9b" stroke-width="2" stroke-dasharray="4 6"/><path d="M-9-24H9M0-33v18" stroke="#b0f0cd" stroke-width="3"/>'


def telescope():
    return '<path d="M-32-28L-66 73M-32-28L13 73M-32-28L-28 77" stroke="#b08b57" stroke-width="5" stroke-linecap="round"/><circle cx="-32" cy="-28" r="9" fill="url(#brass)"/><g transform="rotate(-25)"><rect x="-56" y="-85" width="97" height="34" rx="10" fill="url(#brass)" stroke="#c7a373" stroke-width="2"/><rect x="33" y="-91" width="18" height="45" rx="4" fill="#34445a" stroke="#91b6c8" stroke-width="2"/><path d="M-69-72h15v9h-15" fill="#253247" stroke="#bf945f" stroke-width="2"/></g>'


def watch():
    return '<rect x="-24" y="-87" width="48" height="122" rx="14" fill="#8b6f72" stroke="#c2a89d" stroke-width="3"/><rect x="-40" y="-58" width="80" height="77" rx="20" fill="#504b5c" stroke="#d2b991" stroke-width="3"/><rect x="-30" y="-49" width="60" height="58" rx="13" fill="#0d2e3b"/>' + group(-4, 2, .25, beast()) + '<circle cx="44" cy="-23" r="5" fill="#ba9a68"/>'


def hero(mobile=False):
    w, h = (600, 590) if mobile else (1200, 690)
    b = sky(w, h)
    if mobile:
        b += '<path d="M30 113Q300 12 570 113V561H30Z" fill="url(#wood)" stroke="#bd8b53" stroke-width="4"/><path d="M48 127Q300 58 552 127V536H48Z" fill="#231c25"/><path d="M30 113Q300 12 570 113V561H30Z" fill="url(#grain)"/>'
        b += txt(300, 79, "NAVISWORLD", 45) + txt(300, 111, "THE LIVING COSMIC WORKSHOP", 18, "#f0cca0")
        b += '<path d="M179 384V242q0-113 121-113q121 0 121 113v142" fill="url(#glass)" stroke="#aac7cd" stroke-width="2"/><path d="M191 284v-45q0-54 35-81" fill="none" stroke="#cff9ff" stroke-width="5" opacity=".2"/>'
        b += '<ellipse cx="300" cy="375" rx="121" ry="35" fill="url(#aura)"/><ellipse cx="300" cy="386" rx="118" ry="21" fill="#344350" stroke="url(#brass)" stroke-width="5"/><ellipse cx="300" cy="383" rx="98" ry="12" fill="none" stroke="#8ddeeb" stroke-width="2"/>'
        b += group(293, 374, 1, beast("wave"))
        b += group(109, 253, .45, lamp()) + group(104, 405, .56, handheld())
        b += group(500, 308, .45, familiar("phos")) + group(501, 416, .48, familiar("samgo"))
        b += plank(58, 427, 484, 22)
        b += group(133, 510, .55, terminal()) + group(452, 517, .62, book())
        b += group(493, 526, .55, plant()) + group(350, 525, .5, coffee())
        b += group(255, 517, .55, cartridge())
        b += plank(50, 538, 500, 22)
        b += star(250, 187, 6) + star(387, 218, 6, "#92ebf4") + star(376, 483, 6)
    else:
        # An arched cabinet rather than rectangular UI cards.
        b += '<path d="M53 164Q150 81 287 106Q600 15 915 106Q1050 81 1147 164V638H53Z" fill="url(#wood)" stroke="#b58a52" stroke-width="5"/><path d="M75 177Q160 107 290 130Q600 57 909 130Q1040 107 1125 177V617H75Z" fill="#211c25"/><path d="M53 164Q150 81 287 106Q600 15 915 106Q1050 81 1147 164V638H53Z" fill="url(#grain)"/>'
        b += txt(600, 85, "NAVISWORLD", 59) + txt(600, 119, "THE LIVING COSMIC WORKSHOP", 25, "#e7c293")
        b += '<path d="M440 595V268q0-121 160-121q160 0 160 121v327" fill="#151e30" stroke="#7b5e3e" stroke-width="8"/><path d="M447 563V283q0-121 153-121q153 0 153 121v280" fill="url(#glass)" stroke="#adcbd1" stroke-width="2"/><path d="M461 374V282q0-71 48-100" fill="none" stroke="#d2faff" stroke-width="7" opacity=".18"/>'
        b += '<ellipse cx="600" cy="536" rx="145" ry="49" fill="url(#aura)"/><ellipse cx="600" cy="561" rx="142" ry="28" fill="#293b4b" stroke="url(#brass)" stroke-width="6"/><ellipse cx="600" cy="555" rx="124" ry="18" fill="none" stroke="#9ddde2" stroke-width="3"/>'
        b += group(585, 535, 1.39, beast("crystal"))
        b += '<path d="M86 372H425M786 372H1115M87 594H420M786 594H1115" stroke="#15101b" stroke-width="28"/>'
        b += plank(82, 365, 345) + plank(777, 365, 341) + plank(80, 590, 352) + plank(774, 590, 348)
        b += group(219, 325, 1.05, terminal()) + group(104, 317, .82, lamp())
        b += group(364, 332, .86, coffee()) + group(385, 272, .55, book("CODE", "#527964"))
        b += group(844, 267, .72, familiar("rawr")) + group(997, 272, .83, familiar("phos"))
        b += group(879, 321, .42, familiar("samgo")) + group(1062, 322, .48, familiar("zeref"))
        b += group(207, 556, .73, handheld(True), -11) + group(344, 564, .78, cartridge())
        b += group(99, 547, .8, plant()) + group(411, 470, .67, crystal())
        b += group(831, 533, .83, book()) + group(922, 504, 1.02, telescope())
        b += group(1068, 519, .89, watch())
        b += '<path d="M993 574q-28-34-18-50" fill="none" stroke="#c39969" stroke-width="3"/><circle cx="1000" cy="557" r="20" fill="none" stroke="#d6b270" stroke-width="2"/><ellipse cx="1000" cy="557" rx="20" ry="8" fill="none" stroke="#77c9da" stroke-width="2"/>'
        b += plaque(244, 400, 114, "BUILD", 22) + plaque(950, 400, 134, "BRAINS", 22)
        b += star(525, 275, 7) + star(680, 209, 6, "#9ce7ff") + star(382, 472, 6)
        b += '<path d="M414 359Q455 382 459 435M789 348Q762 360 745 426M423 554q9 9 20 0" fill="none" stroke="#88c5c9" stroke-width="2" opacity=".4"/>'
        # Separate receipt drawers under the scene; no hardware execution implied.
        for x, color in [(484, "#ad8ece"), (548, "#e5b85f"), (612, "#82cbda"), (676, "#748297")]:
            b += f'<rect x="{x}" y="587" width="55" height="26" rx="4" fill="#2d2932" stroke="{color}"/><circle cx="{x+27}" cy="600" r="3" fill="{color}"/>'
    return w, h, b


def worlds(mobile=False):
    w, h = (600, 630) if mobile else (1000, 560)
    b = sky(w, h, 52)
    center = (300, 356, .94) if mobile else (500, 344, 1.13)
    cx, cy, sc = center
    b += f'<ellipse cx="{cx}" cy="{cy-75}" rx="130" ry="147" fill="url(#aura)"/><ellipse cx="{cx}" cy="{cy+13}" rx="109" ry="20" fill="#34414d" stroke="#b49160" stroke-width="3"/>'
    b += group(cx-10, cy, sc, beast("curious"))
    portals = [(122, 169, "BEAST CAGE", "cage"), (478, 169, "BRAIN BAY", "brain"), (122, 493, "LOST COSMOS", "game"), (478, 493, "SAVE / DEVICE", "save")] if mobile else [(165, 156, "BEAST CAGE", "cage"), (830, 156, "BRAIN BAY", "brain"), (165, 424, "LOST COSMOS", "game"), (830, 424, "SAVE / DEVICE", "save")]
    for x, y, name, kind in portals:
        color = {"cage":"#95cbae", "brain":"#b994d8", "game":"#ac95dd", "save":"#9dd6db"}[kind]
        b += f'<path d="M{cx} {cy-65}Q{x} {cy-65} {x} {y}" fill="none" stroke="{color}" stroke-width="2" opacity=".3"/><path class="trail" d="M{cx} {cy-65}Q{x} {cy-65} {x} {y}" fill="none" stroke="{color}" stroke-width="4" opacity=".7"/>'
        b += f'<path d="M{x-87} {y+37}V{y-30}q0-79 87-79q87 0 87 79v67" fill="#192635" stroke="{color}" stroke-width="3"/>'
        b += f'<ellipse cx="{x}" cy="{y+37}" rx="93" ry="18" fill="#293b40" stroke="#a08257" stroke-width="3"/>'
        if kind == "cage":
            b += group(x-48, y+5, .65, plant()) + f'<path d="M{x-14} {y+18}q29-29 67 0v17h-67Z" fill="#be8387" stroke="#cba893" stroke-width="2"/><ellipse cx="{x+10}" cy="{y+18}" rx="15" ry="7" fill="#dcb6a0"/>'
            b += star(x+34, y-64, 6)
        elif kind == "brain":
            b += group(x-30, y-28, .65, familiar("phos")) + group(x+36, y-25, .55, familiar("rawr"))
            b += group(x, y+35, .28, socket())
        elif kind == "game":
            b += group(x, y+26, .48, handheld())
        else:
            b += group(x-36, y+24, .78, cartridge()) + group(x+37, y+17, .60, watch())
        b += txt(x, y+79, name, 23 if mobile else 26)
    return w, h, b


def garden(mobile=False):
    w, h = (600, 660) if mobile else (1050, 490)
    b = sky(w, h, 39)
    b += '<path d="M25 40q50-18 110-6" fill="none" stroke="#7aa789" stroke-width="4"/>'
    positions = [(170, 124), (435, 124), (170, 300), (435, 300)] if mobile else [(159, 145), (407, 145), (653, 145), (900, 145)]
    names = [("RAWRPHØS", "rawr"), ("PHOS", "phos"), ("SAMGO", "samgo"), ("QC67 / ZEREF", "zeref")]
    for (x, y), (name, kind) in zip(positions, names):
        b += group(x, y, 1, familiar(kind))
        b += '<g>' + plank(x-88, y+61, 176, 14) + '</g>'
        b += plaque(x, y+101, 218 if name=="QC67 / ZEREF" else 190, name, 24)
    by = 517 if mobile else 355
    xs = [104, 302, 501] if mobile else [213, 522, 830]
    b += plank(27, by+44, w-54, 19)
    if mobile:
        b += group(72, by-23, .32, beast("curious"))
    b += group(xs[0], by, .92 if mobile else 1.03, cypher())
    b += group(xs[1], by, .83 if mobile else 1, terrarium())
    b += group(xs[2], by, .88 if mobile else 1, socket())
    for x, name, role in zip(xs, ["COSMIC.CYPHER", "NEBULA", "OPEN SLOT"], ["ROUTER", "WORLD", "ADAPTER"]):
        b += txt(x, by+89, name, 20 if mobile else 24)
        b += txt(x, by+112, role, 18, "#a4c7ce")
    # A curious visitor on the bottom shelf is a creature, outside the model shelf.
    if not mobile:
        b += group(46, by+31, .36, beast("think"))
    return w, h, b


def game_scene():
    w, h = 660, 410
    b = sky(w, h, 74)
    b += '<ellipse cx="376" cy="376" rx="240" ry="18" fill="#050c18" opacity=".6"/>'
    b += '<path class="trail" d="M193 296Q344 226 368 98" fill="none" stroke="#c5b1ec" stroke-width="3" opacity=".6"/>'
    b += group(177, 346, .93, beast("game"))
    b += group(434, 324, 1.45, handheld(True), 10)
    b += group(574, 348, .91, cartridge(), -12)
    b += star(300, 136, 7) + star(580, 104, 6, "#a1e6ec") + star(539, 62, 8) + star(323, 205, 5)
    b += '<path d="M587 304q16 2 25 16" stroke="#ada890" stroke-width="3" fill="none"/>'
    b += plank(37, 374, 586, 15)
    return w, h, b


def scanner():
    w, h = 660, 350
    b = sky(w, h, 9)
    b += '<ellipse class="pulse" cx="156" cy="204" rx="120" ry="114" fill="url(#aura)"/><ellipse cx="158" cy="293" rx="112" ry="20" fill="#34515b" stroke="#b2986b" stroke-width="3"/>'
    b += group(145, 282, .78, beast("curious"))
    b += '<path d="M46 256V148m220 108V148M60 94q86-61 182 0" fill="none" stroke="#95dce2" stroke-width="2" opacity=".4"/>'
    b += '<path d="M282 282q33-50 58-51" fill="none" stroke="#8a7357" stroke-width="5"/><rect x="316" y="53" width="317" height="258" rx="24" fill="#2c3542" stroke="#bb9d6a" stroke-width="4"/><rect x="330" y="68" width="289" height="222" rx="12" fill="#132a36"/>'
    b += txt(472, 107, "EXAMPLE", 30, "#ffdfa0") + txt(473, 139, "SIMULATED INPUT", 22, "#b9eaf0")
    for i, (name, value, color) in enumerate([("FOCUS",18,"#91dcdf"),("CALM",8,"#a4d8bd"),("SPARK",94,"#ffd184")]):
        y = 179 + i*44
        b += txt(346, y, name, 21, anchor="start") + txt(598, y, str(value), 23, color, anchor="end")
        b += f'<rect x="346" y="{y+8}" width="252" height="8" rx="4" fill="#364955"/><rect x="346" y="{y+8}" width="{252*value/100}" height="8" rx="4" fill="{color}"/>'
    b += plank(28, 311, 604, 17)
    return w, h, b


def observatory():
    w, h = 660, 325
    b = sky(w, h, 117)
    b += '<circle cx="389" cy="137" r="108" fill="#1e2c43" stroke="#5b7a91" stroke-width="2"/><circle cx="389" cy="137" r="84" fill="none" stroke="#a78553" stroke-width="2"/><ellipse cx="389" cy="137" rx="87" ry="32" fill="none" stroke="#a8cee0" stroke-width="2" transform="rotate(-27 389 137)"/><ellipse cx="389" cy="137" rx="35" ry="85" fill="none" stroke="#c69cc0" stroke-width="2" transform="rotate(28 389 137)"/>'
    b += group(389, 137, 1, '<g class="orbit"><circle cx="78" cy="0" r="5" fill="#ffe1a0"/>' + star(-25, 70, 5, "#b3e9f2") + '</g>')
    b += star(389,137,10, "#ffe1a0",False)
    b += group(133, 274, .75, beast("think", True)) + group(545, 218, .92, telescope())
    b += group(290, 286, .95, book())
    b += '<path d="M357 234l89-11 14 63-89 12Z" fill="#dfc7a0" stroke="#a68c63" stroke-width="2"/>' + txt(409, 256, "12D", 24, "#352c3c") + txt(413, 278, "STATE", 17, "#463b50")
    b += plank(28, 294, 604, 16)
    return w, h, b


def provenance():
    w, h = 660, 422
    b = sky(w, h, 44)
    items=[(32,28,"SIMULATOR","#b49bd6"),(348,28,"SEEDED","#edcb87"),(32,227,"MEASURED","#9edee1"),(348,227,"QPU*","#b0b5c2")]
    for x,y,label,color in items:
        b += f'<path d="M{x} {y+12}h281v157l-15 15H{x}Z" fill="url(#wood)" stroke="#8f6747" stroke-width="3"/><rect x="{x+12}" y="{y+22}" width="254" height="150" rx="9" fill="#192736" stroke="{color}" stroke-width="2"/>'
        if label=="SIMULATOR":
            b += f'<rect x="{x+27}" y="{y+38}" width="116" height="73" rx="7" fill="#292240" stroke="#a487bf"/><path d="M{x+36} {y+77}h15l9-23 18 48 15-48 15 47 10-24h13" fill="none" stroke="#bdb2e7" stroke-width="3"/><circle class="pulse" cx="{x+116}" cy="{y+49}" r="4" fill="#d0b1f3"/>'
            b += group(x+208,y+104,.65,book("QVM","#4e3d67"))
        elif label=="SEEDED":
            b += group(x+83,y+85,.82,crystal("#f2cd81")) + group(x+204,y+99,.72,cartridge("SEED"))
        elif label=="MEASURED":
            b += f'<path d="M{x+39} {y+36}h74v78l-8-5-8 5-8-5-8 5-8-5-8 5-8-5-8 5v-78Z" fill="#bddadd"/><path d="M{x+50} {y+49}h51m-51 12h39m-39 12h49m-49 12h31" stroke="#488395" stroke-width="2"/><path d="M{x+167} {y+99}v-17h13v17m10 0v-36h13v36m10 0v-49h13v49" stroke="#9ddeea" stroke-width="4" fill="none"/>'
        else:
            b += f'<rect x="{x+47}" y="{y+40}" width="187" height="71" rx="7" fill="#141b2b" stroke="#677580" stroke-dasharray="4 7"/><path d="M{x+127} {y+72}v-11q0-16 16-16q16 0 16 16v11" fill="none" stroke="#a4acb8" stroke-width="4"/><rect x="{x+122}" y="{y+69}" width="41" height="31" rx="5" fill="#7a8498"/><circle cx="{x+142}" cy="{y+83}" r="4" fill="#20283b"/>'
        b += txt(x+139,y+155,label,25,color)
        b += f'<path d="M{x+116} {y+185}h47" stroke="#d6b577" stroke-width="5" stroke-linecap="round"/>'
    return w,h,b


def devices():
    w,h=660,288
    b=sky(w,h,121)
    b+= group(117,208,.74,terminal()) + group(383,198,1.6,watch())
    b+=group(570,203,.71,handheld())
    b+='<path class="trail" d="M215 177Q288 237 324 177M446 176q34 49 71-10" fill="none" stroke="#91bdce" stroke-width="3"/>'
    b+=plank(28,240,604,18)+plaque(382,55,161,"CONCEPT",22)
    return w,h,b


def desk():
    w,h=760,345
    b=sky(w,h,131)
    b+='<path d="M17 224L117 194H706L744 229V312H17Z" fill="url(#wood)" stroke="#a97d54" stroke-width="3"/><path d="M17 224L117 194H706L744 229V312H17Z" fill="url(#grain)"/>'
    b+=group(170,180,1.05,terminal())+group(59,178,.9,lamp())+group(320,223,.78,coffee())
    b+=group(466,245,.69,beast("sleep"))
    b+=group(662,221,.62,handheld(),-15)+group(570,282,.55,book("NOTES","#5a786c"),-10)
    b+='<path d="M335 247l56-6 17 45-58 8Z" fill="#e0cbb0"/><path d="M345 256l36-4m-32 14 32-4m-28 15 26-4" stroke="#8a736c" stroke-width="2"/>'
    b+='<rect x="623" y="264" width="70" height="35" rx="5" fill="#97cdb8" stroke="#517e71" stroke-width="2"/><path d="M632 272h51m-51 8h51m-51 8h51" stroke="#466e64" stroke-width="2" stroke-dasharray="2 5"/>'
    b+='<path d="M700 236l-40 29" stroke="#b2aba6" stroke-width="4"/><path d="M708 231l-12 9" stroke="#c49256" stroke-width="9" stroke-linecap="round"/><path d="M241 240q21 38 62 45q51 5 42 25" stroke="#352e3c" stroke-width="7" fill="none"/><path d="M241 240q21 38 62 45q51 5 42 25" stroke="#a28173" stroke-width="2" fill="none"/>'
    b+='<ellipse cx="276" cy="274" rx="27" ry="13" fill="none" stroke="#3e2729" stroke-width="3" opacity=".4"/>'
    b+='<g transform="rotate(4 386 93)"><path d="M337 33h116v138l-13 12H337Z" fill="#efd29c"/><path d="M366 25h58v17h-58Z" fill="#c1b587" opacity=".7"/>'
    for i,name in enumerate(["BUILD","BREAK","LEARN","SHIP"]):b+=txt(354,65+i*28,name,22,"#413139",anchor="start")
    b+='</g>'
    b+=star(512,105,5)+star(601,57,5,"#a2dbe4")
    return w,h,b


def feeding():
    w,h=660,300
    b=sky(w,h,73)
    b+=group(270,247,1.02,beast("feed"))
    b+='<ellipse cx="465" cy="216" rx="95" ry="46" fill="url(#aura)"/><path d="M382 192q6 65 82 65q76 0 82-65Z" fill="#69566d" stroke="#ba929d" stroke-width="3"/><ellipse cx="464" cy="192" rx="82" ry="24" fill="#362d4a" stroke="#dabaa2" stroke-width="3"/>'
    b+='<path class="pulse" d="M454 211q-10-17-19-5q-5 10 19 25q24-15 19-25q-9-12-19 5" fill="#efabc5"/>'
    for x,y,s in [(405,186,8),(437,185,11),(472,191,8),(500,185,10),(459,175,7),(338,196,5),(354,219,4),(493,146,6)]:b+=star(x,y,s,"#ffe2a1")
    b+='<path class="trail" d="M463 140q-19-37-51-22q-42 11-66 42" fill="none" stroke="#ddbd8d" stroke-width="3"/>'
    b+=group(551,185,.53,coffee())+plank(36,266,588,16)
    return w,h,b


def constellation():
    w,h=760,610
    b=sky(w,h,147)
    b+='<ellipse cx="379" cy="317" rx="312" ry="224" fill="none" stroke="#5b6687" stroke-width="1.5" opacity=".5" transform="rotate(-12 379 317)"/><ellipse cx="379" cy="317" rx="235" ry="173" fill="none" stroke="#91738f" stroke-width="1.5" opacity=".3" transform="rotate(18 379 317)"/>'
    b+=txt(380,41,"COSMOS",30,"#bdcfe2")
    b+='<circle cx="379" cy="317" r="94" fill="#244252" stroke="#b38e57" stroke-width="3"/><path d="M306 347q36-42 88-19q40-22 70-3q-18 84-104 69q-35-12-54-47" fill="#427866"/><path d="M315 315q-17-26 12-55q26-29 58-25l-17 45Z" fill="#73a594"/>'
    # The inhabited workshop planet has the recognizable guide on it.
    b+=group(380,342,.59,beast("wave"))+txt(379,443,"BEAST BOX",28)
    b+=group(379,317,1,'<g class="orbit"><circle cx="213" cy="0" r="3" fill="#ffd89c"/>'+star(-148,-126,4,"#b3e5ed")+'</g>')
    b+='<circle cx="155" cy="159" r="41" fill="#344562" stroke="#a0b8ce" stroke-width="2"/>' + group(163,165,.39,telescope()) + txt(155,227,"CST",24)
    b+=group(374,127,.58,terminal())+txt(374,170,"SYNAPSE OS",22)
    b+='<circle cx="607" cy="160" r="41" fill="#805e54" stroke="#dbb97d" stroke-width="2"/><path d="M597 162v-32l27-6v28" stroke="#f3d7a0" stroke-width="3" fill="none"/><ellipse cx="590" cy="164" rx="9" ry="6" fill="#f3d7a0"/><ellipse cx="617" cy="154" rx="9" ry="6" fill="#f3d7a0"/>' + txt(607,227,"REALITY BRIDGE",21)
    b+='<circle cx="646" cy="335" r="36" fill="#426359" stroke="#94c0ad" stroke-width="2"/><path d="M616 326q33-16 56 4m-53 19q28-12 50-3" stroke="#82b596" fill="none" stroke-width="4"/>' + txt(637,397,"LIVING UNIVERSE",21)
    b+=group(111,355,.8,terrarium())+txt(113,428,"MEDIA",22)
    b+=group(179,513,.76,book("MAP","#536174"))+txt(179,564,"MANUAL",22)
    b+='<path d="M364 493q-17-26-35-6q-10 17 35 49q45-32 35-49q-18-20-35 6" fill="#c985a3" stroke="#f1b3c2" stroke-width="2"/>' + txt(364,564,"HEARTLIGHT",22)
    b+='<g transform="translate(574 496)"><rect x="-51" y="-22" width="102" height="43" rx="7" fill="#4c6575" stroke="#acd3d7" stroke-width="2"/><path d="M-33-6h24m-24 13h15M12-4l8 6-8 6" stroke="#bbecd5" stroke-width="3" fill="none"/><path d="M-21-22v-14h41v14" fill="none" stroke="#b6aa88" stroke-width="4"/></g>' + txt(574,556,"PYTHON CST",22)
    return w,h,b


def strip():
    w,h=900,245
    b=sky(w,h,151)
    b+=plank(26,217,848,16)
    for x,pose in [(135,"wave"),(447,"game"),(749,"sleep")]:
        b+=group(x,206,.68,beast(pose))
    return w,h,b


def divider():
    w,h=900,125
    b=sky(w,h,159)
    b+='<path d="M31 87q176-81 342-12t495-8" stroke="#698f9c" stroke-width="3" fill="none"/><path class="trail" d="M31 87q176-81 342-12t495-8" stroke="#e0c698" stroke-width="3" fill="none"/>'
    b+=group(467,94,.34,beast("crystal"))
    return w,h,b


def guide():
    w,h=360,300
    b=sky(w,h,171)+group(170,274,1.08,beast("wave"))+star(294,95,7)+star(66,183,5,"#97e5e9")
    return w,h,b


SCENES = {
    "light-bringer.svg": (lambda:hero(False),"The NavisWORLD cosmic workshop","An arched walnut cabinet lit by brass lamps. A brown dragon with amber eyes, fire wings, burgundy toes and a cyan save tag holds a crystal inside its central glass habitat. Code, model familiars, a purple handheld, CST notes and a watch concept occupy the surrounding shelves. The save tag is an artwork motif, not a claimed runtime field."),
    "light-bringer-mobile.svg": (lambda:hero(True),"The cosmic workshop, small screen edition","A taller, simplified cabinet composition with the same waving fire-winged Beast, purple handheld, model familiars, memory cartridge and notebook. Essential objects remain large on a small screen."),
    "cosmos-core.svg": (lambda:worlds(False),"Same Beast, different worlds","The same fire-winged Beast stands between four arched doors: a planted Beast Cage, model crystals in Brain Bay, Lost COSMOS in a purple handheld and save or device surfaces. Gentle return trails suggest bounded state exchange, not automatic authority transfer."),
    "cosmos-core-mobile.svg": (lambda:worlds(True),"Four doors around one Beast","A tall arrangement of four illustrated worlds around one recognizable creature. Beast Cage, Brain Bay, Lost COSMOS and save or device doors keep their labels readable on small screens."),
    "model-garden.svg": (lambda:garden(False),"The cosmic model menagerie","Four model-work familiars share the upper shelf: purple RAWRPHOS, cyan PHOS, amber SAMGO and geometric QC67/Zeref. Below them a COSMIC.CYPHER switchboard is a router, a Nebula terrarium is world identity, and an empty socket is the open adapter slot. The router and world are not models."),
    "model-garden-mobile.svg": (lambda:garden(True),"A model menagerie for small screens","Four named model-work familiars sit on two wooden shelves. A separate bottom shelf contains the COSMIC.CYPHER router machine, Nebula world terrarium and empty compatible adapter socket."),
    "lost-cosmos-screen.svg": (game_scene,"The Beast enters Lost COSMOS","An illustrated fire-winged guide plays beside a purple handheld. The game screen contains a pixel interpretation of the same brown dragon with fire wings, amber eye and burgundy feet. A SAVE cartridge keeps the lineage motif visible. This scene is artwork, not a software screenshot or physical device photograph."),
    "creature-telemetry.svg": (scanner,"Example simulated signal scanner","The guide stands beside a brass and glass scanner clearly marked EXAMPLE and SIMULATED INPUT. Focus 18, calm 8 and spark 94 are transcribed from the creator-supplied Cogfist interface capture. These are simulated input values, not live telemetry and not measurements of the illustrated guide."),
    "cst-observatory.svg": (observatory,"The quiet CST observatory shelf","The same Beast wears safety goggles beside a brass telescope, CST notebook and orbital state sketch. A paper marked 12D STATE refers to computational notation, not proven physical dimensions or consciousness."),
    "provenance-bench.svg": (provenance,"Four separate provenance drawers","Four physically separated instrument drawers: SIMULATOR with a QVM waveform, SEEDED with a deterministic seed cartridge, MEASURED with a retained receipt, and QPU with an asterisk and locked instrument bay. The hardware label requires actual hardware provenance; this artwork claims no current QPU execution."),
    "device-lab.svg": (devices,"Local host and portable device concepts","A local terminal, watch marked CONCEPT and purple handheld exchange bounded illustrated state trails. The watch is a future device direction, not a claim of an existing physical prototype."),
    "project-constellation.svg": (constellation,"The repository solar system","An inhabited Beast Box planet and its fire-winged guide sit in the COSMOS field. CST has an observatory moon; Synapse OS a machine satellite; Reality Bridge a music moon; Living Universe a simulation planet; Python CST a toolkit satellite; Manual a floating book; Media a nebula terrarium; Heartlight a heart planet."),
    "cory-chaos.svg": (desk,"Cory's inventor desk","A messy walnut desk holds a terminal, coffee, lamp, handwritten notes, a purple handheld, screwdriver, breadboard and music cable. The familiar fire-winged Beast sleeps near the notebook. A sticky note says BUILD, BREAK, LEARN, SHIP. The desk represents its human builder without inventing a portrait."),
    "feed-the-beast.svg": (feeding,"The Beast eats stardust","The same amber-eyed fire-winged dragon munches a gold crystal beside a little bowl of stardust with a softly glowing heart. This playful support illustration has no payment buttons, revenue or sponsor counters."),
    "living-beast-strip.svg": (strip,"One Beast in three poses","The same recognizable brown, fire-winged guide waves, plays a handheld and sleeps on one wooden shelf. The scene depicts continuity through poses, not three different creature identities."),
    "cosmic-break.svg": (divider,"A little workshop cable","A small familiar Beast holds a memory crystal on a gently pulsing cable. No required information is embedded in the decoration."),
    "spark-guide.svg": (guide,"The Spark Beast waves goodbye","A waving vector interpretation of the creator-supplied pixel-art dragon keeps its brown hide, amber eyes, fire wings and burgundy feet. A cyan save tag is a profile design motif, not a new runtime field."),
}


def build(check=False):
    failures=[]
    for name,(draw,title,description) in SCENES.items():
        w,h,body=draw()
        data=(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title desc">\n'
              f'<title id="title">{escape(title)}</title>\n<desc id="desc">{escape(description)}</desc>\n'
              f'<style>{STYLE}</style>\n<defs>{DEFS}</defs>\n{body}\n</svg>\n')
        path=ASSETS/name
        if check:
            if not path.exists() or path.read_text()!=data:failures.append(name)
        else:
            path.write_text(data)
            print(f'{name}: {len(data.encode()):,} bytes')
    if failures:raise SystemExit('Generated art differs: '+', '.join(failures))
    if check:print(f'WORKSHOP SOURCES MATCH: {len(SCENES)} SVGs')


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='verify assets reproduce exactly')
    build(parser.parse_args().check)
