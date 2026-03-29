const cheerio = require('cheerio')
const NodeCache = require('node-cache')
const { convertToNOK } = require('../currency')
const { median } = require('../scoring')
const { proxyGet } = require('../utils/proxy')

const cache = new NodeCache({ stdTTL: 21600 }) // 6 hours

const EBAY_BASE = 'https://www.ebay.com'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

/**
 * Parse a price string from eBay's search results.
 * Handles: "$1,299.99", "£899.00", "€1.199,00", "$100.00 to $200.00" (range → take first)
 */
function parseEbayPrice(text) {
  if (!text) return null

  let currency = 'USD'
  if (text.includes('£'))               currency = 'GBP'
  else if (text.includes('€'))          currency = 'EUR'
  else if (/C\s*\$|CDN/.test(text))     currency = 'CAD'
  else if (/AU\s*\$/.test(text))        currency = 'AUD'

  // For ranges ("$100.00 to $200.00") take the first value
  const match = text.match(/[\d,]+\.?\d*/)
  if (!match) return null
  const amount = parseFloat(match[0].replace(/,/g, ''))
  return (!amount || isNaN(amount)) ? null : { amount, currency }
}

/**
 * Fetch sold/completed eBay listing prices for a model query.
 * Scrapes the completed listings page — no API key required.
 */
async function fetchEbayPrices(modelQuery) {
  const cacheKey = `ebay:${modelQuery.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  const url = `${EBAY_BASE}/sch/i.html?_nkw=${encodeURIComponent(modelQuery)}&LH_Complete=1&LH_Sold=1&_ipg=48`

  try {
    const { data } = await proxyGet(url, { headers: HEADERS, timeout: 20000 })
    const $ = cheerio.load(data)

    const rawItems = []
    $('.s-item').each((_, el) => {
      const title = $(el).find('.s-item__title').text().trim()
      if (!title || title.includes('Shop on eBay')) return
      const priceText = $(el).find('.s-item__price').text().trim()
      const parsed = parseEbayPrice(priceText)
      if (parsed) rawItems.push(parsed)
    })

    if (!rawItems.length) {
      cache.set(cacheKey, null)
      return null
    }

    const prices = []
    for (const { amount, currency } of rawItems) {
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
 * Fetch the lowest current new/fixed-price listing on eBay as a retail price proxy.
 * Uses Buy It Now + New condition, sorted by lowest price.
 */
async function fetchEbayNewPrice(modelQuery) {
  const cacheKey = `ebay:new:${modelQuery.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  const url = `${EBAY_BASE}/sch/i.html?_nkw=${encodeURIComponent(modelQuery)}&LH_BIN=1&LH_ItemCondition=1000&_sop=15&_ipg=10`

  try {
    const { data } = await proxyGet(url, { headers: HEADERS, timeout: 20000 })
    const $ = cheerio.load(data)

    const rawItems = []
    $('.s-item').each((_, el) => {
      const title = $(el).find('.s-item__title').text().trim()
      if (!title || title.includes('Shop on eBay')) return
      const priceText = $(el).find('.s-item__price').text().trim()
      const parsed = parseEbayPrice(priceText)
      if (parsed) rawItems.push(parsed)
    })

    if (!rawItems.length) {
      cache.set(cacheKey, null, 43200)
      return null
    }

    const prices = []
    for (const { amount, currency } of rawItems.slice(0, 5)) {
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
