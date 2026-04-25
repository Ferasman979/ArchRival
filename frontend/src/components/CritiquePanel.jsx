/**
 * CritiquePanel.jsx — Severity gauge + critique text + change summary.
 * Owned by: Fatima
 *
 * Props:
 *   critique        {string}  — Sarcastic critique text from Snowflake
 *   changeSummary   {string}  — What changed (from diff engine)
 *   severity        {string}  — 'good' | 'warning' | 'critical' | 'neutral'
 *   visionEnrichment {string} — Vision enrichment note (unannotated icons)
 */

import { useEffect, useState } from 'react'

const SEVERITY_CONFIG = {
  neutral:  { color: '#6b7280', label: 'Waiting…',     emoji: '👁' },
  good:     { color: '#22c55e', label: 'Acceptable',   emoji: '😤' },
  warning:  { color: '#f59e0b', label: 'Concerning',   emoji: '😬' },
  critical: { color: '#ef4444', label: 'Catastrophic', emoji: '🔥' },
}

export default function CritiquePanel({ critique, changeSummary, severity, visionEnrichment }) {
  const [displayedText, setDisplayedText] = useState('')
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.neutral

  // Typing animation — character by character
  useEffect(() => {
    if (!critique) return
    setDisplayedText('')
    let i = 0
    const interval = setInterval(() => {
      setDisplayedText(critique.slice(0, i + 1))
      i++
      if (i >= critique.length) clearInterval(interval)
    }, 18)
    return () => clearInterval(interval)
  }, [critique])

  return (
    <div className="critique-panel">

      {/* Severity gauge */}
      <div className="severity-row">
        <div
          className={`severity-gauge ${severity}`}
          style={{ '--gauge-color': cfg.color }}
          title={`Severity: ${cfg.label}`}
        >
          <span className="gauge-emoji">{cfg.emoji}</span>
          <span className="gauge-label">{cfg.label}</span>
        </div>
        {changeSummary && changeSummary !== 'No changes.' && (
          <span className="change-badge">{changeSummary}</span>
        )}
      </div>

      {/* Critique text */}
      <div className={`critique-text severity-${severity}`}>
        {displayedText || (
          <span className="critique-placeholder">
            Draw something terrible. I'll be watching.
          </span>
        )}
        {displayedText && displayedText.length < (critique?.length ?? 0) && (
          <span className="cursor-blink">▋</span>
        )}
      </div>

      {/* Vision enrichment note */}
      {visionEnrichment && (
        <div className="vision-note">
          <span className="vision-icon">👁</span> {visionEnrichment}
        </div>
      )}
    </div>
  )
}
