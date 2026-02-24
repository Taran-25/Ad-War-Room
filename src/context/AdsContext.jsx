import { createContext, useContext, useState } from 'react';

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
  const [briefs, setBriefs]               = useState({});       // { [brand]: briefObj }
  const [briefMeta, setBriefMeta]         = useState({});       // { [brand]: { sampled, ad_count } }
  const [scoredAds, setScoredAds]         = useState([]);       // scored ad array
  const [topPatterns, setTopPatterns]     = useState([]);       // top pattern strings
  const [videoScript, setVideoScript]     = useState(null);     // videoScriptBrief object
  const [lastAnalysedIds, setLastAnalysedIds] = useState('');   // sorted ad IDs string

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
    }}>
      {children}
    </AdsContext.Provider>
  );
};
