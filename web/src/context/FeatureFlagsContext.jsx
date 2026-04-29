import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSuperuser } from './SuperuserContext';

const FeatureFlagsContext = createContext({ flags: {}, loading: true, refresh: () => {} });

export function FeatureFlagsProvider({ children }) {
  const { superuserKey } = useSuperuser() || {};
  const [flags, setFlags] = useState({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const headers = {};
      if (superuserKey) headers['x-superuser-key'] = superuserKey;
      const res = await fetch('/api/feature-flags', { headers });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setFlags(data.flags || {});
    } catch {
      // Silent fail — features default to disabled. Don't break the page.
    } finally {
      setLoading(false);
    }
  }, [superuserKey]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <FeatureFlagsContext.Provider value={{ flags, loading, refresh }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}

// Convenience: returns boolean for a single flag. Defaults to false while loading.
export function useFeatureFlag(key) {
  const { flags } = useContext(FeatureFlagsContext);
  return Boolean(flags?.[key]);
}
