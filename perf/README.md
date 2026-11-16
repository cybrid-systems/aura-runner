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
  moved, so a stretch without a flyer does not rebuild it.
- `step-poppers-noop`: the same for the poppers.
- `collide-slack`: the metre of slack around the body is more than the
  geometry needs.
- `wrong-scale`: the score is doubled on the way in; the checksum has to
  reject it.

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

## The run on aura v0.2.5

Both targets were re-run on **aura v0.2.5** (`7167490e`, the release
tarball) with the runtime probe passing (the named-let reentrancy of
cybrid-systems/aura#5116 is fixed there).

| target | report | verdict |
|---|---|---|
| the physics (`perf/spec.aura`) | `perf/out/report-physics-v025.txt` | `intend-met=1 KEEP=2 ROLLBACK=3 speedup-x=1.43` |
| the autopilot (`perf/spec-autopilot.aura`) | `perf/out/report-autopilot-v025.txt` | `intend-met=0 KEEP=2 ROLLBACK=7` |

The numbers move with the machine's load: on a quiet run the same round
measured `speedup-x=1.38` (`nudge-flyers-noop` 1728 ms against its own
null's 2349 ms), on a busy one `1.04`. The verdict line in the saved
report is the one from the run that produced it.

The physics round judges every candidate against the null of the define
it rebinds, and the site floor reads the same define:

```
candidate nudge-flyers-noop PASS reason=gate-pass heldout-ms=1638 ref-ms=2264 ref-target=nudge-flyers site-floor=0
site nudge-flyers base-ms=178 cand-ms=160 floor-pct=20
candidate step-poppers-noop PASS reason=gate-pass heldout-ms=1681 ref-ms=2274 ref-target=step-poppers site-floor=0
site step-poppers base-ms=157 cand-ms=62 floor-pct=20
```

Both candidates are kept on the **program** floor (`site-floor=0`): they
are real wins on the whole path, 27% and 26%. `step-poppers-noop` (the
piece list comes back unchanged when the stretch has no popper in it)
also wins on its own site — `157 ms → 62 ms`.

The reference each candidate is judged against is the null of the define
it rebinds, measured in the same child process right before the
candidate is applied ([aura-perf#25](https://github.com/cybrid-systems/aura-perf/issues/25)):
the two numbers then differ by the candidate and by nothing else.

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
