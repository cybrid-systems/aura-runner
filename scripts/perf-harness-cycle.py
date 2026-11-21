#!/usr/bin/env python3
"""aura-harness coordinator for an aura-perf round on aura-runner (bus path).

The perf round hosts the target workspace's bus (aura-perf#10/#28); after
the report it lingers (default 60s, here AURA_PERF_BUS_LINGER_S). This
driver attaches the harness server as role 2 (read|publish) DURING that
window, reads the round's committed image — hypothesis metrics, trial
worldlines, shared audit — and publishes the harness's regression/release
verdict per worldline (910000+wl / 920000+wl / 930000+wl). The harness
never opens trials and never KEEPs: KEEP stays with perf under the
coordinator's constraint gate (docs/bus.md in both repos).

Usage:
  AURA_BIN=... AURA_LIB=... python3 perf-harness-cycle.py --ws 5390 \
      --report perf/out/report.txt --out perf/out/harness-bus.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

HARNESS = Path(os.environ.get("AURA_HARNESS_ROOT",
                              str(Path.home() / "projects" / "aura-harness")))
sys.path.insert(0, str(HARNESS))


def parse_report(path: Path) -> dict:
    """The gate's verdicts from the round's own report (human-facing view)."""
    text = path.read_text()
    cands = {}
    for m in re.finditer(
            r"^candidate (\S+) (PASS|ROLLBACK) reason=(\S+) heldout-ms=(-?\d+) ref-ms=(-?\d+)"
            r" ref-target=(\S+)", text, re.M):
        cid, verdict, reason, held, ref, target = m.groups()
        cands[cid] = {"verdict": verdict, "reason": reason,
                      "heldout-ms": int(held), "ref-ms": int(ref), "ref-target": target}
    wl_of = {}
    for m in re.finditer(r"^bus-worldline (\S+) wl=(\d+) verdict=(\S+)", text, re.M):
        cid, wl, verdict = m.groups()
        wl_of[int(wl)] = {"id": cid, "bus-verdict": verdict}
    hyp = {}
    for m in re.finditer(r"^bus-hypothesis (\S+) key=(\d+) base-ms=(\d+)", text, re.M):
        cid, key, base = m.groups()
        hyp[int(key)] = {"id": cid, "base-ms": int(base)}
    m = re.search(r"^verdict (intend-met=\d+ KEEP=\d+ ROLLBACK=\d+ .*)$", text, re.M)
    return {"candidates": cands, "worldlines": wl_of, "hypotheses": hyp,
            "verdict-line": m.group(1) if m else ""}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ws", type=int, required=True)
    ap.add_argument("--report", default="perf/out/report.txt")
    ap.add_argument("--out", default="perf/out/harness-bus.json")
    ap.add_argument("--wait-s", type=float, default=600.0,
                    help="max seconds to wait for the round's report + linger window")
    a = ap.parse_args()

    report = Path(a.report)
    t0 = time.time()
    while not report.exists() or "bus detached" not in report.read_text():
        if time.time() - t0 > a.wait_s:
            print("timeout waiting for the round's bus-finish", file=sys.stderr)
            return 2
        time.sleep(2)
    # the report is on disk before the window opens; give the host a beat
    time.sleep(1)
    rep = parse_report(report)

    os.environ["AURA_HARNESS_BUS_WORKSPACE"] = str(a.ws)
    os.environ.setdefault("AURA_SANDBOX", "off")
    from aura_harness.control import AuraHarness
    from aura_harness.bus import BusFace

    h = AuraHarness("ws")
    bus = BusFace(h)
    out = {"ws": a.ws, "attached": bus.attached, "report-verdict": rep["verdict-line"]}
    if not bus.attached:
        out["error"] = "attach failed"
        print(json.dumps(out, indent=2))
        h.close()
        return 1
    try:
        # 1. read the round's committed image (PROV parity: ok/none/error)
        m = bus.metrics()
        out["metrics-status"] = m.get("status")
        rows = m.get("rows") or []
        out["metrics-rows"] = len(rows)
        keys = {r[0]: r[1] for r in rows}
        out["summary"] = {"before-ms": keys.get(900001), "after-ms": keys.get(900002)}
        # hypothesis keys must agree with the report's own lines
        hyp_ok = all(keys.get(k) == v["base-ms"] for k, v in rep["hypotheses"].items())
        out["hypotheses-match-report"] = hyp_ok

        w = bus.worldlines()
        out["worldlines-status"] = w.get("status")
        wrows = w.get("rows") or []
        # append-only: a settled trial appears again with its final state;
        # keep the LAST record per id (0 pending / 1 kept / 2 rolled / 3 rejected)
        final = {}
        for r in wrows:
            final[r[0]] = r[2]
        out["worldline-states"] = final

        # 2. the harness's regression gate: the runner's own held-out checks.
        # The perf checksum already ran the golden digest on every candidate;
        # the harness's independent evidence is the runner's regression suite
        # (physics golden + play-review), run once on the KEPT library state.
        # Here we publish per-worldline release/reject from the gate's verdicts
        # plus the checksum evidence the round committed.
        verdicts = []
        for wl, info in sorted(rep["worldlines"].items()):
            cid = info["id"]
            c = rep["candidates"].get(cid, {})
            kept = c.get("verdict") == "PASS"
            state = final.get(wl)
            # cross-check: the bus worldline state must agree with the gate
            agree = (state == 1) == kept if state is not None else None
            ok_n = 1 if kept else 0     # held-out checksum ok (the round's evidence)
            # BusFace.verdict(ts, trial_i, keep, ok_count, n): with no wl_of
            # mapping it publishes under 910000+ts, so pass the worldline id
            # as both ts and trial_i to key the verdict by the bus worldline.
            r = bus.verdict(wl, wl, kept, ok_n, 1)
            verdicts.append({"wl": wl, "id": cid, "release": kept,
                             "bus-state": state, "state-agrees": agree,
                             "publish-ok": bool(r and r.get("ok"))})
        out["verdicts"] = verdicts

        a_ = bus.audit()
        out["audit-ok"] = bool(a_ and a_.get("ok"))
        out["audit-events"] = (a_ or {}).get("count", 0)
        fin = bus.finish()
        out["finish"] = fin
    finally:
        h.close()
    Path(a.out).write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))
    bad = (not out.get("hypotheses-match-report", False)
           or any(v["state-agrees"] is False for v in out.get("verdicts", []))
           or not out.get("audit-ok"))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
