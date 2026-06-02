import React, { createContext, useContext, useState, useEffect } from 'react';

const AdminContext = createContext(null);

// Admin status is now derived from the signed-in Steam account (granted by the
// superuser in the Admin Panel) — there is no separate admin password login.
// The legacy modal/login surface is kept as no-ops so existing callers that
// invoke setShowModal()/login()/logout() don't break; they simply do nothing.
const noop = () => {};
const noopAsync = async () => ({ success: false, error: 'Admin is granted by the owner to your Steam account.' });

export function AdminProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [role, setRole] = useState(null); // 'superuser' | 'admin' | 'moderator' | null

  useEffect(() => {
    fetch('/api/admin/session-status', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => {
        if (!data) return;
        setIsAdmin(!!data.isAdmin);
        setIsModerator(!!data.isModerator);
        setRole(data.role || null);
      })
      .catch(() => {});
  }, []);

  // Expose a truthy sentinel when the account has admin tier so existing
  // !!adminKey / {adminKey && …} UI guards keep working. The real privilege
  // lives in the signed server session; API calls passing this as x-admin-key
  // are authenticated via the session cookie, not the header value.
  const adminKey = isAdmin ? 'session' : '';

  return (
    <AdminContext.Provider
      value={{
        isAdmin,
        isModerator,
        role,
        adminKey,
        // Backward-compat no-ops (admin login is now via Steam):
        showModal: false,
        setShowModal: noop,
        login: noopAsync,
        logout: noop,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = () => useContext(AdminContext);
