import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';

// "Live now" hub — inhouse players currently streaming on Twitch. Data comes
// from /api/twitch/live (cached server-side by the TwitchPoller). The Twitch
// player + chat iframes require a `parent` param matching the host they're
// embedded on, so we read it live from window.location.hostname.

const REFRESH_MS = 60 * 1000;

function thumb(url) {
  if (!url) return null;
  return url.replace('{width}', '440').replace('{height}', '248');
}

function sinceLabel(startedAt) {
  if (!startedAt) return null;
  const ms = Date.now() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function TwitchLive() {
  const [state, setState] = useState({ loading: true, configured: true, live: [], error: null });
  const [selected, setSelected] = useState(null);

  const parent = useMemo(() => (typeof window !== 'undefined' ? window.location.hostname : 'localhost'), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/twitch/live');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState({ loading: false, configured: data.configured !== false, live: data.live || [], error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // Keep a valid featured stream selected as the live list churns.
  useEffect(() => {
    if (!state.live.length) { setSelected(null); return; }
    setSelected((prev) => {
      if (prev && state.live.some((s) => s.login === prev)) return prev;
      return state.live[0].login;
    });
  }, [state.live]);

  const featured = state.live.find((s) => s.login === selected) || null;

  return (
    <div className="container" style={{ paddingTop: 8 }}>
      <header style={{ marginBottom: 18 }}>
        <div className="uppercase-wide" style={{ fontFamily: 'var(--font-condensed)', letterSpacing: 2, color: 'var(--brass)', fontSize: 13 }}>
          OCE INHOUSE
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 38, margin: '4px 0 6px', display: 'flex', alignItems: 'center', gap: 12 }}>
          Live now
          {state.live.length > 0 && (
            <span aria-label={`${state.live.length} streaming`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-num)',
              fontSize: 15, color: '#fff', background: '#e0123c', padding: '3px 10px', borderRadius: 999,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: '#fff', display: 'inline-block' }} />
              {state.live.length}
            </span>
          )}
        </h1>
        <p style={{ color: 'var(--text-muted)', maxWidth: 620 }}>
          Inhouse players streaming on Twitch right now. Link your channel on{' '}
          <Link to="/settings/profile">your profile settings</Link> to appear here when you go live.
        </p>
      </header>

      {state.loading && <p style={{ color: 'var(--text-muted)' }}>Loading live streams…</p>}

      {!state.loading && state.error && (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ margin: '0 0 12px' }}>Couldn't load live streams right now.</p>
          <button type="button" className="btn btn-primary" onClick={load}>Try again</button>
        </div>
      )}

      {!state.loading && !state.error && !state.configured && (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ margin: 0 }}>The live hub isn't configured yet. Check back soon.</p>
        </div>
      )}

      {!state.loading && !state.error && state.configured && state.live.length === 0 && (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden="true">📺</div>
          <h2 style={{ fontFamily: 'var(--font-serif)', margin: '0 0 6px' }}>Nobody's live right now</h2>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            When an inhouse player goes live on Twitch they'll show up here automatically.
          </p>
        </div>
      )}

      {!state.loading && state.live.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 18, alignItems: 'start' }} className="live-hub-grid">
          {/* Featured player + chat */}
          {featured && (
            <div>
              <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: '#000' }}>
                <iframe
                  key={featured.login}
                  title={`${featured.userName} live on Twitch`}
                  src={`https://player.twitch.tv/?channel=${encodeURIComponent(featured.login)}&parent=${encodeURIComponent(parent)}`}
                  allowFullScreen
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', margin: '0 0 4px', fontSize: 22 }}>
                  {featured.displayName || featured.userName}
                </h2>
                <p style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>{featured.title}</p>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  {featured.gameName && <span>{featured.gameName}</span>}
                  <span className="pb-num" style={{ color: '#e0123c' }}>● {featured.viewerCount.toLocaleString()} watching</span>
                  {sinceLabel(featured.startedAt) && <span className="pb-num">live {sinceLabel(featured.startedAt)}</span>}
                  <a href={`https://twitch.tv/${featured.login}`} target="_blank" rel="noopener noreferrer">Open on Twitch ↗</a>
                  {featured.accountId && <Link to={`/player/${featured.accountId}`}>OCE profile</Link>}
                </div>
              </div>
            </div>
          )}

          {/* Live list + chat */}
          <aside>
            {featured && (
              <div style={{ height: 360, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 16, background: '#18181b' }}>
                <iframe
                  key={`chat-${featured.login}`}
                  title={`${featured.userName} Twitch chat`}
                  src={`https://www.twitch.tv/embed/${encodeURIComponent(featured.login)}/chat?parent=${encodeURIComponent(parent)}&darkpopout`}
                  style={{ width: '100%', height: '100%', border: 0 }}
                />
              </div>
            )}

            <div className="uppercase-wide" style={{ fontFamily: 'var(--font-condensed)', letterSpacing: 1.5, color: 'var(--brass)', fontSize: 12, marginBottom: 8 }}>
              All streams
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {state.live.map((s) => {
                const active = s.login === selected;
                return (
                  <li key={s.login}>
                    <button
                      type="button"
                      onClick={() => setSelected(s.login)}
                      aria-pressed={active}
                      aria-label={`Watch ${s.displayName || s.userName}, ${s.viewerCount} viewers`}
                      style={{
                        display: 'flex', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer',
                        padding: 8, borderRadius: 10, alignItems: 'center',
                        border: active ? '1px solid var(--brass)' : '1px solid var(--border)',
                        background: active ? 'rgba(197,169,117,0.12)' : 'var(--bg-card)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {thumb(s.thumbnailUrl) ? (
                        <img src={thumb(s.thumbnailUrl)} alt="" width={88} height={50} loading="lazy"
                          style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <span aria-hidden="true" style={{ width: 88, height: 50, borderRadius: 6, background: '#000', flexShrink: 0 }} />
                      )}
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.displayName || s.userName}
                        </span>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.title || s.gameName}
                        </span>
                        <span className="pb-num" style={{ display: 'block', fontSize: 12, color: '#e0123c' }}>
                          ● {s.viewerCount.toLocaleString()}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
