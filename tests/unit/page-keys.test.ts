import { describe, it, expect } from 'vitest';
import { pickRandom } from '../../src/components/pattern/page-keys';

describe('pickRandom', () => {
  const slugs = ['a', 'b', 'c'];
  it('never returns the current slug, for any random value', () => {
    for (const r of [0, 0.34, 0.5, 0.99, 0.999999]) expect(pickRandom(slugs, 'b', () => r)).not.toBe('b');
  });
  it('maps the random value across the remaining slugs', () => {
    expect(pickRandom(slugs, 'b', () => 0)).toBe('a');
    expect(pickRandom(slugs, 'b', () => 0.99)).toBe('c');
  });
  it('returns undefined when there is nothing else', () => {
    expect(pickRandom(['a'], 'a')).toBeUndefined();
  });
});
