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
  then a mulberry32 PRNG seeded only with that digest. Idle breathing, blinks, glances, ear twitches, wing
  stretches, tail curls, little hops and looks all come from that plan. Reactions when a visitor sends a message,
  while a real request is in flight, and when a reply arrives are SIMULATED motion triggered by
  those real chat events; the shape of each reaction is also taken from the same recorded-state
  seed. No Math.random. Label: "moves chosen from Zeref's recorded state · SIMULATED motion".
- **Cosmic look**: the same sculpt and rig, his purple / violet palette with cyan
  accents, with a deeper cyan / violet / magenta starfield and nebula in the fur,
  saturated nebula on the wing membranes, a brighter glow on the moon marks
  and eyes, and a stronger dust aura with a soft bloom. Twinkle and drift are
  deterministic (seeded from the recorded-state digest in `zeref/live.json`, then
  time-based). No Math.random. If a phone's frame time stays low, the aura and
  extra shaders step down on their own.
- **Dance**: when Cory's song is playing, `dance.mjs` routes the same-origin
  `<audio>` element through a Web Audio AnalyserNode and drives his body from
  the live frequency bands (bass/kick → bounce and hops with squash/stretch,
  mids → head and ears, highs → wings and tail, loudness → energy; strong
  onsets can flourish or spin). Rolling per-band peaks adapt to
  quiet and loud passages; onsets come from a rise in a band, not a metronome.
  The AudioContext is created and resumed in the visitor's play tap so iPhone
  Safari will allow it. When the song is paused he returns to his recorded-state
  idle; chat reactions still win while he is thinking or replying. Label:
  "dancing to Cory's song · driven by the live audio signal". The 2D portrait
  fallback uses the same bands as a CSS pulse.

- **Color particles and signal readout**: `particles.mjs` draws a GPU point
  cloud (cyan / violet / magenta / gold) around him. Emission and color come
  only from the live AnalyserNode signal (bass onsets → radial bursts, mids →
  swirl, highs → twinkle and a shift toward gold, loudness → density). At idle
  a faint drift is seeded from the same recorded-state digest as his motion.
  No Math.random. A small 3-band ring and an on-stage meter are labeled
  "live audio signal · bass mid high". Realistic reactions to the song
  (perk on start, startle then pounce on a real drop, melody sway from the
  spectral centroid, flare on highs, settle when the audio fades, curiosity
  on a sudden quiet) are smoothed with attack/release envelopes in `dance.mjs`.
  Particle count steps down with the same quality guard as the cosmic look.

- **Recorded-state expression**: `expression.mjs` tints his iris and sets a
  rest expression from fields that actually exist on the public live card
  (`zeref/live.json`): diary mood (RECORDED) for iris hue, heartbeat energy
  and spark/heartbeat state (SIMULATED / LOCAL SIMULATED / STALE) for glow,
  energy + mood for eyelid openness, mood + resonance for ear/tail/wing rest,
  and a slight proud posture only when the served brain step matches the
  pinned release. 12D lived state (state12 / dyn12), diary tone, fair-gate
  result, and last promotion time are not in the public files this page can
  read — those use a neutral default and are listed as unavailable on the
  legend. This is a display mapping, not a claim of feelings. Label:
  "expression mapped from Zeref's recorded state · not a claim of feelings".
  The song still overrides body motion; the recorded iris and base mood stay.
  The 2D portrait fallback gets the same iris tint and glow. No Math.random.
  Read-only; nothing here is written into training, pins, or gates.

- **Rhythm and harmonics**: `rhythm.mjs` reads the same live AnalyserNode /
  FFT (no fake beats, no Math.random). Kick (40–120 Hz) hops and squashes
  the body; snare (150–400 Hz + 2–5 kHz) snaps the head and flicks the
  ears, with ear tips following through; hats (6–12 kHz) flick the tail tip
  and shimmer the wing tips; a confident tempo (autocorrelation of spectral
  flux, checked against inter-onset intervals) drives a beat-phase tracker
  so he can anticipate beats and put a little more weight on the downbeat
  every 4 — when confidence is low he follows pure onsets only, and the
  readout says so. Harmonic energy spreads the wings and adds a slow wing
  beat; the dominant chroma pitch class tints the aura / particles (12 hues
  on a color wheel); a chroma-vector jump is a short turn / pose change;
  melody (centroid and pitch class) tilts his gaze. The 2D portrait gets
  the same beat pulse and hue. The recorded-mood expression from the live
  card is still the base. Readout: "live audio signal · beat · harmonics"
  plus BPM, confidence, and pitch class.
