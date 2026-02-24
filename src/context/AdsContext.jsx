import { createContext, useContext, useState, useMemo } from 'react';

const AdsContext = createContext();

export const useAds = () => useContext(AdsContext);

export const AdsProvider = ({ children }) => {
  // ── Page 1 state ──────────────────────────────────────────────────────────
  const [selectedAds, setSelectedAds]     = useState([]);
  const [allAds, setAllAds]               = useState([]);
  const [selectedBrand, setSelectedBrand] = useState('All');
  const [lastUpdated, setLastUpdated]     = useState(null);
  const [usingMock, setUsingMock]         = useState(false);

  // ── Page 2 analysis state (persists across navigation) ────────────────────
  const [briefs, setBriefs]               = useState({});
  const [briefMeta, setBriefMeta]         = useState({});
  const [scoredAds, setScoredAds]         = useState([]);
  const [topPatterns, setTopPatterns]     = useState([]);
  const [videoScript, setVideoScript]     = useState(null);
  const [lastAnalysedIds, setLastAnalysedIds] = useState('');

  // ── Derived: which brands are represented in the selection ───────────────
  // Returns all three if nothing is selected (fallback for redirect/empty states)
  const selectedBrands = useMemo(() => {
    if (selectedAds.length === 0) return ['Man Matters', 'Bebodywise', 'Little Joys'];
    const brands = new Set(selectedAds.map((ad) => ad.brandLabel));
    return [...brands];
  }, [selectedAds]);

  // ── Cross-page redirect: Page 2 → Page 1 with a pre-set brand ─────────────
  const [redirectTargetBrand, setRedirectTargetBrand] = useState(null);

  // ── Page 3 Reddit state (persists across navigation) ─────────────────────
  const [redditDataCache, setRedditDataCache] = useState({
    'Man Matters': null,
    'Bebodywise':  null,
    'Little Joys': null,
  });
  const [redditLoadingState, setRedditLoadingState] = useState({
    'Man Matters': false,
    'Bebodywise':  false,
    'Little Joys': false,
  });

  return (
    <AdsContext.Provider value={{
      selectedAds, setSelectedAds,
      allAds, setAllAds,
      selectedBrand, setSelectedBrand,
      lastUpdated, setLastUpdated,
      usingMock, setUsingMock,
      briefs, setBriefs,
      briefMeta, setBriefMeta,
      scoredAds, setScoredAds,
      topPatterns, setTopPatterns,
      videoScript, setVideoScript,
      lastAnalysedIds, setLastAnalysedIds,
      selectedBrands,
      redirectTargetBrand, setRedirectTargetBrand,
      redditDataCache, setRedditDataCache,
      redditLoadingState, setRedditLoadingState,
    }}>
      {children}
    </AdsContext.Provider>
  );
};
