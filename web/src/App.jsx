import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import SeasonSelector from './components/SeasonSelector';
import AdminLoginModal from './components/AdminLoginModal';
import SuperuserLoginModal from './components/SuperuserLoginModal';
import { SeasonProvider } from './context/SeasonContext';
import { AdminProvider, useAdmin } from './context/AdminContext';
import { SuperuserProvider, useSuperuser } from './context/SuperuserContext';
import { SteamAuthProvider, useSteamAuth } from './context/SteamAuthContext';
// v6.82 — useVoicePackEvents (post-match polling that fired win/loss/
// first-blood/achievement-unlock while the user might be tabbed into
// Dota) is intentionally not mounted anymore. Voice packs are now a
// lobby-only cosmetic; see web/src/lib/voicePack.js for the rationale.
// The hook file stays on disk for now in case we want to reuse the
// polling shape for a different in-website-only event class.
import { FeatureFlagsProvider, useFeatureFlag, useFeatureFlags } from './context/FeatureFlagsContext';
import WelcomeModal from './components/WelcomeModal';
import { WhyIsThisSafeLink } from './components/SteamTrustModal';
import OnboardingWizard from './components/OnboardingWizard';
import OnboardingNudge from './components/OnboardingNudge';
import { TourProvider, useTour } from './components/SpotlightTour';
import DiscordLinkModal from './components/DiscordLinkModal';
import DiscordRetryBanner from './components/DiscordRetryBanner';
import SideBanners from './components/SideBanner';
import { WatchLiveBadge } from './components/HomeWidgets';
import GlobalSearch from './components/CommandPalette';
import NotificationBell from './components/NotificationBell';
import { getLivePresenceCount } from './api';

const MatchList = lazy(() => import('./pages/MatchList'));
const MatchDetail = lazy(() => import('./pages/MatchDetail'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const PlayerProfile = lazy(() => import('./pages/PlayerProfile'));
const PlayerGrowth = lazy(() => import('./pages/PlayerGrowth'));
const Heroes = lazy(() => import('./pages/Heroes'));
const HeroDetail = lazy(() => import('./pages/HeroDetail'));
const Draft = lazy(() => import('./pages/Draft'));
const DraftAssistant = lazy(() => import('./pages/DraftAssistant'));
const DraftTrainer = lazy(() => import('./pages/DraftTrainer'));
const ProReplayBrowser = lazy(() => import('./pages/ProReplayBrowser'));

// Task #378 — runtime route gate. The Pro Replay Browser is gated by the
// `pro_replay_browser` feature flag (off → fully hidden, preview →
// superuser only, on → public). The API already 404s, but a SPA deep-
// link would still mount the page and surface an error toast — this
// guard redirects home instead so the surface is *invisible* in `off`.
function ProReplaysGuard() {
  const { flags, loading } = useFeatureFlags();
  // Hold the redirect until the resolved flag map has arrived. Without
  // this we'd briefly mount ProReplayBrowser during the initial flag
  // fetch (useFeatureFlag defaults unknown keys to true), defeating the
  // "fully invisible when off" intent.
  if (loading) return null;
  const enabled = Object.prototype.hasOwnProperty.call(flags, 'pro_replay_browser')
    ? Boolean(flags.pro_replay_browser)
    : true;
  if (!enabled) return <Navigate to="/" replace />;
  return <ProReplayBrowser />;
}
const Players = lazy(() => import('./pages/Players'));
const Lootbox = lazy(() => import('./pages/Lootbox'));
const Collection = lazy(() => import('./pages/Collection'));
const OverallStats = lazy(() => import('./pages/OverallStats'));
const PositionStats = lazy(() => import('./pages/PositionStats'));
const Synergy = lazy(() => import('./pages/Synergy'));
const Upload = lazy(() => import('./pages/Upload'));
const Seasons = lazy(() => import('./pages/Seasons'));
const BuyinSuccess = lazy(() => import('./pages/BuyinSuccess'));
const PlayerTools = lazy(() => import('./pages/PlayerTools'));
const H2H = lazy(() => import('./pages/H2H'));
// Task #442 — `/me/h2h/:other` shortcut resolves viewer → canonical
// `/h2h/:a/:b`. Named export from the same lazy chunk so we don't ship
// a second copy of the same module on first hit.
const H2HMeRedirectLazy = lazy(() =>
  import('./pages/H2H').then(m => ({ default: m.H2HMeRedirect }))
);
const Predictions = lazy(() => import('./pages/Predictions'));
const StatsEditor = lazy(() => import('./pages/StatsEditor'));
const PatchNotes = lazy(() => import('./pages/PatchNotes'));
const ChallengeDetail = lazy(() => import('./pages/ChallengeDetail'));
const ThisWeek = lazy(() => import('./pages/ThisWeek'));
const Pickem = lazy(() => import('./pages/Pickem'));
const SponsorshipInbox = lazy(() => import('./pages/SponsorshipInbox'));
const Sponsorships = lazy(() => import('./pages/Sponsorships'));
const Home = lazy(() => import('./pages/Home'));
const HowItWorks = lazy(() => import('./pages/HowItWorks'));
const MultiKills = lazy(() => import('./pages/MultiKills'));
const WardMap = lazy(() => import('./pages/WardMap'));
const Records = lazy(() => import('./pages/Records'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const AdminSpotlight = lazy(() => import('./pages/AdminSpotlight'));
const AdminOps = lazy(() => import('./pages/AdminOps'));
const AdminFeatureHealth = lazy(() => import('./pages/AdminFeatureHealth'));
const AdminBrowserSmoke = lazy(() => import('./pages/AdminBrowserSmoke'));
const AdminSmurfWatch = lazy(() => import('./pages/AdminSmurfWatch'));
const AdminSmokeTest = lazy(() => import('./pages/AdminSmokeTest'));
const AdminMatchInsights = lazy(() => import('./pages/AdminMatchInsights'));
const AdminSmokeTestRun = lazy(() => import('./pages/AdminSmokeTestRun'));
const DraftSandbox = lazy(() => import('./pages/DraftSandbox'));
const ProfileSandbox = lazy(() => import('./pages/ProfileSandbox'));
const CosmeticsShop = lazy(() => import('./pages/CosmeticsShop'));
const SeasonPass = lazy(() => import('./pages/SeasonPass'));
const Teams = lazy(() => import('./pages/Teams'));
const TeamCreate = lazy(() => import('./pages/TeamCreate'));
const TeamProfile = lazy(() => import('./pages/TeamProfile'));
const Leagues = lazy(() => import('./pages/Leagues'));
const LeagueProfile = lazy(() => import('./pages/LeagueProfile'));
const WrappedSlideshow = lazy(() => import('./pages/WrappedSlideshow'));
const Games = lazy(() => import('./pages/Games'));
const GamePlay = lazy(() => import('./pages/GamePlay'));
const ProfileDemo = lazy(() => import('./pages/ProfileDemo'));
const PudgeStats = lazy(() => import('./pages/PudgeStats'));
const Schedule = lazy(() => import('./pages/Schedule'));
const ReplayViewer = lazy(() => import('./pages/ReplayViewer'));
const Spectate = lazy(() => import('./pages/Spectate'));
// Task #379 — Streamer mode + OBS overlays. Three public overlay pages
// render in a fixed 1920×1080 transparent viewport with no site chrome
// so OBS browser sources drop them straight onto a stream.
const OverlayLive = lazy(() => import('./pages/OverlayLive'));
const OverlayScoreboard = lazy(() => import('./pages/OverlayScoreboard'));
const OverlayTicker = lazy(() => import('./pages/OverlayTicker'));
const Social = lazy(() => import('./pages/Social'));
const HallOfFame = lazy(() => import('./pages/HallOfFame'));
const PlayerBenchmarks = lazy(() => import('./pages/PlayerBenchmarks'));
const Tournaments = lazy(() => import('./pages/Tournaments'));
const WeekendTournament = lazy(() => import('./pages/WeekendTournament'));
const RecordMatch = lazy(() => import('./pages/RecordMatch'));
const Inhouse = lazy(() => import('./pages/Inhouse'));
const InhouseMarkets = lazy(() => import('./pages/InhouseMarkets'));
const PlayerInsights = lazy(() => import('./pages/PlayerInsights'));
const Join = lazy(() => import('./pages/Join'));
const SettingsNotifications = lazy(() => import('./pages/SettingsNotifications'));
const MeNotifications = lazy(() => import('./pages/MeNotifications'));
const SettingsProfile = lazy(() => import('./pages/SettingsProfile'));
const Pro = lazy(() => import('./pages/Pro'));
const SettingsBilling = lazy(() => import('./pages/SettingsBilling'));
const Settings = lazy(() => import('./pages/Settings'));
const SettingsAccount = lazy(() => import('./pages/SettingsAccount'));
const SettingsDangerZone = lazy(() => import('./pages/SettingsDangerZone'));
const SettingsApi = lazy(() => import('./pages/SettingsApi'));
const ApiDocs = lazy(() => import('./pages/ApiDocs'));
const Developers = lazy(() => import('./pages/Developers'));
const Coaches = lazy(() => import('./pages/Coaches'));
const CoachProfile = lazy(() => import('./pages/CoachProfile'));
const CoachEdit = lazy(() => import('./pages/CoachEdit'));
const CoachOnboarding = lazy(() => import('./pages/CoachOnboarding'));
const CoachPremium = lazy(() => import('./pages/CoachPremium'));
const MyBookings = lazy(() => import('./pages/MyBookings'));
const GroupSessions = lazy(() => import('./pages/GroupSessions'));
const MyGroupSessions = lazy(() => import('./pages/MyGroupSessions'));
const CoachGroupSessionsManage = lazy(() => import('./pages/CoachGroupSessionsManage'));
const VodReviewRequest = lazy(() => import('./pages/VodReviewRequest'));
const MyVodReviews = lazy(() => import('./pages/MyVodReviews'));
const VodReviewDetail = lazy(() => import('./pages/VodReviewDetail'));
const CoachEarnings = lazy(() => import('./pages/CoachEarnings'));
const SeasonSummary = lazy(() => import('./pages/SeasonSummary'));
const BuyCoins = lazy(() => import('./pages/BuyCoins'));

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
      tabIndex={0}
      role="button"
      aria-label={`System status: ${tooltip || 'No data'}`}
      aria-expanded={show}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') setShow(false); }}
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
      <span ref={wrapRef} data-tour="account" style={{ position: 'relative', display: 'inline-flex', marginLeft: 4 }}>
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
            <Link to="/settings" role="menuitem" style={itemStyle}
              onMouseEnter={(e) => onItemHover(e, true)} onMouseLeave={(e) => onItemHover(e, false)}>
              <span aria-hidden="true">⚙️</span> Settings
            </Link>
            <Link to="/settings/notifications" role="menuitem" style={itemStyle}
              onMouseEnter={(e) => onItemHover(e, true)} onMouseLeave={(e) => onItemHover(e, false)}>
              <span aria-hidden="true">🔔</span> Notifications
            </Link>
            <Link to="/settings/billing" role="menuitem" style={itemStyle}
              onMouseEnter={(e) => onItemHover(e, true)} onMouseLeave={(e) => onItemHover(e, false)}>
              <span aria-hidden="true">💳</span> Billing
            </Link>
            {accountId && (
              <Link to={`/player/${accountId}#matches`} role="menuitem" style={itemStyle}
                onMouseEnter={(e) => onItemHover(e, true)} onMouseLeave={(e) => onItemHover(e, false)}>
                <span aria-hidden="true">🎮</span> My matches
              </Link>
            )}
            {/* Task #443 — Personal Season Wrapped shortcut. /wrapped/me/latest
                resolves the viewer's most recent archived season server-side
                and redirects into the slideshow. */}
            {accountId && (
              <Link to="/wrapped/me/latest" role="menuitem" style={itemStyle}
                onMouseEnter={(e) => onItemHover(e, true)} onMouseLeave={(e) => onItemHover(e, false)}>
                <span aria-hidden="true">🎁</span> Season Wrapped
              </Link>
            )}
            {/* Task #442 — Quick entry point to the H2H page. Hands the
                viewer off to the Compare-vs picker on their own profile
                (the picker on PlayerProfile.jsx routes to /h2h/<me>/<picked>
                which is the canonical `/me/h2h/:other` destination). */}
            {accountId && (
              <Link to={`/player/${accountId}?compare=1`} role="menuitem" style={itemStyle}
                onMouseEnter={(e) => onItemHover(e, true)} onMouseLeave={(e) => onItemHover(e, false)}>
                <span aria-hidden="true">⚔️</span> Compare H2H vs…
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
    <span data-tour="account" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
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

function DropdownMenu({ label, children, badge, dataTour }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location]);
  const handleBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
  };
  return (
    <span
      data-tour={dataTour}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={handleBlur}
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
    >
      <span
        className="nav-link"
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        {label}
        {badge}
        <span style={{ fontSize: 9, opacity: 0.6 }}>▼</span>
      </span>
      {open && (
        <div role="menu" style={{
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

function DropdownItem({ to, onClick, children }) {
  const sharedStyle = {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '7px 16px', fontSize: 13,
    color: 'var(--text-primary)', textDecoration: 'none',
    background: 'transparent', border: 'none', cursor: 'pointer',
  };
  const onEnter = e => e.currentTarget.style.background = 'var(--bg-hover)';
  const onLeave = e => e.currentTarget.style.background = 'transparent';
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={sharedStyle}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        {children}
      </button>
    );
  }
  return (
    <Link
      to={to}
      style={sharedStyle}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
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

// Task #227 — "Players" nav link with a small "Live now" pulse-dot + count
// badge. Polls the cheap /api/presence/live/count endpoint every 30s while
// the tab is visible, mirroring the per-profile chip's polling shape. The
// link itself deep-links into the Live now tab via ?tab=live so visitors
// land directly on the spectator hook from anywhere on the site.
function useLivePresenceCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      getLivePresenceCount()
        .then(d => { if (!cancelled) setCount(Number(d?.count) || 0); })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return count;
}

// Task #248 — mobile-only twin of the desktop NavPlayersLink badge.
// `.nav-links` (which hosts NavPlayersLink) wraps to a full-width row
// below the brand on narrow screens, so on phones the badge falls below
// the fold and stops working as a spectator hook. This pill lives in the
// always-visible top row of the navbar and is shown only on viewports
// where the nav wraps (see `.nav-live-mobile` in styles.css). When zero
// players are live we render nothing so the navbar stays compact.
function MobileLiveBadge({ count }) {
  if (count <= 0) return null;
  return (
    <Link
      to="/players?tab=live"
      className="nav-live-mobile"
      aria-label={`${count} player${count === 1 ? '' : 's'} live now — view spectators`}
      title={`${count} player${count === 1 ? '' : 's'} live now`}
      style={{
        display: 'none',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px 3px 7px',
        borderRadius: 999,
        background: 'rgba(34,197,94,0.14)',
        border: '1px solid rgba(34,197,94,0.45)',
        color: '#22c55e',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.2,
        textDecoration: 'none',
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: '#22c55e',
          boxShadow: '0 0 0 0 rgba(34,197,94,0.7)',
          animation: 'oi-live-pulse 1.6s ease-out infinite',
        }}
      />
      <span>{count} live</span>
    </Link>
  );
}

// Task #313 / v6.79 — Coin balance pill in the navbar. Polls /api/coins/me
// once on sign-in + every 60s so a freshly-recorded match bumps the balance
// without a hard reload. Hidden when signed-out. Links to /shop so a click
// is the shortcut into the spend surface.
function NavCoinPill({ accountId }) {
  const [balance, setBalance] = React.useState(null);
  React.useEffect(() => {
    if (!accountId) { setBalance(null); return undefined; }
    let alive = true;
    const load = () => {
      fetch('/api/coins/me', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (alive && d) setBalance(Number(d.balance) || 0); })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [accountId]);
  if (!accountId || balance === null) return null;
  return (
    <Link
      to="/shop"
      title={`Coin balance — earn by playing inhouses, spend in the cosmetics shop`}
      aria-label={`Coin balance: ${balance}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 999,
        background: 'rgba(245,158,11,0.14)',
        border: '1px solid rgba(245,158,11,0.5)',
        color: '#fbbf24', fontSize: 12, fontWeight: 700,
        textDecoration: 'none', lineHeight: 1.2,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 13 }}>🪙</span>
      {balance.toLocaleString()}
    </Link>
  );
}

// Task #629 — compact live-now pulse badge shown on the "Community" hub
// label (which now hosts the Players link) so the desktop live-player signal
// survives the nav consolidation without a standalone top-level link.
function NavLivePulse({ count }) {
  if (!count || count <= 0) return null;
  return (
    <span
      aria-hidden="true"
      title={`${count} player${count === 1 ? '' : 's'} live now`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '1px 6px 1px 5px', borderRadius: 999,
        background: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.45)',
        color: '#22c55e', fontSize: 11, fontWeight: 700, lineHeight: 1.2,
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: '#22c55e',
        boxShadow: '0 0 0 0 rgba(34,197,94,0.7)', animation: 'oi-live-pulse 1.6s ease-out infinite',
      }} />
      {count}
    </span>
  );
}

// Task #656 — Help hub in the main nav. Hosts the public How-It-Works guide
// link and a manual "Take the tour" trigger so the interactive spotlight tour
// is always re-launchable for guests and signed-in users alike.
function NavHelpMenu() {
  const { startTour } = useTour() || {};
  return (
    <DropdownMenu label="Help" dataTour="nav-guide">
      <DropdownItem to="/how-it-works">How it works</DropdownItem>
      <DropdownItem onClick={() => startTour && startTour()}>Take the tour</DropdownItem>
      <DropdownItem to="/patch-notes">Patch Notes</DropdownItem>
    </DropdownMenu>
  );
}

function Nav() {
  const location = useLocation();
  const isActive = (path) => location.pathname === path ? 'nav-link active' : 'nav-link';
  // v6.62 / Task #206 — gate the Cosmetics Shop link on signed-in viewers.
  const { steamUser } = useSteamAuth();
  const accountId = steamUser?.accountId;
  // Task #378 — Pro Replay Browser feature flag. Server resolves `off` →
  // false for everyone, `preview` → true only for superusers, `on` → true
  // for all viewers. Hiding the nav link when false makes the "surface
  // fully hidden" intent match what the API already enforces.
  const showProReplays = useFeatureFlag('pro_replay_browser');
  // Task #248 — single shared poller for both the desktop NavPlayersLink
  // badge and the mobile-only MobileLiveBadge so we don't fire two
  // /api/presence/live/count requests every 30s.
  const liveCount = useLivePresenceCount();

  return (
    <nav className="navbar">
      <Link to="/" className="nav-brand" data-tour="nav-home">
        <img src="/oa-logo.png" alt="OA" className="brand-logo" />
        <span className="brand-lockup">
          <span className="brand-lockup-top">OCE</span>
          <span className="brand-lockup-bot">INHOUSE</span>
        </span>
      </Link>
      {/* Task #248 — mobile-only live-now pill, sits in the always-visible
          top row of the navbar so phone visitors get the spectator hook
          without expanding the wrapped nav. Hidden on desktop via CSS,
          where the same signal already rides on the Players nav link. */}
      <MobileLiveBadge count={liveCount} />
      {/* Task #346 — site-wide 'Watch live' pill. Polls the same
          /api/inhouse/live-spectate probe as the home-page widget and
          auto-hides when nothing is live, so visitors on /heroes,
          /leaderboard, a player profile, etc. can still jump straight
          into the spectator stream without bouncing back to home. */}
      <WatchLiveBadge variant="nav" />
      {/* Task #313 / v6.79 — coin balance pill, signed-in only. */}
      <NavCoinPill accountId={accountId} />
      {/* Task #629 — consolidated hub navigation. The previous flat list of
          nine top-level links plus a 16-item catch-all "More" dropdown buried
          most of the site (ward maps, benchmarks, pick'em, wrapped, draft
          trainer, multi-kills, hall of fame, player tools were all but
          unreachable from the menu). The surface is now grouped into a few
          clear hubs — Stats, Heroes & Draft, Play, Community — with the two
          highest-traffic destinations (Leaderboard, Matches) kept as direct
          links. */}
      <div className="nav-links">
        <Link to="/" className={isActive('/')}>Home</Link>
        <Link to="/leaderboard" className={isActive('/leaderboard')} data-tour="nav-leaderboard">Leaderboard</Link>
        <Link to="/matches" className={isActive('/matches')}>Matches</Link>
        <DropdownMenu label="Stats">
          <DropdownItem to="/stats">Player Stats</DropdownItem>
          <DropdownItem to="/positions">Positions</DropdownItem>
          <DropdownItem to="/this-week">This Week</DropdownItem>
          <DropdownItem to="/records">Records &amp; Hall of Fame</DropdownItem>
          <DropdownItem to="/benchmarks">Benchmarks</DropdownItem>
          <DropdownItem to="/player-tools">Head-to-Head &amp; Compare</DropdownItem>
          <DropdownItem to="/predictions">Predictions</DropdownItem>
          <DropdownItem to="/upload">Upload Replay</DropdownItem>
        </DropdownMenu>
        <DropdownMenu label="Heroes &amp; Draft">
          <DropdownItem to="/heroes">Heroes</DropdownItem>
          <DropdownItem to="/synergy">Synergy</DropdownItem>
          <DropdownItem to="/draft">Draft &amp; Assistant</DropdownItem>
          <DropdownItem to="/heroes/draft-trainer">Draft Trainer</DropdownItem>
          <DropdownItem to="/ward-map">Ward Maps</DropdownItem>
          <DropdownItem to="/multikills">Multi-Kills</DropdownItem>
          <DropdownItem to="/pudge-stats">Pudge Hook Stats</DropdownItem>
          {showProReplays && <DropdownItem to="/pro-replays">Pro Replay Browser</DropdownItem>}
        </DropdownMenu>
        <DropdownMenu label="Play" dataTour="nav-play">
          <DropdownItem to="/inhouse">Inhouse Lobby</DropdownItem>
          <DropdownItem to="/tournaments">Tournaments</DropdownItem>
          <DropdownItem to="/leagues">Leagues</DropdownItem>
          <DropdownItem to="/teams">Teams</DropdownItem>
          <DropdownItem to="/schedule">Game Schedule</DropdownItem>
          <DropdownItem to="/games">Daily Mini-Games</DropdownItem>
          <DropdownItem to="/pickem">Pick&apos;em</DropdownItem>
          <DropdownItem to="/join">Join the League</DropdownItem>
        </DropdownMenu>
        <DropdownMenu label="Community" badge={<NavLivePulse count={liveCount} />}>
          <DropdownItem to={liveCount > 0 ? '/players?tab=live' : '/players'}>
            {liveCount > 0 ? `Players · ${liveCount} live` : 'Players'}
          </DropdownItem>
          <DropdownItem to="/coaches">Coaching Marketplace</DropdownItem>
          <DropdownItem to="/sponsorships">Sponsor a Slot</DropdownItem>
          <DropdownItem to="/social">Social Feed</DropdownItem>
          <DropdownItem to="/patch-notes">Patch Notes</DropdownItem>
          {/* Task #443 — personal Season Wrapped; signed-in only. */}
          {accountId && <DropdownItem to="/wrapped/me/latest">Season Wrapped</DropdownItem>}
          {/* v6.62 / Task #206 — only signed-in players need the cosmetics shop;
              anonymous viewers can't apply anything yet. The /pro CTA in the
              nav bar covers their upgrade path. */}
          {accountId && <DropdownItem to="/shop">Cosmetics Shop</DropdownItem>}
          {/* Task #664 — coin-purchased lootboxes + collection locker
              (full edition only; signed-in players only). */}
          {accountId && <DropdownItem to="/lootbox">Lootboxes</DropdownItem>}
          {accountId && <DropdownItem to="/collection">My Collection</DropdownItem>}
        </DropdownMenu>
        <NavHelpMenu />
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
      <GlobalSearch />
      <SeasonSelector />
      <ThemeToggle />
      <NotificationBell />
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
  // v6.25 — derive the footer version label from the live patch-notes API so
  // it always reflects whatever the most recent published patch note is. The
  // previous implementation hardcoded "v5.85" and silently fell out of sync
  // every time a new note shipped. /api/patch-notes returns rows already
  // sorted (major DESC, minor DESC) by the DB, so the first entry is the
  // newest. Render an em-dash placeholder while the request is in flight or
  // if it fails — never block the page on this lookup.
  const [version, setVersion] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/patch-notes')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const v = d && Array.isArray(d.patchNotes) && d.patchNotes[0]?.version;
        if (v) setVersion(v);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return (
    <footer className="oa-footer">
      <div className="oa-footer-inner">
        <div className="oa-footer-brand">
          <img src="/oa-logo.png" alt="OA" />
          <span>© {new Date().getFullYear()} OCE Inhouse</span>
        </div>
        <div className="oa-footer-links">
          <span className="oa-footer-version">
            {version ? `v${version}` : '—'} — <Link to="/patch-notes">Patch notes</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

// Task #151 (v6.26) — surfaces the long-running "?auth=success but
// signed out" regression to the user instead of leaving them silently
// signed-out. Fires a one-time POST /api/auth/diagnose so prod logs
// capture the exact host/cookie/session state from the failing browser,
// then renders a small retry banner. Self-clears once the user is
// signed in or navigates away. Strictly read-only — does not block the
// page or change any other UI.
function SignInRetryBanner() {
  const { steamUser, loading, refreshMe, applyUser } = useSteamAuth();
  const location = useLocation();
  const [show, setShow] = useState(false);
  const diagnoseFiredRef = React.useRef(false);
  // Guards so the token exchange and retry sweep each run at most once.
  const tokenExchangedRef = React.useRef(false);
  const selfHealRef = React.useRef(false);

  useEffect(() => {
    if (loading) { setShow(false); return; }
    const params = new URLSearchParams(location.search);
    if (params.get('auth') !== 'success') { setShow(false); return; }
    if (steamUser && steamUser.accountId) { setShow(false); return; }

    // v7.12 — Auth-token handshake.  The server now embeds a short-lived
    // single-use token in the ?t= query param.  Exchange it via a same-origin
    // fetch so the Set-Cookie in the RESPONSE (not a redirect header) is
    // guaranteed to be applied by every browser, regardless of SameSite/Secure
    // policy.  This replaces the retry-sweep approach for new logins.
    const token = params.get('t');
    if (token && !tokenExchangedRef.current) {
      tokenExchangedRef.current = true;
      // Strip the auth/token params from the URL immediately so they don't
      // persist on refresh or linger in browser history.
      const clean = new URLSearchParams(params);
      clean.delete('auth');
      clean.delete('t');
      const cleanSearch = clean.toString() ? `?${clean.toString()}` : '';
      window.history.replaceState(null, '', window.location.pathname + cleanSearch);
      let cancelled = false;
      (async () => {
        try {
          const r = await fetch(`/api/auth/complete?t=${encodeURIComponent(token)}`, {
            credentials: 'include',
            cache: 'no-store',
          });
          if (cancelled) return;
          if (r.ok) {
            // v7.16 — The token-exchange response IS the user payload.
            // Apply it inline so the UI flips to "signed in" immediately,
            // without waiting for /api/auth/me to round-trip through the
            // freshly-set Set-Cookie. This kills the entire class of
            // "signed in on the server but the SPA still shows logged-out"
            // bugs in one shot — cookie propagation lag, intermediary
            // proxies stripping Set-Cookie, browser extensions blocking
            // third-party-looking cookies, all become cosmetic instead of
            // user-visible. The cookie is still set on this very response,
            // so subsequent page reloads keep the user signed in normally.
            try {
              const body = await r.json();
              if (!cancelled && applyUser(body)) { setShow(false); return; }
            } catch { /* malformed body, fall through to retry sweep */ }
          }
        } catch { /* fall through to retry sweep */ }
        if (!cancelled) startRetrySweep();
      })();
      return () => { cancelled = true; };
    }

    // Fallback retry sweep (no token present — old login in progress, or token
    // already consumed on a previous render).
    if (!selfHealRef.current) {
      selfHealRef.current = true;
      const delays = [300, 900, 2000, 4000];
      let cancelled = false;
      (async () => {
        for (const d of delays) {
          await new Promise(r => setTimeout(r, d));
          if (cancelled) return;
          try {
            const user = await refreshMe();
            if (user && user.accountId) { setShow(false); return; }
          } catch { /* keep retrying */ }
        }
        if (!cancelled) surfaceBanner();
      })();
      return () => { cancelled = true; };
    }
    surfaceBanner();

    function startRetrySweep() {
      if (selfHealRef.current) return;
      selfHealRef.current = true;
      const delays = [500, 1500, 3000];
      (async () => {
        for (const d of delays) {
          await new Promise(r => setTimeout(r, d));
          try {
            const user = await refreshMe();
            if (user && user.accountId) { setShow(false); return; }
          } catch { /* keep retrying */ }
        }
        surfaceBanner();
      })();
    }

    function surfaceBanner() {
      setShow(true);
      if (!diagnoseFiredRef.current) {
        diagnoseFiredRef.current = true;
        fetch('/api/auth/diagnose', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ at: new Date().toISOString() }),
        }).catch(() => {});
      }
    }
  }, [loading, steamUser, location.search, refreshMe]);

  if (!show) return null;
  return (
    <div
      role="status"
      style={{
        background: 'var(--bg-card, #152036)',
        borderBottom: '1px solid var(--brass, #c5a975)',
        color: 'var(--text-primary, #f5efe2)',
        padding: '10px 16px',
        fontSize: 13,
        textAlign: 'center',
      }}
    >
      Steam confirmed your sign-in but the session didn't stick.{' '}
      <a
        href="/auth/steam"
        style={{ color: 'var(--amber, #f59e0b)', fontWeight: 600, textDecoration: 'underline' }}
      >
        Try once more
      </a>
      , or contact an admin if it keeps happening.
    </div>
  );
}

// Task #317 — first-visit shows the wizard; once dismissed, a non-blocking
// nudge banner replaces it until the user finishes the tour. The nudge's
// "Resume tour" button re-opens the wizard at the persisted step index.
//
// Returning incomplete users get ONLY the nudge — never the auto-modal —
// per spec ("gentle nudge for returners"). We detect a returner via:
//   1. localStorage flag `onboarding_modal_seen` set on first auto-show, OR
//   2. server-side `onboarding_step_index > 0` (they navigated past welcome
//      on a prior visit, which is server-truth and survives a cleared
//      localStorage / new device).
function GlobalOnboardingWizard() {
  const { onboardingComplete, setOnboardingComplete, steamUser } = useSteamAuth();
  const [open, setOpen] = React.useState(false);
  const [resumeAt, setResumeAt] = React.useState(0);
  const [autoShown, setAutoShown] = React.useState(false);

  React.useEffect(() => {
    if (onboardingComplete !== false || !steamUser?.accountId || autoShown) return;
    setAutoShown(true);
    let modalSeen = false;
    try { modalSeen = !!localStorage.getItem('onboarding_modal_seen'); } catch {}

    // Explicit replay-from-Settings override: ?onboarding=1 force-opens the
    // wizard at step 1 regardless of returner heuristics. Strip the param
    // after honouring it so a back-button doesn't re-trigger.
    let forced = false;
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('onboarding') === '1') {
        forced = true;
        sp.delete('onboarding');
        const next = window.location.pathname + (sp.toString() ? '?' + sp.toString() : '') + window.location.hash;
        window.history.replaceState({}, '', next);
      }
    } catch {}

    fetch('/api/me/home', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const idx = (d && Number.isFinite(d.onboarding_step_index)) ? d.onboarding_step_index : 0;
        setResumeAt(forced ? 0 : idx);
        const isReturner = modalSeen || idx > 0;
        if (forced || !isReturner) {
          try { localStorage.setItem('onboarding_modal_seen', '1'); } catch {}
          setOpen(true);
        }
      })
      .catch(() => {
        if (forced || !modalSeen) {
          try { localStorage.setItem('onboarding_modal_seen', '1'); } catch {}
          setOpen(true);
        }
      });
  }, [onboardingComplete, steamUser?.accountId, autoShown]);

  const openWizard = React.useCallback(() => {
    fetch('/api/me/home', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const idx = (d && Number.isFinite(d.onboarding_step_index)) ? d.onboarding_step_index : 0;
        setResumeAt(idx);
        setOpen(true);
      })
      .catch(() => setOpen(true));
  }, []);

  return (
    <>
      <OnboardingNudge onResume={openWizard} />
      {open && onboardingComplete === false && (
        <OnboardingWizard
          initialStep={resumeAt}
          onComplete={() => { setOpen(false); setOnboardingComplete(true); }}
          onDismiss={() => { setOpen(false); }}
        />
      )}
    </>
  );
}

// Task #217 — drives win/loss, first-blood, and achievement-unlock voice
// pack mp3s for the signed-in user from anywhere on the site (the
// inhouse-only useInhouseAlerts hook stays mounted on /inhouse for the
// accept/captain/your-pick/match-ready cues).
function GlobalVoicePackEvents() {
  // v6.82 — gutted. The post-match polling that mounted here (win/loss/
  // first-blood/achievement-unlock via useVoicePackEvents) is gone:
  // voice packs are now strictly lobby alerts handled by useInhouseAlerts
  // on /inhouse. The component itself is still mounted from App so it
  // can be revived for a future in-website-only event class (e.g. friend
  // online, achievement toast) without re-threading provider context.
  return null;
}

// Sets --nav-h on :root whenever the .navbar changes height so CSS
// consumers (e.g. .v3-sticky { top: var(--nav-h, 52px) }) always have
// the correct value without a hardcoded pixel guess.
function NavbarHeightSync() {
  React.useEffect(() => {
    const nav = document.querySelector('.navbar');
    if (!nav) return undefined;
    const update = () =>
      document.documentElement.style.setProperty('--nav-h', nav.offsetHeight + 'px');
    update();
    const ro = new ResizeObserver(update);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);
  return null;
}

// Task #379 — Streamer mode + OBS overlays.
// When the URL path begins with `/overlay/` (the three OBS browser-source
// routes) OR carries `?streamer=1` (chrome-stripper for any other page a
// streamer wants to capture clean), we hide every piece of site chrome
// — nav, footer, side banners, modals, login bars — and add a body class
// that flips the background to transparent so OBS can composite the page
// over their gameplay layer without any window-coloured fringe.
function useStreamerMode() {
  const location = useLocation();
  const isOverlayRoute = location.pathname.startsWith('/overlay/');
  const streamerQuery = new URLSearchParams(location.search).get('streamer') === '1';
  const isStreamer = isOverlayRoute || streamerQuery;
  React.useEffect(() => {
    const body = document.body;
    if (!body) return undefined;
    if (isStreamer) body.classList.add('streamer-mode');
    else body.classList.remove('streamer-mode');
    if (isOverlayRoute) body.classList.add('overlay-mode');
    else body.classList.remove('overlay-mode');
    return () => {
      body.classList.remove('streamer-mode');
      body.classList.remove('overlay-mode');
    };
  }, [isStreamer, isOverlayRoute]);
  return { isStreamer, isOverlayRoute };
}

// Matches the various browser phrasings for "a lazy-loaded JS chunk failed to
// load". This is the classic post-deploy symptom: a tab opened before a deploy
// still references the old hashed chunk filenames, which 404 once the new build
// replaces them — so navigating to a lazy route rejects its dynamic import.
const CHUNK_LOAD_ERROR_RE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed/i;

function isChunkLoadError(error) {
  const msg = String((error && (error.message || error)) || '');
  return CHUNK_LOAD_ERROR_RE.test(msg);
}

// Root error boundary around the routed content. Without this, any render error
// — and in particular a stale-chunk dynamic-import failure after a deploy —
// would throw past Suspense and blank the entire page (React unmounts the whole
// tree when an uncaught error reaches the root). The <Nav> lives OUTSIDE this
// boundary, so even on an error the user keeps a working navbar to click away
// with. On a chunk-load error we hard-reload exactly once (guarded against a
// reload loop) to pick up the fresh index.html + current chunk hashes.
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, isChunk: false, prevKey: props.resetKey };
  }

  static getDerivedStateFromProps(props, state) {
    // A navigation (pathname change) clears any prior error so the next route
    // gets a clean attempt — the user clicking a nav link should recover.
    if (props.resetKey !== state.prevKey) {
      return { error: null, isChunk: false, reloadSuppressed: false, prevKey: props.resetKey };
    }
    return null;
  }

  static getDerivedStateFromError(error) {
    return { error, isChunk: isChunkLoadError(error) };
  }

  componentDidCatch(error) {
    if (!isChunkLoadError(error)) return;
    // One-shot reload guard: if a reload somehow lands back in the same broken
    // state within the window, fall through to the visible fallback instead of
    // looping. sessionStorage is per-tab so a genuine later deploy still heals.
    const KEY = 'oi-chunk-reload-at';
    let last = 0;
    try { last = Number(sessionStorage.getItem(KEY) || 0); } catch { /* ignore */ }
    if (!last || Date.now() - last > 15000) {
      try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
      window.location.reload();
    } else {
      // A reload already happened seconds ago and we're still broken — stop
      // looping and show the actionable fallback instead of "Updating…" forever.
      this.setState({ reloadSuppressed: true });
    }
  }

  render() {
    if (this.state.error) {
      if (this.state.isChunk && !this.state.reloadSuppressed) {
        // Reload is in flight; show a calm interim message rather than a stack
        // trace or a blank screen.
        return <div className="loading">Updating to the latest version…</div>;
      }
      return (
        <div style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center', padding: '0 16px' }}>
          <h2 className="pb-serif" style={{ marginBottom: 8 }}>Something went wrong on this page</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
            This part of the site hit an unexpected error. Reloading usually fixes it.
          </p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppShell() {
  const { isStreamer, isOverlayRoute } = useStreamerMode();
  const location = useLocation();
  return (
    <>
      {!isStreamer && <NavbarHeightSync />}
      {!isStreamer && <BroadcastTicker />}
      {!isStreamer && <Nav />}
      {!isStreamer && <AdminLoginModal />}
      {!isStreamer && <SuperuserLoginModal />}
      {!isStreamer && <WelcomeModal />}
      {!isStreamer && <GlobalOnboardingWizard />}
      {!isStreamer && <GlobalVoicePackEvents />}
      {!isStreamer && <DiscordLinkModal />}
      {!isStreamer && <DiscordRetryBanner />}
      {!isStreamer && <SignInRetryBanner />}
      {!isStreamer && <SideBanners />}
      <main className={isOverlayRoute ? 'overlay-main' : 'container'}>
        <RootErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={isStreamer ? null : <div className="loading">Loading…</div>}>
            <Routes>
              <Route path="/overlay/live/:lobbyId" element={<OverlayLive />} />
              <Route path="/overlay/scoreboard/:matchId" element={<OverlayScoreboard />} />
              <Route path="/overlay/ticker/:accountId" element={<OverlayTicker />} />
              <Route path="/*" element={<AppRoutes />} />
            </Routes>
          </Suspense>
        </RootErrorBoundary>
      </main>
      {!isStreamer && <EditorialFooter />}
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/how-it-works" element={<HowItWorks />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/matches" element={<MatchList />} />
                <Route path="/this-week" element={<ThisWeek />} />
                <Route path="/match/:matchId" element={<MatchDetail />} />
                <Route path="/match/:matchId/edit" element={<StatsEditor />} />
                <Route path="/player/:accountId" element={<PlayerProfile />} />
                <Route path="/player/:accountId/growth" element={<PlayerGrowth />} />
                <Route path="/wrapped/me/latest" element={<WrappedSlideshow resolveLatest />} />
                <Route path="/wrapped/:seasonId/:accountId" element={<WrappedSlideshow />} />
                <Route path="/wrapped/:accountId" element={<WrappedSlideshow />} />
                <Route path="/heroes" element={<Heroes />} />
                <Route path="/games" element={<Games />} />
                <Route path="/games/:game" element={<GamePlay />} />
                <Route path="/players" element={<Players />} />
                <Route path="/lootbox" element={<Lootbox />} />
                <Route path="/collection" element={<Collection />} />
                <Route path="/stats" element={<OverallStats />} />
                <Route path="/positions" element={<PositionStats />} />
                <Route path="/synergy" element={<Synergy />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/seasons" element={<Seasons />} />
                <Route path="/seasons/:id/summary" element={<SeasonSummary />} />
                <Route path="/buyin-success" element={<BuyinSuccess />} />
                <Route path="/player-tools" element={<PlayerTools />} />
                <Route path="/head-to-head" element={<PlayerTools />} />
                {/* Task #442 — Detailed H2H page + viewer shortcut. */}
                <Route path="/h2h/:playerA/:playerB" element={<H2H />} />
                <Route path="/me/h2h/:other" element={<H2HMeRedirectLazy />} />
                <Route path="/compare" element={<PlayerTools />} />
                <Route path="/draft" element={<Draft />} />
                <Route path="/draft-assistant" element={<DraftAssistant />} />
                <Route path="/heroes/draft-trainer" element={<DraftTrainer />} />
                <Route path="/heroes/:heroId" element={<HeroDetail />} />
                <Route path="/pro-replays" element={<ProReplaysGuard />} />
                <Route path="/draft-stats" element={<Draft />} />
                <Route path="/hero-breakdown" element={<Heroes defaultTab="breakdown" />} />
                <Route path="/hero-position-meta" element={<Heroes defaultTab="meta" />} />
                <Route path="/position-player-profiles" element={<PositionStats defaultTab="profiles" />} />
                <Route path="/predictions" element={<Predictions />} />
                <Route path="/patch-notes" element={<PatchNotes />} />
                <Route path="/challenges/:id" element={<ChallengeDetail />} />
                <Route path="/pickem" element={<Pickem />} />
                <Route path="/coins/buy" element={<BuyCoins />} />
                <Route path="/sponsorships/inbox" element={<SponsorshipInbox />} />
                <Route path="/sponsorships" element={<Sponsorships />} />
                <Route path="/multikills" element={<MultiKills />} />
                <Route path="/ward-map" element={<WardMap />} />
                <Route path="/records" element={<Records />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/admin/spotlight" element={<AdminSpotlight />} />
                <Route path="/admin/ops" element={<AdminOps />} />
                <Route path="/admin/feature-health" element={<AdminFeatureHealth />} />
                <Route path="/admin/browser-smoke" element={<AdminBrowserSmoke />} />
                <Route path="/admin/browser-smoke/:id" element={<AdminBrowserSmoke />} />
                <Route path="/admin/smurf-watch" element={<AdminSmurfWatch />} />
                <Route path="/admin/smoke-test" element={<AdminSmokeTest />} />
                <Route path="/admin/smoke-test/:id" element={<AdminSmokeTestRun />} />
                <Route path="/admin/match-insights" element={<AdminMatchInsights />} />
                <Route path="/admin/match-insights/:matchId" element={<AdminMatchInsights />} />
                <Route path="/admin/draft-sandbox" element={<DraftSandbox />} />
                <Route path="/admin/profile-sandbox" element={<ProfileSandbox />} />
                <Route path="/admin/profile-demo" element={<ProfileDemo />} />
                <Route path="/pudge-stats" element={<PudgeStats />} />
                <Route path="/schedule" element={<Schedule />} />
                <Route path="/inhouse" element={<Inhouse />} />
                <Route path="/inhouse/:matchId/markets" element={<InhouseMarkets />} />
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
                <Route path="/me/notifications" element={<MeNotifications />} />
                <Route path="/settings" element={<Settings />}>
                  <Route path="profile" element={<SettingsProfile />} />
                  <Route path="notifications" element={<SettingsNotifications />} />
                  <Route path="account" element={<SettingsAccount />} />
                  <Route path="billing" element={<SettingsBilling />} />
                  <Route path="coaching" element={<CoachEdit />} />
                  <Route path="api" element={<SettingsApi />} />
                  <Route path="danger-zone" element={<SettingsDangerZone />} />
                </Route>
                <Route path="/api-docs" element={<ApiDocs />} />
                <Route path="/developers" element={<Developers />} />
                <Route path="/coaches" element={<Coaches />} />
                <Route path="/coaches/:id" element={<CoachProfile />} />
                <Route path="/coach/:id" element={<CoachProfile />} />
                <Route path="/coach/edit" element={<CoachEdit />} />
                <Route path="/coach/onboarding" element={<CoachOnboarding />} />
                <Route path="/coach/premium" element={<CoachPremium />} />
                <Route path="/me/bookings" element={<MyBookings />} />
                <Route path="/group-sessions" element={<GroupSessions />} />
                <Route path="/me/coaching/group" element={<MyGroupSessions />} />
                <Route path="/coach/group-sessions" element={<CoachGroupSessionsManage />} />
                <Route path="/coaches/:id/vod-review" element={<VodReviewRequest />} />
                <Route path="/me/coaching/vod" element={<MyVodReviews />} />
                <Route path="/vod-reviews/:id" element={<VodReviewDetail />} />
                <Route path="/coach/earnings" element={<CoachEarnings />} />
                <Route path="/pro" element={<Pro />} />
                <Route path="/shop" element={<CosmeticsShop />} />
                <Route path="/season-pass" element={<SeasonPass />} />
                <Route path="/teams" element={<Teams />} />
                <Route path="/teams/new" element={<TeamCreate />} />
                <Route path="/teams/:id" element={<TeamProfile />} />
                <Route path="/leagues" element={<Leagues />} />
                <Route path="/leagues/:id" element={<LeagueProfile />} />
                <Route path="/replay/:matchId" element={<ReplayViewer />} />
                <Route path="/spectate/:matchId" element={<Spectate />} />
    </Routes>
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
            <TourProvider>
              <AppShell />
            </TourProvider>
          </SeasonProvider>
          </FeatureFlagsProvider>
        </SuperuserProvider>
      </AdminProvider>
      </SteamAuthProvider>
    </BrowserRouter>
  );
}
