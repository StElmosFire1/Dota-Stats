import React from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import { getHeroName, getHeroImageUrl } from '../heroNames';
import { TierBadge } from './Leaderboard';

// ProfileDemo — superuser-only page that renders a fully fabricated player
// profile so the v5.74 customization features (and the v5.75 backend that
// will land them in production) can be reviewed exactly as another player
// would see them when clicking a name on /leaderboard. Pure mock data —
// nothing is fetched, nothing is persisted.

const FAKE = {
  account_id: 99999999,
  display_name: 'StElmosFire',
  steam_id: '76561197960287930',
  rank_tier: 75, // Ancient 5
  mmr: 4280,
  matches_played: 312,
  wins: 188,
  losses: 124,
  avg_kda: 3.42,
  avg_imp: 6.8,
  current_streak: 5, // win streak
  // v5.74 customization payload (mirrors what /api/player/:id/profile-card
  // will return once the v5.75 backend ships)
  customization: {
    custom_title: 'King of Mid',
    bio: "Mid or feed. Probably both. DM me about coaching, I'm cheap and grumpy.",
    theme_accent: '#f59e0b',
    profile_frame: 'royal',
    pinned_hero_id: 32, // Riki
    pinned_hero_caption: 'Smoke or scream — pick one.',
    pinned_hero_border_color: '#a855f7',
    pinned_match: {
      match_id: 8003,
      player_won: true,
      hero: 'Faceless Void',
      hero_id: 41,
      kills: 21, deaths: 6, assists: 9,
      radiant_score: 51, dire_score: 22, side: 'dire',
      duration: 32 * 60 + 8,
      date: '2026-05-02',
    },
    pinned_achievement: { id: 'comeback', emoji: '🔥', label: 'Comeback King', sub: 'Won 10 games down 15k+ gold' },
    flair_auto: 'Mid Threat',
    flair_override: 'King of Mid Lane',
    flair_unlocked: true,
    frame_animated: true,
    bg_pattern: true,
    socials: {
      twitch: 'https://twitch.tv/stelmosfire',
      youtube: 'https://youtube.com/@stelmosfire',
      steam: 'https://steamcommunity.com/id/stelmosfire',
    },
  },
  hero_stats: { 32: { games: 47, wins: 28, kda: 3.88, avgK: 9.1, avgD: 5.2, avgA: 11.8 } },
  top_heroes: [
    { hero_id: 32, games: 47, wins: 28 }, // Riki
    { hero_id: 14, games: 41, wins: 24 }, // Pudge
    { hero_id: 41, games: 33, wins: 21 }, // FV
  ],
  recent_matches: [
    { match_id: 8001, hero_id: 14, kills: 18, deaths: 4,  assists: 11, win: true,  date: '2026-05-04', radiant_score: 32, dire_score: 18, duration: 38*60+14 },
    { match_id: 8002, hero_id: 32, kills: 9,  deaths: 8,  assists: 16, win: false, date: '2026-05-03', radiant_score: 28, dire_score: 41, duration: 44*60+22 },
    { match_id: 8003, hero_id: 41, kills: 21, deaths: 6,  assists: 9,  win: true,  date: '2026-05-02', radiant_score: 51, dire_score: 22, duration: 32*60+8 },
    { match_id: 8004, hero_id: 9,  kills: 4,  deaths: 12, assists: 19, win: false, date: '2026-05-01', radiant_score: 19, dire_score: 35, duration: 51*60+47 },
    { match_id: 8005, hero_id: 32, kills: 14, deaths: 5,  assists: 8,  win: true,  date: '2026-04-30', radiant_score: 38, dire_score: 24, duration: 35*60+12 },
    { match_id: 8006, hero_id: 32, kills: 11, deaths: 7,  assists: 12, win: true,  date: '2026-04-29', radiant_score: 42, dire_score: 30, duration: 41*60+8 },
  ],
};

function fmtDuration(s) {
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

function SocialChip({ kind, url, bg, emoji }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 999,
      background: bg, color: '#fff', textDecoration: 'none',
      fontSize: 12, fontWeight: 700,
    }}>
      <span>{emoji}</span> {kind}
    </a>
  );
}

export default function ProfileDemo() {
  const { isSuperuser } = useSuperuser();

  if (!isSuperuser) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', padding: 24, textAlign: 'center' }}>
        <h1>🚫 Admin only</h1>
        <p>The Profile Demo is a superuser-only preview surface.</p>
        <Link to="/admin" className="btn btn-primary">Go to Admin Panel</Link>
      </div>
    );
  }

  const p = FAKE;
  const c = p.customization;
  const accent = c.theme_accent || '#3b82f6';
  const winRate = Math.round((p.wins / p.matches_played) * 100);
  const heroStats = c.pinned_hero_id ? p.hero_stats[c.pinned_hero_id] : null;
  const ach = c.pinned_achievement;
  const flairToShow = c.flair_unlocked && c.flair_override ? c.flair_override : c.flair_auto;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      {/* Banner — explains this is a mock so nobody mistakes it for real */}
      <div style={{
        marginBottom: 14, padding: '10px 14px', borderRadius: 8,
        background: 'rgba(245,158,11,0.12)', border: '1px dashed rgba(245,158,11,0.6)',
        fontSize: 13, color: '#fbbf24',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <strong>👤 Profile Demo (mock)</strong> — fabricated player, no real data.
          This shows what a fully-decorated public player profile will look like to a visitor
          clicking from <code>/leaderboard</code>, once the v5.75 customization backend ships.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/admin/profile-sandbox" className="btn btn-sm">→ Sandbox editor</Link>
          <Link to="/admin" className="btn btn-sm">← Admin</Link>
        </div>
      </div>

      {/* === HEADER CARD === Mirrors PlayerProfile.jsx layout but with v5.74
            customizations layered on top. */}
      <div style={{
        position: 'relative',
        borderRadius: 14, padding: 20, marginBottom: 16,
        background: c.bg_pattern
          ? `repeating-linear-gradient(45deg, ${accent}10 0 6px, transparent 6px 14px), linear-gradient(180deg, ${accent}1f 0%, var(--bg-card) 80%)`
          : `linear-gradient(180deg, ${accent}1f 0%, var(--bg-card) 80%)`,
        borderLeft: `4px solid ${accent}`,
        border: `1px solid ${accent}55`,
        ...(c.frame_animated ? { animation: 'profileDemoShimmer 2.4s ease-in-out infinite' } : {}),
      }}>
        <style>{`
          @keyframes profileDemoShimmer {
            0%, 100% { box-shadow: 0 0 0 0 ${accent}00; }
            50%       { box-shadow: 0 0 26px 2px ${accent}66; }
          }
        `}</style>

        {/* Name row + tier badge + flair + streak */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: `linear-gradient(135deg, ${accent} 0%, ${accent}66 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, color: '#fff', flexShrink: 0,
            border: '2px solid var(--border)',
          }}>
            {p.display_name.slice(0, 1).toUpperCase()}
          </div>

          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{
                margin: 0, fontSize: 30, fontWeight: 800,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-serif, inherit)',
              }}>{p.display_name}</h1>
              {c.custom_title && (
                <span style={{
                  fontSize: 14, fontWeight: 700, letterSpacing: 0.5,
                  color: accent, textTransform: 'uppercase',
                }}>{c.custom_title}</span>
              )}
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <TierBadge mmr={p.mmr} />
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
                background: `${accent}22`, color: accent, border: `1px solid ${accent}66`,
              }}>
                ✦ {flairToShow}
              </span>
              {p.current_streak >= 3 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
                  background: 'rgba(34,197,94,0.18)', color: '#22c55e',
                  border: '1px solid rgba(34,197,94,0.5)',
                }}>
                  🔥 {p.current_streak}-game win streak
                </span>
              )}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              Account #{p.account_id} · Steam {p.steam_id}
            </div>
          </div>

          {/* Headline stats */}
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Stat label="MMR"        value={p.mmr.toLocaleString()} accent={accent} />
            <Stat label="Win rate"   value={`${winRate}%`} accent={winRate >= 55 ? '#22c55e' : '#f59e0b'} />
            <Stat label="W / L"      value={`${p.wins} / ${p.losses}`} />
            <Stat label="Avg KDA"    value={p.avg_kda.toFixed(2)} />
            <Stat label="Impact"     value={p.avg_imp.toFixed(1)} accent={accent} />
          </div>
        </div>

        {/* Bio */}
        {c.bio && (
          <div style={{
            marginTop: 14, padding: '8px 14px',
            borderLeft: `2px solid ${accent}66`,
            background: 'rgba(255,255,255,0.02)',
            fontSize: 14, fontStyle: 'italic', color: 'var(--text-secondary)',
          }}>
            “{c.bio}”
          </div>
        )}

        {/* Pinned cards row */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          {c.pinned_hero_id && (
            <div style={{
              display: 'flex', gap: 12, alignItems: 'center',
              padding: '10px 14px', borderRadius: 10,
              background: 'var(--bg-card)', border: `1px solid ${accent}55`,
              minWidth: 230,
            }}>
              <img
                src={getHeroImageUrl(c.pinned_hero_id)}
                alt=""
                style={{
                  width: 64, height: 36, borderRadius: 4,
                  ...(c.pinned_hero_border_color
                    ? { border: `3px solid ${c.pinned_hero_border_color}`, boxShadow: `0 0 10px ${c.pinned_hero_border_color}66` }
                    : {}),
                }}
              />
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>📌 Pinned hero</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{getHeroName(c.pinned_hero_id) || `#${c.pinned_hero_id}`}</div>
                {heroStats && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, fontFamily: 'monospace' }}>
                    <span>
                      <span style={{ color: 'var(--text-muted)' }}>WR </span>
                      <strong style={{ color: heroStats.wins / heroStats.games >= 0.55 ? '#22c55e' : '#f59e0b' }}>
                        {Math.round((heroStats.wins / heroStats.games) * 100)}%
                      </strong>
                    </span>
                    <span>
                      <span style={{ color: 'var(--text-muted)' }}>KDA </span>
                      <strong>{heroStats.kda.toFixed(2)}</strong>
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>{heroStats.games}g</span>
                  </div>
                )}
                {c.pinned_hero_caption && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                    “{c.pinned_hero_caption}”
                  </div>
                )}
              </div>
            </div>
          )}

          {c.pinned_match && (
            <div style={{
              padding: '10px 14px', borderRadius: 10,
              background: 'var(--bg-card)', border: `1px solid ${accent}55`,
              minWidth: 240,
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>📌 Pinned match</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{
                  fontWeight: 800, fontSize: 13, padding: '2px 8px', borderRadius: 4,
                  background: c.pinned_match.player_won ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
                  color: c.pinned_match.player_won ? '#22c55e' : '#ef4444',
                }}>
                  {c.pinned_match.player_won ? '✓ WIN' : '✗ LOSS'}
                </span>
                <span style={{ fontSize: 13, fontFamily: 'monospace' }}>
                  <span style={{ color: '#22c55e' }}>{c.pinned_match.radiant_score}</span>
                  <span style={{ color: 'var(--text-muted)' }}> – </span>
                  <span style={{ color: '#ef4444' }}>{c.pinned_match.dire_score}</span>
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDuration(c.pinned_match.duration)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <img src={getHeroImageUrl(c.pinned_match.hero_id)} alt="" style={{ width: 40, height: 22, borderRadius: 3 }} />
                <span style={{ fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>as </span>
                  <strong>{c.pinned_match.hero}</strong>
                </span>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                  {c.pinned_match.kills}/{c.pinned_match.deaths}/{c.pinned_match.assists}
                </span>
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                #{c.pinned_match.match_id} · {c.pinned_match.date}
              </div>
            </div>
          )}

          {ach && (
            <div style={{
              padding: '10px 14px', borderRadius: 10,
              background: 'var(--bg-card)', border: `1px solid ${accent}55`,
              minWidth: 200,
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>🏆 Pinned achievement</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <span style={{ fontSize: 28 }}>{ach.emoji}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{ach.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ach.sub}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Linked socials */}
        {(c.socials?.twitch || c.socials?.youtube || c.socials?.steam) && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {c.socials.twitch  && <SocialChip kind="Twitch"  url={c.socials.twitch}  bg="#9146FF" emoji="📺" />}
            {c.socials.youtube && <SocialChip kind="YouTube" url={c.socials.youtube} bg="#FF0000" emoji="▶️" />}
            {c.socials.steam   && <SocialChip kind="Steam"   url={c.socials.steam}   bg="#1b2838" emoji="🎮" />}
          </div>
        )}

        {/* Top heroes auto strip */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>
            Most-played heroes
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {p.top_heroes.map(h => {
              const wr = Math.round((h.wins / h.games) * 100);
              return (
                <div key={h.hero_id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 10px', borderRadius: 6,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                }}>
                  <img src={getHeroImageUrl(h.hero_id)} alt="" style={{ width: 36, height: 20, borderRadius: 2 }} />
                  <div style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 700 }}>{getHeroName(h.hero_id)}</div>
                    <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {h.games}g · <span style={{ color: wr >= 55 ? '#22c55e' : '#f59e0b' }}>{wr}% WR</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* === RECENT MATCHES === Plain table, illustrative only */}
      <div style={{
        borderRadius: 12, padding: 16,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
      }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>Recent matches (mock)</h2>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '6px 8px' }}>Match</th>
              <th style={{ padding: '6px 8px' }}>Hero</th>
              <th style={{ padding: '6px 8px' }}>Result</th>
              <th style={{ padding: '6px 8px' }}>K / D / A</th>
              <th style={{ padding: '6px 8px' }}>Score</th>
              <th style={{ padding: '6px 8px' }}>Length</th>
              <th style={{ padding: '6px 8px' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {p.recent_matches.map(m => (
              <tr key={m.match_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>#{m.match_id}</td>
                <td style={{ padding: '6px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <img src={getHeroImageUrl(m.hero_id)} alt="" style={{ width: 30, height: 17, borderRadius: 2 }} />
                    {getHeroName(m.hero_id)}
                  </div>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <span style={{
                    padding: '1px 8px', borderRadius: 4, fontWeight: 700,
                    background: m.win ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
                    color: m.win ? '#22c55e' : '#ef4444',
                  }}>{m.win ? 'WIN' : 'LOSS'}</span>
                </td>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{m.kills}/{m.deaths}/{m.assists}</td>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>
                  <span style={{ color: '#22c55e' }}>{m.radiant_score}</span>
                  <span style={{ color: 'var(--text-muted)' }}> – </span>
                  <span style={{ color: '#ef4444' }}>{m.dire_score}</span>
                </td>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{fmtDuration(m.duration)}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{m.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 18, fontSize: 12, color: 'var(--text-muted)' }}>
        ↑ This page is the closest visual approximation to what the v5.75 backend will render
        on the real <code>/player/:account_id</code> page once the new <code>player_profiles</code>
        columns and the auto-flair service ship. Tweak the <code>FAKE</code> object in
        <code>web/src/pages/ProfileDemo.jsx</code> to test other configurations.
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ minWidth: 80, textAlign: 'right' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent || 'var(--text-primary)', fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}
