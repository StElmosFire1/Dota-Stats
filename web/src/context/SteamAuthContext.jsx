import React, { createContext, useContext, useState, useEffect } from 'react';

const SteamAuthContext = createContext(null);

export function SteamAuthProvider({ children }) {
  const [steamUser, setSteamUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data && data.accountId) {
          setSteamUser(data);
          return fetch('/api/me/home', { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(home => {
              if (home && typeof home.onboarding_complete === 'boolean') {
                setOnboardingComplete(home.onboarding_complete);
              } else {
                setOnboardingComplete(true);
              }
            })
            .catch(() => setOnboardingComplete(true));
        } else {
          setSteamUser(null);
          setOnboardingComplete(null);
        }
      })
      .catch(() => {
        setSteamUser(null);
        setOnboardingComplete(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setSteamUser(null);
    setOnboardingComplete(null);
  };

  const signIn = () => {
    window.location.href = '/auth/steam';
  };

  return (
    <SteamAuthContext.Provider value={{ steamUser, loading, signIn, logout, onboardingComplete, setOnboardingComplete }}>
      {children}
    </SteamAuthContext.Provider>
  );
}

export const useSteamAuth = () => useContext(SteamAuthContext);
