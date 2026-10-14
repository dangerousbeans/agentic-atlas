import { describe, it, expect } from 'vitest';
import { roundedPath, loopArc, borderPoint, polylineMid, offsetPolyline } from '../../src/lib/diagram/geometry';

describe('geometry', () => {
  it('straight path has no curve', () => expect(roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe('M0,0 L10,0'));
  it('rounds a corner with a quadratic', () => expect(roundedPath([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }], 5)).toBe('M0,0 L15,0 Q20,0 20,5 L20,20'));
  it('drops consecutive duplicate points instead of producing NaN', () => {
    const d = roundedPath([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }], 5);
    expect(d).toBe('M0,0 L15,0 Q20,0 20,5 L20,20');
    expect(d).not.toMatch(/NaN/);
  });
  it('clamps radius to half the shorter segment', () => expect(roundedPath([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 20 }], 10)).toBe('M0,0 L2,0 Q4,0 4,2 L4,20'));
  it('loop arc RIGHT leaves from the top centers and bulges upward', () => {
    const a = loopArc({ x: 200, y: 100, w: 100, h: 60 }, { x: 0, y: 100, w: 100, h: 60 }, 'RIGHT');
    expect(a.s).toEqual({ x: 250, y: 100 });
    expect(a.e).toEqual({ x: 50, y: 100 });
    expect(a.c1.y).toBeLessThan(100);
  });
  it('loop arc DOWN leaves from the right centers and bulges right', () => {
    const a = loopArc({ x: 0, y: 200, w: 100, h: 60 }, { x: 0, y: 0, w: 100, h: 60 }, 'DOWN');
    expect(a.s).toEqual({ x: 100, y: 230 });
    expect(a.c1.x).toBeGreaterThan(100);
  });
  it('borderPoint exits through the right side', () => expect(borderPoint({ x: 0, y: 0, w: 100, h: 50 }, { x: 300, y: 25 })).toEqual({ x: 100, y: 25 }));
  it('polylineMid finds the length midpoint', () => expect(polylineMid([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toEqual({ x: 10, y: 0 }));
  it('offsetPolyline shifts perpendicular to a horizontal first segment', () => expect(offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 5)).toEqual([{ x: 0, y: 5 }, { x: 10, y: 5 }]));
});
