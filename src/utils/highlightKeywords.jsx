/**
 * highlightKeywords.jsx
 * Parses AI-generated text into highlighted JSX segments.
 *
 * Rules (applied in priority order, earliest match wins):
 *  1. Numbers / % / multipliers / currency  → text-blue-600 font-semibold
 *  2. Mosaic brands                         → brand colours + font-semibold
 *  3. Direct competitors                    → text-red-600 font-bold
 *  4. Indirect competitors                  → text-amber-600 font-medium
 *  5. Adjacent / peripheral                 → text-blue-500
 *  6. Key concept phrases                   → bg-yellow-100 rounded px-0.5
 *  7. Action verbs                          → font-bold text-orange-600
 */

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordsRe(terms) {
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(${sorted.map(esc).join('|')})\\b`, 'gi');
}

function phrasesRe(terms) {
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  return new RegExp(`(${sorted.map(esc).join('|')})`, 'gi');
}

// ── Term lists ─────────────────────────────────────────────────────────────────

const DIRECT_NAMES = [
  'Traya Health', 'Traya', 'Bold Care', 'BoldCare', 'RxMen',
  'Gynoveda', 'Oziva', 'OZiva', 'Nua Woman', 'Nua', 'Kindlife',
  'Mee Mee', 'MeeMee', 'The Moms Co', "The Mom's Co", 'Mylo',
];

const INDIRECT_NAMES = [
  'Bombay Shaving Company', 'Beardo', 'Ustraa', 'The Man Company',
  'The Minimalist', 'Minimalist', 'Dot and Key', 'Dot & Key',
  'WOW Skin Science', 'WOW',
];

const ADJACENT_NAMES = [
  'Kapiva', 'Fast and Up', 'FastAndUp', 'Healthkart', 'HealthKart',
  'Plum Goodness', 'Plum', 'Pilgrim', 'mCaffeine', 'MCaffeine',
  'Himalaya Baby', 'Sebamed Baby', 'Chicco India', 'Chicco',
  'FirstCry', 'First Cry',
];

const MOSAIC_BRANDS = [
  { term: 'Mosaic Wellness', cls: 'text-purple-700 font-semibold' },
  { term: 'Man Matters',     cls: 'text-blue-700 font-semibold' },
  { term: 'Bebodywise',      cls: 'text-pink-600 font-semibold' },
  { term: 'Little Joys',     cls: 'text-green-600 font-semibold' },
];

const KEY_CONCEPTS = [
  'Proven Performer', 'Hook Strength', 'Gap Opportunity', 'Unmet Need',
  'Weekly Brief', 'Creative Trends', 'Messaging Shift', 'Threat Level',
  'Video Script', 'Active Ads', 'Days Running', 'CTA', 'Insight', 'Sentiment',
];

const ACTION_VERBS = [
  'launch', 'test', 'create', 'build', 'own', 'counter',
  'target', 'invest', 'scale', 'pivot', 'leverage', 'capture',
  'dominate', 'deploy', 'activate', 'prioritize',
];

// ── Build rule list ────────────────────────────────────────────────────────────
// Each rule uses a factory `re()` to produce a fresh regex per call,
// avoiding shared lastIndex state across renders.

const RULES = [
  // 1. Numbers / percentages / multipliers / currency
  {
    re:  () => /(\b\d+(?:[.,]\d+)*(?:%|x|X|\+)?\b|\b₹\s*\d[\d,]*)/g,
    cls: 'text-blue-600 font-semibold',
  },
  // 2. Mosaic brands (longest first)
  ...MOSAIC_BRANDS.map(b => ({
    re:  () => new RegExp(`\\b(${esc(b.term)})\\b`, 'gi'),
    cls: b.cls,
  })),
  // 3. Direct competitors
  { re: () => wordsRe(DIRECT_NAMES),   cls: 'text-red-600 font-bold' },
  // 4. Indirect competitors
  { re: () => wordsRe(INDIRECT_NAMES), cls: 'text-amber-600 font-medium' },
  // 5. Adjacent / peripheral
  { re: () => wordsRe(ADJACENT_NAMES), cls: 'text-blue-500' },
  // 6. Key concept phrases
  { re: () => phrasesRe(KEY_CONCEPTS), cls: 'bg-yellow-100 rounded px-0.5' },
  // 7. Action verbs
  { re: () => wordsRe(ACTION_VERBS),   cls: 'font-bold text-orange-600' },
];

/**
 * Parse a plain-text string into { text, cls } segments.
 * At each position, find the earliest match across all rules; ties resolve
 * to the highest-priority rule (lowest index in RULES).
 */
function parseSegments(raw) {
  if (!raw) return [];
  const segments = [];
  let remaining = String(raw);

  while (remaining.length > 0) {
    let best = null; // { index, length, cls }

    for (const rule of RULES) {
      const re = rule.re();
      const m  = re.exec(remaining);
      if (!m) continue;
      if (!best || m.index < best.index) {
        best = { index: m.index, length: m[0].length, cls: rule.cls };
      }
    }

    if (!best) {
      segments.push({ text: remaining, cls: '' });
      break;
    }

    if (best.index > 0) {
      segments.push({ text: remaining.slice(0, best.index), cls: '' });
    }
    segments.push({
      text: remaining.slice(best.index, best.index + best.length),
      cls:  best.cls,
    });
    remaining = remaining.slice(best.index + best.length);
  }

  return segments;
}

/**
 * HighlightText — renders text with inline colour/weight highlighting.
 *
 * @param {string} text      The text to highlight
 * @param {string} className Base className for the outer <span>
 */
export function HighlightText({ text, className = '' }) {
  if (!text) return null;
  const segments = parseSegments(String(text));
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.cls
          ? <span key={i} className={seg.cls}>{seg.text}</span>
          : <span key={i}>{seg.text}</span>
      )}
    </span>
  );
}

export default HighlightText;
