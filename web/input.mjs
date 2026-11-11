// Tap / Space / swipe up: jump. Swipe down / Down: slide.
// Swipe sideways / arrows: change lane. Gamepad uses the same edges.

export function createInput(el) {
  const edges = { jump: 0, slide: 0, lane: 0 };
  let touchX = 0;
  let touchY = 0;
  let touchT = 0;
  let touchId = null;
  let laneSent = false;
  const padPrev = [false, false, false, false, false];

  function jump() { edges.jump = 1; }
  function slide() { edges.slide = 1; }
  function lane(dir) { edges.lane = dir; }

  function onKey(e) {
    if (e.repeat) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const code = e.code || "";
    const k = e.key || "";
    if (code === "Space" || code === "ArrowUp" || code === "KeyW" || k === " ") { jump(); e.preventDefault(); }
    else if (code === "ArrowDown" || code === "KeyS") { slide(); e.preventDefault(); }
    else if (code === "ArrowLeft" || code === "KeyA") { lane(-1); e.preventDefault(); }
    else if (code === "ArrowRight" || code === "KeyD") { lane(1); e.preventDefault(); }
    else if (code === "KeyR") { edges.restart = 1; }
  }

  window.addEventListener("keydown", onKey, { passive: false });
  el.tabIndex = 0;
  el.addEventListener("pointerdown", () => el.focus());
  queueMicrotask(() => el.focus());

  el.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    touchId = t.identifier;
    touchX = t.clientX;
    touchY = t.clientY;
    touchT = performance.now();
    laneSent = false;
  }, { passive: true });

  el.addEventListener("touchmove", (e) => {
    if (laneSent) return;
    const t = [...e.changedTouches].find((c) => c.identifier === touchId);
    if (!t) return;
    const dx = t.clientX - touchX;
    const dy = t.clientY - touchY;
    if (dy > 28 && Math.abs(dy) > Math.abs(dx)) { slide(); laneSent = true; }
    else if (dx > 36 && Math.abs(dx) > Math.abs(dy)) { lane(1); laneSent = true; }
    else if (dx < -36 && Math.abs(dx) > Math.abs(dy)) { lane(-1); laneSent = true; }
  }, { passive: true });

  el.addEventListener("touchend", (e) => {
    const t = [...e.changedTouches].find((c) => c.identifier === touchId);
    if (!t) return;
    const dx = t.clientX - touchX;
    const dy = t.clientY - touchY;
    const dt = performance.now() - touchT;
    if (!laneSent && Math.hypot(dx, dy) < 24 && dt < 320) jump();
    touchId = null;
  }, { passive: true });

  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && pads[0];
    if (!p) return;
    const buttons = [
      p.buttons[0] && p.buttons[0].pressed,
      p.buttons[1] && p.buttons[1].pressed,
      p.buttons[12] && p.buttons[12].pressed,
      p.buttons[13] && p.buttons[13].pressed,
      p.buttons[14] && p.buttons[14].pressed,
      p.buttons[15] && p.buttons[15].pressed,
    ];
    if (buttons[0] && !padPrev[0]) jump();
    if ((buttons[1] || buttons[3]) && !(padPrev[1] || padPrev[3])) slide();
    if (buttons[4] && !padPrev[4]) lane(-1);
    if (buttons[5] && !padPrev[5]) lane(1);
    const ax = p.axes[0] || 0;
    if (ax < -0.6 && !(padPrev[6])) { lane(-1); padPrev[6] = true; }
    else if (ax > 0.6 && !padPrev[7]) { lane(1); padPrev[7] = true; }
    else if (Math.abs(ax) < 0.3) { padPrev[6] = false; padPrev[7] = false; }
    padPrev[0] = buttons[0];
    padPrev[1] = buttons[1];
    padPrev[3] = buttons[3];
    padPrev[4] = buttons[4];
    padPrev[5] = buttons[5];
  }

  function consume() {
    pollPad();
    const out = { jump: edges.jump, slide: edges.slide, lane: edges.lane, restart: edges.restart || 0 };
    edges.jump = 0;
    edges.slide = 0;
    edges.lane = 0;
    edges.restart = 0;
    return out;
  }

  return { consume, jump, slide, lane };
}
