import { createContext, useContext, useState } from 'react';

const AdsContext = createContext();

export const useAds = () => useContext(AdsContext);

export const AdsProvider = ({ children }) => {
  const [selectedAds, setSelectedAds]     = useState([]);
  const [allAds, setAllAds]               = useState([]);
  const [selectedBrand, setSelectedBrand] = useState('All');
  const [lastUpdated, setLastUpdated]     = useState(null);
  const [usingMock, setUsingMock]         = useState(false);

  return (
    <AdsContext.Provider value={{
      selectedAds, setSelectedAds,
      allAds, setAllAds,
      selectedBrand, setSelectedBrand,
      lastUpdated, setLastUpdated,
      usingMock, setUsingMock,
    }}>
      {children}
    </AdsContext.Provider>
  );
};
