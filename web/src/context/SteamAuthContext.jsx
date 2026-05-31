import React, { createContext, useContext, useState, useEffect } from 'react';

const SteamAuthContext = createContext(null);

// Cache the signed-in user in sessionStorage so a page refresh rehydrates the
// signed-in UI instantly instead of flashing the logged-out state while
// /api/auth/me is in flight. sessionStorage is per-tab and is cleared when the
// tab/window is closed, which matches the desired behaviour: stay signed in
// across refreshes, forget the cached identity once the page is closed (the
// server session cookie still governs real auth). Never the source of truth —
// the initial /api/auth/me fetch reconciles or clears it.
const SESSION_USER_KEY = 'oi.steamUser';
function readCachedUser() {
  try {
    const s = sessionStorage.getItem(SESSION_USER_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}
function cacheUser(u) {
  try {
    if (u && u.accountId) sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(u));
    else sessionStorage.removeItem(SESSION_USER_KEY);
  } catch { /* storage unavailable — degrade to in-memory only */ }
}

export function SteamAuthProvider({ children }) {
  const [steamUser, setSteamUserRaw] = useState(readCachedUser);
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(null);

  // Wrap the raw setter so every signed-in/out transition also updates the
  // per-tab cache, keeping refresh rehydration consistent at every call site.
  const setSteamUser = React.useCallback((u) => {
    setSteamUserRaw(u);
    cacheUser(u);
  }, []);

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

  // v6.81 — re-sync auth state when the page is restored from history.
  //
  // Symptom: users reported being signed out of Steam after navigating to
  // an external site (Stripe Checkout, OpenDota match link, Discord) and
  // returning. Two distinct browser behaviours cause the perceived logout:
  //
  // (1) **Back-forward cache (bfcache).** Modern browsers freeze a page
  //     when you navigate away and restore the in-memory React state
  //     instantly on back. If the SPA's auth state was momentarily null
  //     when bfcache snapshotted (e.g. mid-refresh-attempt), the restored
  //     view shows "signed out" until the user manually reloads.
  //
  // (2) **Tab-switch during a long external session.** If the user spends
  //     long enough on the external site for the React state to feel
  //     stale, returning to the tab needs to revalidate against the
  //     server-side session (which is still alive in Postgres).
  //
  // Both are fixed by re-running `refreshMe()` whenever the page becomes
  // visible again or is restored from bfcache. `refreshMe` is deliberately
  // NON-DESTRUCTIVE (see its definition above) — it ONLY upgrades a null
  // local state to signed-in if the server agrees, never the reverse.
  // That means a transient null response from /api/auth/me can't trigger
  // a spurious logout; only the initial-mount fetch above can do that,
  // and only on a true full reload.
  useEffect(() => {
    // Browsers commonly fire `visibilitychange` + `focus` (and sometimes
    // `pageshow`) within a few milliseconds of each other when the user
    // returns from an external tab/site. Without throttling, that would
    // produce 2–3 back-to-back `/api/auth/me` calls. `refreshMe` is
    // non-destructive so the storm can't cause incorrect logout, but it
    // is still pointless network churn — coalesce to a single refresh
    // per ~2-second window via a simple timestamp guard plus an
    // in-flight flag (no setTimeout debouncer needed because every call
    // site funnels through `maybeRefresh`).
    let lastRefreshAt = 0;
    let inFlight = false;
    function maybeRefresh() {
      // Only attempt the refresh if the document is actually visible —
      // avoids waking the network when the user is just cycling tabs.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (inFlight) return;
      if (now - lastRefreshAt < 2000) return;
      lastRefreshAt = now;
      inFlight = true;
      refreshMe()
        .catch(() => {})
        .finally(() => { inFlight = false; });
    }
    function onPageShow(e) {
      // `persisted` is true when the page is being restored from bfcache;
      // a full reload sets it false and the initial-mount fetch handles
      // that case, so we only refresh for the bfcache path.
      if (e && e.persisted) maybeRefresh();
    }
    document.addEventListener('visibilitychange', maybeRefresh);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', maybeRefresh);
    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', maybeRefresh);
    };
  }, [refreshMe]);

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
