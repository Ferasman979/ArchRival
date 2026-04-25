import { useEffect, useRef, useState, useCallback } from 'react'
import { analyzeDiagram, connectTTSSocket, speakCritique } from './api'
import MermaidView from './components/MermaidView'
import CritiquePanel from './components/CritiquePanel'
import './App.css'

// draw.io embed URL — autosave=1 fires postMessage on every change
const DRAWIO_URL =
  'https://embed.diagrams.net/?embed=1&proto=json&spin=1&autosave=1&modified=unsavedChanges'

// Stable session ID for this browser tab
const SESSION_ID = crypto.randomUUID()

export default function App() {
  const iframeRef = useRef(null)
  const lastHashRef = useRef(null)
  const cooldownRef = useRef(false)
  const currentMermaidRef = useRef('')  // for ElevenLabs tool webhook

  const [diagramReady, setDiagramReady] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [mermaidCode, setMermaidCode] = useState('')
  const [critique, setCritique] = useState('')
  const [changeSummary, setChangeSummary] = useState('')
  const [severity, setSeverity] = useState('neutral')
  const [highlightedNodes, setHighlightedNodes] = useState(new Set())
  const [visionOverlap, setVisionOverlap] = useState(null)
  const [visionEnrichment, setVisionEnrichment] = useState('')

  // Connect TTS WebSocket on mount
  useEffect(() => {
    connectTTSSocket()
  }, [])

  // ─── draw.io postMessage handler ─────────────────────────────────────────
  const handleDrawioMessage = useCallback(async (event) => {
    if (!event.data || typeof event.data !== 'string') return
    let msg
    try { msg = JSON.parse(event.data) } catch { return }

    if (msg.event === 'init') {
      setDiagramReady(true)
      return
    }

    // autosave fires on every user edit; save fires on explicit Ctrl+S
    if ((msg.event === 'autosave' || msg.event === 'save') && msg.xml) {
      await handleXmlChange(msg.xml)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('message', handleDrawioMessage)
    return () => window.removeEventListener('message', handleDrawioMessage)
  }, [handleDrawioMessage])

  // ─── Change handler ────────────────────────────────────────────────────────
  const handleXmlChange = async (xml) => {
    if (cooldownRef.current || isAnalyzing) return

    // Client-side hash check — skip round-trip if content unchanged
    const hash = await digestSHA256(xml)
    if (hash === lastHashRef.current) return
    lastHashRef.current = hash

    setIsAnalyzing(true)
    cooldownRef.current = true

    try {
      // Capture iframe screenshot for GCP Vision secondary check
      const screenshotB64 = await captureIframeScreenshot()

      const result = await analyzeDiagram(SESSION_ID, xml, screenshotB64)

      if (result.has_changes && result.critique) {
        setMermaidCode(result.mermaid)
        setCritique(result.critique)
        setChangeSummary(result.change_summary)
        setSeverity(deriveSeverity(result.critique))
        setHighlightedNodes(extractChangedNodes(result.change_summary))
        setVisionOverlap(result.vision_overlap_score)
        setVisionEnrichment(result.vision_enrichment)
        currentMermaidRef.current = result.mermaid
        speakCritique(result.critique)
      } else if (result.mermaid) {
        setMermaidCode(result.mermaid)
        currentMermaidRef.current = result.mermaid
      }
    } catch (err) {
      console.error('Analysis failed:', err)
    } finally {
      setIsAnalyzing(false)
      // 5-second cooldown enforced client-side (server also enforces this)
      setTimeout(() => { cooldownRef.current = false }, 5000)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-container">

      {/* ── Left panel: draw.io canvas ── */}
      <div className="panel panel-left">
        <div className="panel-header">
          <span className="panel-title">⬡ Architecture Canvas</span>
          <div className="panel-badges">
            {isAnalyzing && <span className="badge badge-analyzing">Analyzing…</span>}
            {!diagramReady && <span className="badge badge-loading">Loading editor…</span>}
          </div>
        </div>
        <iframe
          ref={iframeRef}
          id="drawio-iframe"
          src={DRAWIO_URL}
          className="drawio-frame"
          frameBorder="0"
          title="draw.io Architecture Editor"
          allowFullScreen
        />
      </div>

      {/* ── Right panel: AI critique ── */}
      <div className="panel panel-right">
        <div className="panel-header">
          <span className="panel-title">⚡ Arch-Enemy</span>
          {visionOverlap !== null && (
            <span
              className={`badge ${visionOverlap >= 0.6 ? 'badge-good' : 'badge-warn'}`}
              title="GCP Vision label overlap score"
            >
              Vision {Math.round(visionOverlap * 100)}%
            </span>
          )}
        </div>

        <CritiquePanel
          critique={critique}
          changeSummary={changeSummary}
          severity={severity}
          visionEnrichment={visionEnrichment}
        />

        <MermaidView
          code={mermaidCode}
          highlightedNodes={highlightedNodes}
          onHighlightClear={() => setHighlightedNodes(new Set())}
        />
      </div>
    </div>
  )
}

// ─── Utilities ─────────────────────────────────────────────────────────────

async function digestSHA256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function captureIframeScreenshot() {
  try {
    const { default: html2canvas } = await import('html2canvas')
    const iframe = document.getElementById('drawio-iframe')
    const canvas = await html2canvas(iframe, { useCORS: true, allowTaint: false, logging: false })
    return canvas.toDataURL('image/png').split(',')[1]
  } catch {
    return null
  }
}

function deriveSeverity(critique = '') {
  const t = critique.toLowerCase()
  if (t.includes('cursed') || t.includes('disaster') || t.includes('single point')) return 'critical'
  if (t.includes('impressed') || t.includes('finally') || t.includes('good')) return 'good'
  return 'warning'
}

function extractChangedNodes(changeSummary = '') {
  const nodes = new Set()
  const addedMatch = changeSummary.match(/Added components?: ([^;]+)/i)
  const connMatches = [...changeSummary.matchAll(/connection: (\S+)\s*[→>]\s*(\S+)/gi)]
  if (addedMatch) addedMatch[1].split(',').forEach(s => nodes.add(s.trim()))
  connMatches.forEach(m => { nodes.add(m[1]); nodes.add(m[2]) })
  return nodes
}
