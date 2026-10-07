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
]
for rel in required_files:
    if not (ROOT / rel).exists():
        errors.append(f"missing required file: {rel}")

for svg in (ROOT / "assets").glob("*.svg"):
    try:
        ET.parse(svg)
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
    "https://buymeacoffee.com/Cosmic_syanpse",
    "https://github.com/NavisWORLD/The-theory-of-CST",
    "https://github.com/NavisWORLD/Synapse-os-",
]
for link in required_links:
    if link not in README:
        errors.append(f"missing important link: {link}")

required_phrases = [
    "MODEL ≠ MEMORY ≠ STATE ≠ AUTHORITY",
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
    if re.search(pattern, README, re.I):
        errors.append(f"forbidden or suspicious content in README: {label}")

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