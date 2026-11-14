# Lumen Run

A 3D parkour runner for children. The game core is [Aura](https://github.com/cybrid-systems/aura) nightly, the rolling build from `main`. The browser is a WebGL2 view: a third-person camera follows the runner along a path that bends. The runner starts as a small light-keeper and can take another gentle look. Three lanes, jumps, slides, and a few friends running beside the path.

## Play

```bash
./run.sh
```

Open <http://127.0.0.1:8080>. Ctrl-C stops the core and the page. If 8080 or 8765 is taken, set `AURA_RUNNER_WEB` and `AURA_RUNNER_PORT`.

The first run downloads Aura nightly for this machine (Linux x86_64 or arm64) into `.tools`. Later runs reuse that copy and only fetch the release checksum, so a new nightly replaces it on its own. Nothing here is compiled.

| Key | Action |
| --- | --- |
| ↑, Space, or a tap | jump |
| ↓ | slide |
| ← → | change lane |

Left, A, a left swipe and a left stick all move the runner toward the left of the screen. A gamepad uses A to jump, B or down to slide, and the d-pad for lanes.

The badge (`LUMEN-42`) is the seed. Open `http://127.0.0.1:8080/?seed=42` for the same course. Tap the badge for the last few garden notes. `?stats=1` shows frame time. `?bench=1` writes a JSON summary into the page after 180 frames.

A kept change from the model shows as a short word in the bottom-right (`shape`, `bend`, `star`, `sky`, `friend`, or the runner's new look). The latest sentence sits on the line above that word. The run does not stop for it. A stumble still uses the line at the top: "Oops! Keep going", or "Back on the path" after a gap.

Already have an Aura nightly binary and want to skip the download:

```bash
AURA_BIN="$(command -v aura)" ./run.sh
```

## Model

An OpenAI-compatible model is optional. Without a key, the offline generator builds every chunk. The garden still starts with a kitten and a little car.

`./run.sh` reads two key files and probes each endpoint before the core listens. DeepSeek V4.1 Flash is the default (`deepseek-flash` at `https://api.deepseek.com/v1`). MiniMax is the other choice. A button in the garden switches between the ones the probe kept. HTTP 401 or 403 drops that key. If the network does not answer, the key file is still used and the status line says the probe was unconfirmed.

```bash
./run.sh                 # DeepSeek V4.1 Flash
./run.sh minimax         # prefer MiniMax when that key is usable
```

The files are one token each and are not printed:

- `~/code/keys/deepseek`, or `DEEPSEEK_KEY_FILE`
- `~/code/keys/minimax`, or `MINIMAX_KEY_FILE`

MiniMax uses `https://api.minimaxi.com/v1` and `MiniMax-M3.1-Flash`. `https://api.minimax.io` returns 401 for a China key, so the probe does not call it. An `LLM_API_KEY` already in the environment is left as it is, which is how the mock tests point at a local server.

The model is asked for an obstacle phrase, a garden phrase, and one friend. Each reply starts with one short sentence, then an allowlisted s-expression. The line by the model name shows that sentence. A friend phrase can also restyle the runner. Aura checks the form before it can appear. A rejected phrase is rolled back and the run continues. The calls run on fibers, so the run does not wait on them.

## What you feel

The browser predicts the runner from the latest rule snapshot, so a slow server tick never changes how a jump feels. Lanes ease in with a cap on acceleration. A jump builds speed for a short takeoff, then gravity takes over. The road heading accumulates, and the sun and the hills turn with it, so a new bend continues from where you are. A stumble or a "Back on the path" does not swing that view back to the opening. Aura remains the authority for the course, the score and a stumble.

Hitting a hurdle, a gate, a pot or a gap does not end the run. The runner flashes for about 1.5 seconds, slows down, loses a few points, and keeps going. Old chunks behind the runner are dropped so a long run does not keep the whole trail.

| What you see | Where |
| --- | --- |
| Speed, gravity, jump and slide ease as you clear chunks. A short line names it ("A little faster", "A gentler pace") | `apply-feel!` in `core/main.aura`, live defines in `core/hot.aura` |
| A fair obstacle phrase blooms in ahead. Pickups can become a star, gem, blossom or apple. The road can bend harder. A phrase can also send a paper plane, bubble, lantern, leaf, or ball down one lane, and that toy flies toward the runner. The corner word names what changed | `consider-form!`, `lib/gen.aura`, `web/render.mjs` |
| Sky, grass, flowers and light ease into a new garden | `consider-scene!`, `lib/scene.aura` |
| The kitten and the car stay. A friend can join or an existing one can change look and motion. The same phrase can restyle the runner as a kitten, car, bunny, bird, butterfly, frog, duck, or back to the light-keeper. At most six friends | `consider-pals!`, `lib/pals.aura` |
| The model button swaps DeepSeek and MiniMax | `scripts/probe-llm.sh`, `on-provider` |
| The same seed is the same course | `pattern-chunk` |

A kept phrase is published with `(mutate :rebind)`. `set-code` runs only when a rebind refuses.

## Layout

- `core/main.aura` — TCP newline-JSON server, simulation, proposals
- `lib/phys.aura` — fixed-step lanes, jump, slide (twin: `web/sim.mjs`)
- `lib/gen.aura` — seeded chunks and the constraint gate
- `lib/scene.aura` — garden phrase
- `lib/pals.aura` — companions and the runner's look
- `web/` — WebGL2 view
- `bridge/server.mjs` — static files and the WebSocket bridge
- `./run.sh` — one command

## Tests

```bash
source scripts/aura-path.sh
export PATH="$(dirname "$(install_aura "$PWD")"):$PATH"   # or skip this if aura nightly is already on PATH
aura test
node scripts/check-sim.mjs
node scripts/check-lanes.mjs
node scripts/smoke.mjs
node scripts/mock-llm-e2e.mjs
node scripts/check-probe.mjs
bash scripts/check-install.sh
```

`check-sim` follows the physics golden. A wide gap and a gate you fail to slide are stumbles, so `wide-alive` and `stand-alive` are `1`. The fairness gate is unchanged: its autopilot still dies on that geometry, so the phrase is not kept.

GitHub Actions runs the Aura job on `ghcr.io/cybrid-systems/aura:nightly`. The smoke job installs the same nightly release the play script uses.
