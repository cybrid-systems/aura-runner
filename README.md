# Lumen Run

A 3D parkour runner for children. The game core is [Aura](https://github.com/cybrid-systems/aura) **main** `e7d85162c7cafcdac779e27c453c63d44b03a91d` (includes `b4e0ce31`). The browser is a WebGL2 view: a third-person camera sits behind a small light-keeper, and the course is three lanes through a garden that can change colour while you run.

The opening shows one hint card: up jumps, down slides, left and right change lane. Left, A, a left swipe and a left stick all move the runner toward the left of the screen. The same edges work on a gamepad (A jump, B or down slide, d-pad lanes). The first stretch is a straight garden path, and a death is one tap to run the same seed again. The hint card goes away after the first input.

## Play

```bash
./run.sh
```

That pulls `ghcr.io/cybrid-systems/aura:e7d85162c` if you do not already have that commit (it does not build LLVM), starts the core, and serves the page at <http://127.0.0.1:8080>. Progress is printed on stderr. The only line on stdout is the executable path, from the installer; `./run.sh` itself prints the URL on stderr. The rolling GitHub `nightly` release is not used: that asset moves on every main push, and an older copy of it had stopped on 2026-11-04. The image tag is the dist workflow's per-commit image. On 2026-11-13 its revision and the nightly tarball's `BUILD-INFO` both read `e7d85162c7cafcdac779e27c453c63d44b03a91d`.

The world code on the badge (`LUMEN-42`) is the seed. Open `http://127.0.0.1:8080/?seed=42` to share the same course. Tap the badge for the last few garden notes. Add `?stats=1` for frame-time numbers, `?bench=1` to drop a JSON summary into the page after 180 frames.

An OpenAI-compatible model is optional. `LLM_API_KEY` is required for that path. Without it the offline generator in Aura builds every chunk, and the garden still tries one new phrase on its own.

```bash
export LLM_API_KEY=...                           # required for a model; omit for offline generation
export LLM_BASE_URL=https://api.minimaxi.com/v1  # MiniMax in China. https://api.minimax.io returns 401 for a China key
export LLM_MODEL=MiniMax-M3.1-Flash
# optional. Aura main (b4e0ce31 and later) defaults the HTTP budget to 120 seconds.
# export LLM_TIMEOUT=120
# export AURA_HTTP_TIMEOUT=120
./run.sh
```

This pin is past the v0.2.2 `http-post` bugs ([cybrid-systems/aura#5267](https://github.com/cybrid-systems/aura/issues/5267), [#5268](https://github.com/cybrid-systems/aura/issues/5268)): a 200 response has a body, and the HTTP budget defaults to 120 seconds (`LLM_TIMEOUT` or `AURA_HTTP_TIMEOUT` overrides it). `llm:chat` is called as `(llm:chat sys user extra)` with `reasoning_effort` `minimal` and `max_tokens` 2048. If that arity is refused, the game keeps the two-argument call. A new page clears the in-flight flag, so the next run can ask again.

The model is asked for an obstacle phrase and, a few seconds later, a garden phrase. Aura checks each one before it can appear. A rejected phrase is rolled back and the run continues. The call runs on a fiber, so the run does not wait for it. The first ask is a couple of seconds in, then about every 12–16 seconds, so a short run shows a change.

Hitting a hurdle, a gate, a pot or a gap does not end the run. The keeper flashes for about 1.5 seconds, slows down, loses a few points, and a line says "Oops! Keep going" (a gap says "Back on the path" and sets them down on the ground ahead). There is no "The light rested" card. Old chunks behind the runner are dropped so a long run does not keep the whole trail.

A long run on this Aura commit can still hit [cybrid-systems/aura#5274](https://github.com/cybrid-systems/aura/issues/5274) (`hash-set!` refused with `mutation-hold-budget`, and the process exits). The tick path no longer mutates a hash to add `event`; that field is in the hash when it is built. Other `hash-set!` calls are wrapped, and they are skipped while a trial is open or when the write is refused. The runtime fix is `7c0f3f59` and was not in a published image when this pin was chosen. If a refusal is still fatal inside Aura rather than a catchable error, this guard cannot stop that exit.

## What you feel

The browser predicts the runner from the latest rule snapshot, so a slow server tick never changes how a jump feels. Aura remains the authority for the course, the score and a death.

| What you see | Aura feature | Where |
| --- | --- | --- |
| The garden gets a little faster, lighter, and longer to slide as you clear chunks, and eases off if you do not. A short line names it ("A little faster", "A gentler pace"). The trail, the sun and the jump follow the new numbers on the next snapshot | `(mutate :rebind)` on the live defines in `core/hot.aura`, installed once with `set-code` | `lib/live.aura`, `apply-feel!` in `core/main.aura` |
| A phrase that is too wide drifts away, then a fair one blooms into the course a moment later. The toast says which | `evo:trial` and `evo:commit!`. The autopilot is sliced across ticks so the check does not stall the run; geometry that already fails does not run it | `maybe-dream!`, `consider-form!`, `lib/gen.aura` |
| The sky, the grass, the flowers and the light ease into a new garden. The toast names it ("The sky turned rosy", "Tulips opened up") | the same trial and rebind, on `scene-form`. Out of range, too dark, or not a known flower rolls back | `consider-scene!`, `lib/scene.aura`, `web/render.mjs` |
| A bump or a drop does not end the run. The keeper blinks, slows, and keeps the distance | the playing step stumbles; the fairness autopilot still uses strict rules, so an unfair phrase is not kept | `lib/phys.aura`, `web/sim.mjs` |
| The check is executable: jump reach, gate height, a lane left open beside a pot, and an autopilot that has to finish the chunk | pure step in `lib/phys.aura` | `constraint-hash`, `autopilot-slice` |
| Later chunks open one notch at a time, and only after the current notch is being cleared. A fall does not unlock a crueller arm | `std/evo` UCB (`evo:policy`, `evo:policy-select`, `evo:policy-report`) plus `evo:record!` | `choose-band`, `open-next-arm!` |
| The same seed is the same course. The badge is the share code | `std/random` seeded from the share code | `pattern-chunk` |
| The model call does not pause the run. The seeded generator has already filled the track | `fiber:spawn` and channels | `start-llm!`, `poll-llm!` |
| Why a phrase was kept or rejected | the decision list (tap the world badge) and `AURA_EVO_LOG` | `note!` |

On Aura v0.2.2 the four v0.2.0 workarounds were measured again and removed:

- After `evo:trial`, `(mutate :rebind)` on the parent returns `#t` and the define updates (`tests/trial_test.aura` prints `rebind-after 1`; a probe set gravity to 28.0). #5162 is fixed. A kept phrase is published with `(mutate :rebind)`, not `set-code`. `set-code` remains only if a rebind refuses.
- Inside a trial, `vector-set!` and `hash-set!` succeed. #5163 is fixed. Physics still returns new lists so a step stays a pure value the browser twin can match; that is no longer required by the sandbox.
- `channel:try-recv` on an empty channel is `#f`. #5161 is fixed. A model reply is still taken only when it is a hash.
- `json-encode` of a vector is a JSON array (`[1,2.5]`, and `{"pieces":[[1,2]]}`). #5160 is fixed. Pieces stay lists because that is the physics value; lists encode as arrays too.

No new Aura issue was filed.

## Layout

- `core/main.aura` — TCP newline-JSON server, simulation, proposals
- `lib/phys.aura` — fixed-step lanes, jump, slide (twin: `web/sim.mjs`)
- `lib/gen.aura` — seeded chunks and the constraint gate
- `lib/scene.aura` — garden phrase, ranges, and the child-facing cue
- `web/` — WebGL2 third-person view
- `bridge/server.mjs` — static files and the WebSocket bridge
- `./run.sh` — one command

## Tests

```bash
aura test                 # core, needs the pinned Aura
node scripts/check-sim.mjs
node scripts/smoke.mjs    # seeded run, then a WebSocket hello
node scripts/mock-llm-e2e.mjs
node scripts/check-lanes.mjs
bash scripts/check-install.sh
```

`check-sim` follows the physics golden. A wide gap and a gate you fail to slide used to be fatal (`wide-alive 0`, `stand-alive 0`). They are stumbles now, so those lines are `1`, and the golden also records a hurdle bump and a pit rescue. The fairness gate is unchanged: its autopilot still dies on that geometry, so the phrase is not kept.

GitHub Actions runs the Aura job on `ghcr.io/cybrid-systems/aura:e7d85162c` and the smoke job from that same image.

On this VM (Linux x86_64, Chrome 157 headless, SwiftShader WebGL2, 1280×720 window) a warmed seeded run holds the same frame envelope as the previous scenery pass: **p50 16.7 ms, p95 33.4 ms**. Some frames still miss one vsync under software GL. The arm64 binary was checked for layout and not executed. A real GPU, a phone, a gamepad and a live model call were not tested.
