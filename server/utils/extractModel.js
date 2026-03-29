// Well-known model names that imply a brand — checked before brand list
// Maps model keyword → canonical "Brand Model" search string
const MODEL_ALIASES = {
  'les paul':        'Gibson Les Paul',
  'sg ':             'Gibson SG',
  'es-335':          'Gibson ES-335',
  'es 335':          'Gibson ES-335',
  'stratocaster':    'Fender Stratocaster',
  'strat':           'Fender Stratocaster',
  'telecaster':      'Fender Telecaster',
  'tele':            'Fender Telecaster',
  'jazz bass':       'Fender Jazz Bass',
  'precision bass':  'Fender Precision Bass',
  'p-bass':          'Fender Precision Bass',
  'j-bass':          'Fender Jazz Bass',
  'jazzmaster':      'Fender Jazzmaster',
  'jaguar':          'Fender Jaguar',
  'mustang':         'Fender Mustang',
  'flying v':        'Gibson Flying V',
  'explorer':        'Gibson Explorer',
  'super strat':     'super strat guitar',
  'apollo twin':     'Universal Audio Apollo Twin',
  'apollo x':        'Universal Audio Apollo X',
  'apollo 8':        'Universal Audio Apollo 8',
  'scarlett solo':   'Focusrite Scarlett Solo',
  'scarlett 2i2':    'Focusrite Scarlett 2i2',
  'scarlett 4i4':    'Focusrite Scarlett 4i4',
  'minilogue':       'Korg Minilogue',
  'prologue':        'Korg Prologue',
  'tr-8':            'Roland TR-8',
  'tr8':             'Roland TR-8',
  'sh-101':          'Roland SH-101',
  'juno':            'Roland Juno',
  'jx-3p':           'Roland JX-3P',
  'sub 37':          'Moog Sub 37',
  'subsequent 37':   'Moog Subsequent 37',
  'minimoog':        'Moog Minimoog',
  'matriarch':       'Moog Matriarch',
  'prophet 6':       'Sequential Prophet 6',
  'prophet6':        'Sequential Prophet 6',
  'ob-6':            'Sequential OB-6',
  'digitakt':        'Elektron Digitakt',
  'digitone':        'Elektron Digitone',
  'analog rytm':     'Elektron Analog Rytm',
  'octatrack':       'Elektron Octatrack',
  'op-1':            'Teenage Engineering OP-1',
  'op1':             'Teenage Engineering OP-1',
}

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
  'lite brukt', 'aldri giget', 'kun brukt', 'hjemme',
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
// Parent → sub-brand pairs: when both appear in a title, the sub-brand wins.
// "Gibson Epiphone Les Paul" → Epiphone. "Fender Squier Strat" → Squier.
const SUBBRAND_OVERRIDES = [
  { parent: 'gibson',  sub: 'epiphone'    },
  { parent: 'fender',  sub: 'squier'      },
  { parent: 'fender',  sub: 'charvel'     },
  { parent: 'gibson',  sub: 'kramer'      },
  { parent: 'gibson',  sub: 'steinberger' },
]

function extractModel(rawTitle) {
  const cleaned = cleanTitle(rawTitle)
  const lower = cleaned.toLowerCase()

  // 1. Resolve parent/sub-brand collisions first
  for (const { parent, sub } of SUBBRAND_OVERRIDES) {
    if (lower.includes(parent) && lower.includes(sub)) {
      const subIdx = lower.indexOf(sub)
      const fromSub = cleaned.slice(subIdx)
      return fromSub.split(/\s+/).slice(0, 4).join(' ').trim()
    }
  }

  // 2. Check if any known brand is already in the title.
  //    If yes, skip MODEL_ALIASES (which would map "Epiphone Les Paul" → "Gibson Les Paul").
  let foundBrand = null
  for (const brand of BRANDS) {
    if (lower.includes(brand.toLowerCase())) {
      foundBrand = brand
      break
    }
  }

  // 3. No brand found — try MODEL_ALIASES (handles "Les Paul m/ Bigsby", "Stratocaster" etc.)
  if (!foundBrand) {
    for (const [alias, canonical] of Object.entries(MODEL_ALIASES)) {
      if (lower.includes(alias)) return canonical
    }
  }

  // 4. Extract brand + up to 3 following words
  if (foundBrand) {
    const idx = lower.indexOf(foundBrand.toLowerCase())
    const fromBrand = cleaned.slice(idx)
    return fromBrand.split(/\s+/).slice(0, 4).join(' ').trim()
  }

  // 5. Fallback — first 4 meaningful words
  return cleaned.split(/\s+/).filter(w => w.length > 1).slice(0, 4).join(' ')
}

module.exports = { extractModel }
