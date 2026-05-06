import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { setSuperuserReauthHandler } from '../api';

const SuperuserContext = createContext(null);

export function SuperuserProvider({ children }) {
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [showModal, setShowModalState] = useState(false);
  // Pending re-auth promise resolver — set when an admin API call hits 401/403
  // and asks SuperuserContext to interactively re-prompt the operator. The
  // resolver is fulfilled with `true` after a successful login or `false`
  // when the user dismisses the modal without logging in.
  const reauthResolverRef = useRef(null);

  useEffect(() => {
    fetch('/api/admin/session-status', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.isSuperuser) setIsSuperuser(true);
      })
      .catch(() => {});
  }, []);

  const resolveReauth = useCallback((ok) => {
    if (reauthResolverRef.current) {
      const resolve = reauthResolverRef.current;
      reauthResolverRef.current = null;
      resolve(ok);
    }
  }, []);

  // Wrap setShowModal so dismissals always resolve a pending re-auth promise
  // as `false`. Without this the original API caller would hang forever if
  // the operator closes the modal instead of logging in.
  const setShowModal = useCallback((show) => {
    if (!show) resolveReauth(false);
    setShowModalState(show);
  }, [resolveReauth]);

  const login = async (password) => {
    const res = await fetch('/api/admin/superuser-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setIsSuperuser(true);
      setShowModalState(false);
      resolveReauth(true);
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

  // Public API used by the api.js wrapper. Returns a Promise<boolean> that
  // resolves to true once the operator has re-authenticated, or false if
  // they dismissed the modal. Multiple concurrent callers all await the
  // same in-flight promise so a single re-login unblocks every queued call.
  const requestReauth = useCallback(() => {
    setIsSuperuser(false);
    if (reauthResolverRef.current) {
      // A re-auth is already pending — chain on the same resolver so all
      // concurrent admin calls retry together once the operator logs in.
      return new Promise((resolve) => {
        const prev = reauthResolverRef.current;
        reauthResolverRef.current = (ok) => { prev(ok); resolve(ok); };
      });
    }
    return new Promise((resolve) => {
      reauthResolverRef.current = resolve;
      setShowModalState(true);
    });
  }, []);

  // Register / unregister the wrapper hook so api.js can trigger re-auth
  // without holding a React reference.
  useEffect(() => {
    setSuperuserReauthHandler(requestReauth);
    return () => setSuperuserReauthHandler(null);
  }, [requestReauth]);

  // Expose a truthy sentinel when logged in so existing !!superuserKey / {superuserKey && …}
  // UI guards continue to work without change. The real password is never stored in the browser.
  // API calls that pass this string as x-superuser-key are authenticated via the session cookie;
  // the server checks req.session.isSuperuser first and ignores the header value.
  const superuserKey = isSuperuser ? 'session' : '';

  return (
    <SuperuserContext.Provider value={{ isSuperuser, superuserKey, login, logout, showModal, setShowModal, requestReauth }}>
      {children}
    </SuperuserContext.Provider>
  );
}

export const useSuperuser = () => useContext(SuperuserContext);
