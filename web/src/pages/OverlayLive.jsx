import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

export default function OverlayLive() {
  const { lobbyId } = useParams();
  const [sp] = useSearchParams();
  const forAccount = sp.get('for') || '';
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const qs = forAccount ? `?for=${encodeURIComponent(forAccount)}` : '';
        const r = await fetch(`/api/overlay/live/${encodeURIComponent(lobbyId)}${qs}`);
        if (!r.ok) throw new Error('http ' + r.status);
        const j = await r.json();
        if (!cancelled) setData(j);
      } catch (_) { if (!cancelled) setData({ matchId: null, players: [] }); }
    };
    load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [lobbyId, forAccount]);

  const radiant = (data?.players || []).filter(p => p.team === 'radiant' || p.team === 0);
  const dire = (data?.players || []).filter(p => p.team === 'dire' || p.team === 1);

  return (
    <div className="overlay-root" role="region" aria-label="Live lobby overlay">
      <div className="overlay-live-card">
        <div className="overlay-live-header">
          <div className="overlay-live-title">{data?.lobbyName || 'Inhouse Lobby'}</div>
          <div className="overlay-live-state">{data?.state || (data?.matchId ? 'In match' : 'Idle')}</div>
        </div>
        <div className="overlay-live-teams">
          <div className="overlay-team radiant">
            <div className="overlay-team-label">Radiant</div>
            {radiant.map((p, i) => (
              <div className="overlay-team-row" key={`r-${i}`}>{p.persona_name || '—'}</div>
            ))}
          </div>
          <div className="overlay-team dire">
            <div className="overlay-team-label">Dire</div>
            {dire.map((p, i) => (
              <div className="overlay-team-row" key={`d-${i}`}>{p.persona_name || '—'}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
