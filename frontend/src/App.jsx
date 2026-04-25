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
    A["Your Architecture"] --> B["Will Appear Here"]
    style A fill:#1e1e1e,stroke:#3a3a3a,color:#f0ece4
    style B fill:#1e1e1e,stroke:#3a3a3a,color:#f0ece4`;

export default function App() {
  const [mermaidCode, setMermaidCode] = useState(DEFAULT_MERMAID);
  const [critique, setCritique] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [visionLabels, setVisionLabels] = useState([]);
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [status, setStatus] = useState('IDLE');
  const clearHighlightTimer = useRef(null);
  const iframeRef = useRef(null);

  // Wire TTS socket on mount
  useEffect(() => {
    connectTTSSocket();
  }, []);

  // Handle messages from draw.io iframe
  useEffect(() => {
    const handleMessage = async (event) => {
      if (typeof event.data !== 'string') return;
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.event === 'init') {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ action: 'load', autosave: 1, xml: '' }),
          '*'
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
    setCritique('');
    setChangeSummary('');
    setVisionLabels([]);
    setHighlightedNodes(new Set());
    setIsPlaying(false);
    setStatus('IDLE');
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', width: '100vw',
      background: 'var(--black)', overflow: 'hidden',
    }}>

      {/* ── Top bar ── */}
      <div style={{
        height: 48,
        background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        flexShrink: 0,
        position: 'relative',
      }}>
        {/* Scan line effect */}
        <div style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          pointerEvents: 'none', opacity: 0.03,
        }}>
          <div style={{
            position: 'absolute', width: '100%', height: 1,
            background: 'var(--text-primary)',
            animation: 'scan-line 4s linear infinite',
          }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontFamily: 'var(--display)',
            fontSize: 22, letterSpacing: '0.08em',
            color: 'var(--red)',
            textShadow: '0 0 20px var(--red-glow)',
          }}>
            ARCH-RIVAL
          </span>
          <div style={{
            height: 16, width: 1,
            background: 'var(--border)',
          }} />
          <span style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            color: 'var(--text-dim)',
            letterSpacing: '0.1em',
          }}>
            YOUR ARCHITECTURE REVIEWED BY SOMEONE WHO CARES TOO MUCH
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Status pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px',
            borderRadius: 4,
            border: `1px solid ${status === 'JUDGING' ? 'var(--red)' : status === 'ANALYZING' ? 'var(--amber)' : 'var(--border)'}`,
            background: status === 'JUDGING' ? 'var(--red-dim)' : status === 'ANALYZING' ? 'var(--amber-dim)' : 'transparent',
            transition: 'all 0.3s',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: status === 'JUDGING' ? 'var(--red)' : status === 'ANALYZING' ? 'var(--amber)' : 'var(--text-dim)',
              animation: status !== 'IDLE' ? 'blink 1s infinite' : 'none',
            }} />
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 10,
              letterSpacing: '0.1em',
              color: status === 'JUDGING' ? 'var(--red)' : status === 'ANALYZING' ? 'var(--amber)' : 'var(--text-dim)',
            }}>
              {status}
            </span>
          </div>

          <button onClick={handleReset} style={{
            fontFamily: 'var(--mono)', fontSize: 10,
            letterSpacing: '0.1em',
            padding: '5px 12px', borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
            onMouseEnter={e => { e.target.style.borderColor = 'var(--border-bright)'; e.target.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--text-secondary)'; }}
          >
            RESET
          </button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: '1fr 340px 320px',
        overflow: 'hidden',
      }}>

        {/* Panel 1 — draw.io */}
        <div style={{
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', position: 'relative',
        }}>
          <div style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--border)',
            fontFamily: 'var(--mono)', fontSize: 10,
            letterSpacing: '0.1em', color: 'var(--text-dim)',
            background: 'var(--surface-2)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: 'var(--amber)' }}>◈</span>
            DIAGRAM EDITOR — SAVE TO TRIGGER REVIEW
          </div>
          <iframe
            ref={iframeRef}
            src={DRAWIO_URL}
            style={{
              flex: 1, border: 'none',
              background: 'var(--black)',
              filter: 'invert(0)',
            }}
            title="draw.io diagram editor"
          />
          {isAnalyzing && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(8,8,8,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(2px)',
              animation: 'fade-in 0.2s ease',
            }}>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 12,
                color: 'var(--amber)', letterSpacing: '0.15em',
                animation: 'blink 1s infinite',
              }}>
                ANALYZING...
              </div>
            </div>
          )}
        </div>

        {/* Panel 2 — Mermaid diagram */}
        <div style={{
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', background: 'var(--surface)',
        }}>
          <div style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--border)',
            fontFamily: 'var(--mono)', fontSize: 10,
            letterSpacing: '0.1em', color: 'var(--text-dim)',
            background: 'var(--surface-2)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: 'var(--green)' }}>◈</span>
            PARSED ARCHITECTURE
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <MermaidView
              mermaidCode={mermaidCode}
              highlightedNodes={highlightedNodes}
            />
          </div>
        </div>

        {/* Panel 3 — Critique */}
        <CritiquePanel
          critique={critique}
          changeSummary={changeSummary}
          visionLabels={visionLabels}
          isPlaying={isPlaying}
        />
      </div>

      {/* ── Bottom bar ── */}
      <div style={{
        height: 28,
        background: 'var(--surface-2)',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 20,
        flexShrink: 0,
      }}>
        {[
          ['SESSION', SESSION_ID.slice(0, 8).toUpperCase()],
          ['BACKEND', 'localhost:8000'],
          ['MODEL', 'SNOWFLAKE CORTEX'],
          ['VOICE', 'ELEVENLABS'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>{k}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}