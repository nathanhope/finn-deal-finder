# GearFind — Finn.no Music Gear Deal Scanner

Automatically scores finn.no music gear listings against Reverb sold prices, eBay completed listings, and Thomann MSRP. Every listing gets a transparent 0–100 deal score.

## Stack

- **Frontend**: React + Tailwind CSS, built with Vite
- **Backend**: Node.js + Express
- **Scraping**: axios + cheerio
- **Caching**: node-cache (in-memory)

---

## Quick Start

### 1. Install dependencies

```bash
npm install          # root (concurrently)
cd server && npm install
cd ../client && npm install
```

Or with the helper script:
```bash
npm run install:all
```

### 2. Configure environment

```bash
cp .env.example server/.env
```

Edit `server/.env`:
```
EBAY_APP_ID=your_ebay_app_id_here   # get free key at developer.ebay.com
PORT=3001
NODE_ENV=development
```

The app works without an eBay key — it will skip eBay price lookups and score against Reverb + Thomann only.

### 3. Run in development

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

---

## API Keys

| Service | Key needed | Where to get it | Cost |
|---------|-----------|-----------------|------|
| **eBay Finding API** | `EBAY_APP_ID` | [developer.ebay.com](https://developer.ebay.com) → My Keys | Free |
| **Reverb API** | None | Public API, no key required | Free |
| **Thomann** | None | Scraped, no API | Free |
| **frankfurter.app** | None | Currency rates, no key required | Free |

---

## Production Deployment

```bash
npm run build          # builds client/dist
npm start              # serves everything from Express on PORT
```

Deploy to Railway, Render, or Fly.io — set `NODE_ENV=production` and `EBAY_APP_ID` in your platform's environment variables.

---

## Architecture Notes

```
GET /api/search?q=Fender+Stratocaster&minScore=50&maxPrice=15000&sort=score
```

Pipeline per request:
1. Scrape finn.no search results (cached 15 min per keyword)
2. Extract model name from each listing title (regex brand matching)
3. Fetch Reverb sold prices + eBay completed items + Thomann MSRP in parallel
4. Price data cached per model: Reverb/eBay 6h, Thomann 24h, exchange rates 1h
5. Calculate composite deal score (market discount 40% + value-vs-new 35% + condition 25%)
6. Filter, sort, return

---

## Assumptions & Gotchas

**finn.no HTML structure**: The finn.js scraper uses multiple CSS selector fallbacks (`article[id^="listing-"]`, `[data-testid]`, `.ads__unit`) because finn.no periodically changes class names. If no listings appear, open finn.no in your browser, inspect the listing HTML, and update the selectors in `server/scrapers/finn.js`.

**Condition parsing**: finn.no condition strings are parsed from listing badges. If a listing doesn't show a condition badge, it defaults to `"Ikke oppgitt"` (multiplier: 0.7). Condition can also be extracted from description text — this is not yet implemented.

**Model matching**: Title→model extraction uses regex brand lists + Norwegian noise-word stripping. It works well for well-known brands with clear model names (e.g. "Fender Stratocaster MIM") but may produce poor Reverb/eBay queries for obscure or generic items.

**Dealer detection**: Flagged via finn.no's UI elements (`[data-testid="listing-company-name"]`) and a small keyword list. Not 100% reliable for all dealer types.

**Rate limiting**: The server stalls 500ms between per-listing enrichment calls. With 20 listings per search, a cold-cache search can take ~15–20 seconds. Warm cache responses are near-instant.

**Reverb sold listings**: The public Reverb API returns `state=sold` listings. These are the most reliable price signals — weight them higher in your mental model than active listings.
