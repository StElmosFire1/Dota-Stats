import React from 'react';
import { useSeason } from '../context/SeasonContext';

export default function SeasonSelector({ className = '' }) {
  const { seasonId, setSeasonId, seasons } = useSeason();

  if (seasons.length === 0) return null;

  return (
    <select
      className={`season-selector ${className}`}
      value={seasonId ?? ''}
      onChange={e => setSeasonId(e.target.value ? parseInt(e.target.value) : null)}
      title="Filter by season"
    >
      <option value="">All Time</option>
      {seasons.map(s => (
        <option key={s.id} value={s.id}>
          {s.name}{s.active ? ' ★' : ''}
        </option>
      ))}
    </select>
  );
}
