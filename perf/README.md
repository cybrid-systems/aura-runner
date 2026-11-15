# perf harness

An aura-perf target for this repository's physics.

    aura-perf autotune perf/spec.aura

The target program is `lib/phys.aura`. The runtime set-codes the seed
(`lib/phys.aura` + `perf/workload.aura`), so the defines a candidate
rebinds - `step`, `collide`, `pset`, `pxs` - live in the module the
runtime mutates.

| file | what it is |
|---|---|
| `workload.aura` | the seeded course, the kernel and the strategy; appended to the seed |
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

The candidates are the two prototypes from
<https://github.com/cybrid-systems/aura-runner/issues/7> (`pset` through
a vector, `collide` with an x window) plus `pxs` through `list-ref`, and
one candidate the checksum has to reject.

A candidate cannot be judged yet: a `mutate:rebind` inside an `evo:trial`
loses the variadic parameter list, so `lib/phys.aura`'s
`(define (piece k x w h y . rest) ...)` breaks the trial. See
<https://github.com/cybrid-systems/aura/issues/5296>.
