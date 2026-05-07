import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import SeasonSelector from './components/SeasonSelector';
import AdminLoginModal from './components/AdminLoginModal';
import SuperuserLoginModal from './components/SuperuserLoginModal';
import { SeasonProvider } from './context/SeasonContext';
import { AdminProvider, useAdmin } from './context/AdminContext';
import { SuperuserProvider, useSuperuser } from './context/SuperuserContext';
import { SteamAuthProvider, useSteamAuth } from './context/SteamAuthContext';
import { FeatureFlagsProvider } from './context/FeatureFlagsContext';
import WelcomeModal from './components/WelcomeModal';
import { WhyIsThisSafeLink } from './components/SteamTrustModal';
import OnboardingWizard from './components/OnboardingWizard';
import DiscordLinkModal from './components/DiscordLinkModal';
import DiscordRetryBanner from './components/DiscordRetryBanner';

const MatchList = lazy(() => import('./pages/MatchList'));
const MatchDetail = lazy(() => import('./pages/MatchDetail'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const PlayerProfile = lazy(() => import('./pages/PlayerProfile'));
const Heroes = lazy(() => import('./pages/Heroes'));
const Draft = lazy(() => import('./pages/Draft'));
const DraftAssistant = lazy(() => import('./pages/DraftAssistant'));
const Players = lazy(() => import('./pages/Players'));
const OverallStats = lazy(() => import('./pages/OverallStats'));
const PositionStats = lazy(() => import('./pages/PositionStats'));
const Synergy = lazy(() => import('./pages/Synergy'));
const Upload = lazy(() => import('./pages/Upload'));
const Seasons = lazy(() => import('./pages/Seasons'));
const BuyinSuccess = lazy(() => import('./pages/BuyinSuccess'));
const PlayerTools = lazy(() => import('./pages/PlayerTools'));
const Predictions = lazy(() => import('./pages/Predictions'));
const StatsEditor = lazy(() => import('./pages/StatsEditor'));
const PatchNotes = lazy(() => import('./pages/PatchNotes'));
const Home = lazy(() => import('./pages/Home'));
const MultiKills = lazy(() => import('./pages/MultiKills'));
const WardMap = lazy(() => import('./pages/WardMap'));
const Records = lazy(() => import('./pages/Records'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const DraftSandbox = lazy(() => import('./pages/DraftSandbox'));
const ProfileSandbox = lazy(() => import('./pages/ProfileSandbox'));
const ProfileDemo = lazy(() => import('./pages/ProfileDemo'));
const PudgeStats = lazy(() => import('./pages/PudgeStats'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Social = lazy(() => import('./pages/Social'));
const HallOfFame = lazy(() => import('./pages/HallOfFame'));
const PlayerBenchmarks = lazy(() => import('./pages/PlayerBenchmarks'));
const Tournaments = lazy(() => import('./pages/Tournaments'));
const WeekendTournament = lazy(() => import('./pages/WeekendTournament'));
const RecordMatch = lazy(() => import('./pages/RecordMatch'));
const Inhouse = lazy(() => import('./pages/Inhouse'));
const PlayerInsights = lazy(() => import('./pages/PlayerInsights'));
const Join = lazy(() => import('./pages/Join'));
const SettingsNotifications = lazy(() => import('./pages/SettingsNotifications'));
const SettingsProfile = lazy(() => import('./pages/SettingsProfile'));
const Pro = lazy(() => import('./pages/Pro'));
const SettingsBilling = lazy(() => import('./pages/SettingsBilling'));
const Coaches = lazy(() => import('./pages/Coaches'));
const CoachProfile = lazy(() => import('./pages/CoachProfile'));
const CoachEdit = lazy(() => import('./pages/CoachEdit'));
const CoachOnboarding = lazy(() => import('./pages/CoachOnboarding'));
const MyBookings = lazy(() => import('./pages/MyBookings'));
const SeasonSummary = lazy(() => import('./pages/SeasonSummary'));

function HealthDot() {
  const [health, setHealth] = useState(null);
  const [show, setShow] = useState(false);

  const fetch_ = () =>
    fetch('/api/health')
      .then(r => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));

  useEffect(() => {
    fetch_();
    const t = setInterval(fetch_, 30000);
    return () => clearInterval(t);
  }, []);

  const allOk = health?.ok;
  const color = health === null ? '#888' : allOk ? '#4caf50' : '#f44336';
  const label = health === null ? 'Checking…' : allOk ? 'All systems OK' : 'Service issue';

  const services = health?.services
    ? Object.values(health.services).map(s => `${s.ok ? '✓' : '✗'} ${s.label}`).join('\n')
    : '';

  const uptimeStr = health?.uptime != null
    ? (() => {
        const s = health.uptime;
        if (s < 60) return `${s}s`;
        if (s < 3600) return `${Math.floor(s / 60)}m`;
        return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
      })()
    : null;

  const tooltip = [label, services, uptimeStr ? `Uptime: ${uptimeStr}` : ''].filter(Boolean).join('\n');

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 10, cursor: 'default' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{
        width: 9, height: 9, borderRadius: '50%',
        background: color,
        display: 'inline-block',
        boxShadow: allOk ? `0 0 6px ${color}` : 'none',
        transition: 'background 0.3s',
      }} />
      {show && (
        <span style={{
          position: 'absolute', top: 16, right: 0,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '8px 12px',
          fontSize: 12, whiteSpace: 'pre', lineHeight: 1.7,
          zIndex: 999, color: 'var(--text-primary)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          minWidth: 160,
        }}>
          {tooltip || 'No data'}
        </span>
      )}
    </span>
  );
}

function AdminButton() {
  const { isAdmin, logout, setShowModal } = useAdmin();
  if (isAdmin) {
    return (
      <button
        className="btn btn-small admin-badge"
        onClick={logout}
        title="Logged in as admin — click to log out"
        style={{ marginLeft: 8 }}
      >
        &#128274; Admin
      </button>
    );
  }
  return (
    <button
      className="btn btn-small"
      onClick={() => setShowModal(true)}
      title="Admin login"
      style={{ marginLeft: 8, opacity: 0.7 }}
    >
      &#128275; Login
    </button>
  );
}

function SteamButton() {
  const { steamUser, loading, signIn, logout } = useSteamAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = React.useRef(null);
  const location = useLocation();

  // Close on route change.
  React.useEffect(() => { setOpen(false); }, [location]);

  // Close on outside click / Escape.
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (loading) return null;

  if (steamUser) {
    // v5.84 — clicking the signed-in pill now opens an account dropdown
    // (View profile / Settings / Notifications / My matches / Sign out)
    // instead of immediately signing the user out. Several users hit
    // "Sign out" by accident thinking it was a profile shortcut.
    const accountId = steamUser.accountId;
    const itemStyle = {
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', fontSize: 13,
      color: 'var(--text-primary)', textDecoration: 'none',
      cursor: 'pointer', background: 'transparent', border: 'none', width: '100%',
      textAlign: 'left',
    };
    const onItemHover = (e, on) => {
      e.currentTarget.style.background = on ? 'var(--bg-hover)' : 'transparent';
    };
    return (
      <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', marginLeft: 4 }}>
        <button
          type="button"
          className="btn btn-small steam-signed-in"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          title={`Signed in as ${steamUser.displayName || accountId}`}
          style={{
            background: 'linear-gradient(180deg,#2a4d12,#1b3008)',
            borderColor: '#a4d007',
            color: '#d6ff7a',
            fontSize: 11,
            fontWeight: 600,
            boxShadow: '0 0 0 1px rgba(164,208,7,0.35)',
            display: 'inline-flex', alignItems: 'center',
          }}
        >
          <span style={{ marginRight: 4 }}>✓</span>
          <img src="https://store.steampowered.com/favicon.ico" alt="" style={{ width: 12, height: 12, marginRight: 4 }} />
          {steamUser.displayName || 'Signed in'}
          <span style={{ marginLeft: 6, fontSize: 9, opacity: 0.75 }}>▼</span>
        </button>
        {open && (
          <div
            role="menu"
            style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 6,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '6px 0', minWidth: 200, zIndex: 1000,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{
              padding: '6px 14px 8px', fontSize: 11, color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border)', marginBottom: 4,
            }}>
              Signed in as<br />
              <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>
                {steamUser.displayName || `Player ${accountId}`}
              </strong>
            </div>
            {accountId && (
              <Link to={`/player/${accountId}`} role="menuitem" style={itemStyle}
                onMouseEnter={(e) => onItemHover(e, true)} onMouseLeave={(e) => onItemHover(e, false)}>
                <span aria-hidden="true">👤</span> View profile
              </Link>
            )}
            <Link to="/settings/profile" role="menuitem" style={itemStyle}
              onMouseEnter={(e) => onItemHover(e, true)} onMouseLeave={(e) => onItemHover(e, false)}>
              <span aria-hidden="true">⚙️</span> Profile settings
            </Link>
            <Link to="/settings/notifications" role="menuitem" style={itemStyle}
              onMouseEnter={(e) => onItemHover(e, true)} onMouseLeave={(e) => onItemHover(e, false)}>
              <span aria-hidden="true">🔔</span> Notifications
            </Link>
            {accountId && (
              <Link to={`/player/${accountId}#matches`} role="menuitem" style={itemStyle}
                onMouseEnter={(e) => onItemHover(e, true)} onMouseLeave={(e) => onItemHover(e, false)}>
                <span aria-hidden="true">🎮</span> My matches
              </Link>
            )}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); logout(); }}
              style={{ ...itemStyle, color: '#f08a8a' }}
              onMouseEnter={(e) => onItemHover(e, true)}
              onMouseLeave={(e) => onItemHover(e, false)}
            >
              <span aria-hidden="true">🚪</span> Sign out
            </button>
          </div>
        )}
      </span>
    );
  }
  // v5.85 — added trust signaling next to the Steam Login button.
  // Many users hesitated on the plain "Steam Login" pill because it
  // wasn't clear whether they were handing us their Steam password
  // (they aren't — Valve handles the credential entry on their own
  // domain). The "Why is this safe?" link opens a modal that walks
  // through the entire OpenID 2.0 flow.
  return (
    // v5.93 — replaced the absolutely-positioned trust footnote (which was
    // overflowing into the row below the nav and clipping into sibling
    // controls) with an inline trust badge that sits next to the Steam
    // button. The "?" pill opens the SteamTrustModal directly and the
    // longer reassurance copy lives on its title tooltip + the modal,
    // so nothing renders outside the button's own row anymore.
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
      <button
        className="btn btn-small steam-login-btn"
        onClick={signIn}
        title="You'll sign in directly with Valve at steamcommunity.com — we never see your password."
        style={{
          background: '#1b2838', borderColor: '#66c0f4', color: '#d6ff7a',
          fontSize: 11, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <img src="https://store.steampowered.com/favicon.ico" alt="" style={{ width: 14, height: 14 }} />
        Sign in with Steam
      </button>
      <WhyIsThisSafeLink
        style={{
          fontSize: 11, fontWeight: 600,
          color: 'var(--text-muted)',
          textDecoration: 'none',
          border: '1px solid var(--border)',
          borderRadius: 999,
          width: 20, height: 20,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
        }}
        label="?"
        ariaLabel="Why is signing in with Steam safe?"
        title="Password stays with Valve — click for details"
      />
    </span>
  );
}

function SuperuserButton() {
  const { isSuperuser, setShowModal } = useSuperuser();
  const navigate = useNavigate();
  if (isSuperuser) {
    return (
      <button
        className="btn btn-small"
        onClick={() => navigate('/admin')}
        title="Go to Admin Panel"
        style={{ marginLeft: 4, background: '#7b3f00', borderColor: '#ff9800', color: '#ff9800' }}
      >
        &#128081; Admin
      </button>
    );
  }
  return (
    <button
      className="btn btn-small"
      onClick={() => setShowModal(true)}
      title="Superuser login"
      style={{ marginLeft: 4, opacity: 0.5 }}
    >
      &#128081;
    </button>
  );
}

function DropdownMenu({ label, children }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location]);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="nav-link" style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center' }}>
        {label} <span style={{ fontSize: 9, opacity: 0.6 }}>▼</span>
      </span>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 0', minWidth: 160, zIndex: 1000,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {children}
        </div>
      )}
    </span>
  );
}

function DropdownItem({ to, children }) {
  return (
    <Link
      to={to}
      style={{
        display: 'block', padding: '7px 16px', fontSize: 13,
        color: 'var(--text-primary)', textDecoration: 'none',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      {children}
    </Link>
  );
}

function ThemeToggle() {
  const [isDark, setIsDark] = React.useState(() => {
    const stored = localStorage.getItem('theme');
    if (stored) return stored !== 'light';
    return true;
  });

  React.useEffect(() => {
    if (isDark) {
      document.body.classList.remove('light-theme', 'theme-light');
      document.body.classList.add('theme-dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.add('light-theme', 'theme-light');
      document.body.classList.remove('theme-dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  React.useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'light') {
      document.body.classList.add('light-theme', 'theme-light');
      document.body.classList.remove('theme-dark');
      setIsDark(false);
    } else {
      document.body.classList.add('theme-dark');
    }
  }, []);

  return (
    <button
      className="btn btn-small"
      onClick={() => setIsDark(d => !d)}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{ marginLeft: 4, fontSize: 14, padding: '4px 8px' }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}

function Nav() {
  const location = useLocation();
  const isActive = (path) => location.pathname === path ? 'nav-link active' : 'nav-link';

  return (
    <nav className="navbar">
      <Link to="/" className="nav-brand">
        <img src="/oa-logo.png" alt="OA" className="brand-logo" />
        <span className="brand-lockup">
          <span className="brand-lockup-top">OCE</span>
          <span className="brand-lockup-bot">INHOUSE</span>
        </span>
      </Link>
      <div className="nav-links">
        <Link to="/" className={isActive('/')}>Home</Link>
        <Link to="/leaderboard" className={isActive('/leaderboard')}>Leaderboard</Link>
        <Link to="/stats" className={isActive('/stats')}>Player Stats</Link>
        <Link to="/positions" className={isActive('/positions')}>Positions</Link>
        <Link to="/heroes" className={isActive('/heroes')}>Heroes</Link>
        <Link to="/synergy" className={isActive('/synergy')}>Synergy</Link>
        <Link to="/matches" className={isActive('/matches')}>Matches</Link>
        <DropdownMenu label="Tools">
          <DropdownItem to="/upload">Upload Replay</DropdownItem>
          <DropdownItem to="/draft">Draft &amp; Assistant</DropdownItem>
          <DropdownItem to="/records">Records</DropdownItem>
          <DropdownItem to="/predictions">Predictions</DropdownItem>
          <DropdownItem to="/patch-notes">Patch Notes</DropdownItem>
          <DropdownItem to="/pudge-stats">Pudge Hook Stats</DropdownItem>
          <DropdownItem to="/schedule">Game Schedule</DropdownItem>
          <DropdownItem to="/inhouse">Inhouse Lobby</DropdownItem>
          <DropdownItem to="/tournaments">Tournaments</DropdownItem>
          <DropdownItem to="/coaches">Coaching Marketplace</DropdownItem>
          {/* v5.88 — Hall of Fame and Multi-Kills now live as tabs inside the Records page. */}
          <DropdownItem to="/join">Join the League</DropdownItem>
        </DropdownMenu>
        <Link
          to="/pro"
          className={isActive('/pro')}
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
            color: '#1a1a1a',
            fontWeight: 700,
            padding: '6px 14px',
            borderRadius: 6,
            letterSpacing: 0.3,
            boxShadow: '0 2px 8px rgba(245,158,11,0.25)',
          }}
          title="Pro Membership — unlocks all advanced analytics"
        >
          ★ Pro
        </Link>
      </div>
      <SeasonSelector />
      <ThemeToggle />
      <SteamButton />
      <AdminButton />
      <SuperuserButton />
      <HealthDot />
    </nav>
  );
}

const TICKER_DEFAULT_ITEMS = [
  'Season 10 ladder live',
  'New Court & Pitch design',
  'Inhouse lobby open · /inhouse',
  'Coaching marketplace beta',
  'Draft Assistant V2 — try it',
  'Patch notes updated',
];

function BroadcastTicker() {
  const [cfg, setCfg] = React.useState({ enabled: true, items: TICKER_DEFAULT_ITEMS });

  const applyValue = React.useCallback((raw) => {
    try {
      const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (v && typeof v === 'object') {
        const items = Array.isArray(v.items) && v.items.length > 0
          ? v.items.map(s => String(s || '').trim()).filter(Boolean)
          : TICKER_DEFAULT_ITEMS;
        setCfg({ enabled: v.enabled !== false, items });
      }
    } catch {}
  }, []);

  const refetch = React.useCallback(() => {
    return fetch('/api/settings/broadcast-ticker', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value) applyValue(d.value); })
      .catch(() => {});
  }, [applyValue]);

  React.useEffect(() => {
    let cancelled = false;
    refetch();
    // Same-tab fast path: AdminPanel dispatches this after a successful save
    // so the live bar at the top of the page reflects the change without a
    // full reload (the previous behaviour — fetch-once-on-mount — was the
    // root cause of "ticker not updating after saving").
    const onUpdated = (e) => { if (!cancelled && e?.detail) applyValue(e.detail); };
    // Cross-tab safety net: if another admin saves in another tab, refetch
    // when this tab regains focus.
    const onVisible = () => { if (!cancelled && document.visibilityState === 'visible') refetch(); };
    window.addEventListener('broadcast-ticker-updated', onUpdated);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('broadcast-ticker-updated', onUpdated);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refetch, applyValue]);

  if (!cfg.enabled || cfg.items.length === 0) return null;
  const loop = [...cfg.items, ...cfg.items];
  return (
    <div className="oa-ticker" aria-hidden="true">
      <div className="oa-ticker-track">
        {loop.map((t, i) => (
          <React.Fragment key={i}>
            <span>{t}</span>
            <span className="oa-ticker-dot">•</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function EditorialFooter() {
  return (
    <footer className="oa-footer">
      <div className="oa-footer-inner">
        <div className="oa-footer-brand">
          <img src="/oa-logo.png" alt="OA" />
          <span>© {new Date().getFullYear()} OCE Inhouse</span>
        </div>
        <div className="oa-footer-links">
          <a href="https://discord.gg" target="_blank" rel="noreferrer">Discord</a>
          <span className="oa-footer-sep">|</span>
          <span className="oa-footer-version">
            v5.85 — <Link to="/patch-notes">Patch notes</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

function GlobalOnboardingWizard() {
  const { onboardingComplete, setOnboardingComplete } = useSteamAuth();
  if (onboardingComplete !== false) return null;
  return (
    <OnboardingWizard
      onComplete={() => setOnboardingComplete(true)}
      onDismiss={() => setOnboardingComplete(true)}
    />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SteamAuthProvider>
      <AdminProvider>
        <SuperuserProvider>
          <FeatureFlagsProvider>
          <SeasonProvider>
            <BroadcastTicker />
            <Nav />
            <AdminLoginModal />
            <SuperuserLoginModal />
            <WelcomeModal />
            <GlobalOnboardingWizard />
            <DiscordLinkModal />
            <DiscordRetryBanner />
            <main className="container">
              <Suspense fallback={<div className="loading">Loading…</div>}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/matches" element={<MatchList />} />
                <Route path="/match/:matchId" element={<MatchDetail />} />
                <Route path="/match/:matchId/edit" element={<StatsEditor />} />
                <Route path="/player/:accountId" element={<PlayerProfile />} />
                <Route path="/heroes" element={<Heroes />} />
                <Route path="/players" element={<Players />} />
                <Route path="/stats" element={<OverallStats />} />
                <Route path="/positions" element={<PositionStats />} />
                <Route path="/synergy" element={<Synergy />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/seasons" element={<Seasons />} />
                <Route path="/seasons/:id/summary" element={<SeasonSummary />} />
                <Route path="/buyin-success" element={<BuyinSuccess />} />
                <Route path="/player-tools" element={<PlayerTools />} />
                <Route path="/head-to-head" element={<PlayerTools />} />
                <Route path="/compare" element={<PlayerTools />} />
                <Route path="/draft" element={<Draft />} />
                <Route path="/draft-assistant" element={<DraftAssistant />} />
                <Route path="/draft-stats" element={<Draft />} />
                <Route path="/hero-breakdown" element={<Heroes defaultTab="breakdown" />} />
                <Route path="/hero-position-meta" element={<Heroes defaultTab="meta" />} />
                <Route path="/position-player-profiles" element={<PositionStats defaultTab="profiles" />} />
                <Route path="/predictions" element={<Predictions />} />
                <Route path="/patch-notes" element={<PatchNotes />} />
                <Route path="/multikills" element={<MultiKills />} />
                <Route path="/ward-map" element={<WardMap />} />
                <Route path="/records" element={<Records />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/admin/draft-sandbox" element={<DraftSandbox />} />
                <Route path="/admin/profile-sandbox" element={<ProfileSandbox />} />
                <Route path="/admin/profile-demo" element={<ProfileDemo />} />
                <Route path="/pudge-stats" element={<PudgeStats />} />
                <Route path="/schedule" element={<Schedule />} />
                <Route path="/inhouse" element={<Inhouse />} />
                <Route path="/social" element={<PlayerInsights defaultTab="network" />} />
                <Route path="/player-network" element={<PlayerInsights defaultTab="network" />} />
                <Route path="/benchmarks" element={<PlayerInsights defaultTab="benchmarks" />} />
                <Route path="/insights" element={<PlayerInsights />} />
                <Route path="/tournaments" element={<Tournaments />} />
                <Route path="/tournaments/:id" element={<Tournaments />} />
                <Route path="/weekend-tournament/:id" element={<WeekendTournament />} />
                <Route path="/hall-of-fame" element={<HallOfFame />} />
                <Route path="/admin/record-match" element={<RecordMatch />} />
                <Route path="/join" element={<Join />} />
                <Route path="/settings/notifications" element={<SettingsNotifications />} />
                <Route path="/settings/profile" element={<SettingsProfile />} />
                <Route path="/settings/billing" element={<SettingsBilling />} />
                <Route path="/coaches" element={<Coaches />} />
                <Route path="/coaches/:id" element={<CoachProfile />} />
                <Route path="/coach/:id" element={<CoachProfile />} />
                <Route path="/coach/edit" element={<CoachEdit />} />
                <Route path="/coach/onboarding" element={<CoachOnboarding />} />
                <Route path="/me/bookings" element={<MyBookings />} />
                <Route path="/pro" element={<Pro />} />
              </Routes>
              </Suspense>
            </main>
            <EditorialFooter />
          </SeasonProvider>
          </FeatureFlagsProvider>
        </SuperuserProvider>
      </AdminProvider>
      </SteamAuthProvider>
    </BrowserRouter>
  );
}
