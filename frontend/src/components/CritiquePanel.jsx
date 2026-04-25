import { useEffect, useRef, useState } from 'react';

const SEVERITY_CONFIG = {
  critical: { label: 'CRITICAL', color: 'var(--red)', bg: 'var(--red-dim)', border: 'var(--red)', pulse: 'pulse-red', bars: 3 },
  warning:  { label: 'WARNING',  color: 'var(--amber)', bg: 'var(--amber-dim)', border: 'var(--amber)', pulse: 'pulse-amber', bars: 2 },
  good:     { label: 'APPROVED', color: 'var(--green)', bg: 'var(--green-dim)', border: 'var(--green)', pulse: null, bars: 1 },
};

function deriveSeverity(critique = '') {
  const t = critique.toLowerCase();
  if (t.includes('cursed') || t.includes('disaster') || t.includes('single point') ||
      t.includes('violence') || t.includes('terrible') || t.includes('no cach'))
    return 'critical';
  if (t.includes('impressed') || t.includes('good') || t.includes('finally') ||
      t.includes('beautifully') || t.includes("chef's kiss") || t.includes('survive') || t.includes('shocked'))
    return 'good';
  return 'warning';
}

/* ── Mascot SVG — the sarcastic eye ── */
function Mascot({ severity, isPlaying }) {
  const color = severity === 'critical' ? 'var(--red)' : severity === 'good' ? 'var(--green)' : 'var(--amber)';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      padding: '16px 0 8px',
      animation: 'float 3s ease-in-out infinite',
    }}>
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Outer ring */}
        <circle cx="32" cy="32" r="30" stroke={color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4"/>
        {/* Face */}
        <circle cx="32" cy="32" r="22" fill="var(--surface-3)" stroke={color} strokeWidth="1.5"/>
        {/* Glow */}
        <circle cx="32" cy="32" r="22" fill={color} opacity="0.05"/>
        {/* Eye white */}
        <ellipse cx="32" cy="30" rx="10" ry="10"
          fill="var(--surface-2)" stroke={color} strokeWidth="1"
          style={{ animation: 'eye-blink 4s ease-in-out infinite' }}
        />
        {/* Pupil */}
        <circle cx="32" cy="30" r="5" fill={color} opacity="0.9"
          style={{ animation: isPlaying ? 'eye-look 1s ease-in-out infinite' : 'eye-look 4s ease-in-out infinite' }}
        />
        {/* Pupil shine */}
        <circle cx="34" cy="28" r="1.5" fill="white" opacity="0.6"/>
        {/* Mouth — changes by severity */}
        {severity === 'good' && (
          <path d="M24 44 Q32 50 40 44" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        )}
        {severity === 'warning' && (
          <path d="M24 46 L40 46" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        )}
        {severity === 'critical' && (
          <path d="M24 48 Q32 43 40 48" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        )}
        {/* Eyebrow — always judgy */}
        <path d="M24 20 Q32 16 40 20" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        {/* Corner tech marks */}
        <path d="M8 8 L8 16 M8 8 L16 8" stroke={color} strokeWidth="1" opacity="0.3"/>
        <path d="M56 8 L56 16 M56 8 L48 8" stroke={color} strokeWidth="1" opacity="0.3"/>
        <path d="M8 56 L8 48 M8 56 L16 56" stroke={color} strokeWidth="1" opacity="0.3"/>
        <path d="M56 56 L56 48 M56 56 L48 56" stroke={color} strokeWidth="1" opacity="0.3"/>
      </svg>
      {isPlaying && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{
              width: 2, height: 10,
              background: color,
              borderRadius: 1,
              animation: `waveform ${0.3 + i * 0.08}s ease-in-out infinite`,
              animationDelay: `${i * 0.06}s`,
            }}/>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Glitch text component ── */
function GlitchText({ text, color, fontSize = 22 }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block', fontFamily: 'var(--display)', fontSize, color, letterSpacing: '0.06em' }}>
      <span>{text}</span>
      <span style={{
        position: 'absolute', inset: 0, color: 'var(--red)',
        animation: 'glitch-1 5s infinite', pointerEvents: 'none',
      }}>{text}</span>
      <span style={{
        position: 'absolute', inset: 0, color: 'var(--amber)',
        animation: 'glitch-2 5s infinite 0.5s', pointerEvents: 'none',
      }}>{text}</span>
    </div>
  );
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
      if (indexRef.current >= critique.length) clearInterval(timerRef.current);
    }, 16);
    return () => clearInterval(timerRef.current);
  }, [critique]);

  const cfg = SEVERITY_CONFIG[severity];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--surface)', borderLeft: '1px solid var(--border)',
      fontFamily: 'var(--mono)', overflow: 'hidden',
      animation: 'flicker 8s infinite',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--surface-2)',
      }}>
        <GlitchText text="ARCH-ENEMY" color="var(--red)" fontSize={16}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: isPlaying ? 'var(--red)' : 'var(--border-bright)',
            boxShadow: isPlaying ? '0 0 8px var(--red)' : 'none',
            animation: isPlaying ? 'blink 0.8s infinite' : 'none',
          }}/>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
            {isPlaying ? 'SPEAKING' : 'LISTENING'}
          </span>
        </div>
      </div>

      {/* Mascot */}
      <Mascot severity={severity} isPlaying={isPlaying}/>

      {/* Severity gauge */}
      <div style={{
        margin: '0 14px 12px', padding: '8px 12px',
        borderRadius: 4, background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        animation: cfg.pulse ? `${cfg.pulse} 2s infinite` : 'none',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: cfg.color }}>
          {cfg.label}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{
              width: 16, height: 5, borderRadius: 2,
              background: i <= cfg.bars ? cfg.color : 'var(--border)',
              transition: 'background 0.4s',
              boxShadow: i <= cfg.bars ? `0 0 6px ${cfg.color}` : 'none',
            }}/>
          ))}
        </div>
      </div>

      {/* Critique text */}
      <div style={{ flex: 1, padding: '0 14px 14px', overflowY: 'auto' }}>
        {critique ? (
          <p style={{
            fontSize: 12.5, lineHeight: 1.8,
            color: 'var(--text-primary)', fontFamily: 'var(--body)',
            animation: 'slide-up 0.3s ease',
          }}>
            {displayed}
            {displayed.length < (critique?.length || 0) && (
              <span style={{
                display: 'inline-block', width: 2, height: 13,
                background: 'var(--red)', marginLeft: 2,
                animation: 'typing-cursor 0.6s infinite',
                verticalAlign: 'middle',
              }}/>
            )}
          </p>
        ) : (
          <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.25,
          }}>
            <p style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.8 }}>
              AWAITING INPUT<br/>
              <span style={{ fontSize: 9, opacity: 0.6 }}>save your diagram to receive judgment</span>
            </p>
          </div>
        )}
      </div>

      {/* Diff */}
      {changeSummary && changeSummary !== 'No changes.' && (
        <div style={{
          padding: '8px 14px', borderTop: '1px solid var(--border)',
          fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.04em', lineHeight: 1.6,
        }}>
          <span style={{ color: 'var(--amber)', marginRight: 6 }}>ΔDIFF</span>
          {changeSummary}
        </div>
      )}

      {/* Vision labels */}
      {visionLabels?.length > 0 && (
        <div style={{
          padding: '8px 14px', borderTop: '1px solid var(--border)',
          display: 'flex', flexWrap: 'wrap', gap: 5,
        }}>
          {visionLabels.map(label => (
            <span key={label} style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 3,
              background: 'var(--surface-3)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', letterSpacing: '0.06em',
            }}>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}