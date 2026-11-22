#!/usr/bin/env python3
"""Continuous perf→harness optimization loop for aura-runner (bus path).

Drives repeated aura-perf rounds on a target spec; each round hosts the
target workspace's bus, and DURING its linger window this driver runs the
aura-harness coordinator (scripts/perf-harness-cycle.py) to read the round's
committed evidence and publish the harness release/reject verdicts. Between
rounds it runs the runner's regression suite as the independent gate, and
accumulates a per-run summary. perf's own memory.json carries the negative
examples across rounds, so the search space shrinks as rounds proceed.

Roles stay as delivered: perf proposes/trials/KEEPS under the coordinator's
constraint gate; the harness only reads and publishes verdicts (never trials,
never KEEP); this driver is the outer scheduler, not a gate bypass.

Usage:
  AURA_BIN=... AURA_LIB=... python3 scripts/perf-continuous.py \
      --spec perf/spec.aura --rounds 3 --ws-base 5400 --linger-s 180 \
      --out perf/out/continuous

Env: AURA_BIN (bus-capable aura), AURA_LIB (its lib, for std/bus),
     AURA_PERF_ROOT (default ~/aura-perf), AURA_HARNESS_ROOT (default
     ~/projects/aura-harness). The runner's regression suite (aura test +
     check-sim) runs between rounds unless --no-regression.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

RUNNER = Path(__file__).resolve().parents[1]


def env_base(a) -> dict:
    aura_bin = os.environ.get("AURA_BIN") or shutil.which("aura")
    if not aura_bin or not Path(aura_bin).is_file():
        sys.exit("AURA_BIN must point at a bus-capable aura binary")
    aura_lib = os.environ.get("AURA_LIB") or str(Path(aura_bin).resolve().parent.parent / "lib")
    perf_root = os.environ.get("AURA_PERF_ROOT", str(Path.home() / "aura-perf"))
    harness_root = os.environ.get("AURA_HARNESS_ROOT",
                                  str(Path.home() / "projects" / "aura-harness"))
    return dict(os.environ, AURA_BIN=aura_bin, AURA_LIB=aura_lib,
                AURA_PERF_ROOT=perf_root, AURA_HARNESS_ROOT=harness_root,
                AURA_PATH=f"{perf_root}:{aura_lib}",
                AURA_PERF_WORKER=f"{perf_root}/examples/sum-scan/worker.aura",
                AURA_SANDBOX="off")


def run_round(a, base: dict, rnd: int, out_dir: Path) -> dict:
    """One perf round + the harness cycle inside its linger window."""
    ws = a.ws_base + rnd
    rt = tempfile.mkdtemp(prefix=f"perfcont-r{rnd}-")
    fifo = f"{rt}/perf-fifo"
    os.mkfifo(fifo)
    env = dict(base, XDG_RUNTIME_DIR=rt, AURA_PERF_BUS_WORKSPACE=str(ws),
               AURA_PERF_BUS_LINGER_S=str(a.linger_s))
    # Hold stdin open so the linger window stays up (aura-perf#28).
    holder = subprocess.Popen(["bash", "-c", f"sleep {a.linger_s + 600} > {fifo}"],
                              stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL, start_new_session=True)
    time.sleep(0.3)
    perf_out = out_dir / f"round{rnd}.perf.txt"
    rec = {"round": rnd, "ws": ws, "rt": rt}
    with open(perf_out, "w") as log:
        roundp = subprocess.Popen([base["AURA_BIN"], "--preset", "dev", "--grant", "exec", a.spec],
                                  cwd=RUNNER, stdin=open(fifo, "r"), stdout=log,
                                  stderr=subprocess.STDOUT, env=env)
        rec["perf-pid"] = roundp.pid
        sock = Path(rt) / "aura" / "bus" / f"{ws}.sock"
        report = RUNNER / "perf" / "out" / "report.txt"
        # The previous round's report lingers on disk until THIS round writes
        # its own (perf writes it at the end). Snapshot it so the window wait
        # below requires a FRESH report, not the stale one — otherwise the
        # harness coordinator reads the previous round's verdicts.
        prev_report = report.read_text() if report.exists() else ""
        window = False
        t0 = time.time()
        while time.time() - t0 < a.round_timeout:
            if (sock.exists() and report.exists()
                    and report.read_text() != prev_report
                    and "bus detached" in report.read_text()):
                window = True
                break
            if roundp.poll() is not None:
                break
            time.sleep(0.5)
        rec["window-opened"] = window
        rec["perf-exit-early"] = roundp.poll() is not None and not window
        if window and report.exists():
            shutil.copy(report, out_dir / f"round{rnd}.report.txt")
        if window:
            # Harness coordinator inside the window (reads evidence, publishes verdicts).
            henv = dict(env, AURA_HARNESS_BUS_WORKSPACE=str(ws))
            hout = out_dir / f"round{rnd}.harness.json"
            h = subprocess.run([sys.executable, "scripts/perf-harness-cycle.py",
                                "--ws", str(ws), "--report", "perf/out/report.txt",
                                "--out", str(hout)],
                               cwd=RUNNER, env=henv, capture_output=True, text=True,
                               timeout=a.linger_s + 60)
            rec["harness-rc"] = h.returncode
            if hout.exists():
                rec["harness"] = json.loads(hout.read_text())
            if h.returncode != 0:
                rec["harness-stderr"] = h.stderr[-400:]
        # Close the window: EOF on stdin ends the linger; the round exits.
        holder.kill()
        try:
            roundp.wait(timeout=30)
        except subprocess.TimeoutExpired:
            roundp.kill()
            roundp.wait()
        rec["perf-rc"] = roundp.returncode
    # Parse the round's verdict line + keeps from the perf log.
    text = perf_out.read_text()
    rec["verdict-line"] = next((l for l in text.splitlines() if l.startswith("verdict ")), "")
    rec["keeps"] = [l.split("id=")[1].split()[0] for l in text.splitlines()
                    if l.startswith("kernel KEEP id=")]
    rec["negative-skips"] = sum(1 for l in text.splitlines() if l.startswith("negative-skip"))
    rec["candidates-tried"] = sum(1 for l in text.splitlines() if l.startswith("candidate "))
    shutil.rmtree(rt, ignore_errors=True)
    return rec


def regression(base: dict, out_dir: Path, rnd: int) -> dict:
    """The runner's own suite as the independent between-round gate."""
    res = {}
    t = subprocess.run([base["AURA_BIN"], "test"], cwd=RUNNER, capture_output=True,
                       text=True, env=dict(base, AURA_SANDBOX="off"), timeout=300)
    res["aura-test-rc"] = t.returncode
    res["aura-test-tail"] = t.stdout.strip().splitlines()[-1] if t.stdout.strip() else ""
    (out_dir / f"round{rnd}.auratest.txt").write_text(t.stdout + t.stderr)
    s = subprocess.run(["node", "scripts/check-sim.mjs"], cwd=RUNNER, capture_output=True,
                       text=True, timeout=120)
    res["check-sim-rc"] = s.returncode
    (out_dir / f"round{rnd}.checksim.txt").write_text(s.stdout + s.stderr)
    res["pass"] = res["aura-test-rc"] == 0 and res["check-sim-rc"] == 0
    return res


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", default="perf/spec.aura")
    ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument("--ws-base", type=int, default=5400)
    ap.add_argument("--linger-s", type=int, default=180)
    ap.add_argument("--round-timeout", type=float, default=420.0)
    ap.add_argument("--out", default="perf/out/continuous")
    ap.add_argument("--no-regression", action="store_true")
    ap.add_argument("--fresh-memory", action="store_true",
                    help="start from an empty negative memory (else carry the existing one)")
    a = ap.parse_args()
    base = env_base(a)
    out_dir = RUNNER / a.out
    out_dir.mkdir(parents=True, exist_ok=True)
    mem = RUNNER / "perf" / "out" / "memory.json"
    if a.fresh_memory and mem.exists():
        shutil.copy(mem, out_dir / "memory.initial.json")
        mem.write_text("[]")
    summary = {"spec": a.spec, "rounds": [], "started": time.strftime("%Y-%m-%dT%H:%M:%S")}
    for rnd in range(1, a.rounds + 1):
        print(f"=== round {rnd} (ws={a.ws_base + rnd}) ===", flush=True)
        rec = run_round(a, base, rnd, out_dir)
        print("  verdict:", rec["verdict-line"], flush=True)
        print("  keeps:", rec["keeps"], "neg-skips:", rec["negative-skips"],
              "tried:", rec["candidates-tried"], flush=True)
        h = rec.get("harness") or {}
        print("  harness: attached=%s hyp-match=%s verdicts=%s audit=%s" % (
            h.get("attached"), h.get("hypotheses-match-report"),
            [(v["id"], v["release"], v["state-agrees"]) for v in h.get("verdicts", [])],
            h.get("audit-events")), flush=True)
        if not a.no_regression:
            reg = regression(base, out_dir, rnd)
            rec["regression"] = reg
            print("  regression: aura-test=%s check-sim=%s pass=%s" % (
                reg["aura-test-rc"], reg["check-sim-rc"], reg["pass"]), flush=True)
            if not reg["pass"]:
                rec["stopped"] = "regression-failed"
                summary["rounds"].append(rec)
                break
        summary["rounds"].append(rec)
        if mem.exists():
            rec["memory-negatives"] = len(json.loads(mem.read_text()))
        # Stop when a round tried nothing new and kept nothing (search exhausted).
        if rec["candidates-tried"] == 0 and not rec["keeps"]:
            rec["stopped"] = "search-exhausted"
            break
    summary["finished"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print("=== summary written:", out_dir / "summary.json", flush=True)
    bad = any(r.get("harness-rc") not in (0, None) or r.get("stopped") == "regression-failed"
              for r in summary["rounds"])
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
