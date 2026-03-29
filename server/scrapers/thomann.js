// NOTE: Thomann.de is protected by Cloudflare and cannot be scraped server-side.
// fetchThomannPrice always returns null; the scoring engine reweights to 57/43
// (market discount + condition) when Thomann data is unavailable.
// To restore this feature, a paid scraping proxy (e.g. ScraperAPI, Apify) would be needed.

const axios = require('axios')
const cheerio = require('cheerio')
const NodeCache = require('node-cache')

const cache = new NodeCache({ stdTTL: 86400 }) // 24 hours

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'no,en-US;q=0.7,en;q=0.3',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

// NOTE: Thomann's .no locale displays prices in NOK.
// Selectors here are based on Thomann's typical product listing structure.
// If prices are not being extracted, inspect thomann.de/no search results
// and update the .fx-product-listing-price or .price selectors accordingly.

function parseThomPrice(text) {
  if (!text) return null
  // Thomann NOK prices look like "1 299,–" or "2.499,-" or "12 499 kr"
  const cleaned = text
    .replace(/kr\.?/gi, '')
    .replace(/[,–\-]+$/, '')  // trailing dash/comma
    .replace(/\s/g, '')
    .replace(/\./g, '')       // thousands separator
    .replace(/,/g, '.')       // decimal comma → dot
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

async function fetchThomannPrice(modelQuery) {
  return null // Cloudflare-protected, see note at top of file

  const cacheKey = `thomann:${modelQuery.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  const searchUrl = `https://www.thomann.de/no/search_dir.html?sw=${encodeURIComponent(modelQuery)}`

  try {
    const { data } = await axios.get(searchUrl, { headers: HEADERS, timeout: 10000 })
    const $ = cheerio.load(data)

    let newPrice = null
    let productUrl = null

    // Thomann search results — try common selectors
    // Primary: .fx-product-listing-price or [data-product] structure
    const firstResult = $('.product-list .product, .fx-producttile, article.product').first()

    if (firstResult.length) {
      const priceEl = firstResult.find('[class*="price"], .fx-product-listing-price').first()
      newPrice = parseThomPrice(priceEl.text())

      const linkEl = firstResult.find('a[href]').first()
      productUrl = linkEl.attr('href') || null
      if (productUrl && !productUrl.startsWith('http')) {
        productUrl = 'https://www.thomann.de' + productUrl
      }
    }

    if (!newPrice) {
      // Broader fallback: first price-looking element on page
      $('[class*="price"]').each((i, el) => {
        const val = parseThomPrice($(el).text())
        if (val && val > 100) {
          newPrice = val
          return false // break
        }
      })
    }

    const result = newPrice
      ? { newPrice: Math.round(newPrice), currency: 'NOK', url: productUrl || searchUrl }
      : null

    cache.set(cacheKey, result)
    return result
  } catch (err) {
    console.error(`Thomann error for "${modelQuery}":`, err.message)
    cache.set(cacheKey, null)
    return null
  }
}

module.exports = { fetchThomannPrice }
