import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { overlayRootStyle, elementShown } from '../overlayTheme';

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

  // Server-normalised team values are always 'radiant' | 'dire' | null.
  const radiant = (data?.players || []).filter(p => p.team === 'radiant');
  const dire    = (data?.players || []).filter(p => p.team === 'dire');
  const draft   = data?.draft || { radiant_picks: [], dire_picks: [], radiant_bans: [], dire_bans: [] };
  const rScore  = data?.radiant_score;
  const dScore  = data?.dire_score;
  const showScore = rScore != null || dScore != null;
  const showDraft = (draft.radiant_picks?.length || 0) + (draft.dire_picks?.length || 0)
                  + (draft.radiant_bans?.length || 0) + (draft.dire_bans?.length || 0) > 0;

  const showKda = elementShown(data?.prefs, 'kda');
  const showBans = elementShown(data?.prefs, 'bans');
  const fmtKda = (p) => (showKda && (p.kills != null || p.deaths != null || p.assists != null))
    ? ` · ${p.kills ?? 0}/${p.deaths ?? 0}/${p.assists ?? 0}` : '';

  return (
    <div className="overlay-root" role="region" aria-label="Live lobby overlay" style={overlayRootStyle(data?.prefs)}>
      <div className="overlay-live-card">
        <div className="overlay-live-header">
          <div className="overlay-live-title">{data?.lobbyName || 'Inhouse Lobby'}</div>
          <div className="overlay-live-state">{data?.state || (data?.matchId ? 'In match' : 'Idle')}</div>
        </div>

        {showScore && (
          <div className="overlay-live-score" aria-label="Live score">
            <span className="overlay-live-score-r">{rScore ?? 0}</span>
            <span className="overlay-live-score-sep">—</span>
            <span className="overlay-live-score-d">{dScore ?? 0}</span>
          </div>
        )}

        {showDraft && (
          <div className="overlay-live-draft">
            <div className="overlay-live-draft-row">
              <span className="overlay-live-draft-label">R picks</span>
              <span>{(draft.radiant_picks || []).map(h => h.hero_name || h.name || `H${h.hero_id || h}`).join(' · ') || '—'}</span>
            </div>
            <div className="overlay-live-draft-row">
              <span className="overlay-live-draft-label">D picks</span>
              <span>{(draft.dire_picks || []).map(h => h.hero_name || h.name || `H${h.hero_id || h}`).join(' · ') || '—'}</span>
            </div>
            {showBans && (draft.radiant_bans?.length || draft.dire_bans?.length) ? (
              <div className="overlay-live-draft-row overlay-live-draft-bans">
                <span className="overlay-live-draft-label">Bans</span>
                <span>{[...(draft.radiant_bans || []), ...(draft.dire_bans || [])].map(h => h.hero_name || h.name || `H${h.hero_id || h}`).join(' · ')}</span>
              </div>
            ) : null}
          </div>
        )}

        <div className="overlay-live-teams">
          <div className="overlay-team radiant">
            <div className="overlay-team-label">Radiant</div>
            {radiant.map((p, i) => (
              <div className="overlay-team-row" key={`r-${i}`}>{p.persona_name || '—'}{fmtKda(p)}</div>
            ))}
          </div>
          <div className="overlay-team dire">
            <div className="overlay-team-label">Dire</div>
            {dire.map((p, i) => (
              <div className="overlay-team-row" key={`d-${i}`}>{p.persona_name || '—'}{fmtKda(p)}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
