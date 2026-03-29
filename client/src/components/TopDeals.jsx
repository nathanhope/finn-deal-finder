import { useState, useEffect, useCallback } from 'react'
import ScoreRing from './ScoreRing.jsx'

function fmt(n) {
  if (n == null) return '—'
  return n.toLocaleString('no-NO') + ' kr'
}

function timeAgo(iso) {
  if (!iso) return null
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60) return 'akkurat nå'
  if (diff < 3600) return `${Math.floor(diff / 60)}m siden`
  return `${Math.floor(diff / 3600)}t siden`
}

const CATEGORIES = [
  { id: 'all',    label: 'Alle' },
  { id: 'guitar', label: 'Guitar' },
  { id: 'bass',   label: 'Bass' },
  { id: 'pedals', label: 'Guitar Pedals' },
  { id: 'studio', label: 'Studio' },
]

function RankBadge({ rank }) {
  const colors = {
    1: 'text-amber-300 border-amber-400/40 bg-amber-400/10',
    2: 'text-[#c0c0c0] border-[#c0c0c0]/30 bg-[#c0c0c0]/10',
    3: 'text-amber-700 border-amber-700/30 bg-amber-700/10',
  }
  return (
    <div className={`w-7 h-7 rounded-full border flex items-center justify-center mono text-xs font-bold flex-shrink-0 ${colors[rank] || 'text-[#9a9080] border-[#2a2a2a] bg-transparent'}`}>
      {rank}
    </div>
  )
}

function TopDealRow({ rank, listing, onSelect }) {
  const { title, url, price, image, score, dealSummary, isDealer } = listing
  const savings = score?.savings
  const savingsPct = score?.savingsPct

  return (
    <div
      className="flex items-center gap-3 p-3 rounded hover:bg-[#1f1f1f] transition-colors cursor-pointer group"
      onClick={() => onSelect(listing)}
    >
      <RankBadge rank={rank} />

      {/* Thumbnail */}
      <div className="w-10 h-10 rounded overflow-hidden bg-[#2a2a2a] flex-shrink-0">
        {image
          ? <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" onError={e => { e.target.style.display = 'none' }} />
          : <div className="w-full h-full flex items-center justify-center text-[#3a3a3a] text-sm select-none">◈</div>
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-sm text-[#e8e0d0] hover:text-amber-400 transition-colors line-clamp-1 font-medium"
        >
          {title}
        </a>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="mono text-sm font-bold text-[#e8e0d0]">{fmt(price)}</span>
          {savings > 0 && (
            <span className="text-xs text-green-400 mono">
              -{savingsPct}% ({fmt(savings)} spart)
            </span>
          )}
          {isDealer && (
            <span className="text-xs text-yellow-500/70">⚠ forhandler</span>
          )}
        </div>
        {dealSummary && (
          <p className="text-xs text-[#6a6060] italic mt-0.5 line-clamp-1">{dealSummary}</p>
        )}
      </div>

      {/* Score */}
      <ScoreRing score={score?.total ?? null} size={52} />
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="skeleton w-7 h-7 rounded-full flex-shrink-0" />
      <div className="skeleton w-10 h-10 rounded flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
      </div>
      <div className="skeleton w-12 h-12 rounded-full flex-shrink-0" />
    </div>
  )
}

export default function TopDeals({ onSelectListing }) {
  const [state, setState] = useState({ deals: [], computing: true, lastUpdated: null, error: null })
  const [refreshing, setRefreshing] = useState(false)
  const [activeCategory, setActiveCategory] = useState('all')

  const load = useCallback(async (silent = false) => {
    if (!silent) setState(s => ({ ...s, computing: true }))
    try {
      const res = await fetch('/api/top-deals')
      const data = await res.json()
      setState({ ...data, computing: data.computing || false })
    } catch {
      setState(s => ({ ...s, computing: false, error: 'Kunne ikke hente deals' }))
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [load])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetch('/api/top-deals/refresh', { method: 'POST' })
    const poll = setInterval(async () => {
      const res = await fetch('/api/top-deals')
      const data = await res.json()
      setState({ ...data, computing: data.computing || false })
      if (!data.computing) {
        clearInterval(poll)
        setRefreshing(false)
      }
    }, 3000)
  }

  const visibleDeals = activeCategory === 'all'
    ? state.deals.slice(0, 10)
    : state.deals.filter(d => d.category === activeCategory).slice(0, 10)

  const isEmpty = !state.computing && visibleDeals.length === 0

  // Only show category tabs that have at least one deal (except 'all')
  const activeTabs = CATEGORIES.filter(cat =>
    cat.id === 'all' || state.deals.some(d => d.category === cat.id)
  )

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-semibold text-sm tracking-tight">Top 10 Deals</span>
          <span className="text-[#6a6060] text-xs">akkurat nå</span>
          {state.lastUpdated && (
            <span className="text-[#4a4040] text-xs">· oppdatert {timeAgo(state.lastUpdated)}</span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || state.computing}
          className="text-xs text-[#9a9080] hover:text-amber-400 transition-colors disabled:opacity-40 flex items-center gap-1"
          title="Tving oppdatering"
        >
          <span className={refreshing || state.computing ? 'animate-spin inline-block' : ''}>↻</span>
          {(refreshing || state.computing) ? 'Oppdaterer...' : 'Oppdater'}
        </button>
      </div>

      {/* Category tabs */}
      {!state.computing && activeTabs.length > 1 && (
        <div className="flex gap-1 px-3 py-2 border-b border-[#1f1f1f] overflow-x-auto">
          {activeTabs.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1 rounded text-xs whitespace-nowrap transition-colors flex-shrink-0 ${
                activeCategory === cat.id
                  ? 'bg-[#2a2a2a] text-[#e8e0d0]'
                  : 'text-[#9a9080] hover:text-[#e8e0d0]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="divide-y divide-[#1f1f1f]">
        {state.computing && state.deals.length === 0 ? (
          <>
            <div className="px-4 py-3 text-xs text-[#9a9080] italic flex items-center gap-2">
              <span className="animate-spin inline-block">↻</span>
              Skanner gitarer, forsterkere, effekter, studio og synth etter de beste dealene — dette tar ~2 min første gang...
            </div>
            {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
          </>
        ) : isEmpty ? (
          <div className="px-4 py-8 text-center text-[#9a9080] text-sm">
            {activeCategory === 'all'
              ? 'Ingen scorede deals funnet ennå.'
              : `Ingen deals i denne kategorien ennå.`}
            {activeCategory === 'all' && (
              <button onClick={handleRefresh} className="block mx-auto mt-2 text-amber-400 hover:text-amber-300 text-xs underline">
                Prøv igjen
              </button>
            )}
          </div>
        ) : (
          visibleDeals.map((listing, i) => (
            <TopDealRow
              key={listing.url}
              rank={i + 1}
              listing={listing}
              onSelect={onSelectListing}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {!state.computing && state.deals.length > 0 && (
        <div className="px-4 py-2 border-t border-[#1f1f1f] text-xs text-[#4a4040]">
          Basert på kategorisøk · oppdateres hver 6. time
        </div>
      )}
    </div>
  )
}
