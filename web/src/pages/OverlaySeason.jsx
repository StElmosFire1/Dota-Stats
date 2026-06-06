import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { overlayRootStyle } from '../overlayTheme';

// Task #826 — season-stats ticker for OBS. The server already filters the
// `highlights` array by the streamer's element prefs + privacy, so this
// component just rotates through whatever it's given. Rotation is purely
// presentational and pauses to nothing when only one highlight exists.
export default function OverlaySeason() {
  const { accountId } = useParams();
  const [data, setData] = useState(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/overlay/season/${encodeURIComponent(accountId)}`);
        if (!r.ok) throw new Error('http ' + r.status);
        const j = await r.json();
        if (!cancelled) setData(j);
      } catch (_) {}
    };
    load();
    const id = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [accountId]);

  const highlights = data?.highlights || [];
  useEffect(() => {
    if (highlights.length <= 1) return;
    const id = setInterval(() => setIdx(i => (i + 1) % highlights.length), 4000);
    return () => clearInterval(id);
  }, [highlights.length]);

  if (!data) return <div className="overlay-root overlay-ticker-root" aria-busy="true" />;

  const cur = highlights.length ? highlights[idx % highlights.length] : null;

  return (
    <div className="overlay-root overlay-ticker-root" role="region" aria-label="Season stats overlay" style={overlayRootStyle(data.prefs)}>
      <div className="overlay-ticker-card overlay-season-card">
        <div className="overlay-season-head">
          <div className="overlay-ticker-name">{data.persona_name || '—'}</div>
          {data.season?.name && <div className="overlay-season-label">{data.season.name}</div>}
        </div>
        <div className="overlay-season-rotator" aria-live="polite">
          {cur ? (
            <>
              <div className="overlay-ticker-stat-label">{cur.label}</div>
              <div className="overlay-ticker-stat-value overlay-season-value">{cur.value}</div>
              {cur.sub && <div className="overlay-season-sub">{cur.sub}</div>}
            </>
          ) : (
            <div className="overlay-ticker-stat-value">No season data</div>
          )}
        </div>
      </div>
    </div>
  );
}
