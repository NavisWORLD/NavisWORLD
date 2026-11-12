#!/usr/bin/env python3
"""Render spark-poster.webp and assets/zeref-spark-3d.webp from the current recorded-state plan.

Serves nothing itself; point --base at a running static server of docs/
(e.g. python3 -m http.server 8765 --directory docs).
"""
from __future__ import annotations

import argparse
import asyncio
import io
import json
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8765")
    ap.add_argument("--live", default=str(ROOT / "zeref" / "live.json"))
    ap.add_argument("--frames", type=int, default=48)
    ap.add_argument("--size", type=int, default=480)
    args = ap.parse_args()
    live = json.loads(Path(args.live).read_text(encoding="utf-8"))
    n, size = args.frames, args.size

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path="/usr/bin/google-chrome",
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
        )
        ctx = await browser.new_context(viewport={"width": size, "height": size}, device_scale_factor=1, bypass_csp=True)
        page = await ctx.new_page()
        await page.goto(args.base.rstrip("/") + "/robot/", wait_until="load")
        duration = await page.evaluate(
            """async (live) => {
              document.body.innerHTML = '<div id=c style="width:%dpx;height:%dpx;background:radial-gradient(90%% 80%% at 50%% 30%%,#241a52 0%%,#0b0a1f 70%%)"></div>';
              document.body.style.margin = '0';
              const m = await import('/robot/spark3d.mjs');
              window.v = await m.mount(document.getElementById('c'), { fixedTime: 0, live, shadows: true });
              return window.v.plan.duration;
            }""" % (size, size),
            live,
        )
        print(f"plan duration {duration:.3f}s, {n} frames")
        frames = []
        for i in range(n):
            t = duration * i / n
            await page.evaluate("(t) => window.v.renderAt(t)", t)
            png = await page.screenshot()
            frames.append(Image.open(io.BytesIO(png)).convert("RGB"))
        poster = ROOT / "docs" / "robot" / "spark-poster.webp"
        frames[0].save(poster, quality=82, method=6)
        print(f"poster {poster} {poster.stat().st_size} bytes (closed frame)")
        loop_path = ROOT / "assets" / "zeref-spark-3d.webp"
        chosen = None
        for q in (60, 50, 42, 36, 30):
            buf = io.BytesIO()
            frames[0].save(
                buf, "WEBP", save_all=True, append_images=frames[1:],
                duration=int(duration * 1000 / n), loop=0, quality=q, method=6,
            )
            print(f"quality {q}: {len(buf.getvalue())} bytes")
            chosen = buf.getvalue()
            if len(chosen) < 290_000:
                break
        if chosen is None or len(chosen) >= 300_000:
            raise SystemExit("could not fit the profile loop under 300 KB")
        loop_path.write_bytes(chosen)
        print(f"wrote {loop_path} {len(chosen)} bytes")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
