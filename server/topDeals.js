const { fetchFinnListings } = require('./scrapers/finn')

const NON_GEAR_BLOCKLIST = [
  'spillkontroller', 'guitar hero', 'rock band', 'lekegitar', 'leketøy', 'leke ',
  'dukke', 'barnelek', 'barneleke',
  'bok ', 'bøker', 'kokebøker', 'krim', 'roman', 'biografi', 'skuespill', 'tegneserie', 'barnebok',
  'grammofon', 'platespiller', 'mange lp', 'lp plater', 'lp plate',
  'se bilder og liste', 'cd samling', 'plater til salgs',
  'klær', 'jakke', 'bukse', 'skjorte', 'sko ', 'støvler',
  'sofa', 'stol ', 'bord ', 'lampe', 'hylle', 'møbler',
  'ønsker å kjøpe', 'ønskes kjøpt', 'ønskes å kjøpe', 'leter etter',
  'søker ', 'wanted', 'wtb',
  'playstation', 'xbox', 'nintendo', 'wii ',
  'dvd', 'blu-ray', 'bluray', 'blu ray', 'film ', 'filmer', 'serie ', 'serier',
  'covertrekk', 'støvdeksel', 'flightcase', 'flight case', 'gigbag', 'gig bag',
  'notestativ', 'mikrofonstativ', 'kabinett kun', 'kabinettet',
  'diverse pedaler', 'diverse effekter', 'samling av', 'pakke med',
]
const VINYL_PATTERN = /^[A-Z][a-zA-ZÆØÅæøå\s]+ [-–] [A-Z][a-zA-ZÆØÅæøå\s]+$/
const isGearListing = (title) => {
  const lower = title.toLowerCase()
  if (NON_GEAR_BLOCKLIST.some(term => lower.includes(term))) return false
  if (/^lp:/i.test(title.trim())) return false
  if (/\bpå lp\b/i.test(lower)) return false
  if (/\blp\b/.test(lower) && !/\blp\s*\d/.test(lower) && !/\b(les paul|low[- ]?pass)\b/i.test(lower)) return false
  if (VINYL_PATTERN.test(title.trim()) && !/\d/.test(title)) return false
  return true
}
const { fetchReverbPrices, fetchReverbNewPrice } = require('./scrapers/reverb')

const { fetchEbayPrices, fetchEbayNewPrice } = require('./scrapers/ebay')
const { fetchThomannPrice } = require('./scrapers/thomann')
const { fetchGear4MusicPrice } = require('./scrapers/gear4music')
const { fetchEvenstadPrice } = require('./scrapers/evenstad')
const { calculateDealScore } = require('./scoring')
const { extractModel } = require('./utils/extractModel')
const { aiAnalyzeListing, aiInferCondition, aiDealSummary } = require('./ai')

const AI_ENABLED = !!process.env.OPENAI_API_KEY
const REFRESH_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

// Category-based discovery — broad Norwegian search terms that match all brands.
// Each term returns the newest finn.no listings for that gear type regardless of brand.
// MAX_PER_TERM controls how many listings per term enter the enrichment pool.
const MAX_PER_TERM = 5

const CATEGORIES = [
  {
    id: 'guitar',
    label: 'Guitar',
    terms: ['elektrisk gitar', 'halvakustisk gitar', 'archtop gitar', 'akustisk gitar', 'resonatorgitar'],
  },
  {
    id: 'bass',
    label: 'Bass',
    terms: ['bassgitar', 'elektrisk bass', 'bass gitar', 'fretless bass'],
  },
  {
    id: 'pedals',
    label: 'Pedals',
    terms: ['effektpedal', 'gitarpedal', 'multieffekt gitar', 'loopstation', 'overdrive pedal'],
  },
  {
    id: 'studio',
    label: 'Studio',
    terms: ['lydkort', 'kondensatormikrofon', 'preamp mikrofon', 'kompressor audio', 'audio interface'],
  },
]

// Flatten to [{query, category}] for the fetch loop
const ALL_TERMS = CATEGORIES.flatMap(cat => cat.terms.map(term => ({ query: term, category: cat.id })))

// In-memory state
let _cache = {
  deals: [],
  lastUpdated: null,
  computing: false,
  error: null,
}

function getTopDeals() {
  return { ..._cache }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

const GENERIC_TERMS = /^(electric\s+guitar|acoustic\s+guitar|bass\s+guitar|guitar|bass|keyboard|synthesizer|drum|amp(lifier)?)s?$/i

async function enrichListing(listing) {
  let modelQuery
  let itemType = null
  if (AI_ENABLED) {
    const aiResult = await aiAnalyzeListing(listing.title)
    modelQuery = (aiResult?.modelQuery && !GENERIC_TERMS.test(aiResult.modelQuery.trim()))
      ? aiResult.modelQuery
      : extractModel(listing.title)
    itemType = aiResult?.itemType ?? null
  } else {
    modelQuery = extractModel(listing.title)
  }

  let condition = listing.condition
  if (AI_ENABLED && condition === 'Ikke oppgitt' && listing.description) {
    condition = await aiInferCondition(listing.description)
  }

  const [reverbData, ebayData, thomannData, reverbNewData, ebayNewData, gear4mData, evenstadData] = await Promise.all([
    fetchReverbPrices(modelQuery),
    fetchEbayPrices(modelQuery),
    fetchThomannPrice(modelQuery),
    fetchReverbNewPrice(modelQuery),
    fetchEbayNewPrice(modelQuery),
    fetchGear4MusicPrice(modelQuery),
    fetchEvenstadPrice(modelQuery),
  ])

  const usedMedian = reverbData?.median ?? ebayData?.median ?? null
  const tokens = modelQuery.trim().split(/\s+/)
  const queryTooGeneric = tokens.length <= 2 && !/\d/.test(modelQuery)
  const lowConfidence = (reverbData?.lowConfidence ?? false) || queryTooGeneric

  function newPriceValid(newP) {
    if (!newP) return false
    if (!usedMedian) return true
    return newP >= usedMedian * 0.20 && newP <= usedMedian * 4.0
  }
  const queryTooShort  = tokens.length <= 2
  const evenstadValid  = (!queryTooShort && newPriceValid(evenstadData?.newPrice)) ? evenstadData : null
  const ebayNewValid   = (ebayNewData?.sampleSize >= 3 && newPriceValid(ebayNewData?.newPrice))   ? ebayNewData   : null
  const reverbNewValid = (reverbNewData?.sampleSize >= 3 && newPriceValid(reverbNewData?.newPrice)) ? reverbNewData : null
  const newPriceData = evenstadValid
    ?? thomannData
    ?? gear4mData
    ?? (ebayNewValid ? { newPrice: ebayNewValid.newPrice, source: 'ebay_new' } : null)
    ?? (reverbNewValid ? { newPrice: reverbNewValid.newPrice, source: 'reverb_new' } : null)

  const score = calculateDealScore(
    listing.price,
    reverbData?.median ?? null,
    ebayData?.median ?? null,
    newPriceData?.newPrice ?? null,
    condition,
    lowConfidence,
  )

  let dealSummary = null
  if (AI_ENABLED && score) {
    dealSummary = await aiDealSummary({
      title: listing.title,
      finnPrice: listing.price,
      marketPrice: score.marketPrice,
      thomannNew: thomannData?.newPrice ?? null,
      condition,
      savingsPct: score.savingsPct,
      scoreTotal: score.total,
    })
  }

  return {
    ...listing,
    condition,
    modelQuery,
    itemType,
    dealSummary,
    category: listing.category ?? null,
    priceData: {
      reverb: reverbData,
      ebay: ebayData,
      thomann: thomannData,
      gear4music: gear4mData,
      evenstad: evenstadData,
      reverbNew: reverbNewData,
      newPrice: newPriceData,
    },
    score,
  }
}

async function computeTopDeals() {
  if (_cache.computing) return
  _cache.computing = true
  console.log(`[TopDeals] Starting refresh — ${ALL_TERMS.length} category terms across ${CATEGORIES.length} categories...`)

  try {
    // Fetch all category terms in parallel
    const listingsByTerm = await Promise.all(
      ALL_TERMS.map(({ query }) => fetchFinnListings(query).catch(() => []))
    )

    // Pool + deduplicate — keep up to MAX_PER_TERM newest listings per term
    const seen = new Set()
    const pool = []
    for (let i = 0; i < listingsByTerm.length; i++) {
      const { query, category } = ALL_TERMS[i]
      let count = 0
      for (const listing of listingsByTerm[i]) {
        if (seen.has(listing.url)) continue
        if (!isGearListing(listing.title)) continue
        seen.add(listing.url)
        pool.push({ ...listing, _keyword: query, category })
        count++
        if (count >= MAX_PER_TERM) break
      }
    }

    console.log(`[TopDeals] Enriching ${pool.length} candidate listings...`)

    // Enrich in batches of 5 (parallel within batch, 600ms between batches)
    const enriched = []
    const BATCH = 5
    for (let i = 0; i < pool.length; i += BATCH) {
      const batch = pool.slice(i, i + BATCH)
      const results = await Promise.all(
        batch.map(l => enrichListing(l).catch(err => {
          console.error('[TopDeals] enrich error:', err.message)
          return null
        }))
      )
      enriched.push(...results.filter(Boolean))
      if (i + BATCH < pool.length) await sleep(600)
    }

    // Filter to listings with a real score, sort descending
    // Qualification thresholds — each exists to block a specific failure mode:
    //   - price >= 500 NOK          : rules out cheap accessories, vinyl, sample packs
    //   - savings >= 1500 NOK       : a 96% discount on a 50 kr item is not a "deal"
    //   - lowConfidence === false   : generic queries (e.g. "Fender Stratocaster") produce
    //                                 mixed-tier Reverb medians — the % discount is not
    //                                 trustworthy enough to feature as a top deal
    //   - isDealer === false        : dealer listings are already marked up; their "discount"
    //                                 vs used-market median is systematically misleading
    // Store all qualified deals — client slices to top 10 per category view
    const scored = enriched
      .filter(l =>
        l.score &&
        l.score.total >= 35 &&
        l.score.hasMarketData &&
        l.price >= 500 &&
        (l.score.savings == null || l.score.savings >= 1500) &&
        !l.score.lowConfidence &&
        !l.isDealer
      )
      .sort((a, b) => b.score.total - a.score.total)

    _cache = {
      deals: scored,
      lastUpdated: new Date().toISOString(),
      computing: false,
      error: null,
    }

    console.log(`[TopDeals] Done. Top score: ${scored[0]?.score?.total ?? 'n/a'}, cached ${scored.length} qualified deals from ${ALL_TERMS.length} category terms.`)
  } catch (err) {
    console.error('[TopDeals] Compute failed:', err.message)
    _cache.computing = false
    _cache.error = err.message
  }
}

function startTopDealsEngine() {
  // Kick off immediately in background
  computeTopDeals()
  // Then refresh every 30 minutes
  setInterval(computeTopDeals, REFRESH_INTERVAL_MS)
}

module.exports = { getTopDeals, startTopDealsEngine, computeTopDeals }
