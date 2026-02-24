import { useState, useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { useAds } from '../context/AdsContext.jsx';

const STEPS = [
  { path: '/',         label: 'Intelligence Hub', short: '1' },
  { path: '/analysis', label: 'Analysis',          short: '2' },
  { path: '/gaps',     label: 'Gap Radar',         short: '3' },
];

const HELP_TABS = [
  { id: 'hub',      label: '📊 Intelligence Hub' },
  { id: 'analysis', label: '🔍 Analysis' },
  { id: 'gaps',     label: '🎯 Gap Radar' },
];

const HELP_SECTIONS = {
  hub: [
    { heading: 'Pick Your Brand',          body: 'Start by selecting which Mosaic brand you want to research — Man Matters, Bebodywise, or Little Joys. Each brand has its own set of tracked competitors.' },
    { heading: 'Read Competitor Profiles', body: 'Each competitor card shows their ad count, creative format breakdown, and an AI-generated one-line summary of their messaging strategy. Direct competitors are marked in red, indirect in yellow.' },
    { heading: 'Browse & Filter Ads',      body: 'Scroll through live competitor ads pulled from Meta Ad Library. Filter by format (video, image, carousel), sort by how long an ad has been running, or search by keyword. Ads with a ⭐ badge have been running for 60+ days — these are proven performers worth studying.' },
    { heading: 'Select Ads to Analyse',   body: 'Click any ad card to select it. You can select ads across multiple brands. Once you have picked the ads you care about, hit Analyse Selected to go deeper.' },
  ],
  analysis: [
    { heading: 'Your Selection Controls Everything', body: 'The analysis is based only on the ads you selected. If you selected 12 ads, insights reflect only those 12 ads. Switch brand tabs to see analysis filtered by brand, or stay on All for the full picture.' },
    { heading: 'AI Intelligence Brief',              body: 'Gemini analyses your selected ads and surfaces the top patterns, competitive threats, and opportunity gaps in plain language. The Threat Level badge tells you how aggressively competitors are advertising.' },
    { heading: 'Ad Scoring',                         body: 'Every selected ad is scored across 5 dimensions: Hook Strength, CTA Clarity, Emotional Pull, Format Fit, and Message Clarity. Scores are colour coded — green means strong, yellow is average, red needs work. Ads are ranked highest to lowest.' },
    { heading: 'Creative Trends',                    body: 'See which ad formats and creative styles are rising, stable, or declining across your selected competitors. Rising trends signal where the market is heading.' },
    { heading: 'Video Script Brief',                 body: 'Based on the highest scoring ads in your selection, Gemini generates a ready-to-brief video script with hook, body, CTA, visual direction, and tone notes. Use Regenerate to get a fresh take.' },
  ],
  gaps: [
    { heading: 'What Gap Radar Does',      body: 'Gap Radar compares what real consumers are complaining about on Reddit with what competitors are currently advertising. The space between those two is your opportunity.' },
    { heading: 'Consumer Complaints',      body: 'Real unfiltered Reddit posts from wellness, skincare, parenting, and grooming communities. These are genuine pain points consumers express publicly but no brand addresses in their ads.' },
    { heading: 'Gap Opportunities',        body: 'Each gap card shows an unmet consumer need, how urgent it is, and a suggested ad angle you could use. High urgency gaps appear first. Use Copy Angle to grab the full brief instantly.' },
    { heading: 'Trending Topics',          body: 'Topics gaining momentum in relevant Reddit communities right now. Rising topics with no competitor ad coverage are the highest value gaps to act on first.' },
    { heading: 'Reddit Sentiment Summary', body: 'A plain language summary of the overall consumer mood in your brand category. Use this to understand the emotional context your ads will land in.' },
  ],
};

function HelpModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('hub');
  const sections = HELP_SECTIONS[activeTab];

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + tabs */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">How It Works</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors text-lg"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2">
            {HELP_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-amber-400 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          <div className="space-y-5">
            {sections.map((section, i) => (
              <div key={i}>
                <h4 className="font-semibold text-sm text-gray-900 mb-1">{section.heading}</h4>
                <p className="text-sm text-gray-500 leading-relaxed">{section.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const { lastUpdated, usingMock } = useAds();

  const [visitedSteps, setVisitedSteps] = useState(new Set(['/']));
  const [helpOpen, setHelpOpen] = useState(false);

  const currentPath = location.pathname;

  // Track visited steps when location changes (useEffect prevents setState-in-render)
  useEffect(() => {
    setVisitedSteps((prev) => {
      if (prev.has(currentPath)) return prev;
      return new Set([...prev, currentPath]);
    });
  }, [currentPath]);

  const formattedTime = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  return (
    <>
      {/* Fixed top navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
          {/* Left: logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex gap-1">
              <span className="w-3 h-3 rounded-full bg-red-400" />
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              <span className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <div className="ml-1">
              <p className="text-sm font-bold text-gray-900 leading-none">Ad War Room</p>
              <p className="text-[10px] text-gray-400 leading-none mt-0.5">Mosaic Wellness</p>
            </div>
          </div>

          {/* Center: step progress */}
          <div className="flex items-center gap-1 mx-auto">
            {STEPS.map((step, i) => {
              const isActive = currentPath === step.path;
              const isVisited = visitedSteps.has(step.path) && !isActive;
              return (
                <div key={step.path} className="flex items-center gap-1">
                  {i > 0 && (
                    <div className={`hidden sm:block w-8 h-px ${isVisited || currentPath === STEPS[i].path ? 'bg-amber-400' : 'bg-gray-200'}`} />
                  )}
                  <Link
                    to={step.path}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-amber-400 text-gray-900'
                        : isVisited
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold bg-white/60">
                      {isVisited ? '✓' : step.short}
                    </span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Right: demo badge + updated time */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {usingMock && (
              <span className="hidden sm:inline-flex px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 rounded-full uppercase tracking-wide">
                Demo Mode
              </span>
            )}
            {formattedTime && (
              <span className="hidden sm:block text-xs text-gray-400">
                Updated {formattedTime}
              </span>
            )}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="pt-16 min-h-screen bg-[#F8F9FA]">
        <Outlet />
      </main>

      {/* Floating ? help button — top-right to avoid overlap with page floating buttons */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setHelpOpen(true); }}
        className="fixed top-20 right-6 w-10 h-10 bg-amber-400 rounded-full flex items-center justify-center shadow-lg z-40 hover:bg-amber-500 transition-colors text-lg font-bold"
        title="How it works"
      >
        ?
      </button>

      {/* Help modal */}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </>
  );
}
