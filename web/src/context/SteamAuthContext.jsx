import React, { createContext, useContext, useState, useEffect } from 'react';

const SteamAuthContext = createContext(null);

export function SteamAuthProvider({ children }) {
  const [steamUser, setSteamUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data && data.accountId) setSteamUser(data);
        else setSteamUser(null);
      })
      .catch(() => setSteamUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setSteamUser(null);
  };

  const signIn = () => {
    window.location.href = '/auth/steam';
  };

  return (
    <SteamAuthContext.Provider value={{ steamUser, loading, signIn, logout }}>
      {children}
    </SteamAuthContext.Provider>
  );
}

export const useSteamAuth = () => useContext(SteamAuthContext);
