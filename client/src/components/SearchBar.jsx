import { useState, useRef } from 'react'

const DEFAULT_CATEGORIES = ['Gitarer & Basser', 'Studio / Recording']

export default function SearchBar({ onSearch, loading, onOpenFilters, activeFilterCount }) {
  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [activeCategories, setActiveCategories] = useState(new Set(DEFAULT_CATEGORIES))
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCat, setNewCat] = useState('')
  const inputRef = useRef(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!query.trim()) return
    onSearch(query.trim())
  }

  const toggleCategory = (cat) => {
    setActiveCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const addCategory = () => {
    const trimmed = newCat.trim()
    if (trimmed && !categories.includes(trimmed)) {
      const updated = [...categories, trimmed]
      setCategories(updated)
      setActiveCategories(prev => new Set([...prev, trimmed]))
    }
    setNewCat('')
    setAddingCategory(false)
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Søk etter gear, eller lim inn en finn.no-lenke for å score den"
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-4 py-3 text-[#e8e0d0] placeholder-[#9a9080] text-sm focus:outline-none focus:border-amber-500/60 transition-colors"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="btn-primary text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Spinner /> Søker...
            </span>
          ) : 'Søk'}
        </button>
        <button
          type="button"
          onClick={onOpenFilters}
          className="btn-ghost relative whitespace-nowrap"
        >
          Filtre
          {activeFilterCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-black text-[10px] font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
      </form>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[#9a9080] text-xs">Kategorier:</span>
        {categories.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => toggleCategory(cat)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              activeCategories.has(cat)
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                : 'border-[#2a2a2a] text-[#9a9080] hover:border-[#3a3a3a]'
            }`}
          >
            {cat}
          </button>
        ))}

        {addingCategory ? (
          <div className="flex gap-1 items-center">
            <input
              type="text"
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } if (e.key === 'Escape') { setAddingCategory(false); setNewCat('') } }}
              placeholder="Kategori..."
              autoFocus
              className="text-xs px-2 py-1 bg-[#1a1a1a] border border-amber-500/50 rounded text-[#e8e0d0] placeholder-[#9a9080] outline-none w-32"
            />
            <button type="button" onClick={addCategory} className="text-xs text-amber-400 hover:text-amber-300">legg til</button>
            <button type="button" onClick={() => { setAddingCategory(false); setNewCat('') }} className="text-xs text-[#9a9080] hover:text-[#e8e0d0]">avbryt</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCategory(true)}
            className="text-xs px-2 py-1 border border-dashed border-[#2a2a2a] text-[#9a9080] rounded-full hover:border-[#3a3a3a] hover:text-[#e8e0d0] transition-colors"
          >
            + legg til
          </button>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}
