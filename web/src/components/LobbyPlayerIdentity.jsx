import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { TierEmblemImg, getTier } from '../pages/Leaderboard';
import RankBadge from './RankBadge';
import FounderRing from './founderRings/FounderRing';
import { FRAME_META } from '../profileCosmetics';
import './lobby-player-identity.css';
import LobbyPlayerScouting from './LobbyPlayerScouting';
import { normalizePreferredRoles } from '../utils/preferredRoles';

export function LobbyPlayerEmblem({ player }) {
  const mmr = player.inhouse_mmr == null ? null : Number(player.inhouse_mmr);
  const hasRating = mmr != null && Number.isFinite(mmr);
  const isLeader = Number(player.leaderboard_rank) === 1;
  const hasRing = Boolean(player.founder_ring);
  if (!hasRing && !hasRating) return null;
  return (
    <span className={`lobby-player-cosmetics${hasRing && hasRating ? ' has-ring-and-tier' : ''}`}
      aria-label={hasRing ? 'Equipped ring' : 'Inhouse rank'}>
      {hasRing && (
        <span className="lobby-player-ring" title="Equipped ring">
          <FounderRing sku={player.founder_ring} size={48} disc="emblem" />
        </span>
      )}
      {hasRating && (
        <span className={hasRing ? 'lobby-player-tier-overlay' : 'lobby-player-tier-standalone'}>
          <TierEmblemImg mmr={mmr} isLeader={isLeader} />
        </span>
      )}
    </span>
  );
}

export default function LobbyPlayerIdentity({ player, displayName }) {
  const [anchor, setAnchor] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const id = useId();
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const closeTimer = useRef(null);
  const mmr = player.inhouse_mmr == null ? null : Number(player.inhouse_mmr);
  const hasRating = mmr != null && Number.isFinite(mmr);
  const isLeader = Number(player.leaderboard_rank) === 1;
  const tier = hasRating ? getTier(mmr, { isLeader }) : null;
  const frame = FRAME_META[player.profile_frame];
  const wins = Number(player.wins) || 0;
  const losses = Number(player.losses) || 0;
  const games = wins + losses;
  const preferredRoles = normalizePreferredRoles(player.preferred_positions);
  const keepOpen = () => clearTimeout(closeTimer.current);
  const show = () => {
    keepOpen();
    setDismissed(false);
    setAnchor(triggerRef.current.getBoundingClientRect());
  };
  const close = () => setAnchor(null);
  const leave = () => { closeTimer.current = setTimeout(close, 180); };
  const blur = event => {
    if (triggerRef.current?.contains(event.relatedTarget) || popupRef.current?.contains(event.relatedTarget)) return;
    close();
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!anchor) return;
    const moved = event => { if (!popupRef.current?.contains(event.target)) setAnchor(null); };
    const escape = event => { if (event.key === 'Escape') setDismissed(true); };
    window.addEventListener('resize', moved);
    document.addEventListener('scroll', moved, true);
    document.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('resize', moved);
      document.removeEventListener('scroll', moved, true);
      document.removeEventListener('keydown', escape);
    };
  }, [anchor]);
  const open = anchor && !dismissed;
  const cardWidth = Math.min(420, window.innerWidth - 24);
  const cardHeight = Math.min(660, window.innerHeight - 24);
  const left = anchor ? Math.max(12, Math.min(anchor.left, window.innerWidth - cardWidth - 12)) : 12;
  const top = anchor ? Math.max(12, Math.min(anchor.bottom + 8, window.innerHeight - cardHeight - 12)) : 12;
  return (
    <span ref={triggerRef} className="lobby-player-identity" onMouseEnter={show} onMouseLeave={leave}
      onFocus={show} onBlur={blur} onKeyDown={event => { if (event.key === 'Escape') setDismissed(true); }}>
      <Link to={`/player/${player.account_id}`} target="_blank" rel="noopener noreferrer"
        aria-label={`Open ${displayName}'s profile in a new tab`}
        aria-describedby={open ? id : undefined}
        className="lobby-player-name"
        style={frame ? { borderRadius: 6, padding: '1px 6px 1px 4px', ...frame.style } : undefined}>
        {displayName}
      </Link>
      {open && createPortal(
        <aside ref={popupRef} role="tooltip" id={id} className="lobby-player-info" tabIndex={0}
          onMouseEnter={keepOpen} onMouseLeave={leave}
          style={{ width: cardWidth, maxHeight: cardHeight, left, top }}>
          <strong>{displayName}</strong>
          <span className="lobby-player-info-rank">{tier ? `${tier.name} · ${Math.round(mmr).toLocaleString()} MMR` : 'Inhouse rating not available'}</span>
          {player.leaderboard_rank && <span>All-time leaderboard #{player.leaderboard_rank}</span>}
          <RankBadge rankTier={player.dota_rank_tier} leaderboardRank={player.dota_leaderboard_rank} />
          <span>{games ? `${wins}W / ${losses}L · ${Math.round(wins / games * 100)}% win rate` : 'No recorded games yet'}</span>
          <span>Preferred roles: {preferredRoles.length ? preferredRoles.join(', ') : 'Not set'}</span>
          {player.last_played && Number.isFinite(new Date(player.last_played).getTime()) && <small>Last played: {new Date(player.last_played).toLocaleDateString()}</small>}
          {player.voice_verified && <small>Verified in voice</small>}
          {player.not_in_dota === false && <small>In Dota</small>}
          {player.roll != null && <small>Roll: {player.roll}</small>}
          <LobbyPlayerScouting accountId={player.account_id} />
          <small>Open profile in a new tab for more details.</small>
        </aside>, document.body
      )}
    </span>
  );
}
