# Lumen Run

A kid-friendly 3D runner whose worlds, runner, and phrases are evolved live by [Aura](https://github.com/cybrid-systems/aura).

[![Lumen Run demo poster: Garden, Beijing, Space, and Aurora Ice](docs/media/lumen-run-demo.jpg)](docs/media/lumen-run-demo.mp4)

Hero on autopilot, voice switches worlds, each new world is an Aura Biome EDSL form gated by `evo:trial` KEEP/ROLLBACK, rebound live with no restart.

## Quick start

Linux x86_64 or arm64, Node.js 22, `bash`, `curl`, and `python3`. No C compiler, CMake, or Docker.

```bash
./run.sh
```

The first run downloads the [Aura nightly](https://github.com/cybrid-systems/aura/releases/tag/nightly) (sha256-checked, cached in `~/.cache/lumen-run`) and prints the version, where it came from (`download`, `cache`, or `offline`), and the URL. Open that URL. The page retries until the core is listening. Ctrl-C stops both. If 8080 or 8765 is taken, `./run.sh` prints the next free port. `AURA_RUNNER_WEB` and `AURA_RUNNER_PORT` pin one.

`AURA_BIN=/path/to/aura` uses a binary you already have. `AURA_VERSION=v0.2.7` pins a release instead of `nightly`. `AURA_OFFLINE=1` uses the cache and does not touch the network. The nightly release publishes Linux x86_64 and arm64. On a Mac, install [OrbStack](https://orbstack.dev) or Docker Desktop and run `./run.sh` again: it uses the prebuilt image `ghcr.io/cybrid-systems/aura:nightly` and does not compile.

## Controls

| Key | Action |
| --- | --- |
| W / ↑, or a tap | Jump |
| A / ← | Lane toward screen-left |
| S / ↓ | Slide |
| D / → | Lane right |
| Hold Space, then release | Speak |
| R, or Restart | Start this run over |
| Space or Enter | Start over after the run settles (0 hearts) |

A gamepad uses A to jump, B or down to slide, and the d-pad or stick for lanes. A left swipe matches A.

## Voice

Hold Space, speak, and release. Built-in lines apply at once and the combo stays. A custom world uses its themed recipe immediately when no LLM key is set.

| Say | What changes |
| --- | --- |
| 花园 / garden, 城市 / city, 太空 / space, 海边 / coast | Venue |
| 夜晚 / night, 白天 / day, 日落 / sunset, 霓虹 / neon | Mood |
| 去北京 / paris, 下一个城市 / next city | World tour |
| 去火山 / volcano, 糖果 / candy, 珊瑚 / coral | New world |

## Evolution

A world, the runner, or a phrase is proposed while the run stays up. `evo:trial` returns KEEP or ROLLBACK. Only KEEP rebinds, live, with no restart. With no LLM key, a themed recipe takes that same gate, and later levels recombine the kept pool offline.

The form in [`lib/edsl.aura`](lib/edsl.aura):

```
(biome ID
  (label WORD)
  (sky ZR ZG ZB HR HG HB)
  (fog FR FG FB AMT)
  (body sun|moon|stars|aurora|none)
  (road R G B) (curb R G B) (ground R G B)
  (surface grass|stone|dust|sand|ice|cloud|lava|reef|plank)
  (light L) (mood M)
  (particles fireflies|stardust|snow|embers|rain|sparkles|none DENSITY)
  (props (KIND DENSITY SCALE) ...)
  (recipe garden|city|space|coast|mix))
```

KIND is tree, tower, arch, crystal, rock, coral, or ring.
A proposal is kept only after evo:trial (edsl-gate).

## Music

The page plays Symphony No. 29 when `LUMEN_MUSIC` points at the recording. A missing file is HTTP 204, and a play error does the same: the page starts a synthesized tune. No audio file is added to the repo. The first key, tap, or click starts the sound. Mute and the volume slider sit in the corner.

The tune is a `(tune ...)` form in [`lib/music.aura`](lib/music.aura). `evo:trial` keeps a fair phrase and rolls a harsh one back. A kept phrase starts on the next bar. A rollback before that bar stays on the current phrase; after the bar, the previous phrase returns on the next one. Speed and level raise the tempo and add a layer. A combo or a near miss plays a fill. A hit ducks the filter, a shield plays a short brighter note, and a level-up lifts the key. Everything lands on the beat.

After a click or a key, the console can fire each of those:

| Call | What you hear |
| --- | --- |
| `__musicState()` | Phrase, tempo, bed (`synth` or `file`), and whether a swap is waiting |
| `__musicEvent("combo")` or `"near"` | A drum fill on the next eighth |
| `__musicEvent("hit")` | Filter duck and a short pitch dip, then the phrase returns |
| `__musicEvent("shield")` | A brighter stinger, then the phrase returns |
| `__musicEvent("level")` | A stinger now, and a key lift on the next bar |
| `__musicTrial(form)` | The same bounds as the gate. A fair form waits for the next bar |
| `__musicRollback()` | Drops a phrase that has not started, or queues the previous one |

`document.documentElement.dataset` mirrors the bed, phrase, key, bpm, layers, and pending swap.

## LLM

With no key, the offline generator still builds the run. These are the `LLM_*` variables the repo reads.

| Variable | Role |
| --- | --- |
| `LLM_API_KEY` | API key. When it is already set, `./run.sh` leaves it in place |
| `LLM_BASE_URL` | OpenAI-compatible base URL |
| `LLM_MODEL` | Model id |
| `LLM_TIMEOUT` | HTTP timeout in seconds (default 120). When unset, the core reads `AURA_HTTP_TIMEOUT` |

Wished-object calls with no provider selected fill an empty `LLM_BASE_URL` with `https://api.deepseek.com/v1` and an empty `LLM_MODEL` with `deepseek-chat`.

With no `LLM_API_KEY`, `./run.sh` fills those three from `~/code/keys/deepseek` (`DEEPSEEK_KEY_FILE`) or `~/code/keys/minimax` (`MINIMAX_KEY_FILE`). `./run.sh minimax` prefers MiniMax when that key is usable. The key-file defaults are DeepSeek `deepseek-flash` and MiniMax `MiniMax-M3.1-Flash`.

## Picture

Auto starts on Low and moves to Medium or High only after frames stay under budget, then steps back if they miss. Low is the original single pass, with the round contact shadows. Medium and High add a sun shadow, bloom, ACES tonemapping, a scene colour grade, and FXAA. High also adds a speed blur that leaves the runner sharp, light shafts, a small ambient occlusion pass, a softer shadow edge, haze toward the horizon, and a brighter trail that grows with speed and combo. A wet city road and an ice road pick up a short reflection. Garden petals, city dust, snow, and space dust drift on High only. A near miss nudges the camera and flashes the obstacle that was passed. A world change on High opens as a coloured ring instead of a white wash. On those tiers the camera eases a lane change and kicks the field of view with speed. A kept scene or hero pulses the bloom. A rollback cools the frame. The score stays in the page, so it stays sharp. A browser without WebGL2 draws a flat garden and says so.

The budgets live in [`lib/quality.aura`](lib/quality.aura). The page carries the same numbers, because it does not ask Aura to run them. Quality is not an `evo:trial`. A world, the runner, and a phrase still are. Pick Auto, Low, Medium, or High from the corner control. The browser remembers the choice.

## Layout

```
core/      Aura entry (core/main.aura): simulation, wishes, evo:trial
web/       WebGL2 view. Low is one pass; Medium and High add shadow, bloom, grade, and FXAA
lib/       Biome EDSL, physics, voice, pals, hearts, race
scripts/   Checks, seeded play-review, LLM probe
bridge/    Static page and the WebSocket bridge. ./run.sh starts it
docs/      Demo poster and video
```

## Checks

`./run.sh` downloads a prebuilt binary and does not compile. `aura test` needs `AURA_SANDBOX=off` and a nightly binary on `PATH`; that CI job uses `ghcr.io/cybrid-systems/aura:nightly` ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). The smoke job installs the same release on a runner without build tools.

| Command | Checks |
| --- | --- |
| `aura test` | Core tests |
| `aura --quiet --preset dev scripts/play-review.aura` | Seeded stretch notes |
| `node scripts/check-sim.mjs` | Physics golden |
| `node scripts/check-lanes.mjs` | Screen-left lanes |
| `node scripts/check-contrast.mjs` | Obstacle contrast |
| `node scripts/check-quality.mjs` | Quality tiers, fallbacks, sim step |
| `node scripts/check-edsl.mjs` | Biome EDSL view |
| `node scripts/check-run.mjs` | Multiplier, venues, voice |
| `node scripts/check-probe.mjs` | Startup model probe |
| `node scripts/check-music.mjs` | Tune bounds, KEEP/ROLLBACK, tempo, missing file |
| `node scripts/check-voice.mjs` | Soft voice stays on 196 Hz |
| `bash scripts/check-install.sh` | Install from an empty cache, offline reuse |
| `bash scripts/check-runsh.sh` | `./run.sh` downloads a prebuilt binary and serves the page |
| `node scripts/smoke.mjs` | Seeded end-to-end run |
| `node scripts/mock-llm-e2e.mjs` | Mock LLM rebind |
| `node scripts/check-edsl-e2e.mjs` | EDSL gate and voice switch |
| `node scripts/check-setcode.mjs` | Rebind falls back to `set-code` |
| `node scripts/check-play.mjs` | Long run with a hung model call |
