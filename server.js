/**
 * server.js
 * Express backend for Ad War Room.
 *
 * Endpoints:
 *   GET  /api/competitors        – Hardcoded competitor list grouped by Mosaic brand
 *   GET  /api/ads/:companyName   – Fetch + cache ads for one competitor (6hr TTL)
 *   GET  /api/ads/all            – Fetch all competitors in parallel (max 3 concurrent)
 *   POST /api/analyze            – Run Gemini analysis on cached ads, save brief
 *   GET  /api/brief              – Return latest brief (triggers fresh if >7 days old)
 *   POST /api/refresh            – Clear cache for a company or all
 *
 * Key behaviours:
 *   • Falls back to SAMPLE_ADS if SCRAPECREATORS_API_KEY is missing or API fails
 *   • Gemini response: strips markdown backticks before JSON.parse; retries with
 *     simplified prompt on first parse failure
 *   • Gemini brief cached for ≥1 hour (enforced in /api/brief)
 *   • In production (NODE_ENV=production), serves Vite-built dist/
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  initSchema,
  getCachedAds,
  getCachedAdsAny,
  getCacheStatus,
  getAllCacheStatuses,
  saveAds,
  saveAiBrief,
  getLatestBrief,
  getBriefByBrand,
  clearAdsCache,
  getCompetitorProfile,
  saveCompetitorProfile,
  getAdScores,
  saveAdScores,
  getRedditData,
  getRedditDataAny,
  saveRedditData,
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://ad-war-room.vercel.app',
    process.env.FRONTEND_URL || '*',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ─── Constants ────────────────────────────────────────────────────────────────

const SCRAPE_API_KEY = process.env.SCRAPECREATORS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Mosaic Wellness brands and the competitors we track for each.
 * companyName values must match what the ScrapeCreators API expects.
 */
const COMPETITORS = {
  'Man Matters': [
    { name: 'Traya Health',           companyName: 'trayahealth' },
    { name: 'Bold Care',              companyName: 'boldcare' },
    { name: 'RxMen',                  companyName: 'rxmen' },
    { name: 'Bombay Shaving Company', companyName: 'bombayshavingcompany' },
    { name: 'Beardo',                 companyName: 'beardo' },
    { name: 'Ustraa',                 companyName: 'ustraa' },
    { name: 'The Man Company',        companyName: 'themancompany' },
    { name: 'Kapiva',                 companyName: 'kapiva' },
    { name: 'Fast and Up',            companyName: 'fastandup' },
    { name: 'Healthkart',             companyName: 'healthkart' },
  ],
  'Bebodywise': [
    { name: 'Gynoveda',         companyName: 'gynoveda' },
    { name: 'Oziva',            companyName: 'oziva' },
    { name: 'Nua',              companyName: 'nuawoman' },
    { name: 'Kindlife',         companyName: 'kindlife' },
    { name: 'Minimalist',       companyName: 'theminimalist' },
    { name: 'Dot and Key',      companyName: 'dotandkey' },
    { name: 'WOW Skin Science', companyName: 'wowskinscienceindia' },
    { name: 'Plum Goodness',    companyName: 'plumgoodness' },
    { name: 'Pilgrim',          companyName: 'pilgrimbeauty' },
    { name: 'mCaffeine',        companyName: 'mcaffeine' },
  ],
  'Little Joys': [
    { name: 'Mee Mee',      companyName: 'meemeeofficial', searchQuery: 'mee mee baby' },
    { name: 'The Moms Co',  companyName: 'themomsco' },
    { name: 'Mylo',         companyName: 'mylo', searchQuery: 'mylo baby care' },
    { name: 'Himalaya Baby', companyName: 'himalayababycare' },
    { name: 'Sebamed Baby', companyName: 'sebamedbaby' },
    { name: 'Chicco India', companyName: 'chiccoindia' },
    { name: 'FirstCry',     companyName: 'firstcry' },
  ],
};

// Flat list for quick lookup
const ALL_COMPETITORS = Object.values(COMPETITORS).flat();

// ─── Category keyword filtering ───────────────────────────────────────────────
// Used to strip off-topic ads returned by broad search queries (e.g. 'mylo').
const CATEGORY_KEYWORDS = {
  'Man Matters':  ['hair', 'beard', 'shave', 'grooming', 'men', 'male', 'testosterone', 'protein', 'fitness', 'stamina', 'face wash', 'skincare', 'supplement', 'health'],
  'Bebodywise':   ['women', 'period', 'pcos', 'pregnancy', 'hormonal', 'skin', 'beauty', 'nutrition', 'supplement', 'wellness', 'female'],
  'Little Joys':  ['baby', 'infant', 'diaper', 'nappy', 'newborn', 'toddler', 'wipes', 'mommy', 'parenting', 'child', 'kids', 'parent', 'mom', 'rash', 'feeding'],
};

/** Look up a competitor's full config object by companyName. */
function getCompetitorConfig(companyName) {
  for (const list of Object.values(COMPETITORS)) {
    const found = list.find((c) => c.companyName.toLowerCase() === companyName.toLowerCase());
    if (found) return found;
  }
  return null;
}

/**
 * Filter ads to only those relevant to the Mosaic brand's category.
 * Falls back to all ads if fewer than 3 would survive.
 */
function filterRelevantAds(ads, brandLabel) {
  const keywords = CATEGORY_KEYWORDS[brandLabel];
  if (!keywords || keywords.length === 0) return ads;
  const relevant = ads.filter((ad) => {
    const text = `${ad.title || ''} ${ad.body || ''}`.toLowerCase();
    return keywords.some((kw) => text.includes(kw));
  });
  return relevant.length >= Math.min(3, ads.length) ? relevant : ads;
}

// ─── Non-English detection + translation ─────────────────────────────────────

/**
 * Returns true if text is predominantly ASCII (Latin script).
 * Non-ASCII ratio > 40% → treat as non-English.
 */
function isEnglishText(text) {
  if (!text || text.length < 10) return true;
  const asciiCount = (text.match(/[\x00-\x7F]/g) || []).length;
  return asciiCount / text.length > 0.6;
}

/**
 * Batch-translate non-English ad bodies using Gemini (1 API call per company).
 * Sets `translated: true` on each mutated ad.
 * Returns original ads untouched if Gemini is unavailable or translation fails.
 */
async function translateAdsToEnglish(ads, companyName) {
  if (!genAI) return ads;

  // Only check body text; skip ads already successfully translated
  const nonEnglishIdxs = ads.reduce((acc, ad, i) => {
    if (!ad.translated && !isEnglishText(ad.body || '')) acc.push(i);
    return acc;
  }, []);
  if (nonEnglishIdxs.length === 0) return ads;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const snippets = nonEnglishIdxs
      .map((i, n) => `[${n}] ${ads[i].body || ''}`)
      .join('\n---\n');
    const prompt = `Translate the following ad copy snippets to English. Return ONLY a JSON array of strings in the same order, no markdown, no extra text.\n\n${snippets}`;
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/^```json?\n?|\n?```$/g, '');
    const translations = JSON.parse(raw);
    if (!Array.isArray(translations)) throw new Error('Expected JSON array response');

    const adsCopy = ads.map((ad) => ({ ...ad }));
    nonEnglishIdxs.forEach((adIdx, n) => {
      const t = translations[n];
      if (typeof t === 'string' && t.trim()) {
        adsCopy[adIdx].body = t;
        adsCopy[adIdx].translated = true; // only set on confirmed success
      }
    });
    console.log(`[translateAdsToEnglish] ${companyName}: translated ${nonEnglishIdxs.length} ads`);
    return adsCopy;
  } catch (err) {
    console.error(`[translateAdsToEnglish] ${companyName}:`, err.message);
    return ads; // return original unchanged — no flags set, retry allowed next request
  }
}

// ─── Sample / Fallback Data ───────────────────────────────────────────────────

/**
 * SAMPLE_ADS — used when SCRAPECREATORS_API_KEY is missing or the API call fails.
 * Gemini still runs analysis on this data → app is fully functional without keys.
 */
const SAMPLE_ADS = [
  // ── Man Matters competitors ───────────────────────────────────────────────
  {
    id: 'ad_001',
    companyName: 'beardo',
    brandLabel: 'Man Matters',
    title: 'Beardo Beard Growth Oil — Grow Your Best Beard',
    body: 'Struggling with patchy beard? Beardo Beard Growth Oil with Redensyl & Biotin promotes thick, healthy beard growth in just 4 weeks. 100% natural. Try now!',
    mediaType: 'video',
    startDate: '2024-10-15',
    endDate: null,
    isActive: true,
    daysRunning: 97,
    impressions: '500K–1M',
    callToAction: 'Shop Now',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Men 18-35',
  },
  {
    id: 'ad_011',
    companyName: 'beardo',
    brandLabel: 'Man Matters',
    title: 'Beardo Activated Charcoal Face Wash — Deep Clean for Men',
    body: 'India\'s #1 men\'s face wash removes 99% pollution, excess oil and dirt. Skin feels fresh for 12 hours. No parabens. Trusted by 50 lakh+ men.',
    mediaType: 'image',
    startDate: '2024-11-01',
    endDate: null,
    isActive: true,
    daysRunning: 80,
    impressions: '100K–500K',
    callToAction: 'Buy Now',
    platforms: ['Instagram'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Men 18-35',
  },
  {
    id: 'ad_002',
    companyName: 'ustraa',
    brandLabel: 'Man Matters',
    title: 'Ustraa Anti-Dandruff Shampoo — #1 for Men',
    body: 'Clinically tested formula. Fights dandruff from root. No sulphates, no parabens. Your scalp deserves better. Order today and get 20% off!',
    mediaType: 'image',
    startDate: '2024-11-20',
    endDate: null,
    isActive: true,
    daysRunning: 61,
    impressions: '100K–500K',
    callToAction: 'Buy Now',
    platforms: ['Facebook'],
    creativeFormat: 'Carousel',
    targetDemographic: 'Men 25-45',
  },
  {
    id: 'ad_012',
    companyName: 'ustraa',
    brandLabel: 'Man Matters',
    title: 'Ustraa Cologne Body Spray — Built for Indian Men',
    body: 'Long-lasting fragrance engineered for the Indian climate. Lasts 8 hours even in summer. 3 scents, 1 winner. Choose yours.',
    mediaType: 'video',
    startDate: '2024-12-05',
    endDate: null,
    isActive: true,
    daysRunning: 46,
    impressions: '100K–500K',
    callToAction: 'Explore Scents',
    platforms: ['Instagram', 'Facebook'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Men 18-35',
  },
  {
    id: 'ad_003',
    companyName: 'themancompany',
    brandLabel: 'Man Matters',
    title: 'The Man Company — Premium Grooming Kits',
    body: 'Level up your grooming game. Curated kits for the modern man. Free shipping on orders above ₹499. Limited time holiday offer!',
    mediaType: 'image',
    startDate: '2024-12-01',
    endDate: '2025-01-15',
    isActive: false,
    daysRunning: 45,
    impressions: '100K–500K',
    callToAction: 'Shop Kits',
    platforms: ['Instagram', 'Facebook'],
    creativeFormat: 'Carousel',
    targetDemographic: 'Men 22-40',
  },
  {
    id: 'ad_013',
    companyName: 'themancompany',
    brandLabel: 'Man Matters',
    title: 'The Man Company Beard Softener — Tame the Wild Mane',
    body: 'Argan oil + Vitamin E beard softener for a touchably smooth beard. No more itchiness or frizz. Absorbs in 60 seconds. India\'s most reviewed beard product.',
    mediaType: 'video',
    startDate: '2024-10-25',
    endDate: null,
    isActive: true,
    daysRunning: 87,
    impressions: '500K–1M',
    callToAction: 'Get It Now',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Men 22-40',
  },
  {
    id: 'ad_010',
    companyName: 'bombayshavingcompany',
    brandLabel: 'Man Matters',
    title: 'Bombay Shaving Company — The Perfect Shave Kit',
    body: 'Engineered for Indian skin. Double edge razor + shaving cream + aftershave balm. Get a barber-quality shave at home. ₹599 starter kit.',
    mediaType: 'image',
    startDate: '2024-12-20',
    endDate: null,
    isActive: true,
    daysRunning: 31,
    impressions: '100K–500K',
    callToAction: 'Get Starter Kit',
    platforms: ['Facebook'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Men 20-40',
  },
  {
    id: 'ad_014',
    companyName: 'bombayshavingcompany',
    brandLabel: 'Man Matters',
    title: 'Bombay Shaving Company Body Groomer — Man-scaping Made Easy',
    body: '360° rotating blade, waterproof, 60-minute runtime. The only body groomer built for Indian men. No nicks, no irritation. ₹1,499 with free trimmer attachment.',
    mediaType: 'video',
    startDate: '2024-11-15',
    endDate: null,
    isActive: true,
    daysRunning: 66,
    impressions: '500K–1M',
    callToAction: 'Shop Groomer',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Men 20-40',
  },
  {
    id: 'ad_015',
    companyName: 'trayahealth',
    brandLabel: 'Man Matters',
    title: 'Traya 3-Root Cause Hair Loss Solution — Regrow Hair in 6 Months',
    body: 'Traya combines Ayurveda + Dermatology + Nutrition to fix hair loss from the root. 93% of customers saw reduced hair fall in 3 months. Free hair test — get your personalised kit.',
    mediaType: 'video',
    startDate: '2024-10-10',
    endDate: null,
    isActive: true,
    daysRunning: 102,
    impressions: '1M–2M',
    callToAction: 'Take Free Hair Test',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Men 25-45',
  },
  {
    id: 'ad_016',
    companyName: 'trayahealth',
    brandLabel: 'Man Matters',
    title: 'Traya Hair Ras — Ayurvedic DHT Blocker Tablets',
    body: '16 Ayurvedic herbs. Clinically proven to reduce DHT — the hormone behind 90% of male hair loss. No side effects. Dermatologist tested. Start your 3-month plan.',
    mediaType: 'image',
    startDate: '2024-11-25',
    endDate: null,
    isActive: true,
    daysRunning: 56,
    impressions: '500K–1M',
    callToAction: 'Start Plan',
    platforms: ['Facebook'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Men 28-50',
  },
  {
    id: 'ad_017',
    companyName: 'boldcare',
    brandLabel: 'Man Matters',
    title: 'Bold Care Performance Kit — Clinically Formulated for Men',
    body: 'The first Ayurvedic + modern science formula for men\'s stamina and performance. Ashwagandha KSM-66 + L-Arginine + Shilajit. No prescription needed. Plain-packed delivery.',
    mediaType: 'video',
    startDate: '2024-10-05',
    endDate: null,
    isActive: true,
    daysRunning: 107,
    impressions: '500K–1M',
    callToAction: 'Buy Now',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Men 25-45',
  },
  {
    id: 'ad_018',
    companyName: 'boldcare',
    brandLabel: 'Man Matters',
    title: 'Bold Care — Honest Conversations About Men\'s Health',
    body: 'We talk about things no one talks about. Premature ejaculation affects 1 in 3 Indian men. There\'s a solution — and you don\'t need to visit a doctor in person.',
    mediaType: 'image',
    startDate: '2024-12-01',
    endDate: null,
    isActive: true,
    daysRunning: 50,
    impressions: '100K–500K',
    callToAction: 'Learn More',
    platforms: ['Instagram'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Men 25-45',
  },
  {
    id: 'ad_019',
    companyName: 'rxmen',
    brandLabel: 'Man Matters',
    title: 'RxMen — Consult a Real Doctor for Men\'s Health. Online.',
    body: 'Licensed doctors. 100% confidential. Prescription in 24 hours, delivered to your door. Hair loss, performance issues, skincare — handled by specialists who understand Indian men.',
    mediaType: 'video',
    startDate: '2024-11-10',
    endDate: null,
    isActive: true,
    daysRunning: 71,
    impressions: '100K–500K',
    callToAction: 'Book Consultation',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Men 25-50',
  },
  {
    id: 'ad_020',
    companyName: 'rxmen',
    brandLabel: 'Man Matters',
    title: 'RxMen Minoxidil 5% — Doctor-Prescribed Hair Regrowth',
    body: 'FDA-approved. Clinically proven. No guesswork. RxMen doctors prescribe the exact minoxidil concentration for your hair loss stage. First month ₹299.',
    mediaType: 'image',
    startDate: '2024-12-10',
    endDate: null,
    isActive: true,
    daysRunning: 41,
    impressions: '100K–500K',
    callToAction: 'Start ₹299',
    platforms: ['Instagram'],
    creativeFormat: 'Carousel',
    targetDemographic: 'Men 22-45',
  },
  {
    id: 'ad_021',
    companyName: 'kapiva',
    brandLabel: 'Man Matters',
    title: 'Kapiva Himalayan Shilajit — Pure. Potent. Proven.',
    body: 'Sourced at 16,000 ft from the Himalayas. 85+ minerals. Lab-tested for purity. Boosts energy, strength and stamina in 30 days. Most trusted Shilajit brand in India.',
    mediaType: 'image',
    startDate: '2024-10-20',
    endDate: null,
    isActive: true,
    daysRunning: 92,
    impressions: '500K–1M',
    callToAction: 'Buy Pure Shilajit',
    platforms: ['Facebook'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Men 28-55',
  },
  {
    id: 'ad_022',
    companyName: 'kapiva',
    brandLabel: 'Man Matters',
    title: 'Kapiva Apple Cider Vinegar Juice — 30-Day Transformation',
    body: 'Real ACV with the "Mother". Supports digestion, weight management and immunity. No added sugar. 1 tbsp a day. 4.5-star rating from 50,000+ customers.',
    mediaType: 'video',
    startDate: '2024-11-30',
    endDate: null,
    isActive: true,
    daysRunning: 51,
    impressions: '100K–500K',
    callToAction: 'Try 30-Day Pack',
    platforms: ['Instagram', 'Facebook'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Men & Women 25-45',
  },
  {
    id: 'ad_023',
    companyName: 'fastandup',
    brandLabel: 'Man Matters',
    title: 'Fast&Up Whey Protein — Swiss Quality, Indian Pricing',
    body: '24g protein per serving. No artificial fillers. Informed Sport certified. Mixes in 10 seconds. The protein serious athletes choose. Now with 5 Indian flavours including Kesar Pista.',
    mediaType: 'image',
    startDate: '2024-11-05',
    endDate: null,
    isActive: true,
    daysRunning: 76,
    impressions: '500K–1M',
    callToAction: 'Order Now',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Men 20-35',
  },
  {
    id: 'ad_024',
    companyName: 'fastandup',
    brandLabel: 'Man Matters',
    title: 'Fast&Up Charge — India\'s #1 Effervescent Energy Supplement',
    body: 'Vitamin C + Zinc + Electrolytes in one fizzy tablet. Drop, dissolve, drink. Energize before your workout or beat afternoon fatigue. No sugar. Trusted by Team India.',
    mediaType: 'video',
    startDate: '2024-12-15',
    endDate: null,
    isActive: true,
    daysRunning: 36,
    impressions: '100K–500K',
    callToAction: 'Try 20 Tablets Free',
    platforms: ['Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Men & Women 18-40',
  },
  {
    id: 'ad_025',
    companyName: 'healthkart',
    brandLabel: 'Man Matters',
    title: 'HealthKart HK Vitals — Complete Daily Nutrition Stack',
    body: 'Multivitamin + Omega 3 + Biotin in one combo. Lab-certified purity. FSSAI approved. Trusted by 1 crore+ customers. 30-day pack at ₹699.',
    mediaType: 'image',
    startDate: '2024-10-01',
    endDate: null,
    isActive: true,
    daysRunning: 111,
    impressions: '1M–2M',
    callToAction: 'Build My Stack',
    platforms: ['Facebook'],
    creativeFormat: 'Carousel',
    targetDemographic: 'Men & Women 25-45',
  },
  {
    id: 'ad_026',
    companyName: 'healthkart',
    brandLabel: 'Man Matters',
    title: 'MuscleBlaze Whey Protein by HealthKart — Lab Certified',
    body: 'India\'s most-tested protein brand. Every batch tested for label accuracy, heavy metals and banned substances. 25g protein, 5.5g BCAA per scoop. Bulk like a pro.',
    mediaType: 'video',
    startDate: '2024-11-12',
    endDate: null,
    isActive: true,
    daysRunning: 69,
    impressions: '500K–1M',
    callToAction: 'Shop MuscleBlaze',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Men 18-35',
  },

  // ── Bebodywise competitors ─────────────────────────────────────────────────
  {
    id: 'ad_027',
    companyName: 'gynoveda',
    brandLabel: 'Bebodywise',
    title: 'Gynoveda PCOS Solution — 97% Success in 90 Days',
    body: '300+ herbs. Zero side effects. Gynoveda\'s Ayurvedic PCOS treatment has helped 5 lakh+ women regulate periods, reduce cysts and balance hormones. Free PCOS test included.',
    mediaType: 'video',
    startDate: '2024-10-01',
    endDate: null,
    isActive: true,
    daysRunning: 111,
    impressions: '1M–2M',
    callToAction: 'Take Free PCOS Test',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Women 18-38',
  },
  {
    id: 'ad_028',
    companyName: 'gynoveda',
    brandLabel: 'Bebodywise',
    title: 'Gynoveda Period Kit — Goodbye Irregular Cycles',
    body: 'Missed periods? Heavy bleeding? Cramping? Gynoveda\'s Period Kit uses 5000-year-old Ayurvedic herbs to restore your natural cycle. 3-month plan with a money-back guarantee.',
    mediaType: 'image',
    startDate: '2024-11-20',
    endDate: null,
    isActive: true,
    daysRunning: 61,
    impressions: '500K–1M',
    callToAction: 'Start Period Plan',
    platforms: ['Instagram'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Women 18-38',
  },
  {
    id: 'ad_029',
    companyName: 'oziva',
    brandLabel: 'Bebodywise',
    title: 'OZiva Protein & Herbs for Women — Beauty + Strength Together',
    body: '25g clean plant protein + Shatavari + Ashoka + Lodhra. For glowing skin, strong hair and lean muscle. Vegan certified. No artificial sweeteners. Your daily wellness shake.',
    mediaType: 'image',
    startDate: '2024-10-25',
    endDate: null,
    isActive: true,
    daysRunning: 87,
    impressions: '500K–1M',
    callToAction: 'Buy Protein',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Carousel',
    targetDemographic: 'Women 22-40',
  },
  {
    id: 'ad_030',
    companyName: 'oziva',
    brandLabel: 'Bebodywise',
    title: 'OZiva She Transform — Hormone Balance + Weight Management',
    body: 'Clinically formulated for Indian women. Chasteberry + Ashwagandha + DIM regulate oestrogen, reduce bloating and support healthy weight. 60-day transformation programme.',
    mediaType: 'video',
    startDate: '2024-12-01',
    endDate: null,
    isActive: true,
    daysRunning: 50,
    impressions: '100K–500K',
    callToAction: 'Start Transformation',
    platforms: ['Instagram', 'Facebook'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Women 25-42',
  },
  {
    id: 'ad_004',
    companyName: 'nuawoman',
    brandLabel: 'Bebodywise',
    title: 'Nua Cramp Comfort — Period Pain Relief',
    body: "Say goodbye to period pain. Nua's Cramp Comfort patches provide natural, non-drowsy relief for up to 12 hours. Subscribe & save 15%.",
    mediaType: 'video',
    startDate: '2024-10-01',
    endDate: null,
    isActive: true,
    daysRunning: 111,
    impressions: '1M–2M',
    callToAction: 'Subscribe Now',
    platforms: ['Instagram', 'Facebook'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Women 18-35',
  },
  {
    id: 'ad_031',
    companyName: 'nuawoman',
    brandLabel: 'Bebodywise',
    title: 'Nua Period Panties — 12 Hours of Leak-Free Confidence',
    body: 'Holds up to 4 tampons worth. Breathable, anti-bacterial, reusable. Replace 100+ single-use products per year. Better for your body, better for the planet.',
    mediaType: 'image',
    startDate: '2024-11-15',
    endDate: null,
    isActive: true,
    daysRunning: 66,
    impressions: '500K–1M',
    callToAction: 'Try Nua Panties',
    platforms: ['Instagram'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Women 18-40',
  },
  {
    id: 'ad_032',
    companyName: 'kindlife',
    brandLabel: 'Bebodywise',
    title: 'Kindlife — India\'s Cleanest Beauty Platform. 300+ Brands.',
    body: 'Every product tested for harmful ingredients. No parabens, no sulphates, no nasties. Shop clean skincare, haircare and wellness — curated by experts. Free delivery above ₹499.',
    mediaType: 'image',
    startDate: '2024-11-10',
    endDate: null,
    isActive: true,
    daysRunning: 71,
    impressions: '100K–500K',
    callToAction: 'Shop Clean Beauty',
    platforms: ['Instagram', 'Facebook'],
    creativeFormat: 'Carousel',
    targetDemographic: 'Women 22-40',
  },
  {
    id: 'ad_033',
    companyName: 'kindlife',
    brandLabel: 'Bebodywise',
    title: 'Kindlife Flagship Sale — Up to 40% Off Clean Beauty',
    body: 'Don\'t miss it. 48 hours only. 300+ clean beauty brands at their lowest prices of the year. No compromise on ingredients, massive savings on price. Shop now.',
    mediaType: 'video',
    startDate: '2024-12-15',
    endDate: '2025-01-05',
    isActive: false,
    daysRunning: 21,
    impressions: '500K–1M',
    callToAction: 'Shop Sale',
    platforms: ['Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Women 20-40',
  },
  {
    id: 'ad_034',
    companyName: 'theminimalist',
    brandLabel: 'Bebodywise',
    title: 'The Minimalist 10% Niacinamide — Honest Skincare at Honest Prices',
    body: 'Clinical 10% concentration. Fades dark spots, shrinks pores, controls oil. No fillers, no fancy packaging markup. Just ingredients that work. ₹299 for 30ml.',
    mediaType: 'image',
    startDate: '2024-10-15',
    endDate: null,
    isActive: true,
    daysRunning: 97,
    impressions: '1M–2M',
    callToAction: 'Buy for ₹299',
    platforms: ['Instagram', 'Facebook'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Women & Men 18-35',
  },
  {
    id: 'ad_035',
    companyName: 'theminimalist',
    brandLabel: 'Bebodywise',
    title: 'The Minimalist 0.3% Retinol — Anti-Ageing Made Simple',
    body: 'Retinol without the overwhelm. Starter-strength formula for beginners. Reduces fine lines, evens skin tone and firms texture overnight. Pair with SPF in the morning.',
    mediaType: 'video',
    startDate: '2024-11-22',
    endDate: null,
    isActive: true,
    daysRunning: 59,
    impressions: '500K–1M',
    callToAction: 'Add to Routine',
    platforms: ['Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Women 25-42',
  },
  {
    id: 'ad_036',
    companyName: 'dotandkey',
    brandLabel: 'Bebodywise',
    title: 'Dot & Key Watermelon Sunscreen SPF 50 — No White Cast. Ever.',
    body: 'India\'s most-loved SPF 50 sunscreen. Lightweight gel texture, blends into all skin tones, smells incredible. Broad spectrum UVA+UVB. No white cast. Wear alone or under makeup.',
    mediaType: 'image',
    startDate: '2024-10-10',
    endDate: null,
    isActive: true,
    daysRunning: 102,
    impressions: '1M–2M',
    callToAction: 'Shop SPF 50',
    platforms: ['Instagram', 'Facebook'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Women 18-38',
  },
  {
    id: 'ad_037',
    companyName: 'dotandkey',
    brandLabel: 'Bebodywise',
    title: 'Dot & Key Sleep Body Butter — Wake Up to Softer Skin',
    body: 'Hyaluronic acid + Ceramides + Shea Butter. Apply before bed. Wake up with baby-soft skin. The overnight body transformation your skin deserves.',
    mediaType: 'video',
    startDate: '2024-12-08',
    endDate: null,
    isActive: true,
    daysRunning: 43,
    impressions: '100K–500K',
    callToAction: 'Try Overnight',
    platforms: ['Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Women 22-40',
  },
  {
    id: 'ad_038',
    companyName: 'wowskinscienceindia',
    brandLabel: 'Bebodywise',
    title: 'WOW Apple Cider Vinegar Shampoo — No Sulphates, All Results',
    body: 'Real ACV with enzymes removes product buildup, unclogs hair follicles and adds shine. No sulphates, parabens or mineral oil. India\'s highest-rated sulphate-free shampoo.',
    mediaType: 'video',
    startDate: '2024-10-18',
    endDate: null,
    isActive: true,
    daysRunning: 94,
    impressions: '500K–1M',
    callToAction: 'Buy Now',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Women & Men 20-40',
  },
  {
    id: 'ad_039',
    companyName: 'wowskinscienceindia',
    brandLabel: 'Bebodywise',
    title: 'WOW Vitamin C Face Wash — Brighter Skin in 14 Days',
    body: 'Vitamin C + Hyaluronic Acid daily face wash. Removes tan, evens skin tone, gives a natural glow. Guaranteed visible results in 14 days or your money back.',
    mediaType: 'image',
    startDate: '2024-11-28',
    endDate: null,
    isActive: true,
    daysRunning: 53,
    impressions: '100K–500K',
    callToAction: 'Get Brighter Skin',
    platforms: ['Instagram'],
    creativeFormat: 'Carousel',
    targetDemographic: 'Women 20-40',
  },
  {
    id: 'ad_040',
    companyName: 'plumgoodness',
    brandLabel: 'Bebodywise',
    title: 'Plum Grape Seed & Sea Buckthorn Face Oil — Anti-Ageing in a Bottle',
    body: '100% vegan. Cruelty-free. Rich in antioxidants and Omega-7. Visibly reduces fine lines in 4 weeks. The clean beauty face oil dermatologists recommend.',
    mediaType: 'image',
    startDate: '2024-11-01',
    endDate: null,
    isActive: true,
    daysRunning: 80,
    impressions: '100K–500K',
    callToAction: 'Shop Face Oil',
    platforms: ['Instagram', 'Facebook'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Women 28-45',
  },
  {
    id: 'ad_041',
    companyName: 'plumgoodness',
    brandLabel: 'Bebodywise',
    title: 'Plum 1% Salicylic Acid Body Lotion — Goodbye Chicken Skin',
    body: 'Treats KP (keratosis pilaris) — those tiny bumps on arms and thighs. Salicylic acid + lactic acid combo visibly smooths skin in 3 weeks. Fragrance-free. Vegan.',
    mediaType: 'video',
    startDate: '2024-12-12',
    endDate: null,
    isActive: true,
    daysRunning: 39,
    impressions: '100K–500K',
    callToAction: 'Smooth My Skin',
    platforms: ['Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Women 18-38',
  },
  {
    id: 'ad_042',
    companyName: 'pilgrimbeauty',
    brandLabel: 'Bebodywise',
    title: 'Pilgrim Vitamin C Serum — K-Beauty Formula, Indian Skin Tested',
    body: 'Inspired by Korean skincare. Formulated for Indian skin tones. 15% stabilised Vitamin C + 1% Niacinamide. Fades dark spots in 4 weeks. SPF compatible. ₹449.',
    mediaType: 'image',
    startDate: '2024-10-22',
    endDate: null,
    isActive: true,
    daysRunning: 90,
    impressions: '500K–1M',
    callToAction: 'Get the Glow',
    platforms: ['Instagram', 'Facebook'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Women 22-40',
  },
  {
    id: 'ad_043',
    companyName: 'pilgrimbeauty',
    brandLabel: 'Bebodywise',
    title: 'Pilgrim Red Vine Pore Minimizer Toner — Visible Pores in 1 Week',
    body: 'French red vine extract tightens pores, balances oiliness and preps skin for serums. Alcohol-free. 4.8-star rating. Visible pore reduction in 7 days guaranteed.',
    mediaType: 'video',
    startDate: '2024-12-02',
    endDate: null,
    isActive: true,
    daysRunning: 49,
    impressions: '100K–500K',
    callToAction: 'Try Toner',
    platforms: ['Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Women 18-38',
  },
  {
    id: 'ad_044',
    companyName: 'mcaffeine',
    brandLabel: 'Bebodywise',
    title: 'mCaffeine Coffee Face Scrub — De-Tan in 60 Seconds',
    body: 'Arabica coffee + Vitamin C + Hyaluronic Acid. Exfoliates dead skin, removes tan and reveals glowing skin in under a minute. India\'s #1 coffee beauty brand. Vegan.',
    mediaType: 'video',
    startDate: '2024-10-08',
    endDate: null,
    isActive: true,
    daysRunning: 104,
    impressions: '1M–2M',
    callToAction: 'Scrub Now',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Women & Men 18-35',
  },
  {
    id: 'ad_045',
    companyName: 'mcaffeine',
    brandLabel: 'Bebodywise',
    title: 'mCaffeine Naked & Raw Coffee Body Lotion — Daily Caffeine Fix for Skin',
    body: 'Hydrates for 72 hours. Reduces cellulite. Firms skin. The body lotion you\'ll actually remember to apply every day because it smells this good. Vegan. No mineral oil.',
    mediaType: 'image',
    startDate: '2024-11-18',
    endDate: null,
    isActive: true,
    daysRunning: 63,
    impressions: '500K–1M',
    callToAction: 'Shop Body Lotion',
    platforms: ['Instagram'],
    creativeFormat: 'Carousel',
    targetDemographic: 'Women 20-38',
  },

  // ── Little Joys competitors ────────────────────────────────────────────────
  {
    id: 'ad_046',
    companyName: 'babychakra',
    brandLabel: 'Little Joys',
    title: 'BabyChakra — Trusted by 1 Crore+ Indian Parents',
    body: 'India\'s #1 parenting app. Get personalised week-by-week pregnancy updates, expert doctor advice and a community of parents just like you. Free download.',
    mediaType: 'image',
    startDate: '2024-10-12',
    endDate: null,
    isActive: true,
    daysRunning: 100,
    impressions: '1M–2M',
    callToAction: 'Download Free',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Parents 25-38',
  },
  {
    id: 'ad_047',
    companyName: 'babychakra',
    brandLabel: 'Little Joys',
    title: 'BabyChakra Immunity Booster for Kids — Paediatrician Recommended',
    body: 'Zinc + Vitamin C + Elderberry gummies. Developed by paediatricians. No artificial colour or flavour. Clinically tested. Kids actually love them. 60-day money-back guarantee.',
    mediaType: 'video',
    startDate: '2024-11-08',
    endDate: null,
    isActive: true,
    daysRunning: 73,
    impressions: '500K–1M',
    callToAction: 'Buy Immunity Pack',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Parents 28-42',
  },
  {
    id: 'ad_007',
    companyName: 'themomsco',
    brandLabel: 'Little Joys',
    title: 'The Moms Co — Natural Baby Care Starter Kit',
    body: 'Everything your baby needs in one box. Dermatologically tested. Free from harsh chemicals. Perfect baby shower gift!',
    mediaType: 'image',
    startDate: '2024-12-10',
    endDate: null,
    isActive: true,
    daysRunning: 41,
    impressions: '100K–500K',
    callToAction: 'Gift Now',
    platforms: ['Instagram'],
    creativeFormat: 'Carousel',
    targetDemographic: 'New parents 25-38',
  },
  {
    id: 'ad_048',
    companyName: 'themomsco',
    brandLabel: 'Little Joys',
    title: 'The Moms Co Belly Butter — Prevent Stretch Marks Naturally',
    body: 'Shea butter + Rosehip + Vitamin E stretches with your growing belly to prevent stretch marks. Safe for pregnancy. Dermatologist tested. Used by 5 lakh+ moms.',
    mediaType: 'video',
    startDate: '2024-11-02',
    endDate: null,
    isActive: true,
    daysRunning: 79,
    impressions: '500K–1M',
    callToAction: 'Protect Your Skin',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Pregnant women 25-38',
  },
  {
    id: 'ad_049',
    companyName: 'mylo',
    brandLabel: 'Little Joys',
    title: 'Mylo Pregnancy Pillow — Sleep Comfortably All 3 Trimesters',
    body: 'C-shaped full body pillow supports back, hips, knees and tummy at once. Memory foam with cooling cover. Used by 3 lakh+ pregnant women in India. Free shipping.',
    mediaType: 'image',
    startDate: '2024-10-28',
    endDate: null,
    isActive: true,
    daysRunning: 84,
    impressions: '100K–500K',
    callToAction: 'Sleep Better Tonight',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Pregnant women 25-38',
  },
  {
    id: 'ad_050',
    companyName: 'mylo',
    brandLabel: 'Little Joys',
    title: 'Mylo — India\'s Largest Pregnancy & Parenting Community',
    body: 'Week-by-week pregnancy tracking. Expert Q&A. Connect with 20 lakh+ parents in your city. Shop tested baby products. Everything in one app. Join free.',
    mediaType: 'video',
    startDate: '2024-11-25',
    endDate: null,
    isActive: true,
    daysRunning: 56,
    impressions: '500K–1M',
    callToAction: 'Join Community',
    platforms: ['Instagram', 'Facebook'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Parents & expecting moms 24-38',
  },
  {
    id: 'ad_051',
    companyName: 'himalayababycare',
    brandLabel: 'Little Joys',
    title: 'Himalaya Baby Lotion — Gentle Care Since 1999',
    body: 'Dermatologically tested on sensitive baby skin. Aloe vera + olive oil keeps skin soft and moisturised for 24 hours. Trusted by paediatricians across India.',
    mediaType: 'image',
    startDate: '2024-10-05',
    endDate: null,
    isActive: true,
    daysRunning: 107,
    impressions: '2M–5M',
    callToAction: 'Buy for Baby',
    platforms: ['Facebook'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Parents 25-40',
  },
  {
    id: 'ad_052',
    companyName: 'himalayababycare',
    brandLabel: 'Little Joys',
    title: 'Himalaya Baby Massage Oil — 100% Natural, Doctor Approved',
    body: 'Cold-pressed olive + almond oil blend. Promotes healthy weight gain, bone development and deeper sleep in newborns. Recommended by 8 in 10 Indian paediatricians.',
    mediaType: 'video',
    startDate: '2024-11-20',
    endDate: null,
    isActive: true,
    daysRunning: 61,
    impressions: '1M–2M',
    callToAction: 'Massage & Bond',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'New parents 24-38',
  },
  {
    id: 'ad_053',
    companyName: 'sebamedbaby',
    brandLabel: 'Little Joys',
    title: 'Sebamed Baby Bar pH 5.5 — Clinically Proven for Newborn Skin',
    body: 'Newborn skin pH is 5.5 — most baby soaps are pH 7 (too alkaline). Sebamed Baby Bar matches your baby\'s skin pH exactly. Protects the acid mantle from day one.',
    mediaType: 'image',
    startDate: '2024-10-30',
    endDate: null,
    isActive: true,
    daysRunning: 82,
    impressions: '100K–500K',
    callToAction: 'Protect Baby Skin',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Image',
    targetDemographic: 'Parents 25-40',
  },
  {
    id: 'ad_054',
    companyName: 'sebamedbaby',
    brandLabel: 'Little Joys',
    title: 'Sebamed Baby — German Medical Grade Skincare. Safe from Day One.',
    body: 'Developed by German dermatologists. Used in over 4,500 hospitals worldwide. pH 5.5 formula. Hypoallergenic. Recommended for newborns, eczema-prone and sensitive baby skin.',
    mediaType: 'video',
    startDate: '2024-12-05',
    endDate: null,
    isActive: true,
    daysRunning: 46,
    impressions: '100K–500K',
    callToAction: 'Shop Sebamed Baby',
    platforms: ['Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Parents 25-42',
  },
  {
    id: 'ad_055',
    companyName: 'chiccoindia',
    brandLabel: 'Little Joys',
    title: 'Chicco Baby Stroller — Italian Engineering. Indian Trust.',
    body: 'Lightweight. One-hand fold. 5-point harness. UV canopy. The stroller that 50 lakh+ Italian families trust, now trusted by Indian parents too. EMI available.',
    mediaType: 'image',
    startDate: '2024-11-05',
    endDate: null,
    isActive: true,
    daysRunning: 76,
    impressions: '100K–500K',
    callToAction: 'View Strollers',
    platforms: ['Facebook'],
    creativeFormat: 'Carousel',
    targetDemographic: 'Parents 28-42',
  },
  {
    id: 'ad_056',
    companyName: 'chiccoindia',
    brandLabel: 'Little Joys',
    title: 'Chicco Natural Feeling Baby Bottle — Closest to Breastfeeding',
    body: 'Anti-colic valve. Soft silicone nipple mimics natural breastfeeding. Reduces bottle preference and supports continued breastfeeding. BPA-free. Italian quality.',
    mediaType: 'video',
    startDate: '2024-12-18',
    endDate: null,
    isActive: true,
    daysRunning: 33,
    impressions: '100K–500K',
    callToAction: 'Shop Bottles',
    platforms: ['Instagram', 'Facebook'],
    creativeFormat: 'Single Video',
    targetDemographic: 'New moms 24-38',
  },
  {
    id: 'ad_057',
    companyName: 'firstcry',
    brandLabel: 'Little Joys',
    title: 'FirstCry — India\'s Largest Baby & Kids Store. 2 Lakh+ Products.',
    body: 'Diapers, formula, clothing, toys, strollers — everything for your child from 0 to 12 years. 100% authentic brands. Next-day delivery across 500+ cities.',
    mediaType: 'image',
    startDate: '2024-10-08',
    endDate: null,
    isActive: true,
    daysRunning: 104,
    impressions: '2M–5M',
    callToAction: 'Shop Now',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Carousel',
    targetDemographic: 'Parents 24-40',
  },
  {
    id: 'ad_058',
    companyName: 'firstcry',
    brandLabel: 'Little Joys',
    title: 'FirstCry BabyBerry Diapers — Rash-Free Guarantee',
    body: 'Dermatologist tested. Wetness indicator changes colour. Soft cotton core. 12-hour dryness. Over 1 crore diapers sold. Try the BabyBerry range — 30-day rash-free guarantee.',
    mediaType: 'video',
    startDate: '2024-11-28',
    endDate: null,
    isActive: true,
    daysRunning: 53,
    impressions: '500K–1M',
    callToAction: 'Try BabyBerry',
    platforms: ['Facebook', 'Instagram'],
    creativeFormat: 'Single Video',
    targetDemographic: 'Parents 24-38',
  },
];

// ─── ScrapeCreators API ───────────────────────────────────────────────────────

/**
 * Fetch ads for a single company from the ScrapeCreators Meta Ad Library API.
 * Correct endpoint: GET /v1/facebook/adLibrary/search/ads (camelCase, /search/)
 * Returns null on any error so callers can fall back to SAMPLE_ADS.
 */
async function fetchAdsFromAPI(companyName, searchQuery) {
  if (!SCRAPE_API_KEY) return null;

  try {
    const response = await axios.get(
      'https://api.scrapecreators.com/v1/facebook/adLibrary/search/ads',
      {
        params: {
          query: searchQuery || companyName,
          status: 'ACTIVE',
          country: 'ALL',
          ad_type: 'all',
        },
        headers: {
          'x-api-key': SCRAPE_API_KEY,
        },
        timeout: 15000,
      }
    );

    // ScrapeCreators returns { searchResults: [...], searchResultsCount: N, cursor: "..." }
    const raw = response.data?.searchResults || response.data?.ads || [];
    if (!Array.isArray(raw)) return null;
    if (raw.length === 0) return []; // API succeeded but no active ads — distinguish from error

    const brandLabel =
      Object.entries(COMPETITORS).find(([, list]) =>
        list.some((c) => c.companyName.toLowerCase() === companyName.toLowerCase())
      )?.[0] || 'Unknown';

    const now = new Date();

    return raw.map((ad, i) => {
      // ScrapeCreators timestamps are Unix seconds
      const startTs = ad.start_date || ad.ad_creation_time;
      const endTs = ad.end_date || ad.ad_delivery_stop_time || null;

      const startDate = startTs
        ? new Date(startTs * 1000).toISOString().split('T')[0]
        : null;
      const endDate = endTs
        ? new Date(endTs * 1000).toISOString().split('T')[0]
        : null;

      const start = startDate ? new Date(startDate) : now;
      const daysRunning = Math.max(
        0,
        Math.floor((now - start) / (1000 * 60 * 60 * 24))
      );

      // Body text lives in snapshot.body.text or snapshot.cards[].body
      const snapshot = ad.snapshot || {};
      const bodyText =
        snapshot.body?.text ||
        snapshot.cards?.[0]?.body ||
        ad.ad_creative_bodies?.[0] ||
        '';

      // Title from page name + card headline
      const title =
        snapshot.cards?.[0]?.title ||
        snapshot.title ||
        ad.page_name ||
        companyName;

      // Detect media type
      const hasVideo =
        snapshot.videos?.length > 0 ||
        snapshot.cards?.some((c) => c.video_sd_url || c.video_hd_url);
      const hasCarousel = (snapshot.cards || []).length > 1;
      const mediaType = hasVideo ? 'video' : hasCarousel ? 'carousel' : 'image';

      // CTA from first card
      const cta = snapshot.cards?.[0]?.cta_text || snapshot.cta_text || 'Learn More';

      // Impressions text from spend/impression info
      const impressions =
        ad.impressionText ||
        ad.eu_total_reach ||
        (ad.spend ? `₹${ad.spend}` : 'Unknown');

      // Platforms
      const platforms = ad.publisher_platforms || ['Facebook'];

      return {
        id: ad.ad_archive_id || ad.adArchiveID || `${companyName}_${i}`,
        companyName,
        brandLabel,
        title,
        body: bodyText,
        mediaType,
        startDate,
        endDate,
        isActive: ad.is_active !== undefined ? ad.is_active : (!endDate || new Date(endDate) > now),
        daysRunning,
        impressions,
        callToAction: cta,
        platforms: Array.isArray(platforms) ? platforms : [platforms],
        creativeFormat: hasCarousel ? 'Carousel' : hasVideo ? 'Single Video' : 'Single Image',
        targetDemographic: ad.demographic_distribution?.[0]?.gender
          ? `${ad.demographic_distribution[0].gender} ${ad.demographic_distribution[0].age || ''}`
          : 'Unknown',
      };
    });
  } catch (err) {
    console.error(`[ScrapeCreators] Failed for ${companyName}:`, err.message);
    return null;
  }
}

// ─── In-memory fetch deduplication ───────────────────────────────────────────
// Prevents concurrent duplicate ScrapeCreators calls for the same company.
const _pendingFetches = new Map(); // companyName → Promise<ads[]|null>

/**
 * Cache-first, deduplicated ad fetch.
 * - Returns fresh cache immediately (no API call).
 * - If already fetching this company, returns the in-flight Promise.
 * - Otherwise starts a new ScrapeCreators call, saves result, and cleans up.
 * @param {string} companyName
 * @returns {Promise<Array|null>}
 */
async function fetchCompanyAds(companyName) {
  // 1. Fresh 24h cache → re-translate if needed, then return
  const cached = await getCachedAds(companyName, 24);
  if (cached) {
    // Re-translate any non-English ads that weren't successfully translated before
    // (e.g. cached before translation was added, or previous Gemini call failed)
    const needsTranslation = genAI && cached.some(
      (ad) => !ad.translated && !isEnglishText(ad.body || '')
    );
    if (needsTranslation) {
      const translated = await translateAdsToEnglish(cached, companyName);
      await saveAds(companyName, translated); // persist translations back to cache
      return translated;
    }
    return cached;
  }

  // 2. Already in-flight → reuse same promise
  if (_pendingFetches.has(companyName)) {
    return _pendingFetches.get(companyName);
  }

  // 3. Resolve competitor config for custom searchQuery + brandLabel
  const config = getCompetitorConfig(companyName);
  const searchQuery = config?.searchQuery || null;
  const brandLabel = Object.entries(COMPETITORS).find(([, list]) =>
    list.some((c) => c.companyName.toLowerCase() === companyName.toLowerCase())
  )?.[0] || null;

  // 4. New fetch — with category filtering + translation pipeline
  const p = fetchAdsFromAPI(companyName, searchQuery)
    .then(async (ads) => {
      if (ads === null) return null; // true API error — caller adds to errors list
      if (ads.length === 0) {
        // API succeeded but no active ads — save empty cache entry so it shows as "loaded"
        await saveAds(companyName, []);
        return [];
      }
      // Strip off-topic ads (e.g. non-baby Mylo results)
      let filtered = filterRelevantAds(ads, brandLabel);
      // Translate non-English ad copy (title + body) to English
      filtered = await translateAdsToEnglish(filtered, companyName);
      await saveAds(companyName, filtered);
      return filtered;
    })
    .catch((err) => {
      console.error(`[fetchCompanyAds] ${companyName}:`, err.message);
      return null;
    })
    .finally(() => {
      _pendingFetches.delete(companyName);
    });

  _pendingFetches.set(companyName, p);
  return p;
}

// ─── Gemini AI ────────────────────────────────────────────────────────────────

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

/**
 * Strip markdown code fences (```json ... ``` or ``` ... ```) from a string
 * and return clean JSON text ready for JSON.parse.
 */
function stripMarkdownFences(text) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

/**
 * Sample up to 50 representative ads from a large set for Gemini analysis.
 * Returns the original array unchanged if it has 50 or fewer ads.
 * Strategy: top 20 by daysRunning + top 20 by most recent startDate + 10 random from rest.
 */
function sampleAdsForGemini(ads) {
  if (ads.length <= 50) return ads;

  const seen = new Set();
  const pick = (arr) => {
    const out = [];
    for (const a of arr) {
      if (!seen.has(a.id)) { seen.add(a.id); out.push(a); }
    }
    return out;
  };

  const byDays = pick([...ads].sort((a, b) => (b.daysRunning || 0) - (a.daysRunning || 0)).slice(0, 20));
  const byRecent = pick([...ads].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '')).slice(0, 20));
  const rest = ads.filter((a) => !seen.has(a.id));
  const random = pick(rest.sort(() => Math.random() - 0.5).slice(0, 10));

  return [...byDays, ...byRecent, ...random];
}

/**
 * Call Gemini 2.5 Flash with a full analysis prompt.
 * Falls back to a simplified prompt if the first parse attempt fails.
 * @param {Array}  ads   - Array of ad objects to analyse
 * @param {string} brand - Brand focus: 'All' | 'Man Matters' | 'Bebodywise' | 'Little Joys'
 * @returns {object} Parsed JSON brief
 */
async function runGeminiAnalysis(ads, brand = 'All') {
  if (!genAI) throw new Error('GEMINI_API_KEY not set');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const adsJson = JSON.stringify(sampleAdsForGemini(ads), null, 2);

  // Brand-specific focus instruction injected when a single brand is selected
  const brandFocusInstruction = brand !== 'All'
    ? `Focus this analysis specifically on the ${brand} competitive category.
All insights, the weekly brief, gap opportunities, and messaging shifts
should be relevant only to ${brand} and its specific competitors.
Do not mention competitors from other brand categories.`
    : 'Provide analysis covering all three Mosaic brands: Man Matters, Bebodywise, and Little Joys.';

  const fullPrompt = `
You are a senior brand strategist analyzing competitor Meta (Facebook/Instagram) ads for Mosaic Wellness — the parent company of Man Matters, Bebodywise, and Little Joys.

${brandFocusInstruction}

Analyze the following competitor ad data and return a JSON object (no markdown, no code fences, raw JSON only) with this exact structure:

{
  "topInsights": [
    { "insight": "string", "priority": "high|medium|low", "brand": "string" }
  ],
  "weeklyBrief": "string (2-3 paragraph narrative summary)",
  "messagingShifts": [
    { "competitor": "string", "oldMessage": "string", "newMessage": "string", "signal": "string" }
  ],
  "creativeTrends": [
    { "trend": "string", "count": number, "percentage": number, "brand": "string", "direction": "rising|stable|declining" }
  ],
  "opportunityGaps": [
    "string describing what competitors are NOT doing that Mosaic brands could own"
  ],
  "provenPerformers": [
    { "adId": "string", "competitor": "string", "daysRunning": number, "why": "string" }
  ],
  "threatLevel": "low|medium|high",
  "threatReason": "string"
}

Rules:
- topInsights: 5-7 bullet insights, ordered by priority
- weeklyBrief: written as an internal intelligence briefing for a CMO
- messagingShifts: You MUST provide at least 2 entries. If you cannot detect a clear before/after pivot, infer one based on the dominant messaging pattern vs what a newer competitor is doing differently. Never return empty string for oldMessage or newMessage.
- creativeTrends: identify patterns in ad formats, hooks, visual styles; direction must be "rising", "stable", or "declining" based on market momentum
- opportunityGaps: frame as "Competitors are NOT doing X" — this is what Mosaic can own
- provenPerformers: ads running 60+ days are battle-tested; explain why they work
- threatLevel: overall competitive pressure level
- Return ONLY the JSON object, no preamble, no markdown, no code fences

Ad Data:
${adsJson}
`;

  let result, text;

  // First attempt with full prompt
  try {
    result = await model.generateContent(fullPrompt);
    text = result.response.text();
    const cleaned = stripMarkdownFences(text);
    return JSON.parse(cleaned);
  } catch (parseErr) {
    console.warn('[Gemini] First parse failed, retrying with simplified prompt…');
  }

  // Second attempt with simplified prompt
  const simplePrompt = `
Return ONLY a JSON object (no markdown, no code fences) analyzing these competitor ads for the ${brand} wellness brand category.
Include: topInsights (array of {insight, priority, brand}), weeklyBrief (string), creativeTrends (array of {trend, count, percentage, brand, direction}), opportunityGaps (array of strings), provenPerformers (array of {adId, competitor, daysRunning, why}), messagingShifts (array), threatLevel (string), threatReason (string).
For each creativeTrend, direction must be exactly "rising", "stable", or "declining".
Ad count: ${ads.length}. Top competitor: ${ads[0]?.companyName || 'unknown'}.
Ads: ${JSON.stringify(ads.slice(0, 10))}
`;

  result = await model.generateContent(simplePrompt);
  text = result.response.text();
  const cleaned = stripMarkdownFences(text);
  return JSON.parse(cleaned);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/competitors
app.get('/api/competitors', (req, res) => {
  res.json(COMPETITORS);
});

// GET /api/ads/all — legacy; uses fetchCompanyAds for dedup + cache-first
app.get('/api/ads/all', async (req, res) => {
  try {
    const companies = ALL_COMPETITORS.map((c) => c.companyName);
    const results = {};
    const BATCH_SIZE = 3;

    for (let i = 0; i < companies.length; i += BATCH_SIZE) {
      const batch = companies.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (company) => {
          let ads = await fetchCompanyAds(company); // cache-first + dedup
          if (!ads || ads.length === 0) {
            ads = getCachedAdsAny(company);         // stale fallback
          }
          if (!ads || ads.length === 0) {
            ads = SAMPLE_ADS.filter((a) => a.companyName === company);
          }
          results[company] = ads || [];
        })
      );
    }

    const allAds = Object.values(results).flat();
    res.json({ ads: allAds, total: allAds.length, usingMockData: !SCRAPE_API_KEY });
  } catch (err) {
    console.error('[/api/ads/all]', err.message);
    res.json({ ads: SAMPLE_ADS, total: SAMPLE_ADS.length, usingMockData: true });
  }
});

// ─── Helper: build cache-status map for all competitors ──────────────────────
async function buildCacheStatusMap() {
  const now = Math.floor(Date.now() / 1000);
  const CACHE_HOURS = 24;
  const statuses = {};
  for (const c of ALL_COMPETITORS) {
    const s = await getCacheStatus(c.companyName);
    statuses[c.companyName] = {
      ...s,
      age_hours: s.fetched_at ? (now - s.fetched_at) / 3600 : null,
      is_fresh: s.fetched_at ? (now - s.fetched_at) < CACHE_HOURS * 3600 : false,
    };
  }
  return statuses;
}

// GET /api/cache-status — returns cache metadata for all 27 competitors (no API calls)
app.get('/api/cache-status', async (req, res) => {
  res.json({ statuses: await buildCacheStatusMap() });
});

// GET /api/ads/cached — returns only SQLite-cached ad data, never calls ScrapeCreators
app.get('/api/ads/cached', async (req, res) => {
  const allAds = [];
  for (const c of ALL_COMPETITORS) {
    let ads = await getCachedAdsAny(c.companyName);
    if (!ads || ads.length === 0) {
      if (ads) allAds.push(); // empty array — company has cache entry, just no ads
      continue;
    }
    // Re-translate any non-English ads that weren't successfully translated before
    const needsTranslation = genAI && ads.some(
      (ad) => !ad.translated && !isEnglishText(ad.body || '')
    );
    if (needsTranslation) {
      ads = await translateAdsToEnglish(ads, c.companyName);
      await saveAds(c.companyName, ads); // persist translations back to cache
    }
    allAds.push(...ads);
  }
  res.json({
    ads: allAds,
    total: allAds.length,
    cacheStatuses: await buildCacheStatusMap(),
    usingMockData: false,
  });
});

// POST /api/ads/fetch — selective fetch: only re-fetches expired/missing competitors
// Body: { brand?: string }  — omit or use 'All' to fetch all 27
app.post('/api/ads/fetch', async (req, res) => {
  const { brand } = req.body || {};
  const companiesScope = (brand && brand !== 'All')
    ? (COMPETITORS[brand] || []).map((c) => c.companyName)
    : ALL_COMPETITORS.map((c) => c.companyName);

  const CACHE_HOURS = 24;
  const toFetch = [];
  const skipped = [];
  for (const company of companiesScope) {
    if (await getCachedAds(company, CACHE_HOURS)) {
      skipped.push(company);
    } else {
      toFetch.push(company);
    }
  }

  const fetched = [];
  const errors = [];
  const BATCH_SIZE = 3;

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (company) => {
        const ads = await fetchCompanyAds(company); // cache-first + dedup + auto-save
        if (ads !== null) {
          // null = true API error; [] = no active ads (still counts as fetched)
          fetched.push({ company, count: ads.length });
        } else {
          errors.push(company);
        }
      })
    );
  }

  // Return all cached ads (full set — not just the scope)
  const allAds = [];
  for (const c of ALL_COMPETITORS) {
    const ads = await getCachedAdsAny(c.companyName);
    if (ads) allAds.push(...ads);
  }

  res.json({
    ads: allAds,
    total: allAds.length,
    fetched,
    skipped,
    errors,
    cacheStatuses: await buildCacheStatusMap(),
    usingMockData: false,
  });
});

// POST /api/ads/batch — explicit company list, cache-first, deduped
// Body: { companies: string[] }
// Returns ALL cached ads + freshly fetched, never calls API for cached companies.
app.post('/api/ads/batch', async (req, res) => {
  const { companies } = req.body || {};
  if (!Array.isArray(companies) || companies.length === 0) {
    return res.json({ ads: [], total: 0, cachedCount: 0, fetchedCount: 0, errors: [], cacheStatuses: await buildCacheStatusMap() });
  }

  const skipped = [];   // already fresh in cache
  const toFetch = [];   // need API call

  for (const company of companies) {
    if (await getCachedAds(company, 24)) {
      skipped.push(company);
    } else {
      toFetch.push(company);
    }
  }

  const fetched = [];
  const errors  = [];
  const BATCH_SIZE = 3;

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (company) => {
        const ads = await fetchCompanyAds(company); // cache-first + dedup inside
        if (ads !== null) {
          // null = true API error; [] = no active ads (still counts as fetched)
          fetched.push({ company, count: ads.length });
        } else {
          errors.push(company);
        }
      })
    );
  }

  // Respond with all currently-cached ads across all competitors
  const allAds = [];
  for (const c of ALL_COMPETITORS) {
    const ads = await getCachedAdsAny(c.companyName);
    if (ads) allAds.push(...ads);
  }

  res.json({
    ads: allAds,
    total: allAds.length,
    cachedCount: skipped.length,
    fetchedCount: fetched.length,
    fetched,
    skipped,
    errors,
    cacheStatuses: await buildCacheStatusMap(),
    usingMockData: false,
  });
});

// GET /api/ads/:companyName — cache-first via fetchCompanyAds (dedup included)
app.get('/api/ads/:companyName', async (req, res) => {
  const { companyName } = req.params;
  const ads = await fetchCompanyAds(companyName); // handles cache + dedup
  if (ads && ads.length > 0) {
    return res.json({ ads, usingMockData: false });
  }
  // Stale fallback
  const stale = await getCachedAdsAny(companyName);
  if (stale && stale.length > 0) {
    return res.json({ ads: stale, usingMockData: false });
  }
  // Last resort: SAMPLE_ADS
  const fallback = SAMPLE_ADS.filter((a) => a.companyName === companyName);
  res.json({ ads: fallback.length ? fallback : SAMPLE_ADS.slice(0, 3), usingMockData: true });
});

// POST /api/analyze
// Body: { brand?: string, ads?: Array, isSelectionBased?: boolean }
app.post('/api/analyze', async (req, res) => {
  const brand = req.body?.brand || 'All';
  const incomingAds = req.body?.ads;
  const isSelectionBased = req.body?.isSelectionBased === true && Array.isArray(incomingAds) && incomingAds.length > 0;

  try {
    // Only check cache when not analysing a custom selection
    if (!isSelectionBased) {
      const existing = await getBriefByBrand(brand, 1);
      if (existing) {
        return res.json({
          brief: existing.brief,
          cached: true,
          created_at: existing.created_at,
          ad_count: existing.ad_count,
          brands_covered: existing.brands_covered,
        });
      }
    }

    let adsToAnalyze;
    if (isSelectionBased) {
      adsToAnalyze = incomingAds;
    } else {
      // Determine which companies belong to this brand
      const brandCompanies = brand === 'All'
        ? ALL_COMPETITORS.map((c) => c.companyName)
        : (COMPETITORS[brand] || []).map((c) => c.companyName);

      // Gather ads for those companies (from cache or SAMPLE_ADS)
      adsToAnalyze = [];
      for (const company of brandCompanies) {
        const cached = await getCachedAds(company, 24);
        if (cached) adsToAnalyze = adsToAnalyze.concat(cached);
      }
      if (adsToAnalyze.length === 0) {
        adsToAnalyze = brand === 'All'
          ? SAMPLE_ADS
          : SAMPLE_ADS.filter((a) => a.brandLabel === brand);
        if (adsToAnalyze.length === 0) adsToAnalyze = SAMPLE_ADS;
      }
    }

    const brief = await runGeminiAnalysis(adsToAnalyze, brand);

    // Save — use different cache key for selections so they don't overwrite brand cache
    const cacheKey = isSelectionBased ? `selection:${brand}` : brand;
    await saveAiBrief(brief, adsToAnalyze.length, cacheKey);

    res.json({
      brief,
      cached: false,
      created_at: Math.floor(Date.now() / 1000),
      ad_count: adsToAnalyze.length,
      brands_covered: cacheKey,
      sampled: adsToAnalyze.length > 50,
    });
  } catch (err) {
    console.error('[/api/analyze]', err.message);
    // Return a basic fallback brief so the UI doesn't break
    const fallbackBrief = {
      topInsights: [
        { insight: 'Video ads dominate competitor spend across all categories', priority: 'high', brand: 'All' },
        { insight: 'Long-form benefit-driven copy (60-90 days running) outperforms short punchy copy', priority: 'high', brand: 'Man Matters' },
        { insight: 'Subscription CTAs convert better than one-time purchase CTAs in wellness', priority: 'medium', brand: 'Bebodywise' },
        { insight: 'Ingredient-led messaging (Redensyl, Biotin, Ayurvedic) builds trust faster', priority: 'medium', brand: 'All' },
        { insight: 'Baby/kids segment shows lowest competitive ad density — opportunity for Little Joys', priority: 'high', brand: 'Little Joys' },
      ],
      weeklyBrief: 'Competitor activity remains strong across all three verticals. Man Matters competitors are heavily investing in video creative with ingredient-led hooks. Bebodywise space is heating up with period care brands running long-duration subscription-focused campaigns. Little Joys faces moderate competition but the category is less saturated than personal care for adults.',
      messagingShifts: [
        { competitor: 'Beardo', oldMessage: 'Style & grooming aesthetics', newMessage: 'Clinical efficacy + ingredient science', signal: 'Multiple new video ads with before/after results' },
      ],
      creativeTrends: [
        { trend: 'Video testimonials', count: 6, percentage: 60, brand: 'All', direction: 'rising' },
        { trend: 'Carousel product showcase', count: 3, percentage: 30, brand: 'Man Matters', direction: 'stable' },
        { trend: 'Single image offer', count: 1, percentage: 10, brand: 'Bebodywise', direction: 'declining' },
      ],
      opportunityGaps: [
        'Competitors are NOT creating content around men\'s mental wellness and grooming confidence — Man Matters can own this positioning',
        'Competitors are NOT running educational content about ingredient science for women\'s hygiene — Bebodywise opportunity',
        'Competitors are NOT targeting fathers in baby care ads — Little Joys can pioneer dad-targeted creatives',
      ],
      provenPerformers: SAMPLE_ADS.filter((a) => a.daysRunning >= 60).map((a) => ({
        adId: a.id,
        competitor: a.companyName,
        daysRunning: a.daysRunning,
        why: 'Strong benefit-led headline with clear CTA and social proof',
      })),
      threatLevel: 'medium',
      threatReason: 'Established competitors maintain consistent ad spend; new entrants are emerging in the Bebodywise space',
    };
    res.json({
      brief: fallbackBrief,
      cached: false,
      created_at: Math.floor(Date.now() / 1000),
      ad_count: SAMPLE_ADS.length,
      brands_covered: brand,
      error: 'Gemini unavailable — showing cached intelligence',
    });
  }
});

// GET /api/brief
app.get('/api/brief', async (req, res) => {
  const existing = await getLatestBrief();
  const SEVEN_DAYS = 7 * 24 * 3600;
  const ONE_HOUR = 3600;

  // Return cached brief if <7 days old
  if (existing) {
    const age = Date.now() / 1000 - existing.created_at;
    if (age < SEVEN_DAYS) {
      return res.json({
        brief: existing.brief,
        cached: true,
        created_at: existing.created_at,
        ad_count: existing.ad_count,
        brands_covered: existing.brands_covered,
        stale: age > ONE_HOUR,
      });
    }
  }

  // Trigger fresh analysis
  try {
    let allAds = [];
    for (const company of ALL_COMPETITORS.map((c) => c.companyName)) {
      const cached = await getCachedAds(company, 24);
      if (cached) allAds = allAds.concat(cached);
    }
    if (allAds.length === 0) allAds = SAMPLE_ADS;

    const brief = await runGeminiAnalysis(allAds);
    const brandsCovered = [...new Set(allAds.map((a) => a.brandLabel).filter(Boolean))].join(', ');
    await saveAiBrief(brief, allAds.length, brandsCovered);

    res.json({
      brief,
      cached: false,
      created_at: Math.floor(Date.now() / 1000),
      ad_count: allAds.length,
      brands_covered: brandsCovered,
    });
  } catch (err) {
    if (existing) {
      return res.json({
        brief: existing.brief,
        cached: true,
        created_at: existing.created_at,
        ad_count: existing.ad_count,
        brands_covered: existing.brands_covered,
        stale: true,
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/refresh
app.post('/api/refresh', async (req, res) => {
  const { company } = req.body;
  if (company) {
    await clearAdsCache(company);
    res.json({ success: true, message: `Cache cleared for ${company}` });
  } else {
    await clearAdsCache('*');
    res.json({ success: true, message: 'All cache cleared' });
  }
});

// ─── Mock Reddit Fallback Data ────────────────────────────────────────────────

const MOCK_REDDIT_DATA = {
  'Man Matters': {
    fallback: true,
    complaints: [
      {
        title: 'Hair loss products not showing results after 3 months',
        detail: 'Users report spending ₹3000+ on hair loss solutions with minimal visible results, questioning if the ingredient concentrations are effective.',
        frequency: 'high',
        subreddit: 'r/IndianSkincareAddicts',
      },
      {
        title: 'Subscription box value declining over time',
        detail: 'Long-time subscribers note that product quality and quantity have decreased while prices have risen — feeling undervalued.',
        frequency: 'medium',
        subreddit: 'r/india',
      },
      {
        title: 'No genuine before/after evidence for beard growth claims',
        detail: 'Scepticism around beard growth oils — users want clinical evidence not just influencer testimonials.',
        frequency: 'medium',
        subreddit: 'r/IndiaSpeaks',
      },
    ],
    gapOpportunities: [
      {
        title: 'Clinically-backed transparent dosage claims',
        unmetNeed: 'Men want to see exact ingredient concentrations and clinical trial data, not vague "scientifically formulated" claims.',
        suggestedAngle: 'Lead with exact Redensyl/Minoxidil % and link to study — "X% concentration, Y% users saw regrowth in 90 days"',
        urgency: 'high',
      },
      {
        title: 'Mental wellness + grooming confidence angle',
        unmetNeed: 'No brand connects grooming to mental health and self-confidence in Indian male context.',
        suggestedAngle: 'Campaign: "Look good, feel ready" — grooming as a confidence ritual, not vanity',
        urgency: 'high',
      },
      {
        title: 'Honest subscription pause/cancel UX',
        unmetNeed: 'Users dread lock-in. A brand that makes pausing easy would earn huge trust.',
        suggestedAngle: 'Ad highlight: "Pause anytime, no questions" — feature the easy cancel as a selling point',
        urgency: 'medium',
      },
    ],
    trendingTopics: [
      { topic: 'DHT blocker ingredients', direction: 'rising' },
      { topic: 'Minoxidil side effects', direction: 'rising' },
      { topic: 'Beard growth oils review', direction: 'stable' },
      { topic: 'Men skincare routine India', direction: 'rising' },
      { topic: 'Hair transplant vs products', direction: 'stable' },
    ],
    sentimentSummary: 'Indian men are increasingly seeking evidence-based grooming solutions but feel misled by exaggerated claims. There is strong demand for transparent ingredient information and honest efficacy timelines. Subscription fatigue is real — brands that offer flexibility will earn loyalty.',
    subredditSources: ['r/IndianSkincareAddicts', 'r/india', 'r/IndiaSpeaks'],
  },
  'Bebodywise': {
    fallback: true,
    complaints: [
      {
        title: 'Period care products too expensive for regular use',
        detail: 'Women want sustainable/eco options but find them prohibitively priced vs traditional products — no middle-ground option.',
        frequency: 'high',
        subreddit: 'r/TwoXIndia',
      },
      {
        title: 'Intimate hygiene marketing is too clinical and clinical-looking',
        detail: 'Ads feel sterile and medical rather than empowering — women want brands that normalize these conversations warmly.',
        frequency: 'medium',
        subreddit: 'r/india',
      },
      {
        title: 'Lack of options for PCOS-specific skincare and wellness',
        detail: 'Women with PCOS report no brand addresses their specific hormonal skincare needs holistically.',
        frequency: 'high',
        subreddit: 'r/PCOS_India',
      },
    ],
    gapOpportunities: [
      {
        title: 'PCOS-specific wellness bundle',
        unmetNeed: 'Women with PCOS manage multiple concerns (acne, hair loss, weight) but no brand offers a holistic PCOS care line.',
        suggestedAngle: 'Position Bebodywise as "the brand that actually gets PCOS" — bundle + education content',
        urgency: 'high',
      },
      {
        title: 'Warmly normalise intimate hygiene conversations',
        unmetNeed: 'Intimate care ads are clinical and embarrassing. Women want the topic treated like any wellness category.',
        suggestedAngle: 'Campaign: normalize with humour and warmth — "We talk about what everyone thinks about"',
        urgency: 'high',
      },
      {
        title: 'Affordable eco period care entry product',
        unmetNeed: 'Eco options exist but the price gap from traditional products is too large for mass adoption.',
        suggestedAngle: 'Launch a starter kit at an accessible price — reduce the eco trial barrier',
        urgency: 'medium',
      },
    ],
    trendingTopics: [
      { topic: 'PCOS skincare routine', direction: 'rising' },
      { topic: 'Menstrual cup vs period panties', direction: 'rising' },
      { topic: 'Intimate hygiene myths', direction: 'stable' },
      { topic: "Women's hormone health India", direction: 'rising' },
      { topic: 'Clean beauty India', direction: 'stable' },
    ],
    sentimentSummary: 'Indian women are actively seeking holistic women\'s wellness solutions but feel underserved by brands that treat these as niche or embarrassing topics. PCOS awareness is surging and no brand has claimed this space authentically. Eco-consciousness is growing but price remains a barrier.',
    subredditSources: ['r/TwoXIndia', 'r/india', 'r/PCOS_India'],
  },
  'Little Joys': {
    fallback: true,
    complaints: [
      {
        title: 'Too many "natural/organic" claims with no certification proof',
        detail: 'Parents are sceptical of natural claims after multiple brands were found to contain harmful ingredients — demanding third-party certification.',
        frequency: 'high',
        subreddit: 'r/IndianParenting',
      },
      {
        title: 'Baby products priced as luxury items',
        detail: 'Parents note baby care has become premium-priced with questionable differentiation — feeling exploited.',
        frequency: 'high',
        subreddit: 'r/india',
      },
      {
        title: 'Fathers completely invisible in baby care marketing',
        detail: 'Dads who are active caregivers feel no brand acknowledges them — all baby care ads target mothers exclusively.',
        frequency: 'medium',
        subreddit: 'r/IndianParenting',
      },
    ],
    gapOpportunities: [
      {
        title: 'Dad-first baby care campaign',
        unmetNeed: 'Modern Indian fathers are active caregivers but feel excluded from all baby care marketing.',
        suggestedAngle: 'Campaign: "Dads do it too" — show fathers in caregiving roles using Little Joys products',
        urgency: 'high',
      },
      {
        title: 'Third-party certification transparency',
        unmetNeed: 'Parents want visible, verifiable proof that products are safe — not just claims on packaging.',
        suggestedAngle: 'Lead creative with certification logos and a scannable QR to the actual lab report',
        urgency: 'high',
      },
      {
        title: 'Developmental milestone product bundling',
        unmetNeed: 'Parents don\'t know which products are right for which developmental stage — overwhelmed by choice.',
        suggestedAngle: 'Age-stage kits: "0-3 months starter", "6-12 months explorer" — reduce decision fatigue',
        urgency: 'medium',
      },
    ],
    trendingTopics: [
      { topic: 'Toxin-free baby products India', direction: 'rising' },
      { topic: 'Cloth diaper vs disposable', direction: 'stable' },
      { topic: 'Baby food introduction schedule', direction: 'rising' },
      { topic: 'New parent fatigue', direction: 'rising' },
      { topic: 'Certified organic baby care', direction: 'rising' },
    ],
    sentimentSummary: 'Indian parents are more informed and sceptical than ever, demanding transparency in ingredients and certifications. The father caregiver segment is completely underserved by existing marketing. Price sensitivity is real but parents will pay a premium if safety and transparency are clearly demonstrated.',
    subredditSources: ['r/IndianParenting', 'r/india', 'r/NewParents'],
  },
};

// ─── Reddit Sources ───────────────────────────────────────────────────────────

const REDDIT_SOURCES = {
  'Man Matters': [
    'https://www.reddit.com/r/IndianHairLossRecovery/new.json?limit=30',
    'https://www.reddit.com/r/malegrooming/new.json?limit=30',
    'https://www.reddit.com/r/Hairloss/search.json?q=india&limit=20&sort=new',
    'https://www.reddit.com/r/IndianSkincareAddicts/search.json?q=men+skincare&limit=20',
    'https://www.reddit.com/r/Testosterone/new.json?limit=20',
  ],
  'Bebodywise': [
    'https://www.reddit.com/r/IndianSkincareAddicts/new.json?limit=30',
    'https://www.reddit.com/r/SkincareAddiction/search.json?q=india&limit=20&sort=new',
    'https://www.reddit.com/r/AsianBeauty/search.json?q=india&limit=20',
    'https://www.reddit.com/r/PCOS/new.json?limit=20',
    'https://www.reddit.com/r/TwoXIndia/new.json?limit=20',
  ],
  'Little Joys': [
    'https://www.reddit.com/r/IndianParenting/new.json?limit=30',
    'https://www.reddit.com/r/Parenting/search.json?q=india+kids+supplements&limit=20',
    'https://www.reddit.com/r/beyondthebump/search.json?q=india&limit=20',
    'https://www.reddit.com/r/Mommit/new.json?limit=20',
    'https://www.reddit.com/r/NewParents/new.json?limit=20',
  ],
};

const RELEVANCE_KEYWORDS = {
  'Man Matters':  ['hair', 'beard', 'skin', 'grooming', 'men', 'male', 'wellness', 'supplement', 'protein', 'testosterone', 'balding', 'minoxidil'],
  'Bebodywise':   ['skin', 'skincare', 'serum', 'moisturizer', 'acne', 'glow', 'women', 'pcos', 'period', 'hormones', 'hair loss', 'niacinamide'],
  'Little Joys':  ['baby', 'kids', 'child', 'toddler', 'nutrition', 'supplement', 'immunity', 'growth', 'feeding', 'parenting', 'infant'],
};

// ─── New Endpoints ────────────────────────────────────────────────────────────

// GET /api/competitor-profile/:companyName
app.get('/api/competitor-profile/:companyName', async (req, res) => {
  const { companyName } = req.params;
  try {
    const cached = await getCompetitorProfile(companyName, 24);
    if (cached) return res.json({ summary: cached.summary, cached: true });

    let ads = await getCachedAds(companyName, 24) || await getCachedAdsAny(companyName) || SAMPLE_ADS.filter((a) => a.companyName === companyName);
    if (!ads || ads.length === 0) return res.json({ summary: 'No ad data available yet.', cached: false });
    if (!genAI) return res.json({ summary: 'Analysis pending...', cached: false });

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const adsSample = ads.slice(0, 10)
      .map((a) => `Title: ${a.title || ''}\nBody: ${a.body || ''}\nCTA: ${a.callToAction || ''}`)
      .join('\n---\n');
    const prompt = `In exactly one sentence, summarize the core messaging style and tone of ${companyName}'s ads. Be specific. Mention actual themes. Return ONLY the sentence.\n\nAds:\n${adsSample}`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text().trim();
    await saveCompetitorProfile(companyName, summary);
    return res.json({ summary, cached: false });
  } catch (err) {
    console.error(`[/api/competitor-profile/${companyName}]`, err.message);
    return res.json({ summary: 'Analysis pending...', cached: false });
  }
});

// POST /api/score-ads
app.post('/api/score-ads', async (req, res) => {
  const { ads } = req.body;
  if (!ads || !Array.isArray(ads) || ads.length === 0) {
    return res.status(400).json({ error: 'ads array required' });
  }

  const cacheKey = [...ads].map((a) => a.id).sort().join(',');
  const bypassCache = req.body?.regenerate === true;

  try {
    // Check cache (1hr TTL) unless regenerate is requested
    if (!bypassCache) {
      const cached = await getAdScores(cacheKey, 1);
      if (cached) {
        return res.json({ ...cached, cached: true });
      }
    }

    if (!genAI) {
      throw new Error('GEMINI_API_KEY not set');
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const adsJson = JSON.stringify(ads.slice(0, 20).map((a) => ({
      id: a.id,
      companyName: a.companyName,
      brandLabel: a.brandLabel,
      title: a.title,
      body: a.body,
      mediaType: a.mediaType,
      callToAction: a.callToAction,
      daysRunning: a.daysRunning,
    })), null, 2);

    const scoringPrompt = `You are a performance creative analyst scoring competitor ads for Mosaic Wellness (brands: Man Matters, Bebodywise, Little Joys).

Score each ad on these 5 dimensions (0-10 each):
- hookStrength: How compelling is the opening line? Does it stop the scroll?
- ctaClarity: How clear, specific, and action-oriented is the call-to-action?
- emotionalAppeal: Does it create desire, urgency, or emotional connection?
- formatFit: Is the ad format (video/image/carousel) optimal for the message?
- messageClarity: Is the core benefit communicated clearly within 3 seconds?

Return ONLY a JSON object (no markdown, no code fences) with this exact structure:
{
  "scoredAds": [
    {
      "id": "string",
      "hookStrength": number,
      "ctaClarity": number,
      "emotionalAppeal": number,
      "formatFit": number,
      "messageClarity": number,
      "total": number,
      "standoutElement": "one sentence on what makes this ad effective",
      "weakness": "one sentence on the biggest improvement opportunity"
    }
  ],
  "topPatterns": [
    "string describing a pattern seen across the highest-scoring ads"
  ]
}

Rules:
- Score every ad provided, one entry per ad in scoredAds array
- topPatterns: exactly 3 patterns extracted from the highest-scoring ads
- Return ONLY the JSON object, no preamble, no markdown fences

Ads to score:
${adsJson}`;

    let parsed;
    try {
      const result = await model.generateContent(scoringPrompt);
      const text = result.response.text();
      parsed = JSON.parse(stripMarkdownFences(text));
    } catch (parseErr) {
      console.warn('[/api/score-ads] First parse failed, retrying…');
      const simplePrompt = `Score these ${ads.length} ads. Return ONLY JSON with scoredAds array (each: id, hookStrength, ctaClarity, emotionalAppeal, formatFit, messageClarity, total, standoutElement, weakness) and topPatterns array (3 strings). Ads: ${JSON.stringify(ads.slice(0, 5).map(a => ({ id: a.id, title: a.title, body: a.body?.slice(0, 100), callToAction: a.callToAction })))}`;
      const result2 = await model.generateContent(simplePrompt);
      parsed = JSON.parse(stripMarkdownFences(result2.response.text()));
    }

    await saveAdScores(cacheKey, parsed);
    return res.json({ ...parsed, cached: false });
  } catch (err) {
    console.error('[/api/score-ads]', err.message);
    // Return a fallback so UI doesn't break
    const fallback = {
      scoredAds: ads.map((a) => ({
        id: a.id,
        hookStrength: 7,
        ctaClarity: 6,
        emotionalAppeal: 6,
        formatFit: 7,
        messageClarity: 7,
        total: 33,
        standoutElement: 'Clear benefit-led messaging with direct call to action.',
        weakness: 'Could benefit from stronger emotional hook in opening line.',
      })),
      topPatterns: [
        'Direct benefit statements in the first 5 words',
        'Social proof combined with ingredient science',
        'Urgency-driven CTAs with specific offers',
      ],
      cached: false,
    };
    return res.json(fallback);
  }
});

// POST /api/generate-script — generates videoScriptBrief only (independent of scoring)
// Body: { ads: Array, regenerate?: boolean }
app.post('/api/generate-script', async (req, res) => {
  const { ads, regenerate } = req.body;
  if (!ads || !Array.isArray(ads) || ads.length === 0) {
    return res.status(400).json({ error: 'ads array required' });
  }

  const cacheKey = 'script:' + [...ads].map((a) => a.id).sort().join(',');
  const bypassCache = regenerate === true;

  try {
    if (!bypassCache) {
      const cached = await getAdScores(cacheKey, 1);
      if (cached) return res.json({ ...cached, cached: true });
    }

    if (!genAI) {
      throw new Error('GEMINI_API_KEY not set');
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const adsJson = JSON.stringify(ads.slice(0, 20).map((a) => ({
      id: a.id,
      companyName: a.companyName,
      brandLabel: a.brandLabel,
      title: a.title,
      body: a.body,
      mediaType: a.mediaType,
      callToAction: a.callToAction,
      daysRunning: a.daysRunning,
    })), null, 2);

    const scriptPrompt = `You are a performance creative director for Mosaic Wellness (brands: Man Matters, Bebodywise, Little Joys) in the Indian wellness market.

Analyse these competitor ads and generate ONE video script brief that would outperform them.

Return ONLY a JSON object (no markdown, no code fences) with this exact structure:
{
  "videoScriptBrief": {
    "format": "e.g. 30-second UGC testimonial video",
    "tone": "e.g. Conversational, empathetic, science-backed",
    "hook": "Opening line/scene that stops the scroll",
    "body": "Core message and product benefit (2-3 sentences)",
    "cta": "Specific call-to-action",
    "visualDirection": "Visual style, talent, setting guidance",
    "whyItWorks": "Why this brief will outperform the competition"
  }
}

Rules:
- Synthesize the strongest patterns from the highest-performing competitor ads
- The brief must be actionable for a creative team to execute today
- Return ONLY the JSON object, no preamble, no markdown fences

Competitor ads:
${adsJson}`;

    let parsed;
    try {
      const result = await model.generateContent(scriptPrompt);
      parsed = JSON.parse(stripMarkdownFences(result.response.text()));
    } catch (parseErr) {
      console.warn('[/api/generate-script] Parse failed, using fallback');
      parsed = {
        videoScriptBrief: {
          format: '30-second UGC-style testimonial video',
          tone: 'Conversational, science-backed, empathetic',
          hook: 'Open with a relatable pain point your audience experiences daily',
          body: 'Present the ingredient/solution with social proof. Show transformation in 3-4 seconds. Address the #1 objection.',
          cta: 'Shop now — first order X% off (limited time)',
          visualDirection: 'Real person in natural setting, close-up product shots, on-screen text for key claims',
          whyItWorks: 'Combines authenticity of UGC with credibility of science-backed claims — the format competitors are not using together.',
        },
      };
    }

    await saveAdScores(cacheKey, parsed);
    return res.json({ ...parsed, cached: false });
  } catch (err) {
    console.error('[/api/generate-script]', err.message);
    return res.json({
      videoScriptBrief: {
        format: '30-second UGC-style testimonial video',
        tone: 'Conversational, science-backed, empathetic',
        hook: 'Open with a relatable pain point your audience experiences daily',
        body: 'Present the ingredient/solution with social proof. Show transformation in 3-4 seconds. Address the #1 objection.',
        cta: 'Shop now — first order X% off (limited time)',
        visualDirection: 'Real person in natural setting, close-up product shots, on-screen text for key claims',
        whyItWorks: 'Combines authenticity of UGC with credibility of science-backed claims — the format competitors are not using together.',
      },
      cached: false,
    });
  }
});

// GET /api/reddit/:brand
app.get('/api/reddit/:brand', async (req, res) => {
  const decodedBrand = decodeURIComponent(req.params.brand);

  try {
    // 1. Fresh 2hr cache → return instantly
    const cached = await getRedditData(decodedBrand, 2);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    const sources = REDDIT_SOURCES[decodedBrand];
    if (!sources) {
      const stale = await getRedditDataAny(decodedBrand);
      if (stale) return res.json({ ...stale, cached: true });
      return res.json({ ...(MOCK_REDDIT_DATA[decodedBrand] || MOCK_REDDIT_DATA['Man Matters']), cached: false });
    }

    // 2. Attempt Reddit post fetch
    const allPosts = [];
    for (const url of sources) {
      try {
        const response = await axios.get(url, {
          headers: { 'User-Agent': 'AdWarRoom/1.0 (Mosaic Fellowship Project - contact: fellowship@mosaicwellness.in)' },
          timeout: 8000,
        });
        const posts = (response.data?.data?.children || []).map((child) => ({
          title: child.data?.title || '',
          subreddit: child.data?.subreddit_name_prefixed || '',
          ups: child.data?.ups || 0,
        }));
        allPosts.push(...posts);
      } catch (fetchErr) {
        console.warn(`[Reddit] Failed to fetch ${url}:`, fetchErr.message);
      }
    }

    // Relevance filtering — keep posts with matching keywords, fall back if too few
    let filteredPosts = allPosts.filter(post =>
      (RELEVANCE_KEYWORDS[decodedBrand] || []).some(kw =>
        post.title.toLowerCase().includes(kw)
      )
    );
    if (filteredPosts.length < 5) filteredPosts = allPosts;
    filteredPosts = filteredPosts.filter(p => (p.ups || 0) >= 2);

    // 3. Reddit blocked / empty → try stale cache first (real data, no banner)
    if (filteredPosts.length === 0) {
      const stale = await getRedditDataAny(decodedBrand);
      if (stale) {
        console.log(`[Reddit] Serving stale cache for ${decodedBrand} (Reddit returned no posts)`);
        return res.json({ ...stale, cached: true });
      }
    }

    // 4. No posts + no cache → generate insights from competitor ads via Gemini
    if (filteredPosts.length === 0 || !genAI) {
      if (!genAI) {
        const stale = await getRedditDataAny(decodedBrand);
        if (stale) return res.json({ ...stale, cached: true });
        return res.json({ ...MOCK_REDDIT_DATA[decodedBrand], cached: false, postCount: 0 });
      }
      // Generate AI insights from competitor ads only (no Reddit data)
      console.log(`[Reddit] No posts available for ${decodedBrand} — generating from ads only`);
      const brandCompanies = (COMPETITORS[decodedBrand] || []).map((c) => c.companyName);
      let competitorAds = [];
      for (const company of brandCompanies) {
        const ads = await getCachedAds(company, 24) || SAMPLE_ADS.filter((a) => a.companyName === company);
        competitorAds.push(...ads.slice(0, 5));
      }
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const adsOnlyPrompt = `You are a consumer insights analyst for ${decodedBrand} in the Indian wellness market.
Based ONLY on your knowledge of Indian consumer behaviour and these competitor ads, generate realistic consumer complaints and content gap opportunities.

Competitor ads:
${JSON.stringify(competitorAds.slice(0, 15).map((a) => ({ title: a.title, body: a.body?.slice(0, 150), cta: a.callToAction })), null, 2)}

Return ONLY valid JSON (no markdown) with this exact structure:
{
  "complaints": [{ "title": "string", "detail": "string", "frequency": "high|medium|low", "subreddit": "r/inferred" }],
  "gapOpportunities": [{ "title": "string", "unmetNeed": "string", "urgency": "high|medium|low", "suggestedAngle": "string" }],
  "trendingTopics": [{ "topic": "string", "direction": "rising|stable" }],
  "sentimentSummary": "string",
  "subredditSources": ["r/IndianSkincareAddicts"],
  "postCount": 0
}
Provide exactly 5 complaints, 4 gap opportunities, 4 trending topics.`;
      try {
        const result = await model.generateContent(adsOnlyPrompt);
        const insights = JSON.parse(stripMarkdownFences(result.response.text()));
        await saveRedditData(decodedBrand, insights);
        return res.json({ ...insights, cached: false });
      } catch (aiErr) {
        console.error(`[Reddit] Gemini-only generation failed for ${decodedBrand}:`, aiErr.message);
        return res.json({ ...MOCK_REDDIT_DATA[decodedBrand], cached: false, postCount: 0 });
      }
    }

    // Get competitor ads (up to 5 per company)
    const brandCompanies = (COMPETITORS[decodedBrand] || []).map((c) => c.companyName);
    let competitorAds = [];
    for (const company of brandCompanies) {
      const ads = await getCachedAds(company, 24) || SAMPLE_ADS.filter((a) => a.companyName === company);
      competitorAds.push(...ads.slice(0, 5));
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const redditPrompt = `You are a consumer insights analyst studying Reddit conversations about ${decodedBrand} competitors in the Indian wellness market.

Focus ONLY on insights relevant to ${decodedBrand}'s product categories.
Ignore posts about relationships, politics, entertainment, or anything unrelated to wellness, health, grooming, skincare, or parenting products.
If a post is not relevant to ${decodedBrand}'s market, exclude it from your analysis.

Based on these Reddit posts:
${JSON.stringify(filteredPosts.slice(0, 30), null, 2)}

And these competitor ads running right now:
${JSON.stringify(competitorAds.slice(0, 20).map((a) => ({ title: a.title, body: a.body?.slice(0, 150), cta: a.callToAction })), null, 2)}

Identify genuine consumer pain points, complaints, and unmet needs that competitors are NOT addressing in their ads.

Return ONLY a JSON object (no markdown, no code fences) with this exact structure:
{
  "complaints": [
    {
      "title": "string",
      "detail": "string",
      "frequency": "high|medium|low",
      "subreddit": "string"
    }
  ],
  "gapOpportunities": [
    {
      "title": "string",
      "unmetNeed": "string",
      "suggestedAngle": "string",
      "urgency": "high|medium|low"
    }
  ],
  "trendingTopics": [
    { "topic": "string", "direction": "rising|stable" }
  ],
  "sentimentSummary": "string",
  "subredditSources": ["string"]
}

Rules:
- complaints: 3-5 specific consumer pain points
- gapOpportunities: 3-4 actionable gaps ${decodedBrand} could address
- trendingTopics: 4-6 topics consumers are actively discussing
- Return ONLY the JSON object, no markdown fences`;

    try {
      const result = await model.generateContent(redditPrompt);
      const parsed = JSON.parse(stripMarkdownFences(result.response.text()));
      await saveRedditData(decodedBrand, parsed);
      return res.json({ ...parsed, cached: false, postCount: filteredPosts.length });
    } catch (parseErr) {
      console.warn('[Reddit] Parse failed, returning mock data');
      return res.json({ ...MOCK_REDDIT_DATA[decodedBrand], cached: false });
    }
  } catch (err) {
    console.error(`[/api/reddit/${decodedBrand}]`, err.message);
    return res.json({ ...(MOCK_REDDIT_DATA[decodedBrand] || MOCK_REDDIT_DATA['Man Matters']), cached: false });
  }
});

// ─── Production: serve Vite build ─────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  // Express 5 requires explicit wildcard syntax (not bare '*')
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

async function start() {
  await initSchema();
  app.listen(PORT, () => {
    console.log(`\n🚀 Ad War Room API running on http://localhost:${PORT}`);
    console.log(`   ScrapeCreators: ${SCRAPE_API_KEY ? '✅ configured' : '⚠️  not set — using mock data'}`);
    console.log(`   Gemini AI:      ${GEMINI_API_KEY ? '✅ configured' : '⚠️  not set — insights will use fallback'}`);
    console.log(`   Database:       ${process.env.TURSO_DATABASE_URL ? '☁️  Turso (remote)' : '📁 local file'}`);
    console.log(`   Environment:    ${process.env.NODE_ENV || 'development'}\n`);
  });
}
start().catch(console.error);
