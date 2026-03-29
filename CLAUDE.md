# Finn.no Music Gear Deal Finder — Project Context

## Platform
**Web application** — browser-based, fully responsive (desktop + mobile browser). No native app. Backend runs on Node.js and serves a React frontend. Deploy anywhere (Railway, Render, Fly.io, VPS).

## What This App Does
A web application that scrapes or queries **finn.no** listings for used music gear, then cross-references prices against **Reverb.com**, **eBay completed listings**, and **Thomann** (new MSRP) to identify and score genuinely good deals. Results are ranked by a composite deal score.

---

## User-Configurable Settings
- **Gear categories** (default: Guitars & Basses, Studio / Recording Gear — but user can add/remove any category)
- **Search keywords** (specific brands, models, e.g. "Fender Stratocaster", "UA Apollo", "SSL 2")
- **Max price budget** (NOK)
- **Minimum deal score threshold** (0–100)
- **Condition filter** (Any / Like New / Good / Fair)

---

## Data Sources & Their Roles

| Source | Role | Notes |
|---|---|---|
| **finn.no** | Primary listing source | Norwegian classifieds; gear is priced in NOK |
| **Reverb.com** | Used market reference | Best signal for real-world used prices; use "sold" listings |
| **eBay completed listings** | Used market reference | Global sold prices; convert USD/EUR → NOK |
| **Thomann** | New price anchor | Establishes the retail ceiling; used to compute "% of new" |

---

## Deal Scoring Algorithm (Composite — "A Mix of All")

Each finn.no listing gets a **Deal Score (0–100)** calculated from three weighted sub-scores:

### 1. Market Discount Score (40%)
```
market_price = average of (Reverb median sold + eBay median sold) in NOK
discount_pct = (market_price - finn_price) / market_price * 100
score = clamp(discount_pct * 2, 0, 100)
```
A listing 50%+ below used market price scores 100. At or above market = 0.

### 2. Value-vs-New Score (35%)
```
thomann_new_price = MSRP in NOK
pct_of_new = finn_price / thomann_new_price * 100
score = clamp((100 - pct_of_new) * 1.5, 0, 100)
```
Rewards listings that are deeply discounted relative to buying new.

### 3. Condition-Adjusted Score (25%)
```
condition_multipliers = { "Som ny": 1.0, "Meget god": 0.9, "God": 0.75, "Brukt": 0.6, "Ikke oppgitt": 0.7 }
score = base_deal_score * condition_multiplier
```
A great price on a beat-up item scores lower than the same price on near-mint gear.

**Final Score = (Market Discount × 0.40) + (Value-vs-New × 0.35) + (Condition Adjusted × 0.25)**

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│              React Frontend                  │
│  - Search / filter controls                  │
│  - Deal card grid (sorted by score)          │
│  - Price breakdown modal per listing         │
│  - Score badge with sub-score tooltip        │
└──────────────┬──────────────────────────────┘
               │ API calls
┌──────────────▼──────────────────────────────┐
│           Node.js / Express Backend          │
│  /api/search   — triggers full pipeline      │
│  /api/prices   — fetches reference prices    │
└──┬────────────┬────────────────┬────────────┘
   │            │                │
┌──▼──┐    ┌───▼────┐     ┌─────▼──────┐
│Finn │    │Reverb  │     │eBay/Thomann│
│.no  │    │API/    │     │scrape or   │
│RSS/ │    │scrape  │     │API         │
│scrape│   └────────┘     └────────────┘
└─────┘
```

**Recommended Implementation Path (simplest viable):**
1. **Finn.no**: Use their public RSS feeds (finn.no/rss) filtered by category + keyword — no auth required
2. **Reverb**: Use the Reverb public API (`reverb.com/api`) — free, returns sold listings
3. **eBay**: Use the eBay Finding API (free tier) with `completedItems=true`
4. **Thomann**: Scrape search results page (no official API); cache aggressively

---

## Key UI Components

- **SearchBar** — keyword input + category multi-select + filters drawer
- **DealCard** — listing thumbnail, title, finn price, market price, savings badge, deal score ring
- **ScoreBreakdown** — tooltip/modal showing the three sub-scores and how they were calculated
- **PriceChart** — mini sparkline of recent sold prices on Reverb/eBay for that item
- **AlertSetup** — save a search; get notified (email or browser push) when score > threshold

---

## Currency
- All internal calculations in NOK
- Reverb/eBay prices fetched in USD or EUR, converted via live exchange rate (e.g. frankfurter.app API — free)

---

## Caching Strategy
- Finn.no listings: refresh every 15 minutes
- Reverb/eBay prices: cache per model name for 6 hours
- Thomann MSRP: cache per model for 24 hours
- Exchange rates: refresh every 1 hour

---

## Finn.no Category IDs (music gear)
- Guitars: `kategori=1` under `musikk-scene` — confirm via finn.no/musikk URL structure
- Studio / Recording: search keyword-based under the same parent category
- Use URL pattern: `https://www.finn.no/bap/forsale/search.html?q={keyword}&cat=1`

---

## Notes & Gotchas
- Finn.no listings don't always include condition explicitly — parse from description text when missing
- Item matching (finn listing → Reverb/eBay) is fuzzy: extract brand + model from title using regex or an LLM call
- Some finn listings are from dealers (not private sellers) — flag these as they skew the deal score
- Reverb "sold" prices are the most reliable signal; weight them higher than active listings
