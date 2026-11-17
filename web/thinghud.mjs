// The live thing line: how many fibers are thinking, which candidate was
// chosen and how many passed, when it went on the road, or that the
// previous one came back. Text only; the core sends the numbers.

const HOLD_MS = 4200;

export function hudText(msg) {
  const info = (msg && msg.info) || {};
  const asked = Number(msg && msg.asked) || 0;
  switch (msg && msg.phase) {
    case "thinking":
      return { text: `正在想新东西… ${Number(info.fibers) || asked} 路一起想`, busy: true };
    case "chosen":
      return {
        text: `选中第 ${(Number(info.variant) || 0) + 1} 个 · ${Number(info.passed) || 0}/${Number(info.got) || 0} 通过 · ${Math.round(Number(info.ms) || 0) / 1000}s`,
        busy: true,
      };
    case "live":
      return { text: `换上了 · 第 ${(Number(info.variant) || 0) + 1} 个 · 下一段路生效`, busy: false };
    case "none":
      return { text: info.why === "commit" ? "这次没装上，画面先不变" : "这次没有通过检查的，画面先不变", busy: false };
    case "rollback":
      return { text: "换回了上一个样子", busy: false };
    default:
      return null;
  }
}

export function installThingHud(doc = globalThis.document) {
  const el = doc ? doc.getElementById("thing-hud") : null;
  let timer = 0;
  const hook = { phase: "", shown: 0 };
  if (typeof window !== "undefined") window.__lumenThing = hook;
  function show(msg) {
    const row = hudText(msg);
    hook.phase = msg && msg.phase ? msg.phase : "";
    hook.last = msg;
    if (!el || !row) return;
    hook.shown += 1;
    el.hidden = false;
    el.textContent = row.text;
    el.dataset.busy = row.busy ? "1" : "0";
    if (timer) clearTimeout(timer);
    timer = 0;
    if (!row.busy) {
      timer = setTimeout(() => {
        el.hidden = true;
      }, HOLD_MS);
    }
  }
  return { show };
}
