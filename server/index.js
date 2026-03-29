require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')

const { fetchFinnListings } = require('./scrapers/finn')
const { fetchReverbPrices } = require('./scrapers/reverb')
const { fetchEbayPrices } = require('./scrapers/ebay')
const { fetchThomannPrice } = require('./scrapers/thomann')
const { calculateDealScore } = require('./scoring')
const { extractModel } = require('./utils/extractModel')
const { aiExtractModel, aiInferCondition, aiDealSummary } = require('./ai')
const { getTopDeals, startTopDealsEngine, computeTopDeals } = require('./topDeals')

const AI_ENABLED = !!process.env.OPENAI_API_KEY

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
  let modelQuery
  if (AI_ENABLED) {
    modelQuery = await aiExtractModel(listing.title)
    if (!modelQuery) modelQuery = extractModel(listing.title)
  } else {
    modelQuery = extractModel(listing.title)
  }

  // 2. Infer condition from description if badge said "Ikke oppgitt"
  let condition = listing.condition
  if (AI_ENABLED && condition === 'Ikke oppgitt' && listing.description) {
    condition = await aiInferCondition(listing.description)
  }

  // 3. Fetch all price sources in parallel
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

  // 4. Generate AI deal summary
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
