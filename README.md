# Lumen Run

A 3D parkour runner for children. The game core is [Aura](https://github.com/cybrid-systems/aura) nightly, the rolling build from `main`. The browser is a WebGL2 view: a third-person camera follows the runner along a path that bends. The runner starts as a small light-keeper and can take another gentle look. Three lanes, jumps, slides, and a few friends running beside the path.

## Play

```bash
./run.sh
```

Open <http://127.0.0.1:8080>. Ctrl-C stops the core and the page. If 8080 or 8765 is already taken, `./run.sh` prints the next free port and uses that. Set `AURA_RUNNER_WEB` or `AURA_RUNNER_PORT` to choose one.

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

The model is asked for an obstacle phrase, a garden phrase, and one friend. Each reply starts with one short sentence, then an allowlisted s-expression. The line by the model name shows that sentence. A friend phrase also restyles the runner. Aura checks the form before it can appear. A rejected phrase is rolled back and the run continues. The calls run on fibers, so the run does not wait on them.

## What you feel

The browser predicts the runner from the latest rule snapshot, so a slow server tick never changes how a jump feels. Lanes ease in with a cap on acceleration. A jump builds speed for a short takeoff, then gravity takes over. The road heading accumulates, and the sun and the hills turn with it, so a new bend continues from where you are. A stumble or a "Back on the path" does not swing that view back to the opening, and the drawn path glides across a gap instead of popping. Aura remains the authority for the course. The score and a stumble follow the picture, so a late tick does not call a miss the runner did not touch.

Hitting a hurdle, a gate, or a pot does not end the run. The runner slows for a moment, loses a few points, and keeps going. A gap sets them back on the path at the same pace, without a white flash. The hole is the water on that lane. A pot or a toy counts when the body meets it. Old chunks behind the runner are dropped so a long run does not keep the whole trail.

| What you see | Where |
| --- | --- |
| The run opens at 8 m/s and climbs as stretches clear, and also every eight seconds, up to 14 m/s. A chat does not hold that climb. Pickups score points: coin 25, blossom 40, apple 55, star 80, gem 120. A quick row multiplies them, up to five. The line under the points is a rating, from Sprout to Lumen, and a solid hit lowers it one step | `apply-feel!`, `loot-worth` in `core/main.aura`, `web/score.mjs`, `web/main.mjs` |
| A fair obstacle phrase blooms in ahead. Pickups can become a star, gem, blossom or apple. The road can bend harder. Every stretch also sends one gentle toy toward the runner: a paper plane, bubble, lantern, leaf, or ball, along one lane. A phrase can send one too. A hurdle can be a bar, a log, a fence, a flower row, or drums. A gate can be a bar, a ribbon, a vine, lights, or a scarf. A block can be a pot, a stump, a mushroom, a crate, or a bush. Passing them stays the same. The corner word names what changed | `consider-form!`, `lib/gen.aura`, `web/render.mjs` |
| Sky, grass, flowers and light ease into a new garden | `consider-scene!`, `lib/scene.aura` |
| The kitten and the car stay. A bunny, a puppy, a bird, and a butterfly come along on their own. A phrase can still add or restyle a friend, including a fox, a turtle, or a bee. That phrase also restyles the runner. A look the model names is kept. If it leaves the look out, or repeats it, the runner takes the next gentle kind: kitten, car, bunny, bird, butterfly, frog, duck, then around again. The model can still name the light-keeper. At most six friends. A kept obstacle phrase is used on every other stretch, and a phrase that leaves the look out still changes shape along the road | `consider-pals!`, `maybe-guests!`, `lib/pals.aura`, `web/render.mjs` |
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
