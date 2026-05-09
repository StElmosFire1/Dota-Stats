import React from 'react';
import { Link } from 'react-router-dom';
import { getHeroName, getHeroImageUrl } from '../heroNames';
import { FRAME_META, DEFAULT_THEME } from '../profileCosmetics';

function fmtDuration(s) {
  if (s == null) return '';
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

function SocialChip({ kind, url, bg, emoji }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999,
      background: bg, color: '#fff', textDecoration: 'none',
      fontSize: 12, fontWeight: 700,
    }}>
      <span>{emoji}</span> {kind}
    </a>
  );
}

/**
 * Shared profile card. Renders the polished serif-name lockup with a brass
 * left-rule accent in the player's chosen theme, optional flair + streak
 * chips inline with the name, an integrated pinned-hero tile (with live
 * WR / KDA / games-played), and the pinned-match / pinned-achievement /
 * top-heroes / social chips / background pattern affordances.
 *
 * Used by the public PlayerProfile page (as the page header) and by the
 * Settings → Profile editor preview, so what the player sees while editing
 * is what visitors see. Sandbox uses the same component.
 *
 * Props
 *  - displayName: string
 *  - customization: object — the /api/player/:id/profile-card payload shape
 *      {
 *        bio, custom_title, theme_accent, profile_frame,
 *        pinned_hero_id, pinned_hero_caption,
 *        extras: {
 *          pinned_hero_border, pinned_achievement_id, flair_unlocked,
 *          flair_override, show_top_heroes, show_streak, frame_animated,
 *          bg_pattern, social_twitch, social_youtube, social_steam,
 *        },
 *      }
 *  - pinnedHero: { hero_id, name, games, wins, kda, caption, borderColor } | null
 *  - pinnedMatch: { match_id, hero_id, hero, kills, deaths, assists,
 *                   player_won, duration, start_time, radiantScore?, direScore? } | null
 *  - pinnedAchievement: { emoji, label, sub } | null
 *  - topHeroes: [{ hero_id, games, wins }] (already sliced to ≤5)
 *  - streak: number | null  (positive = win streak, negative = loss streak)
 *  - flairAuto: string | null (server-derived auto flair)
 *  - frame: string ('none' | 'silver' | …)
 *  - nameAdornments: ReactNode — small badges to show beside the name (ProBadge, MmrBadge, …)
 *  - headerExtras: ReactNode — optional row of buttons rendered below the card
 */
export default function ProfileCard({
  displayName,
  customization = {},
  pinnedHero = null,
  pinnedMatch = null,
  pinnedAchievement = null,
  topHeroes = [],
  streak = null,
  flairAuto = null,
  frame = 'none',
  nameAdornments = null,
  headerExtras = null,
}) {
  const c = customization || {};
  const ex = c.extras || {};
  const accent = c.theme_accent || DEFAULT_THEME;
  const frameId = frame || c.profile_frame || 'none';
  const meta = FRAME_META[frameId] || {};
  const flairToShow = (ex.flair_unlocked && ex.flair_override) ? ex.flair_override : flairAuto;
  const showStreak = ex.show_streak !== false && streak != null && Math.abs(streak) >= 3;
  const showTopHeroes = ex.show_top_heroes !== false && Array.isArray(topHeroes) && topHeroes.length > 0;

  const card = (
    <div style={{
      borderRadius: 14, padding: 18,
      background: ex.bg_pattern
        ? `repeating-linear-gradient(45deg, ${accent}08 0 6px, transparent 6px 14px), linear-gradient(180deg, ${accent}22 0%, var(--bg-card) 80%)`
        : `linear-gradient(180deg, ${accent}22 0%, var(--bg-card) 80%)`,
      borderLeft: `4px solid ${accent}`,
      ...(meta.style || { border: '1px solid var(--border)' }),
      ...(ex.frame_animated ? { animation: 'profileFrameShimmer 2.4s ease-in-out infinite' } : {}),
    }}>
      <style>{`
        @keyframes profileFrameShimmer {
          0%, 100% { box-shadow: 0 0 0 0 ${accent}00; }
          50%       { box-shadow: 0 0 22px 2px ${accent}55; }
        }
      `}</style>

      {/* Name + custom title eyebrow + nameAdornments (badges) */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{
          fontSize: 26, fontWeight: 800, color: 'var(--text-primary)',
          fontFamily: 'var(--font-serif, inherit)',
        }}>
          {displayName}
        </div>
        {c.custom_title && (
          <div style={{ fontSize: 14, color: accent, fontWeight: 700, letterSpacing: 0.5 }}>
            {c.custom_title}
          </div>
        )}
        {nameAdornments && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {nameAdornments}
          </div>
        )}
      </div>

      {/* Flair + streak chip row */}
      {(flairToShow || showStreak) && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {flairToShow && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
              background: `${accent}22`, color: accent, border: `1px solid ${accent}66`,
              letterSpacing: 0.5,
            }}>
              ✦ {flairToShow}
              {(ex.flair_unlocked && ex.flair_override)
                ? null
                : <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 4 }}>(auto)</span>}
            </span>
          )}
          {showStreak && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
              background: streak > 0 ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
              color: streak > 0 ? '#22c55e' : '#ef4444',
              border: `1px solid ${streak > 0 ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'}`,
            }}>
              {streak > 0 ? '🔥' : '❄️'} {Math.abs(streak)}-game {streak > 0 ? 'win' : 'loss'} streak
            </span>
          )}
        </div>
      )}

      {c.bio && (
        <div style={{
          fontSize: 14, color: 'var(--text-secondary, var(--text-muted))', marginTop: 10, fontStyle: 'italic',
          padding: '8px 12px', borderLeft: `2px solid ${accent}55`, background: 'rgba(255,255,255,0.02)',
        }}>
          “{c.bio}”
        </div>
      )}

      {/* Pinned cards row */}
      {(pinnedHero || pinnedMatch || pinnedAchievement) && (
        <div style={{ display: 'flex', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
          {pinnedHero && (
            <div style={{
              display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px',
              border: `1px solid ${accent}55`, borderRadius: 8, background: 'var(--bg-card)',
              minWidth: 230,
            }}>
              <img
                src={getHeroImageUrl(pinnedHero.hero_id)}
                alt=""
                style={{
                  width: 64, height: 36, borderRadius: 4,
                  ...(pinnedHero.borderColor
                    ? { border: `3px solid ${pinnedHero.borderColor}`, boxShadow: `0 0 8px ${pinnedHero.borderColor}66` }
                    : {}),
                }}
              />
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>Pinned hero</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {pinnedHero.name || getHeroName(pinnedHero.hero_id) || `#${pinnedHero.hero_id}`}
                </div>
                {pinnedHero.games > 0 && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, fontFamily: 'monospace' }}>
                    <span>
                      <span style={{ color: 'var(--text-muted)' }}>WR </span>
                      <strong style={{ color: (pinnedHero.wins / pinnedHero.games) >= 0.55 ? '#22c55e' : '#f59e0b' }}>
                        {Math.round((pinnedHero.wins / pinnedHero.games) * 100)}%
                      </strong>
                    </span>
                    {pinnedHero.kda != null && (
                      <span>
                        <span style={{ color: 'var(--text-muted)' }}>KDA </span>
                        <strong style={{ color: 'var(--text-primary)' }}>{Number(pinnedHero.kda).toFixed(2)}</strong>
                      </span>
                    )}
                    <span style={{ color: 'var(--text-muted)' }}>{pinnedHero.games}g</span>
                  </div>
                )}
                {pinnedHero.caption && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                    “{pinnedHero.caption}”
                  </div>
                )}
              </div>
            </div>
          )}

          {pinnedMatch && (
            <Link
              to={`/match/${pinnedMatch.match_id}`}
              style={{
                padding: '10px 14px', border: `1px solid ${accent}55`, borderRadius: 8,
                background: 'var(--bg-card)', minWidth: 220,
                textDecoration: 'none', color: 'inherit', display: 'block',
              }}
            >
              <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>Pinned match</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                {pinnedMatch.player_won != null && (
                  <span style={{
                    fontWeight: 800, fontSize: 13, padding: '2px 8px', borderRadius: 4,
                    background: pinnedMatch.player_won ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
                    color: pinnedMatch.player_won ? '#22c55e' : '#ef4444',
                  }}>
                    {pinnedMatch.player_won ? '✓ WIN' : '✗ LOSS'}
                  </span>
                )}
                {pinnedMatch.radiantScore != null && pinnedMatch.direScore != null && (
                  <span style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                    <span style={{ color: '#22c55e' }}>{pinnedMatch.radiantScore}</span>
                    <span style={{ color: 'var(--text-muted)' }}> – </span>
                    <span style={{ color: '#ef4444' }}>{pinnedMatch.direScore}</span>
                  </span>
                )}
                {pinnedMatch.duration != null && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDuration(pinnedMatch.duration)}</span>
                )}
              </div>
              {pinnedMatch.hero_id != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <img src={getHeroImageUrl(pinnedMatch.hero_id)} alt="" style={{ width: 40, height: 22, borderRadius: 3 }} />
                  <span style={{ fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>as </span>
                    <strong>{pinnedMatch.hero || getHeroName(pinnedMatch.hero_id) || `#${pinnedMatch.hero_id}`}</strong>
                  </span>
                  {pinnedMatch.kills != null && (
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      {pinnedMatch.kills}/{pinnedMatch.deaths}/{pinnedMatch.assists}
                    </span>
                  )}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                #{pinnedMatch.match_id}
                {pinnedMatch.start_time
                  ? ` · ${new Date(pinnedMatch.start_time * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : ''}
              </div>
            </Link>
          )}

          {pinnedAchievement && (
            <div style={{
              padding: '10px 14px', border: `1px solid ${accent}55`, borderRadius: 8,
              background: 'var(--bg-card)', minWidth: 200,
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>Pinned achievement</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <span style={{ fontSize: 26 }}>{pinnedAchievement.emoji || '🏆'}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{pinnedAchievement.label}</div>
                  {pinnedAchievement.sub && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pinnedAchievement.sub}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top heroes auto-strip — chips are sized to fill the card width on a
          single row at desktop widths, with a hero portrait, name, KDA when
          available, games-played, and a thin win-rate progress bar so the
          strip carries actual signal instead of just listing five names. */}
      {showTopHeroes && (
        <div style={{ marginTop: 18 }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            marginBottom: 8, gap: 8, flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>
              Most-played heroes
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 0.5 }}>
              Top {topHeroes.length} · ranked by games played
            </div>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`,
            gap: 10,
          }}>
            {topHeroes.map((h, idx) => {
              const games = h.games || 0;
              const wins = h.wins || 0;
              const losses = Math.max(0, games - wins);
              const wr = games ? Math.round((wins / games) * 100) : 0;
              const kda = h.kda != null && Number.isFinite(Number(h.kda)) ? Number(h.kda).toFixed(2) : null;
              const wrColor = wr >= 60 ? '#22c55e' : wr >= 50 ? '#84cc16' : wr >= 40 ? '#f59e0b' : '#ef4444';
              return (
                <div key={h.hero_id} style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  padding: '8px 10px', borderRadius: 8,
                  background: 'var(--bg-card)', border: `1px solid ${accent}33`,
                  position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', top: 4, right: 6,
                    fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
                    fontFamily: 'monospace', letterSpacing: 0.5,
                  }}>#{idx + 1}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img
                      src={getHeroImageUrl(h.hero_id)}
                      alt=""
                      style={{ width: 52, height: 30, borderRadius: 3, flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {getHeroName(h.hero_id) || `#${h.hero_id}`}
                      </div>
                      <div style={{
                        fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace',
                        marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap',
                      }}>
                        <span>{games}g</span>
                        <span>{wins}W·{losses}L</span>
                        {kda && <span>{kda} KDA</span>}
                      </div>
                    </div>
                  </div>
                  <div title={`${wr}% win rate over ${games} games`} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <div style={{
                      flex: 1, height: 4, borderRadius: 2,
                      background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${wr}%`, height: '100%', background: wrColor,
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: wrColor,
                      fontFamily: 'monospace', minWidth: 30, textAlign: 'right',
                    }}>{wr}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Linked socials */}
      {(ex.social_twitch || ex.social_youtube || ex.social_steam) && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ex.social_twitch && <SocialChip kind="Twitch" url={ex.social_twitch} bg="#9146FF" emoji="📺" />}
          {ex.social_youtube && <SocialChip kind="YouTube" url={ex.social_youtube} bg="#FF0000" emoji="▶️" />}
          {ex.social_steam && <SocialChip kind="Steam" url={ex.social_steam} bg="#1b2838" emoji="🎮" />}
        </div>
      )}
    </div>
  );

  if (!headerExtras) return card;
  return (
    <div>
      {card}
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        {headerExtras}
      </div>
    </div>
  );
}
