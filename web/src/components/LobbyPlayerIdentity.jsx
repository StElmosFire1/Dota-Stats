import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { TierEmblemImg, getTier } from '../pages/Leaderboard';
import RankBadge from './RankBadge';
import FounderRing from './founderRings/FounderRing';
import { FRAME_META } from '../profileCosmetics';
import './lobby-player-identity.css';

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
          <FounderRing sku={player.founder_ring} size={34} disc="emblem" />
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
  const mmr = player.inhouse_mmr == null ? null : Number(player.inhouse_mmr);
  const hasRating = mmr != null && Number.isFinite(mmr);
  const isLeader = Number(player.leaderboard_rank) === 1;
  const tier = hasRating ? getTier(mmr, { isLeader }) : null;
  const frame = FRAME_META[player.profile_frame];
  const wins = Number(player.wins) || 0;
  const losses = Number(player.losses) || 0;
  const games = wins + losses;
  const show = event => { setDismissed(false); setAnchor(event.currentTarget.getBoundingClientRect()); };
  const close = () => setAnchor(null);
  const open = anchor && !dismissed;
  const cardWidth = Math.min(288, window.innerWidth - 24);
  const left = anchor ? Math.max(12, Math.min(anchor.left, window.innerWidth - cardWidth - 12)) : 12;
  const above = anchor && anchor.bottom + 230 > window.innerHeight;
  return (
    <span className="lobby-player-identity" onMouseEnter={show} onMouseLeave={close}
      onFocus={show} onBlur={close} onKeyDown={event => { if (event.key === 'Escape') setDismissed(true); }}>
      <Link to={`/player/${player.account_id}`} target="_blank" rel="noopener noreferrer"
        aria-label={`Open ${displayName}'s profile in a new tab`}
        aria-describedby={open ? id : undefined}
        className="lobby-player-name"
        style={frame ? { borderRadius: 6, padding: '1px 6px 1px 4px', ...frame.style } : undefined}>
        {displayName}
      </Link>
      {open && createPortal(
        <aside role="tooltip" id={id} className="lobby-player-info"
          style={{ width: cardWidth, left, ...(above ? { bottom: window.innerHeight - anchor.top + 8 } : { top: anchor.bottom + 8 }) }}>
          <strong>{displayName}</strong>
          <span className="lobby-player-info-rank">{tier ? `${tier.name} · ${Math.round(mmr).toLocaleString()} MMR` : 'Inhouse rating not available'}</span>
          {player.leaderboard_rank && <span>All-time leaderboard #{player.leaderboard_rank}</span>}
          <RankBadge rankTier={player.dota_rank_tier} leaderboardRank={player.dota_leaderboard_rank} />
          <span>{games ? `${wins}W / ${losses}L · ${Math.round(wins / games * 100)}% win rate` : 'No recorded games yet'}</span>
          <span>Preferred roles: {player.preferred_positions || 'Not set'}</span>
          <small>Open profile in a new tab for more details.</small>
        </aside>, document.body
      )}
    </span>
  );
}
