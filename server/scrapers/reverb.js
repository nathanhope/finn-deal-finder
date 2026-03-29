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

    const prices = []
    for (const listing of listings) {
      const amount = parseFloat(listing?.price?.amount)
      const currency = listing?.price?.currency || 'USD'
      if (!amount || isNaN(amount)) continue

      const nok = await convertToNOK(amount, currency)
      if (nok) prices.push(nok)
    }

    if (!prices.length) {
      cache.set(cacheKey, null)
      return null
    }

    const med = median(prices)
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length
    const result = {
      median: Math.round(med),
      average: Math.round(avg),
      sampleSize: prices.length,
      currency: 'NOK',
      lowConfidence: prices.length < 3,
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

module.exports = { fetchReverbPrices }
