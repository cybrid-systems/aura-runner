# perf harness

Two aura-perf targets for this repository: the physics the server tick
runs, and the autopilot the fairness gate runs.

    aura-perf autotune perf/spec.aura            ; the physics
    aura-perf autotune perf/spec-autopilot.aura  ; the fairness gate

The target program is `lib/phys.aura`. The runtime set-codes the seed
(`lib/phys.aura` + `perf/workload.aura`), so the defines a candidate
rebinds - `nudge-flyers`, `step-poppers`, `collide-far?`, `pset` - live in
the module the runtime mutates.

| file | what it is |
|---|---|
| `workload.aura` | the seeded course, the kernel, the strategy and the worldline measurement; appended to the seed |
| `spec.aura` | the aura-perf spec: regions, inputs, oracle, catalog, intend, genes |
| `golden.txt` | the expected digest of a run; the oracle reads it |
| `make-golden.aura` | writes `golden.txt`; run it after `lib/phys.aura` changes |
| `candidates/` | the genomes the runtime trials |

The checksum is a digest of the run: the runner's state and the event of
every fifth frame. It comes from `golden.txt`, which the harness wrote
with the code under test, so the oracle does not follow a mutation. A
candidate that changes the physics by one float is rejected.

Three float literals of `lib/phys.aura` are written as their exact
quotients in the seed (`0.0001` -> `(/ 1.0 10000.0)` and two more).
The Aura runtime unparses a float whose shortest spelling is scientific
(`0.0001` -> `1e-04`) as `1e-04.0`, which is not a number, and the
mutation path re-parses that text. See
<https://github.com/cybrid-systems/aura/issues/5295>. Each replacement
is the same double, bit for bit.

## The profile

On aarch64 (no perf binary, so the region timer), one course of 60
pieces and 600 frames:

```
hotspot bench-kernel  self-ms=636 calls=1     share=47 stack=bench-kernel
hotspot collide       self-ms=373 calls=600   share=27 stack=bench-kernel>collide
hotspot step-poppers  self-ms=94  calls=600   share=6  stack=bench-kernel>step-poppers
hotspot nudge-flyers  self-ms=91  calls=600   share=6  stack=bench-kernel>nudge-flyers
hotspot over-gap?     self-ms=73  calls=600   share=5  stack=bench-kernel>over-gap?
hotspot pxs           self-ms=45  calls=18000 share=3  stack=bench-kernel>pxs
hotspot pset          self-ms=41  calls=7800  share=3  stack=bench-kernel>pset
```

`collide` is still the hot leaf. `step-poppers` and `nudge-flyers` are
next: both rebuild the whole piece list every frame, even when the
stretch has no popper and no flyer in it.

## The candidates

- `nudge-flyers-noop`: the piece list comes back unchanged when nothing
  moved, so a stretch without a flyer does not rebuild it. **Landed** in
  `lib/phys.aura` (gated round on nightly `e174386808`, intend-met=1,
  held-out 2036 ms against its own null's 3090 ms; see below).
- `step-poppers-noop`: the same for the poppers.
- `collide-slack`: the metre of slack around the body is more than the
  geometry needs. **Evaluated, NOT landed** — safe but no live gain (see
  below).
- `wrong-scale`: the score is doubled on the way in; the checksum has to
  reject it.

## The run on the float-pool-fixed nightly (`e174386808`)

The runtime leak that made a long run stutter is fixed upstream
(`f92517b79`, "reclaim: recycle the boxed-float pool"): the same 40M-op
general-TW float loop now holds RSS flat (was 144MB->461MB linear). What
remains is the steady tree-walker cost, so the gated round re-runs on the
fixed nightly with the bus on (`AURA_PERF_BUS_WORKSPACE`, aura-harness
attaches during the linger window):

```
verdict intend-met=1 KEEP=2 ROLLBACK=3 speedup-x=1.15 (2349ms->2036ms n=5)
mined class=flat-hot hot-node=collide site=bench-kernel
candidate collide-nocopy    PASS gate-pass heldout-ms=2236 ref-ms=3067 ref-target=collide
candidate nudge-flyers-noop PASS gate-pass heldout-ms=2036 ref-ms=3090 ref-target=nudge-flyers
kernel KEEP id=nudge-flyers-noop
```

Each candidate is judged against the null of the define it rebinds,
measured in the same child process (the rebind tax is on both sides).
`nudge-flyers-noop` is the winner and is now the library's body. The
checksum is byte-identical (it returns the SAME list when no flyer moved),
and check-sim, play-review (11/11), `aura test` (28/28) and check-play
(ten minutes, minAhead 1) are unchanged after landing.

`collide-nocopy` also passes the gate, but the library already carries the
nocopy structure (`4023894`) with per-coin worth (`62cc758`); the candidate
file is an older snapshot (`pickup-worth`), so there is nothing new to land.

### Why the physics is still on the tree-walker

`closure:stats` reads `ir-calls=0` for the whole physics graph. On this
nightly it is NOT `cond`/`and`/`or`/`let*`/`hash-ref`/`string=?` — isolated
probes show all of those IR-compile. The one hot-path form that forces the
walker is a **variadic (dotted-rest) define**, and it poisons its callers:
a clean fixed-arity define that calls a variadic define also falls back
(the variadic callee is not IR-cached, so the call-site resolves to
"unknown"). `lib/phys.aura`'s `piece` is variadic
(`(define (piece k x w h y . rest)`), and every hot define builds or reads
pieces, so `piece` drags the whole graph onto the walker. A fixed-arity
`piece` twin is the next lever; it is a cross-cutting change (27 call
sites) and must pass the same checksum gate, so it is recorded, not landed.

### The harness side of the cycle (bus)

`scripts/perf-harness-cycle.py` is the aura-harness coordinator: it waits
for the round's report, attaches the harness server as role 2
(read|publish) DURING the linger window, reads the committed image
(hypothesis metrics, trial worldlines, shared audit), cross-checks each
worldline's bus state against the gate's verdict, and publishes the
harness's release/reject + held-out evidence (910000/920000/930000 + wl).
It never opens trials and never KEEPs — KEEP stays with perf under the
coordinator's constraint gate.

The perf process must keep stdin OPEN for the window to stay up
(aura-perf#28: "EOF on stdin ends the window"). Run it with a held-open
stdin, e.g. a FIFO whose writer outlives the round:

```sh
mkfifo /tmp/perf-fifo
setsid bash -c 'sleep 900 > /tmp/perf-fifo' </dev/null >/dev/null 2>&1 &
AURA_PATH=~/aura/lib AURA_PERF_BUS_WORKSPACE=5391 AURA_PERF_BUS_LINGER_S=240 \
  aura-perf autotune perf/spec.aura < /tmp/perf-fifo
# then, while it lingers:
AURA_BIN=... AURA_LIB=~/aura/lib python3 scripts/perf-harness-cycle.py --ws 5391
```

Measured (ws=5391): harness attached, hypothesis keys match the report,
both worldline states agree with the gate, 2 release verdicts published,
20 shared audit events read, clean detach. `std/bus` lives in the source
tree's `lib` (`AURA_PATH=~/aura/lib`); the nightly's bundled lib does not
ship it, though the binary has the bus primitives.

### The continuous loop (multi-round)

`scripts/perf-continuous.py` is the outer scheduler: it drives N perf rounds
on a spec, runs the harness coordinator inside each round's linger window,
and runs the runner's own regression suite (`aura test` + `check-sim`) between
rounds as the independent gate. perf's `memory.json` carries the negative
examples across rounds, so each round's candidate set shrinks
(`negative-skip`); the loop stops on a regression failure or when a round
tries nothing new and keeps nothing (search exhausted).

```sh
AURA_BIN=... AURA_LIB=~/aura/lib python3 scripts/perf-continuous.py \
    --spec perf/spec.aura --rounds 3 --ws-base 5400 --linger-s 150
```

Per-round artifacts land in `perf/out/continuous/` (`roundN.perf.txt`,
`roundN.harness.json`, `roundN.auratest.txt`, `roundN.checksim.txt`,
`summary.json`). Roles are unchanged: perf proposes/trials/KEEPS under the
constraint gate, the harness only reads and publishes verdicts, the driver
schedules and gates — it is not a path around the gate. `--fresh-memory`
starts from an empty negative memory (the prior one is saved beside the
summary); `--no-regression` skips the between-round suite.

### collide-slack: safe, but the gate's win does not transfer to the road

After the #5388 IR-cap fix the gated round PASSed `collide-slack` on the
site floor (collide 472 -> 338 ms). Evaluated for landing on the fixed
runtime; **not landed** — it is behavior-preserving but buys nothing on
the live road.

Safety (proven, not just gate-checked): `collide-far?` is a pure skip; the
web twin `web/sim.mjs` has no skip and checks every piece, so it is the
parity ground truth. A collision span can poke past the authored box only
for a narrow gate: `gate-span` floors depth at 0.45 and thick at 0.22, so
the span extends at most 0.11 m past the box (w -> 0); production gates are
width-validated to [0.35, 2.0] (`lib/gen.aura`), where the span sits fully
inside the box. 0.25 m slack therefore clears the worst case with margin.
Differential test of collide output (player + event + pieces) for slack
1.0 vs 0.25 vs no-skip: 3805 checks over every kind incl. gates at w=0.2
and 0.05, plus 2093 adversarial body-edge sweeps across the 0.25 m
boundary at w=0..0.12 — **0 mismatches**.

Gain (where the gate's win comes from, and why it does not transfer):

| workload | slack 1.0 | slack 0.25 | delta |
|---|---|---|---|
| perf course, ground+coin 1 m spacing, fixed px | 46570 ms/30k | 41353 ms/30k | -11% |
| real road (mixed chunks), fixed px=80 | 21472 ms/30k | 21480 ms/30k | ~0 |
| real road, moving player, 3000 steps | 10360 ms | 10298 ms | ~0 (digest equal) |

The perf course is dense overlapping ground (6 m wide, 1 m apart), so the
0.25-1.0 m band around the body holds piece edges the tighter slack skips.
The live road spreads pieces across ~8-30 m chunks; that band is empty
almost everywhere, so the skip decision is the same. The gate measures the
perf course, not the road — a site-floor PASS there is not a live win.
Keeping the metre of slack costs nothing and leaves more geometry margin.

## The run remembers

Every run writes the ideas that failed on the hot leaf into
`perf/out/memory.json`, and the next run reads them back: a candidate
that already failed there is skipped (`negative-skip`) and the budget
goes to something else. Delete `perf/out/memory.json` to start over.

```
memory-loaded 4 path=perf/out/memory.json
negative-skip nudge-flyers-noop class=flat-hot hot-node=collide
negative-skip step-poppers-noop class=flat-hot hot-node=collide
budget-used 0
```

## The run on aura v0.2.5 with the LLVM JIT

The runtime under test is a **release build of the current `main`** with
the LLVM JIT (23.1.6, from the `aura-ci:latest` root) linked in:

```sh
cd ~/aura && git pull
export PATH=$HOME/.local/cmake/bin:$HOME/mamba/envs/aura/bin:$PATH
export CC=$HOME/mamba/envs/aura/bin/aarch64-conda-linux-gnu-gcc
export CXX=$HOME/mamba/envs/aura/bin/aarch64-conda-linux-gnu-c++
export CPLUS_INCLUDE_PATH=$HOME/mamba/envs/aura/include
export LIBRARY_PATH=$HOME/mamba/envs/aura/lib
cmake -S . -B build-jit -G Ninja -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_PREFIX_PATH="$HOME/mamba/envs/aura;$HOME/cache/aura-ci-root/usr;$HOME/cache/aura-ci-root/usr/lib/aarch64-linux-gnu" \
      -DLLVM_DIR=$HOME/cache/aura-ci-root/usr/local/lib/cmake/llvm
cmake --build build-jit --target aura -j 12
```

The JIT matters for the profile: the physics is compiled, so the
per-define times are the compiled ones.

The profile (600 frames of one course):

```
hotspot bench-kernel self-ms=1622 calls=1     share=56
hotspot collide       self-ms=584  calls=600   share=20
hotspot step-poppers  self-ms=177  calls=600   share=6
hotspot nudge-flyers  self-ms=172  calls=600   share=6
hotspot over-gap?     self-ms=130  calls=600   share=4
hotspot pset          self-ms=113  calls=7800  share=3
hotspot pxs           self-ms=48   calls=18000 share=1
```

`collide` is the hot leaf, and it copied the whole piece list every
frame: a cons, a reverse and an append per piece. The candidate
`perf/candidates/collide-nocopy.aura` keeps the list when no coin was
picked up — a bump, a spring and a death change the player and the event,
not the pieces — and rebuilds it once, when a coin was picked up:

```
candidate collide-nocopy PASS reason=gate-pass heldout-ms=1883 ref-ms=3118 ref-target=collide
site collide base-ms=779 cand-ms=397 floor-pct=20
verdict intend-met=1 KEEP=2 ROLLBACK=3 speedup-x=1.17 (2207ms->1883ms n=5)
```

The collide site halves and the whole path is 17% faster. The body was
checked against the old one over every frame of three courses (1800
frames): the same player, the same piece list and the same event every
time. It is now the library's body (`lib/phys.aura`).

## The run on aura v0.2.5

Both targets were re-run on **aura v0.2.5** (tag `v0.2.5`, `21ec25bd`, the release
tarball) with the runtime probe passing (the named-let reentrancy of
cybrid-systems/aura#5116 is fixed there).

| target | report | verdict |
|---|---|---|
| the physics (`perf/spec.aura`) | `perf/out/report-physics-v025.txt` | `intend-met=1 KEEP=2 ROLLBACK=3 speedup-x=1.40` |
| the autopilot (`perf/spec-autopilot.aura`) | `perf/out/report-autopilot-v025.txt` | `intend-met=0 KEEP=2 ROLLBACK=7` |

The numbers move with the machine's load: on a quiet run the same round
measured `speedup-x=1.38` (`nudge-flyers-noop` 1728 ms against its own
null's 2349 ms), on a busy one `1.04`. The verdict line in the saved
report is the one from the run that produced it.

The physics round judges every candidate against the null of the define
it rebinds, and the site floor reads the same define:

```
candidate nudge-flyers-noop PASS reason=gate-pass heldout-ms=1654 ref-ms=2244 ref-target=nudge-flyers site-floor=0
site nudge-flyers base-ms=162 cand-ms=169 floor-pct=20
candidate step-poppers-noop PASS reason=gate-pass heldout-ms=1701 ref-ms=2289 ref-target=step-poppers site-floor=0
site step-poppers base-ms=152 cand-ms=66 floor-pct=20
```

Both candidates are kept on the **program** floor (`site-floor=0`): they
are real wins on the whole path, 27% and 26%. `step-poppers-noop` (the
piece list comes back unchanged when the stretch has no popper in it)
also wins on its own site — `157 ms → 62 ms`.

The reference each candidate is judged against is the null of the define
it rebinds, measured in the same child process right before the
candidate is applied ([aura-perf#25](https://github.com/cybrid-systems/aura-perf/issues/25)):
the two numbers then differ by the candidate and by nothing else.

This target's defines live in the **seed**, so the interleaved
measurement (A B B A) is not available here: a target that measures its
own tree replaces the define with `set!` and puts it back, and
`mutate:rebind` changes the *body* — after three rebinds the program
quietly computes something else
([aura#5318](https://github.com/cybrid-systems/aura/issues/5318)).

The autopilot round keeps nothing: `hazard-window`, `lane-clear-once`
and `gap-window` are all `no-speedup`, and `wrong-scale` is
`no-speedup` too — the autopilot's digest is the runner's position and
lane, so it does **not** cover the score and the checksum cannot see
that candidate. The physics digest does cover it, and there the same
candidate is rejected by the checksum. A checksum only sees what the
target's own digest covers.

From aura-perf `25b6460` on, the reference of a candidate is the null
of the define **that candidate** rebinds, so the report names it:

```
null-candidate heldout-ms 1379 rebound=1 target=pset
null-candidate target=step-poppers heldout-ms=1367 rebound=1
candidate step-poppers-noop ROLLBACK reason=no-speedup heldout-ms=1466 ref-ms=1365 ref-target=step-poppers
```

## A candidate cannot be judged yet

A `mutate:rebind` inside an `evo:trial` loses the variadic parameter
list, so `lib/phys.aura`'s

```scheme
(define (piece k x w h y . rest) ...)
```

breaks the trial: the kernel raises `car: not a pair` and every
candidate fails its checksum. The same rebind outside a trial keeps the
digest equal to the golden, so the candidates themselves are sound. See
<https://github.com/cybrid-systems/aura/issues/5296>.

## The autopilot target

    aura-perf autotune perf/spec-autopilot.aura

The fairness gate's own path: `lib/gen.aura` (the seeded stretches, the
layout and the autopilot) on top of `lib/phys.aura` and `lib/sexp.aura`,
flattened into one module so a candidate can rebind `next-hazard`,
`dodge-flyer` or `over-gap?`.

The checksum is the autopilot's own trace: the runner's position and lane
every tenth frame of every seeded stretch, then the verdict. It is the
play-review output and more, so a candidate that plays a stretch
differently is rejected.

The profile (aarch64, region timer):

```
hotspot autopilot-kernel self-ms=6858 calls=1   share=77
hotspot step             self-ms=872  calls=900 share=9
hotspot autopilot-press  self-ms=336  calls=900 share=3
hotspot collide          self-ms=280  calls=900 share=3
hotspot next-hazard      self-ms=157  calls=900 share=1
hotspot dodge-flyer      self-ms=82   calls=900 share=0
hotspot dodge-block      self-ms=81   calls=900 share=0
hotspot flyer-blocking?  self-ms=72   calls=900 share=0
hotspot block-ahead?     self-ms=67   calls=900 share=0
```

Two things fall out of it. The autopilot's own scans are about 12% of its
time; the rest is the physics step, the same code the server tick runs.
And a single define can only win a few percent of the target, so a gate
with a program-wide floor can never pass it - see
<aura-perf/docs/roadmap.md>.

## The coin-course target (long-run growth)

    AURA_PATH=~/aura-perf:~/.aura/current/lib AURA_SANDBOX=off \
      aura --preset dev perf/spec-coins.aura

The physics and autopilot targets measure STEADY-STATE cost. The reported
symptom — frames stutter after the run has been up a while — is time-dependent,
so this target measures the part that grows: the coin course. The seed is
`lib/coins.aura` on `lib/phys.aura` + `lib/sexp.aura` + `lib/gen.aura`,
flattened (`seed-source-coins.aura`), so `coin-open-level!` lives in the
mutated module. The kernel lays coins across 120 levels; the checksum is the
digest of every coin's `(x, lane, worth)` (`golden-coins.txt`).

`coin-closed` was appended once per level and never trimmed, while
`coin-window-counts` reads only `(coin-last coin-closed 1)` / `(... 2)`. Every
older entry was walked by `coin-len` / `coin-drop-n` on every coin placed but
never summed: O(levels) per coin, unbounded over a long run. The candidate
`coin-window-trim` keeps just the two-level window. It is provably
behavior-preserving (the 180-level placement digest is byte-identical) and
wins its own site 4.3x:

```
null-site coin-window-counts ms=308 calls=1358
candidate coin-window-trim checksum ok=1 heldout-ms=3405
  site coin-window-counts ms=72 calls=1358
  site-floor base=308 cand=72 floor-pct=20 site-ok=1
  PASS reason=gate-pass
candidate coin-wrong-scale checksum ok=0 ROLLBACK reason=checksum
```

The whole 120-level kernel only drops 6.3% (3635->3405ms), below the 20%
program floor, so the candidate is kept on the SITE floor — the per-define
bar aura-perf added for exactly this shape. The fix is now the library's body
(`lib/coins.aura`).

Two seed-only transforms make the target rebindable on this nightly, both
behavior-preserving (the golden is unchanged):
- the three scientific-notation float literals of `lib/phys.aura` are written
  as exact quotients (`#5295`), as in `spec.aura`;
- `coin-open` is `#f` or a list; the post-mutate typechecker reads the `#f`
  init as `Bool` and rejects `car`/`cdr` on it (`expected (? -> ?), got Bool`),
  which blocks EVERY rebind in the seed. The guards are narrowed to
  `(pair? coin-open)` — a list is the only truthy value `coin-open` takes, so
  the running program's values do not change.

### The stutter, attributed

`perf/mine-tick.aura` drives the aura-perf mining core (`perf:collect` +
`perf:mine`) over the tick's own defines on this nightly. The full autotune
loop needs `std/bus` (the `bus-call` kernel primitive), which this nightly
(`9e2b4ecd`) does not ship; the mining core loads without it.

```
mine class=flat-hot hot-node=step site=bench-kernel prefix=(bench-kernel step)
hotspot step    self-ms=2898 share=35   stack=bench-kernel>step
hotspot collide self-ms=1047 share=12   stack=bench-kernel>step>collide
```

The physics runs entirely on the tree-walker (`closure:stats`: ~13M tw-calls,
0 ir-calls per kernel) — `main.aura`'s `set!`/`cond`/`while`/`json-encode`
force the fallback, and the physics defines are reached as TW closures.

The time-dependent part was a runtime leak, not a target define: every float
op on the general TW path boxes a double into the process-global
`g_float_pool` (`aura_alloc_float`), which was append-only and cleared only at
session reset. The TW/IR heap reclaim freed pairs/cells/vectors/strings but
never the float pool. A float loop that defeats the `#5302` raw-double fast
path (list accumulator + `or` test + helper call — the physics shape) leaked
~16MB RSS per 2M ops with the evaluator pair heap flat; over 40M ops RSS
climbed 144MB->461MB linearly. The `#5302` fast path keeps a bare-comparison
float accumulator unboxed and does NOT leak — the physics loops miss it
because of their list accumulators and `or`/`and` tests.

**Fixed in the Aura runtime** (commit `f92517b791`, "reclaim: recycle the
boxed-float pool"): the file-mode and tree-walker reclaims now mark the live
float boxes and release the dead ones onto a pool free list `aura_alloc_float`
reuses, the same shape as the string-heap and hash-table slot reclaim.
Ownership is stamped per slot at mint so a serve session only frees its own
boxes; a mint-serial handshake protects newborns; the float-literal intern is
rooted. After the fix the same 40M-op loop stays flat (RSS 100MB->106MB, was
144MB->461MB), and a 20k-box drop loop grows the pool by 0 slots. The physics
golden, play-review, coin digest, the `#4525` burst ACs, AC7 float-churn, the
TW park reclaim, and the JIT L1/L2 float-pool growth tests are all unchanged.
Rebuild the runtime with LLVM (`build-jit2`) to run the JIT-path checks.

The recurring 100-300ms spikes were the level gate and chunk spawn, every
~5s; the boot stall is the deferred module compile (`load-slow-one`, ~7.7s).

**The gate spike is now amortized** (`core/main.aura`). A sub-step probe
showed `finish-level!` cost ~120-276ms on the crossing tick, dominated by
three COSMETIC `evo:trial`s that do not touch physics / fairness / score:
the biome evolve (`consider-edsl!` ~85ms), the roster evolve
(`roster-evolve!`/`keep-pals!` ~60-130ms), and the tune (`tune-commit!`
~50ms, already deferred via `tune-due`). The gameplay-critical work
(`gate-cross`, `advance-pace!`, `begin-level!`, banner, coins, chase queue)
is only ~10-40ms.

The fix queues the biome and roster evolves as thunks on `gate-followups`
and drains ONE per tick in `maybe-gate-followup!` (after `maybe-tune!`),
the same slice convention the dream / card / chase already use. The gate
still rotates the biome inline (cheap, keeps the banner correct); the
evolve trial KEEPs/ROLLBACKs a tick or two later with the identical verdict.
The drainer waits while a chat POST or another trial holds the slot, so it
never wedges an in-flight call. `reset-run!` and `clear-slices!` empty the
queue. Measured on the instrumented probe (same seed): the crossing-tick
`finish-level!` drops 276ms -> 69ms, the worst per-tick spike 454ms -> 304ms,
and >150ms buckets 14 -> 10 over 150s. The deferred trials still cost their
own ~60-100ms when they run, but on later frames, spread one per tick
instead of stacked on the gate. check-sim golden, play-review (11/11),
check-run, check-edsl-e2e (offline + voice biome KEEP), check-setcode,
check-music, check-world, check-voice, check-contrast all unchanged.

**The chunk-spawn spike is now amortized too** (`core/main.aura`).
`ensure-ahead!` fills the road to `road-horizon` (six seconds of road,
72-160 m) in a loop of up to 12 spawns; a pace step that widens the horizon
used to lay several ~30-45ms chunks (`spawn-chunk!` -> `pattern-chunk` +
`string-pickups`/`coin-lay`) in one frame. `ensure-ahead!` now takes a
spawn budget: the live tick passes 1, so at most one chunk lands per frame
and the rest follow on later ticks. The setup callers (reset / resume /
rewind) pass no budget and fill the whole horizon synchronously, so hello
and resync still carry a complete road. The buffer is safe: six seconds of
road (72-160 m) far exceeds one chunk (~8-30 m) and the per-tick advance
(~1.4 m worst case at pace 14), so the picture never reaches the tail while
the fill catches up. `check-play` confirms it: ten simulated minutes,
`minAhead 1` (road always ahead), watchdog ok. On the instrumented probe
(same seed) the worst per-tick spike drops 304ms -> 268ms and >200ms buckets
6 -> 5 over 150s, on top of the gate fix. check-sim golden, play-review
(11/11), check-edsl-e2e, smoke all unchanged.

The boot compile (`load-slow-one`, ~7.7s) remains; that is a one-time
startup cost, not a per-frame spike.

**The per-tick `state-msg` scan is now window-first** (`core/main.aura`).
`obstacles-ahead` walks the whole world (pruned to ~8 m behind + the
72-160 m horizon) but only counts obstacles in `[x0, x0+40]`. Measured on
a 120-piece road it is ~92% of `state-msg` (1.10 ms/call; the
`json-encode` of the ~60-field hash is 0.007 ms — negligible). The old
walk tested `obstacle-kind?` (six `=` comparisons) before the x-range, so
every piece paid the kind test even far outside the window. The walk now
tests the cheap x-range first (two comparisons short-circuit the kind
test for the ~80% of pieces outside the window) and reads `piece-x` once
per piece: 35% faster (1.07 -> 0.70 ms/call), same count. Verified equal
over 19k seed/position/motion combinations. An early-exit past the window
was tried and rejected: flyers/rivals/poppers move backward, so no fixed
margin is provably safe over a long run. check-sim, play-review (11/11),
`aura test` (28/28), smoke and check-play unchanged.

**The physics tree-walker cost is a runtime cap, not a target form.**
`lib/phys.aura` (95 defines) runs wholly on the tree-walker because the
runtime IR-caches at most ~63 defines per module — a module with >=64
defines falls back wholesale (bisected: the flip is exactly at 64,
content-independent; `force-soa` does not override). A fixed-arity
`piece` rewrite is behavior-preserving but gives no gain (still
`ir-calls=0`). Filed upstream as aura#5388; the fix is runtime-side.

| file | what it is |
|---|---|
| `workload-coins.aura` | the coin-course kernel, digest, and worldline measurement |
| `seed-source-coins.aura` | flattens phys+sexp+gen+coins+workload; the two seed-only transforms |
| `spec-coins.aura` | the gated target: null vs candidate, checksum, program + site floor |
| `make-golden-coins.aura` | writes `golden-coins.txt`; run after `lib/coins.aura` changes |
| `golden-coins.txt` | the expected coin-placement digest |
| `mine-tick.aura` | drives `perf:collect` + `perf:mine` over the tick's defines |
| `candidates/coin-window-trim.aura` | the kept fix: trim `coin-closed` to the window |
| `candidates/coin-wrong-scale.aura` | negative control: shift coin x; checksum rejects |

## The live-tick target (continuous tracking)

    AURA_BIN=~/aura/build-jit2/aura AURA_PATH=~/aura-perf:~/aura/lib \
      AURA_SANDBOX=off aura --preset dev --grant network perf/mine-run.aura

`mine-run.aura` drives the real server (`core/main.aura` on a socket) for
thousands of ticks and samples the per-tick wall cost in windows, with the
runtime heap counters and the server RSS beside each window. Knobs:
`RUN_TICKS`, `RUN_WINDOW`, `RUN_TICK_MS` (the browser's 50 ms send cadence),
`RUN_PORT`, `RUN_SEED`, `RUN_SERVER_PID` (reads the server's `/proc` RSS).
Start the server first, then run the probe against its port.

Measured (seed 42, 6000 ticks / 300 s simulated, LLM off): the tick median
is **flat** (13–21 ms across every window), p99 90–140 ms, >100 ms buckets
6–13 per 500 — no upward trend. The server RSS climbs ~3 MB/min, but the
live heap is flat (jemalloc `Allocated` ~1.8 MB): the climb is freed pages
the allocator retains (glibc brk free chunks / jemalloc retained), not a
live leak, and it does not move the tick median.

### The stutter, attributed (client side)

The time-dependent frame cost is in the **browser renderer**, not the
server tick. `web/render.mjs` keeps `roadKeys` — one entry per bend change
— and `integrateRoad` walks every key behind the runner on each of the
~230 `sample()` calls a frame makes. Only a gap-rescue rebase (>8 m jump)
ever dropped keys, so in normal play the list grows for the whole run:

| distance run | roadKeys | road cost / frame |
|---|---|---|
| 1000 m | 41 | 0.31 ms |
| 5000 m | 201 | 1.53 ms |
| 10000 m | 401 | 3.00 ms |

`trimRoadKeys` folds the keys behind the camera window (`shownS - 16`) into
the anchor each frame, keeping the world pose exact (`poseOnRoad` continues
the first key backward for `s < anchor.s`). The list stays at ≤2 keys and
the road cost stays ~0.015 ms/frame regardless of distance. Verified: pose
error < 1.5e-11 over 10000 m with bend changes and gap rescues;
`check-lanes` carries the parity + bounded-key regression.

The periodic server spike at each level gate was three cosmetic trials
stacking on the crossing frame: `finish-level!` armed the tune (`tune-due`),
queued the roster restyle (`gate-followups`), and ran `consider-coins!`
inline, while a chase/dream slice could seal on the same tick. Measured
crossing ticks: 307 / 265 / 255 ms (pump + chase-seal + tune + follow-up).

**Fixed** (`core/main.aura`): a tick-local `gate-tick` flag, set by
`finish-level!` inside `pump!` and cleared at the top of the next `on-tick`.
On that one tick the cosmetic trial drainers stand down — `maybe-tune!`,
`maybe-gate-followup!`, and every slice seal (`step-dream!` / `step-hold!` /
`step-cards!` / `step-primer!` / `step-chase!`). `consider-coins!` moved into
the `gate-followups` queue (with the gate-time pace captured so its verdict
is unchanged), so the drainer runs it a tick later, one per tick. Crossing
ticks drop to ~160 / 149 / 142 ms; the tune+follow-up stack goes 6 → 0; the
worst tick 307 → 204 ms. Differential check (seed 42, 1500 ticks): the state
trace is byte-identical and the decision verdict bag matches exactly
(60 = 60, 15 types, 0 diff) — only the timing shifts, no verdict changes.

The remaining spikes are the physics sub-step loop (`pump`, gameplay, not
deferrable) and the dream proving walk. The boot spikes (ticks 7–71) are the
deferred module compile (`load-slow-one`), one-time.

### The dream walk, attributed (budget 12 → 3, landed)

Instrumenting `step-dream!` separates the walk from the seal: the walk
(`autopilot-slice`, 12 physics steps) was p50 ~116 ms / max 157; the seal
(`seal-sliced!`) is ~58 ms, of which the sub-steps are cheap
(`layout-form` 3 ms, `remember-hint!` 4 ms, `phrase-search` 1 ms) — the rest
is the `evo:trial` workspace machinery and the rebind. The walk runs wholly
on the tree-walker (`closure:stats` ir-calls=0, ~7 ms/step), the same
runtime-bound physics cost as the live tick.

**Landed: the slice budget is 3, not 12.** The live tick later dropped this to 1 step, and the chase walk to 2, once the physics pump itself was most of the 50 ms budget. Controlled back-to-back (same
machine, seed 42, 2500 ticks, instrumented `pump` + walk):

| budget | walk p50 / max | pump p50 / p90 | >80 ms frames |
|---|---|---|---|
| 12 | 116 / 157 ms | 47 / 57 ms | 534 |
| 4 | 38 / 67 ms | 46 / 56 ms | 779 |
| **3** | **29 / 49 ms** | 46 / 57 ms | **500** |

Three, not four: the walk and the physics `pump` share the frame, so the
slice must keep walk + pump under the frame budget. Three's 29 + 46 = 75 ms
stays below 80; four's 38 + 46 = 84 crossed it on more ticks (779 > 534),
trading a smaller spike for more threshold crossings. Three cuts the walk
spike 75% and the >80 ms frame count 534 → 500, with pump unchanged. The
same total walk spreads over more ticks, so the dream finishes in ~6 s
instead of ~1.5 s — still well inside the 22 s `next-dream` gap, and the
dream/chase windows rarely overlap.

The trade (accepted): the dream seal installs `motif-now`, which shapes the
chunks spawned afterwards. The seal's `run-ms` is `start + (K/budget)*dt`,
so the smaller budget seals later in simulated time, the road ahead differs,
and the seeded run's bumps shift with it. Differential (seed 42, 1500 ticks,
LLM off): budget 4 vs 12 gave stateDiff 487 and a changed verdict bag
(BUMP/run/bump 15 → 18, ROLLBACK/motif/geometry 4 → 3). The road stays
autopilot-proven fair; the cosmetic phrase simply lands later, and the
seeded run is no longer bit-identical to the budget-12 run. This is a
gameplay-visible timing shift, not a verdict-preserving optimization like
the gate-tick fix above (which defers a seal by at most one tick and keeps
the tested run verdict-identical). It was landed with that trade explicit.

The deeper fix — the walk itself getting cheaper — still waits on the
physics autopilot running on IR/JIT (runtime-side, aura#5388 + the variadic
`piece` form).

| file | what it is |
|---|---|
| `mine-run.aura` | continuous live-tick tracking: per-window wall cost + heap counters + server RSS |
