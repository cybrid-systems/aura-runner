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

// Passing close to a hurdle or a block. Under Nice, so a skim is a
// small skill mark and a clean slide still reads as the bigger one.
export const NEAR_POINTS = 15;
export const OVERTAKE_POINTS = 30;

export function nearMiss(grade, bank) {
  const rated = takePoints(grade, bank, NEAR_POINTS);
  return { points: NEAR_POINTS, grade: rated.grade, bank: rated.bank, text: "Close! +" + NEAR_POINTS };
}

export function overtake(grade, bank) {
  const rated = takePoints(grade, bank, OVERTAKE_POINTS);
  return { points: OVERTAKE_POINTS, grade: rated.grade, bank: rated.bank, text: "Overtake! +" + OVERTAKE_POINTS };
}

// The spark already uses this window. A pot one lane over, or a hurdle
// just cleared, counts. q[3] is the height the spark compares against.
export function skimmed(x, y, lane, q) {
  const k = q[0];
  if (k !== 3 && k !== 7) return false;
  const end = q[1] + q[2];
  if (x < end - 0.05 || x > end + 0.35) return false;
  const pl = q.length > 5 ? q[5] : -1;
  if (k === 7 && pl >= 0 && Math.abs(pl - lane) === 1) return true;
  if (k === 3 && (pl < 0 || pl === lane) && y > q[3] && y < q[3] + 0.55) return true;
  return false;
}

// One award the first time x pulls past this rival. Starting ahead
// does not pay. `mark` is the rival's memory from the previous step.
export function trackOvertake(mark, x, rivalMid) {
  const seen = !!(mark && mark.seen);
  const behind = !!(mark && mark.behind);
  const done = !!(mark && mark.done);
  if (done) return { seen: true, behind: false, done: true, award: false };
  if (!seen) {
    return { seen: true, behind: x + 0.15 < rivalMid, done: false, award: false };
  }
  if (behind && x > rivalMid + 0.35) {
    return { seen: true, behind: false, done: true, award: true };
  }
  return { seen: true, behind, done: false, award: false };
}

// Level 1 asks for a clean run. Then a combo, then the rival, and around.
export function challengeFor(level) {
  const n = Number.isFinite(level) ? Math.max(1, Math.round(level)) : 1;
  const k = n % 3;
  if (k === 1) return { id: "clean", text: "Zero bumps" };
  if (k === 2) return { id: "combo", text: "Reach ×3 combo" };
  return { id: "overtake", text: "Overtake rival" };
}

export function challengeMet(id, stats) {
  const s = stats || {};
  if (id === "clean") return (s.bumps | 0) === 0;
  if (id === "combo") return (s.combo | 0) >= 3;
  if (id === "overtake") return (s.overtakes | 0) >= 1;
  return false;
}
