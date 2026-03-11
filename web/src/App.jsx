import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import MatchList from './pages/MatchList';
import MatchDetail from './pages/MatchDetail';
import Leaderboard from './pages/Leaderboard';
import PlayerProfile from './pages/PlayerProfile';
import Heroes from './pages/Heroes';
import Players from './pages/Players';
import Upload from './pages/Upload';
import UploadIndicator from './components/UploadIndicator';

function Nav() {
  const location = useLocation();
  const isActive = (path) => location.pathname === path ? 'nav-link active' : 'nav-link';

  return (
    <nav className="navbar">
      <Link to="/" className="nav-brand">
        <span className="brand-icon">&#9876;</span> Inhouse Stats
      </Link>
      <div className="nav-links">
        <Link to="/" className={isActive('/')}>Matches</Link>
        <Link to="/leaderboard" className={isActive('/leaderboard')}>Leaderboard</Link>
        <Link to="/heroes" className={isActive('/heroes')}>Heroes</Link>
        <Link to="/players" className={isActive('/players')}>Players</Link>
        <Link to="/upload" className={isActive('/upload')}>Upload</Link>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <UploadIndicator />
      <main className="container">
        <Routes>
          <Route path="/" element={<MatchList />} />
          <Route path="/match/:matchId" element={<MatchDetail />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/player/:accountId" element={<PlayerProfile />} />
          <Route path="/heroes" element={<Heroes />} />
          <Route path="/players" element={<Players />} />
          <Route path="/upload" element={<Upload />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
