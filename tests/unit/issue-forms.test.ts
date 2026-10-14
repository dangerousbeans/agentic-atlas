import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

for (const f of ['new-pattern.yml', 'correction.yml']) {
  describe(`issue form ${f}`, () => {
    const doc = parse(readFileSync(`.github/ISSUE_TEMPLATE/${f}`, 'utf8'));
    it('has name, description and body', () => {
      expect(typeof doc.name).toBe('string');
      expect(typeof doc.description).toBe('string');
      expect(Array.isArray(doc.body) && doc.body.length > 0).toBe(true);
    });
    it('has a label and unique field ids', () => {
      expect(doc.labels.length).toBeGreaterThan(0);
      const ids = doc.body.map((b: { id?: string }) => b.id).filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
}
