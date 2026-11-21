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
  geometry needs.
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
