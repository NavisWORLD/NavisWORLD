# Zeref Spark 3D: sources and credits

- **Robot geometry**: *ZEREF SPARK companion robot CAD package v0.2*, `beast spark robot/` in
  [NavisWORLD/The-beast-box-](https://github.com/NavisWORLD/The-beast-box-/tree/main/beast%20spark%20robot)
  (Apache-2.0). CONCEPT DESIGN / NOT BUILT HARDWARE; all dimensions are CAD ESTIMATES.
  `zeref-spark.glb` = the package's assembly-coordinate STLs (`out/stl/assembly_coords`, 37 custom parts
  minus the off-model dark plug ZS-605, plus 14 purchased-part proxies), welded and packed unchanged by
  `scripts/robot/build_spark_glb.py` (deterministic: same STLs, same bytes). Colours follow `cad/render.py`.
- **Renderer**: [three.js](https://threejs.org) r180 (MIT, `vendor/LICENSE`): core, GLTFLoader, OrbitControls,
  RoomEnvironment, BufferGeometryUtils, vendored unchanged except their `three` import path.
- **Motion**: planned in `motion.mjs` from SHA-256 of Zeref's recorded state (`zeref/live.json`: heartbeat tick,
  diary mood, spark tick, brain step, last-said time, fetched_at), then a mulberry32 PRNG seeded only with that
  digest. The sequence always starts closed. Shells open on their y=0 seam; LED rings pulse; the crystal station
  cycles white / 365 nm UV / 940 nm IR. Limb, head and ear motion is SIMULATED (those parts are static in the
  CAD). No Math.random. Label: "moves chosen from Zeref's recorded state · SIMULATED motion".
- **Stills / loop**: `spark-poster.webp` and `assets/zeref-spark-3d.webp` are frames rendered from this viewer
  (headless Chrome, times taken from the current recorded-state plan). The live 3D view re-plans whenever
  `zeref/live.json` is refreshed; the committed webp is a snapshot of that same plan.
