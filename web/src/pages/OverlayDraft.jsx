import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { overlayRootStyle, elementShown } from '../overlayTheme';

// Task #826 — standalone live draft / pick-ban board for OBS. Polls the
// dedicated /overlay/draft endpoint every 3s so the board tracks picks as
// they happen. Honours `?for=<accountId>` theme/element prefs.
const heroLabel = (h) => h?.hero_name || h?.name || (h?.hero_id ? `H${h.hero_id}` : (typeof h === 'number' ? `H${h}` : '—'));

export default function OverlayDraft() {
  const { lobbyId } = useParams();
  const [sp] = useSearchParams();
  const forAccount = sp.get('for') || '';
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const qs = forAccount ? `?for=${encodeURIComponent(forAccount)}` : '';
        const r = await fetch(`/api/overlay/draft/${encodeURIComponent(lobbyId)}${qs}`);
        if (!r.ok) throw new Error('http ' + r.status);
        const j = await r.json();
        if (!cancelled) setData(j);
      } catch (_) {}
    };
    load();
    const id = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [lobbyId, forAccount]);

  if (!data) return <div className="overlay-root" aria-busy="true" />;

  const draft = data.draft || { radiant_picks: [], dire_picks: [], radiant_bans: [], dire_bans: [] };
  const showBans = elementShown(data.prefs, 'bans') &&
    ((draft.radiant_bans?.length || 0) + (draft.dire_bans?.length || 0) > 0);

  const Side = ({ name, picks, bans, cls }) => (
    <div className={`overlay-team ${cls}`}>
      <div className="overlay-team-label">{name}</div>
      <div className="overlay-draft-picks">
        {(picks || []).length
          ? picks.map((h, i) => <span className="overlay-draft-pick" key={i}>{heroLabel(h)}</span>)
          : <span className="overlay-draft-pick is-empty">Waiting…</span>}
      </div>
      {showBans && (
        <div className="overlay-draft-bans">
          <span className="overlay-live-draft-label">Bans</span>
          <span>{(bans || []).map(heroLabel).join(' · ') || '—'}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="overlay-root" role="region" aria-label="Live draft overlay" style={overlayRootStyle(data.prefs)}>
      <div className="overlay-draft-card">
        <div className="overlay-live-header">
          <div className="overlay-live-title">{data.lobbyName || 'Draft'}</div>
          <div className="overlay-live-state">{data.state || 'Pick / Ban'}</div>
        </div>
        <div className="overlay-draft-sides">
          <Side name={data.radiant_name || 'Radiant'} picks={draft.radiant_picks} bans={draft.radiant_bans} cls="radiant" />
          <Side name={data.dire_name || 'Dire'} picks={draft.dire_picks} bans={draft.dire_bans} cls="dire" />
        </div>
      </div>
    </div>
  );
}
