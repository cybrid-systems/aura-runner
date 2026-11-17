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
| ↑, W, or a tap | jump |
| hold Space, then let go | say what to change |
| ↓ | slide |
| ← → | change lane |
| R, or Restart | start this run over |

Left, A, a left swipe and a left stick all move the runner toward the left of the screen. A gamepad uses A to jump, B or down to slide, and the d-pad for lanes.

The badge (`LUMEN-42`) is the seed. Open `http://127.0.0.1:8080/?seed=42` for the same course. Tap the badge for the last few garden notes. `?stats=1` shows frame time. `?bench=1` writes a JSON summary into the page after 180 frames.

Hold Space and say what you want to see. Let go and those words go out. The game receives the words, not the sound. A bright line changes the picture at once: a pink, blue, gold, or violet sky, flowers, a star, a gate, or a small friend. Any other bright line still picks a new garden, and steps to another one if that garden is already on screen. A gloomy line is turned away and the picture stays.

The road keeps its hurdles, gates, and blocks. Hold Space and say 加速 to step the pace up (8, 10, 12, 13, 14). 慢一点 steps it down.

A friend on the path keeps up with the run. It changes its speed, how often it switches lanes, or where it appears, one small step at a time, and only after a short trial still gets through. A miss puts the previous step back. The opening lesson has none. The three looks stay a fox, a bird, and a beetle.

The same badge opens the world line. Each change that stayed, and each one that was turned away, is a short line. A kept line can be run again from a safe start on that seed. A line that was turned away shows why, and does not become the road. The list stays on this browser.

A kept change from the model shows as a short word in the bottom-right (`shape`, `bend`, `star`, `sky`, `friend`, or the runner's new look). The latest sentence sits on the line above that word. The run does not stop for it. A stumble still uses the line at the top: "Oops! Keep going", or "Back on the path" after a gap.

Already have an Aura nightly binary and want to skip the download:

```bash
AURA_BIN="$(command -v aura)" ./run.sh
```

## Model

An OpenAI-compatible model is optional. Without a key, the offline generator builds every chunk. The garden still starts with a kitten and several little cars. The cars change shape as they run.

`./run.sh` reads two key files and probes each endpoint before the core listens. DeepSeek V4.1 Flash is the default (`deepseek-flash` at `https://api.deepseek.com/v1`). MiniMax is the other choice. A button in the garden switches between the ones the probe kept. HTTP 401 or 403 drops that key. If the network does not answer, the key file is still used and the status line says the probe was unconfirmed.

```bash
./run.sh                 # DeepSeek V4.1 Flash
./run.sh minimax         # prefer MiniMax when that key is usable
```

The files are one token each and are not printed:

- `~/code/keys/deepseek`, or `DEEPSEEK_KEY_FILE`
- `~/code/keys/minimax`, or `MINIMAX_KEY_FILE`

MiniMax uses `https://api.minimaxi.com/v1` and `MiniMax-M3.1-Flash`. `https://api.minimax.io` returns 401 for a China key, so the probe does not call it. An `LLM_API_KEY` already in the environment is left as it is, which is how the mock tests point at a local server.

The model is asked for an obstacle phrase, a garden phrase, and one friend. Each reply starts with one short sentence, then an allowlisted s-expression. The line by the model name shows that sentence. A friend phrase also restyles the runner. Aura checks the form before it can appear. A rejected phrase is rolled back and the run continues. The calls run on fibers, so the run does not wait on them. A developer can play every seeded stretch with `aura --quiet --preset dev scripts/play-review.aura`. Each line names the band, the spare to two decimals, and how many milliseconds that stretch took. A hard miss exits non-zero. `PLAY_REVIEW_LOOSE=1` prints the same notes and exits 0. A kept or turned-away phrase leaves a short note on the next model ask.

## What you feel

The browser predicts the runner from the latest rule snapshot, so a slow server tick never changes how a jump feels. Lanes ease in with a cap on acceleration. A jump builds speed for a short takeoff, then gravity takes over. The road heading accumulates, and the sun and the hills turn with it, so a new bend continues from where you are. A stumble or a "Back on the path" does not swing that view back to the opening, and the drawn path glides across a gap instead of popping. Aura remains the authority for the course. The score and a stumble follow the picture, so a late tick does not call a miss the runner did not touch.

Hitting a hurdle, a gate, or a pot does not end the run. The runner slows for a moment, loses a few points, and keeps going. A gap sets them back on the path at the same pace, without a white flash. The hole is the water on that lane. A pot or a toy counts when the body meets it. Old chunks behind the runner are dropped so a long run does not keep the whole trail.

| What you see | Where |
| --- | --- |
| The run opens at 8 m/s and climbs as stretches clear, and also every eight seconds, up to 14 m/s. A chat does not hold that climb. Pickups score points: coin 25, blossom 40, apple 55, star 80, gem 120. A quick row multiplies them, up to five. The number floats up off the runner, and a star or a gem is brighter and louder than a coin. Three in a row make that number bigger. A thin bar under the rating fills toward the next name, and that name is called out when it lands. A faster pace says Faster. Sliding under a bar, or leaving the lane as a popper bursts, adds a small Nice. A solid hit lowers the rating one step | `apply-feel!`, `loot-worth` in `core/main.aura`, `web/score.mjs`, `web/main.mjs` |
| Ground between moves is a beat of about 1.3 seconds, laid longer as the pace climbs, so the same phrase takes the same time. The camera looks about one beat ahead. The opening teaches a slide, then a lane change, then a jump, and the coins sit on the lane that clears the change. A phrase that leaves under a quarter-second to spare once it enters the camera view is turned away. A fair obstacle phrase blooms in ahead. Pickups can become a star, gem, blossom or apple. The road can bend harder. Every stretch also sends one gentle toy toward the runner: a paper plane, bubble, lantern, leaf, or ball, along one lane. A phrase can send one too. A long stretch also tosses one round popper onto a single lane. It bounces toward the runner, then bursts. Another lane avoids it, and a high jump can clear the burst. A hurdle can be a bar, a log, a fence, a flower row, or drums. A gate can be a bar, a ribbon, a vine, lights, or a scarf. A block can be a pot, a stump, a mushroom, a crate, or a bush. Passing them stays the same. The corner word names what changed | `consider-form!`, `lib/gen.aura`, `web/render.mjs` |
| Sky, grass, flowers and light ease into a new garden. A spoken line does this at once, from the words, without waiting for a model | `consider-scene!`, `lib/scene.aura`, `lib/wish.aura` |
| The kitten stays, and several little cars run beside the path. Each car keeps its colour and changes body as it rolls: a buggy, a van, a racer, a taxi, and a wagon. Two more cars roll in on their own. A phrase can still add or restyle a friend, including a fox, a turtle, or a bee. That phrase also restyles the runner. A look the model names is kept. If it leaves the look out, or repeats it, the runner takes the next gentle kind: kitten, car, bunny, bird, butterfly, frog, duck, then around again. The model can still name the light-keeper. At most six friends. A kept obstacle phrase is used on every other stretch, and a phrase that leaves the look out still changes shape along the road | `consider-pals!`, `maybe-guests!`, `lib/pals.aura`, `web/render.mjs` |
| The model button swaps DeepSeek and MiniMax | `scripts/probe-llm.sh`, `on-provider` |
| The same seed is the same course | `pattern-chunk` |

A kept phrase is published with `(mutate :rebind)`. `set-code` runs only when a rebind refuses.

## Wished objects

A wish also asks the model for one small object. The keyword answer still lands at once; the object follows a few seconds later.

- The core starts `LUMEN_THING_FIBERS` fibers (default 4). Each asks for the object with its own hint and temperature (simple 0.3, detail 0.7, cute 0.9, bold 1.1).
- A reply is data, never code: `(thing ROLE SIZE (anim KIND AMP RATE) (name WORD) (part SHAPE X Y Z SX SY SZ R G B GLOW) ...)`. `ROLE` is `pickup`, `jump`, `slide`, `decor` or `pal`. `SHAPE` is `box`, `sphere`, `cylinder`, `cone`, `torus` or `gem`. Up to 8 parts, all inside the unit box, with bright colours and capped glow and motion. Jump and slide objects stay still or barely bob.
- `check-thing` refuses anything outside those bounds and any banned word. The fiber then plays a short stretch with the object at its size and keeps it only if the autopilot clears it.
- Replies after `LUMEN_THING_DEADLINE_MS` (default 11000) are dropped. The rest are scored on intent (role, colour, shape asked for), difficulty, richness and margin. The best one goes through `evo:trial`, and the HUD shows it.
- It goes live through `publish-rule!` on the next new chunk, never mid-chunk. Two bumps on its first chunks, or the browser failing to draw it, roll it back.
- The view draws it inside the hit box of its role, so it grows in without changing fairness.

`node scripts/check-thing-e2e.mjs` runs this against a mock model. `THING_LIVE=1` with a configured provider runs ten Chinese wishes instead, and `THING_LONG_S=150` adds a long run.

## Layout

- `core/main.aura` — TCP newline-JSON server, simulation, proposals
- `lib/phys.aura` — fixed-step lanes, jump, slide (twin: `web/sim.mjs`)
- `lib/gen.aura` — seeded chunks and the constraint gate
- `lib/review.aura` — ergonomic notes for a stretch
- `scripts/play-review.aura` — plays the seeded stretches and prints those notes
- `lib/scene.aura` — garden phrase
- `lib/pals.aura` — companions and the runner's look
- `lib/thing.aura` — the wished object: spec checker, fairness and scoring
- `web/` — WebGL2 view
- `bridge/server.mjs` — static files and the WebSocket bridge
- `./run.sh` — one command

## Tests

```bash
source scripts/aura-path.sh
export PATH="$(dirname "$(install_aura "$PWD")"):$PATH"   # or skip this if aura nightly is already on PATH
AURA_SANDBOX=off aura test
node scripts/check-sim.mjs
node scripts/check-lanes.mjs
node scripts/smoke.mjs
node scripts/mock-llm-e2e.mjs
node scripts/check-probe.mjs
node scripts/check-thing-e2e.mjs
bash scripts/check-install.sh
```

`check-sim` follows the physics golden. A wide gap and a gate you fail to slide are stumbles, so `wide-alive` and `stand-alive` are `1`. The fairness gate is unchanged: its autopilot still dies on that geometry, so the phrase is not kept.

GitHub Actions runs the Aura job on `ghcr.io/cybrid-systems/aura:nightly`. The smoke job installs the same nightly release the play script uses.
