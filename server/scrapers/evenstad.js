// Evenstad Musikk (evenstadmusikk.no) — Norwegian music retailer, prices in NOK.
// No Cloudflare protection — fully scrapeable server-side.
// Strategy:
//   1. Search page → extract first relevant product URL (product links are in initial HTML)
//   2. Product page → extract price from text pattern (e.g. "49 207,-")
// Cache TTL: 24h (retail prices are stable day-to-day).

const axios = require('axios')
const cheerio = require('cheerio')
const NodeCache = require('node-cache')

const cache = new NodeCache({ stdTTL: 86400 }) // 24h

const BASE = 'https://evenstadmusikk.no'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'no-NO,no;q=0.9,en;q=0.5',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

// Evenstad prices look like: "49 207,-" "1 299,-" "22.990,-" "3 500,00"
function parseNOK(text) {
  if (!text) return null
  // Normalise: remove thousands separators (space or dot), strip trailing ",-" or ",00"
  const cleaned = text
    .replace(/\s/g, '')        // remove all whitespace
    .replace(/\./g, '')        // remove dot thousands separator
    .replace(/,-$/, '')        // trailing ",-" (no decimals)
    .replace(/,\d{2}$/, '')    // trailing ",XX" decimals
    .replace(/[^0-9]/g, '')    // keep only digits
  const num = parseInt(cleaned, 10)
  return (!isNaN(num) && num > 50) ? num : null
}

// Reject product links that are clearly accessories, clothing, or non-gear
// (Evenstad search returns merchandise alongside instruments)
const NON_GEAR_URL_PATTERNS = [
  /\/tee[-\s]/i, /t-shirt/i, /ornament/i, /coaster/i, /cap\b/i,
  /bag\b/i, /strap\b/i, /cable/i, /string[s]?\b/i, /pick\b/i, /pick-guard/i,
  /stand\b/i, /case\b/i, /cover\b/i, /bag\b/i, /cleaning/i, /polish/i,
  /book\b/i, /chart\b/i, /sticker/i, /patch\b/i, /poster/i,
]

function isLikelyGear(url) {
  return !NON_GEAR_URL_PATTERNS.some(p => p.test(url))
}

// Check that the returned product name is plausibly the same product as the query.
// Prevents: "Marshall JCM800" → "Marshall JCM800 distortion pedal" (same words, wrong type)
//           "Gibson Les Paul Standard" → "Gibson Custom 1960 Les Paul Standard Reissue" (wrong tier)
// Strategy: the product name must contain at least 2 tokens from the query (case-insensitive).
//           Tokens shorter than 3 chars are skipped (articles, "of", "mk", etc.)
function queryMatchesProduct(query, productName) {
  if (!productName) return true // can't validate, allow it
  const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length >= 3)
  const nameLower = productName.toLowerCase()
  const matchCount = queryTokens.filter(t => nameLower.includes(t)).length
  // Require at least 2 matching tokens, or all tokens if query has only 1-2 meaningful words
  const required = Math.min(2, queryTokens.length)
  return matchCount >= required
}

async function fetchEvenstadPrice(modelQuery) {
  const cacheKey = `evenstad:${modelQuery.toLowerCase().trim()}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  try {
    // Step 1: search page — product links are present in the initial HTML response
    const searchUrl = `${BASE}/search?q=${encodeURIComponent(modelQuery)}`
    const { data: searchHtml } = await axios.get(searchUrl, { headers: HEADERS, timeout: 10000 })
    const $s = cheerio.load(searchHtml)

    // Extract product links — format: /brand/productid/product-name-slug
    const productLinks = []
    $s('a[href]').each((_, el) => {
      const href = $s(el).attr('href') || ''
      // Product URL pattern: /word/digits/slug  e.g. /gibson/1210054/gibson-customshop-...
      if (/^\/[a-z][a-z0-9-]+\/\d{5,}\/[a-z0-9-]+/.test(href) && isLikelyGear(href)) {
        productLinks.push(href)
      }
    })

    // Deduplicate, keep first 3 to try
    const uniqueLinks = [...new Set(productLinks)].slice(0, 3)
    if (!uniqueLinks.length) {
      cache.set(cacheKey, null)
      return null
    }

    // Step 2: fetch the first product page and extract price
    for (const productPath of uniqueLinks) {
      try {
        const { data: productHtml } = await axios.get(`${BASE}${productPath}`, { headers: HEADERS, timeout: 8000 })
        const $p = cheerio.load(productHtml)

        // Prices appear as text like "49 207,-" near price containers
        // Look in elements with price-related classes first, then fall back to regex on full text
        let newPrice = null

        $p('[class*="price"], [class*="Price"], [data-price]').each((_, el) => {
          const text = $p(el).text().trim()
          const parsed = parseNOK(text)
          if (parsed && parsed > 500) {
            newPrice = parsed
            return false // break
          }
        })

        // Fallback: find the lowest plausible price in the whole product page text
        if (!newPrice) {
          const allText = $p('body').text()
          const matches = [...allText.matchAll(/(\d[\d\s.]{2,8}\d)[,.][-–]?/g)]
          for (const m of matches) {
            const parsed = parseNOK(m[1])
            if (parsed && parsed > 500 && parsed < 500000) {
              newPrice = parsed
              break
            }
          }
        }

        if (newPrice) {
          const productName = $p('h1').first().text().trim() || null
          // Reject if the product name doesn't match the query — catches same-brand wrong-product
          // matches (e.g. "Marshall JCM800 distortion pedal" for a query about JCM800 amps)
          if (!queryMatchesProduct(modelQuery, productName)) continue
          const result = {
            newPrice,
            currency: 'NOK',
            source: 'evenstad',
            productName,
            url: `${BASE}${productPath}`,
          }
          cache.set(cacheKey, result)
          return result
        }
      } catch {
        // try next product link
      }
    }

    cache.set(cacheKey, null)
    return null
  } catch (err) {
    console.error(`Evenstad error for "${modelQuery}":`, err.message)
    cache.set(cacheKey, null)
    return null
  }
}

module.exports = { fetchEvenstadPrice }
