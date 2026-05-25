import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const FeatureFlagsContext = createContext({ flags: {}, loading: false, refresh: () => {} });

// Resolves the public feature-flag map from the backend
// (`GET /api/feature-flags`). The server applies the viewer's
// session/superuser status, so `flags[key]` is the effective boolean
// the UI should obey. We deliberately fall through to `true` for unknown
// keys so existing call sites (which never had real flags wired up) keep
// behaving as if all features are enabled — only flags explicitly
// returned by the server can switch a surface off.
export function FeatureFlagsProvider({ children }) {
  const [flags, setFlags] = useState({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/feature-flags', { credentials: 'same-origin' });
      if (!r.ok) { setFlags({}); return; }
      const data = await r.json();
      setFlags(data.flags || {});
    } catch {
      setFlags({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <FeatureFlagsContext.Provider value={{ flags, loading, refresh }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}

// Returns true if the flag is on (or unknown — see provider comment).
// Returns false only when the server has explicitly resolved the flag
// to a falsy value for the current viewer.
export function useFeatureFlag(key) {
  const { flags } = useContext(FeatureFlagsContext);
  if (!key) return true;
  if (Object.prototype.hasOwnProperty.call(flags, key)) return Boolean(flags[key]);
  return true;
}
