import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAds } from '../context/AdsContext.jsx';

const STEPS = [
  { path: '/',         label: 'Intelligence Hub', short: '1' },
  { path: '/analysis', label: 'Analysis',          short: '2' },
  { path: '/gaps',     label: 'Gap Radar',         short: '3' },
];

const HELP_CONTENT = {
  '/': [
    'Browse Brand Cards to filter ads by Mosaic vertical',
    'Competitor Profiles show AI-generated messaging summaries',
    'Use the filter bar to narrow by format, status, or days running',
    'Click any ad card to select it for analysis',
    'Select 1+ ads and hit "Analyse Selected Ads" to proceed',
  ],
  '/analysis': [
    'Analysing only the ads you selected on page 1',
    'Brand pills update KPIs, briefs, and charts simultaneously',
    'Ad Scoring Table rates each ad on Hook, CTA, Emotion, Format, Clarity',
    'Click any scored row to see standout element and weakness',
    '"Copy Script" copies the AI-generated video script brief to clipboard',
    '"Regenerate" forces a fresh Gemini scoring run',
  ],
  '/gaps': [
    'Focus Brand selector drives all Reddit data on this page',
    'Consumer Complaints surface real pain points from Reddit',
    'Gap Opportunities show what competitors are NOT addressing',
    'Copy Angle copies a suggested ad angle to your clipboard',
    'Refresh Reddit Data forces a fresh fetch (2hr cache)',
  ],
};

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { lastUpdated, usingMock, setAllAds, setLastUpdated, setUsingMock } = useAds();

  const [visitedSteps, setVisitedSteps] = useState(new Set(['/']));
  const [refreshing, setRefreshing] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const currentPath = location.pathname;

  // Track visited steps when location changes (useEffect prevents setState-in-render)
  useEffect(() => {
    setVisitedSteps((prev) => {
      if (prev.has(currentPath)) return prev;
      return new Set([...prev, currentPath]);
    });
  }, [currentPath]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const res = await fetch('/api/ads/all');
      const data = await res.json();
      setAllAds(data.ads || []);
      setLastUpdated(new Date());
      setUsingMock(data.usingMockData || false);
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  }, [setAllAds, setLastUpdated, setUsingMock]);

  const formattedTime = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  const helpBullets = HELP_CONTENT[currentPath] || HELP_CONTENT['/'];

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

          {/* Right: demo badge + updated time + refresh */}
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
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Refresh ad data"
            >
              <span className={`text-sm ${refreshing ? 'animate-spin inline-block' : ''}`}>🔄</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="pt-16 min-h-screen bg-[#F8F9FA]">
        <Outlet />
      </main>

      {/* Floating ? help button */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setHelpOpen(true); }}
        className="fixed bottom-6 right-6 w-12 h-12 bg-amber-400 rounded-full flex items-center justify-center shadow-lg z-50 hover:bg-amber-500 transition-colors text-xl font-bold"
        title="Help"
      >
        ?
      </button>

      {/* Help modal */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setHelpOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <button
              onClick={() => setHelpOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl"
            >
              ✕
            </button>
            <h2 className="text-base font-bold text-gray-900 mb-1">
              {STEPS.find((s) => s.path === currentPath)?.label || 'Help'}
            </h2>
            <p className="text-xs text-gray-400 mb-4">How to use this page</p>
            <ul className="space-y-2">
              {helpBullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-amber-500 font-bold flex-shrink-0 mt-0.5">→</span>
                  {bullet}
                </li>
              ))}
            </ul>
            <button
              onClick={() => setHelpOpen(false)}
              className="mt-4 w-full py-2 text-xs bg-gray-100 rounded-lg font-medium text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
