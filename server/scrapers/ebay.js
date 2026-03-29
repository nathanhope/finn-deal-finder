const axios = require('axios')
const NodeCache = require('node-cache')
const { convertToNOK } = require('../currency')
const { median } = require('../scoring')

const cache = new NodeCache({ stdTTL: 21600 }) // 6 hours

const EBAY_API = 'https://svcs.ebay.com/services/search/FindingService/v1'

async function fetchEbayPrices(modelQuery) {
  const appId = process.env.EBAY_APP_ID
  if (!appId) {
    console.warn('EBAY_APP_ID not set — skipping eBay lookup')
    return null
  }

  const cacheKey = `ebay:${modelQuery.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  try {
    const { data } = await axios.get(EBAY_API, {
      params: {
        'OPERATION-NAME': 'findCompletedItems',
        'SERVICE-NAME': 'FindingService',
        'SERVICE-VERSION': '1.0.0',
        'SECURITY-APPNAME': appId,
        'RESPONSE-DATA-FORMAT': 'JSON',
        'keywords': modelQuery,
        'itemFilter(0).name': 'SoldItemsOnly',
        'itemFilter(0).value': 'true',
        'paginationInput.entriesPerPage': '20',
        'outputSelector': 'SellerInfo',
      },
      timeout: 8000,
    })

    const response = data?.findCompletedItemsResponse?.[0]
    const ack = response?.ack?.[0]
    if (ack !== 'Success' && ack !== 'Warning') {
      cache.set(cacheKey, null)
      return null
    }

    const items = response?.searchResult?.[0]?.item || []
    if (!items.length) {
      cache.set(cacheKey, null)
      return null
    }

    const prices = []
    for (const item of items) {
      const priceObj = item?.sellingStatus?.[0]?.currentPrice?.[0]
      if (!priceObj) continue
      const amount = parseFloat(priceObj.__value__)
      const currency = priceObj['@currencyId'] || 'USD'
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
    }

    cache.set(cacheKey, result)
    return result
  } catch (err) {
    console.error(`eBay error for "${modelQuery}":`, err.message)
    cache.set(cacheKey, null)
    return null
  }
}

/**
 * Fetch the current lowest new price for a model from eBay active Fixed Price listings.
 * Uses condition ID 1000 (New). Returns the lowest NOK price as a retail/MAP proxy.
 * Cached 12h (new prices are stable day-to-day).
 */
async function fetchEbayNewPrice(modelQuery) {
  const appId = process.env.EBAY_APP_ID
  if (!appId) return null

  const cacheKey = `ebay:new:${modelQuery.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  try {
    const { data } = await axios.get(EBAY_API, {
      params: {
        'OPERATION-NAME': 'findItems',
        'SERVICE-NAME': 'FindingService',
        'SERVICE-VERSION': '1.0.0',
        'SECURITY-APPNAME': appId,
        'RESPONSE-DATA-FORMAT': 'JSON',
        'keywords': modelQuery,
        'itemFilter(0).name': 'Condition',
        'itemFilter(0).value': '1000', // New
        'itemFilter(1).name': 'ListingType',
        'itemFilter(1).value': 'FixedPrice',
        'sortOrder': 'PricePlusShippingLowest',
        'paginationInput.entriesPerPage': '10',
      },
      timeout: 8000,
    })

    const response = data?.findItemsResponse?.[0]
    const ack = response?.ack?.[0]
    if (ack !== 'Success' && ack !== 'Warning') {
      cache.set(cacheKey, null, 43200)
      return null
    }

    const items = response?.searchResult?.[0]?.item || []
    if (!items.length) {
      cache.set(cacheKey, null, 43200)
      return null
    }

    const prices = []
    for (const item of items.slice(0, 5)) {
      const priceObj = item?.sellingStatus?.[0]?.currentPrice?.[0]
      if (!priceObj) continue
      const amount = parseFloat(priceObj.__value__)
      const currency = priceObj['@currencyId'] || 'USD'
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
      source: 'ebay_new',
    }
    cache.set(cacheKey, result, 43200) // 12h
    return result
  } catch (err) {
    console.error(`eBay new price error for "${modelQuery}":`, err.message)
    cache.set(cacheKey, null, 43200)
    return null
  }
}

module.exports = { fetchEbayPrices, fetchEbayNewPrice }
