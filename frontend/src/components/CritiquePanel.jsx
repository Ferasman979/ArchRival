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

/* ── Robot Mascot — three states ── */
function Mascot({ severity, isPlaying }) {
  const color = severity === 'critical' ? 'var(--red)' : severity === 'good' ? 'var(--green)' : 'var(--amber)';
  const glowColor = severity === 'critical' ? 'rgba(230,57,70,0.35)' : severity === 'good' ? 'rgba(42,157,143,0.35)' : 'rgba(244,162,97,0.35)';
  const statusText = severity === 'critical' ? 'CHOOSING VIOLENCE' : severity === 'good' ? 'NICE ARCHITECTURE' : 'REVIEW PENDING...';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      padding: '14px 0 8px',
    }}>
      <svg width="88" height="106" viewBox="0 0 88 106" fill="none" xmlns="http://www.w3.org/2000/svg"
        style={{ animation: 'float 3s ease-in-out infinite', filter: `drop-shadow(0 0 10px ${glowColor})` }}>

        {/* ── Antenna ── */}
        <line x1="44" y1="11" x2="44" y2="4" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="44" cy="3" r="2.5" fill={color} style={{ animation: 'blink 1.8s ease-in-out infinite' }}/>

        {/* ── Head ── */}
        <rect x="18" y="11" width="52" height="38" rx="6" fill="var(--surface-3)" stroke={color} strokeWidth="1.5"/>
        {/* Head inner glow */}
        <rect x="18" y="11" width="52" height="38" rx="6" fill={color} opacity="0.05"/>
        {/* Head corner rivets */}
        <circle cx="24" cy="17" r="1.5" fill={color} opacity="0.4"/>
        <circle cx="64" cy="17" r="1.5" fill={color} opacity="0.4"/>
        <circle cx="24" cy="43" r="1.5" fill={color} opacity="0.4"/>
        <circle cx="64" cy="43" r="1.5" fill={color} opacity="0.4"/>

        {/* ── Eyes ── */}
        {severity === 'critical' && (
          <>
            {/* X eyes */}
            <line x1="28" y1="21" x2="36" y2="29" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="36" y1="21" x2="28" y2="29" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="52" y1="21" x2="60" y2="29" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="60" y1="21" x2="52" y2="29" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
          </>
        )}
        {severity === 'good' && (
          <>
            {/* Happy arc eyes */}
            <path d="M27 28 Q32 21 37 28" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <path d="M51 28 Q56 21 61 28" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          </>
        )}
        {severity === 'warning' && (
          <>
            {/* Glowing square eyes */}
            <rect x="27" y="20" width="11" height="10" rx="2" fill={color} opacity="0.15" stroke={color} strokeWidth="1.2"/>
            <rect x="29" y="22" width="7" height="6" rx="1" fill={color} opacity="0.85"/>
            <rect x="50" y="20" width="11" height="10" rx="2" fill={color} opacity="0.15" stroke={color} strokeWidth="1.2"/>
            <rect x="52" y="22" width="7" height="6" rx="1" fill={color} opacity="0.85"/>
          </>
        )}

        {/* ── Mouth ── */}
        {severity === 'good' && (
          <path d="M30 37 Q44 46 58 37" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none"/>
        )}
        {severity === 'warning' && (
          <line x1="32" y1="39" x2="56" y2="39" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
        )}
        {severity === 'critical' && (
          <path d="M30 43 Q44 36 58 43" stroke={color} strokeWidth="1.8" strokeLinecap="round" fill="none"/>
        )}

        {/* ── Body ── */}
        <rect x="14" y="51" width="60" height="38" rx="6" fill="var(--surface-3)" stroke={color} strokeWidth="1.5"/>
        <rect x="14" y="51" width="60" height="38" rx="6" fill={color} opacity="0.04"/>

        {/* ── Chest display ── */}
        <rect x="22" y="59" width="44" height="22" rx="3" fill="var(--surface)" stroke={color} strokeWidth="1" opacity="0.9"/>
        {/* Scan line on display */}
        <rect x="22" y="59" width="44" height="4" rx="3" fill={color} opacity="0.08"/>
        {/* Label text */}
        <text x="44" y="69" textAnchor="middle" fill={color}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '6px', fontWeight: 700, letterSpacing: '0.08em' }}>
          {severity === 'critical' ? 'CRITICAL' : severity === 'good' ? 'APPROVED' : 'WARNING'}
        </text>
        <text x="44" y="77" textAnchor="middle" fill={color} opacity="0.55"
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '5px', letterSpacing: '0.04em' }}>
          {statusText}
        </text>

        {/* ── Body rivets ── */}
        <circle cx="20" cy="57" r="1.5" fill={color} opacity="0.4"/>
        <circle cx="68" cy="57" r="1.5" fill={color} opacity="0.4"/>

        {/* ── Arms ── */}
        {/* Left arm — raised if APPROVED */}
        {severity === 'good' ? (
          <g transform="rotate(-55 14 54)">
            <rect x="4" y="51" width="10" height="26" rx="4" fill="var(--surface-3)" stroke={color} strokeWidth="1.5"/>
            <rect x="4" y="51" width="10" height="26" rx="4" fill={color} opacity="0.05"/>
          </g>
        ) : (
          <>
            <rect x="2" y="53" width="10" height="26" rx="4" fill="var(--surface-3)" stroke={color} strokeWidth="1.5"/>
            <rect x="2" y="53" width="10" height="26" rx="4" fill={color} opacity="0.05"/>
          </>
        )}
        {/* Right arm */}
        <rect x="76" y="53" width="10" height="26" rx="4" fill="var(--surface-3)" stroke={color} strokeWidth="1.5"/>
        <rect x="76" y="53" width="10" height="26" rx="4" fill={color} opacity="0.05"/>

        {/* ── Legs ── */}
        <rect x="20" y="89" width="18" height="14" rx="5" fill="var(--surface-3)" stroke={color} strokeWidth="1.5"/>
        <rect x="20" y="89" width="18" height="14" rx="5" fill={color} opacity="0.05"/>
        <rect x="50" y="89" width="18" height="14" rx="5" fill="var(--surface-3)" stroke={color} strokeWidth="1.5"/>
        <rect x="50" y="89" width="18" height="14" rx="5" fill={color} opacity="0.05"/>
        {/* Foot details */}
        <line x1="22" y1="100" x2="36" y2="100" stroke={color} strokeWidth="1" opacity="0.4" strokeLinecap="round"/>
        <line x1="52" y1="100" x2="66" y2="100" stroke={color} strokeWidth="1" opacity="0.4" strokeLinecap="round"/>

      </svg>

      {/* Waveform when speaking */}
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

export function CritiquePanel({ critique, severity: severityProp, changeSummary, visionLabels, isPlaying }) {
  const [displayed, setDisplayed] = useState('');
  // Use severity from backend if provided, fall back to keyword detection
  const [severity, setSeverity] = useState('warning');
  const indexRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!critique) return;
    setSeverity(severityProp || deriveSeverity(critique));
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