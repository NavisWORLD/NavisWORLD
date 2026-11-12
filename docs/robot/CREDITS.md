# Zeref Spark 3D: sources and credits

- **Robot geometry**: *ZEREF SPARK companion robot CAD package v0.2*, `beast spark robot/` in
  [NavisWORLD/The-beast-box-](https://github.com/NavisWORLD/The-beast-box-/tree/main/beast%20spark%20robot)
  (Apache-2.0). CONCEPT DESIGN / NOT BUILT HARDWARE; all dimensions are CAD ESTIMATES.
  `zeref-spark.glb` = the package's assembly-coordinate STLs (`out/stl/assembly_coords`, 37 custom parts
  minus the off-model dark plug ZS-605, plus 14 purchased-part proxies), welded and packed unchanged by
  `scripts/robot/build_spark_glb.py` (deterministic: same STLs, same bytes). Colours follow `cad/render.py`.
- **Renderer**: [three.js](https://threejs.org) r180 (MIT, `vendor/LICENSE`): core, GLTFLoader, OrbitControls,
  RoomEnvironment, BufferGeometryUtils, vendored unchanged except their `three` import path.
- **Motion**: written here (`spark3d.mjs`), a pure function of time (16 s loop): the shells open on their y=0
  seam, LED rings pulse, the crystal station cycles white / 365 nm UV / 940 nm IR. Limbs are static in the design.
- **Stills / loop**: `spark-poster.webp` and `assets/zeref-spark-3d.webp` are frames rendered from this viewer
  (headless Chrome, fixed times and angles).
