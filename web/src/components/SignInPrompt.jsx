import React from 'react';
import { WhyIsThisSafeLink } from './SteamTrustModal';

/**
 * Shared sign-in empty state for authenticated-only routes.
 *
 * Task #623 — several auth-gated pages rendered a blank body (early
 * `return null`) or a bare "HTTP 401" error string for logged-out
 * visitors. This mirrors the /inhouse "Sign in with Steam to play"
 * gate (centred explainer + official Steam button + Valve trust
 * footnote) so every gated route degrades to the same clear CTA.
 *
 * Props:
 *   title   — optional heading (page name, e.g. "My bookings").
 *   message — short explainer of what signing in unlocks.
 *   cta     — button label (defaults to "Sign in with Steam").
 */
export default function SignInPrompt({ title, message, cta = 'Sign in with Steam' }) {
  return (
    <div style={{ maxWidth: 460, margin: '48px auto', textAlign: 'center', padding: '0 16px' }}>
      {title && (
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 28, marginBottom: 12,
          color: 'var(--text-primary)',
        }}>
          {title}
        </h1>
      )}
      <p style={{ color: 'var(--pb-muted)', marginBottom: 16 }}>
        {message}
      </p>
      <a
        href="/auth/steam"
        style={{
          background: '#1b2838', color: '#d6ff7a',
          border: '1px solid #66c0f4',
          padding: '10px 20px', fontSize: 15, fontWeight: 700, letterSpacing: 0.4,
          borderRadius: 4,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          textDecoration: 'none',
        }}
      >
        <img src="https://store.steampowered.com/favicon.ico" alt="" style={{ width: 16, height: 16 }} />
        {cta}
        <span aria-hidden="true">🔒</span>
      </a>
      <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
        You sign in directly with Valve · <WhyIsThisSafeLink />
      </p>
    </div>
  );
}
