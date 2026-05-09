import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSteamAuth } from '../context/SteamAuthContext';
import OnboardingWizard from '../components/OnboardingWizard';
import { useFeatureFlag } from '../context/FeatureFlagsContext';
import { ALL_HEROES, getHeroName, getHeroImageUrl } from '../heroNames';
import {
  FREE_TITLES, PREMIUM_TITLES,
  FREE_THEMES, PREMIUM_THEMES,
  FREE_FRAMES, PREMIUM_FRAMES,
  BIO_MAX, PINNED_HERO_CAPTION_MAX, DEFAULT_THEME, DEFAULT_FRAME, FRAME_META,
  HERO_BORDER_COLORS, FREE_FLAIRS, PREMIUM_FLAIRS, SOCIAL_URL_MAX, DEFAULT_EXTRAS,
  FREE_LAYOUT_THEMES, PREMIUM_LAYOUT_THEMES, ALL_LAYOUT_THEMES,
  DEFAULT_LAYOUT_THEME, LAYOUT_THEME_META, isPremiumLayoutTheme,
  ALL_VOICE_PACKS, VOICE_PACK_META, isPremiumVoicePack,
  COVER_FX_IDS, COVER_FX_META,
} from '../profileCosmetics';
import { Link } from 'react-router-dom';
import { getOwnedFrames, purchaseFrameCheckout } from '../api';
import { oauthErrorMessage } from '../components/DiscordLinkModal';
import ProfileCard from '../components/ProfileCard';

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

function DiscordLinkSection({ steamUser, refreshMe }) {
  const initial = steamUser?.discord_id || '';
  const [value, setValue] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [unlinking, setUnlinking] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => { setValue(steamUser?.discord_id || ''); }, [steamUser?.discord_id]);

  // Handle the `?discord_link=success|error&...` query params that
  // /auth/discord/callback bounces back here when the user picked the
  // "settings" return target. Strip them after surfacing so a refresh
  // doesn't re-show the toast.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('discord_link');
    if (!result) return;
    const reason = params.get('reason') || '';
    const username = params.get('username') || '';
    const already = params.get('already') === '1';
    if (result === 'success') {
      setMsg(
        already
          ? 'Your Discord is already linked.'
          : username
            ? `Discord linked to @${username}. Check your DMs for confirmation.`
            : 'Discord linked. Check your DMs for the confirmation message.'
      );
      setTimeout(() => setMsg(null), 4000);
      if (typeof refreshMe === 'function') refreshMe().catch(() => {});
    } else if (result === 'error') {
      setError(oauthErrorMessage(reason));
    }
    params.delete('discord_link');
    params.delete('reason');
    params.delete('username');
    params.delete('already');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
  }, [refreshMe]);

  const handleSave = async () => {
    setError(null); setMsg(null);
    const cleaned = value.trim();
    if (!/^\d{17,19}$/.test(cleaned)) {
      setError("Discord User IDs are 17–19 digits — open Discord, enable Developer Mode, then right-click your name → Copy User ID.");
      return;
    }
    setSaving(true);
    try {
      // PUT (re-link) when the user already has a Discord ID on file — the
      // server's POST path 409s on a different existing link to protect the
      // first-login modal from silently overwriting. PUT runs the same
      // verify-and-DM round-trip but allows replacing the existing ID
      // atomically. POST is still used for the initial link so a brand-new
      // signup goes through the canonical onboarding path.
      const isRelink = Boolean(initial);
      const res = await fetch('/api/me/link-discord', {
        method: isRelink ? 'PUT' : 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discord_id: cleaned }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not save your Discord ID.');
      } else {
        setMsg(
          isRelink
            ? 'Discord account updated. Check your DMs for confirmation.'
            : 'Discord ID saved. Check your DMs for confirmation.'
        );
        if (typeof refreshMe === 'function') refreshMe().catch(() => {});
        setTimeout(() => setMsg(null), 3500);
      }
    } catch (e) {
      setError(e.message || 'Network error.');
    }
    setSaving(false);
  };

  // Task 109 — fully clear the link. Confirms first because unlinking
  // disables DMs, role assignment, hot-streak pings, MVP-vote DMs, etc.
  const handleUnlink = async () => {
    setError(null); setMsg(null);
    const ok = window.confirm(
      'Unlink your Discord account?\n\n' +
      'The bot will stop DMing you, mentioning you, and assigning league roles. ' +
      'You can re-link a different Discord account later from this page.'
    );
    if (!ok) return;
    setUnlinking(true);
    try {
      const res = await fetch('/api/me/link-discord', {
        method: 'DELETE', credentials: 'include',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not unlink your Discord ID.');
      } else {
        setValue('');
        setMsg('Discord account unlinked. The bot will no longer DM you.');
        if (typeof refreshMe === 'function') refreshMe().catch(() => {});
        setTimeout(() => setMsg(null), 4000);
      }
    } catch (e) {
      setError(e.message || 'Network error.');
    }
    setUnlinking(false);
  };

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ marginBottom: 8 }}>Discord link</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0, marginBottom: 8 }}>
        Used so the bot can DM you, mention you, and assign your league roles.
      </p>
      {steamUser?.discord_oauth_enabled && (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => window.location.assign('/auth/discord?return=settings')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 6,
              background: '#5865F2', border: '1px solid #4752c4',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <span aria-hidden="true">🔗</span>
            {initial ? 'Reconnect with Discord' : 'Connect with Discord'}
          </button>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
            One click — no Developer Mode needed.
          </div>
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
        Or paste your Discord User ID manually (Discord → User Settings → Advanced → enable Developer Mode → right-click your name → Copy User ID):
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => { setValue(e.target.value.replace(/\D/g, '').slice(0, 19)); setError(null); setMsg(null); }}
          placeholder="123456789012345678"
          disabled={saving}
          style={{
            flex: 1, minWidth: 240, padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-primary)', fontSize: 14, letterSpacing: 0.4,
          }}
        />
        <button
          type="button"
          className="btn btn-small"
          onClick={handleSave}
          disabled={saving || unlinking || !value || value === initial}
        >
          {saving ? 'Saving…' : 'Save Discord ID'}
        </button>
        {initial && (
          <button
            type="button"
            className="btn btn-small"
            onClick={handleUnlink}
            disabled={saving || unlinking}
            title="Disconnect this Discord account so the bot stops DMing and mentioning you."
            style={{
              background: 'transparent',
              border: '1px solid #ef4444',
              color: '#ef4444',
            }}
          >
            {unlinking ? 'Unlinking…' : 'Unlink Discord'}
          </button>
        )}
      </div>
      {error && <div style={{ marginTop: 6, color: '#ef4444', fontSize: 12 }}>{error}</div>}
      {msg && <div style={{ marginTop: 6, color: '#22c55e', fontSize: 12 }}>{msg}</div>}
    </section>
  );
}

export default function SettingsProfile() {
  const { steamUser, refreshMe } = useSteamAuth() || {};
  const enabled = true;

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
  const [profileFrame, setProfileFrame] = useState(DEFAULT_FRAME);
  // v6.52 / Task #195 — Magazine v3 layout theme.
  const [layoutTheme, setLayoutTheme] = useState(DEFAULT_LAYOUT_THEME);
  // v6.63 / Task #207 — Magazine v3 Cover FX (Pro toggles). Six allow-listed
  // animated effects layered onto the cover. Server-side gated to Pro.
  const [coverFx, setCoverFx] = useState([]);
  const [ownedEntitlements, setOwnedEntitlements] = useState([]);
  // v6.62 / Task #206 — selected Pro voice pack (or '' for the default
  // church-bell chime).
  const [selectedVoicePack, setSelectedVoicePack] = useState('');
  // Per-pack <Audio> cache used by the "Preview" button below the picker.
  const voicePreviewElsRef = useRef(new Map());
  const [ownedFrames, setOwnedFrames] = useState([]);
  const [framePurchaseLoading, setFramePurchaseLoading] = useState(null);
  const [framePurchaseError, setFramePurchaseError] = useState(null);

  // v5.81 — extras (mockup-graduated knobs). One JSON column on the server.
  const [extras, setExtras] = useState(DEFAULT_EXTRAS);
  const setExtra = (k, v) => setExtras(prev => ({ ...prev, [k]: v }));
  const [achievementsList, setAchievementsList] = useState([]);
  // Task #204 / v6.60 — Magazine v3 pinned-achievement ribbon. Free tier
  // pins 1; Pro pins up to 3. Server validates against earned achievements.
  const [pinnedAchievements, setPinnedAchievements] = useState([]);

  const [ownMatches, setOwnMatches] = useState([]);
  const [ownHeroes, setOwnHeroes] = useState([]);
  const [streak, setStreak] = useState(null);

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
      setProfileFrame(c.profile_frame || DEFAULT_FRAME);
      setLayoutTheme(c.profile_layout_theme || DEFAULT_LAYOUT_THEME);
      setSelectedVoicePack(c.selected_voice_pack || '');
      setExtras({ ...DEFAULT_EXTRAS, ...(c.extras || {}) });
      setPinnedAchievements(Array.isArray(c.pinned_achievements) ? c.pinned_achievements.map(String) : []);
      setCoverFx(Array.isArray(c.cover_fx) ? c.cover_fx : []);
      setOwnedEntitlements(Array.isArray(data.owned_entitlements) ? data.owned_entitlements : []);
      if (c.pinned_hero_id) {
        setPinnedHeroSearch(getHeroName(c.pinned_hero_id) || '');
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { if (enabled && accountId) loadProfile(); }, [enabled, accountId, loadProfile]);

  // Fetch owned premium frames when user is a Pro member.
  useEffect(() => {
    if (!accountId) return;
    getOwnedFrames().then(setOwnedFrames).catch(() => {});
  }, [accountId]);

  // Pull the player's own matches for the pinned-match picker. Reuses the
  // existing /api/players/:id endpoint which returns recentMatches.
  useEffect(() => {
    if (!accountId) return;
    fetch(`/api/players/${accountId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.recentMatches) setOwnMatches(d.recentMatches);
        if (d?.heroes) setOwnHeroes(d.heroes);
      })
      .catch(() => {});
    // v6.18 — pull current streak so the preview's streak chip mirrors what
    // visitors actually see on the public profile (instead of always-off).
    fetch(`/api/players/${accountId}/streak`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.streak != null) setStreak(d.streak); })
      .catch(() => {});
  }, [accountId]);

  // Pull the player's earned achievements for the pinned-achievement picker.
  useEffect(() => {
    if (!accountId) return;
    fetch(`/api/players/${accountId}/achievements`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const earned = (d?.achievements || []).filter(a => a.earned && !a.secret);
        setAchievementsList(earned);
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
        profile_frame: profileFrame || null,
        profile_layout_theme: layoutTheme || null,
        selected_voice_pack: selectedVoicePack || null,
        extras,
        pinned_achievements: pinnedAchievements,
        cover_fx: coverFx,
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

  // v6.18 — Build the same shape /api/player/:id/profile-card returns so the
  // shared <ProfileCard /> renders the editor preview identically to what
  // public visitors see on /player/:id. Real player data (recent matches,
  // hero career, current streak, earned achievements) is mixed in so the
  // preview is never SAMPLE_*.
  const previewCustomization = {
    bio,
    custom_title: customTitle,
    theme_accent: themeAccent,
    profile_frame: profileFrame,
    pinned_hero_id: pinnedHeroId ? parseInt(pinnedHeroId, 10) : null,
    pinned_hero_caption: pinnedHeroCaption,
    pinned_match_id: pinnedMatchId ? parseInt(pinnedMatchId, 10) : null,
    extras,
  };
  const previewPinnedHeroRow = previewCustomization.pinned_hero_id
    ? ownHeroes.find(h => Number(h.hero_id) === Number(previewCustomization.pinned_hero_id))
    : null;
  const previewPinnedHero = previewCustomization.pinned_hero_id ? {
    hero_id: previewCustomization.pinned_hero_id,
    name: previewPinnedHeroRow ? (previewPinnedHeroRow.hero_name || getHeroName(previewCustomization.pinned_hero_id)) : getHeroName(previewCustomization.pinned_hero_id),
    games: previewPinnedHeroRow ? parseInt(previewPinnedHeroRow.games || 0) : 0,
    wins: previewPinnedHeroRow ? parseInt(previewPinnedHeroRow.wins || 0) : 0,
    kda: previewPinnedHeroRow
      ? (parseFloat(previewPinnedHeroRow.avg_kills || 0) + parseFloat(previewPinnedHeroRow.avg_assists || 0))
        / Math.max(parseFloat(previewPinnedHeroRow.avg_deaths || 0), 1)
      : null,
    caption: pinnedHeroCaption || null,
    borderColor: extras.pinned_hero_border || null,
  } : null;
  const previewPinnedMatchRow = previewCustomization.pinned_match_id
    ? ownMatches.find(m => Number(m.match_id) === Number(previewCustomization.pinned_match_id))
    : null;
  const previewPinnedMatch = previewPinnedMatchRow ? {
    match_id: previewPinnedMatchRow.match_id,
    hero_id: previewPinnedMatchRow.hero_id,
    hero: previewPinnedMatchRow.hero,
    kills: previewPinnedMatchRow.kills,
    deaths: previewPinnedMatchRow.deaths,
    assists: previewPinnedMatchRow.assists,
    duration: previewPinnedMatchRow.duration,
    start_time: previewPinnedMatchRow.start_time
      || (previewPinnedMatchRow.date ? Math.floor(new Date(previewPinnedMatchRow.date).getTime() / 1000) : null),
    player_won: (previewPinnedMatchRow.team === 'radiant') === !!previewPinnedMatchRow.radiant_win,
  } : null;
  const previewPinnedAchievement = extras.pinned_achievement_id
    ? (() => {
        const a = (achievementsList || []).find(x => (x.key || x.id) === extras.pinned_achievement_id);
        if (!a) return null;
        return {
          emoji: a.emoji || a.icon || '🏆',
          label: a.label || a.title || a.key,
          sub: a.description || a.sub || null,
        };
      })()
    : null;
  const previewTopHeroes = (ownHeroes || []).slice(0, 5).map(h => ({
    hero_id: h.hero_id,
    games: parseInt(h.games || 0),
    wins: parseInt(h.wins || 0),
  }));

  return (
    <div className="container settings-profile-shell" style={{ maxWidth: 1180, padding: '24px 16px' }}>
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
        // v5.86 — two-column grid on ≥960px so the live preview can sit in a
        // sticky right rail and follow the page as the user scrolls through
        // the form. Single-column stack on mobile keeps the preview at top.
        <div className="settings-profile-grid">
          {/* v5.88 — preview is a fixed floating panel on the right (see
              .settings-profile-preview in styles.css). Form column flows
              in the centre underneath. */}
          <aside className="settings-profile-preview">
            {/* v6.18 — same <ProfileCard /> visitors see on /player/:id. */}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1.5, marginBottom: 6, textTransform: 'uppercase' }}>
              Live preview · profile card
            </div>
            <ProfileCard
              displayName={displayName}
              customization={previewCustomization}
              pinnedHero={previewPinnedHero}
              pinnedMatch={previewPinnedMatch}
              pinnedAchievement={previewPinnedAchievement}
              topHeroes={previewTopHeroes}
              streak={streak}
              frame={profileFrame}
            />
          </aside>
          <div className="settings-profile-form">

          <DiscordLinkSection steamUser={steamUser} refreshMe={refreshMe} />

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
            <h2 style={{ marginBottom: 8 }}>Profile layout theme</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 10 }}>
              Restyles the new Magazine v3 cover banner on your public profile. Court &amp; Pitch
              ships free; the other five layout themes are Pro cosmetics.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {ALL_LAYOUT_THEMES.map(t => {
                const meta = LAYOUT_THEME_META[t] || { label: t, sub: '' };
                const premium = isPremiumLayoutTheme(t);
                const locked = premium && !isPro;
                const selected = layoutTheme === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={locked ? undefined : () => setLayoutTheme(t)}
                    disabled={locked}
                    title={locked ? 'Reserved for Pro members' : meta.sub}
                    style={{
                      textAlign: 'left',
                      padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      cursor: locked ? 'not-allowed' : 'pointer',
                      opacity: locked ? 0.5 : 1,
                      background: selected ? 'rgba(245,158,11,0.18)' : 'var(--bg-card)',
                      border: selected ? '2px solid #f59e0b' : '1px solid var(--border)',
                      color: selected ? '#f59e0b' : 'var(--text-primary)',
                      minWidth: 160,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {meta.label}
                      {premium && <LockedPill />}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                      {meta.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section style={{ marginTop: 24 }}>
            <h2 style={{ marginBottom: 8 }}>Inhouse voice pack</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 10 }}>
              Replace the default church-bell chime on inhouse alerts (accept phase,
              captain selected, your pick, match ready) with a Pro voice pack.
              Browse all paid cosmetics on the <Link to="/shop" style={{ color: 'var(--accent)', fontWeight: 600 }}>Cosmetics Shop</Link>.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setSelectedVoicePack('')}
                title="Default church-bell chime"
                style={{
                  textAlign: 'left', padding: '8px 14px', borderRadius: 8,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: !selectedVoicePack ? 'rgba(245,158,11,0.18)' : 'var(--bg-card)',
                  border: !selectedVoicePack ? '2px solid #f59e0b' : '1px solid var(--border)',
                  color: !selectedVoicePack ? '#f59e0b' : 'var(--text-primary)',
                  minWidth: 160,
                }}
              >
                <div>Default bell</div>
                <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                  Free — medieval church-bell chime
                </div>
              </button>
              {ALL_VOICE_PACKS.map(p => {
                const meta = VOICE_PACK_META[p] || { label: p, sub: '' };
                const premium = isPremiumVoicePack(p);
                const locked = premium && !isPro;
                const selected = selectedVoicePack === p;
                return (
                  <div key={p} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button
                      type="button"
                      onClick={locked ? undefined : () => setSelectedVoicePack(p)}
                      disabled={locked}
                      title={locked ? 'Reserved for Pro members' : meta.sub}
                      style={{
                        textAlign: 'left', padding: '8px 14px', borderRadius: 8,
                        fontSize: 13, fontWeight: 600,
                        cursor: locked ? 'not-allowed' : 'pointer',
                        opacity: locked ? 0.5 : 1,
                        background: selected ? 'rgba(245,158,11,0.18)' : 'var(--bg-card)',
                        border: selected ? '2px solid #f59e0b' : '1px solid var(--border)',
                        color: selected ? '#f59e0b' : 'var(--text-primary)',
                        minWidth: 180,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {meta.label}
                        {premium && <LockedPill />}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                        {meta.sub}
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`Preview ${meta.label} voice pack`}
                      onClick={() => {
                        try {
                          const key = `${p}|match-start`;
                          let el = voicePreviewElsRef.current.get(key);
                          if (!el) {
                            el = new Audio(`/voice-packs/${encodeURIComponent(p)}/match-start.mp3`);
                            el.preload = 'auto';
                            el.volume = 0.85;
                            voicePreviewElsRef.current.set(key, el);
                          }
                          el.currentTime = 0;
                          const pr = el.play();
                          if (pr && typeof pr.then === 'function') pr.catch(() => {});
                        } catch (_) { /* ignore */ }
                      }}
                      style={{
                        fontSize: 11, padding: '4px 8px', borderRadius: 6,
                        background: 'transparent', border: '1px solid var(--border)',
                        color: 'var(--text-muted)', cursor: 'pointer',
                      }}
                    >
                      ▶ Preview
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* v6.63 / Task #207 — Cover FX (Pro). Six allow-listed effects
              that layer onto the Magazine v3 cover. Server validates against
              `cosm.validateCoverFx` and Pro-gates them on save. */}
          <section style={{ marginTop: 24 }}>
            <h2 style={{ marginBottom: 8 }}>Cover effects (Pro)</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 10 }}>
              Animated polish layered onto your Magazine v3 cover banner. All effects respect
              your system's <em>reduced motion</em> preference. Pro-only.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COVER_FX_IDS.map(id => {
                const meta = COVER_FX_META[id] || { label: id, sub: '' };
                const on = coverFx.includes(id);
                const locked = !isPro;
                return (
                  <button
                    key={id}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${meta.label} cover effect`}
                    disabled={locked}
                    onClick={() => {
                      if (locked) return;
                      setCoverFx(prev => prev.includes(id)
                        ? prev.filter(x => x !== id)
                        : [...prev, id]);
                    }}
                    title={locked ? 'Reserved for Pro members' : meta.sub}
                    style={{
                      textAlign: 'left', padding: '8px 14px', borderRadius: 8,
                      fontSize: 13, fontWeight: 600,
                      cursor: locked ? 'not-allowed' : 'pointer',
                      opacity: locked ? 0.5 : 1,
                      background: on ? 'rgba(245,158,11,0.18)' : 'var(--bg-card)',
                      border: on ? '2px solid #f59e0b' : '1px solid var(--border)',
                      color: on ? '#f59e0b' : 'var(--text-primary)',
                      minWidth: 180,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {meta.label}
                      {locked && <LockedPill />}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                      {meta.sub}
                    </div>
                  </button>
                );
              })}
            </div>
            {ownedEntitlements.includes('founders_pass_ring') && (
              <p style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)' }}>
                ✓ Founders Pass ring is active around your cover banner.
              </p>
            )}
          </section>

          <section style={{ marginTop: 24 }}>
            <h2 style={{ marginBottom: 8 }}>Profile frame</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 10 }}>
              A decorative border around your profile card. Premium frames require Pro membership.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {FREE_FRAMES.map(f => {
                const meta = FRAME_META[f] || {};
                const selected = profileFrame === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setProfileFrame(f)}
                    style={{
                      padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      background: selected ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
                      border: selected ? '2px solid #60a5fa' : '1px solid var(--border)',
                      color: selected ? '#60a5fa' : 'var(--text-primary)',
                      ...meta.style,
                    }}
                  >
                    {meta.label || f}
                  </button>
                );
              })}
              <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', marginLeft: 4 }}>Premium frames:</span>
              {PREMIUM_FRAMES.map(f => {
                const meta = FRAME_META[f] || {};
                const selected = profileFrame === f;
                const owned = ownedFrames.includes(f);
                const buying = framePurchaseLoading === f;
                const proBundled = f === 'gold';
                // Gold is Pro-bundled — show it as "included with Pro" for Pro members,
                // or as locked for non-Pro users (it cannot be purchased separately).
                if (proBundled && !isPro) {
                  return (
                    <button key={f} type="button" disabled title="Gold frame is included with Pro membership"
                      style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'not-allowed', opacity: 0.45, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                      {meta.label || f} ★
                    </button>
                  );
                }
                if (proBundled && isPro) {
                  return (
                    <button
                      key={f} type="button"
                      onClick={() => setProfileFrame(f)}
                      title={`${meta.label} — included with Pro`}
                      style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        cursor: 'pointer',
                        background: selected ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.07)',
                        border: selected ? '1px solid #f59e0b' : '1px solid rgba(245,158,11,0.35)',
                        color: '#f59e0b',
                      }}
                    >
                      {meta.label} ★ Pro
                    </button>
                  );
                }
                if (!owned) {
                  return (
                    <button
                      key={f} type="button"
                      title={`Buy ${meta.label} frame`}
                      disabled={buying}
                      onClick={async () => {
                        setFramePurchaseError(null);
                        setFramePurchaseLoading(f);
                        try {
                          const { url } = await purchaseFrameCheckout(f);
                          window.location.href = url;
                        } catch (err) {
                          setFramePurchaseError(err.message);
                          setFramePurchaseLoading(null);
                        }
                      }}
                      style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        cursor: buying ? 'wait' : 'pointer',
                        background: 'rgba(168,85,247,0.08)',
                        border: '1px dashed rgba(168,85,247,0.5)',
                        color: '#a855f7',
                      }}
                    >
                      {buying ? 'Opening…' : `Buy ${meta.label}`}
                    </button>
                  );
                }
                return (
                  <button
                    key={f} type="button"
                    onClick={() => setProfileFrame(f)}
                    title={meta.label}
                    style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      background: selected ? 'rgba(168,85,247,0.15)' : 'var(--bg-card)',
                      border: selected ? '2px solid #a855f7' : '1px solid rgba(168,85,247,0.35)',
                      color: selected ? '#a855f7' : 'var(--text-primary)',
                    }}
                  >
                    {meta.label || f} ✓
                  </button>
                );
              })}
              {framePurchaseError && (
                <div style={{ width: '100%', marginTop: 6, fontSize: 12, color: '#ef4444' }}>{framePurchaseError}</div>
              )}
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
                      <button type="button" key={h.id}
                        onClick={() => { setPinnedHeroId(String(h.id)); setPinnedHeroSearch(h.name); }}
                        aria-label={`Pin hero ${h.name}`}
                        style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, color: 'inherit', font: 'inherit', padding: '6px 10px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = ''}>
                        <img src={getHeroImageUrl(h.id)} alt="" style={{ width: 36, height: 20, borderRadius: 2 }} />
                        {h.name}
                      </button>
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

          {/* v5.81 — Profile extras (mockup-graduated knobs) */}
          <section style={{ marginTop: 28 }}>
            <h2 style={{ marginBottom: 4 }}>Profile extras</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0, marginBottom: 12 }}>
              Toggles and pins from the v5.74 sandbox. Changes show on your public profile after saving.
            </p>

            {/* Toggles row */}
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!extras.show_top_heroes} onChange={(e) => setExtra('show_top_heroes', e.target.checked)} />
                <span style={{ fontSize: 14 }}>Show most-played heroes strip</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!extras.show_streak} onChange={(e) => setExtra('show_streak', e.target.checked)} />
                <span style={{ fontSize: 14 }}>Show win/loss streak badge</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isPro ? 'pointer' : 'not-allowed', opacity: isPro ? 1 : 0.55 }}>
                <input type="checkbox" disabled={!isPro} checked={!!extras.frame_animated} onChange={(e) => setExtra('frame_animated', e.target.checked)} />
                <span style={{ fontSize: 14 }}>Animated frame shimmer</span>
                <LockedPill />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isPro ? 'pointer' : 'not-allowed', opacity: isPro ? 1 : 0.55 }}>
                <input type="checkbox" disabled={!isPro} checked={!!extras.bg_pattern} onChange={(e) => setExtra('bg_pattern', e.target.checked)} />
                <span style={{ fontSize: 14 }}>Heraldic background pattern</span>
                <LockedPill />
              </label>
            </div>

            {/* Pinned hero border colour */}
            {pinnedHeroId && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Pinned-hero border colour</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {HERO_BORDER_COLORS.map(c => {
                    const selected = (extras.pinned_hero_border || '') === c.value;
                    return (
                      <button key={c.label} type="button"
                        onClick={() => setExtra('pinned_hero_border', c.value || null)}
                        title={c.label}
                        style={{
                          width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
                          background: c.value || 'transparent',
                          border: selected ? '3px solid #fff' : '1px solid var(--border)',
                          backgroundImage: c.value ? undefined : 'linear-gradient(45deg, transparent 45%, var(--text-muted) 45% 55%, transparent 55%)',
                        }} />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pinned achievement (legacy single-pin, kept for the avatar
                 corner badge on the classic profile card). */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Pinned achievement (avatar badge)</div>
              {achievementsList.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>You haven't earned any pinnable achievements yet.</p>
              ) : (
                <select value={extras.pinned_achievement_id || ''}
                  onChange={(e) => setExtra('pinned_achievement_id', e.target.value || null)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14 }}>
                  <option value="">— No pinned achievement —</option>
                  {achievementsList.map(a => (
                    <option key={a.key || a.id} value={a.key || a.id}>{a.label || a.title || a.key}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Task #204 / v6.60 — Magazine v3 pinned-achievement ribbon.
                 Free pins 1; Pro pins up to 3. Real <button> with
                 aria-pressed so the a11y gate passes and screen readers
                 announce the toggle state. Server validates against earned
                 achievements before persisting. */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
                Pinned ribbon ({pinnedAchievements.length}/{isPro ? 3 : 1})
                {!isPro && <LockedPill />}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 8 }}>
                {isPro
                  ? 'Pin up to 3 achievements to display in the v3 magazine ribbon under your cover.'
                  : 'Pin 1 achievement to display in the v3 magazine ribbon. Pro members can pin 3.'}
              </p>
              {achievementsList.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>You haven't earned any pinnable achievements yet.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {achievementsList.map(a => {
                    const id = String(a.key || a.id);
                    const pinned = pinnedAchievements.includes(id);
                    const cap = isPro ? 3 : 1;
                    const atCap = !pinned && pinnedAchievements.length >= cap;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={pinned}
                        disabled={atCap}
                        onClick={() => {
                          setPinnedAchievements(prev => {
                            if (prev.includes(id)) return prev.filter(x => x !== id);
                            if (prev.length >= cap) return prev;
                            return [...prev, id];
                          });
                        }}
                        title={a.description || a.sub || (a.label || a.title || id)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 999,
                          border: pinned ? '1px solid var(--accent, #c5a975)' : '1px solid var(--border)',
                          background: pinned ? 'var(--accent, #c5a975)' : 'var(--bg-card)',
                          color: pinned ? '#0d1424' : 'var(--text-primary)',
                          fontSize: 12,
                          cursor: atCap ? 'not-allowed' : 'pointer',
                          opacity: atCap ? 0.45 : 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span aria-hidden="true">{a.emoji || a.icon || '🏆'}</span>
                        <span>{a.label || a.title || id}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Flair override */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isPro ? 'pointer' : 'not-allowed', opacity: isPro ? 1 : 0.55, marginBottom: 6 }}>
                <input type="checkbox" disabled={!isPro} checked={!!extras.flair_unlocked} onChange={(e) => setExtra('flair_unlocked', e.target.checked)} />
                <span style={{ fontSize: 14 }}>Override auto-flair (otherwise we pick one based on your stats)</span>
                <LockedPill />
              </label>
              {extras.flair_unlocked && (
                <select value={extras.flair_override || ''}
                  onChange={(e) => setExtra('flair_override', e.target.value || null)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14 }}>
                  <option value="">— Auto —</option>
                  <optgroup label="Free">
                    {FREE_FLAIRS.filter(f => f).map(f => <option key={f} value={f}>{f}</option>)}
                  </optgroup>
                  <optgroup label="Pro">
                    {PREMIUM_FLAIRS.map(f => <option key={f} value={f} disabled={!isPro}>{f}{isPro ? '' : ' 🔒'}</option>)}
                  </optgroup>
                </select>
              )}
            </div>

            {/* Social URLs */}
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              {[
                { key: 'social_twitch',  label: 'Twitch URL',   placeholder: 'https://twitch.tv/your-name' },
                { key: 'social_youtube', label: 'YouTube URL',  placeholder: 'https://youtube.com/@you' },
                { key: 'social_steam',   label: 'Steam profile', placeholder: 'https://steamcommunity.com/id/you' },
              ].map(s => (
                <div key={s.key}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
                  <input type="url" value={extras[s.key] || ''}
                    onChange={(e) => setExtra(s.key, e.target.value.slice(0, SOCIAL_URL_MAX) || null)}
                    placeholder={s.placeholder}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }} />
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Only https URLs on the official Twitch / YouTube / Steam domains are accepted.
            </p>
          </section>

          <div style={{ marginTop: 28, display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
          </div>{/* /.settings-profile-form */}
        </div>
      )}
    </div>
  );
}
