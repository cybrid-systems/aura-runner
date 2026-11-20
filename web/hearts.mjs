// Three hearts, outside the physics player. A shield takes the hit
// first. An unshielded hit costs one heart and opens a short window
// so one cluster cannot take another. Coins are never cleared here.

export const HEARTS_MAX = 3;
export const HEART_IFRAME = 1.2;
// The combo cap. Reaching it once can give a heart back.
export const COMBO_HEART = 5;

export function heartsBlank() {
  return { hearts: HEARTS_MAX, max: HEARTS_MAX, iframe: 0, over: false, lost: 0 };
}

export function heartsHit(state, shield) {
  const s = state || heartsBlank();
  const hearts = s.hearts | 0;
  const iframe = s.iframe > 0 ? s.iframe : 0;
  const lost = s.lost | 0;
  if (s.over) {
    return { hearts, max: HEARTS_MAX, iframe, over: true, lost, shield: false, heart: false, coins: true, comboReset: false, cleanFail: false };
  }
  if (shield) {
    return { hearts, max: HEARTS_MAX, iframe, over: false, lost, shield: true, heart: false, coins: true, comboReset: false, cleanFail: false };
  }
  if (iframe > 0) {
    return { hearts, max: HEARTS_MAX, iframe, over: false, lost, shield: false, heart: false, coins: true, comboReset: false, cleanFail: false };
  }
  const next = Math.max(0, hearts - 1);
  return {
    hearts: next,
    max: HEARTS_MAX,
    iframe: HEART_IFRAME,
    over: next <= 0,
    lost: lost + 1,
    shield: false,
    heart: true,
    coins: true,
    comboReset: true,
    cleanFail: true,
  };
}

export function heartsTick(state, dt) {
  const s = state || heartsBlank();
  const iframe = Math.max(0, (s.iframe || 0) - (dt > 0 ? dt : 0));
  if (iframe === s.iframe) return s;
  return { ...s, iframe };
}

export function heartsRecover(state, reason) {
  const s = state || heartsBlank();
  const ok = reason === "clean" || reason === "combo";
  if (s.over || s.hearts <= 0 || s.hearts >= HEARTS_MAX || !ok) {
    return { ...s, recovered: false, reason: reason || "" };
  }
  return { ...s, hearts: s.hearts + 1, recovered: true, reason };
}
