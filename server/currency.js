const axios = require('axios')
const NodeCache = require('node-cache')

const cache = new NodeCache({ stdTTL: 3600 }) // 1 hour

const SUPPORTED = ['USD', 'EUR', 'GBP', 'SEK', 'DKK']

async function getRates() {
  const cached = cache.get('rates')
  if (cached) return cached

  try {
    const { data } = await axios.get('https://api.frankfurter.app/latest?from=NOK&to=USD,EUR,GBP,SEK,DKK', {
      timeout: 5000,
    })
    // data.rates is NOK → other, we need other → NOK
    const rates = {}
    for (const [currency, rate] of Object.entries(data.rates)) {
      rates[currency] = 1 / rate
    }
    rates['NOK'] = 1
    cache.set('rates', rates)
    return rates
  } catch (err) {
    // Fallback approximate rates if API fails
    console.error('Currency fetch failed, using fallback rates:', err.message)
    const fallback = { USD: 10.7, EUR: 11.8, GBP: 13.8, SEK: 1.0, DKK: 1.58, NOK: 1 }
    return fallback
  }
}

async function convertToNOK(amount, fromCurrency) {
  if (!amount || isNaN(amount)) return null
  if (fromCurrency === 'NOK') return amount

  const rates = await getRates()
  const rate = rates[fromCurrency.toUpperCase()]
  if (!rate) {
    console.warn(`No rate for currency: ${fromCurrency}`)
    return null
  }
  return Math.round(amount * rate)
}

module.exports = { convertToNOK, getRates }
