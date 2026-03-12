import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSeasons } from '../api';

const SeasonContext = createContext({
  seasonId: null,
  setSeasonId: () => {},
  seasons: [],
  activeSeason: null,
  refreshSeasons: async () => {},
});

export function SeasonProvider({ children }) {
  const [seasonId, setSeasonId] = useState(null);
  const [seasons, setSeasons] = useState([]);

  const refreshSeasons = useCallback(async () => {
    try {
      const data = await getSeasons();
      setSeasons(data.seasons || []);
    } catch {}
  }, []);

  useEffect(() => {
    refreshSeasons();
  }, [refreshSeasons]);

  const activeSeason = seasons.find(s => s.active) || null;

  return (
    <SeasonContext.Provider value={{ seasonId, setSeasonId, seasons, activeSeason, refreshSeasons }}>
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason() {
  return useContext(SeasonContext);
}
