const axios = require('axios')
const NodeCache = require('node-cache')
const { convertToNOK } = require('../currency')
const { median } = require('../scoring')

const cache = new NodeCache({ stdTTL: 21600 }) // 6 hours

const REVERB_API = 'https://api.reverb.com/api'

const HEADERS = {
  'Accept': 'application/hal+json',
  'Accept-Version': '3.0',
  'User-Agent': 'GearFindNO/1.0',
}

/**
 * Remove lower price tier when the sample contains two distinct product classes
 * (e.g. dust covers + actual cabinets). Detects the largest relative price gap:
 * if next price is 3x+ the current price AND the upper tier has ≥3 items AND
 * the lower tier is ≥40% of the sample, the lower tier is discarded.
 *
 * Operates on entry objects with a `nok` field so URL/title metadata is preserved.
 */
function removeLowerPriceTier(entries) {
  if (entries.length < 6) return entries
  const sorted = [...entries].sort((a, b) => a.nok - b.nok)

  let maxGapRatio = 0
  let maxGapIdx = -1
  for (let i = 0; i < sorted.length - 1; i++) {
    const ratio = (sorted[i + 1].nok - sorted[i].nok) / sorted[i].nok
    if (ratio > maxGapRatio) {
      maxGapRatio = ratio
      maxGapIdx = i
    }
  }

  const lowerCount = maxGapIdx + 1
  const upperCount = sorted.length - lowerCount
  const lowerFraction = lowerCount / sorted.length

  if (maxGapRatio > 2.0 && lowerFraction >= 0.4 && upperCount >= 3) {
    return sorted.slice(maxGapIdx + 1)
  }

  return entries
}

async function fetchReverbPrices(modelQuery) {
  const cacheKey = `reverb:${modelQuery.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  try {
    const { data } = await axios.get(`${REVERB_API}/listings`, {
      headers: HEADERS,
      params: {
        query: modelQuery,
        state: 'sold',
        per_page: 20,
      },
      timeout: 8000,
    })

    const listings = data?.listings || data?._embedded?.listings || []
    if (!listings.length) {
      const result = null
      cache.set(cacheKey, result)
      return result
    }

    const entries = []
    for (const listing of listings) {
      const amount = parseFloat(listing?.price?.amount)
      const currency = listing?.price?.currency || 'USD'
      if (!amount || isNaN(amount)) continue

      const nok = await convertToNOK(amount, currency)
      if (nok) entries.push({
        nok,
        title: listing.title || null,
        url: listing._links?.web?.href || null,
        originalPrice: amount,
        originalCurrency: currency,
      })
    }

    if (!entries.length) {
      cache.set(cacheKey, null)
      return null
    }

    // Detect accessory contamination: if there's a large price gap in the sample
    // with the lower tier dominating (e.g. dust covers mixed with cabinets),
    // discard the lower tier and score against the upper tier only.
    const cleanedEntries = removeLowerPriceTier(entries)
    const cleanedPrices = cleanedEntries.map(e => e.nok)

    const med = median(cleanedPrices)
    const avg = cleanedPrices.reduce((a, b) => a + b, 0) / cleanedPrices.length

    // Keep the 5 listings closest to the median as reference links
    const sampleListings = [...cleanedEntries]
      .sort((a, b) => Math.abs(a.nok - med) - Math.abs(b.nok - med))
      .slice(0, 5)
      .map(e => ({ title: e.title, url: e.url, price: Math.round(e.nok) }))

    const result = {
      median: Math.round(med),
      average: Math.round(avg),
      sampleSize: cleanedEntries.length,
      currency: 'NOK',
      lowConfidence: entries.length < 3,
      sampleListings,
      searchUrl: `https://reverb.com/marketplace?query=${encodeURIComponent(modelQuery)}&condition=sold`,
    }

    cache.set(cacheKey, result)
    return result
  } catch (err) {
    console.error(`Reverb error for "${modelQuery}":`, err.message)
    cache.set(cacheKey, null)
    return null
  }
}

/**
 * Fetch the current new/B-stock street price for a model from Reverb dealer listings.
 * Returns the lowest available new price as a proxy for current retail/MAP pricing.
 * Cached 12h (new prices change less frequently than sold data).
 */
async function fetchReverbNewPrice(modelQuery) {
  const cacheKey = `reverb:new:${modelQuery.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  try {
    const { data } = await axios.get(`${REVERB_API}/listings`, {
      headers: HEADERS,
      params: {
        query: modelQuery,
        item_condition: 'brand_new,b_stock',
        per_page: 10,
        sort: 'price_asc',
      },
      timeout: 8000,
    })

    const listings = data?.listings || data?._embedded?.listings || []

    const prices = []
    for (const listing of listings) {
      const amount = parseFloat(listing?.price?.amount)
      const currency = listing?.price?.currency || 'USD'
      if (!amount || isNaN(amount)) continue
      const nok = await convertToNOK(amount, currency)
      if (nok) prices.push(nok)
    }

    if (!prices.length) {
      cache.set(cacheKey, null, 43200)
      return null
    }

    prices.sort((a, b) => a - b)
    const result = {
      newPrice: Math.round(prices[0]),
      sampleSize: prices.length,
      source: 'reverb',
    }
    cache.set(cacheKey, result, 43200) // 12h
    return result
  } catch (err) {
    console.error(`Reverb new price error for "${modelQuery}":`, err.message)
    cache.set(cacheKey, null, 43200)
    return null
  }
}

module.exports = { fetchReverbPrices, fetchReverbNewPrice }
