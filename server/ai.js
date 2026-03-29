const OpenAI = require('openai')
const NodeCache = require('node-cache')

const cache = new NodeCache({ stdTTL: 86400 }) // 24h — LLM results are stable

let _client = null
function getClient() {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _client
}

const MODEL = () => process.env.OPENAI_MODEL || 'gpt-4o-mini'

/**
 * 1. Extract a clean marketable model name from a messy finn.no title.
 *    Falls back to the regex extractor if OpenAI is unavailable.
 *
 *    e.g. "Selger Apollo Twin mk2 Duo med strøm + usb - pent brukt" → "Universal Audio Apollo Twin MkII Duo"
 */
async function aiExtractModel(rawTitle) {
  const cacheKey = `ai:model:${rawTitle.toLowerCase().trim()}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  try {
    const resp = await getClient().chat.completions.create({
      model: MODEL(),
      temperature: 0,
      max_tokens: 40,
      messages: [
        {
          role: 'system',
          content:
            'You extract a clean, marketable music gear model name from Norwegian classified listing titles. ' +
            'Return ONLY the brand + model string suitable for searching on Reverb or eBay — no condition words, ' +
            'no accessories, no Norwegian filler. If you cannot identify the gear, return the best 3–4 word guess. ' +
            'Reply with only the model string, nothing else.',
        },
        {
          role: 'user',
          content: rawTitle,
        },
      ],
    })

    const result = resp.choices[0]?.message?.content?.trim() || null
    cache.set(cacheKey, result)
    return result
  } catch (err) {
    console.error('aiExtractModel error:', err.message)
    return null
  }
}

/**
 * 2. Infer condition from listing description text when no badge is available.
 *
 *    Returns one of: "Som ny" | "Meget god" | "God" | "Brukt" | "Ikke oppgitt"
 */
async function aiInferCondition(description) {
  if (!description || description.trim().length < 20) return 'Ikke oppgitt'

  const cacheKey = `ai:cond:${description.slice(0, 120).toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  try {
    const resp = await getClient().chat.completions.create({
      model: MODEL(),
      temperature: 0,
      max_tokens: 15,
      messages: [
        {
          role: 'system',
          content:
            'You read Norwegian music gear classified listings and determine the item condition. ' +
            'Reply with ONLY one of these exact strings: "Som ny", "Meget god", "God", "Brukt", "Ikke oppgitt". ' +
            '"Som ny" = mint/never used. "Meget god" = excellent, minor cosmetic wear. "God" = good, some wear but works perfectly. ' +
            '"Brukt" = clearly used, notable wear or minor issues mentioned. "Ikke oppgitt" = no condition info.',
        },
        {
          role: 'user',
          content: description.slice(0, 500), // cap to keep tokens low
        },
      ],
    })

    const raw = resp.choices[0]?.message?.content?.trim()
    const valid = ['Som ny', 'Meget god', 'God', 'Brukt', 'Ikke oppgitt']
    const result = valid.includes(raw) ? raw : 'Ikke oppgitt'
    cache.set(cacheKey, result)
    return result
  } catch (err) {
    console.error('aiInferCondition error:', err.message)
    return 'Ikke oppgitt'
  }
}

/**
 * 3. Generate a one-sentence plain-language deal summary for a listing.
 *
 *    e.g. "40% below typical used market price for a guitar in great condition — solid buy if the finish wear is acceptable."
 */
async function aiDealSummary({ title, finnPrice, marketPrice, thomannNew, condition, savingsPct, scoreTotal }) {
  const cacheKey = `ai:summary:${title.toLowerCase().slice(0, 60)}:${finnPrice}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  const context = [
    `Item: ${title}`,
    `Finn price: ${finnPrice} NOK`,
    marketPrice ? `Used market price (Reverb/eBay median): ${marketPrice} NOK` : null,
    thomannNew ? `New from Thomann: ${thomannNew} NOK` : null,
    `Condition: ${condition}`,
    savingsPct != null ? `Discount vs market: ${savingsPct}%` : null,
    `Deal score: ${scoreTotal}/100`,
  ].filter(Boolean).join('\n')

  try {
    const resp = await getClient().chat.completions.create({
      model: MODEL(),
      temperature: 0.4,
      max_tokens: 60,
      messages: [
        {
          role: 'system',
          content:
            'You write punchy one-sentence deal assessments for music gear listings. ' +
            'Be direct and practical — mention the key reason it is or isn\'t a deal. ' +
            'No hype, no filler. Max 20 words. Write in English.',
        },
        {
          role: 'user',
          content: context,
        },
      ],
    })

    const result = resp.choices[0]?.message?.content?.trim() || null
    cache.set(cacheKey, result)
    return result
  } catch (err) {
    console.error('aiDealSummary error:', err.message)
    return null
  }
}

module.exports = { aiExtractModel, aiInferCondition, aiDealSummary }
