import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import MatchList from './pages/MatchList';
import MatchDetail from './pages/MatchDetail';
import Leaderboard from './pages/Leaderboard';
import PlayerProfile from './pages/PlayerProfile';
import Heroes from './pages/Heroes';
import HeroBreakdown from './pages/HeroBreakdown';
import Players from './pages/Players';
import OverallStats from './pages/OverallStats';
import PositionStats from './pages/PositionStats';
import Synergy from './pages/Synergy';
import Upload from './pages/Upload';
import Seasons from './pages/Seasons';
import UploadIndicator from './components/UploadIndicator';
import SeasonSelector from './components/SeasonSelector';
import AdminLoginModal from './components/AdminLoginModal';
import { SeasonProvider } from './context/SeasonContext';
import { AdminProvider, useAdmin } from './context/AdminContext';

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

function Nav() {
  const location = useLocation();
  const isActive = (path) => location.pathname === path ? 'nav-link active' : 'nav-link';

  return (
    <nav className="navbar">
      <Link to="/" className="nav-brand">
        <span className="brand-icon">&#9876;</span> Inhouse Stats
      </Link>
      <div className="nav-links">
        <Link to="/" className={isActive('/')}>Leaderboard</Link>
        <Link to="/stats" className={isActive('/stats')}>Stats</Link>
        <Link to="/positions" className={isActive('/positions')}>Positions</Link>
        <Link to="/heroes" className={isActive('/heroes')}>Heroes</Link>
        <Link to="/hero-breakdown" className={isActive('/hero-breakdown')}>Hero Breakdown</Link>
        <Link to="/synergy" className={isActive('/synergy')}>Synergy</Link>
        <Link to="/players" className={isActive('/players')}>Players</Link>
        <Link to="/matches" className={isActive('/matches')}>Matches</Link>
        <Link to="/upload" className={isActive('/upload')}>Upload</Link>
        <Link to="/seasons" className={isActive('/seasons')}>Seasons</Link>
      </div>
      <SeasonSelector />
      <AdminButton />
      <HealthDot />
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AdminProvider>
        <SeasonProvider>
          <Nav />
          <AdminLoginModal />
          <UploadIndicator />
          <main className="container">
            <Routes>
              <Route path="/" element={<Leaderboard />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/matches" element={<MatchList />} />
              <Route path="/match/:matchId" element={<MatchDetail />} />
              <Route path="/player/:accountId" element={<PlayerProfile />} />
              <Route path="/heroes" element={<Heroes />} />
              <Route path="/hero-breakdown" element={<HeroBreakdown />} />
              <Route path="/players" element={<Players />} />
              <Route path="/stats" element={<OverallStats />} />
              <Route path="/positions" element={<PositionStats />} />
              <Route path="/synergy" element={<Synergy />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/seasons" element={<Seasons />} />
            </Routes>
          </main>
        </SeasonProvider>
      </AdminProvider>
    </BrowserRouter>
  );
}
