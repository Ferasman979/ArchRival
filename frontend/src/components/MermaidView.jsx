import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    darkMode: true,
    background: '#0f0f0f',
    primaryColor: '#1e1e1e',
    primaryTextColor: '#f0ece4',
    primaryBorderColor: '#3a3a3a',
    lineColor: '#3a3a3a',
    secondaryColor: '#161616',
    tertiaryColor: '#0f0f0f',
    fontSize: '13px',
  },
  flowchart: { curve: 'basis', padding: 20 },
});

export function extractChangedNodes(changeSummary = '') {
  const nodes = new Set();
  const addedMatch = changeSummary.match(/Added components?: ([^;]+)/);
  const connMatches = [...changeSummary.matchAll(/connection: (\S+)\s*→\s*(\S+)/g)];
  if (addedMatch) addedMatch[1].split(',').forEach(s => nodes.add(s.trim()));
  connMatches.forEach(m => { nodes.add(m[1]); nodes.add(m[2]); });
  return nodes;
}

export function MermaidView({ mermaidCode, highlightedNodes }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const idRef = useRef('arch-' + Math.random().toString(36).slice(2));

  useEffect(() => {
    if (!mermaidCode || !containerRef.current) return;
    setError(null);

    mermaid.render(idRef.current, mermaidCode)
      .then(({ svg }) => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = svg;

        const svgEl = containerRef.current.querySelector('svg');
        if (!svgEl) return;
        svgEl.style.width = '100%';
        svgEl.style.height = 'auto';
        svgEl.style.maxHeight = '100%';

        if (highlightedNodes?.size > 0) {
          svgEl.querySelectorAll('g.node, g.flowchart-label, .node').forEach(group => {
            const label = group.querySelector('text, span, p, .nodeLabel')?.textContent?.trim();
            if (label && highlightedNodes.has(label)) {
              group.classList.add('arch-enemy-highlight');
            }
          });
        }
        idRef.current = 'arch-' + Math.random().toString(36).slice(2);
      })
      .catch(err => {
        console.error('[MermaidView] render error', err);
        setError('Could not render diagram.');
      });
  }, [mermaidCode, highlightedNodes]);

  if (error) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 12,
      }}>
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-container"
      style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, overflow: 'auto',
      }}
    />
  );
}