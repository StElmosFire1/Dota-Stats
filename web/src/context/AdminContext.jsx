import React, { createContext, useContext, useState, useEffect } from 'react';

const AdminContext = createContext(null);

export function AdminProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch('/api/admin/session-status', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.isAdmin) setIsAdmin(true);
      })
      .catch(() => {});
  }, []);

  const login = async (password) => {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setIsAdmin(true);
      setShowModal(false);
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || 'Invalid password' };
  };

  const logout = async () => {
    await fetch('/api/admin/admin-logout', {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => {});
    setIsAdmin(false);
  };

  // Expose a truthy sentinel when logged in so existing !!adminKey / {adminKey && …}
  // UI guards continue to work without change. The real password is never stored in the browser.
  // API calls that pass this string as x-admin-key are authenticated via the session cookie;
  // the server checks req.session.isAdmin first and ignores the header value.
  const adminKey = isAdmin ? 'session' : '';

  return (
    <AdminContext.Provider value={{ isAdmin, adminKey, login, logout, showModal, setShowModal }}>
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = () => useContext(AdminContext);
