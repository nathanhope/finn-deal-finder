/**
 * ScraperAPI proxy helpers.
 * When SCRAPERAPI_KEY is set, routes requests through the proxy to bypass
 * IP-based blocking (eBay) and Cloudflare JS challenges (Thomann, Gear4Music).
 * Falls back to direct requests when key is not set.
 *
 * render=true costs ~25 credits vs 1 for a regular request — use only for
 * Cloudflare-protected targets that require JS execution.
 *
 * Concurrency limiter: ScraperAPI free tier caps at 5 concurrent requests.
 * All proxy calls queue through a shared limiter to prevent 429s.
 */

const axios = require('axios')

const SCRAPERAPI_BASE = 'https://api.scraperapi.com'

// Stay safely below ScraperAPI's free-tier concurrency limit of 5
const MAX_CONCURRENT = 3

class ConcurrencyLimiter {
  constructor(max) {
    this.max = max
    this.active = 0
    this.queue = []
  }
  acquire() {
    return new Promise(resolve => {
      if (this.active < this.max) { this.active++; resolve() }
      else this.queue.push(resolve)
    })
  }
  release() {
    this.active--
    if (this.queue.length > 0) { this.active++; this.queue.shift()() }
  }
}

const limiter = new ConcurrencyLimiter(MAX_CONCURRENT)

function buildProxyUrl(targetUrl, render = false) {
  const key = process.env.SCRAPERAPI_KEY
  if (!key) return targetUrl
  return `${SCRAPERAPI_BASE}?api_key=${key}${render ? '&render=true' : ''}&url=${encodeURIComponent(targetUrl)}`
}

/**
 * Rate-limited axios.get wrapper for proxy requests.
 * Queues when MAX_CONCURRENT proxy requests are in flight.
 */
async function proxyGet(targetUrl, axiosOptions = {}, { render = false } = {}) {
  const url = buildProxyUrl(targetUrl, render)
  if (!process.env.SCRAPERAPI_KEY) return axios.get(url, axiosOptions)

  await limiter.acquire()
  try {
    return await axios.get(url, axiosOptions)
  } finally {
    limiter.release()
  }
}

// URL-only helpers for callers that build their own axios call
function proxyUrl(targetUrl)         { return buildProxyUrl(targetUrl, false) }
function proxyUrlRendered(targetUrl) { return buildProxyUrl(targetUrl, true)  }

module.exports = { proxyGet, proxyUrl, proxyUrlRendered }
