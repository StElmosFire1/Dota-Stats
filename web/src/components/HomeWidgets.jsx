import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { formatHeroName } from '../utils/heroes';

const HERO_CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes';
function heroSlug(name) {
  if (!name) return null;
  return String(name).replace(/^npc_dota_hero_/, '').toLowerCase().replace(/\s+/g, '_');
}
function HeroPortrait({ heroName, size = 72 }) {
  const [failed, setFailed] = React.useState(false);
  const slug = heroSlug(heroName);
  const w = Math.round(size * 1.78);
  if (!slug || failed) {
    return <div style={{ width: w, height: size, background: 'var(--bg-hover)', borderRadius: 6, flexShrink: 0 }} />;
  }
  return (
    <img
      src={`${HERO_CDN}/${slug}.png`}
      alt={slug}
      width={w}
      height={size}
      onError={() => setFailed(true)}
      style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0, display: 'block' }}
    />
  );
}

const fetchJsonSafe = async (url) => {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
};

const cardStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '14px 18px',
};

const eyebrowStyle = {
  fontSize: 11,
  fontFamily: 'var(--font-condensed, inherit)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.16em',
  fontWeight: 600,
};

function StatusDot({ color, pulse }) {
  return (
    <span style={{
      display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
      background: color, marginRight: 8,
      boxShadow: pulse ? `0 0 0 0 ${color}` : 'none',
      animation: pulse ? 'oa-pulse 2s infinite' : 'none',
    }} />
  );
}

export function LiveInhousePulse() {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      fetchJsonSafe('/api/inhouse/active').then(d => {
        if (!alive) return;
        setData(d);
        setLoaded(true);
      });
    };
    refresh();
    const i = setInterval(refresh, 8000);
    const c = setInterval(() => setTick(t => t + 1), 1000);
    return () => { alive = false; clearInterval(i); clearInterval(c); };
  }, []);

  if (!loaded) return null;

  const session = data?.session || null;
  const players = data?.players || [];
  let label, color, hint, pulse = false, href = '/inhouse';

  if (!session) {
    color = 'var(--text-muted)';
    label = 'No active inhouse';
    hint = 'Open one →';
  } else if (session.status === 'open') {
    const reg = players.length;
    const min = session.min_players || 10;
    const ready = reg >= min;
    color = ready ? '#22c55e' : 'var(--amber, #f59e0b)';
    pulse = ready;
    if (ready && session.auto_start_at) {
      const secs = Math.max(0, Math.round((new Date(session.auto_start_at).getTime() - Date.now()) / 1000));
      label = `Lobby is full (${reg}/${min})`;
      hint = `Accept phase auto-starts in ${secs}s →`;
    } else {
      label = `Lobby filling — ${reg}/${min} players`;
      hint = ready ? 'Auto-start armed →' : 'Drop in →';
    }
  } else if (session.status === 'accepting') {
    color = 'var(--amber, #f59e0b)';
    pulse = true;
    const accepted = players.filter(p => p.accept_status === 'accepted').length;
    label = `Accept phase — ${accepted}/${players.length} accepted`;
    hint = 'Click in →';
  } else if (session.status === 'drafting') {
    color = '#a855f7';
    pulse = true;
    label = 'Captains drafting — live';
    hint = 'Spectate the pick →';
  } else if (session.status === 'in_progress') {
    color = 'var(--accent-red, #ef4444)';
    pulse = true;
    label = 'Match in progress';
    hint = 'View bracket →';
  } else {
    color = 'var(--text-muted)';
    label = `Session status: ${session.status}`;
    hint = 'View →';
  }

  // tick value just forces re-render for the auto-start countdown
  void tick;

  return (
    <Link to={href} style={{ textDecoration: 'none' }}>
      <div style={{
        ...cardStyle,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 14, marginBottom: 16,
        borderColor: session ? color : 'var(--border)',
        transition: 'border-color 200ms',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <StatusDot color={color} pulse={pulse} />
          <div style={{ minWidth: 0 }}>
            <div style={{ ...eyebrowStyle, marginBottom: 2 }}>Inhouse Lobby</div>
            <div style={{
              fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
              fontFamily: 'var(--font-condensed, inherit)',
            }}>{label}</div>
          </div>
        </div>
        <span style={{
          fontSize: 12, color: 'var(--brass, var(--accent))', fontWeight: 600,
          fontFamily: 'var(--font-condensed, inherit)',
          textTransform: 'uppercase', letterSpacing: '0.12em',
          flexShrink: 0, whiteSpace: 'nowrap',
        }}>{hint}</span>
      </div>
    </Link>
  );
}

// v6.64 / Task #208 — Featured Player (Profile Spotlight) card. Renders an
// admin-curated featured player on the home page. Hidden when no spotlight
// is currently active so the layout stays unchanged on quiet weeks.
export function FeaturedPlayer() {
  const [s, setS] = useState(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetchJsonSafe('/api/spotlight/current').then(d => {
      setS(d?.spotlight || null);
      setLoaded(true);
    });
  }, []);
  if (!loaded || !s) return null;
  // v6.76 / Task #222 — auto-picks (PERF leader / hot streak / most-improved
  // fallback chain) get an "Auto-selected" pill so visitors can tell the
  // rotation is algorithmic rather than admin-curated. Admin rows keep the
  // original "spotlight" pill.
  const isAuto = s.source === 'auto';
  return (
    <Link to={`/player/${s.account_id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        ...cardStyle,
        marginBottom: 16,
        background: 'linear-gradient(135deg, rgba(197,169,117,0.18) 0%, rgba(245,158,11,0.06) 100%)',
        borderColor: 'rgba(197,169,117,0.45)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={eyebrowStyle}>🌟 Featured Player</div>
          <span
            title={isAuto ? 'Auto-selected from this week\'s leaderboards' : 'Curated by an admin'}
            style={{
              fontSize: 10, fontFamily: 'var(--font-condensed, inherit)',
              color: isAuto ? '#f59e0b' : 'var(--brass, var(--accent))',
              textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700,
            }}
          >{isAuto ? '⚙ Auto-selected' : 'spotlight'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="font-serif" style={{
              fontSize: 22, fontWeight: 700, color: 'var(--text-primary)',
              fontFamily: 'var(--font-serif, serif)', lineHeight: 1.15, marginBottom: 4,
            }}>
              {s.display_name || `Player #${s.account_id}`}
            </div>
            <div style={{
              fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginBottom: 6,
            }}>{s.headline}</div>
            {s.blurb ? (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                {s.blurb}
              </div>
            ) : null}
          </div>
          {s.top_hero && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <HeroPortrait heroName={s.top_hero} size={64} />
              <div style={{
                fontSize: 10, color: 'var(--text-muted)', textAlign: 'center',
                fontFamily: 'var(--font-condensed, inherit)',
                textTransform: 'uppercase', letterSpacing: '0.1em',
                maxWidth: 114, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{formatHeroName(s.top_hero)}</div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export function PlayerOfTheWeek() {
  const [data, setData] = useState(null);
  const [spotlight, setSpotlight] = useState(null);
  const [improved, setImproved] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Fetch all three in parallel: PERF leader of the week, the currently
    // featured spotlight (so we can de-dup), and the most-improved fallback
    // for when the two collide. Resolves once all three settle so the card
    // doesn't flash through a doomed render before swapping to the filler.
    Promise.all([
      fetchJsonSafe('/api/home/perf-spotlight'),
      fetchJsonSafe('/api/spotlight/current'),
      fetchJsonSafe('/api/most-improved?days=7'),
    ]).then(([perf, spot, imp]) => {
      setData(perf || null);
      setSpotlight((spot && spot.spotlight) || null);
      // getMostImproved returns rows sorted by mmr_delta desc — pick the top
      // gainer, but only if they actually moved up (>0). The DB columns are
      // `mmr_delta` / `current_mmr` / `games_in_period`; we keep legacy-name
      // fallbacks (`mmr_change` / `new_mmr` / `games_played`) so a future
      // server-side rename or alias swap doesn't silently re-break this.
      const top = Array.isArray(imp?.rows)
        ? imp.rows.find(r => Number(r.mmr_delta ?? r.mmr_change) > 0)
        : null;
      setImproved(top || null);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return null;
  const perfPlayer = data?.player || null;
  // De-dup: if the FeaturedPlayer card above is showing the same account as
  // the PERF leader, swap this slot to a "Most Improved this week" filler so
  // visitors don't see the same person twice in a row.
  const sameAsFeatured = perfPlayer && spotlight
    && Number(perfPlayer.account_id) === Number(spotlight.account_id);

  if (sameAsFeatured) {
    if (!improved) return null;
    return <MostImprovedFiller row={improved} />;
  }
  if (!perfPlayer) {
    // No PERF leader at all (quiet week) — still try the filler if we have one.
    if (improved) return <MostImprovedFiller row={improved} />;
    return null;
  }
  const p = perfPlayer;
  const perf = Number(p.perf || 0).toFixed(1);
  const pos = p.position;
  const rarity = p.perf >= 9 ? 'Top 1%' : p.perf >= 8 ? 'Elite' : p.perf >= 7 ? 'Excellent' : 'Strong';

  return (
    <Link to={`/match/${p.match_id}`} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
      <div style={{
        ...cardStyle,
        height: '100%',
        background: 'linear-gradient(135deg, rgba(245,158,11,0.10) 0%, rgba(197,169,117,0.05) 100%)',
        borderColor: 'rgba(245,158,11,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={eyebrowStyle}>⭐ Player of the Week</div>
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-condensed, inherit)',
            color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700,
          }}>last 7 days</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="font-serif" style={{
            fontSize: 42, fontWeight: 800,
            color: '#f59e0b',
            fontFamily: 'var(--font-serif, serif)',
            lineHeight: 1, minWidth: 70, textAlign: 'center',
          }}>{perf}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="font-serif" style={{
              fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
              fontFamily: 'var(--font-serif, serif)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{p.display_name || `Player ${p.account_id}`}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {formatHeroName(p.hero_name) || 'Hero'} · Pos {pos || '—'} · {p.kills}/{p.deaths}/{p.assists}
            </div>
            <div style={{
              fontSize: 11, color: 'var(--brass, var(--accent))',
              fontFamily: 'var(--font-condensed, inherit)',
              textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginTop: 4,
            }}>{rarity} PERF · view match →</div>
          </div>
          {p.hero_name && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <HeroPortrait heroName={p.hero_name} size={64} />
              <div style={{
                fontSize: 10, color: 'var(--text-muted)', textAlign: 'center',
                fontFamily: 'var(--font-condensed, inherit)',
                textTransform: 'uppercase', letterSpacing: '0.1em',
                maxWidth: 114, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{formatHeroName(p.hero_name)}</div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// Filler that takes the PlayerOfTheWeek slot when the PERF leader of the week
// is already the FeaturedPlayer above (de-dup — see PlayerOfTheWeek).
// Surfaces the biggest 7-day MMR climber so the slot still earns its space.
function MostImprovedFiller({ row }) {
  const accountId = row.account_id || row.player_id;
  // Server returns `mmr_delta` / `current_mmr` / `games_in_period` / `top_hero`
  // from db.getMostImproved (src/db/index.js). Keep legacy aliases so a name
  // change on either side doesn't silently break the filler.
  const change = Number(row.mmr_delta ?? row.mmr_change ?? 0);
  const newMmr = row.current_mmr ?? row.new_mmr ?? row.mmr ?? null;
  const games = row.games_in_period ?? row.games_played ?? row.games ?? null;
  const topHero = row.top_hero || null;
  return (
    <Link to={`/player/${accountId}`} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
      <div style={{
        ...cardStyle,
        height: '100%',
        background: 'linear-gradient(135deg, rgba(74,222,128,0.10) 0%, rgba(245,158,11,0.04) 100%)',
        borderColor: 'rgba(74,222,128,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={eyebrowStyle}>📈 Most Improved</div>
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-condensed, inherit)',
            color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700,
          }}>last 7 days</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="font-serif" style={{
            fontSize: 38, fontWeight: 800,
            color: '#4ade80',
            fontFamily: 'var(--font-serif, serif)',
            lineHeight: 1, minWidth: 80, textAlign: 'center',
          }}>+{change}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="font-serif" style={{
              fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
              fontFamily: 'var(--font-serif, serif)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{row.display_name || row.nickname || `Player ${accountId}`}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              MMR climb · now {newMmr ?? '—'}{games ? ` · ${games} games` : ''}
            </div>
            <div style={{
              fontSize: 11, color: 'var(--brass, var(--accent))',
              fontFamily: 'var(--font-condensed, inherit)',
              textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginTop: 4,
            }}>biggest climber · view profile →</div>
          </div>
          {topHero && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <HeroPortrait heroName={topHero} size={64} />
              <div style={{
                fontSize: 10, color: 'var(--text-muted)', textAlign: 'center',
                fontFamily: 'var(--font-condensed, inherit)',
                textTransform: 'uppercase', letterSpacing: '0.1em',
                maxWidth: 114, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{formatHeroName(topHero)}</div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export function HotHeroes() {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchJsonSafe('/api/home/hot-heroes').then(d => {
      setData(d);
      setLoaded(true);
    });
  }, []);

  if (!loaded || !data?.heroes?.length) return null;

  return (
    <div style={{ ...cardStyle, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={eyebrowStyle}>🔥 What's hot — past 7 days</div>
        <Link to="/heroes" style={{
          fontSize: 11, color: 'var(--brass, var(--accent))', textDecoration: 'none',
          fontFamily: 'var(--font-condensed, inherit)',
          textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600,
        }}>Hero meta →</Link>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10,
      }}>
        {data.heroes.slice(0, 4).map(h => {
          const wrPct = Math.round((h.win_rate || 0) * 100);
          const deltaPp = h.win_rate_delta_pp;
          const deltaColor = deltaPp == null ? 'var(--text-muted)' : deltaPp >= 0 ? '#22c55e' : '#ef4444';
          const deltaLabel = deltaPp == null ? '' :
            `${deltaPp >= 0 ? '↑' : '↓'} ${Math.abs(deltaPp).toFixed(1)}pp`;
          return (
            <div key={h.hero_name} style={{
              padding: '10px 12px',
              background: 'var(--bg-secondary, var(--bg-base))',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}>
              <div className="font-serif" style={{
                fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
                fontFamily: 'var(--font-serif, serif)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{formatHeroName(h.hero_name)}</div>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4,
              }}>
                <span style={{
                  fontSize: 16, fontWeight: 700, color: 'var(--text-primary)',
                  fontFamily: 'var(--font-condensed, inherit)',
                }}>{wrPct}%</span>
                <span style={{
                  fontSize: 11, color: 'var(--text-muted)',
                  fontFamily: 'var(--font-condensed, inherit)',
                }}>WR · {h.picks} picks</span>
              </div>
              {deltaLabel && (
                <div style={{
                  fontSize: 10, color: deltaColor, marginTop: 2,
                  fontFamily: 'var(--font-condensed, inherit)',
                  textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600,
                }}>{deltaLabel} vs prev 7d</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
