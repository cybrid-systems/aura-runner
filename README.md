# Lumen Run

Lumen Run (`aura-runner`) is a 3D endless runner powered by an [Aura](https://github.com/cybrid-systems/aura) core (nightly) and a single-pass WebGL2 frontend. Levels, biomes (the Biome EDSL), the hero and pals, the AI rival, and difficulty evolve live under Aura `evo:trial` safety gates.

## Quick start

Linux x86_64 or arm64, Node.js (CI uses 22), `bash`, `curl`, and `python3`. The first `./run.sh` downloads the Aura nightly into `.tools`. Later runs reuse that copy.

```bash
./run.sh
```

Open <http://127.0.0.1:8080>. Ctrl-C stops the core and the page. If 8080 or 8765 is taken, `./run.sh` prints the next free port and uses it. Set `AURA_RUNNER_WEB` or `AURA_RUNNER_PORT` to pin one.

An Aura nightly already on `PATH`:

```bash
AURA_BIN="$(command -v aura)" ./run.sh
```

## Controls

| Key | Action |
| --- | --- |
| W / ↑, or a tap | Jump |
| A / ← | Lane toward screen-left |
| S / ↓ | Slide |
| D / → | Lane right |
| Hold Space, then release | Speak a command |
| R, or Restart | Start this run over |
| Space or Enter | Start over after the run settles (0 hearts) |

A gamepad uses A to jump, B or down to slide, and the d-pad or stick for lanes. A left swipe matches A.

## Voice commands

Hold Space, speak, and release. The page sends the words. Built-in lines apply at once, and the combo stays. A custom world uses its themed recipe immediately when no LLM key is set.

| Say | What changes |
| --- | --- |
| 花园 / garden, 城市 / city, 太空 / space, 海边 / coast | Built-in venue |
| 换场景 / next scene | Next venue |
| 夜晚 / night, 白天 / day, 日落 / sunset, 霓虹 / neon | Lighting mood |
| 变成狐狸 / become a fox | Hero look (also kitten, bird, bunny, bee, keeper, and the other pal kinds) |
| 去火山 / volcano, ice palace / 冰宫, 糖果 / candy, 珊瑚 / coral | Custom Biome EDSL world |
| 去北京 / paris, 下一个城市 / next city | World-tour city |

## How the game plays

- A level gate advances the venue without stopping the run. The combo stays. The multiplier starts at ×1, steps up when that level's three coins land and again at the gate (up to ×8), and returns to ×1 when the run starts over.
- The run starts with three hearts. A ready shield takes one solid hit, then waits 9 seconds. A gap puts the runner back on the path and leaves the heart and the shield in place. At zero hearts the run settles: score, level, best multiplier, and you versus the rival. Play Again, Space, or Enter starts clean.
- A live line shows `1st` or `2nd` and the gap in metres against the AI rival (fox, bird, or beetle). Whoever reaches the gate first is counted, and the rival trains or eases from that. The opening lesson has no rival.
- Biomes are Biome EDSL specs (`lib/edsl.aura`). A custom world is kept only after `evo:trial` accepts its colours and prop budget. With an LLM key the ask runs in the background. With no key, a themed recipe takes the same gate, and later levels recombine that pool offline. Hero, pals, and difficulty use the same trial.

## Optional LLM

These are the `LLM_*` variables the repo reads. With none set, the offline generator still builds the run.

| Variable | Role |
| --- | --- |
| `LLM_API_KEY` | API key. When it is already set, `./run.sh` leaves it in place |
| `LLM_BASE_URL` | OpenAI-compatible base URL |
| `LLM_MODEL` | Model id |
| `LLM_TIMEOUT` | HTTP timeout in seconds (default 120). When unset, the core reads `AURA_HTTP_TIMEOUT` |

Wished-object calls with no provider selected fill an empty `LLM_BASE_URL` with `https://api.deepseek.com/v1` and an empty `LLM_MODEL` with `deepseek-chat`.

```bash
export LLM_API_KEY=sk-... LLM_BASE_URL=https://api.deepseek.com/v1 LLM_MODEL=deepseek-flash
./run.sh
```

With no `LLM_API_KEY`, `./run.sh` fills those three from `~/code/keys/deepseek` (`DEEPSEEK_KEY_FILE`) or `~/code/keys/minimax` (`MINIMAX_KEY_FILE`). `./run.sh minimax` prefers MiniMax when that key is usable. The key-file defaults are DeepSeek `deepseek-flash` at `https://api.deepseek.com/v1` and MiniMax `MiniMax-M3.1-Flash` at `https://api.minimaxi.com/v1`.

## Layout

```
core/      Aura entry (core/main.aura): simulation, wishes, evo:trial
web/       Single-pass WebGL2 view
lib/       Biome EDSL, physics, voice, pals, hearts, race
scripts/   Checks, seeded play-review, LLM probe
bridge/    Static page and the WebSocket bridge. ./run.sh starts it
```

## Checks

Aura commands need `AURA_SANDBOX=off` and a nightly binary on `PATH`. CI runs that job on `ghcr.io/cybrid-systems/aura:nightly`.

| Command | Checks |
| --- | --- |
| `aura test` | Core tests |
| `aura --quiet --preset dev scripts/play-review.aura` | Seeded stretch notes |
| `node scripts/check-sim.mjs` | Physics golden |
| `node scripts/check-lanes.mjs` | Screen-left lanes |
| `node scripts/check-contrast.mjs` | Obstacle contrast |
| `node scripts/check-edsl.mjs` | Biome EDSL view |
| `node scripts/check-run.mjs` | Multiplier, venues, voice |
| `node scripts/check-probe.mjs` | Startup model probe |
| `bash scripts/check-install.sh` | Install from an empty tools dir |
| `node scripts/smoke.mjs` | Seeded end-to-end run |
| `node scripts/mock-llm-e2e.mjs` | Mock LLM rebind |
| `node scripts/check-edsl-e2e.mjs` | EDSL gate and voice switch |
| `node scripts/check-setcode.mjs` | Rebind falls back to `set-code` |
| `node scripts/check-play.mjs` | Long run with a hung model call |

Also local: `node scripts/check-voice.mjs`, `node scripts/check-world.mjs`, `node scripts/check-thing-e2e.mjs`.
