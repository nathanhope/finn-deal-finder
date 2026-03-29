// Known brands — order matters (longer/more specific first to avoid partial matches)
const BRANDS = [
  // Guitar / Bass
  'Fender', 'Gibson', 'Epiphone', 'PRS', 'Paul Reed Smith', 'Ibanez', 'ESP', 'LTD',
  'Schecter', 'Jackson', 'Charvel', 'Gretsch', 'Rickenbacker', 'Music Man', 'Musicman',
  'Ernie Ball', 'Taylor', 'Martin', 'Yamaha', 'Takamine', 'Seagull', 'Guild',
  'Godin', 'G&L', 'Danelectro', 'Reverend', 'Squier', 'Vintage',
  // Amps
  'Marshall', 'Fender', 'Orange', 'Vox', 'Mesa Boogie', 'Mesa/Boogie', 'Blackstar',
  'Laney', 'Peavey', 'Soldano', 'Bogner', 'Two Rock', 'Friedman', 'Bad Cat',
  'Hughes & Kettner', 'Roland', 'Boss',
  // Drums / Percussion
  'Pearl', 'DW', 'Gretsch', 'Mapex', 'Ludwig', 'Tama', 'Sonor', 'Zildjian',
  'Sabian', 'Meinl', 'Paiste', 'Roland', 'Alesis', 'Yamaha',
  // Studio / Recording
  'Universal Audio', 'UA', 'SSL', 'Neve', 'API', 'Rupert Neve', 'Focusrite', 'Audient',
  'PreSonus', 'Behringer', 'RME', 'MOTU', 'Apogee', 'Antelope', 'Avid', 'Digidesign',
  'Waves', 'Slate Digital', 'SPL', 'Chandler Limited', 'Shadow Hills',
  // Mics
  'Neumann', 'AKG', 'Shure', 'Sennheiser', 'Audio-Technica', 'Rode', 'Beyerdynamic',
  'Earthworks', 'Telefunken', 'Schoeps', 'DPA', 'Lewitt', 'sE Electronics',
  // Synths / Keys
  'Moog', 'Sequential', 'Dave Smith', 'Korg', 'Roland', 'Yamaha', 'Arturia',
  'Nord', 'Waldorf', 'Elektron', 'Teenage Engineering', 'Make Noise', 'Eurorack',
  'Novation', 'Akai', 'Native Instruments', 'Access',
  // Effects
  'Strymon', 'Eventide', 'TC Electronic', 'Line 6', 'Boss', 'EHX', 'Electro-Harmonix',
  'MXR', 'Dunlop', 'Wampler', 'JHS', 'Keeley', 'Chase Bliss', 'Walrus Audio',
  'Death by Audio', 'Earthquaker', 'Earthquaker Devices', 'Origin Effects',
  'Analogman', 'Fulltone', 'Way Huge',
]

// Norwegian noise words to strip
const NOISE_WORDS = [
  'selger', 'pent', 'brukt', 'pent brukt', 'meget god stand', 'god stand',
  'som ny', 'nesten ny', 'fin', 'flott', 'kvittering', 'originalkasse', 'kasse',
  'gigbag', 'gigbag inkl', 'inkl', 'inkludert', 'med', 'm/', 'uten', 'u/',
  'stand', 'tilstand', 'beskrivelse', 'se bilder', 'se bilde',
  'noe', 'bruksspor', 'små', 'riper', 'fungerer', 'perfekt', 'bra',
  'kjøpt', 'fra', 'butikk', 'privat', 'selges', 'grunnet', 'plassmangel',
  'lite brukt', 'aldri giget', 'kun brukt', 'hjemme', 'studio',
  'selges pga', 'pga', 'ønsker', 'heller', 'annet',
]

const NOISE_PATTERN = new RegExp(
  `\\b(${NOISE_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)

// Strip year patterns, loose "w/ xxx", serial numbers etc.
const STRIP_PATTERNS = [
  /\b(19|20)\d{2}\b/g,          // years
  /\bm\s*\/\s*\S+/gi,           // m/ gigbag, m/ kasse
  /\bu\s*\/\s*\S+/gi,           // u/ kasse
  /\b(inkl?\.?|inkludert)\s+\S+/gi,
  /\bsn[:\s#]\s*[\w-]+/gi,      // serial numbers
  /[()[\]{}]/g,
  /\s{2,}/g,
]

function cleanTitle(raw) {
  let s = raw.trim()

  // Remove noise words
  s = s.replace(NOISE_PATTERN, ' ')

  // Remove year patterns, serial numbers, etc.
  for (const p of STRIP_PATTERNS) {
    s = s.replace(p, ' ')
  }

  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Extract a marketable model string from a finn.no listing title.
 * Returns the best query string for Reverb/eBay/Thomann lookups.
 */
function extractModel(rawTitle) {
  const cleaned = cleanTitle(rawTitle)
  const lower = cleaned.toLowerCase()

  // Try to find a brand
  for (const brand of BRANDS) {
    const idx = lower.indexOf(brand.toLowerCase())
    if (idx !== -1) {
      // Take brand + up to 4 words after it
      const fromBrand = cleaned.slice(idx)
      const words = fromBrand.split(/\s+/).slice(0, 4)
      return words.join(' ').trim()
    }
  }

  // No brand found — return first 4 meaningful words of cleaned title
  const words = cleaned.split(/\s+/).filter(w => w.length > 1)
  return words.slice(0, 4).join(' ')
}

module.exports = { extractModel }
