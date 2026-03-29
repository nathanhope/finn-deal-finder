const axios = require('axios')
const cheerio = require('cheerio')
const NodeCache = require('node-cache')

const cache = new NodeCache({ stdTTL: 900 }) // 15 minutes

const FINN_BASE = 'https://www.finn.no'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'no,en-US;q=0.7,en;q=0.3',
}

// Maps finn.no badge text → our internal condition string
function parseConditionBadge(text) {
  if (!text) return null
  const t = text.toLowerCase()
  if (t.includes('ikke synlig brukt') || t.includes('som ny'))   return 'Som ny'
  if (t.includes('pent brukt') || t.includes('i god stand'))     return 'Meget god'
  if (t.includes('godt brukt') || t.includes('synlig brukt'))    return 'God'
  if (t.includes('brukt'))                                        return 'Brukt'
  return null
}

function parsePrice(text) {
  if (!text) return null
  // "4 400 kr" → 4400, "1 000 kr" → 1000
  const cleaned = text
    .replace(/kr\.?/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function buildImageUrl(src) {
  if (!src) return null
  if (src.startsWith('http')) return src
  if (src.startsWith('//')) return 'https:' + src
  return src
}

async function fetchFinnListings(keyword) {
  const cacheKey = `finn:${keyword.toLowerCase().trim()}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const url = `${FINN_BASE}/bap/forsale/search.html?q=${encodeURIComponent(keyword)}&sort=PUBLISHED_DESC`

  let html
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 12000 })
    html = data
  } catch (err) {
    console.error(`finn.no fetch error for "${keyword}":`, err.message)
    return []
  }

  const $ = cheerio.load(html)
  const listings = []

  // Each listing is an <article class="... sf-search-ad ...">
  $('article.sf-search-ad').each((_, el) => {
    try {
      // --- URL ---
      // Primary: the image carousel link; secondary: the title link
      const carouselLink = $(el).find('a.sf-ad-carousel-desktop-wrapper').first()
      const titleLink    = $(el).find('a.sf-search-ad-link').first()
      let href = carouselLink.attr('href') || titleLink.attr('href') || ''
      if (!href) return
      if (href.startsWith('/')) href = FINN_BASE + href

      // --- Title ---
      // The <a> contains a hidden <span aria-hidden> then the text node
      const titleEl = $(el).find('a.sf-search-ad-link').first()
      // Remove the hidden span, grab remaining text
      titleEl.find('span[aria-hidden]').remove()
      const title = titleEl.text().trim()
      if (!title || title.length < 3) return

      // --- Price ---
      // First <span> inside a .flex.justify-between div (the price row)
      const priceSpan = $(el).find('div.flex.justify-between span').first()
      const price = parsePrice(priceSpan.text())
      if (!price) return

      // --- Image ---
      const imgEl = $(el).find('img.sf-ad-carousel-desktop-item').first()
      const image = buildImageUrl(imgEl.attr('src') || imgEl.attr('data-src'))

      // --- Condition ---
      // badge--info spans: may be "Som ny - Ikke synlig brukt", "Pent brukt...", "Betalt plassering" etc.
      let condition = 'Ikke oppgitt'
      let isDealer = false
      $(el).find('span.badge--info, span[class*="badge"]').each((_, badge) => {
        const text = $(badge).text().trim()
        if (text.toLowerCase().includes('betalt plassering')) {
          isDealer = true
          return
        }
        const parsed = parseConditionBadge(text)
        if (parsed) condition = parsed
      })

      // --- Date ---
      // "3 dg." / "1 t." in the second span of the location/date row
      const metaSpans = $(el).find('div.text-xs.flex.justify-between span')
      const location  = metaSpans.eq(0).text().trim() || null
      const dateRaw   = metaSpans.eq(1).text().trim() || null

      // Extract listing ID from URL
      const id = href.split('/').pop() || href

      listings.push({
        id,
        title,
        url: href,
        price,
        condition,
        image,
        location,
        publishedAt: dateRaw,  // relative string like "3 dg." — good enough for display
        isDealer,
        source: 'finn.no',
      })
    } catch (e) {
      // skip malformed listing
    }
  })

  // Deduplicate by URL
  const seen = new Set()
  const unique = listings.filter(l => {
    if (seen.has(l.url)) return false
    seen.add(l.url)
    return true
  })

  cache.set(cacheKey, unique)
  return unique
}

/**
 * Fetch and parse a single finn.no listing page by URL.
 * Supports both URL formats:
 *   - /recommerce/forsale/item/XXXXXXX
 *   - /bap/forsale/ad.html?finnkode=XXXXXXX
 */
async function fetchFinnListing(url) {
  const cacheKey = `finn:listing:${url}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  let html
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 12000 })
    html = data
  } catch (err) {
    console.error(`finn.no listing fetch error for ${url}:`, err.message)
    return null
  }

  const $ = cheerio.load(html)

  // Title
  const title = $('h1').first().text().trim()
  if (!title || title.length < 2) return null

  // Price — rendered as element with class "h2" (div or p depending on listing type)
  const priceText = $('.h2').first().text()
  const price = parsePrice(priceText)
  if (!price) return null

  // Condition — <b> inside a <span> containing "Tilstand:"
  let condition = 'Ikke oppgitt'
  $('section span').each((_, el) => {
    if ($(el).text().includes('Tilstand')) {
      const bText = $(el).find('b').first().text().trim()
      if (bText) {
        const parsed = parseConditionBadge(bText)
        if (parsed) condition = parsed
      }
      return false
    }
  })

  // Description — section containing "Beskrivelse av varen"
  // Include full section text for AI condition inference; strip the heading
  let description = null
  $('section').each((_, el) => {
    const text = $(el).text()
    if (text.includes('Beskrivelse av varen')) {
      description = text.replace(/Beskrivelse av varen/gi, '').trim().substring(0, 1500)
      return false
    }
  })

  // Image — prefer 960w listing images; fall back to any finncdn image upscaled
  let image = null
  $('img').each((_, el) => {
    const src = $(el).attr('src') || ''
    if (src.includes('finncdn') && src.includes('960w')) {
      image = src
      return false
    }
  })
  if (!image) {
    $('img').each((_, el) => {
      const src = $(el).attr('src') || ''
      if (src.includes('finncdn') && !src.includes('profile') && !src.includes('480x480')) {
        image = src.replace(/\/\d+w\//, '/960w/')
        return false
      }
    })
  }

  // Extract listing ID from URL path (/item/XXXX) or query (?finnkode=XXXX)
  let id = url
  try {
    const u = new URL(url)
    const pathMatch = u.pathname.match(/\/(\d{6,})(?:\/|$)/)
    id = u.searchParams.get('finnkode') || pathMatch?.[1] || url
  } catch { /* keep url as id */ }

  const result = {
    id,
    title,
    url,
    price,
    condition,
    description,
    image,
    publishedAt: null,
    isDealer: false,
    source: 'finn.no',
  }

  cache.set(cacheKey, result)
  return result
}

module.exports = { fetchFinnListings, fetchFinnListing }
