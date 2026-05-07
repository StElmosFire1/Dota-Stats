import React, { createContext, useContext, useState, useEffect } from 'react';

const SteamAuthContext = createContext(null);

export function SteamAuthProvider({ children }) {
  const [steamUser, setSteamUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(null);

  // Pull /api/auth/me on mount and after a refresh request (e.g. after the
  // first-login Discord link modal saves so `needs_discord_link` flips to
  // false and the modal stops showing).
  const refreshMe = React.useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      if (data && data.accountId) {
        setSteamUser(data);
        return data;
      }
      setSteamUser(null);
      return null;
    } catch {
      setSteamUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    // Task #151 (v6.26) — explicit credentials: 'include'. Same-origin
    // fetches usually carry cookies by default, but if anything makes the
    // request cross-origin (service worker, embedded iframe context, an
    // accidental host alias such as www↔apex) the session cookie is
    // silently dropped and the user lands at /?auth=success but stays
    // signed out. Mirrors the pattern already used by refreshMe() and
    // logout().
    fetch('/api/auth/me', { credentials: 'include' })
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
    <SteamAuthContext.Provider value={{ steamUser, loading, signIn, logout, onboardingComplete, setOnboardingComplete, refreshMe }}>
      {children}
    </SteamAuthContext.Provider>
  );
}

export const useSteamAuth = () => useContext(SteamAuthContext);
