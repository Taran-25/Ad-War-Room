import { useState, useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { useAds } from '../context/AdsContext.jsx';

const STEPS = [
  { path: '/',         label: 'Intelligence Hub', short: '1' },
  { path: '/analysis', label: 'Analysis',          short: '2' },
  { path: '/gaps',     label: 'Gap Radar',         short: '3' },
];

const HELP_CONTENT = `HOW AD WAR ROOM WORKS

📊 Step 1 — Intelligence Hub
Browse competitor ads from Man Matters, Bebodywise, and Little Joys rivals. Filter by brand, format, and duration. Select the ads you want to analyse by clicking on them, then press Analyse Selected.

🔍 Step 2 — Analysis
See AI-generated insights based on your selected ads. View ad scores, creative trends, messaging shifts, and a video script brief. Use brand pills to filter analysis by specific brand. Switch to All to see the full picture.

🎯 Step 3 — Gap Radar
Discover unmet consumer needs by comparing what Reddit communities are saying vs what competitors are advertising. Use gap opportunities to find angles competitors are missing.

💡 Tips
- Select ads from multiple brands for a cross-brand analysis
- Proven Performer badge = ad running 60+ days
- Regenerate only refreshes the video script, not scores
- Reddit data loads for all 3 brands automatically`;

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

      {/* Help modal — read only, no navigation links */}
      {helpOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg mb-4">How Ad War Room Works</h3>
            <p className="text-gray-600 text-sm whitespace-pre-line leading-relaxed">
              {HELP_CONTENT}
            </p>
            <button
              onClick={() => setHelpOpen(false)}
              className="mt-6 w-full px-4 py-2 bg-gray-100 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
