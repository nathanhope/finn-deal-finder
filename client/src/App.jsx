import { useState, useCallback } from 'react'
import SearchBar from './components/SearchBar.jsx'
import DealCard from './components/DealCard.jsx'
import SkeletonCard from './components/SkeletonCard.jsx'
import FilterDrawer from './components/FilterDrawer.jsx'
import TopDeals from './components/TopDeals.jsx'

const SORT_OPTIONS = [
  { value: 'score', label: 'Best deal' },
  { value: 'price', label: 'Lowest price' },
  { value: 'newest', label: 'Newest' },
]

const DEFAULT_FILTERS = {
  maxPrice: 50000,
  minScore: 0,
  condition: 'any',
}

export default function App() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [isUrlScore, setIsUrlScore] = useState(false)
  const [sort, setSort] = useState('score')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lastQuery, setLastQuery] = useState('')

  const handleSearch = useCallback(async (keyword) => {
    if (!keyword.trim()) return
    const asUrl = /^https?:\/\/(www\.)?finn\.no\//i.test(keyword.trim())

    setLoading(true)
    setError(null)
    setHasSearched(true)
    setIsUrlScore(asUrl)
    setLastQuery(keyword)

    try {
      if (asUrl) {
        const res = await fetch(`/api/score?url=${encodeURIComponent(keyword.trim())}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `Server error ${res.status}`)
        }
        const data = await res.json()
        setResults(data.result ? [data.result] : [])
      } else {
        const params = new URLSearchParams({
          q: keyword,
          sort,
          ...(filters.maxPrice < 50000 && { maxPrice: filters.maxPrice }),
          ...(filters.minScore > 0 && { minScore: filters.minScore }),
          ...(filters.condition !== 'any' && { condition: filters.condition }),
        })
        const res = await fetch(`/api/search?${params}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `Server error ${res.status}`)
        }
        const data = await res.json()
        setResults(data.results || [])
      }
    } catch (err) {
      setError(err.message)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [sort, filters])

  const handleSortChange = (newSort) => {
    setSort(newSort)
    if (hasSearched && lastQuery) {
      // Re-sort client-side from existing results for snappiness
      const sorted = [...results].sort((a, b) => {
        if (newSort === 'price') return a.price - b.price
        if (newSort === 'newest') {
          const da = a.publishedAt ? new Date(a.publishedAt) : 0
          const db = b.publishedAt ? new Date(b.publishedAt) : 0
          return db - da
        }
        return (b.score?.total ?? -1) - (a.score?.total ?? -1)
      })
      setResults(sorted)
    }
  }

  const activeFilterCount = [
    filters.maxPrice < 50000,
    filters.minScore > 0,
    filters.condition !== 'any',
  ].filter(Boolean).length

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-[#e8e0d0]">
      {/* Header */}
      <header className="border-b border-[#2a2a2a] sticky top-0 z-40 bg-[#0f0f0f]/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => { setHasSearched(false); setResults([]); setError(null); setIsUrlScore(false) }}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <span className="text-amber-400 text-xl select-none">◈</span>
            <span className="font-semibold tracking-tight text-[#e8e0d0]">GearFind</span>
          </button>
          <span className="text-[#9a9080] text-sm hidden sm:inline">— finn.no deal scanner</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-16">
        {/* Search */}
        <div className="py-8">
          <SearchBar
            onSearch={handleSearch}
            loading={loading}
            onOpenFilters={() => setDrawerOpen(true)}
            activeFilterCount={activeFilterCount}
          />
        </div>

        {/* Results controls */}
        {hasSearched && !loading && !isUrlScore && (
          <div className="flex items-center justify-between mb-4 gap-3">
            <span className="text-[#9a9080] text-sm mono">
              {results.length > 0
                ? `${results.length} deal${results.length !== 1 ? 's' : ''} found`
                : 'No deals found'}
            </span>
            <div className="flex items-center gap-1">
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleSortChange(opt.value)}
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    sort === opt.value
                      ? 'bg-[#2a2a2a] text-[#e8e0d0]'
                      : 'text-[#9a9080] hover:text-[#e8e0d0]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {hasSearched && !loading && isUrlScore && results.length > 0 && (
          <div className="mb-4">
            <span className="text-[#9a9080] text-xs mono">Score for finn.no-annonse</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="card p-4 border-red-900/50 bg-red-950/20 text-red-400 text-sm mb-6">
            {error}
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && results.length > 0 && (
          <div className="space-y-3">
            {results.map(listing => (
              <DealCard key={listing.id} listing={listing} initialExpanded={isUrlScore} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && hasSearched && results.length === 0 && !error && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4 select-none opacity-30">◈</div>
            {isUrlScore ? (
              <>
                <p className="text-[#9a9080] mb-2">Kunne ikke hente annonsen</p>
                <p className="text-[#9a9080] text-sm">Sjekk at lenken er en aktiv finn.no-annonse og prøv igjen.</p>
              </>
            ) : (
              <>
                <p className="text-[#9a9080] mb-2">Ingen deals funnet for <span className="text-[#e8e0d0]">"{lastQuery}"</span></p>
                <p className="text-[#9a9080] text-sm">
                  Prøv å senke minimum score-grensen, juster filtrene, eller søk på et annet søkeord.
                </p>
              </>
            )}
          </div>
        )}

        {/* Landing state */}
        {!hasSearched && (
          <div>
            <div className="text-center py-8 select-none">
              <h2 className="text-[#9a9080] text-base mb-2">Søk etter musikkinstrumenter på finn.no</h2>
              <p className="text-[#9a9080] text-sm max-w-md mx-auto leading-relaxed">
                Hvert treff scores automatisk mot Reverb, eBay og Thomann.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {['Fender Stratocaster', 'UA Apollo', 'Neve 1073', 'Roland TR-8', 'Focusrite Scarlett'].map(s => (
                  <button
                    key={s}
                    onClick={() => handleSearch(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-[#2a2a2a] text-[#9a9080] hover:text-amber-400 hover:border-amber-400/30 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <TopDeals onSelectListing={(listing) => {
              setResults([listing])
              setHasSearched(true)
              setIsUrlScore(true)
              setLastQuery(listing.url)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }} />
          </div>
        )}
      </main>

      {/* Filter drawer */}
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
      />
    </div>
  )
}
