# Lumen Run

A kid-friendly 3D runner whose worlds, runner, and phrases are evolved live by [Aura](https://github.com/cybrid-systems/aura).

![Lumen Run demo poster: Garden, Beijing, Space, and Aurora Ice](docs/media/lumen-run-demo.jpg)

Hero on autopilot, voice switches worlds, each new world is an Aura Biome EDSL form gated by `evo:trial` KEEP/ROLLBACK, rebound live with no restart.

## Quick start

Linux x86_64 or arm64, Node.js 22, `bash`, `curl`, and `python3`. No C compiler, CMake, or Docker.

```bash
./run.sh
```

The first run downloads the [Aura nightly](https://github.com/cybrid-systems/aura/releases/tag/nightly) (sha256-checked, cached in `~/.cache/lumen-run`) and prints the version, where it came from (`download`, `cache`, or `offline`), and the URL. Open that URL. The page retries until the core is listening. Ctrl-C stops both. If 8080 or 8765 is taken, `./run.sh` prints the next free port. `AURA_RUNNER_WEB` and `AURA_RUNNER_PORT` pin one.

`AURA_BIN=/path/to/aura` uses a binary you already have. `AURA_VERSION=v0.2.7` pins a release instead of `nightly`. `AURA_OFFLINE=1` uses the cache and does not touch the network. The nightly release publishes Linux x86_64 and arm64. On a Mac, install [OrbStack](https://orbstack.dev) or Docker Desktop and run `./run.sh` again: it uses the prebuilt image `ghcr.io/cybrid-systems/aura:nightly` and does not compile. To play without installing Node, use [Run it with Docker](#run-it-with-docker-easiest).

## Run it with Docker (easiest)

On a Mac this is the short path. Docker Desktop and OrbStack both run the linux/arm64 image on Apple Silicon. You do not need Node or a compiler.

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [OrbStack](https://orbstack.dev) and open it.
2. Get this folder: `git clone https://github.com/cybrid-systems/aura-runner.git` and `cd aura-runner`, or download the ZIP from GitHub and unzip it.
3. Run `./play.sh`. Paste a DeepSeek API key, or press Enter to play with AI features off. The key is not shown. It is saved in `.env` (mode 0600, and git ignores it). The next question is an optional folder of your own songs. `./play.sh --setup` asks both again.
4. When the game is ready, it opens in the browser. The script prints the URL and a `docker run` command. If port 8080 is taken, it picks another one.

The image is `ghcr.io/cybrid-systems/aura-runner`. If that download is not available yet, `./play.sh` builds it from the same Aura nightly `./run.sh` downloads, and does not compile Aura. The next start uses that copy and does not build again.

## Settings

`./play.sh --config` prints the settings that are in effect. The API key is shown only as a character count.

Copy [`lumen.toml.example`](lumen.toml.example) to `lumen.toml` in this directory, next to `./run.sh`. Git ignores that copy. Edit it by hand. A value already exported in the terminal wins, then `lumen.toml`, then `.env`, then the built-in default. The key is the exception: the terminal wins, then `.env`, then `lumen.toml`, so `./play.sh --setup` replaces a key left in the config. Keep the key in `.env`.

DeepSeek V4.1 Flash (`deepseek-flash`, `https://api.deepseek.com/v1`) is the preset. For another OpenAI-compatible service, set `base_url` and `model` in `lumen.toml`, or export `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY`.

An old `.env` that still names MiniMax prints one line and keeps going. A saved `LLM_API_KEY` still works. Otherwise the game stays offline.

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
| 去北京 / paris, 下一个城市 / 换城市 / next city | World tour |
| 去火山 / volcano, 糖果 / candy, 珊瑚 / coral | New world |

## Evolution

A world, the runner, or a phrase is proposed while the run stays up. `evo:trial` returns KEEP or ROLLBACK. Only KEEP rebinds, live, with no restart. With no LLM key, a themed recipe takes that same gate. A clear steps the venue with the level (garden, city, space, coast) and the garden scene follows how that level went. A city the child names stays until they ask again. The kept pool is not recombined into a new world on its own, and a world is not dreamed on a clock.

A thing round, and a friend who is already here, each take one small seeded step beside the tick before the same KEEP. When a world is proposed, light, fog, and particle density can move by PSO, and particle kind, surface, and props are ant credits. The friend's motion is chosen from the same motion list, which only moves the picture. The search reads the local check only, one generation at a time, and leaves the physics step alone. One `evo:trial` still decides what is installed.

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

With no `music_dir`, a single recording plays on a loop, and several recordings in that same folder (mp3, ogg, wav, m4a, flac, or mp4) become the playlist. Set `music_dir` in `lumen.toml` (the file next to `./run.sh`, or paste the folder when `./play.sh` asks) to play a different folder. One file loops. Several files use `music_order`: `shuffle` (the default) opens on any of the tracks, and when a track ends it starts a different one; `ordered` keeps the file-name order from the first file. Hold Space and say 下一首, 下一首歌, 换一首, 切歌, or next song to start another track under those same rules. `./play.sh` mounts that folder read-only at `/music` in the container. `./run.sh` reads the same path on this computer. The files stay on your machine: the bridge serves them, and nothing is uploaded or added to git. An empty folder, or one with no supported files, keeps the synthesized tune and prints a short message.

A single file in `LUMEN_MUSIC` still plays when no folder is set. A missing file is HTTP 204, and a play error does the same. The first key, tap, or click starts the sound. Mute and the volume slider sit in the corner.

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

Wished-object calls with no provider selected fill an empty `LLM_BASE_URL` with `https://api.deepseek.com/v1` and an empty `LLM_MODEL` with `deepseek-flash`.

With no `LLM_API_KEY`, `./run.sh` fills those three from `~/code/keys/deepseek` (`DEEPSEEK_KEY_FILE`). The key-file model is `deepseek-flash`. `./run.sh deepseek` selects that preset. `./run.sh minimax` prints one line and then uses DeepSeek or stays offline.

## Picture

Auto starts on Low and moves to Medium or High only after frames stay under budget, then steps back if they miss. Low is the original single pass, with the round contact shadows. Medium and High add a sun shadow, bloom, ACES tonemapping, a scene colour grade, and a light edge pass. The finish puts a little contrast back on quiet frames and dithers by less than one colour step, so sky and fog do not band. The scene buffer is filtered linearly, so bloom does not show the pixel grid. High also keeps that edge pass off the runner, and adds a speed blur that leaves the runner sharp, light shafts, a small ambient occlusion pass, a softer shadow edge, haze toward the horizon, and a brighter trail that grows with speed and combo. A wet city road and an ice road pick up a short reflection. On High the path picks up flagstones, asphalt, ice, sand, planks, lava crust, or cloud, and the lawn and tree tops pick up the same kind of shift. Up close that is a fine continuous grain and a small glint; both drop out by about 7 m and before a mark shrinks to a pixel. A broader tint remains and fades by 20 m. Road slabs share one lighting direction, so a new slab does not start its own highlight, and neighbouring slabs stay within a few percent of each other. Garden petals, city dust, snow, and space dust drift on High only. A near miss nudges the camera and flashes the obstacle that was passed. A world change on High opens as a coloured ring instead of a white wash. On those tiers the camera eases a lane change and kicks the field of view with speed. A kept scene or hero pulses the bloom. A rollback cools the frame. The score stays in the page, so it stays sharp. A browser without WebGL2 draws a flat garden and says so.

The budgets live in [`lib/quality.aura`](lib/quality.aura). The page carries the same numbers, because it does not ask Aura to run them. Quality is not an `evo:trial`. A world, the runner, and a phrase still are. Pick Auto, Low, Medium, or High from the corner control. The browser remembers the choice.

## Layout

```
core/      Aura entry (core/main.aura): simulation, wishes, evo:trial
web/       WebGL2 view. Low is one pass; Medium and High add shadow, bloom, grade, and FXAA
lib/       Biome EDSL, physics, voice, pals, hearts, race
scripts/   Checks, seeded play-review, LLM probe, lumen.toml loader
bridge/    Static page, music folder, and the WebSocket bridge. ./run.sh starts it
docker/    Container entrypoint. ./play.sh starts the image and mounts a music folder
docs/      Demo poster
lumen.toml.example   Commented settings. Copy to lumen.toml.
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
| `node scripts/check-config.mjs` | Settings precedence, masked key, music mount |
| `node scripts/check-musicdir.mjs` | Music folder discovery and local files |
| `node scripts/check-music.mjs` | Tune bounds, KEEP/ROLLBACK, tempo, playlist, missing file |
| `node scripts/check-voice.mjs` | Soft voice stays on 196 Hz |
| `bash scripts/check-install.sh` | Install from an empty cache, offline reuse |
| `bash scripts/check-runsh.sh` | `./run.sh` downloads a prebuilt binary and serves the page |
| `bash scripts/check-play.sh` | `./play.sh` questions, hidden key, gitignored env and config |
| `bash scripts/check-docker.sh` | Image serves the page and the core with no LLM |
| `node scripts/smoke.mjs` | Seeded end-to-end run |
| `node scripts/mock-llm-e2e.mjs` | Mock LLM rebind |
| `node scripts/check-edsl-e2e.mjs` | EDSL gate and voice switch |
| `node scripts/check-setcode.mjs` | Rebind falls back to `set-code` |
| `node scripts/check-play.mjs` | Long run with a hung model call |
