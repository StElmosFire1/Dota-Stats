import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const SuperuserContext = createContext(null);

const STORAGE_KEY = 'superuserKey';

function installFetchInterceptor(key) {
  if (window.__superuserFetchInstalled) return;
  const originalFetch = window.__superuserOriginalFetch || window.fetch;
  window.__superuserOriginalFetch = originalFetch;
  window.fetch = function superuserFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const currentKey = sessionStorage.getItem(STORAGE_KEY);
    if (currentKey && (url.startsWith('/api/') || url.includes('/api/'))) {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : {}));
      if (!headers.has('x-superuser-key')) {
        headers.set('x-superuser-key', currentKey);
      }
      return originalFetch(input instanceof Request
        ? new Request(input, { ...init, headers })
        : input, { ...init, headers });
    }
    return originalFetch(input, init);
  };
  window.__superuserFetchInstalled = true;
}

function uninstallFetchInterceptor() {
  if (window.__superuserOriginalFetch) {
    window.fetch = window.__superuserOriginalFetch;
    delete window.__superuserOriginalFetch;
    delete window.__superuserFetchInstalled;
  }
}

export function SuperuserProvider({ children }) {
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [superuserKey, setSuperuserKey] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      setSuperuserKey(saved);
      setIsSuperuser(true);
      installFetchInterceptor(saved);
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
      sessionStorage.setItem(STORAGE_KEY, password);
      installFetchInterceptor(password);
      setShowModal(false);
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || 'Invalid password' };
  };

  const logout = () => {
    setSuperuserKey('');
    setIsSuperuser(false);
    sessionStorage.removeItem(STORAGE_KEY);
    uninstallFetchInterceptor();
  };

  return (
    <SuperuserContext.Provider value={{ isSuperuser, superuserKey, login, logout, showModal, setShowModal }}>
      {children}
    </SuperuserContext.Provider>
  );
}

export const useSuperuser = () => useContext(SuperuserContext);
