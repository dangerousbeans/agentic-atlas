export interface Pt { x: number; y: number }
export interface Box { x: number; y: number; w: number; h: number }

const f = (n: number) => Math.round(n * 10) / 10;
const p = (pt: Pt) => `${f(pt.x)},${f(pt.y)}`;
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

export function roundedPath(input: Pt[], r = 10): string {
  const pts = input.filter((q, i) => i === 0 || q.x !== input[i - 1].x || q.y !== input[i - 1].y);
  if (pts.length < 2) return '';
  let d = `M${p(pts[0])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], c = pts[i], b = pts[i + 1];
    const rr = Math.min(r, dist(a, c) / 2, dist(c, b) / 2);
    const inP = { x: c.x + ((a.x - c.x) / dist(a, c)) * rr, y: c.y + ((a.y - c.y) / dist(a, c)) * rr };
    const outP = { x: c.x + ((b.x - c.x) / dist(c, b)) * rr, y: c.y + ((b.y - c.y) / dist(c, b)) * rr };
    d += ` L${p(inP)} Q${p(c)} ${p(outP)}`;
  }
  return d + ` L${p(pts[pts.length - 1])}`;
}

export function cubicPath(s: Pt, c1: Pt, c2: Pt, e: Pt): string {
  return `M${p(s)} C${p(c1)} ${p(c2)} ${p(e)}`;
}

export function loopArc(from: Box, to: Box, direction: 'RIGHT' | 'DOWN') {
  return boxArc(from, to, direction === 'RIGHT' ? 'top' : 'right');
}

/** Arc between two boxes that leaves and enters through the same side of each and bulges out past both;
 *  `extra` pushes the bulge further out. */
export function boxArc(from: Box, to: Box, side: 'top' | 'bottom' | 'left' | 'right', extra = 0) {
  if (side === 'top' || side === 'bottom') {
    const lift = 48 + extra + Math.abs(from.x + from.w / 2 - (to.x + to.w / 2)) * 0.15;
    const top = side === 'top';
    const s = { x: from.x + from.w / 2, y: top ? from.y : from.y + from.h };
    const e = { x: to.x + to.w / 2, y: top ? to.y : to.y + to.h };
    const v = top ? Math.min(s.y, e.y) - lift : Math.max(s.y, e.y) + lift;
    return { s, c1: { x: s.x, y: v }, c2: { x: e.x, y: v }, e };
  }
  const push = 48 + extra + Math.abs(from.y + from.h / 2 - (to.y + to.h / 2)) * 0.15;
  const right = side === 'right';
  const s = { x: right ? from.x + from.w : from.x, y: from.y + from.h / 2 };
  const e = { x: right ? to.x + to.w : to.x, y: to.y + to.h / 2 };
  const u = right ? Math.max(s.x, e.x) + push : Math.min(s.x, e.x) - push;
  return { s, c1: { x: u, y: s.y }, c2: { x: u, y: e.y }, e };
}

export function borderPoint(box: Box, toward: Pt): Pt {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const dx = toward.x - cx, dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : (box.w / 2) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (box.h / 2) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

export function polylineMid(pts: Pt[]): Pt {
  const lens = pts.slice(1).map((q, i) => dist(pts[i], q));
  let half = lens.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lens.length; i++) {
    if (half <= lens[i]) { const t = lens[i] === 0 ? 0 : half / lens[i]; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }; }
    half -= lens[i];
  }
  return pts[pts.length - 1];
}

export function offsetPolyline(pts: Pt[], d: number): Pt[] {
  const a = pts[0], b = pts[1];
  const len = dist(a, b) || 1;
  const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  return pts.map(q => ({ x: q.x + nx * d + 0, y: q.y + ny * d + 0 }));
}

/** Offset a polyline sideways by d (positive = left of travel in screen coords, i.e. normal (-dy, dx)),
 *  using miter joins so every segment, not just the first, moves by exactly d. */
export function offsetPath(pts: Pt[], d: number): Pt[] {
  const q = pts.filter((v, i) => i === 0 || v.x !== pts[i - 1].x || v.y !== pts[i - 1].y);
  if (q.length < 2) return pts.map(v => ({ ...v }));
  const norms = q.slice(1).map((b, i) => { const a = q[i], len = dist(a, b) || 1; return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }; });
  return q.map((v, i) => {
    const n1 = norms[Math.max(0, i - 1)], n2 = norms[Math.min(norms.length - 1, i)];
    const dot = n1.x * n2.x + n1.y * n2.y;
    if (dot < -0.9) return { x: v.x + n1.x * d, y: v.y + n1.y * d };
    const k = d / (1 + dot);
    return { x: v.x + (n1.x + n2.x) * k, y: v.y + (n1.y + n2.y) * k };
  });
}
