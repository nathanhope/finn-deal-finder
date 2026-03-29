const CONDITION_MULTIPLIERS = {
  'Som ny': 1.0,
  'Meget god': 0.9,
  'God': 0.75,
  'Brukt': 0.6,
  'Ikke oppgitt': 0.7,
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max)
}

function median(arr) {
  if (!arr.length) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/**
 * @param {number} finnPrice — listing price in NOK
 * @param {number|null} reverbMedian — median sold price in NOK (null if unavailable)
 * @param {number|null} ebayMedian — median sold price in NOK (null if unavailable)
 * @param {number|null} thomannNew — new price from Thomann in NOK (null if unavailable)
 * @param {string} condition — Norwegian condition string
 * @param {boolean} lowConfidence — Reverb had < 3 results
 */
function calculateDealScore(finnPrice, reverbMedian, ebayMedian, thomannNew, condition, lowConfidence = false) {
  const hasReverb = reverbMedian != null && reverbMedian > 0
  const hasEbay = ebayMedian != null && ebayMedian > 0
  const hasThomann = thomannNew != null && thomannNew > 0

  // --- Market price ---
  let marketPrice = null
  if (hasReverb && hasEbay) {
    marketPrice = (reverbMedian + ebayMedian) / 2
  } else if (hasReverb) {
    marketPrice = reverbMedian
  } else if (hasEbay) {
    marketPrice = ebayMedian
  }

  // --- 1. Market Discount Score (40%) ---
  let marketScore = 0
  let discountPct = 0
  if (marketPrice) {
    discountPct = ((marketPrice - finnPrice) / marketPrice) * 100
    marketScore = clamp(discountPct * 2, 0, 100)
  }

  // --- 2. Value-vs-New Score (35%) ---
  let newScore = 0
  if (hasThomann) {
    const pctOfNew = (finnPrice / thomannNew) * 100
    newScore = clamp((100 - pctOfNew) * 1.5, 0, 100)
  }

  // --- 3. Condition-Adjusted Score (25%) ---
  const multiplier = CONDITION_MULTIPLIERS[condition] ?? 0.7
  const conditionScore = (marketScore * 0.4 + newScore * 0.35) * multiplier

  // --- Reweight if data is missing ---
  let finalScore
  if (!marketPrice && !hasThomann) {
    finalScore = 0
  } else if (!marketPrice) {
    // Only Thomann: use 57/43 split (no market discount)
    finalScore = (newScore * 0.57) + (conditionScore * 0.43)
  } else if (!hasThomann) {
    // Only market data: use 57/43 split (no value-vs-new)
    finalScore = (marketScore * 0.57) + (conditionScore * 0.43)
  } else {
    finalScore = (marketScore * 0.40) + (newScore * 0.35) + (conditionScore * 0.25)
  }

  const savings = marketPrice ? Math.round(marketPrice - finnPrice) : null

  return {
    total: Math.round(clamp(finalScore, 0, 100)),
    breakdown: {
      marketDiscount: Math.round(marketScore),
      valueVsNew: Math.round(newScore),
      conditionAdjusted: Math.round(conditionScore),
    },
    marketPrice: marketPrice ? Math.round(marketPrice) : null,
    savings,
    savingsPct: Math.round(discountPct),
    lowConfidence,
    hasMarketData: !!marketPrice,
    hasThomannData: hasThomann,
  }
}

module.exports = { calculateDealScore, median }
