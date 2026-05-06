import React, { createContext, useContext, useState, useEffect } from 'react';

const SuperuserContext = createContext(null);

export function SuperuserProvider({ children }) {
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch('/api/admin/session-status', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.isSuperuser) setIsSuperuser(true);
      })
      .catch(() => {});
  }, []);

  const login = async (password) => {
    const res = await fetch('/api/admin/superuser-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setIsSuperuser(true);
      setShowModal(false);
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || 'Invalid password' };
  };

  const logout = async () => {
    await fetch('/api/admin/superuser-logout', {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => {});
    setIsSuperuser(false);
  };

  // Expose a truthy sentinel when logged in so existing !!superuserKey / {superuserKey && …}
  // UI guards continue to work without change. The real password is never stored in the browser.
  // API calls that pass this string as x-superuser-key are authenticated via the session cookie;
  // the server checks req.session.isSuperuser first and ignores the header value.
  const superuserKey = isSuperuser ? 'session' : '';

  return (
    <SuperuserContext.Provider value={{ isSuperuser, superuserKey, login, logout, showModal, setShowModal }}>
      {children}
    </SuperuserContext.Provider>
  );
}

export const useSuperuser = () => useContext(SuperuserContext);
