import { describe, it, expect } from 'vitest';
import { variantFromHash } from '../../src/components/pattern/variant-tabs';

describe('variantFromHash', () => {
  const ids = ['standard', 'self-critique', 'tool-checked'];
  it('reads #variant-<id>', () => expect(variantFromHash('#variant-tool-checked', ids)).toBe('tool-checked'));
  it('ignores unknown ids and other hashes', () => {
    expect(variantFromHash('#variant-nope', ids)).toBeUndefined();
    expect(variantFromHash('#main', ids)).toBeUndefined();
    expect(variantFromHash('', ids)).toBeUndefined();
  });
  it('returns undefined for a malformed %-escape instead of throwing', () => expect(variantFromHash('#variant-%E0', ids)).toBeUndefined());
});
