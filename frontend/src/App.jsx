import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { connectTTSSocket, speakCritique, analyzeDiagram, clearSession } from './api.js';
import { CritiquePanel } from './components/CritiquePanel.jsx';
import { MermaidView, extractChangedNodes } from './components/MermaidView.jsx';
import { useWebSocket } from './hooks/useWebSocket.js';
import './index.css';

const SESSION_ID = uuidv4();
const DRAWIO_URL = 'https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1&dark=1&ui=dark';

const DEFAULT_MERMAID = `graph TD
    A["Your Architecture"] --> B["Will Be Judged"]
    style A fill:#1a1a1a,stroke:#333,color:#ede8df
    style B fill:#1a1a1a,stroke:#333,color:#ede8df`;

/* ── Scanline overlay ── */
function Scanlines() {
  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999,
      background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
    }}>
      <div style={{
        position: 'absolute', width: '100%', height: '60px',
        background: 'linear-gradient(transparent, rgba(230,57,70,0.015), transparent)',
        animation: 'scanline-move 6s linear infinite',
      }}/>
    </div>
  );
}

/* ── Glitch logo ── */
function GlitchLogo() {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ fontFamily: 'var(--display)', fontSize: 24, color: 'var(--red)', letterSpacing: '0.06em', textShadow: '0 0 30px var(--red-glow)' }}>
        ARCH-ENEMY
      </span>
      <span style={{
        position: 'absolute', inset: 0,
        fontFamily: 'var(--display)', fontSize: 24, color: 'cyan',
        letterSpacing: '0.06em', opacity: 0.4,
        animation: 'glitch-1 6s infinite',
        pointerEvents: 'none',
      }}>ARCH-ENEMY</span>
      <span style={{
        position: 'absolute', inset: 0,
        fontFamily: 'var(--display)', fontSize: 24, color: 'var(--amber)',
        letterSpacing: '0.06em', opacity: 0.3,
        animation: 'glitch-2 6s infinite 1s',
        pointerEvents: 'none',
      }}>ARCH-ENEMY</span>
    </div>
  );
}

export default function App() {
  const [mermaidCode, setMermaidCode] = useState(DEFAULT_MERMAID);
  const [critique, setCritique] = useState('');
  const [severity, setSeverity] = useState('warning');
  const [changeSummary, setChangeSummary] = useState('');
  const [visionLabels, setVisionLabels] = useState([]);
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [status, setStatus] = useState('IDLE');
  const clearHighlightTimer = useRef(null);
  const iframeRef = useRef(null);

  useEffect(() => { connectTTSSocket(); }, []);

  useEffect(() => {
    const handleMessage = async (event) => {
      if (typeof event.data !== 'string') return;
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.event === 'init') {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ action: 'load', autosave: 1, xml: '' }), '*'
        );
      }

      if (msg.event === 'autosave' || msg.event === 'save') {
        const xml = msg.xml;
        if (!xml) return;
        setIsAnalyzing(true);
        setStatus('ANALYZING');
        try {
          const result = await analyzeDiagram(SESSION_ID, xml, null);
          if (result.has_changes) {
            setMermaidCode(result.mermaid || DEFAULT_MERMAID);
            setCritique(result.critique || '');
            setSeverity(result.severity || 'warning');
            setChangeSummary(result.change_summary || '');
            setVisionLabels(result.vision_labels || []);
            setHighlightedNodes(extractChangedNodes(result.change_summary));
            setStatus('JUDGING');
            if (result.critique) {
              speakCritique(result.critique);
              setIsPlaying(true);
              clearTimeout(clearHighlightTimer.current);
              clearHighlightTimer.current = setTimeout(() => {
                setHighlightedNodes(new Set());
                setIsPlaying(false);
                setStatus('IDLE');
              }, 8000);
            }
          } else {
            setStatus('IDLE');
          }
        } catch (e) {
          console.error('[ArchRival] analyze error', e);
          setStatus('ERROR');
        } finally {
          setIsAnalyzing(false);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleReset = async () => {
    await clearSession(SESSION_ID);
    setMermaidCode(DEFAULT_MERMAID);
    setCritique(''); setSeverity('warning'); setChangeSummary('');
    setVisionLabels([]); setHighlightedNodes(new Set());
    setIsPlaying(false); setStatus('IDLE');
  };

  const statusColor = status === 'JUDGING' ? 'var(--red)' : status === 'ANALYZING' ? 'var(--amber)' : status === 'ERROR' ? 'var(--red)' : 'var(--text-dim)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--black)', overflow: 'hidden' }}>
      <Scanlines/>

      {/* ── Top bar ── */}
      <div style={{
        height: 52, background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', flexShrink: 0, position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <GlitchLogo/>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }}/>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
            YOUR ARCHITECTURE. REVIEWED. JUDGED. ROASTED.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Status */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 3,
            border: `1px solid ${statusColor}`,
            background: status !== 'IDLE' ? `color-mix(in srgb, ${statusColor} 10%, transparent)` : 'transparent',
            transition: 'all 0.3s',
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: statusColor,
              boxShadow: status !== 'IDLE' ? `0 0 6px ${statusColor}` : 'none',
              animation: status !== 'IDLE' ? 'blink 0.8s infinite' : 'none',
            }}/>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: statusColor, letterSpacing: '0.12em' }}>
              {status}
            </span>
          </div>

          <button onClick={handleReset} style={{
            fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.12em',
            padding: '5px 12px', borderRadius: 3,
            border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
            transition: 'all 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = 'var(--red)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            RESET SESSION
          </button>
        </div>
      </div>

      {/* ── Main 3-panel layout ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 340px 300px', overflow: 'hidden' }}>

        {/* Panel 1 — draw.io */}
        <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          <div style={{
            padding: '7px 14px', borderBottom: '1px solid var(--border)',
            fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.12em',
            color: 'var(--text-dim)', background: 'var(--surface-2)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: 'var(--amber)', fontSize: 11 }}>◈</span>
            DIAGRAM EDITOR — SAVE TO TRIGGER REVIEW
          </div>
          <iframe
            ref={iframeRef}
            src={DRAWIO_URL}
            style={{ flex: 1, border: 'none', background: 'var(--black)' }}
            title="draw.io diagram editor"
          />
          {isAnalyzing && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(6,6,6,0.75)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(3px)',
              animation: 'fade-in 0.2s ease',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--amber)', letterSpacing: '0.1em', animation: 'blink 0.8s infinite' }}>
                  ANALYZING
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginTop: 6 }}>
                  CONSULTING THE ENEMY...
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Panel 2 — Mermaid */}
        <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)' }}>
          <div style={{
            padding: '7px 14px', borderBottom: '1px solid var(--border)',
            fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.12em',
            color: 'var(--text-dim)', background: 'var(--surface-2)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: 'var(--green)', fontSize: 11 }}>◈</span>
            PARSED ARCHITECTURE
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <MermaidView mermaidCode={mermaidCode} highlightedNodes={highlightedNodes}/>
          </div>
        </div>

        {/* Panel 3 — Critique */}
        <CritiquePanel
          critique={critique}
          severity={severity}
          changeSummary={changeSummary}
          visionLabels={visionLabels}
          isPlaying={isPlaying}
        />
      </div>

      {/* ── Bottom bar ── */}
      <div style={{
        height: 26, background: 'var(--surface-2)',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 24, flexShrink: 0,
      }}>
        {[
          ['SESSION', SESSION_ID.slice(0,8).toUpperCase()],
          ['BACKEND', 'localhost:8000'],
          ['LLM', 'SNOWFLAKE CORTEX'],
          ['VOICE', 'ELEVENLABS'],
          ['VISION', 'GOOGLE CLOUD'],
        ].map(([k,v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>{k}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--border-bright)', letterSpacing: '0.06em' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}