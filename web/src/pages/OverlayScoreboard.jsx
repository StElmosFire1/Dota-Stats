import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

function fmtDur(secs) {
  if (!secs && secs !== 0) return '—';
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function PlayerRow({ p }) {
  return (
    <tr>
      <td className="ov-name">{p.persona_name || '—'}</td>
      <td>{p.hero_name?.replace(/^npc_dota_hero_/, '') || '—'}</td>
      <td>{p.kills ?? 0}/{p.deaths ?? 0}/{p.assists ?? 0}</td>
      <td>{p.last_hits ?? 0}/{p.denies ?? 0}</td>
      <td>{p.gpm ?? 0}</td>
      <td>{p.xpm ?? 0}</td>
      <td>{p.net_worth ?? 0}</td>
    </tr>
  );
}

export default function OverlayScoreboard() {
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
        const r = await fetch(`/api/overlay/scoreboard/${encodeURIComponent(matchId)}${qs}`);
        if (!r.ok) throw new Error('http ' + r.status);
        const j = await r.json();
        if (!cancelled) { setData(j); setErr(null); }
      } catch (e) { if (!cancelled) setErr(e.message || 'load failed'); }
    };
    load();
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [matchId, forAccount]);

  if (err && !data) return <div className="overlay-root"><div className="overlay-scoreboard-card">Failed to load match {matchId}</div></div>;
  if (!data) return <div className="overlay-root" aria-busy="true" />;

  const radiant = (data.players || []).filter(p => p.team === 'radiant');
  const dire = (data.players || []).filter(p => p.team === 'dire');

  return (
    <div className="overlay-root" role="region" aria-label="Match scoreboard overlay">
      <div className="overlay-scoreboard-card">
        <div className="overlay-scoreboard-header">
          <div className="overlay-scoreboard-title">Match {data.match_id}</div>
          <div className="overlay-scoreboard-meta">
            <span>{fmtDur(data.duration)}</span>
            <span className={data.radiant_win ? 'win-r' : 'win-d'}>
              {data.radiant_win ? 'Radiant Victory' : 'Dire Victory'}
            </span>
          </div>
        </div>
        {[{ name: 'Radiant', cls: 'radiant', rows: radiant }, { name: 'Dire', cls: 'dire', rows: dire }].map(team => (
          <table className={`overlay-scoreboard-table ${team.cls}`} key={team.name}>
            <caption>{team.name}</caption>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Hero</th>
                <th scope="col">K/D/A</th>
                <th scope="col">LH/DN</th>
                <th scope="col">GPM</th>
                <th scope="col">XPM</th>
                <th scope="col">NW</th>
              </tr>
            </thead>
            <tbody>
              {team.rows.map(p => <PlayerRow key={p.slot ?? p.account_id} p={p} />)}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}
