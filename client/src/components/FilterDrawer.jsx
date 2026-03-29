import { useEffect, useRef } from 'react'

const CONDITIONS = [
  { value: 'any', label: 'Alle tilstander' },
  { value: 'Som ny', label: 'Som ny' },
  { value: 'Meget god', label: 'Meget god' },
  { value: 'God', label: 'God' },
  { value: 'Brukt', label: 'Brukt' },
]

export default function FilterDrawer({ open, onClose, filters, onChange, onReset }) {
  const drawerRef = useRef(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) onClose()
    }
    setTimeout(() => window.addEventListener('mousedown', handler), 0)
    return () => window.removeEventListener('mousedown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 bottom-0 w-full max-w-xs bg-[#1a1a1a] border-l border-[#2a2a2a] z-50 flex flex-col drawer-enter"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a2a]">
          <h2 className="font-semibold text-sm text-[#e8e0d0]">Filtre</h2>
          <button
            onClick={onClose}
            className="text-[#9a9080] hover:text-[#e8e0d0] transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Controls */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-7">
          {/* Max price */}
          <div>
            <div className="flex justify-between mb-3">
              <label className="text-sm text-[#e8e0d0]">Maks pris</label>
              <span className="mono text-sm text-amber-400">
                {filters.maxPrice >= 50000 ? 'Ingen grense' : `${filters.maxPrice.toLocaleString('no-NO')} kr`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={50000}
              step={500}
              value={filters.maxPrice}
              onChange={e => onChange(f => ({ ...f, maxPrice: parseInt(e.target.value) }))}
            />
            <div className="flex justify-between text-xs text-[#6a6060] mt-1">
              <span>0 kr</span>
              <span>50 000 kr +</span>
            </div>
          </div>

          {/* Min score */}
          <div>
            <div className="flex justify-between mb-3">
              <label className="text-sm text-[#e8e0d0]">Minimum deal score</label>
              <span className="mono text-sm text-amber-400">{filters.minScore}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={filters.minScore}
              onChange={e => onChange(f => ({ ...f, minScore: parseInt(e.target.value) }))}
            />
            <div className="flex justify-between text-xs text-[#6a6060] mt-1">
              <span>0 (alle)</span>
              <span>100</span>
            </div>
            {/* Score legend */}
            <div className="flex gap-3 mt-3 text-xs">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/>Under 40</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block"/>40–69</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"/>70+</span>
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="text-sm text-[#e8e0d0] block mb-3">Tilstand</label>
            <div className="space-y-2">
              {CONDITIONS.map(c => (
                <label key={c.value} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="condition"
                    value={c.value}
                    checked={filters.condition === c.value}
                    onChange={() => onChange(f => ({ ...f, condition: c.value }))}
                    className="accent-amber-500"
                  />
                  <span className={`text-sm transition-colors ${
                    filters.condition === c.value ? 'text-[#e8e0d0]' : 'text-[#9a9080] group-hover:text-[#e8e0d0]'
                  }`}>
                    {c.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#2a2a2a] flex gap-3">
          <button
            onClick={() => { onReset(); onClose() }}
            className="btn-ghost flex-1 text-center"
          >
            Nullstill
          </button>
          <button onClick={onClose} className="btn-primary flex-1 text-center text-sm">
            Bruk filtre
          </button>
        </div>
      </div>
    </>
  )
}
