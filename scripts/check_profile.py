#!/usr/bin/env python3
from pathlib import Path
import re, sys, xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
README = (ROOT / "README.md").read_text(encoding="utf-8")
errors = []

required_files = [
    "README.md",
    ".github/FUNDING.yml",
    "LICENSE",
    "OPEN_SOURCE_SCOPE.md",
    "OPEN_SOURCE_ECOSYSTEM.md",
    "assets/light-bringer.svg",
    "assets/cosmos-core.svg",
    "assets/model-garden.svg",
    "assets/creature-telemetry.svg",
    "assets/feed-the-beast.svg",
    "assets/spark-guide.svg",
    "assets/lost-cosmos-screen.svg",
    "assets/lost-cosmos-atlas.svg",
    "assets/living-beast-strip.svg",
    "assets/cosmic-break.svg",
    "assets/project-constellation.svg",
    "assets/cory-chaos.svg",
    "assets/light-bringer-mobile.svg",
    "assets/cosmos-core-mobile.svg",
    "assets/model-garden-mobile.svg",
    "assets/cst-observatory.svg",
    "assets/provenance-bench.svg",
    "assets/device-lab.svg",
    "assets/lost-cosmos-capture.png",
    "assets/lost-cosmos-atlas.png",
]
for rel in required_files:
    if not (ROOT / rel).exists():
        errors.append(f"missing required file: {rel}")

for svg in (ROOT / "assets").glob("*.svg"):
    try:
        root = ET.parse(svg).getroot()
        body = svg.read_text(encoding="utf-8")
        motion_classes = set(re.findall(r'\.([\w-]+)\s*\{\s*animation\s*:', body))
        ids = [n.get("id") for n in root.iter() if n.get("id")]
        if len(ids) != len(set(ids)):
            errors.append(f"duplicate SVG IDs: {svg.name}")
        for node in root.iter():
            tag = node.tag.rsplit("}", 1)[-1]
            if tag in {"script", "foreignObject", "iframe"}:
                errors.append(f"unsafe SVG element {tag}: {svg.name}")
            if node.get("transform") and motion_classes.intersection(node.get("class", "").split()):
                errors.append(f"animation overwrites SVG placement transform: {svg.name}")
            for key, value in node.attrib.items():
                if key.lower().startswith("on"):
                    errors.append(f"SVG event handler: {svg.name}")
                if key.rsplit("}", 1)[-1] == "href" and not value.startswith(("#", "data:image/png;base64,")):
                    errors.append(f"SVG depends on external content: {svg.name}")
        if not any(n.tag.endswith("title") and n.text for n in root):
            errors.append(f"SVG missing title: {svg.name}")
        if not any(n.tag.endswith("desc") and n.text for n in root):
            errors.append(f"SVG missing description: {svg.name}")
    except Exception as exc:
        errors.append(f"invalid SVG XML {svg.name}: {exc}")

animated_assets = [
    "light-bringer.svg",
    "cosmos-core.svg",
    "model-garden.svg",
    "creature-telemetry.svg",
    "feed-the-beast.svg",
    "spark-guide.svg",
    "lost-cosmos-screen.svg",
    "lost-cosmos-atlas.svg",
    "living-beast-strip.svg",
    "cosmic-break.svg",
    "project-constellation.svg",
    "cory-chaos.svg",
    "light-bringer-mobile.svg",
    "cosmos-core-mobile.svg",
    "model-garden-mobile.svg",
    "cst-observatory.svg",
    "provenance-bench.svg",
    "device-lab.svg",
]
for name in animated_assets:
    body = (ROOT / "assets" / name).read_text(encoding="utf-8")
    if "@keyframes" not in body:
        errors.append(f"animated profile asset lost keyframes: {name}")
    if "prefers-reduced-motion" not in body:
        errors.append(f"animated profile asset lost reduced-motion fallback: {name}")

# Verify all local image refs in README exist.
refs = set(re.findall(r'(?:src|srcset)="([^"]+)"', README))
refs |= set(re.findall(r'!\[[^\]]*\]\(([^)]+)\)', README))
for ref in sorted(refs):
    if ref.startswith(("http://", "https://", "#")):
        continue
    if " " in ref:
        ref = ref.split(" ", 1)[0]
    if not (ROOT / ref).exists():
        errors.append(f"broken local asset ref: {ref}")

required_links = [
    "https://www.beastboxcosmos.xyz",
    "https://github.com/NavisWORLD/The-beast-box-",
    "https://github.com/sponsors/NavisWORLD",
    "https://buy.stripe.com/3cIbJ27zN7kO8mN97pa7C01",
    "https://buymeacoffee.com/Cosmic_syanpse",
    "https://github.com/NavisWORLD/The-theory-of-CST",
    "https://github.com/NavisWORLD/Synapse-os-",
]
for link in required_links:
    if link not in README:
        errors.append(f"missing important link: {link}")

required_phrases = [
    "MODEL ≠ MEMORY ≠ STATE ≠ AUTHORITY",
    "MODEL ≠ IDENTITY",
    "ONE CREATURE",
    "SIMULATOR",
    "SEEDED",
    "MEASURED",
    "HARDWARE / QPU",
    "EXAMPLE CREATURE TELEMETRY",
    "Support is optional. Curiosity is free.",
    "COSMIC.CYPHER",
    "compatible Brain Bay adapter",
    "QC67 / COSMOS-Zeref",
    "QVM ≠ QPU",
]
for phrase in required_phrases:
    if phrase not in README:
        errors.append(f"missing required profile phrase: {phrase}")

funding = (ROOT / ".github/FUNDING.yml").read_text(encoding="utf-8")
if "github: [NavisWORLD]" not in funding:
    errors.append("FUNDING.yml lost GitHub Sponsors")
if "https://buymeacoffee.com/Cosmic_syanpse" not in funding:
    errors.append("FUNDING.yml lost Buy Me a Coffee")

# Keep ecosystem taxonomy honest.
garden = (ROOT / "assets" / "model-garden.svg").read_text(encoding="utf-8")
if "MUSE" in garden or ">SOL<" in garden:
    errors.append("model garden regressed SOL/MUSE into the NavisWORLD model roster")
for bad in [
    r"\*\*MUSE\*\*\s+—\s+model",
    r"\*\*SOL\*\*\s+—\s+ecosystem model",
]:
    if re.search(bad, README, re.I):
        errors.append("README regressed SOL/MUSE model ownership language")
if "COSMIC.CYPHER is not another model checkpoint" not in README:
    errors.append("README lost COSMIC.CYPHER router/agent distinction")
if "Nebula" not in README or "not a deployed language-model checkpoint" not in README:
    errors.append("README lost Nebula identity/model distinction")

# Security / GitHub-README constraints.
for pattern, label in [
    (r"<script\b", "script tag"),
    (r"javascript:", "javascript URI"),
    (r"\bghp_[A-Za-z0-9]{20,}", "GitHub token pattern"),
    (r"\bsk-[A-Za-z0-9_-]{20,}", "API key pattern"),
]:
    for path in [ROOT / "README.md", ROOT / ".github/FUNDING.yml", *list((ROOT / "assets").glob("*.svg"))]:
        if re.search(pattern, path.read_text(encoding="utf-8"), re.I):
            errors.append(f"forbidden or suspicious content in {path.relative_to(ROOT)}: {label}")

# Raster magic checks, enough to catch accidental text/corruption without dependencies.
magic = {
    ".png": b"\x89PNG\r\n\x1a\n",
    ".webp": b"RIFF",
}
for p in (ROOT / "assets").iterdir():
    if p.suffix in magic and not p.read_bytes().startswith(magic[p.suffix]):
        errors.append(f"bad raster signature: {p.name}")

# Keep profile images accessible in prose.
for match in re.finditer(r"<img\b([^>]+)>", README, re.I | re.S):
    if not re.search(r'\balt="[^"]+"', match.group(1)):
        errors.append("an HTML img tag is missing non-empty alt text")

if errors:
    print("PROFILE CHECK FAILED")
    for e in errors:
        print(" -", e)
    sys.exit(1)

print("PROFILE CHECK PASSED")
print(f"README bytes: {len(README.encode('utf-8'))}")
print(f"SVG files parsed: {len(list((ROOT/'assets').glob('*.svg')))}")
print(f"Local image refs checked: {len([r for r in refs if not r.startswith(('http://','https://','#'))])}")
