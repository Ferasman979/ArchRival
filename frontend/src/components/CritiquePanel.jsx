import { useEffect, useRef, useState } from 'react';

const SEVERITY_CONFIG = {
  critical: {
    label: 'CRITICAL',
    color: 'var(--red)',
    bg: 'var(--red-dim)',
    border: 'var(--red)',
    pulse: 'pulse-red',
    icon: '⬛',
    bars: 3,
  },
  warning: {
    label: 'WARNING',
    color: 'var(--amber)',
    bg: 'var(--amber-dim)',
    border: 'var(--amber)',
    pulse: 'pulse-amber',
    icon: '⬛',
    bars: 2,
  },
  good: {
    label: 'APPROVED',
    color: 'var(--green)',
    bg: 'var(--green-dim)',
    border: 'var(--green)',
    pulse: null,
    icon: '⬛',
    bars: 1,
  },
};

function deriveSeverity(critique = '') {
  const t = critique.toLowerCase();
  if (
    t.includes('cursed') || t.includes('disaster') ||
    t.includes('single point') || t.includes('violence') ||
    t.includes('terrible') || t.includes('zero') || t.includes('no cach')
  ) return 'critical';
  if (
    t.includes('impressed') || t.includes('good') ||
    t.includes('finally') || t.includes('beautifully') ||
    t.includes("chef's kiss") || t.includes('survive')
  ) return 'good';
  return 'warning';
}

export function CritiquePanel({ critique, changeSummary, visionLabels, isPlaying }) {
  const [displayed, setDisplayed] = useState('');
  const [severity, setSeverity] = useState('warning');
  const indexRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!critique) return;
    setSeverity(deriveSeverity(critique));
    setDisplayed('');
    indexRef.current = 0;
    clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      indexRef.current += 1;
      setDisplayed(critique.slice(0, indexRef.current));
      if (indexRef.current >= critique.length) {
        clearInterval(timerRef.current);
      }
    }, 18);

    return () => clearInterval(timerRef.current);
  }, [critique]);

  const cfg = SEVERITY_CONFIG[severity];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      fontFamily: 'var(--mono)',
      overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--surface-2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: isPlaying ? 'var(--red)' : 'var(--border-bright)',
            animation: isPlaying ? 'blink 1s infinite' : 'none',
            boxShadow: isPlaying ? '0 0 8px var(--red)' : 'none',
          }} />
          <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Arch-Enemy
          </span>
        </div>
        {isPlaying && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{
                width: 2,
                height: 12,
                background: 'var(--red)',
                borderRadius: 1,
                animation: `waveform ${0.4 + i * 0.1}s ease-in-out infinite`,
                animationDelay: `${i * 0.08}s`,
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Severity gauge */}
      <div style={{
        margin: '14px 18px 0',
        padding: '10px 14px',
        borderRadius: 6,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        animation: cfg.pulse ? `${cfg.pulse} 2s infinite` : 'none',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: cfg.color }}>
          {cfg.label}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              width: 18, height: 6, borderRadius: 2,
              background: i <= cfg.bars ? cfg.color : 'var(--border)',
              transition: 'background 0.4s',
            }} />
          ))}
        </div>
      </div>

      {/* Critique text */}
      <div style={{
        flex: 1,
        padding: '16px 18px',
        overflowY: 'auto',
        animation: 'slide-up 0.3s ease',
      }}>
        {critique ? (
          <p style={{
            fontSize: 13,
            lineHeight: 1.75,
            color: 'var(--text-primary)',
            fontFamily: 'var(--body)',
          }}>
            {displayed}
            {displayed.length < (critique?.length || 0) && (
              <span style={{
                display: 'inline-block',
                width: 2, height: 14,
                background: 'var(--red)',
                marginLeft: 2,
                animation: 'typing-cursor 0.7s infinite',
                verticalAlign: 'middle',
              }} />
            )}
          </p>
        ) : (
          <div style={{
            height: '100%', display: 'flex',
            flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 10, opacity: 0.3,
          }}>
            <div style={{ fontSize: 28 }}>◈</div>
            <p style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-secondary)', textAlign: 'center' }}>
              AWAITING INPUT<br />
              <span style={{ fontSize: 10, opacity: 0.6 }}>save your diagram to receive judgment</span>
            </p>
          </div>
        )}
      </div>

      {/* Change summary */}
      {changeSummary && changeSummary !== 'No changes.' && (
        <div style={{
          padding: '10px 18px',
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          letterSpacing: '0.05em',
        }}>
          <span style={{ color: 'var(--amber)', marginRight: 6 }}>ΔDIFF</span>
          {changeSummary}
        </div>
      )}

      {/* Vision labels */}
      {visionLabels?.length > 0 && (
        <div style={{
          padding: '10px 18px',
          borderTop: '1px solid var(--border)',
          display: 'flex', flexWrap: 'wrap', gap: 6,
        }}>
          {visionLabels.map(label => (
            <span key={label} style={{
              fontSize: 10, padding: '2px 8px',
              borderRadius: 3,
              background: 'var(--surface-3)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--mono)',
              letterSpacing: '0.06em',
            }}>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}