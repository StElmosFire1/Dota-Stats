import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { useSteamAuth } from '../context/SteamAuthContext';
import SignInPrompt from '../components/SignInPrompt';

function SectionLink({ to, label, icon, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => 'settings-nav-link' + (isActive ? ' is-active' : '')}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderRadius: 8,
        textDecoration: 'none',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        background: isActive ? 'var(--bg-hover)' : 'transparent',
        borderLeft: isActive ? '3px solid var(--amber, #f59e0b)' : '3px solid transparent',
        fontWeight: isActive ? 700 : 500,
        fontSize: 14,
      })}
    >
      <span aria-hidden="true" style={{ width: 20, textAlign: 'center' }}>{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

export default function Settings() {
  const { steamUser, loading } = useSteamAuth() || {};
  const location = useLocation();
  const [isCoach, setIsCoach] = useState(false);

  useEffect(() => {
    if (!steamUser?.accountId) return;
    let alive = true;
    fetch('/api/coach/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive && d && (d.coach || d.account_id)) setIsCoach(true); })
      .catch(() => {});
    return () => { alive = false; };
  }, [steamUser?.accountId]);

  if (loading) return <div className="loading" style={{ padding: 32 }}>Loading\u2026</div>;
  if (!steamUser?.accountId) {
    return <SignInPrompt title="Settings" message="Sign in with Steam to manage your account settings, notifications, and billing." />;
  }

  const isIndex = location.pathname === '/settings' || location.pathname === '/settings/';

  return (
    <div className="container" style={{ maxWidth: 1080, padding: '24px 16px' }}>
      <h1 style={{ marginBottom: 4 }}>Settings</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: 20 }}>
        Manage your profile, notifications, linked accounts, and billing in one place.
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) 1fr',
        gap: 24, alignItems: 'flex-start',
      }} className="settings-grid">
        <nav aria-label="Settings sections" style={{
          position: 'sticky', top: 'calc(var(--nav-h, 60px) + 16px)',
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: 8,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
        }}>
          <SectionLink to="/settings/profile"        icon="👤" label="Profile" />
          <SectionLink to="/settings/notifications"  icon="🔔" label="Notifications" />
          <SectionLink to="/settings/account"        icon="🔗" label="Linked accounts" />
          <SectionLink to="/settings/billing"        icon="💳" label="Subscription &amp; billing" />
          {isCoach && <SectionLink to="/settings/coaching" icon="🎓" label="Coaching" />}
          <SectionLink to="/settings/api"            icon="🔌" label="API &amp; webhooks" />
          <SectionLink to="/settings/sessions"       icon="🔐" label="Active sessions" />
          <div style={{ height: 8 }} />
          <SectionLink to="/settings/danger-zone"    icon="⚠️"  label="Danger zone" />
        </nav>

        <section style={{ minWidth: 0 }}>
          {isIndex ? <SettingsHome /> : <Outlet />}
        </section>
      </div>

      <style>{`
        @media (max-width: 760px) {
          .settings-grid {
            grid-template-columns: 1fr !important;
          }
          .settings-grid > nav {
            position: static !important;
          }
        }
      `}</style>
    </div>
  );
}

function SettingsHome() {
  const { steamUser } = useSteamAuth() || {};
  const [home, setHome] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/me/home', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive) setHome(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const completedAt = home?.onboarding_completed_at
    ? new Date(home.onboarding_completed_at).toLocaleDateString()
    : null;

  const replayTour = async () => {
    try {
      await fetch('/api/me/onboarding/reset', { method: 'POST', credentials: 'include' });
      // Clear the one-shot "seen the auto-modal" flag so GlobalOnboardingWizard
      // is willing to auto-open again, and pass `?onboarding=1` as an explicit
      // override that bypasses the returner-detection heuristic. The wizard
      // strips the query param on mount.
      try { localStorage.removeItem('onboarding_modal_seen'); } catch {}
      try { localStorage.removeItem('onboarding_nudge_dismissed_v1'); } catch {}
      window.location.href = '/?onboarding=1';
    } catch { /* tolerate */ }
  };

  const cards = [
    { to: '/settings/profile',       title: 'Profile',                icon: '👤', body: 'Bio, custom title, pinned hero, theme accent and cosmetics.' },
    { to: '/settings/notifications', title: 'Notifications',          icon: '🔔', body: 'Discord DMs, web push, live status chip visibility.' },
    { to: '/settings/account',       title: 'Linked accounts',        icon: '🔗', body: 'Steam and Discord connections.' },
    { to: '/settings/billing',       title: 'Subscription &amp; billing', icon: '💳', body: 'Pro membership, frame purchases, coin top-ups.' },
  ];

  return (
    <div>
      <div style={{
        padding: 18, background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, marginBottom: 18,
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Signed in as
        </div>
        <div style={{ marginTop: 4, fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>
          {steamUser?.displayName || `Player ${steamUser?.accountId}`}
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: 'var(--text-muted)' }}>
          Account ID: {steamUser?.accountId}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
      }}>
        {cards.map(c => (
          <Link key={c.to} to={c.to} style={{
            display: 'block', padding: 16, borderRadius: 12,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            textDecoration: 'none', color: 'inherit',
          }}>
            <div style={{ fontSize: 22, marginBottom: 6 }} aria-hidden="true">{c.icon}</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}
                 dangerouslySetInnerHTML={{ __html: c.title }} />
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{c.body}</div>
          </Link>
        ))}
      </div>

      <div style={{
        marginTop: 18, padding: 16,
        background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Onboarding tour</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {home?.onboarding_complete
              ? (completedAt ? `Completed on ${completedAt}. ` : '')
              : 'You haven\u2019t finished the welcome tour yet. '}
            Replay it any time.
          </div>
        </div>
        <button type="button" className="btn" onClick={replayTour}>
          Replay tour
        </button>
      </div>
    </div>
  );
}
