import { describe, it, expect } from 'vitest';
import { joinBase } from '../../src/lib/url';

describe('joinBase', () => {
  it('joins root base', () => expect(joinBase('/', '/patterns/react')).toBe('/patterns/react'));
  it('joins sub-path base without double slash', () => expect(joinBase('/atlas/', '/patterns/react')).toBe('/atlas/patterns/react'));
  it('adds missing slashes', () => expect(joinBase('/atlas', 'about')).toBe('/atlas/about'));
  it('slashless base with relative pattern path', () => expect(joinBase('/atlas', 'patterns/x/')).toBe('/atlas/patterns/x/'));
  it('root path',() => expect(joinBase('/atlas/', '/')).toBe('/atlas/'));
});
