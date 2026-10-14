import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { newPatternUrl, correctionUrl, CORRECTION_URL_FIELD } from '../../src/lib/contribute';

const load = (f: string) => parse(readFileSync(`.github/ISSUE_TEMPLATE/${f}`, 'utf8'));
type Item = { type: string; id?: string; attributes?: { label?: string; options?: string[] }; validations?: { required?: boolean } };
const TYPES = ['input', 'textarea', 'dropdown', 'markdown', 'checkboxes'];

for (const f of ['new-pattern.yml', 'correction.yml']) {
  describe(`issue form ${f}`, () => {
    const doc = load(f);
    it('has name, description and body', () => {
      expect(typeof doc.name).toBe('string');
      expect(typeof doc.description).toBe('string');
      expect(Array.isArray(doc.body) && doc.body.length > 0).toBe(true);
    });
    it('has a label and unique field ids', () => {
      expect(doc.labels.length).toBeGreaterThan(0);
      const ids = doc.body.map((b: Item) => b.id).filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);
    });
    it('every body item has a valid type, label and boolean required', () => {
      for (const b of doc.body as Item[]) {
        expect(TYPES).toContain(b.type);
        expect(typeof b.attributes?.label).toBe('string');
        expect(typeof b.validations?.required).toBe('boolean');
      }
    });
  });
}

describe('forms match the code', () => {
  it('new-pattern family options equal the families on disk', () => {
    const dir = 'src/content/families';
    const names = readdirSync(dir).filter(n => n.endsWith('.yaml')).map(n => parse(readFileSync(`${dir}/${n}`, 'utf8')).name as string);
    const dd = (load('new-pattern.yml').body as Item[]).find(b => b.type === 'dropdown')!;
    expect([...dd.attributes!.options!].sort()).toEqual([...names].sort());
  });
  it('template filenames used by contribute.ts exist', () => {
    for (const u of [newPatternUrl(), correctionUrl('x', 'X')]) {
      const t = new URL(u).searchParams.get('template')!;
      expect(existsSync(`.github/ISSUE_TEMPLATE/${t}`)).toBe(true);
    }
  });
  it('correction form has the field correctionUrl prefills', () => {
    const ids = (load('correction.yml').body as Item[]).map(b => b.id);
    for (const k of new URL(correctionUrl('x', 'X')).searchParams.keys()) {
      if (k !== 'template' && k !== 'title') expect(ids).toContain(k);
    }
    expect(ids).toContain(CORRECTION_URL_FIELD);
  });
});
