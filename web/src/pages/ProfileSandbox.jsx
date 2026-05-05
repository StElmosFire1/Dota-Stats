import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import { ALL_HEROES, getHeroName, getHeroImageUrl } from '../heroNames';
import {
  FREE_TITLES, PREMIUM_TITLES,
  FREE_THEMES, PREMIUM_THEMES,
  FREE_FRAMES, PREMIUM_FRAMES,
  BIO_MAX, PINNED_HERO_CAPTION_MAX, DEFAULT_THEME, DEFAULT_FRAME, FRAME_META,
} from '../profileCosmetics';

const SAMPLE_RECENT_MATCHES = [
  { match_id: 8001, hero_id: 14, kills: 18, deaths: 4, assists: 11, win: true,  date: '2026-05-04' },
  { match_id: 8002, hero_id: 32, kills: 9,  deaths: 8, assists: 16, win: false, date: '2026-05-03' },
  { match_id: 8003, hero_id: 41, kills: 21, deaths: 6, assists: 9,  win: true,  date: '2026-05-02' },
  { match_id: 8004, hero_id: 9,  kills: 4,  deaths: 12, assists: 19, win: false, date: '2026-05-01' },
];

function FullPreviewCard({ displayName, c, frame }) {
  const accent = c.theme_accent || DEFAULT_THEME;
  const meta = FRAME_META[frame] || {};
  return (
    <div style={{
      borderRadius: 14, padding: 18,
      background: `linear-gradient(180deg, ${accent}22 0%, var(--bg-card) 80%)`,
      borderLeft: `4px solid ${accent}`,
      ...(meta.style || { border: '1px solid var(--border)' }),
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1.5, marginBottom: 6, textTransform: 'uppercase' }}>
        Live Preview · profile card
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-serif, inherit)' }}>
          {displayName}
        </div>
        {c.custom_title && (
          <div style={{ fontSize: 14, color: accent, fontWeight: 700, letterSpacing: 0.5 }}>
            {c.custom_title}
          </div>
        )}
      </div>
      {c.bio && (
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 10, fontStyle: 'italic',
          padding: '8px 12px', borderLeft: `2px solid ${accent}55`, background: 'rgba(255,255,255,0.02)' }}>
          “{c.bio}”
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
        {c.pinned_hero_id && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px',
            border: `1px solid ${accent}55`, borderRadius: 8, background: 'var(--bg-card)',
          }}>
            <img src={getHeroImageUrl(c.pinned_hero_id)} alt="" style={{ width: 56, height: 32, borderRadius: 4 }} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>Pinned hero</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{getHeroName(c.pinned_hero_id) || `#${c.pinned_hero_id}`}</div>
              {c.pinned_hero_caption && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.pinned_hero_caption}</div>
              )}
            </div>
          </div>
        )}
        {c.pinned_match_id && (
          <div style={{
            padding: '8px 12px', border: `1px solid ${accent}55`, borderRadius: 8,
            background: 'var(--bg-card)', minWidth: 140,
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase' }}>Pinned match</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>#{c.pinned_match_id}</div>
          </div>
        )}
      </div>

      {/* Mock recent matches strip so the preview looks like a real profile */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>
          Recent matches (sample)
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SAMPLE_RECENT_MATCHES.map(m => (
            <div key={m.match_id} title={`${m.kills}/${m.deaths}/${m.assists}`} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 8px', borderRadius: 4,
              background: m.win ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${m.win ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
              fontSize: 12,
            }}>
              <img src={getHeroImageUrl(m.hero_id)} alt="" style={{ width: 28, height: 16, borderRadius: 2 }} />
              <span style={{ fontWeight: 700, color: m.win ? '#22c55e' : '#ef4444' }}>{m.win ? 'W' : 'L'}</span>
              <span style={{ color: 'var(--text-muted)' }}>{m.kills}/{m.deaths}/{m.assists}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ThemeSwatch({ color, selected, onClick }) {
  return (
    <button type="button" onClick={onClick} title={color}
      style={{
        width: 30, height: 30, borderRadius: 8,
        border: selected ? '3px solid #fff' : '1px solid var(--border)',
        background: color, cursor: 'pointer',
      }} />
  );
}

export default function ProfileSandbox() {
  const { isSuperuser } = useSuperuser();

  const [displayName, setDisplayName] = useState('TestPlayer');
  const [bio, setBio] = useState('Just a sandbox account testing every customization knob.');
  const [customTitle, setCustomTitle] = useState(FREE_TITLES[1] || '');
  const [themeAccent, setThemeAccent] = useState(DEFAULT_THEME);
  const [profileFrame, setProfileFrame] = useState(DEFAULT_FRAME);
  const [pinnedHeroId, setPinnedHeroId] = useState('14');
  const [pinnedHeroSearch, setPinnedHeroSearch] = useState('Pudge');
  const [pinnedHeroCaption, setPinnedHeroCaption] = useState('My signature pick');
  const [pinnedMatchId, setPinnedMatchId] = useState('8001');
  const [proPreview, setProPreview] = useState(true);

  const heroOptions = (() => {
    const q = pinnedHeroSearch.trim().toLowerCase();
    if (!q) return [];
    return ALL_HEROES.filter(h => h.name.toLowerCase().includes(q)).slice(0, 8);
  })();

  if (!isSuperuser) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', padding: 24, textAlign: 'center' }}>
        <h1>🚫 Admin only</h1>
        <p>The Profile Sandbox is a superuser-only diagnostic tool.</p>
        <Link to="/admin" className="btn btn-primary">Go to Admin Panel</Link>
      </div>
    );
  }

  const customization = {
    bio, custom_title: customTitle, theme_accent: themeAccent,
    pinned_hero_id: pinnedHeroId ? parseInt(pinnedHeroId, 10) : null,
    pinned_hero_caption: pinnedHeroCaption,
    pinned_match_id: pinnedMatchId ? parseInt(pinnedMatchId, 10) : null,
  };

  function reset() {
    setDisplayName('TestPlayer');
    setBio('Just a sandbox account testing every customization knob.');
    setCustomTitle(FREE_TITLES[1] || '');
    setThemeAccent(DEFAULT_THEME);
    setProfileFrame(DEFAULT_FRAME);
    setPinnedHeroId('14'); setPinnedHeroSearch('Pudge');
    setPinnedHeroCaption('My signature pick');
    setPinnedMatchId('8001');
  }

  const inputStyle = {
    width: '100%', padding: 10, borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    color: 'var(--text-primary)', fontSize: 14,
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>👤 Profile Sandbox</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={reset}>↺ Reset to defaults</button>
          <Link to="/admin" className="btn btn-sm">← Back to Admin Panel</Link>
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 0, marginBottom: 18 }}>
        Fully interactive test profile with every customization control wired up. Edit on the right —
        the live preview updates on the left. <strong>Nothing here is persisted</strong>: this is a
        pure client-side simulator of <code>/settings/profile</code>, useful for verifying how a
        change to the cosmetic options or theme will render before exposing it to real users.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: 20 }}>
        {/* PREVIEW */}
        <div style={{ position: 'sticky', top: 16, alignSelf: 'flex-start' }}>
          <FullPreviewCard displayName={displayName} c={customization} frame={profileFrame} />
          <div style={{
            marginTop: 14, padding: 12, borderRadius: 8,
            background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)',
          }}>
            <strong>Frame:</strong> {profileFrame || 'default'} ·
            <strong> Accent:</strong> <code>{themeAccent}</code> ·
            <strong> Pro mode:</strong> {proPreview ? 'on (premium options unlocked)' : 'off'}
          </div>
        </div>

        {/* EDITOR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Display name (mock)</h2>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} style={inputStyle} />
          </section>

          <section>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Pro preview</h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={proPreview} onChange={e => setProPreview(e.target.checked)} />
              Treat sandbox account as Pro (unlocks premium titles / themes / frames)
            </label>
          </section>

          <section>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Bio ({bio.length}/{BIO_MAX})</h2>
            <textarea
              value={bio} onChange={e => setBio(e.target.value.slice(0, BIO_MAX))}
              rows={3} style={{ ...inputStyle, resize: 'vertical' }}
            />
          </section>

          <section>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Custom title</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {FREE_TITLES.map(t => (
                <label key={t || '__none__'} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                  <input type="radio" name="title" value={t} checked={customTitle === t} onChange={() => setCustomTitle(t)} />
                  <span>{t || <em style={{ color: 'var(--text-muted)' }}>(no title)</em>}</span>
                </label>
              ))}
              {PREMIUM_TITLES.map(t => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: proPreview ? 'pointer' : 'not-allowed', opacity: proPreview ? 1 : 0.5, fontSize: 14 }}>
                  <input type="radio" name="title" value={t} disabled={!proPreview} checked={customTitle === t} onChange={() => proPreview && setCustomTitle(t)} />
                  <span>{t}</span>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#3b2a08', color: '#fbbf24', fontWeight: 700 }}>🔒 PRO</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Theme accent</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {FREE_THEMES.map(c => (
                <ThemeSwatch key={c} color={c} selected={themeAccent === c} onClick={() => setThemeAccent(c)} />
              ))}
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>Pro:</span>
              {PREMIUM_THEMES.map(c => (
                <button key={c} type="button" disabled={!proPreview} onClick={() => proPreview && setThemeAccent(c)}
                  style={{
                    width: 30, height: 30, borderRadius: 8, background: c,
                    border: themeAccent === c ? '3px solid #fff' : '1px solid var(--border)',
                    opacity: proPreview ? 1 : 0.4, cursor: proPreview ? 'pointer' : 'not-allowed',
                  }} />
              ))}
            </div>
          </section>

          <section>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Profile frame</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {FREE_FRAMES.map(f => {
                const m = FRAME_META[f] || {};
                const sel = profileFrame === f;
                return (
                  <button key={f} type="button" onClick={() => setProfileFrame(f)}
                    style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      background: sel ? 'rgba(245,158,11,0.18)' : 'var(--bg-card)',
                      border: sel ? '2px solid var(--accent, #f59e0b)' : '1px solid var(--border)',
                      color: sel ? 'var(--accent, #f59e0b)' : 'var(--text-primary)',
                      cursor: 'pointer', ...m.style,
                    }}>{m.label || f}</button>
                );
              })}
              {PREMIUM_FRAMES.map(f => {
                const m = FRAME_META[f] || {};
                const sel = profileFrame === f;
                return (
                  <button key={f} type="button" disabled={!proPreview} onClick={() => proPreview && setProfileFrame(f)}
                    style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      background: sel ? 'rgba(168,85,247,0.18)' : 'rgba(168,85,247,0.05)',
                      border: sel ? '2px solid #a855f7' : '1px dashed rgba(168,85,247,0.5)',
                      color: '#a855f7', cursor: proPreview ? 'pointer' : 'not-allowed', opacity: proPreview ? 1 : 0.5,
                      ...m.style,
                    }}>{m.label || f} ★</button>
                );
              })}
            </div>
          </section>

          <section>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Pinned hero</h2>
            <input type="text" value={pinnedHeroSearch} placeholder="Search heroes…"
              onChange={e => setPinnedHeroSearch(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
            {heroOptions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {heroOptions.map(h => (
                  <button key={h.id} type="button"
                    onClick={() => { setPinnedHeroId(String(h.id)); setPinnedHeroSearch(h.name); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 8px', borderRadius: 6, fontSize: 12,
                      background: pinnedHeroId === String(h.id) ? 'rgba(245,158,11,0.18)' : 'var(--bg-card)',
                      border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer',
                    }}>
                    <img src={getHeroImageUrl(h.id)} alt="" style={{ width: 28, height: 16, borderRadius: 2 }} />
                    {h.name}
                  </button>
                ))}
              </div>
            )}
            <input type="text" placeholder="Pinned-hero caption (optional)"
              value={pinnedHeroCaption}
              onChange={e => setPinnedHeroCaption(e.target.value.slice(0, PINNED_HERO_CAPTION_MAX))}
              style={inputStyle} />
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
              {pinnedHeroCaption.length}/{PINNED_HERO_CAPTION_MAX}
            </div>
            <button className="btn btn-sm" type="button" style={{ marginTop: 8 }}
              onClick={() => { setPinnedHeroId(''); setPinnedHeroSearch(''); setPinnedHeroCaption(''); }}>
              Clear pinned hero
            </button>
          </section>

          <section>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Pinned match</h2>
            <select value={pinnedMatchId} onChange={e => setPinnedMatchId(e.target.value)} style={inputStyle}>
              <option value="">(none)</option>
              {SAMPLE_RECENT_MATCHES.map(m => (
                <option key={m.match_id} value={String(m.match_id)}>
                  #{m.match_id} — {getHeroName(m.hero_id)} {m.win ? 'W' : 'L'} {m.kills}/{m.deaths}/{m.assists}
                </option>
              ))}
            </select>
          </section>
        </div>
      </div>
    </div>
  );
}
