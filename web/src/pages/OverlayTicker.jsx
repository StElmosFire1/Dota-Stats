import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { overlayRootStyle, elementShown } from '../overlayTheme';

export default function OverlayTicker() {
  const { accountId } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/overlay/ticker/${encodeURIComponent(accountId)}`);
        if (!r.ok) throw new Error('http ' + r.status);
        const j = await r.json();
        if (!cancelled) setData(j);
      } catch (_) {}
    };
    load();
    const id = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [accountId]);

  if (!data) return <div className="overlay-root overlay-ticker-root" aria-busy="true" />;

  const wr = data.win_rate != null ? Math.round(data.win_rate * 100) : (
    data.games_played ? Math.round((data.wins / data.games_played) * 100) : 0
  );
  const streak = Number(data.streak || 0);
  const streakLabel = streak > 0 ? `+${streak} W` : streak < 0 ? `${streak} L` : '—';
  const streakClass = streak > 0 ? 'streak-win' : streak < 0 ? 'streak-loss' : 'streak-none';

  return (
    <div className="overlay-root overlay-ticker-root" role="region" aria-label="Player ticker overlay" style={overlayRootStyle(data.prefs)}>
      <div className="overlay-ticker-card">
        <div className="overlay-ticker-name">{data.persona_name || '—'}</div>
        <div className="overlay-ticker-stats">
          {data.mmr != null && elementShown(data.prefs, 'mmr') && (
            <div className="overlay-ticker-stat">
              <div className="overlay-ticker-stat-label">MMR</div>
              <div className="overlay-ticker-stat-value">{data.mmr}</div>
            </div>
          )}
          {data.tier && elementShown(data.prefs, 'tier') && (
            <div className="overlay-ticker-stat">
              <div className="overlay-ticker-stat-label">Tier</div>
              <div className="overlay-ticker-stat-value">{data.tier}</div>
            </div>
          )}
          <div className="overlay-ticker-stat">
            <div className="overlay-ticker-stat-label">W / L</div>
            <div className="overlay-ticker-stat-value">{data.wins ?? 0} – {data.losses ?? 0}</div>
          </div>
          {elementShown(data.prefs, 'winRate') && (
            <div className="overlay-ticker-stat">
              <div className="overlay-ticker-stat-label">Win Rate</div>
              <div className="overlay-ticker-stat-value">{wr}%</div>
            </div>
          )}
          {elementShown(data.prefs, 'streak') && (
            <div className="overlay-ticker-stat">
              <div className="overlay-ticker-stat-label">Streak</div>
              <div className={`overlay-ticker-stat-value ${streakClass}`}>{streakLabel}</div>
            </div>
          )}
          {data.region && elementShown(data.prefs, 'region') && (
            <div className="overlay-ticker-stat">
              <div className="overlay-ticker-stat-label">Region</div>
              <div className="overlay-ticker-stat-value">{data.region}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
