// Twin of road-at in lib/phys.aura. Kind 1 is the road. Field 4 is the
// height at the start of the slab. Field 6, when present, is the rise
// across its width. A flat piece has neither, so the floor stays 0.
// Over a gap the floor is the lip of the ground that ended just behind.

export function roadAt(x, pieces) {
  let hit = null;
  let lip = 0;
  let bestEnd = -1;
  if (!pieces) return { height: 0, grade: 0 };
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    if (!q || q[0] !== 1) continue;
    const x0 = q[1];
    const w = q[2];
    const x1 = x0 + w;
    const y0 = q[4] || 0;
    const rise = q.length > 6 ? q[6] : 0;
    if (x >= x0 && x < x1) {
      const t = w > 0.0001 ? (x - x0) / w : 0;
      const grade = w > 0.0001 ? rise / w : 0;
      hit = { height: y0 + rise * t, grade };
    } else if (x1 <= x && x1 > bestEnd) {
      lip = y0 + rise;
      bestEnd = x1;
    }
  }
  return hit || { height: lip, grade: 0 };
}

export function roadHeight(x, pieces) {
  return roadAt(x, pieces).height;
}

export function roadGrade(x, pieces) {
  return roadAt(x, pieces).grade;
}

// Uphill eases the pace. Downhill adds a little. A flat step must not
// multiply, or the golden trace moves.
export function paceOnGrade(speed, grade) {
  if (grade === 0) return speed;
  let scale = 1 - grade * 1.2;
  if (scale < 0.76) scale = 0.76;
  else if (scale > 1.18) scale = 1.18;
  return speed * scale;
}
