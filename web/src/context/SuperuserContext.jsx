import React, { createContext, useContext, useState, useEffect } from 'react';

const SuperuserContext = createContext(null);

export function SuperuserProvider({ children }) {
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [superuserKey, setSuperuserKey] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem('superuserKey');
    if (saved) {
      setSuperuserKey(saved);
      setIsSuperuser(true);
    }
  }, []);

  const login = async (password) => {
    const res = await fetch('/api/admin/superuser-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setSuperuserKey(password);
      setIsSuperuser(true);
      sessionStorage.setItem('superuserKey', password);
      setShowModal(false);
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || 'Invalid password' };
  };

  const logout = () => {
    setSuperuserKey('');
    setIsSuperuser(false);
    sessionStorage.removeItem('superuserKey');
  };

  return (
    <SuperuserContext.Provider value={{ isSuperuser, superuserKey, login, logout, showModal, setShowModal }}>
      {children}
    </SuperuserContext.Provider>
  );
}

export const useSuperuser = () => useContext(SuperuserContext);
