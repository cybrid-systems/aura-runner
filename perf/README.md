# perf harness

An aura-perf target for this repository's physics.

    aura-perf autotune perf/spec.aura

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
