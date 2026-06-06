import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { overlayRootStyle, elementShown } from '../overlayTheme';

// Task #826 — post-match recap card for OBS. Static-ish surface (a finished
// match doesn't change), but still polls every 30s so a streamer can leave
// the source up and have it pick up MVP votes as they land.
function fmtDur(secs) {
  if (!secs && secs !== 0) return '—';
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}
const heroLabel = (n) => (n || '').replace(/^npc_dota_hero_/, '') || '—';

export default function OverlayRecap() {
  const { matchId } = useParams();
  const [sp] = useSearchParams();
  const forAccount = sp.get('for') || '';
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const qs = forAccount ? `?for=${encodeURIComponent(forAccount)}` : '';
        const r = await fetch(`/api/overlay/recap/${encodeURIComponent(matchId)}${qs}`);
        if (!r.ok) throw new Error('http ' + r.status);
        const j = await r.json();
        if (!cancelled) { setData(j); setErr(null); }
      } catch (e) { if (!cancelled) setErr(e.message || 'load failed'); }
    };
    load();
    const id = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [matchId, forAccount]);

  if (err && !data) return <div className="overlay-root"><div className="overlay-recap-card">Failed to load match {matchId}</div></div>;
  if (!data) return <div className="overlay-root" aria-busy="true" />;

  const showMvp = elementShown(data.prefs, 'mvp') && data.mvp;
  const showRecords = elementShown(data.prefs, 'records') && (data.records || []).length > 0;

  return (
    <div className="overlay-root" role="region" aria-label="Match recap overlay" style={overlayRootStyle(data.prefs)}>
      <div className="overlay-recap-card">
        <div className="overlay-recap-header">
          <div className="overlay-scoreboard-title">{data.lobby_name || `Match ${data.match_id}`}</div>
          <div className="overlay-scoreboard-meta">
            <span>{fmtDur(data.duration)}</span>
            {(data.radiant_score != null || data.dire_score != null) && (
              <span><span className="win-r">{data.radiant_score ?? 0}</span> – <span className="win-d">{data.dire_score ?? 0}</span></span>
            )}
            <span className={data.radiant_win ? 'win-r' : 'win-d'}>
              {data.radiant_win ? 'Radiant Victory' : 'Dire Victory'}
            </span>
          </div>
        </div>

        {showMvp && (
          <div className="overlay-recap-mvp">
            <span className="overlay-recap-mvp-tag">MVP</span>
            <span className="overlay-recap-mvp-name">{data.mvp.persona_name || '—'}</span>
            <span className="overlay-recap-mvp-hero">{heroLabel(data.mvp.hero_name)}</span>
            {data.mvp.votes ? <span className="overlay-recap-mvp-votes">{data.mvp.votes} votes</span> : null}
          </div>
        )}

        {showRecords && (
          <div className="overlay-recap-records">
            {data.records.map((rec, i) => (
              <div className="overlay-recap-record" key={i}>
                <div className="overlay-recap-record-label">{rec.label}</div>
                <div className="overlay-recap-record-value">{rec.value}</div>
                <div className="overlay-recap-record-who">{rec.persona_name || heroLabel(rec.hero_name)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
