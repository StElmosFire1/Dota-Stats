import React, { createContext, useContext } from 'react';

const FeatureFlagsContext = createContext({ flags: {}, loading: false, refresh: () => {} });

export function FeatureFlagsProvider({ children }) {
  return (
    <FeatureFlagsContext.Provider value={{ flags: {}, loading: false, refresh: () => {} }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}

// All features are permanently enabled.
export function useFeatureFlag(_key) {
  return true;
}
