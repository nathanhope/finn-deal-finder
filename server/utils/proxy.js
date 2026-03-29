/**
 * ScraperAPI proxy helpers.
 * When SCRAPERAPI_KEY is set, routes requests through the proxy to bypass
 * IP-based blocking (eBay) and Cloudflare JS challenges (Thomann, Gear4Music).
 * Falls back to direct request when key is not set.
 *
 * render=true costs ~25 credits vs 1 for a regular request — use only for
 * Cloudflare-protected targets that require JS execution.
 */

const SCRAPERAPI_BASE = 'https://api.scraperapi.com'

function proxyUrl(targetUrl) {
  const key = process.env.SCRAPERAPI_KEY
  if (!key) return targetUrl
  return `${SCRAPERAPI_BASE}?api_key=${key}&url=${encodeURIComponent(targetUrl)}`
}

function proxyUrlRendered(targetUrl) {
  const key = process.env.SCRAPERAPI_KEY
  if (!key) return targetUrl
  return `${SCRAPERAPI_BASE}?api_key=${key}&render=true&url=${encodeURIComponent(targetUrl)}`
}

module.exports = { proxyUrl, proxyUrlRendered }
