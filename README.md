# Lumen Run

A 3D parkour runner for children. The game core is [Aura](https://github.com/cybrid-systems/aura) **v0.2.0** (`cf7353373ea276bc03e8364592814382ebd62539`). The browser is a WebGL2 view: a third-person camera sits behind the runner, and the course is three lanes of real boxes, gates, crates and gems.

Tap or press Space to jump. Swipe down or press Down to slide. Swipe sideways or press Left and Right to change lane. The same edges work on a gamepad (A jump, B or down slide, d-pad lanes). The first stretch is a straight garden path. Nothing has to be read to start, and a death is a single tap to run it again.

## Play

```bash
./run.sh
```

That downloads the official Aura v0.2.0 release if you do not already have it (it does not build LLVM), starts the core, and serves the page at <http://127.0.0.1:8080>.

The world code on screen (`LUMEN-42`) is the seed. Open `http://127.0.0.1:8080/?seed=42` to share the same course. Add `?stats=1` for frame-time numbers, `?bench=1` to drop a JSON summary into the page after 180 frames.

An OpenAI-compatible model is optional. Without a key the offline generator in Aura builds every chunk.

```bash
export LLM_API_KEY=...
export LLM_BASE_URL=https://api.openai.com/v1   # optional
export LLM_MODEL=gpt-4o-mini                     # optional
./run.sh
```

The model is asked for one s-expression. Aura checks it before it can appear. A rejected phrase is rolled back and the seeded course continues.

## DESIGN

The browser predicts the runner from the latest rule snapshot, so a slow server tick never changes how a jump feels. Aura remains the authority for the course, the score and a death.

| What you see | Aura feature | Where |
| --- | --- | --- |
| Gravity, jump, slide time and speed can change while a run is going | `mutate:rebind` on the live defines in `core/hot.aura`, installed with `set-code` | `lib/live.aura`, `core/main.aura` |
| A new obstacle phrase is tried without touching the run, then kept or thrown away | `evo:trial` (child workspace) and `evo:commit!` | `consider-form!` in `core/main.aura`, `check-source` in `lib/gen.aura` |
| The check is executable: jump reach, gate height, a lane left open beside a crate, and an autopilot that has to finish the chunk | pure step in `lib/phys.aura` inside the trial | `constraint-hash`, `autopilot-clear?` |
| Later chunks get a little harder when you are clearing them, and easier when you are not | `std/evo` UCB policy (`evo:policy`, `evo:policy-select`, `evo:policy-report`) plus `evo:record!` | `core/main.aura` |
| The same seed is the same course | `std/random` seeded from the share code | `pattern-chunk` |
| The model call does not pause the run | `fiber:spawn` and channels; the seeded generator fills the track immediately | `start-llm!`, `poll-llm!` |
| Why a phrase was kept or rejected | the decision list, also written to `AURA_EVO_LOG` for `aura evo log` | `note!` |

Two Aura v0.2.0 limits are worked around in this repo, and only here:

- After `evo:trial`, `mutate:rebind` on the parent workspace returns `cow-refused` (read-only layer) even under `--preset dev`. Publishing a kept phrase uses `set-code` of the whole rule block, which still updates the live defines. Rebind works again on a fresh process, and the server tries it first.
- Inside the trial, `vector-set!` and `hash-set!` are refused as mutate effects. The physics step returns new lists, so the fairness autopilot can actually run in the child workspace. `channel:try-recv` on an empty channel returns `""`, which is truthy, so the server only treats a hash as a model reply. `json-encode` of a vector is `null`, so pieces are lists.

## Layout

- `core/main.aura` — TCP newline-JSON server, simulation, proposals
- `lib/phys.aura` — fixed-step lanes, jump, slide (twin: `web/sim.mjs`)
- `lib/gen.aura` — seeded chunks and the constraint gate
- `web/` — WebGL2 third-person view
- `bridge/server.mjs` — static files and the WebSocket bridge
- `./run.sh` — one command

## Tests

```bash
aura test                 # core, needs Aura v0.2.0
node scripts/check-sim.mjs
node scripts/smoke.mjs    # seeded run, then a WebSocket hello
```

GitHub Actions runs those three jobs. The Aura job uses `ghcr.io/cybrid-systems/aura:0.2.0`.

On this VM (Linux x86_64, 4 cores, Chrome 156 headless, SwiftShader WebGL2, 1280×720) a seeded run held **60 fps, frame p50 16.7 ms, p95 33.4 ms** over 180 frames. An Aura physics step is **174 µs** (3000 steps in 523 ms), so a 60 Hz tick is about 1% of the frame. The p95 blip is a doubled vsync interval under software GL, not the game core.

