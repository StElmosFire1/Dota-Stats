import React from 'react';
import { useSeason } from '../context/SeasonContext';

function seasonSortKey(name) {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

export default function SeasonSelector({ className = '' }) {
  const { seasonId, setSeasonId, seasons } = useSeason();

  if (seasons.length === 0) return null;

  const activeSeasons = seasons.filter(s => !s.is_legacy);
  const legacySeasons = [...seasons.filter(s => s.is_legacy)].sort(
    (a, b) => seasonSortKey(a.name) - seasonSortKey(b.name)
  );

  return (
    <select
      className={`season-selector ${className}`}
      value={seasonId ?? ''}
      onChange={e => setSeasonId(e.target.value || null)}
      title="Filter by season"
    >
      <option value="">All Time</option>
      {activeSeasons.map(s => (
        <option key={s.id} value={s.id}>
          {s.name}{s.active ? ' ★' : ''}
        </option>
      ))}
      {legacySeasons.length > 0 && (
        <optgroup label="─── Legacy ───">
          <option value="legacy">All Legacy Seasons</option>
          {legacySeasons.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} (Legacy)
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
