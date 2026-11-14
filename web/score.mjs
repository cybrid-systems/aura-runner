// Points and the live rating. A coin is the base. The other pickups
// are worth more. The rating climbs with points and drops one step
// when the runner hits something solid.

export const GRADES = ["", "Sprout", "Runner", "Bloom", "Shine", "Lumen"];
export const GRADE_STEP = 100;
// A clean pass pays a little. It stays under a coin.
export const NICE_POINTS = 20;

export function lootWorth(name) {
  if (name === "blossom") return 40;
  if (name === "apple") return 55;
  if (name === "star") return 80;
  if (name === "gem") return 120;
  return 25;
}

export function gradeLabel(grade) {
  const g = Math.max(1, Math.min(5, grade | 0));
  return GRADES[g] + " " + "★".repeat(g) + "☆".repeat(5 - g);
}

export function takePoints(grade, bank, gained) {
  let g = grade;
  let b = bank + gained;
  // One step per pickup, so a big gem does not skip the whole rating.
  if (g < 5 && b >= GRADE_STEP) {
    g += 1;
    b = Math.min(GRADE_STEP - 1, b - GRADE_STEP);
  }
  return { grade: g, bank: b };
}

export function dropGrade(grade) {
  return grade > 1 ? grade - 1 : 1;
}

// The step already added `worth` once. A combo adds the extra copies.
// Combo resets when the gap since the last pickup is 2.4s or more.
export function awardPickup(worth, combo, comboUntil, now, grade, bank) {
  const base = Number.isFinite(worth) && worth > 0 ? worth : 25;
  const nextCombo = now < comboUntil ? Math.min(5, combo + 1) : 1;
  const extra = nextCombo > 1 ? base * (nextCombo - 1) : 0;
  const gained = Math.round(base * nextCombo);
  const rated = takePoints(grade, bank, gained);
  const text = nextCombo > 1 ? "+" + gained + " ×" + nextCombo : "+" + gained;
  return {
    extra,
    gained,
    combo: nextCombo,
    comboUntil: now + 2400,
    grade: rated.grade,
    bank: rated.bank,
    text,
    gainUntil: now + 1100,
  };
}

// Sliding under a bar, or leaving a bursting popper's lane, pays this.
export function praise(grade, bank) {
  const rated = takePoints(grade, bank, NICE_POINTS);
  return { points: NICE_POINTS, grade: rated.grade, bank: rated.bank, text: "Nice! +" + NICE_POINTS };
}
