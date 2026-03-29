require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')

const { fetchFinnListings, fetchFinnListing } = require('./scrapers/finn')
const { fetchReverbPrices, fetchReverbNewPrice } = require('./scrapers/reverb')
const { fetchEbayPrices, fetchEbayNewPrice } = require('./scrapers/ebay')
const { fetchThomannPrice } = require('./scrapers/thomann')
const { fetchGear4MusicPrice } = require('./scrapers/gear4music')
const { fetchEvenstadPrice } = require('./scrapers/evenstad')
const { calculateDealScore } = require('./scoring')
const { extractModel } = require('./utils/extractModel')
const { aiExtractModel, aiInferCondition, aiDealSummary } = require('./ai')
const { getTopDeals, startTopDealsEngine, computeTopDeals } = require('./topDeals')

const AI_ENABLED = !!process.env.OPENAI_API_KEY

// Terms that indicate a listing is NOT actual music gear
const NON_GEAR_BLOCKLIST = [
  // Game controllers / toys
  'spillkontroller', 'guitar hero', 'rock band', 'lekegitar', 'leketøy', 'leke ',
  'dukke', 'barnelek', 'barneleke',
  // Books / media
  'bok ', 'bøker', 'kokebøker', 'krim', 'roman', 'biografi', 'skuespill',
  'tegneserie', 'barnebok',
  // Vinyl / CDs
  'grammofon', 'platespiller', 'mange lp', 'lp plater', 'lp plate',
  'se bilder og liste', 'cd samling', 'plater til salgs',
  // Clothes / furniture
  'klær', 'jakke', 'bukse', 'skjorte', 'sko ', 'støvler',
  'sofa', 'stol ', 'bord ', 'lampe', 'hylle', 'møbler',
  // Want-to-buy listings
  'ønsker å kjøpe', 'søker ', 'wanted',
  // Gaming hardware
  'playstation', 'xbox', 'nintendo', 'wii ',
  // Media / movies / TV
  'dvd', 'blu-ray', 'bluray', 'blu ray', 'film ', 'filmer', 'serie ', 'serier',
  // Accessories / covers / cases (not the gear itself)
  'covertrekk', 'støvdeksel', 'flightcase', 'flight case', 'gigbag', 'gig bag',
  'notestativ', 'mikrofonstativ', 'kabinett kun', 'kabinettet',
  // Bundle / lot listings (can't be meaningfully scored against a single item)
  'diverse pedaler', 'diverse effekter', 'samling av', 'pakke med',
]

// Album/vinyl pattern: "Artist Name - Album Title" with no gear keywords
// These look like "Joan Armatrading - The Key" or "Rick Wakeman – No Earthly..."
const VINYL_PATTERN = /^[A-Z][a-zA-ZÆØÅæøå\s]+ [-–] [A-Z][a-zA-ZÆØÅæøå\s]+$/

function isGearListing(title) {
  const lower = title.toLowerCase()
  if (NON_GEAR_BLOCKLIST.some(term => lower.includes(term))) return false
  // Filter vinyl LP listings — "LP:" prefix, "på LP", or " LP " as standalone word
  if (/^lp:/i.test(title.trim())) return false
  if (/\bpå lp\b/i.test(lower)) return false
  if (/\blp\b/.test(lower) && !/\blp\s*\d/.test(lower) && !/\b(les paul|low[- ]?pass)\b/i.test(lower)) return false
  // Filter pure "Artist - Album" patterns (no numbers, no gear words)
  if (VINYL_PATTERN.test(title.trim()) && !/\d/.test(title)) return false
  return true
}

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// Serve built React app in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../client/dist')
  app.use(express.static(clientBuild))
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Enrich a single finn listing with external price data and deal score.
 */
async function enrichListing(listing) {
  // 1. Extract model — prefer AI, fall back to regex
  // Reject AI output that is a useless generic term (no brand-specific signal)
  const GENERIC_TERMS = /^(electric\s+guitar|acoustic\s+guitar|bass\s+guitar|guitar|bass|keyboard|synthesizer|drum|amp(lifier)?)s?$/i
  let modelQuery
  if (AI_ENABLED) {
    const aiResult = await aiExtractModel(listing.title)
    modelQuery = (aiResult && !GENERIC_TERMS.test(aiResult.trim()))
      ? aiResult
      : extractModel(listing.title)
  } else {
    modelQuery = extractModel(listing.title)
  }

  // 2. Infer condition from description if badge said "Ikke oppgitt"
  let condition = listing.condition
  if (AI_ENABLED && condition === 'Ikke oppgitt' && listing.description) {
    condition = await aiInferCondition(listing.description)
  }

  // 3. Fetch all price sources in parallel
  const [reverbData, ebayData, thomannData, reverbNewData, ebayNewData, gear4mData, evenstadData] = await Promise.all([
    fetchReverbPrices(modelQuery),
    fetchEbayPrices(modelQuery),
    fetchThomannPrice(modelQuery),
    fetchReverbNewPrice(modelQuery),
    fetchEbayNewPrice(modelQuery),
    fetchGear4MusicPrice(modelQuery),
    fetchEvenstadPrice(modelQuery),
  ])

  // Resolve new price — preference order: Thomann → Gear4Music → eBay new → Reverb new.
  // eBay new and Reverb new both require ≥3 listings and price ≥ 20% of used median.
  // The 20% floor rejects accessory mismatches (cables/picks matching brand keywords).
  const usedMedian = reverbData?.median ?? ebayData?.median ?? null
  // A query with ≤3 tokens and no digit (year/model number) is likely a generic family name
  // (e.g. "Gibson Les Paul", "Fender Stratocaster") with no tier/variant info — Reverb results
  // will be a mixed bag of price tiers. Flag as low confidence.
  const tokens = modelQuery.trim().split(/\s+/)
  const queryTooGeneric = tokens.length <= 3 && !/\d/.test(modelQuery)
  const lowConfidence = (reverbData?.lowConfidence ?? false) || queryTooGeneric

  // New price sanity bounds — lower/upper relative to used median:
  //   ≥ 20% : rejects accessories (e.g. JCM800 pedal matching amp query)
  //   ≤ 400%: rejects tier mismatches (e.g. Custom Shop for Standard query)
  function newPriceValid(newP) {
    if (!newP) return false
    if (!usedMedian) return true
    return newP >= usedMedian * 0.20 && newP <= usedMedian * 4.0
  }
  // Evenstad skipped for 2-token family queries (e.g. "Fender Stratocaster", "Gibson SG").
  // 3-token queries like "Korg Minilogue XD" are specific enough; price bounds handle the rest.
  const queryTooShort  = tokens.length <= 2
  const evenstadValid  = (!queryTooShort && newPriceValid(evenstadData?.newPrice)) ? evenstadData : null
  const ebayNewValid   = (ebayNewData?.sampleSize >= 3 && newPriceValid(ebayNewData?.newPrice))   ? ebayNewData   : null
  const reverbNewValid = (reverbNewData?.sampleSize >= 3 && newPriceValid(reverbNewData?.newPrice)) ? reverbNewData : null
  // Priority: Evenstad (NOK, Norwegian market) → Thomann → Gear4Music → eBay new → Reverb new
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

  // 5. Generate AI deal summary
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

/**
 * GET /api/search
 * Query params:
 *   q         — keyword (required)
 *   maxPrice  — max finn price in NOK (optional)
 *   minScore  — minimum deal score 0–100 (optional, default 0)
 *   condition — condition filter string (optional)
 *   sort      — 'score' | 'price' | 'newest' (default: 'score')
 */
app.get('/api/search', async (req, res) => {
  const { q, maxPrice, minScore = 0, condition, sort = 'score' } = req.query

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters.' })
  }

  try {
    // 1. Fetch finn.no listings
    let listings = await fetchFinnListings(q.trim())

    if (!listings.length) {
      return res.json({ results: [], query: q, total: 0 })
    }

    // 2. Apply pre-filters before enrichment (save API calls)
    listings = listings.filter(l => isGearListing(l.title))

    if (maxPrice) {
      const cap = parseInt(maxPrice, 10)
      if (!isNaN(cap)) listings = listings.filter(l => l.price <= cap)
    }
    if (condition && condition !== 'any') {
      listings = listings.filter(l => l.condition === condition)
    }

    // Limit to 20 listings to keep response times sane
    listings = listings.slice(0, 20)

    // 3. Enrich each listing with price data + score
    // Stagger requests 500ms apart to be polite to external APIs
    const enriched = []
    for (let i = 0; i < listings.length; i++) {
      if (i > 0) await sleep(500)
      try {
        const result = await enrichListing(listings[i])
        enriched.push(result)
      } catch (err) {
        console.error(`Error enriching listing "${listings[i].title}":`, err.message)
        // Include unenriched listing with null score
        enriched.push({
          ...listings[i],
          modelQuery: extractModel(listings[i].title),
          priceData: { reverb: null, ebay: null, thomann: null },
          score: null,
        })
      }
    }

    // 4. Apply min score filter
    const minScoreInt = parseInt(minScore, 10) || 0
    let filtered = enriched.filter(l => {
      if (!l.score) return minScoreInt === 0
      return l.score.total >= minScoreInt
    })

    // 5. Sort
    filtered.sort((a, b) => {
      if (sort === 'price') return a.price - b.price
      if (sort === 'newest') {
        const da = a.publishedAt ? new Date(a.publishedAt) : new Date(0)
        const db = b.publishedAt ? new Date(b.publishedAt) : new Date(0)
        return db - da
      }
      // Default: by score descending
      const sa = a.score?.total ?? -1
      const sb = b.score?.total ?? -1
      return sb - sa
    })

    res.json({
      results: filtered,
      query: q,
      total: filtered.length,
      enrichedCount: enriched.length,
    })
  } catch (err) {
    console.error('Search error:', err)
    res.status(500).json({ error: 'Search failed. Please try again.' })
  }
})

/**
 * GET /api/score?url=<finn_listing_url>
 * Score a single finn.no listing by URL.
 * Returns the same enriched listing shape as /api/search results.
 */
app.get('/api/score', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'Missing url parameter.' })

  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    return res.status(400).json({ error: 'Invalid URL.' })
  }

  if (!parsedUrl.hostname.includes('finn.no')) {
    return res.status(400).json({ error: 'URL must be a finn.no listing.' })
  }

  try {
    const listing = await fetchFinnListing(url)
    if (!listing) {
      return res.status(404).json({ error: 'Could not fetch listing. It may have been removed or the URL is invalid.' })
    }

    const enriched = await enrichListing(listing)
    res.json({ result: enriched })
  } catch (err) {
    console.error('Score error:', err)
    res.status(500).json({ error: 'Scoring failed. Please try again.' })
  }
})

// Top 10 deals — returns cached result instantly
app.get('/api/top-deals', (req, res) => {
  res.json(getTopDeals())
})

// Manual refresh trigger
app.post('/api/top-deals/refresh', (req, res) => {
  computeTopDeals()
  res.json({ message: 'Refresh triggered' })
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// SPA fallback in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`\n🎸 GearFind server running on http://localhost:${PORT}`)
  console.log(`   eBay API: ${process.env.EBAY_APP_ID ? '✓ configured' : '✗ not set (EBAY_APP_ID missing)'}`)
  console.log(`   OpenAI: ${AI_ENABLED ? `✓ ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}` : '✗ not set'}`)
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`)
  // Start the top 10 engine in the background
  startTopDealsEngine()
})
