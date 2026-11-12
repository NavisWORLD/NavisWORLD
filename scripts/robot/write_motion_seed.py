#!/usr/bin/env python3
"""Copy the recorded fields from zeref/live.json into docs/robot/motion-seed.json.

The Pages 3D view plans its SIMULATED motion from a hash of this recorded state
(or from the live copy on raw.githubusercontent.com when that fetch succeeds).
Does not touch training, pins, gates, or feed items.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIVE = ROOT / "zeref" / "live.json"
OUT = ROOT / "docs" / "robot" / "motion-seed.json"


def seed_from_live(live: dict) -> dict:
    said = live.get("last_said") or {}
    return {
        "schema": "navisworld-zeref-spark-motion-seed/v1",
        "source": "zeref/live.json",
        "label": "moves chosen from Zeref's recorded state · SIMULATED motion",
        "fetched_at": live.get("fetched_at"),
        "heartbeat": live.get("heartbeat"),
        "diary": live.get("diary"),
        "spark": live.get("spark"),
        "brain": live.get("brain"),
        "last_said": {"at": said.get("at"), "step": said.get("step")} if said else {},
    }


def main() -> None:
    live = json.loads(LIVE.read_text(encoding="utf-8"))
    OUT.write_text(json.dumps(seed_from_live(live), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
