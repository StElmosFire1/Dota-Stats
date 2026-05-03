import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSteamAuth } from '../context/SteamAuthContext';
import OnboardingWizard from '../components/OnboardingWizard';
import { useFeatureFlag } from '../context/FeatureFlagsContext';
import { ALL_HEROES, getHeroName, getHeroImageUrl } from '../heroNames';
import {
  FREE_TITLES, PREMIUM_TITLES,
  FREE_THEMES, PREMIUM_THEMES,
  BIO_MAX, PINNED_HERO_CAPTION_MAX, DEFAULT_THEME,
} from '../profileCosmetics';

// Compact, dependency-free UI for editing /settings/profile. Renders three
// sections (basics / cosmetics / pins) plus a live preview card. The premium
// title + theme rows render with a lock icon and a tooltip pointing at the
// (future) Pro tier — selecting one is disabled while the player isn't Pro.

function LockedPill() {
  return (
    <span title="Reserved for Pro tier (coming soon)" style={{
      fontSize: 10, padding: '1px 6px', borderRadius: 999,
      background: '#3b2a08', color: '#fbbf24', border: '1px solid #fbbf2455',
      marginLeft: 6, fontWeight: 700, letterSpacing: 0.4,
    }}>🔒 PRO</span>
  );
}

function ThemeSwatch({ color, selected, locked, onClick }) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      disabled={locked}
      title={locked ? 'Reserved for Pro tier' : color}
      style={{
        width: 30, height: 30, borderRadius: 8, border: selected ? '3px solid #fff' : '1px solid var(--border)',
        background: color, cursor: locked ? 'not-allowed' : 'pointer',
        opacity: locked ? 0.45 : 1, position: 'relative',
      }}
    >
      {locked && <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.6)',
      }}>🔒</span>}
    </button>
  );
}

function PreviewCard({ displayName, customization }) {
  const accent = customization.theme_accent || DEFAULT_THEME;
  return (
    <div style={{
      borderRadius: 10, border: '1px solid var(--border)', padding: 14,
      background: `linear-gradient(180deg, ${accent}22 0%, var(--bg-card) 80%)`,
      borderLeft: `4px solid ${accent}`,
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Live preview</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
        {displayName}
      </div>
      {customization.custom_title && (
        <div style={{ fontSize: 13, color: accent, fontWeight: 600, marginTop: 2 }}>
          {customization.custom_title}
        </div>
      )}
      {customization.bio && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
          “{customization.bio}”
        </div>
      )}
      {(customization.pinned_hero_id || customization.pinned_match_id) && (
        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          {customization.pinned_hero_id && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 10px',
              border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-card)' }}>
              <img src={getHeroImageUrl(customization.pinned_hero_id)} alt="" style={{ width: 36, height: 20, borderRadius: 3 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{getHeroName(customization.pinned_hero_id) || `#${customization.pinned_hero_id}`}</div>
                {customization.pinned_hero_caption && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{customization.pinned_hero_caption}</div>
                )}
              </div>
            </div>
          )}
          {customization.pinned_match_id && (
            <div style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6,
              background: 'var(--bg-card)', fontSize: 12 }}>
              📌 Pinned match #{customization.pinned_match_id}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SettingsProfile() {
  const { steamUser } = useSteamAuth() || {};
  const enabled = useFeatureFlag('profile_customization');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedMsg, setSavedMsg] = useState(null);
  const [isPro, setIsPro] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardResetting, setWizardResetting] = useState(false);

  const [bio, setBio] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [themeAccent, setThemeAccent] = useState(DEFAULT_THEME);
  const [pinnedHeroId, setPinnedHeroId] = useState('');
  const [pinnedHeroSearch, setPinnedHeroSearch] = useState('');
  const [pinnedHeroCaption, setPinnedHeroCaption] = useState('');
  const [pinnedMatchId, setPinnedMatchId] = useState('');

  const [ownMatches, setOwnMatches] = useState([]);

  const accountId = steamUser?.accountId;
  const displayName = steamUser?.displayName || (accountId ? `Player ${accountId}` : 'Your profile');

  const loadProfile = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/me/profile', { credentials: 'include' });
      if (res.status === 401) { setError('Sign in with Steam to customize your profile.'); setLoading(false); return; }
      if (res.status === 404) { setError('Profile customization is not enabled yet.'); setLoading(false); return; }
      if (!res.ok) throw new Error('Failed to load profile customization');
      const data = await res.json();
      setIsPro(!!data.is_pro);
      const c = data.customization || {};
      setBio(c.bio || '');
      setCustomTitle(c.custom_title || '');
      setThemeAccent(c.theme_accent || DEFAULT_THEME);
      setPinnedHeroId(c.pinned_hero_id ? String(c.pinned_hero_id) : '');
      setPinnedHeroCaption(c.pinned_hero_caption || '');
      setPinnedMatchId(c.pinned_match_id ? String(c.pinned_match_id) : '');
      if (c.pinned_hero_id) {
        setPinnedHeroSearch(getHeroName(c.pinned_hero_id) || '');
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { if (enabled && accountId) loadProfile(); }, [enabled, accountId, loadProfile]);

  // Pull the player's own matches for the pinned-match picker. Reuses the
  // existing /api/players/:id endpoint which returns recentMatches.
  useEffect(() => {
    if (!accountId) return;
    fetch(`/api/players/${accountId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.recentMatches) setOwnMatches(d.recentMatches);
      })
      .catch(() => {});
  }, [accountId]);

  const heroOptions = useMemo(() => {
    const q = pinnedHeroSearch.trim().toLowerCase();
    if (!q) return ALL_HEROES.slice(0, 0); // hide list until typing
    return ALL_HEROES.filter(h => h.name.toLowerCase().includes(q)).slice(0, 8);
  }, [pinnedHeroSearch]);

  const handleRedoWizard = async () => {
    setWizardResetting(true);
    try {
      const res = await fetch('/api/me/onboarding/reset', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Could not reset wizard (${res.status})`);
        setWizardResetting(false);
        return;
      }
      setShowWizard(true);
    } catch (e) { setError(e.message); }
    setWizardResetting(false);
  };

  const onSave = async () => {
    setSaving(true); setError(null); setSavedMsg(null);
    try {
      const body = {
        bio: bio || null,
        custom_title: customTitle || null,
        theme_accent: themeAccent || null,
        pinned_hero_id: pinnedHeroId || null,
        pinned_hero_caption: pinnedHeroCaption || null,
        pinned_match_id: pinnedMatchId || null,
      };
      const res = await fetch('/api/me/profile', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Save failed');
      }
      setSavedMsg('Profile saved.');
      setTimeout(() => setSavedMsg(null), 2500);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  if (!enabled) {
    return (
      <div className="container" style={{ maxWidth: 760, padding: '24px 16px' }}>
        {showWizard && (
          <OnboardingWizard
            onComplete={() => setShowWizard(false)}
            onDismiss={() => setShowWizard(false)}
          />
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
          <h1 style={{ margin: 0 }}>Profile Customization</h1>
          {accountId && (
            <button
              className="btn btn-small"
              onClick={handleRedoWizard}
              disabled={wizardResetting}
              title="Redo the onboarding setup wizard"
              style={{ fontSize: 13, opacity: 0.8 }}
            >
              {wizardResetting ? 'Loading…' : '🔁 Redo setup wizard'}
            </button>
          )}
        </div>
        {error && <div className="error-state" style={{ margin: '12px 0' }}>{error}</div>}
        <p>Profile customization is not enabled yet.</p>
      </div>
    );
  }
  if (!accountId) {
    return (
      <div className="container" style={{ maxWidth: 760, padding: '24px 16px' }}>
        <h1>Profile Customization</h1>
        <p>Sign in with Steam to customize your profile.</p>
      </div>
    );
  }

  const previewCustomization = {
    bio, custom_title: customTitle, theme_accent: themeAccent,
    pinned_hero_id: pinnedHeroId ? parseInt(pinnedHeroId, 10) : null,
    pinned_hero_caption: pinnedHeroCaption,
    pinned_match_id: pinnedMatchId ? parseInt(pinnedMatchId, 10) : null,
  };

  return (
    <div className="container" style={{ maxWidth: 760, padding: '24px 16px' }}>
      {showWizard && (
        <OnboardingWizard
          onComplete={() => setShowWizard(false)}
          onDismiss={() => setShowWizard(false)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>Profile Customization</h1>
        <button
          className="btn btn-small"
          onClick={handleRedoWizard}
          disabled={wizardResetting}
          title="Redo the onboarding setup wizard"
          style={{ fontSize: 13, opacity: 0.8 }}
        >
          {wizardResetting ? 'Loading…' : '🔁 Redo setup wizard'}
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
        Personalise how your profile looks to other players. Premium options unlock with the upcoming Pro tier.
      </p>

      {error && <div className="error-state" style={{ margin: '12px 0' }}>{error}</div>}
      {savedMsg && <div style={{ margin: '12px 0', padding: '8px 12px', background: '#0f3a1f', border: '1px solid #22c55e', borderRadius: 6 }}>{savedMsg}</div>}
      {loading && <div className="loading">Loading…</div>}

      {!loading && (
        <>
          <PreviewCard displayName={displayName} customization={previewCustomization} />

          <section style={{ marginTop: 24 }}>
            <h2 style={{ marginBottom: 8 }}>Basics</h2>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
              Bio ({bio.length}/{BIO_MAX})
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              rows={3}
              placeholder="A short blurb that shows on your profile."
              style={{
                width: '100%', padding: 10, borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--text-primary)', resize: 'vertical', fontSize: 14,
              }}
            />
          </section>

          <section style={{ marginTop: 24 }}>
            <h2 style={{ marginBottom: 8 }}>Custom title</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {FREE_TITLES.map(t => (
                <label key={t || '__none__'} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="radio" name="title" value={t}
                    checked={customTitle === t}
                    onChange={() => setCustomTitle(t)} />
                  <span style={{ fontSize: 14 }}>{t || <em style={{ color: 'var(--text-muted)' }}>(no title)</em>}</span>
                </label>
              ))}
              {PREMIUM_TITLES.map(t => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isPro ? 'pointer' : 'not-allowed', opacity: isPro ? 1 : 0.55 }}>
                  <input type="radio" name="title" value={t}
                    disabled={!isPro}
                    checked={customTitle === t}
                    onChange={() => isPro && setCustomTitle(t)} />
                  <span style={{ fontSize: 14 }}>{t}</span>
                  <LockedPill />
                </label>
              ))}
            </div>
          </section>

          <section style={{ marginTop: 24 }}>
            <h2 style={{ marginBottom: 8 }}>Theme accent</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {FREE_THEMES.map(c => (
                <ThemeSwatch key={c} color={c} selected={themeAccent === c}
                  onClick={() => setThemeAccent(c)} />
              ))}
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8, marginRight: 4 }}>Pro:</span>
              {PREMIUM_THEMES.map(c => (
                <ThemeSwatch key={c} color={c} selected={themeAccent === c}
                  locked={!isPro}
                  onClick={() => setThemeAccent(c)} />
              ))}
            </div>
          </section>

          <section style={{ marginTop: 24 }}>
            <h2 style={{ marginBottom: 8 }}>Pinned hero</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
                <input
                  type="text"
                  value={pinnedHeroSearch}
                  onChange={(e) => { setPinnedHeroSearch(e.target.value); }}
                  placeholder="Search hero name…"
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text-primary)', fontSize: 14,
                  }}
                />
                {heroOptions.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                    zIndex: 10, maxHeight: 220, overflowY: 'auto',
                  }}>
                    {heroOptions.map(h => (
                      <div key={h.id}
                        onClick={() => { setPinnedHeroId(String(h.id)); setPinnedHeroSearch(h.name); }}
                        style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = ''}>
                        <img src={getHeroImageUrl(h.id)} alt="" style={{ width: 36, height: 20, borderRadius: 2 }} />
                        {h.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {pinnedHeroId && (
                <button type="button" className="btn btn-small" onClick={() => { setPinnedHeroId(''); setPinnedHeroSearch(''); setPinnedHeroCaption(''); }}>Clear</button>
              )}
            </div>
            {pinnedHeroId && (
              <input
                type="text"
                value={pinnedHeroCaption}
                onChange={(e) => setPinnedHeroCaption(e.target.value.slice(0, PINNED_HERO_CAPTION_MAX))}
                placeholder={`Optional caption (≤${PINNED_HERO_CAPTION_MAX} chars)`}
                style={{
                  width: '100%', marginTop: 8, padding: '8px 10px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-card)',
                  color: 'var(--text-primary)', fontSize: 14,
                }}
              />
            )}
          </section>

          <section style={{ marginTop: 24 }}>
            <h2 style={{ marginBottom: 8 }}>Pinned match</h2>
            {ownMatches.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No recent matches available to pin.</p>
            ) : (
              <select
                value={pinnedMatchId}
                onChange={(e) => setPinnedMatchId(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-card)',
                  color: 'var(--text-primary)', fontSize: 14,
                }}
              >
                <option value="">— No pinned match —</option>
                {ownMatches.map(m => {
                  const won = (m.team === 'radiant' && m.radiant_win) || (m.team === 'dire' && !m.radiant_win);
                  const heroName = getHeroName(m.hero_id, m.hero_name) || m.hero_name || '?';
                  return (
                    <option key={m.match_id} value={m.match_id}>
                      #{m.match_id} • {heroName} • {m.kills}/{m.deaths}/{m.assists} • {won ? 'WIN' : 'loss'}
                    </option>
                  );
                })}
              </select>
            )}
          </section>

          <div style={{ marginTop: 28, display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
