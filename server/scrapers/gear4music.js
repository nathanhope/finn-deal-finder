// Gear4Music — large UK/European music retailer, ships to Norway.
// Prices are in GBP; currency.js converts to NOK via frankfurter.app.
// Scrapes search results page for the first matching product's price.
// Cache TTL: 24h (retail prices are stable day-to-day).

const axios = require('axios')
const cheerio = require('cheerio')
const NodeCache = require('node-cache')
const { convertToNOK } = require('../currency')

const cache = new NodeCache({ stdTTL: 86400 }) // 24h

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

function parseGBP(text) {
  if (!text) return null
  // Prices like "£1,299.00" or "1299.00" or "£999"
  const cleaned = text.replace(/[^0-9.]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) || num <= 0 ? null : num
}

async function fetchGear4MusicPrice(modelQuery) {
  const cacheKey = `g4m:${modelQuery.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  const searchUrl = `https://www.gear4music.com/search?q=${encodeURIComponent(modelQuery)}`

  try {
    const { data } = await axios.get(searchUrl, { headers: HEADERS, timeout: 10000 })
    const $ = cheerio.load(data)

    let gbpPrice = null
    let productUrl = null
    let productName = null

    // Gear4Music search result cards — try primary selectors first
    // Product cards typically have class containing 'product' and a price element
    const cards = $('[class*="product-card"], [class*="ProductCard"], .g4m-product, li.product').toArray()

    for (const card of cards.slice(0, 3)) {
      const el = $(card)
      // Skip sponsored/ad blocks
      if (el.attr('data-sponsored') || el.hasClass('sponsored')) continue

      const priceEl = el.find('[class*="price"]:not([class*="was"]):not([class*="rrp"]), [itemprop="price"]').first()
      const priceText = priceEl.attr('content') || priceEl.text()
      const price = parseGBP(priceText)
      if (price && price > 10) {
        gbpPrice = price
        const link = el.find('a[href]').first()
        productUrl = link.attr('href') || null
        productName = el.find('[class*="title"], [class*="name"], h2, h3').first().text().trim() || null
        break
      }
    }

    // Fallback: structured data (JSON-LD)
    if (!gbpPrice) {
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).html())
          const items = Array.isArray(json) ? json : [json]
          for (const item of items) {
            const price = parseFloat(item?.offers?.price || item?.price)
            if (!isNaN(price) && price > 10) {
              gbpPrice = price
              productUrl = item?.url || null
              productName = item?.name || null
              return false // break
            }
          }
        } catch { /* ignore malformed JSON-LD */ }
      })
    }

    if (!gbpPrice) {
      cache.set(cacheKey, null)
      return null
    }

    const nok = await convertToNOK(gbpPrice, 'GBP')
    if (!nok) {
      cache.set(cacheKey, null)
      return null
    }

    const result = {
      newPrice: Math.round(nok),
      currency: 'GBP',
      url: productUrl ? (productUrl.startsWith('http') ? productUrl : `https://www.gear4music.com${productUrl}`) : searchUrl,
      productName,
    }

    cache.set(cacheKey, result)
    return result
  } catch (err) {
    // Gear4Music is Cloudflare-protected — 403s are expected, don't flood the logs
    if (err.response?.status !== 403) {
      console.error(`Gear4Music error for "${modelQuery}":`, err.message)
    }
    cache.set(cacheKey, null)
    return null
  }
}

module.exports = { fetchGear4MusicPrice }
