import React, { createContext, useContext, useState, useEffect } from 'react';

const SteamAuthContext = createContext(null);

export function SteamAuthProvider({ children }) {
  const [steamUser, setSteamUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(null);

  // Pull /api/auth/me to backfill fresh fields (discord_id, guild membership,
  // needs_discord_link, autojoin-pending) on the *signed-in* user. Used after
  // applyUser() flips the SPA to signed-in inline, after the Discord-link
  // modal saves, after the OAuth callback, and by the periodic Inhouse gate
  // poll.
  //
  // v7.18 — DELIBERATELY NON-DESTRUCTIVE. The previous version called
  // `setSteamUser(null)` whenever the response was missing accountId or the
  // fetch threw. That was the root cause of the long-running Steam sign-in
  // regression: applyUser() correctly flipped the UI to signed-in from the
  // /api/auth/complete response body, then immediately fired refreshMe()
  // as a backfill — and if /api/auth/me raced ahead of the freshly-set
  // session cookie (the very condition v7.16 was meant to bypass), the
  // server returned `null`, refreshMe cleared steamUser, and the UI
  // flipped back to signed-out. Same shape silently signed users out
  // mid-session whenever the 8-second Inhouse gate poll hit a transient
  // null response.
  //
  // The only place that should ever clear steamUser based on a "not
  // signed in" server response is the initial-mount fetch below — that's
  // the one moment where "not signed in" is authoritative truth, not a
  // race or transient blip.
  const refreshMe = React.useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (data && data.accountId) {
        setSteamUser(data);
        return data;
      }
      // Non-destructive: server says "no session" but we may already have a
      // valid signed-in user in state from applyUser(). Leave it alone.
      return null;
    } catch {
      // Network error — same logic. Don't sign the user out on a blip.
      return null;
    }
  }, []);

  // v7.16 — Apply a user payload directly without round-tripping through
  // /api/auth/me. Used by SignInRetryBanner the moment /api/auth/complete
  // returns the user blob, so the UI flips to "signed in" immediately —
  // even if the freshly-set Set-Cookie hasn't propagated to subsequent
  // fetches yet, or some intermediary stripped it. The cookie is still
  // set on the response (so page reloads keep the user signed in); we
  // just no longer make that the only path to a signed-in UI state.
  const applyUser = React.useCallback((data) => {
    if (data && data.accountId) {
      setSteamUser(data);
      // Best-effort backfill of fields /api/auth/complete doesn't return
      // (discord_id, needs_discord_link, guild membership). Failure is
      // silent — the user is already shown as signed in.
      refreshMe().catch(() => {});
      return true;
    }
    return false;
  }, [refreshMe]);

  useEffect(() => {
    // Task #151 (v6.26) — explicit credentials: 'include'. Same-origin
    // fetches usually carry cookies by default, but if anything makes the
    // request cross-origin (service worker, embedded iframe context, an
    // accidental host alias such as www↔apex) the session cookie is
    // silently dropped and the user lands at /?auth=success but stays
    // signed out. Mirrors the pattern already used by refreshMe() and
    // logout().
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
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
    <SteamAuthContext.Provider value={{ steamUser, loading, signIn, logout, onboardingComplete, setOnboardingComplete, refreshMe, applyUser }}>
      {children}
    </SteamAuthContext.Provider>
  );
}

export const useSteamAuth = () => useContext(SteamAuthContext);
