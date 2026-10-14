// Code blocks scroll sideways: render them keyboard-focusable on the server so no-JS users can scroll them too.
const focusablePre = {
  name: 'focusable-pre',
  hooks: {
    postprocessRenderedBlock: ({ renderData }) => {
      const walk = node => {
        if (node.type === 'element' && node.tagName === 'pre') node.properties = { ...node.properties, tabindex: 0 };
        node.children?.forEach(walk);
      };
      walk(renderData.blockAst);
    },
  },
};

export default {
  plugins: [focusablePre],
  themes: ['github-dark-dimmed'],
  styleOverrides: {
    codeFontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
    codeBackground: '#1A1615',
    borderColor: '#3A302D',
    borderRadius: '0',
  },
};
