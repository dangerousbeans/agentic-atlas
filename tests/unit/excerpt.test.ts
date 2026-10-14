// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { excerptNodes } from '../../src/lib/excerpt';

const render = (html: string) => {
  const host = document.createElement('span');
  host.replaceChildren(...excerptNodes(html));
  return host;
};

describe('excerptNodes', () => {
  it('keeps <mark> highlights and plain text', () => {
    const host = render('A <mark>router</mark> sends each <mark>request</mark> on.');
    expect(host.innerHTML).toBe('A <mark>router</mark> sends each <mark>request</mark> on.');
  });

  it('keeps escaped markup as literal text', () => {
    const host = render('uses &lt;task&gt; tags &amp; more');
    expect(host.textContent).toBe('uses <task> tags & more');
    expect(host.children).toHaveLength(0);
  });

  it('flattens other elements to text and drops attributes and scripts', () => {
    const host = render('<b onclick="x()">bold</b> <img src=x onerror="alert(1)"><a href="javascript:alert(1)">link</a><mark class="evil" onmouseover="y()">hit</mark><script>alert(1)</script>');
    expect(host.innerHTML).toBe('bold link<mark>hit</mark>');
    expect(host.querySelectorAll('[onclick], [onerror], [onmouseover], img, a, script, b')).toHaveLength(0);
  });

  it('flattens markup nested inside a mark', () => {
    expect(render('<mark><i>deep</i> hit</mark>').innerHTML).toBe('<mark>deep hit</mark>');
  });
});
