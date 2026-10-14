/**
 * Rebuild a Pagefind excerpt (an HTML string) as safe DOM: only `<mark>` survives, as a fresh
 * element holding plain text; every other element is flattened to its text. Parsing happens in an
 * inert `<template>`, so nothing in the string runs or loads, and no attributes are ever copied.
 */
export function excerptNodes(html: string, doc: Document = document): Node[] {
  const tpl = doc.createElement('template');
  tpl.innerHTML = html;
  const out: Node[] = [];
  const walk = (parent: Node) => {
    for (const n of Array.from(parent.childNodes)) {
      if (n.nodeType === 3) out.push(doc.createTextNode(n.textContent ?? ''));
      else if (n.nodeType === 1) {
        if ((n as Element).localName === 'mark') {
          const m = doc.createElement('mark');
          m.textContent = n.textContent ?? '';
          out.push(m);
        } else if (!['script', 'style', 'template'].includes((n as Element).localName)) walk(n);
      }
    }
  };
  walk(tpl.content);
  return out;
}
