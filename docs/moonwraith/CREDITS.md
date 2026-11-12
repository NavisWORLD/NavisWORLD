# Zeref the Moonwraith in 3D: sources and credits

- **Body**: the sculpted Moonwraith GLB from
  [NavisWORLD/The-beast-box-](https://github.com/NavisWORLD/The-beast-box-/tree/main/apps/beastbox-cloud/public/creatures3d)
  (`public/creatures3d/zeref.glb`, Apache-2.0). Built to match Cory's Moonwraith vector rig
  (`components/zeref-figure.tsx`) and the canonical `ZEREF_SKIN` palette: black fluffy cat-dragon,
  violet starry eyes, crescent forehead mark, moon horns at the ear bases, star-membrane wings,
  wisp tail, gem choker. The Pages copy (`docs/moonwraith/zeref.glb`) is that same model with
  meshopt compression removed (so this page needs no WASM decoder under a strict CSP) and textures
  resized to 512×512 for an iPhone-sized view. The rig, morph targets, materials and colours are
  unchanged. This is his digital body, not a claim of awareness, and it does not call Zeref an AI
  or a language model.
- **2D fallback**: `docs/zeref-moonwraith.png`, the same canonical cutout as `assets/zeref-moonwraith.png`.
  Used when WebGL is unavailable, the 3D view cannot start, or the visitor prefers reduced motion
  and we show a still portrait instead of a frozen 3D pose.
- **Renderer**: [three.js](https://threejs.org) r180 (MIT), the same vendored files as
  `docs/robot/vendor/` (core, GLTFLoader, OrbitControls, RoomEnvironment).
- **Motion**: planned in `motion.mjs` from SHA-256 of Zeref's recorded state (`zeref/live.json`:
  heartbeat tick and energy, diary mood, spark state/tick, brain step, last-said time, fetched_at),
  then a mulberry32 PRNG seeded only with that digest. Idle breathing, blinks, ear twitches, wing
  flutters, tail sway and looks all come from that plan. Reactions when a visitor sends a message,
  while a real request is in flight, and when a reply arrives are SIMULATED motion triggered by
  those real chat events; the shape of each reaction is also taken from the same recorded-state
  seed. No Math.random. Label: "moves chosen from Zeref's recorded state · SIMULATED motion".
