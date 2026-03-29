const { fetchFinnListings } = require('./scrapers/finn')
const { fetchReverbPrices } = require('./scrapers/reverb')
const { fetchEbayPrices } = require('./scrapers/ebay')
const { fetchThomannPrice } = require('./scrapers/thomann')
const { calculateDealScore } = require('./scoring')
const { extractModel } = require('./utils/extractModel')
const { aiExtractModel, aiInferCondition, aiDealSummary } = require('./ai')

const AI_ENABLED = !!process.env.OPENAI_API_KEY
const REFRESH_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

// Popular gear searched on finn.no — broad mix of guitars, studio, synths, amps
const POPULAR_SEARCHES = [
  'Fender Stratocaster',
  'Gibson Les Paul',
  'PRS',
  'Marshall JCM',
  'Orange Rockerverb',
  'UA Apollo',
  'Focusrite Scarlett',
  'SSL 2',
  'Neve 1073',
  'Moog',
  'Korg Minilogue',
  'Roland TR-8',
  'Nord Piano',
  'Strymon',
  'Eventide H9',
]

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

async function enrichListing(listing) {
  let modelQuery
  if (AI_ENABLED) {
    modelQuery = await aiExtractModel(listing.title)
    if (!modelQuery) modelQuery = extractModel(listing.title)
  } else {
    modelQuery = extractModel(listing.title)
  }

  let condition = listing.condition
  if (AI_ENABLED && condition === 'Ikke oppgitt' && listing.description) {
    condition = await aiInferCondition(listing.description)
  }

  const [reverbData, ebayData, thomannData] = await Promise.all([
    fetchReverbPrices(modelQuery),
    fetchEbayPrices(modelQuery),
    fetchThomannPrice(modelQuery),
  ])

  const score = calculateDealScore(
    listing.price,
    reverbData?.median ?? null,
    ebayData?.median ?? null,
    thomannData?.newPrice ?? null,
    condition,
    reverbData?.lowConfidence ?? false,
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
    dealSummary,
    priceData: { reverb: reverbData, ebay: ebayData, thomann: thomannData },
    score,
  }
}

async function computeTopDeals() {
  if (_cache.computing) return
  _cache.computing = true
  console.log('[TopDeals] Starting refresh across', POPULAR_SEARCHES.length, 'searches...')

  try {
    // Fetch listings for all keywords in parallel — each keyword's enrichment is staggered internally
    const listingsByKeyword = await Promise.all(
      POPULAR_SEARCHES.map(kw => fetchFinnListings(kw).catch(() => []))
    )

    // Pool + deduplicate by URL — keep up to 4 listings per keyword to limit enrichment load
    const seen = new Set()
    const pool = []
    for (let i = 0; i < listingsByKeyword.length; i++) {
      const kw = POPULAR_SEARCHES[i]
      let count = 0
      for (const listing of listingsByKeyword[i]) {
        if (seen.has(listing.url)) continue
        seen.add(listing.url)
        pool.push({ ...listing, _keyword: kw })
        count++
        if (count >= 4) break
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
    const scored = enriched
      .filter(l => l.score && l.score.total > 0 && l.score.hasMarketData)
      .sort((a, b) => b.score.total - a.score.total)
      .slice(0, 10)

    _cache = {
      deals: scored,
      lastUpdated: new Date().toISOString(),
      computing: false,
      error: null,
    }

    console.log(`[TopDeals] Done. Top score: ${scored[0]?.score?.total ?? 'n/a'}, cached ${scored.length} deals.`)
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
