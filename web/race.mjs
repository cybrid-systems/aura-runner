// Head-to-head standing against the rival on the road.
// A positive gap means the runner is ahead, in metres.

export function raceGap(px, rx) {
  return px - rx;
}

export function raceMeters(gap) {
  const n = Number(gap) || 0;
  return n >= 0 ? Math.round(n) : -Math.round(-n);
}

export function raceLabel(gap) {
  const m = raceMeters(gap);
  return (m >= 0 ? "+" : "") + m + "m";
}

export function raceRead(px, rx) {
  const gap = raceGap(px, rx);
  const place = gap >= 0 ? 1 : 2;
  return {
    place,
    gap,
    label: raceLabel(gap),
    who: place === 1 ? "player" : "rival",
  };
}

// Empty when nobody has reached the gate. On the gate, the rival wins
// only if it is already further past that line.
export function raceGate(px, rx, gate) {
  if (!Number.isFinite(px) || !Number.isFinite(rx) || !Number.isFinite(gate)) return "";
  if (px >= gate && rx > px && rx >= gate) return "rival";
  if (px >= gate) return "player";
  if (rx >= gate) return "rival";
  return "";
}

export function gateLine(base, race, mood) {
  const led = race === "player" ? " · You led" : race === "rival" ? " · Rival led" : "";
  const adapt = race === "player" && mood === "keen"
    ? " · Rival trains harder"
    : mood === "gentle" && race
      ? " · Rival eases off"
      : "";
  return (base || "Level clear") + led + adapt;
}
