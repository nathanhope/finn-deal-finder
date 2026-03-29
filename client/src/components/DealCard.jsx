import { useState } from 'react'
import ScoreRing from './ScoreRing.jsx'
import ScoreBreakdown from './ScoreBreakdown.jsx'

const CONDITION_COLORS = {
  'Som ny':    'text-green-400 border-green-400/30 bg-green-400/10',
  'Meget god': 'text-green-400 border-green-400/30 bg-green-400/10',
  'God':       'text-amber-400 border-amber-400/30 bg-amber-400/10',
  'Brukt':     'text-[#9a9080] border-[#3a3a3a] bg-[#2a2a2a]',
  'Ikke oppgitt': 'text-[#6a6060] border-[#2a2a2a] bg-transparent',
}

function fmt(n) {
  if (n == null) return '—'
  return n.toLocaleString('no-NO') + ' kr'
}

function SavingsBadge({ savings, savingsPct }) {
  if (!savings || savings <= 0) return null
  const isGreat = savingsPct >= 30
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded mono ${
      isGreat
        ? 'bg-green-500/15 text-green-400'
        : 'bg-amber-500/15 text-amber-400'
    }`}>
      Spar {fmt(savings)} ({savingsPct}%)
    </span>
  )
}

export default function DealCard({ listing }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const { title, url, price, condition, image, isDealer, score, priceData, modelQuery, publishedAt, dealSummary } = listing

  const conditionClass = CONDITION_COLORS[condition] || CONDITION_COLORS['Ikke oppgitt']

  const copyLink = async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback
      const el = document.createElement('input')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const relativeDate = publishedAt ? formatDate(publishedAt) : null

  return (
    <article
      className="card p-4 cursor-pointer transition-colors hover:border-[#3a3a3a]"
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex gap-4">
        {/* Thumbnail */}
        <div className="flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded overflow-hidden bg-[#2a2a2a]">
          {image ? (
            <img
              src={image}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={e => { e.target.style.display = 'none' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#3a3a3a] text-2xl select-none">◈</div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="min-w-0">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-sm font-medium text-[#e8e0d0] hover:text-amber-400 transition-colors line-clamp-2 leading-snug"
              >
                {title}
              </a>
            </div>
            {/* Score ring */}
            <ScoreRing score={score?.total ?? null} size={64} />
          </div>

          {/* Prices */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
            <span className="mono font-bold text-lg text-[#e8e0d0]">{fmt(price)}</span>
            {score?.marketPrice && (
              <span className="mono text-sm text-[#9a9080] line-through">{fmt(score.marketPrice)}</span>
            )}
            {score?.savings > 0 && (
              <SavingsBadge savings={score.savings} savingsPct={score.savingsPct} />
            )}
          </div>

          {/* AI deal summary */}
          {dealSummary && (
            <p className="text-xs text-[#9a9080] italic mb-2 leading-relaxed">
              {dealSummary}
            </p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Condition badge */}
            <span className={`text-xs px-2 py-0.5 rounded-full border ${conditionClass}`}>
              {condition}
            </span>

            {/* Dealer flag */}
            {isDealer && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-yellow-600/30 bg-yellow-600/10 text-yellow-500 flex items-center gap-1">
                <span>⚠</span> Forhandler
              </span>
            )}

            {/* Low confidence */}
            {score?.lowConfidence && (
              <span className="text-xs text-amber-500/60" title="Lavt datagrunnlag">~ usikker score</span>
            )}

            {/* Date */}
            {relativeDate && (
              <span className="text-xs text-[#6a6060] ml-auto">{relativeDate}</span>
            )}
          </div>
        </div>
      </div>

      {/* Action row */}
      <div
        className="flex items-center justify-between mt-3 pt-2 border-t border-[#1f1f1f]"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
          className="text-xs text-[#9a9080] hover:text-amber-400 transition-colors flex items-center gap-1"
        >
          <span>{expanded ? '▲' : '▼'}</span>
          <span>{expanded ? 'Skjul' : 'Vis'} score-detaljer</span>
        </button>
        <button
          onClick={copyLink}
          className="text-xs text-[#9a9080] hover:text-[#e8e0d0] transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-[#2a2a2a]"
        >
          {copied ? '✓ kopiert' : '⧉ kopier lenke'}
        </button>
      </div>

      {/* Expandable breakdown */}
      {expanded && (
        <ScoreBreakdown
          score={score}
          priceData={priceData}
          modelQuery={modelQuery}
        />
      )}
    </article>
  )
}

function formatDate(raw) {
  try {
    const date = new Date(raw)
    if (isNaN(date)) {
      // Might already be a human string like "2 dager siden"
      return raw
    }
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)
    if (diff < 3600) return `${Math.floor(diff / 60)}m siden`
    if (diff < 86400) return `${Math.floor(diff / 3600)}t siden`
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d siden`
    return date.toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })
  } catch {
    return raw
  }
}
