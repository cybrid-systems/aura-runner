# Lumen Run

A 3D parkour runner for children. The game core is [Aura](https://github.com/cybrid-systems/aura) **v0.2.2** (`35d262bb62426774f0b5d4c181106275512d8ffd`). The browser is a WebGL2 view: a third-person camera sits behind a small light-keeper, and the course is three lanes through a golden-hour garden.

The opening shows one hint card: up jumps, down slides, left and right change lane. Left, A, a left swipe and a left stick all move the runner toward the left of the screen. The same edges work on a gamepad (A jump, B or down slide, d-pad lanes). The first stretch is a straight garden path, and a death is one tap to run the same seed again. The hint card goes away after the first input.

## Play

```bash
./run.sh
```

That downloads the official Aura v0.2.2 release if you do not already have it (it does not build LLVM), starts the core, and serves the page at <http://127.0.0.1:8080>. Checksums are printed on stderr. The only line on stdout is the executable path, from the installer; `./run.sh` itself prints the URL on stderr.

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

On Aura v0.2.2, `http-post` has a hard 30 second cap and returns void for a 200 response ([cybrid-systems/aura#5267](https://github.com/cybrid-systems/aura/issues/5267), [#5268](https://github.com/cybrid-systems/aura/issues/5268)). That is fixed on Aura main and is not in the v0.2.2 release. `llm:chat` on v0.2.2 takes only the system and user strings. A newer runtime also accepts an extra hash; this game then sends `reasoning_effort` `minimal` and `max_tokens` 2048, and otherwise keeps the two-argument call. A restart clears the in-flight flag, so the next run can ask again.

The model is asked for one s-expression. Aura checks it before it can appear. A rejected phrase is rolled back and the seeded course continues. The call runs on a fiber, so the run does not wait for it.

## What you feel

The browser predicts the runner from the latest rule snapshot, so a slow server tick never changes how a jump feels. Aura remains the authority for the course, the score and a death.

| What you see | Aura feature | Where |
| --- | --- | --- |
| The garden gets a little faster, lighter, and longer to slide as you clear chunks, and eases off if you do not. A short line names it ("A little faster", "A gentler pace"). The trail, the sun and the jump follow the new numbers on the next snapshot | `(mutate :rebind)` on the live defines in `core/hot.aura`, installed once with `set-code` | `lib/live.aura`, `apply-feel!` in `core/main.aura` |
| A phrase that is too wide drifts away, then a fair one blooms into the course a moment later. The toast says which | `evo:trial` and `evo:commit!`. The autopilot is sliced across ticks so the check does not stall the run; geometry that already fails does not run it | `maybe-dream!`, `consider-form!`, `lib/gen.aura` |
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
- `web/` — WebGL2 third-person view
- `bridge/server.mjs` — static files and the WebSocket bridge
- `./run.sh` — one command

## Tests

```bash
aura test                 # core, needs Aura v0.2.2
node scripts/check-sim.mjs
node scripts/smoke.mjs    # seeded run, then a WebSocket hello
node scripts/check-lanes.mjs
bash scripts/check-install.sh
```

GitHub Actions runs the Aura job on `ghcr.io/cybrid-systems/aura:0.2.2` and the smoke job from the official `aura-0.2.2-linux-<arch>.tar.gz`.

On this VM (Linux x86_64, Chrome 157 headless, SwiftShader WebGL2, 1280×720 window) a warmed seeded run holds the same frame envelope as the previous scenery pass: **p50 16.7 ms, p95 33.4 ms**. Some frames still miss one vsync under software GL. The arm64 binary was checked for layout and not executed. A real GPU, a phone, a gamepad and a live model call were not tested.
