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
  if (direction === 'RIGHT') {
    const s = { x: from.x + from.w / 2, y: from.y };
    const e = { x: to.x + to.w / 2, y: to.y };
    const lift = 48 + Math.abs(s.x - e.x) * 0.15;
    const top = Math.min(s.y, e.y) - lift;
    return { s, c1: { x: s.x, y: top }, c2: { x: e.x, y: top }, e };
  }
  const s = { x: from.x + from.w, y: from.y + from.h / 2 };
  const e = { x: to.x + to.w, y: to.y + to.h / 2 };
  const push = 48 + Math.abs(s.y - e.y) * 0.15;
  const right = Math.max(s.x, e.x) + push;
  return { s, c1: { x: right, y: s.y }, c2: { x: right, y: e.y }, e };
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
