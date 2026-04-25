/**
 * MermaidView.jsx — Renders Mermaid SVG and handles node highlighting.
 * Owned by: Fatima
 *
 * Props:
 *   code            {string}  — Mermaid graph syntax
 *   highlightedNodes {Set}    — Labels of nodes to highlight (red glow)
 *   onHighlightClear {fn}     — Called 3s after TTS done to clear highlights
 */

import { useEffect, useRef } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' })

export default function MermaidView({ code, highlightedNodes, onHighlightClear }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!code || !containerRef.current) return
    renderAndHighlight(code, highlightedNodes, containerRef.current, onHighlightClear)
  }, [code, highlightedNodes])

  return (
    <div className="mermaid-wrapper">
      <div className="mermaid-label">Live Diagram Preview</div>
      <div ref={containerRef} id="mermaid-container" className="mermaid-container" />
    </div>
  )
}

async function renderAndHighlight(code, highlightedNodes, container, onHighlightClear) {
  try {
    const id = `mermaid-${Date.now()}`
    const { svg } = await mermaid.render(id, code)
    container.innerHTML = svg

    if (!highlightedNodes || highlightedNodes.size === 0) return

    // Walk Mermaid SVG node groups and apply highlight class on label match
    const svgEl = container.querySelector('svg')
    if (!svgEl) return

    svgEl.querySelectorAll('g.node, g.flowchart-label').forEach((group) => {
      const label = group.querySelector('text, span, p, foreignObject')?.textContent?.trim()
      if (label && highlightedNodes.has(label)) {
        group.classList.add('arch-enemy-highlight')
      }
    })

    // Clear highlights 3s after TTS finishes (caller manages timing via onHighlightClear)
    if (onHighlightClear) {
      setTimeout(onHighlightClear, 3000)
    }
  } catch (err) {
    console.warn('Mermaid render error:', err)
    container.innerHTML = `<pre class="mermaid-error">${code}</pre>`
  }
}
