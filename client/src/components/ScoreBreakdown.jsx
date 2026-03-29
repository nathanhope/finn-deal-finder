function MiniBar({ label, value, weight, color }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[#9a9080]">{label} <span className="text-[#6a6060]">({weight}%)</span></span>
        <span className="mono" style={{ color }}>{value ?? '—'}</span>
      </div>
      <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value ?? 0}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function fmt(n) {
  if (n == null) return '—'
  return n.toLocaleString('no-NO') + ' kr'
}

const NEW_PRICE_LABELS = {
  evenstad:   'Evenstad Musikk (ny)',
  thomann:    'Thomann (ny)',
  gear4music: 'Gear4Music (ny)',
  ebay_new:   'eBay (ny)',
  reverb_new: 'Reverb (ny)',
}

export default function ScoreBreakdown({ score, priceData, modelQuery, finnPrice }) {
  if (!score) return null

  const { breakdown, marketPrice, savings, savingsPct, lowConfidence, hasMarketData, hasThomannData } = score
  const { reverb, ebay, thomann, gear4music, reverbNew, newPrice } = priceData || {}
  const newPriceLabel = NEW_PRICE_LABELS[newPrice?.source] || 'Ny pris'

  const barColor = (v) => {
    if (v == null) return '#3a3a3a'
    if (v >= 70) return '#22c55e'
    if (v >= 40) return '#f59e0b'
    return '#ef4444'
  }

  return (
    <div className="mt-3 pt-3 border-t border-[#2a2a2a] space-y-4">
      {/* Sub-score bars */}
      <div className="space-y-3">
        <MiniBar
          label="Market discount"
          value={breakdown.marketDiscount}
          weight={40}
          color={barColor(breakdown.marketDiscount)}
        />
        <MiniBar
          label="Value vs new"
          value={breakdown.valueVsNew}
          weight={35}
          color={barColor(breakdown.valueVsNew)}
        />
        <MiniBar
          label="Condition adjusted"
          value={breakdown.conditionAdjusted}
          weight={25}
          color={barColor(breakdown.conditionAdjusted)}
        />
      </div>

      {/* Source prices */}
      <div className="bg-[#111] rounded p-3 space-y-1.5 text-xs">
        <div className="text-[#6a6060] uppercase tracking-wider text-[10px] mb-2">Priskilder</div>
        <div className="flex justify-between">
          <span className="text-[#9a9080]">Reverb (solgt)</span>
          <span className="mono text-[#e8e0d0]">
            {reverb?.median ? fmt(reverb.median) : '—'}
            {reverb?.sampleSize ? <span className="text-[#6a6060] ml-1">({reverb.sampleSize} salg)</span> : null}
          </span>
        </div>
        {reverb?.sampleListings?.length > 0 && (
          <div className="pl-2 space-y-0.5 mt-0.5">
            {reverb.sampleListings.map((l, i) => (
              <div key={i} className="flex justify-between items-baseline gap-2">
                {l.url ? (
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#5a5050] hover:text-amber-400 transition-colors truncate text-[11px]"
                    title={l.title}
                  >
                    {l.title || 'Reverb listing'} ↗
                  </a>
                ) : (
                  <span className="text-[#5a5050] truncate text-[11px]">{l.title || '—'}</span>
                )}
                <span className="mono text-[#6a6060] text-[11px] flex-shrink-0">{fmt(l.price)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-[#9a9080]">eBay (solgt)</span>
          <span className="mono text-[#e8e0d0]">
            {ebay?.median ? fmt(ebay.median) : '—'}
            {ebay?.sampleSize ? <span className="text-[#6a6060] ml-1">({ebay.sampleSize} salg)</span> : null}
          </span>
        </div>
        <div className="flex justify-between border-t border-[#2a2a2a] pt-1.5 mt-1.5">
          <span className="text-[#9a9080]">{newPriceLabel}</span>
          <span className="mono text-[#e8e0d0]">
            {newPrice?.newPrice ? fmt(newPrice.newPrice) : '—'}
            {newPrice?.newPrice && gear4music?.url && (
              <a href={gear4music.url} target="_blank" rel="noopener noreferrer" className="text-[#6a6060] hover:text-amber-400 ml-1 text-[10px]">↗</a>
            )}
          </span>
        </div>
        {marketPrice && (
          <div className="flex justify-between border-t border-[#2a2a2a] pt-1.5 mt-1.5">
            <span className="text-[#9a9080]">Markedspris (snitt)</span>
            <span className="mono text-[#e8e0d0]">{fmt(marketPrice)}</span>
          </div>
        )}
      </div>

      {/* Warnings */}
      {lowConfidence && (
        <div className="text-xs text-amber-500/80 flex items-center gap-1.5">
          <span>⚠</span> Lavt datagrunnlag fra Reverb — score kan være unøyaktig
        </div>
      )}
      {hasThomannData && breakdown.valueVsNew === 0 && finnPrice != null && newPrice?.newPrice && finnPrice >= newPrice.newPrice && (
        <div className="text-xs text-[#6a6060] flex items-center gap-1.5">
          <span>ℹ</span> Finn-prisen er over nypris — «Value vs new» = 0
        </div>
      )}
      {!hasMarketData && !hasThomannData && (
        <div className="text-xs text-[#9a9080]">
          Ingen prisdata tilgjengelig — søk etter "{modelQuery}" på Reverb og eBay manuelt.
        </div>
      )}

      {/* External links */}
      <div className="flex flex-wrap gap-2 text-xs">
        {modelQuery && (
          <>
            <a
              href={reverb?.searchUrl || `https://reverb.com/marketplace?query=${encodeURIComponent(modelQuery)}&condition=sold`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9a9080] hover:text-amber-400 underline underline-offset-2 transition-colors"
            >
              Reverb solgt →
            </a>
            {thomann?.url && (
              <a
                href={thomann.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#9a9080] hover:text-amber-400 underline underline-offset-2 transition-colors"
              >
                Thomann →
              </a>
            )}
            <a
              href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(modelQuery)}&LH_Complete=1&LH_Sold=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9a9080] hover:text-amber-400 underline underline-offset-2 transition-colors"
            >
              eBay solgt →
            </a>
          </>
        )}
      </div>
    </div>
  )
}
