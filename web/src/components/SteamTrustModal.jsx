import React, { useEffect, useState } from 'react';

const TRUST_POINTS = [
  {
    icon: '🔒',
    title: 'Your password never touches our servers',
    body: 'When you click "Sign in with Steam", your browser is sent directly to steamcommunity.com — Valve\'s domain, behind Valve\'s TLS certificate. You type your password into Valve\'s page, not ours. We have no field that asks for your password and no code path that could store it.',
  },
  {
    icon: '🪪',
    title: 'We only receive your Steam ID',
    body: 'The entire identity Valve hands back is your 64-bit SteamID. No email address, no real name, no friends list, no inventory, no purchase history, no library. We translate it into the 32-bit account ID Dota uses internally and that\'s the whole sign-in payload.',
  },
  {
    icon: '✅',
    title: 'Cryptographically verified server-side',
    body: 'Every sign-in callback is verified byte-for-byte against Valve\'s OpenID `check_authentication` endpoint before we trust it. A forged callback URL is mathematically impossible without Valve\'s signing key — this is the standard OpenID 2.0 protocol-level defence used by every Steam-authenticated service.',
  },
  {
    icon: '🍪',
    title: 'Locked-down session cookie',
    body: 'Your session cookie is HttpOnly (no JavaScript on the page can read it, mitigating XSS-based session theft), Secure (only sent over HTTPS), SameSite=lax (mitigates CSRF), and rate-limited at the auth endpoints to make brute-force / replay attempts unviable.',
  },
  {
    icon: '🚪',
    title: 'Sign out instantly, anytime',
    body: 'Hitting "Sign out" calls `req.session.destroy()` which removes the row from the session store immediately — the cookie on your machine is useless on the next request. There is no "forgot password" flow because there is no password for us to forget.',
  },
  {
    icon: '🛡️',
    title: 'Steam Guard is the upstream defence',
    body: 'If your Steam account itself is compromised, the attacker can sign into our site as you — but they can also already join Dota lobbies as you, edit your Steam profile, etc. Enable Steam Guard / two-factor on your Steam account; that\'s the only meaningful defence here, and it\'s the same one Valve recommends for every Steam-authenticated service.',
  },
];

export function SteamTrustModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="steam-trust-modal-title"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, overflow: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          maxWidth: 640, width: '100%',
          maxHeight: '90vh', overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(180deg, #1b2838 0%, #152030 100%)',
          borderRadius: '12px 12px 0 0',
        }}>
          <img
            src="https://store.steampowered.com/favicon.ico"
            alt=""
            style={{ width: 28, height: 28 }}
          />
          <div style={{ flex: 1 }}>
            <h2
              id="steam-trust-modal-title"
              style={{ margin: 0, fontSize: 18, color: '#d6ff7a' }}
            >
              Signing in with Steam — what actually happens
            </h2>
            <div style={{ fontSize: 12, color: '#8ba7bf', marginTop: 2 }}>
              OpenID 2.0 · the same protocol used by every Steam-authenticated site
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer',
              padding: '0 4px', lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Bullets */}
        <div style={{ padding: '16px 24px' }}>
          {TRUST_POINTS.map((p) => (
            <div key={p.title} style={{
              display: 'flex', gap: 14,
              padding: '14px 0',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 22, lineHeight: 1.2, flexShrink: 0 }}>{p.icon}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {p.title}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {p.body}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          background: 'var(--bg-secondary, rgba(0,0,0,0.2))',
          borderTop: '1px solid var(--border)',
          borderRadius: '0 0 12px 12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 12,
        }}>
          <a
            href="https://partner.steamgames.com/doc/features/auth#website"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: 'var(--text-muted)' }}
          >
            Read Valve's official docs on Steam authentication →
          </a>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-small"
            style={{ background: 'var(--accent)', color: 'var(--bg-primary)', border: 'none' }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Small inline link that opens the trust modal. Use next to any
 * "Sign in with Steam" CTA so users have a one-click answer to
 * "wait, is this safe?".
 */
export function WhyIsThisSafeLink({ style, label, ariaLabel, title }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel || (typeof label === 'string' ? label : 'Why is this safe?')}
        title={title}
        style={{
          background: 'transparent', border: 'none',
          color: 'var(--text-muted)', fontSize: 11,
          textDecoration: 'underline', cursor: 'pointer',
          padding: 0, ...style,
        }}
      >
        {label || 'Why is this safe?'}
      </button>
      <SteamTrustModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Full-strength Steam sign-in button used in places where we want
 * the trust signaling front-and-centre (Inhouse gate, buy-in pages,
 * onboarding). Renders the official Steam blue, the Steam icon, a
 * "Powered by Valve OpenID" subline, and a "Why is this safe?" link.
 *
 * For the compact nav button, use the local `SteamButton` in App.jsx
 * which is space-constrained and has its own trust link.
 */
export function SteamSignInPanel({ reason }) {
  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
      padding: 14,
      background: 'rgba(27,40,56,0.5)',
      border: '1px solid #567997',
      borderRadius: 8,
      maxWidth: 360,
    }}>
      {reason && (
        <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>
          {reason}
        </div>
      )}
      <a
        href="/auth/steam"
        className="btn btn-small"
        style={{
          background: '#1b2838', color: '#d6ff7a',
          border: '1px solid #567997',
          padding: '8px 14px', fontSize: 13, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          textDecoration: 'none',
        }}
      >
        <img
          src="https://store.steampowered.com/favicon.ico"
          alt=""
          style={{ width: 16, height: 16 }}
        />
        Sign in with Steam
      </a>
      <div style={{ fontSize: 11, color: '#8ba7bf', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>🔒 Password stays with Valve</span>
        <span>·</span>
        <WhyIsThisSafeLink />
      </div>
    </div>
  );
}
