import { describe, it, expect } from 'vitest';
import { buildConstellation, project } from '../../src/lib/constellation';
import type { Family, Pattern } from '../../src/lib/schema';

const fam = (slug: string, x: number, order: string[]) => ({ slug, name: slug, rank: 1, accent: '#F5B14C', description: 'd', order, constellation: { x, y: 0, z: 0 } }) as Family;
const pat = (slug: string) => ({ slug, name: slug.toUpperCase() }) as Pattern;
const fams = [fam('a', 0, ['p1', 'p2', 'p3']), fam('b', 10, ['q1'])];
const of = (s: string) => fams.find(f => f.slug === s)!.order.map(pat);

describe('buildConstellation', () => {
  it('creates one star per pattern near its family center, deterministically', () => {
    const c1 = buildConstellation(fams, of), c2 = buildConstellation(fams, of);
    expect(c1.stars).toHaveLength(4);
    expect(c1).toEqual(c2);
    for (const s of c1.stars.filter(s => s.family === 'a')) { expect(Math.abs(s.x)).toBeLessThanOrEqual(1.3); }
  });
  it('links consecutive patterns within a family', () => {
    expect(buildConstellation(fams, of).links).toEqual([['p1', 'p2'], ['p2', 'p3']]);
  });
});

describe('project', () => {
  it('identity rotation keeps x,y', () => expect(project({ x: 1, y: 2, z: 3 }, 0, 0)).toEqual({ x: 1, y: 2, depth: 3 }));
  it('yaw of 90° maps z to x', () => { const r = project({ x: 0, y: 0, z: 1 }, Math.PI / 2, 0); expect(r.x).toBeCloseTo(1); });
});
