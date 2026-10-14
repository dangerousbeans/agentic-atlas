// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { pickRandom, shouldIgnore } from '../../src/components/pattern/page-keys';

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

describe('shouldIgnore', () => {
  const fire = (html: string, target: string | null, init: KeyboardEventInit = {}, opts: { defaultPrevented?: boolean } = {}) => {
    document.body.innerHTML = html;
    const el = target ? document.querySelector(target)! : document.body;
    const e = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true, ...init });
    el.addEventListener('keydown', ev => { if (opts.defaultPrevented) ev.preventDefault(); }, { once: true });
    el.dispatchEvent(e);
    return shouldIgnore(e, document);
  };
  const page = '<main><button id="b">b</button></main>';
  const cases: [string, string, string | null][] = [
    ['input', '<input id="t">', '#t'],
    ['textarea', '<textarea id="t"></textarea>', '#t'],
    ['select', '<select id="t"><option>a</option></select>', '#t'],
    ['contenteditable', '<div contenteditable="true"><span id="t">x</span></div>', '#t'],
    ['diagram scenario tabs', '<div class="fp-tabs"><button id="t">s</button></div>', '#t'],
    ['diagram step list', '<ol class="fp-captions"><li><button id="t">s</button></li></ol>', '#t'],
    ['code panel tablist', '<div role="tablist"><button id="t" role="tab">p</button></div>', '#t'],
  ];
  for (const [name, html, t] of cases) it(`ignores keys inside ${name}`, () => expect(fire(html, t)).toBe(true));
  it('ignores Esc inside the step list too (the diagram owns it)', () => {
    expect(fire('<ol class="fp-captions"><li><button id="t">s</button></li></ol>', '#t', { key: 'Escape' })).toBe(true);
  });
  for (const mod of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey'] as const)
    it(`ignores ${mod}`, () => expect(fire(page, '#b', { [mod]: true })).toBe(true));
  it('ignores while a dialog is open', () => expect(fire(`${page}<dialog open></dialog>`, '#b')).toBe(true));
  it('ignores already-handled events', () => expect(fire(page, '#b', {}, { defaultPrevented: true })).toBe(true));
  it('does not ignore a plain key on the page', () => {
    expect(fire(page, '#b')).toBe(false);
    expect(fire(page, null)).toBe(false);
  });
  it('does not ignore inside a closed dialog', () => expect(fire(`${page}<dialog></dialog>`, '#b')).toBe(false));
});
