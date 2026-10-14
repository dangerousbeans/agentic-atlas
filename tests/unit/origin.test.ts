import { describe, it, expect } from 'vitest';
import { shortBy, originShort, originLine, shortOrg, originCitation } from '../../src/lib/origin';
import type { Origin } from '../../src/lib/schema';

const yao: Origin = { by: 'Shunyu Yao et al.', org: 'Princeton University, Google Research', year: 2022, url: 'https://arxiv.org/abs/2210.03629', kind: 'introduced' };
const anthropic: Origin = { by: 'Erik Schluntz and Barry Zhang', org: 'Anthropic', year: 2024, url: 'https://www.anthropic.com/engineering/building-effective-agents', kind: 'popularized' };

describe('origin', () => {
  it('shortens authors', () => {
    expect(shortBy('Shunyu Yao et al.')).toBe('Yao et al.');
    expect(shortBy('Maciej Besta, Nils Blach et al.')).toBe('Besta et al.');
    expect(shortBy('Luyu Gao, Aman Madaan, Shuyan Zhou et al.')).toBe('Gao et al.');
    expect(shortBy('Lingjiao Chen, Matei Zaharia, James Zou')).toBe('Chen et al.');
    expect(shortBy('Aditi Singh et al. (survey)')).toBe('Singh et al.');
    expect(shortBy('Erik Schluntz and Barry Zhang')).toBe('Schluntz & Zhang');
    expect(shortBy('LangChain team')).toBe('LangChain team');
    expect(shortBy('Anthropic')).toBe('Anthropic');
  });
  it('gives the tile short form', () => {
    expect(originShort(yao)).toBe('Yao et al. 2022');
    expect(originShort(anthropic)).toBe('Schluntz & Zhang 2024');
    expect(originShort({ ...yao, uncertain: true, note: 'The term predates any paper.' })).toBe('No single inventor');
  });
  it('builds the header line by kind', () => {
    expect(originLine(yao)).toMatchObject({ lead: 'Introduced by', by: 'Shunyu Yao et al.', year: 2022, org: 'Princeton University & Google Research' });
    expect(originLine(anthropic)).toMatchObject({ lead: 'Popularized by', org: 'Anthropic' });
    expect(originLine({ ...yao, uncertain: true, note: 'Many teams used it first.' })).toEqual({ lead: 'No single inventor', url: yao.url, note: 'Many teams used it first.' });
  });
  it('keeps long affiliation lists to two', () => expect(shortOrg('A, B, C, D')).toBe('A, B and others'));
  it('cites a CreativeWork with author and url', () => {
    expect(originCitation(yao)).toEqual({ '@type': 'CreativeWork', url: yao.url, datePublished: '2022', author: [{ '@type': 'Person', name: 'Shunyu Yao' }, { '@type': 'Organization', name: 'Princeton University, Google Research' }] });
    expect(originCitation({ by: 'LangChain', year: 2024, url: 'https://example.com', kind: 'popularized' }).author).toEqual([{ '@type': 'Organization', name: 'LangChain' }]);
    expect(originCitation({ by: 'LangChain team', year: 2024, url: 'https://example.com', kind: 'popularized' }).author).toEqual([{ '@type': 'Organization', name: 'LangChain team' }]);
    expect(originCitation({ by: 'Simon Willison', year: 2023, url: 'https://example.com', kind: 'introduced' }).author).toEqual([{ '@type': 'Person', name: 'Simon Willison' }]);
    expect(originCitation(anthropic).author).toEqual([{ '@type': 'Person', name: 'Erik Schluntz' }, { '@type': 'Person', name: 'Barry Zhang' }, { '@type': 'Organization', name: 'Anthropic' }]);
    expect(originCitation({ by: 'Maciej Besta, Nils Blach et al.', year: 2023, url: 'https://example.com', kind: 'introduced' }).author).toEqual([{ '@type': 'Person', name: 'Maciej Besta' }, { '@type': 'Person', name: 'Nils Blach' }]);
  });
});
