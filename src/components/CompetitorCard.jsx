/**
 * CompetitorCard.jsx
 * Competitor profile card with ⓘ tooltip showing research context.
 * Extracted from IntelligenceHub's inline map rendering.
 *
 * Props:
 *   competitor   { name, companyName, tier }
 *   stats        { total, video, image, carousel }
 *   summary      string | null
 *   brandLabel   string  (e.g. 'Man Matters')
 *   cacheStatus  { fetched_at, ad_count, has_data, age_hours, is_fresh } | undefined
 *   onViewAds    () => void
 */

import { useState } from 'react';
import Bold from './Bold.jsx';

// ── Tier styling ──────────────────────────────────────────────────────────────
const TIER_STYLES = {
  direct:     { label: 'Direct',      style: 'bg-red-100 text-red-700' },
  indirect:   { label: 'Indirect',    style: 'bg-amber-100 text-amber-700' },
  adjacent:   { label: 'Adjacent',    style: 'bg-gray-100 text-gray-600' },
  peripheral: { label: 'Peripheral',  style: 'bg-gray-100 text-gray-600' },
  productLed: { label: 'Product-led', style: 'bg-gray-100 text-gray-600' },
  platform:   { label: 'Platform',    style: 'bg-gray-100 text-gray-600' },
};

const BRAND_BADGE_STYLE = {
  'Man Matters': 'bg-blue-100 text-blue-700',
  'Bebodywise':  'bg-pink-100 text-pink-700',
  'Little Joys': 'bg-green-100 text-green-700',
};

const CACHE_HOURS = 24;

function getCacheBadge(status) {
  if (!status?.has_data) return { label: 'No data', cls: 'bg-gray-100 text-gray-400' };
  const ageHours = (Date.now() / 1000 - status.fetched_at) / 3600;
  if (ageHours >= CACHE_HOURS) return { label: 'Expired', cls: 'bg-red-100 text-red-700' };
  if (ageHours >= 18) return { label: `${Math.round(ageHours)}h ago`, cls: 'bg-amber-100 text-amber-700' };
  if (ageHours >= 6)  return { label: `${Math.round(ageHours)}h ago`, cls: 'bg-amber-100 text-amber-600' };
  const mins = Math.round(ageHours * 60);
  return { label: mins < 1 ? 'Just now' : `${mins}m ago`, cls: 'bg-green-100 text-green-700' };
}

// ── Competitor research data for all 27 tracked competitors ───────────────────
const COMPETITOR_RESEARCH = {
  // ── Man Matters: Direct ───────────────────────────────────────────────────
  trayahealth: {
    reason: 'Personalised hair-loss treatment platform (doctor consult + subscription kit). Directly competes on Man Matters\' core DHT/hair category.',
    threats: ['Clinical authority via doctor-led proof ads', 'Subscription lock-in model drives higher LTV', 'Personalised treatment framing vs one-size-fits-all'],
    messagingWatch: '"Clinically proven" + personalised protocol language in ad headlines.',
    researchTests: 'Test doctor-testimonial format and subscription bundle offers against outcome-led creative.',
  },
  boldcare: {
    reason: 'Men\'s sexual wellness brand (ED, testosterone, stamina). Man Matters\' fastest-growing sub-category overlap.',
    threats: ['Taboo-breaking humour in high-volume video ads', 'Aggressive performance marketing spend', 'Strong male 25-35 audience targeting'],
    messagingWatch: 'Shifting from comedy hooks to clinical credibility — watch for doctor/lab imagery.',
    researchTests: 'Bold lifestyle hooks vs clinical-proof angle for men\'s wellness creative.',
  },
  rxmen: {
    reason: 'Rx-grade men\'s wellness (prescription-backed supplements). Overlaps Man Matters\' clinical positioning.',
    threats: ['"Doctor-prescribed" claim in ad headlines', 'Prescription authority as trust signal', 'Clinical credibility without pharma overhead'],
    messagingWatch: 'Prescription authority language; any expansion beyond ED/testosterone.',
    researchTests: 'Rx badge creative vs results-led testimonial for conversion lift.',
  },

  // ── Man Matters: Indirect ─────────────────────────────────────────────────
  bombayshavingcompany: {
    reason: 'Premium men\'s grooming brand (shave, skin, beard) overlapping Man Matters\' grooming range.',
    threats: ['Strong offline + online brand recall', 'Aspirational male imagery', 'Gifting & occasion-led seasonality'],
    messagingWatch: 'Any move into wellness, supplements, or hair-loss products.',
    researchTests: 'Grooming ritual narrative vs ingredient-led copy for ad engagement.',
  },
  beardo: {
    reason: 'Youth-oriented men\'s beard + grooming brand with growing wellness claims.',
    threats: ['Strong youth identity (beard culture)', 'Aggressive seasonal discounts', 'Social-first creative with high engagement'],
    messagingWatch: 'Any supplement or wellness cross-sell in ad creative.',
    researchTests: 'Lifestyle identity vs functional benefit positioning for CTR.',
  },
  ustraa: {
    reason: 'Men\'s grooming brand expanding into personal care, overlapping Man Matters\' grooming category.',
    threats: ['Affordable mass-market positioning', 'High offline + online distribution', 'Broad male audience reach'],
    messagingWatch: 'Ustraa moving upmarket or entering the supplement/wellness space.',
    researchTests: 'Premium vs mass price anchor in ad copy for AOV impact.',
  },
  themancompany: {
    reason: 'Premium men\'s grooming + fragrance brand competing for the same aspirational male consumer.',
    threats: ['Lifestyle brand equity and gifting appeal', 'D2C + strong retail presence', 'Celebrity/influencer tie-ups'],
    messagingWatch: 'Any health or wellness category expansion or supplement launch.',
    researchTests: 'Gifting occasion creative vs daily ritual messaging for repeat purchase.',
  },

  // ── Man Matters: Adjacent ─────────────────────────────────────────────────
  kapiva: {
    reason: 'Ayurvedic wellness brand (men\'s + general health) overlapping Man Matters\' ashwagandha/ayurveda range.',
    threats: ['Ayurveda-first positioning with strong traditional trust', 'Wide product range covering stress, immunity, men\'s health', 'Celebrity endorsements in ayurvedic space'],
    messagingWatch: 'Men\'s sexual health or specific wellness claims entering ad creative.',
    researchTests: 'Ayurvedic heritage framing vs modern clinical efficacy language.',
  },
  fastandup: {
    reason: 'Sports nutrition brand overlapping Man Matters\' performance and energy supplement range.',
    threats: ['Fitness-community trust and athlete endorsements', 'Protein + vitamin stacks at competitive price', 'Strong gym/sports audience targeting'],
    messagingWatch: 'Expansion from fitness nutrition into general men\'s wellness messaging.',
    researchTests: 'Athlete-proof creative vs everyday-man narrative for wellness supplements.',
  },
  healthkart: {
    reason: 'India\'s largest supplement marketplace + brand. Competes on vitamins and protein powders.',
    threats: ['Price leadership across all supplement categories', 'Wide assortment + high organic search traffic', 'HK Vitals private label growing fast'],
    messagingWatch: 'HK Vitals private label expansion into men\'s health niche categories.',
    researchTests: 'Platform trust vs direct brand trust in ad creative for first-time buyers.',
  },

  // ── Bebodywise: Direct ────────────────────────────────────────────────────
  gynoveda: {
    reason: 'Ayurvedic women\'s health brand (PCOS, periods, hormones). Bebodywise\'s #1 direct threat.',
    threats: ['PCOS + period category authority with strong clinical claims', 'Doctor endorsements building trust', 'Subscription model driving high retention'],
    messagingWatch: 'Expansion into general skin, beauty, or nutrition category in ads.',
    researchTests: 'PCOS clinical-outcome framing vs holistic women\'s wellness angle.',
  },
  oziva: {
    reason: 'Plant-based women\'s nutrition + beauty supplements. Premium positioning overlapping Bebodywise.',
    threats: ['Celebrity + influencer partnerships driving brand awareness', 'Clean-label + plant-based narrative', 'Strong women 25-40 audience targeting'],
    messagingWatch: 'Clean-label and sustainability messaging evolution; any PCOS/hormone claims.',
    researchTests: 'Ingredient transparency vs outcome-led creative for supplement conversion.',
  },
  nuawoman: {
    reason: 'Period + women\'s wellness brand. Competes on Bebodywise\'s intimate and period care category.',
    threats: ['Community-led brand with loyal subscriber base', 'Subscription period pads + supplement combo', 'Empathetic women\'s health narrative'],
    messagingWatch: 'Period health claims or hormone balance language in new ad campaigns.',
    researchTests: 'Community belonging vs product efficacy messaging for subscription sign-ups.',
  },
  kindlife: {
    reason: 'Clean + natural wellness marketplace competing on Bebodywise\'s natural/clean product segment.',
    threats: ['Marketplace trust and wide product discovery', 'Competitive pricing on clean-beauty brands', 'Curation angle drawing educated urban women'],
    messagingWatch: 'Any direct D2C brand push or exclusive product launches in ads.',
    researchTests: 'Marketplace curation trust vs direct brand relationship for first-purchase.',
  },

  // ── Bebodywise: Indirect ──────────────────────────────────────────────────
  theminimalist: {
    reason: 'Science-backed skincare brand targeting the educated urban woman also targeted by Bebodywise.',
    threats: ['"Science, not stories" positioning with high ingredient transparency', 'Strong Reddit + skincare-community credibility', 'Dermatologist-recommended claims'],
    messagingWatch: 'Body care, wellness, or ingestible supplement category entry.',
    researchTests: 'Clinical ingredient story vs holistic women\'s wellness angle for CTR.',
  },
  dotandkey: {
    reason: 'Trendy women\'s skincare + body care brand capturing urban millennial audience.',
    threats: ['Strong social proof and colourful D2C packaging', 'Gifting appeal driving high AOV', 'Aggressive influencer seeding'],
    messagingWatch: 'Supplement or ingestible category entry in ad creative.',
    researchTests: 'Aesthetic-led creative vs benefit-focused messaging for skincare conversion.',
  },
  wowskinscienceindia: {
    reason: 'Clean natural personal care brand overlapping Bebodywise\'s natural ingredients positioning.',
    threats: ['Price competitiveness across hair + skin categories', 'Wide retail + online distribution', 'Mass-market natural credibility'],
    messagingWatch: 'Any women\'s supplement, hormone-health, or wellness supplement play.',
    researchTests: 'Natural credentials vs clinical formulation story for trust-building creative.',
  },

  // ── Bebodywise: Peripheral ────────────────────────────────────────────────
  plumgoodness: {
    reason: 'Vegan, ethical beauty brand targeting the same value-conscious Bebodywise consumer.',
    threats: ['Strong cruelty-free + vegan positioning', 'Loyal community of conscious consumers', 'Expanding product range into body + hair'],
    messagingWatch: 'Supplement or wellness category expansion; any health benefit claims.',
    researchTests: 'Ethical brand story vs efficacy-first creative for millennial women.',
  },
  pilgrimbeauty: {
    reason: 'Global ingredient-led skincare brand targeting urban women — peripheral share-of-wallet.',
    threats: ['"Hero ingredient" storytelling (volcanic ash, red algae etc.)', 'Strong influencer content pipeline', 'Aspirational global-ingredients angle'],
    messagingWatch: 'Any women\'s health, wellness, or hormonal crossover in ad claims.',
    researchTests: 'Ingredient heritage story vs skin outcome creative for conversion.',
  },
  mcaffeine: {
    reason: 'Caffeine-led personal care brand competing for young female millennial attention.',
    threats: ['Highly viral social content and distinctive brand voice', 'Affordable premium positioning', 'Strong brand recall with Gen Z women'],
    messagingWatch: 'Wellness ingredient expansion beyond caffeine; any supplement launch.',
    researchTests: 'Fun brand personality vs serious wellness positioning for engagement.',
  },

  // ── Little Joys: Direct ───────────────────────────────────────────────────
  meemeeofficial: {
    reason: 'Popular baby products brand (feeding, nursing, toys) competing in Little Joys\' product categories.',
    threats: ['Strong offline + online brand recall among new mothers', 'Wide product range driving high trust', 'Mass-market distribution and price accessibility'],
    messagingWatch: 'Any move into baby nutrition, supplements, or paediatric health claims.',
    researchTests: 'Product range trust vs specific-need solution creative for new parents.',
  },
  themomsco: {
    reason: 'Natural, toxin-free baby + mum care brand. Direct overlap with Little Joys\' clean formulation promise.',
    threats: ['Strong mum-community trust and loyal subscriber base', 'Wide range covering baby + mother needs', 'Trusted co-founding story driving brand affinity'],
    messagingWatch: 'Baby supplement, paediatrician-endorsed, or gut-health claims in ads.',
    researchTests: 'Mum-community brand story vs paediatrician-proof creative for first purchase.',
  },
  mylo: {
    reason: 'Digital parenting platform + baby products marketplace. Competes for new parents\' attention and wallet.',
    threats: ['Content + commerce combination creates high stickiness', 'Parenting app community driving organic trust', 'Branded baby products with health-benefit claims'],
    messagingWatch: 'Private-label baby products with health or developmental claims.',
    researchTests: 'Platform trust vs specialised brand authority for baby nutrition products.',
  },

  // ── Little Joys: Product-led ──────────────────────────────────────────────
  himalayababycare: {
    reason: 'Heritage baby care brand (shampoo, oil, cream). Overlaps Little Joys\' baby wellness range.',
    threats: ['90%+ brand recall among new parents', 'Doctor recommendation legacy over decades', 'Mass distribution from pharmacy to e-commerce'],
    messagingWatch: 'Supplement, baby nutrition, or developmental health category entry.',
    researchTests: 'Legacy trust vs modern formulation story for premium baby wellness.',
  },
  sebamedbaby: {
    reason: 'Premium dermatologist-recommended baby skincare. Competes on Little Joys\' science-backed skin positioning.',
    threats: ['Clinical authority via dermatologist + paediatric endorsement', 'Premium positioning with high brand trust', 'pH-balanced skin science narrative'],
    messagingWatch: 'Expansion into baby nutrition, supplements, or developmental wellness.',
    researchTests: 'Dermatologist-proof creative vs gentle naturals messaging for premium parents.',
  },
  chiccoindia: {
    reason: 'Global premium baby products brand (gear, toys, care). Creating a full-stack babyhood brand.',
    threats: ['International brand trust and premium positioning', 'Wide product coverage from strollers to skincare', 'Gifting appeal with premium packaging'],
    messagingWatch: 'Baby nutrition, supplement, or developmental health product entry.',
    researchTests: 'International brand authority vs Indian brand warmth for Indian parent audience.',
  },

  // ── Little Joys: Platform ─────────────────────────────────────────────────
  firstcry: {
    reason: 'India\'s largest baby + kids marketplace. Both a distribution channel AND a competing brand for the same parent.',
    threats: ['Price comparison advantage drives down brand premiums', 'FirstCry private label products competing on margin', 'Discovery dominance makes brand visibility expensive'],
    messagingWatch: 'FirstCry branded or private-label products expanding into health claims.',
    researchTests: 'Marketplace convenience vs direct brand relationship creative for retention.',
  },
};

// ── InfoButton + Tooltip ──────────────────────────────────────────────────────
function ResearchTooltip({ companyName, tierLabel }) {
  const [visible, setVisible] = useState(false);
  const data = COMPETITOR_RESEARCH[companyName];
  if (!data) return null;

  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible(v => !v)}
        className="w-4 h-4 rounded-full bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-600 flex items-center justify-center text-[9px] font-bold transition-colors flex-shrink-0"
        aria-label="Research context"
      >
        i
      </button>

      {visible && (
        <div
          onMouseEnter={() => setVisible(true)}
          onMouseLeave={() => setVisible(false)}
          className="absolute top-5 left-0 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-left pointer-events-auto"
        >
          {/* Why they're a competitor */}
          <p className="text-[11px] text-gray-700 leading-snug mb-2">{data.reason}</p>

          {/* Threats */}
          {data.threats?.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1">Key Threats</p>
              <ul className="space-y-0.5">
                {data.threats.map((t, i) => (
                  <li key={i} className="text-[10px] text-gray-600 flex items-start gap-1">
                    <span className="text-red-400 flex-shrink-0 mt-0.5">•</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Watch messaging */}
          {data.messagingWatch && (
            <div className="mb-2">
              <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-0.5">Watch Messaging</p>
              <p className="text-[10px] text-gray-600">{data.messagingWatch}</p>
            </div>
          )}

          {/* Research tests */}
          {data.researchTests && (
            <div>
              <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-0.5">Test Against Them</p>
              <p className="text-[10px] text-gray-600">{data.researchTests}</p>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

// ── Main CompetitorCard component ─────────────────────────────────────────────
export default function CompetitorCard({ competitor, stats, summary, brandLabel, cacheStatus, onViewAds }) {
  const tierInfo = competitor.tier
    ? (TIER_STYLES[competitor.tier] || { label: competitor.tier, style: 'bg-gray-100 text-gray-600' })
    : null;
  const badge = getCacheBadge(cacheStatus);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{competitor.name}</p>
          <div className="flex items-center gap-1 flex-wrap">
            {/* Brand badge */}
            {brandLabel && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${BRAND_BADGE_STYLE[brandLabel] || 'bg-gray-100 text-gray-600'}`}>
                {brandLabel}
              </span>
            )}

            {/* Tier badge + ⓘ button */}
            {tierInfo && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tierInfo.style} inline-flex items-center gap-1`}>
                {tierInfo.label}
                <ResearchTooltip companyName={competitor.companyName} tierLabel={tierInfo.label} />
              </span>
            )}

            {/* Cache status badge */}
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
        </div>

        {/* Ad count + format breakdown */}
        <div className="text-right flex-shrink-0 ml-2">
          <p className="text-xs font-bold text-gray-700">
            <Bold>{stats?.total ?? 0}</Bold>{' '}
            <span className="font-normal text-gray-400">ads</span>
          </p>
          <p
            className="text-[10px] text-gray-400"
            title="v = Video  |  i = Image  |  c = Carousel"
            style={{ cursor: 'help' }}
          >
            {(stats?.video   ?? 0) > 0 && `${stats.video}v `}
            {(stats?.image   ?? 0) > 0 && `${stats.image}i `}
            {(stats?.carousel ?? 0) > 0 && `${stats.carousel}c`}
          </p>
        </div>
      </div>

      {/* Summary / skeleton / no-data states */}
      {!cacheStatus?.has_data ? (
        <p className="text-xs text-gray-400 italic">No ad data yet. Click "Fetch Fresh Ads" to load.</p>
      ) : !summary ? (
        <div className="space-y-1.5">
          <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
          <div className="h-3 w-4/5 bg-gray-100 rounded animate-pulse" />
        </div>
      ) : (
        <p className="text-xs text-gray-500 leading-relaxed">{summary}</p>
      )}

      {/* View ads link */}
      <button
        onClick={onViewAds}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        View Ads ↓
      </button>
    </div>
  );
}
