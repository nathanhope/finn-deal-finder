const cheerio = require('cheerio')
const NodeCache = require('node-cache')
const { proxyGet } = require('../utils/proxy')

const cache = new NodeCache({ stdTTL: 86400 }) // 24 hours

// Full modern Chrome fingerprint — best chance of passing Cloudflare's basic bot checks
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not=A?Brand";v="8"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
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
  const cacheKey = `thomann:${modelQuery.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  const searchUrl = `https://www.thomann.de/no/search_dir.html?sw=${encodeURIComponent(modelQuery)}`

  try {
    const { data } = await proxyGet(searchUrl, { headers: HEADERS, timeout: 25000 }, { render: true })
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
