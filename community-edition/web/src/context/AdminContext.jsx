import React, { createContext, useContext, useState, useEffect } from 'react';

const AdminContext = createContext(null);

export function AdminProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem('adminKey');
    if (saved) {
      setAdminKey(saved);
      setIsAdmin(true);
    }
  }, []);

  const login = async (password) => {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAdminKey(password);
      setIsAdmin(true);
      sessionStorage.setItem('adminKey', password);
      setShowModal(false);
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || 'Invalid password' };
  };

  const logout = () => {
    setAdminKey('');
    setIsAdmin(false);
    sessionStorage.removeItem('adminKey');
  };

  return (
    <AdminContext.Provider value={{ isAdmin, adminKey, login, logout, showModal, setShowModal }}>
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = () => useContext(AdminContext);
