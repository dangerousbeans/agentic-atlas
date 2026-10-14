import type { Family, Pattern } from './schema';

export interface Star { slug: string; name: string; family: string; color: string; x: number; y: number; z: number }
export interface ConstellationData { stars: Star[]; links: [string, string][]; families: { slug: string; name: string; color: string; x: number; y: number; z: number }[] }

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function buildConstellation(families: Family[], patternsOf: (familySlug: string) => Pattern[]): ConstellationData {
  const stars: Star[] = []; const links: [string, string][] = [];
  for (const f of families) {
    const rand = rng(hash(f.slug));
    const ps = patternsOf(f.slug);
    ps.forEach((p, i) => {
      stars.push({ slug: p.slug, name: p.name, family: f.slug, color: f.accent,
        x: r3(f.constellation.x + (rand() - 0.5) * 2.4), y: r3(f.constellation.y + (rand() - 0.5) * 1.8), z: r3(f.constellation.z + (rand() - 0.5) * 2.4) });
      if (i > 0) links.push([ps[i - 1].slug, p.slug]);
    });
  }
  return { stars, links, families: families.map(f => ({ slug: f.slug, name: f.name, color: f.accent, ...f.constellation })) };
}

export function project(p: { x: number; y: number; z: number }, yaw: number, pitch: number) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = p.x * cy + p.z * sy, z1 = -p.x * sy + p.z * cy;
  const y2 = p.y * cp - z1 * sp, z2 = p.y * sp + z1 * cp;
  return { x: x1 + 0, y: y2 + 0, depth: z2 + 0 };
}
