import { describe, it, expect } from 'vitest';
import { issueUrl, newPatternUrl, correctionUrl, contributingUrl } from '../../src/lib/contribute';
import { author } from '../../src/lib/author';

describe('contribute urls', () => {
  it('builds an issue url with encoded params', () => {
    const u = new URL(issueUrl('correction.yml', 'A & B: c/d', 'x y\nz', 'correction'));
    expect(u.origin + u.pathname).toBe(`${author.repo}/issues/new`);
    expect(u.searchParams.get('template')).toBe('correction.yml');
    expect(u.searchParams.get('title')).toBe('A & B: c/d');
    expect(u.searchParams.get('body')).toBe('x y\nz');
    expect(u.searchParams.get('labels')).toBe('correction');
  });
  it('omits optional params and never emits raw spaces or +', () => {
    expect(newPatternUrl()).toBe(`${author.repo}/issues/new?template=new-pattern.yml`);
    expect(correctionUrl('evaluator-optimizer', 'Evaluator-Optimizer & Co')).not.toMatch(/[ +]/);
  });
  it('correctionUrl carries the name and pattern url', () => {
    const u = new URL(correctionUrl('agentic-rag', 'Agentic RAG'));
    expect(u.searchParams.get('template')).toBe('correction.yml');
    expect(u.searchParams.get('title')).toBe('Correction: Agentic RAG');
    expect(u.searchParams.get('body')).toContain('/patterns/agentic-rag/');
    expect(correctionUrl('agentic-rag', 'Agentic RAG')).toContain('title=Correction%3A%20Agentic%20RAG');
  });
  it('correctionUrl without a pattern is the bare form', () => {
    expect(correctionUrl()).toBe(`${author.repo}/issues/new?template=correction.yml`);
  });
  it('contributingUrl points at CONTRIBUTING.md', () => {
    expect(contributingUrl()).toBe(`${author.repo}/blob/main/CONTRIBUTING.md`);
  });
});
