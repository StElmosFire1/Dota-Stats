import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSteamAuth } from '../context/SteamAuthContext';
import SignInPrompt from '../components/SignInPrompt';
import OnboardingWizard from '../components/OnboardingWizard';
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
  SHARE_CARD_TAGLINE_MAX,
} from '../profileCosmetics';
import { Link } from 'react-router-dom';
import { getOwnedFrames, purchaseFrameCheckout } from '../api';
import { createVoicePackPlayer, VOICE_PACK_EVENTS } from '../lib/voicePack';
import VanitySlugPicker from '../components/VanitySlugPicker';
import { oauthErrorMessage } from '../components/DiscordLinkModal';
import ProfileCard from '../components/ProfileCard';
import MagazineCover from '../components/MagazineCover';
import '../components/MagazineCover.css';
import '../styles/pressbox-settings.css';

// Short labels for voice-pack event sample buttons.
const VOICE_EVENT_LABELS = {
  'match-start': 'Match start',
  'first-blood': 'First blood',
  'win': 'Win',
  'loss': 'Loss',
  'level-up': 'Level up',
  'achievement-unlock': 'Achievement',
};

// ── Tab definitions ──────────────────────────────────────────────────────────
const SETTINGS_TABS = [
  { id: 'identity',    label: 'Identity',    icon: '✦' },
  { id: 'appearance',  label: 'Appearance',  icon: '◈' },
  { id: 'showcase',    label: 'Showcase',    icon: '★' },
  { id: 'connections', label: 'Connections', icon: '⚡' },
];

// ── Small reusable sub-components ─────────────────────────────────────────────

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
      aria-label={locked ? `Pro-locked colour ${color}` : `Select accent colour ${color}`}
      style={{
        width: 30, height: 30, borderRadius: 8, border: selected ? '3px solid #fff' : '1px solid var(--pb-line)',
        background: color, cursor: locked ? 'not-allowed' : 'pointer',
        opacity: locked ? 0.45 : 1, position: 'relative',
      }}
    >
      {locked && <span style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.6)',
      }} aria-hidden="true">🔒</span>}
    </button>
  );
}

// Share-card hero picker — lets the player choose which hero portrait shows
// in Discord/Twitter unfurl cards. Includes a live OG-card image preview.
function ShareCardHeroPicker({ accountId, extras, setExtra, ownHeroes, pinnedHeroId }) {
  const raw = extras.share_card_hero_id;
  const mode = raw === 'most_played'
    ? 'most_played'
    : (raw != null && raw !== '' ? 'custom' : 'pinned');
  const customHeroId = mode === 'custom' ? parseInt(raw, 10) : null;
  const [search, setSearch] = useState('');
  const [previewBust, setPreviewBust] = useState(() => Date.now());

  // Debounce the preview URL to avoid hammering the server on each keystroke.
  const tagline = extras.share_card_tagline || '';
  const showMmr = extras.share_card_show_mmr !== false;
  const [previewTagline, setPreviewTagline] = useState(tagline);
  const [previewShowMmr, setPreviewShowMmr] = useState(showMmr);
  React.useEffect(() => {
    const id = setTimeout(() => {
      setPreviewTagline(tagline);
      setPreviewShowMmr(showMmr);
    }, 350);
    return () => clearTimeout(id);
  }, [tagline, showMmr]);

  React.useEffect(() => { setPreviewBust(Date.now()); }, [raw, previewTagline, previewShowMmr]);

  const playedPool = useMemo(() => {
    return (ownHeroes || [])
      .filter(h => h && h.hero_id)
      .map(h => ({
        id: parseInt(h.hero_id, 10),
        name: h.hero_name || getHeroName(h.hero_id) || `Hero #${h.hero_id}`,
        games: h.games || 0,
      }));
  }, [ownHeroes]);

  const heroOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return playedPool.slice(0, 8);
    return playedPool.filter(h => h.name.toLowerCase().includes(q)).slice(0, 8);
  }, [search, playedPool]);

  const previewQuery = (() => {
    const params = new URLSearchParams();
    if (mode === 'most_played') params.set('preview_hero_id', 'most_played');
    else if (mode === 'custom' && customHeroId) params.set('preview_hero_id', String(customHeroId));
    else params.set('preview_hero_id', 'pinned');
    params.set('preview_tagline', previewTagline || '');
    params.set('preview_show_mmr', previewShowMmr ? '1' : '0');
    params.set('t', String(previewBust));
    return `?${params.toString()}`;
  })();
  const previewSrc = `/og/profile/by-id/${encodeURIComponent(accountId)}.png${previewQuery}`;

  const presetBtnStyle = (active) => ({
    textAlign: 'left', padding: '8px 14px', borderRadius: 8,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: active ? 'rgba(197,169,117,0.14)' : 'var(--pb-surface)',
    border: active ? '2px solid var(--pb-brass)' : '1px solid var(--pb-line)',
    color: active ? 'var(--pb-brass)' : 'var(--pb-text)',
    minWidth: 180,
  });

  const pinnedHeroName = pinnedHeroId
    ? (getHeroName(parseInt(pinnedHeroId, 10)) || `Hero #${pinnedHeroId}`)
    : null;
  const mostPlayed = (ownHeroes || []).find(h => h && h.hero_id);
  const mostPlayedName = mostPlayed
    ? (getHeroName(mostPlayed.hero_id) || `Hero #${mostPlayed.hero_id}`)
    : null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setExtra('share_card_hero_id', null)}
          style={presetBtnStyle(mode === 'pinned')}
        >
          <div>Use pinned hero</div>
          <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--pb-faint)', marginTop: 2 }}>
            {pinnedHeroName ? `Currently: ${pinnedHeroName}` : 'Falls back to most-played when nothing is pinned'}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setExtra('share_card_hero_id', 'most_played')}
          style={presetBtnStyle(mode === 'most_played')}
        >
          <div>Use most-played hero</div>
          <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--pb-faint)', marginTop: 2 }}>
            {mostPlayedName ? `Currently: ${mostPlayedName}` : 'Auto-selected from your top hero'}
          </div>
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--pb-faint)', marginBottom: 6 }}>
          Or pick a specific hero from any of your played heroes:
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                mode === 'custom' && customHeroId
                  ? `Currently: ${getHeroName(customHeroId) || `Hero #${customHeroId}`}`
                  : (playedPool.length === 0 ? 'No played heroes yet' : 'Search your played heroes…')
              }
              disabled={playedPool.length === 0}
            />
            {heroOptions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                background: 'var(--pb-surface)', border: '1px solid var(--pb-line)', borderRadius: 8,
                zIndex: 10, maxHeight: 220, overflowY: 'auto',
              }}>
                {heroOptions.map(h => (
                  <button
                    type="button"
                    key={h.id}
                    onClick={() => { setExtra('share_card_hero_id', h.id); setSearch(''); }}
                    aria-label={`Use ${h.name} on share card`}
                    style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, color: 'inherit', font: 'inherit', padding: '6px 10px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--pb-surface-2)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = ''}
                    onFocus={(e) => e.currentTarget.style.background = 'var(--pb-surface-2)'}
                    onBlur={(e) => e.currentTarget.style.background = ''}
                  >
                    <img src={getHeroImageUrl(h.id)} alt="" style={{ width: 36, height: 20, borderRadius: 2 }} />
                    {h.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {mode === 'custom' && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => setExtra('share_card_hero_id', null)}
            >
              Reset to pinned
            </button>
          )}
        </div>
      </div>

      {/* Tagline + show_mmr controls */}
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label
            htmlFor="share-card-tagline-input"
            style={{ display: 'block', fontSize: 13, color: 'var(--pb-faint)', marginBottom: 4 }}
          >
            Tagline ({tagline.length}/{SHARE_CARD_TAGLINE_MAX})
            <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>
              — replaces the auto MMR / W-L line
            </span>
          </label>
          <input
            id="share-card-tagline-input"
            type="text"
            value={tagline}
            onChange={(e) => {
              const next = e.target.value.slice(0, SHARE_CARD_TAGLINE_MAX);
              setExtra('share_card_tagline', next || null);
            }}
            placeholder="e.g. Self-proclaimed Pos 5 GOAT"
            maxLength={SHARE_CARD_TAGLINE_MAX}
          />
        </div>
        <label className="pb-settings-check-row">
          <input
            type="checkbox"
            checked={showMmr}
            onChange={(e) => setExtra('share_card_show_mmr', e.target.checked)}
          />
          <span>Show my MMR &amp; tier on the card</span>
        </label>
        <label className="pb-settings-check-row">
          <input
            type="checkbox"
            checked={extras.embed_enabled !== false}
            onChange={(e) => setExtra('embed_enabled', e.target.checked)}
          />
          <span>Allow public embeds of my stats (iframe &amp; image)</span>
        </label>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="pb-settings-preview-label" style={{ marginBottom: 6 }}>Live preview · share card</div>
        <div style={{
          width: '100%', maxWidth: 600,
          aspectRatio: '1200 / 630',
          borderRadius: 10, overflow: 'hidden',
          border: '1px solid var(--pb-line)',
          background: '#0d1424',
        }}>
          <img
            src={previewSrc}
            alt="Share card preview"
            style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--pb-faint)', marginTop: 6 }}>
          Exactly what Discord, Twitter and Slack will show. Preview updates automatically.
        </div>
      </div>
    </div>
  );
}

// Discord-link section — handles OAuth connect, manual ID entry, and unlink.
function DiscordLinkSection({ steamUser, refreshMe }) {
  const initial = steamUser?.discord_id || '';
  const [value, setValue] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [unlinking, setUnlinking] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => { setValue(steamUser?.discord_id || ''); }, [steamUser?.discord_id]);

  // Handle ?discord_link=success|error query params bounced back from /auth/discord/callback.
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
    <div>
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
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--pb-faint)' }}>
            One click — no Developer Mode needed.
          </div>
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--pb-faint)', marginBottom: 6 }}>
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
          style={{ flex: 1, minWidth: 240, letterSpacing: 0.4 }}
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
            style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444' }}
          >
            {unlinking ? 'Unlinking…' : 'Unlink Discord'}
          </button>
        )}
      </div>
      {error && <div style={{ marginTop: 6, color: '#ef4444', fontSize: 12 }}>{error}</div>}
      {msg && <div style={{ marginTop: 6, color: '#22c55e', fontSize: 12 }}>{msg}</div>}
    </div>
  );
}

// Twitch extension setup — helps streamers configure the OCE Inhouse Twitch panel/overlay.
function TwitchExtensionSection({ accountId }) {
  const aid = accountId || '';
  const [copied, setCopied] = React.useState(null);
  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(c => c === value ? null : c), 1800);
    } catch (_) {}
  };
  return (
    <div>
      <p style={{ color: 'var(--pb-faint)', fontSize: 13, marginBottom: 14 }}>
        Install the OCE Inhouse Twitch extension on your channel to show your rank,
        win/loss streak, and last 5 matches in the panel under your stream.
        It&rsquo;s read-only and uses public endpoints &mdash; no secrets, no Twitch OAuth.
      </p>
      <ol style={{ margin: '0 0 14px 18px', padding: 0, fontSize: 13, color: 'var(--pb-faint)', lineHeight: 1.6 }}>
        <li>Open <strong>Creator Dashboard → Extensions</strong> on Twitch and search for <em>OCE Inhouse</em>.</li>
        <li>Install it and activate it as a Panel (and, optionally, as a Video Overlay).</li>
        <li>Open its <em>Configure</em> tab and paste your account id (below) into the box, then click <em>Save</em>.</li>
      </ol>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { key: 'aid', label: 'Your account id', value: aid || '(sign in to see your id)',
            canCopy: !!aid,
            hint: 'The extension stores this value in Twitch\'s broadcaster configuration service — set it once and every viewer\'s panel + overlay re-poll automatically.' },
          { key: 'cfg', label: 'Extension config page', value: 'https://dashboard.twitch.tv/extensions',
            canCopy: true,
            hint: 'Where you set the account id above. Open this URL on Twitch, find the OCE Inhouse extension, and click "Configure" on its tile.' },
        ].map(it => (
          <div key={it.key} style={{ background: 'var(--pb-surface-2)', border: '1px solid var(--pb-line)', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{it.label}</div>
              <button type="button" className="btn"
                onClick={() => it.canCopy && copy(it.value)}
                aria-label={`Copy ${it.label}`}
                disabled={!it.canCopy}>
                {copied === it.value ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <code style={{ display: 'block', fontSize: 13, color: 'var(--pb-text)', wordBreak: 'break-all' }}>
              {it.value}
            </code>
            <div style={{ fontSize: 11, color: 'var(--pb-faint)', marginTop: 6 }}>{it.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Streamer setup — OBS overlay URLs and stream privacy prefs.
function StreamerSetupSection({ accountId }) {
  const [prefs, setPrefs] = React.useState({ stream_hide_mmr: false, stream_hide_region: false, stream_alias: '' });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [copied, setCopied] = React.useState(null);
  const [activePreview, setActivePreview] = React.useState('ticker');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/me/stream-prefs', { credentials: 'include' });
        if (!r.ok) throw new Error('http ' + r.status);
        const j = await r.json();
        if (!cancelled) setPrefs({
          stream_hide_mmr: !!j.stream_hide_mmr,
          stream_hide_region: !!j.stream_hide_region,
          stream_alias: j.stream_alias || '',
        });
      } catch (_) {
        if (!cancelled) setMsg('Could not load your stream prefs.');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch('/api/me/stream-prefs', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!r.ok) throw new Error('http ' + r.status);
      setMsg('Saved.');
    } catch (e) { setMsg('Save failed: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const aid = accountId || '<your-account-id>';
  const urls = [
    { key: 'live', label: 'Live lobby overlay', url: `${origin}/overlay/live/current?for=${aid}`,
      hint: 'Shows the current inhouse lobby (Radiant/Dire rosters) when the bot is monitoring one.' },
    { key: 'scoreboard', label: 'Scoreboard overlay', url: `${origin}/overlay/scoreboard/<MATCH_ID>?for=${aid}`,
      hint: 'Replace <MATCH_ID> with a real match id. Shows K/D/A, LH/DN, GPM, XPM, Net Worth per player.' },
    { key: 'ticker', label: 'Player ticker overlay', url: `${origin}/overlay/ticker/${aid}`,
      hint: 'Compact MMR / W-L / win-rate strip scoped to your account. Honours all privacy toggles below.' },
  ];

  const copy = async (key, url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(c => c === key ? null : c), 1800);
    } catch (_) { setMsg('Copy failed — select and copy manually.'); }
  };

  const previewUrl = (() => {
    if (activePreview === 'ticker') return `${origin}/overlay/ticker/${aid}`;
    if (activePreview === 'live') return `${origin}/overlay/live/current?for=${aid}`;
    return null;
  })();

  return (
    <div>
      <p style={{ color: 'var(--pb-faint)', fontSize: 13, marginBottom: 14 }}>
        Drop these URLs into OBS as a Browser Source (1920×1080, transparent background).
        Use <code>?streamer=1</code> on any other page on this site to hide the navbar, footer, and modals
        while you screen-share the page.
      </p>

      {loading ? (
        <div style={{ color: 'var(--pb-faint)', fontSize: 13 }}>Loading your privacy prefs…</div>
      ) : (
        <div style={{ background: 'var(--pb-surface-2)', border: '1px solid var(--pb-line)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>Stream privacy</div>
          <label className="pb-settings-check-row" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={prefs.stream_hide_mmr}
              onChange={(e) => setPrefs(p => ({ ...p, stream_hide_mmr: e.target.checked }))} />
            <span>Hide my MMR &amp; tier from every overlay</span>
          </label>
          <label className="pb-settings-check-row" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={prefs.stream_hide_region}
              onChange={(e) => setPrefs(p => ({ ...p, stream_hide_region: e.target.checked }))} />
            <span>Hide my region from every overlay</span>
          </label>
          <div style={{ marginBottom: 10 }}>
            <label htmlFor="stream-alias-input" style={{ display: 'block', fontSize: 13, color: 'var(--pb-faint)', marginBottom: 4 }}>
              Stream alias (replaces your Steam name on overlays)
            </label>
            <input id="stream-alias-input" type="text" value={prefs.stream_alias} maxLength={32}
              onChange={(e) => setPrefs(p => ({ ...p, stream_alias: e.target.value }))}
              placeholder="Leave blank to use your Steam name" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save privacy prefs'}
            </button>
            {msg && <span style={{ fontSize: 13, color: 'var(--pb-faint)' }} role="status">{msg}</span>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        {urls.map(u => (
          <div key={u.key} style={{ background: 'var(--pb-surface-2)', border: '1px solid var(--pb-line)', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{u.label}</div>
              <button type="button" className="btn" onClick={() => copy(u.key, u.url)}
                aria-label={`Copy ${u.label} URL`}>
                {copied === u.key ? 'Copied ✓' : 'Copy URL'}
              </button>
            </div>
            <input type="text" readOnly value={u.url}
              aria-label={`${u.label} URL`}
              onFocus={(e) => e.target.select()} />
            <p style={{ fontSize: 12, color: 'var(--pb-faint)', marginTop: 6, marginBottom: 0 }}>{u.hint}</p>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--pb-surface-2)', border: '1px solid var(--pb-line)', borderRadius: 10, padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginRight: 4 }}>Preview:</div>
          {[
            { id: 'ticker', label: 'Ticker' },
            { id: 'live', label: 'Live lobby' },
            { id: 'none', label: 'Off' },
          ].map(opt => (
            <button key={opt.id} type="button"
              onClick={() => setActivePreview(opt.id)}
              aria-pressed={activePreview === opt.id}
              className="btn"
              style={{
                background: activePreview === opt.id ? 'var(--pb-brass)' : 'var(--pb-surface)',
                color: activePreview === opt.id ? '#0d1424' : 'var(--pb-text)',
              }}>
              {opt.label}
            </button>
          ))}
        </div>
        {previewUrl ? (
          <div style={{ background: '#1a1a1a', borderRadius: 8, overflow: 'hidden', aspectRatio: '16 / 9' }}>
            <iframe
              title={`Overlay preview (${activePreview})`}
              src={previewUrl}
              style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
              loading="lazy"
            />
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--pb-faint)', margin: 0 }}>Preview off.</p>
        )}
        <p style={{ fontSize: 11, color: 'var(--pb-faint)', marginTop: 8, marginBottom: 0 }}>
          The preview iframe is scaled to fit; OBS renders these at full 1920×1080 with a transparent background.
        </p>
      </div>
    </div>
  );
}

// ── Helper: Press Box section card ────────────────────────────────────────────
function SettingsCard({ eyebrow, title, description, children, wide = false }) {
  return (
    <div className={`pb-card pb-settings-card${wide ? ' pb-settings-card--wide' : ''}`}>
      <div className="pb-settings-card-head">
        {eyebrow && <div className="pb-eyebrow">{eyebrow}</div>}
        <div className="pb-settings-card-title">{title}</div>
        {description && <p className="pb-settings-card-desc">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SettingsProfile() {
  const { steamUser, refreshMe } = useSteamAuth() || {};
  const enabled = true;

  const [activeTab, setActiveTab] = useState('identity');
  const settingsTabRefs = useRef([]);
  const onTabKeyDown = useCallback((e, i) => {
    const last = SETTINGS_TABS.length - 1;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = i === last ? 0 : i + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = i === 0 ? last : i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    setActiveTab(SETTINGS_TABS[next].id);
    settingsTabRefs.current[next]?.focus();
  }, []);
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
  const [layoutTheme, setLayoutTheme] = useState(DEFAULT_LAYOUT_THEME);
  const [coverFx, setCoverFx] = useState([]);
  const [ownedEntitlements, setOwnedEntitlements] = useState([]);
  const [selectedVoicePack, setSelectedVoicePack] = useState('');
  const voicePlayerRef = useRef(null);
  if (typeof window !== 'undefined' && !voicePlayerRef.current) {
    voicePlayerRef.current = createVoicePackPlayer();
  }
  const [ownedFrames, setOwnedFrames] = useState([]);
  const [framePurchaseLoading, setFramePurchaseLoading] = useState(null);
  const [framePurchaseError, setFramePurchaseError] = useState(null);

  const [extras, setExtras] = useState(DEFAULT_EXTRAS);
  const setExtra = (k, v) => setExtras(prev => ({ ...prev, [k]: v }));
  const [achievementsList, setAchievementsList] = useState([]);
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

  useEffect(() => {
    if (!accountId) return;
    getOwnedFrames().then(setOwnedFrames).catch(() => {});
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    fetch(`/api/players/${accountId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.recentMatches) setOwnMatches(d.recentMatches);
        if (d?.heroes) setOwnHeroes(d.heroes);
      })
      .catch(() => {});
    fetch(`/api/players/${accountId}/streak`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.streak != null) setStreak(d.streak); })
      .catch(() => {});
  }, [accountId]);

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
    if (!q) return ALL_HEROES.slice(0, 0);
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
          <OnboardingWizard onComplete={() => setShowWizard(false)} onDismiss={() => setShowWizard(false)} />
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
          <h1 style={{ margin: 0 }}>Profile Customization</h1>
          {accountId && (
            <button className="btn btn-small" onClick={handleRedoWizard} disabled={wizardResetting}
              title="Redo the onboarding setup wizard" style={{ fontSize: 13, opacity: 0.8 }}>
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
    return <SignInPrompt title="Profile Customization" message="Sign in with Steam to customize your profile bio, title, theme, and frame." />;
  }

  // Build preview data for MagazineCover + ProfileCard.
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
        return { emoji: a.emoji || a.icon || '🏆', label: a.label || a.title || a.key, sub: a.description || a.sub || null };
      })()
    : null;
  const previewTopHeroes = (ownHeroes || []).slice(0, 5).map(h => ({
    hero_id: h.hero_id, games: parseInt(h.games || 0), wins: parseInt(h.wins || 0),
  }));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="container pb-settings-shell">
      {showWizard && (
        <OnboardingWizard onComplete={() => setShowWizard(false)} onDismiss={() => setShowWizard(false)} />
      )}

      {/* Page header */}
      <div className="pb-settings-hd">
        <div className="pb-settings-hd-left">
          <div className="pb-eyebrow">Profile Settings</div>
          <h1 className="pb-settings-title">Edit Profile</h1>
          <p className="pb-settings-subtitle">
            Personalise how your profile looks to other players. Premium options unlock with Pro.
          </p>
        </div>
        <div className="pb-settings-hd-actions">
          {accountId && (
            <button
              type="button"
              className="btn btn-small"
              onClick={handleRedoWizard}
              disabled={wizardResetting}
              title="Redo the onboarding setup wizard"
              style={{ fontSize: 13, opacity: 0.75 }}
            >
              {wizardResetting ? 'Loading…' : '🔁 Redo wizard'}
            </button>
          )}
          <button
            type="button"
            className="pb-settings-save-btn"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </div>

      {error && <div className="error-state" style={{ margin: '0 0 16px' }}>{error}</div>}
      {savedMsg && (
        <div style={{ margin: '0 0 16px', padding: '8px 12px', background: '#0f3a1f', border: '1px solid #22c55e', borderRadius: 6, fontSize: 13 }}>
          {savedMsg}
        </div>
      )}
      {loading && <div className="loading">Loading…</div>}

      {!loading && (
        <>
        {/* Tab list — spans the full width above the form + preview split */}
        <div
          role="tablist"
          aria-label="Profile settings sections"
          className="pb-settings-tablist"
        >
          {SETTINGS_TABS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`pbs-tab-${t.id}`}
              ref={(el) => { settingsTabRefs.current[i] = el; }}
              aria-selected={activeTab === t.id}
              aria-controls={`pbs-panel-${t.id}`}
              tabIndex={activeTab === t.id ? 0 : -1}
              onClick={() => setActiveTab(t.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className="pb-settings-tab"
            >
              <span className="pb-settings-tab-icon" aria-hidden="true">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="pb-settings-layout">

          {/* ── Left: form column ── */}
          <div className="pb-settings-form-col">

            {/* ── IDENTITY panel ── */}
            <div
              role="tabpanel"
              id="pbs-panel-identity"
              aria-labelledby="pbs-tab-identity"
              tabIndex={0}
              hidden={activeTab !== 'identity'}
              className="pb-settings-panel"
            >
              {/* Bio */}
              <SettingsCard
                wide
                eyebrow="Identity"
                title="Bio"
                description="A short description shown at the top of your public profile page."
              >
                <div className="pb-settings-field">
                  <label htmlFor="bio-input" className="pb-settings-field-label">
                    Bio ({bio.length}/{BIO_MAX})
                  </label>
                  <textarea
                    id="bio-input"
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                    rows={3}
                    placeholder="A short blurb that shows on your profile."
                  />
                </div>
              </SettingsCard>

              {/* Custom title */}
              <SettingsCard
                eyebrow="Identity"
                title="Profile Title"
                description="A short label shown beneath your name on the profile card. Pro titles are locked until Pro membership is available."
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {FREE_TITLES.map(t => (
                    <label key={t || '__none__'} className="pb-settings-check-row">
                      <input type="radio" name="title" value={t}
                        checked={customTitle === t}
                        onChange={() => setCustomTitle(t)} />
                      <span>{t || <em style={{ color: 'var(--pb-faint)' }}>(no title)</em>}</span>
                    </label>
                  ))}
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--pb-line-soft)' }}>
                    <div className="pb-settings-field-label" style={{ marginBottom: 8 }}>Pro titles</div>
                    {PREMIUM_TITLES.map(t => (
                      <label key={t} className="pb-settings-check-row" style={{ marginBottom: 4, opacity: isPro ? 1 : 0.55, cursor: isPro ? 'pointer' : 'not-allowed' }}>
                        <input type="radio" name="title" value={t}
                          disabled={!isPro}
                          checked={customTitle === t}
                          onChange={() => isPro && setCustomTitle(t)} />
                        <span>{t}</span>
                        <LockedPill />
                      </label>
                    ))}
                  </div>
                </div>
              </SettingsCard>

              {/* Vanity URL */}
              <SettingsCard
                eyebrow="Identity"
                title="Vanity Profile URL"
                description="Set a custom slug so your profile is reachable at /p/your-name instead of the numeric player ID."
              >
                <VanitySlugPicker />
              </SettingsCard>
            </div>

            {/* ── APPEARANCE panel ── */}
            <div
              role="tabpanel"
              id="pbs-panel-appearance"
              aria-labelledby="pbs-tab-appearance"
              tabIndex={0}
              hidden={activeTab !== 'appearance'}
              className="pb-settings-panel"
            >
              {/* Theme accent */}
              <SettingsCard
                eyebrow="Appearance"
                title="Accent Colour"
                description="The highlight colour used throughout your profile card — borders, stat lines, and flair chips."
              >
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {FREE_THEMES.map(c => (
                    <ThemeSwatch key={c} color={c} selected={themeAccent === c} onClick={() => setThemeAccent(c)} />
                  ))}
                  <span style={{ fontSize: 12, color: 'var(--pb-faint)', marginLeft: 8, marginRight: 4 }}>Pro:</span>
                  {PREMIUM_THEMES.map(c => (
                    <ThemeSwatch key={c} color={c} selected={themeAccent === c}
                      locked={!isPro} onClick={() => setThemeAccent(c)} />
                  ))}
                </div>
              </SettingsCard>

              {/* Profile layout theme */}
              <SettingsCard
                eyebrow="Appearance"
                title="Cover Theme"
                description="Restyles the Magazine cover banner on your public profile. Court & Pitch is free; the other five themes are Pro cosmetics."
              >
                <div className="pb-settings-option-grid">
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
                        className={`pb-settings-option-btn${selected ? ' is-selected' : ''}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {meta.label}
                          {premium && <LockedPill />}
                        </div>
                        <div className="pb-settings-option-sub">{meta.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </SettingsCard>

              {/* Profile frame */}
              <SettingsCard
                eyebrow="Appearance"
                title="Profile Frame"
                description="A decorative border around your profile card. Premium frames require Pro membership or a separate purchase."
              >
                <div className="pb-settings-option-grid">
                  {FREE_FRAMES.map(f => {
                    const meta = FRAME_META[f] || {};
                    const selected = profileFrame === f;
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setProfileFrame(f)}
                        className={`pb-settings-option-btn${selected ? ' is-selected' : ''}`}
                      >
                        {meta.label || f}
                      </button>
                    );
                  })}
                  {PREMIUM_FRAMES.map(f => {
                    const meta = FRAME_META[f] || {};
                    const selected = profileFrame === f;
                    const owned = ownedFrames.includes(f);
                    const buying = framePurchaseLoading === f;
                    const proBundled = f === 'gold';
                    if (proBundled && !isPro) {
                      return (
                        <button key={f} type="button" disabled
                          title="Gold frame is included with Pro membership"
                          className="pb-settings-option-btn"
                          style={{ opacity: 0.45 }}>
                          {meta.label || f} ★
                        </button>
                      );
                    }
                    if (proBundled && isPro) {
                      return (
                        <button
                          key={f} type="button"
                          onClick={() => setProfileFrame(f)}
                          title="Included with Pro"
                          className={`pb-settings-option-btn${selected ? ' is-selected' : ''}`}
                        >
                          {meta.label || f} ✓ <span style={{ fontSize: 10, opacity: 0.7 }}>(Pro)</span>
                        </button>
                      );
                    }
                    if (owned) {
                      return (
                        <button
                          key={f} type="button"
                          onClick={() => setProfileFrame(f)}
                          title={meta.label}
                          className={`pb-settings-option-btn${selected ? ' is-selected' : ''}`}
                        >
                          {meta.label || f} ✓
                        </button>
                      );
                    }
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={async () => {
                          setFramePurchaseLoading(f);
                          setFramePurchaseError(null);
                          try {
                            const { url } = await purchaseFrameCheckout(f);
                            window.location.assign(url);
                          } catch (err) {
                            setFramePurchaseError(err.message);
                            setFramePurchaseLoading(null);
                          }
                        }}
                        className="pb-settings-option-btn"
                        style={{ border: '1px dashed rgba(168,85,247,0.5)', color: '#a855f7', background: 'rgba(168,85,247,0.08)' }}
                      >
                        {buying ? 'Opening…' : `Buy ${meta.label}`}
                      </button>
                    );
                  })}
                </div>
                {framePurchaseError && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>{framePurchaseError}</div>
                )}
              </SettingsCard>

              {/* Cover effects */}
              <SettingsCard
                eyebrow="Appearance · Pro"
                title="Cover Effects"
                description="Animated polish layered onto your Magazine cover banner. All effects respect your system's reduced-motion preference."
              >
                <div className="pb-settings-option-grid">
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
                        className={`pb-settings-option-btn${on ? ' is-selected' : ''}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {meta.label}
                          {locked && <LockedPill />}
                        </div>
                        <div className="pb-settings-option-sub">{meta.sub}</div>
                      </button>
                    );
                  })}
                </div>
                {ownedEntitlements.includes('founders_pass_ring') && (
                  <p style={{ marginTop: 10, fontSize: 12, color: 'var(--pb-brass)' }}>
                    ✓ Founders Pass ring is active around your cover banner.
                  </p>
                )}
              </SettingsCard>

              {/* Inhouse voice pack */}
              <SettingsCard
                wide
                eyebrow="Appearance · Pro"
                title="Inhouse Voice Pack"
                description={
                  <>
                    Replaces the default bell chime on inhouse alerts (accept phase, captain selected, your pick, match ready).
                    Browse all paid cosmetics on the <Link to="/shop" style={{ color: 'var(--pb-brass)', fontWeight: 600 }}>Cosmetics Shop</Link>.
                  </>
                }
              >
                <div className="pb-settings-option-grid">
                  <button
                    type="button"
                    onClick={() => setSelectedVoicePack('')}
                    title="Default church-bell chime"
                    className={`pb-settings-option-btn${!selectedVoicePack ? ' is-selected' : ''}`}
                  >
                    <div>Default bell</div>
                    <div className="pb-settings-option-sub">Free — medieval church-bell chime</div>
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
                          className={`pb-settings-option-btn${selected ? ' is-selected' : ''}`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {meta.label}
                            {premium && <LockedPill />}
                          </div>
                          <div className="pb-settings-option-sub">{meta.sub}</div>
                        </button>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {VOICE_PACK_EVENTS.map(ev => (
                            <button
                              key={ev}
                              type="button"
                              aria-label={`Play ${meta.label} ${VOICE_EVENT_LABELS[ev] || ev} sample`}
                              title={`Play ${VOICE_EVENT_LABELS[ev] || ev} sample`}
                              onClick={() => {
                                try {
                                  const muted = typeof window !== 'undefined'
                                    && window.localStorage
                                    && window.localStorage.getItem('inhouse:muted') === '1';
                                  if (muted) return;
                                  if (!voicePlayerRef.current) return;
                                  voicePlayerRef.current.play({ pack: p, event: ev });
                                } catch (_) {}
                              }}
                              style={{
                                fontSize: 11, padding: '3px 7px', borderRadius: 6,
                                background: 'transparent', border: '1px solid var(--pb-line)',
                                color: 'var(--pb-faint)', cursor: 'pointer',
                              }}
                            >
                              ▶ {VOICE_EVENT_LABELS[ev] || ev}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SettingsCard>
            </div>

            {/* ── SHOWCASE panel ── */}
            <div
              role="tabpanel"
              id="pbs-panel-showcase"
              aria-labelledby="pbs-tab-showcase"
              tabIndex={0}
              hidden={activeTab !== 'showcase'}
              className="pb-settings-panel"
            >
              {/* Pinned hero */}
              <SettingsCard
                eyebrow="Showcase"
                title="Pinned Hero"
                description="The hero featured prominently on your profile card — shown with your win rate, KDA, and games played."
              >
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
                    <input
                      type="text"
                      value={pinnedHeroSearch}
                      onChange={(e) => { setPinnedHeroSearch(e.target.value); }}
                      placeholder="Search hero name…"
                    />
                    {heroOptions.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                        background: 'var(--pb-surface)', border: '1px solid var(--pb-line)', borderRadius: 8,
                        zIndex: 10, maxHeight: 220, overflowY: 'auto',
                      }}>
                        {heroOptions.map(h => (
                          <button type="button" key={h.id}
                            onClick={() => { setPinnedHeroId(String(h.id)); setPinnedHeroSearch(h.name); }}
                            aria-label={`Pin hero ${h.name}`}
                            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, color: 'inherit', font: 'inherit', padding: '6px 10px', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--pb-surface-2)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = ''}
                            onFocus={(e) => e.currentTarget.style.background = 'var(--pb-surface-2)'}
                            onBlur={(e) => e.currentTarget.style.background = ''}
                          >
                            <img src={getHeroImageUrl(h.id)} alt="" style={{ width: 36, height: 20, borderRadius: 2 }} />
                            {h.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {pinnedHeroId && (
                    <button type="button" className="btn btn-small"
                      onClick={() => { setPinnedHeroId(''); setPinnedHeroSearch(''); setPinnedHeroCaption(''); }}>
                      Clear
                    </button>
                  )}
                </div>
                {pinnedHeroId && (
                  <div style={{ marginTop: 10 }}>
                    <input
                      type="text"
                      value={pinnedHeroCaption}
                      onChange={(e) => setPinnedHeroCaption(e.target.value.slice(0, PINNED_HERO_CAPTION_MAX))}
                      placeholder={`Optional caption (≤${PINNED_HERO_CAPTION_MAX} chars)`}
                    />
                    {/* Pinned hero border colour */}
                    <div style={{ marginTop: 12 }}>
                      <div className="pb-settings-field-label" style={{ marginBottom: 6 }}>Hero border colour</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {HERO_BORDER_COLORS.map(c => {
                          const selected = (extras.pinned_hero_border || '') === c.value;
                          return (
                            <button key={c.label} type="button"
                              onClick={() => setExtra('pinned_hero_border', c.value || null)}
                              title={c.label}
                              aria-label={`Set hero border to ${c.label}`}
                              style={{
                                width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
                                background: c.value || 'transparent',
                                border: selected ? '3px solid #fff' : '1px solid var(--pb-line)',
                                backgroundImage: c.value ? undefined : 'linear-gradient(45deg, transparent 45%, var(--pb-faint) 45% 55%, transparent 55%)',
                              }} />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </SettingsCard>

              {/* Pinned match */}
              <SettingsCard
                eyebrow="Showcase"
                title="Pinned Match"
                description="A specific match shown on your profile card as a highlight. Visitors can click through to the full match page."
              >
                {ownMatches.length === 0 ? (
                  <p style={{ color: 'var(--pb-faint)', fontSize: 13 }}>No recent matches available to pin.</p>
                ) : (
                  <select
                    value={pinnedMatchId}
                    onChange={(e) => setPinnedMatchId(e.target.value)}
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
              </SettingsCard>

              {/* Achievements */}
              <SettingsCard
                eyebrow="Showcase"
                title="Achievement Pins"
                description="Pin earned achievements to your profile. The avatar badge shows one achievement icon; the magazine ribbon shows up to 3 (Pro)."
              >
                {/* Pinned achievement — avatar badge */}
                <div style={{ marginBottom: 16 }}>
                  <div className="pb-settings-field-label" style={{ marginBottom: 6 }}>Avatar badge</div>
                  {achievementsList.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--pb-faint)' }}>You haven't earned any pinnable achievements yet.</p>
                  ) : (
                    <select value={extras.pinned_achievement_id || ''}
                      onChange={(e) => setExtra('pinned_achievement_id', e.target.value || null)}>
                      <option value="">— No pinned achievement —</option>
                      {achievementsList.map(a => (
                        <option key={a.key || a.id} value={a.key || a.id}>{a.label || a.title || a.key}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Pinned ribbon — magazine achievements */}
                <div>
                  <div className="pb-settings-field-label" style={{ marginBottom: 4 }}>
                    Magazine ribbon ({pinnedAchievements.length}/{isPro ? 3 : 1})
                    {!isPro && <LockedPill />}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--pb-faint)', marginTop: 0, marginBottom: 8 }}>
                    {isPro
                      ? 'Pin up to 3 achievements to display in the ribbon under your cover.'
                      : 'Pin 1 achievement for the cover ribbon. Pro members can pin up to 3.'}
                  </p>
                  {achievementsList.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--pb-faint)' }}>You haven't earned any pinnable achievements yet.</p>
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
                              padding: '6px 10px', borderRadius: 999,
                              border: pinned ? '1px solid var(--pb-brass)' : '1px solid var(--pb-line)',
                              background: pinned ? 'var(--pb-brass)' : 'var(--pb-surface)',
                              color: pinned ? '#0d1424' : 'var(--pb-text)',
                              fontSize: 12, cursor: atCap ? 'not-allowed' : 'pointer',
                              opacity: atCap ? 0.45 : 1,
                              display: 'inline-flex', alignItems: 'center', gap: 6,
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
              </SettingsCard>

              {/* Flair + toggles */}
              <SettingsCard
                eyebrow="Showcase"
                title="Display Options"
                description="Fine-tune what appears on your public profile card — toggle sections on/off and customise your flair tag."
              >
                {/* Toggles */}
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 20 }}>
                  <label className="pb-settings-check-row">
                    <input type="checkbox" checked={!!extras.show_top_heroes} onChange={(e) => setExtra('show_top_heroes', e.target.checked)} />
                    <span>Show most-played heroes strip</span>
                  </label>
                  <label className="pb-settings-check-row">
                    <input type="checkbox" checked={!!extras.show_streak} onChange={(e) => setExtra('show_streak', e.target.checked)} />
                    <span>Show win/loss streak badge</span>
                  </label>
                  <label className="pb-settings-check-row">
                    <input type="checkbox" checked={!!extras.pick_advisor_optin} onChange={(e) => setExtra('pick_advisor_optin', e.target.checked)} />
                    <span>Show pick suggestions when I join a lobby</span>
                  </label>
                  <label className="pb-settings-check-row" style={{ opacity: isPro ? 1 : 0.55, cursor: isPro ? 'pointer' : 'not-allowed' }}>
                    <input type="checkbox" disabled={!isPro} checked={!!extras.frame_animated} onChange={(e) => setExtra('frame_animated', e.target.checked)} />
                    <span>Animated frame shimmer</span>
                    <LockedPill />
                  </label>
                  <label className="pb-settings-check-row" style={{ opacity: isPro ? 1 : 0.55, cursor: isPro ? 'pointer' : 'not-allowed' }}>
                    <input type="checkbox" disabled={!isPro} checked={!!extras.bg_pattern} onChange={(e) => setExtra('bg_pattern', e.target.checked)} />
                    <span>Heraldic background pattern</span>
                    <LockedPill />
                  </label>
                </div>

                {/* Flair override */}
                <div style={{ borderTop: '1px solid var(--pb-line-soft)', paddingTop: 14 }}>
                  <label className="pb-settings-check-row" style={{ opacity: isPro ? 1 : 0.55, cursor: isPro ? 'pointer' : 'not-allowed', marginBottom: 8 }}>
                    <input type="checkbox" disabled={!isPro} checked={!!extras.flair_unlocked}
                      onChange={(e) => setExtra('flair_unlocked', e.target.checked)} />
                    <span>Override auto-flair <span style={{ color: 'var(--pb-faint)', fontWeight: 400 }}>(normally auto-picked from your stats)</span></span>
                    <LockedPill />
                  </label>
                  {extras.flair_unlocked && (
                    <select value={extras.flair_override || ''}
                      onChange={(e) => setExtra('flair_override', e.target.value || null)}>
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
              </SettingsCard>
            </div>

            {/* ── CONNECTIONS panel ── */}
            <div
              role="tabpanel"
              id="pbs-panel-connections"
              aria-labelledby="pbs-tab-connections"
              tabIndex={0}
              hidden={activeTab !== 'connections'}
              className="pb-settings-panel"
            >
              {/* Discord */}
              <SettingsCard
                wide
                eyebrow="Connections"
                title="Discord"
                description="Links your Steam account to your Discord user so the bot can DM you, mention you, and assign your league roles."
              >
                <DiscordLinkSection steamUser={steamUser} refreshMe={refreshMe} />
              </SettingsCard>

              {/* Social links */}
              <SettingsCard
                wide
                eyebrow="Connections"
                title="Social Links"
                description="Shown as chips on your public profile card. Only https URLs on the official Twitch / YouTube / Steam domains are accepted."
              >
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                  {[
                    { key: 'social_twitch',  label: 'Twitch URL',     placeholder: 'https://twitch.tv/your-name' },
                    { key: 'social_youtube', label: 'YouTube URL',    placeholder: 'https://youtube.com/@you' },
                    { key: 'social_steam',   label: 'Steam profile',  placeholder: 'https://steamcommunity.com/id/you' },
                  ].map(s => (
                    <div key={s.key} className="pb-settings-field">
                      <label htmlFor={`social-${s.key}`} className="pb-settings-field-label">{s.label}</label>
                      <input id={`social-${s.key}`} type="url" value={extras[s.key] || ''}
                        onChange={(e) => setExtra(s.key, e.target.value.slice(0, SOCIAL_URL_MAX) || null)}
                        placeholder={s.placeholder} />
                    </div>
                  ))}
                </div>

                {/* Twitch login for the live hub */}
                <div className="pb-settings-field" style={{ marginTop: 16, borderTop: '1px solid var(--pb-line-soft)', paddingTop: 14 }}>
                  <label htmlFor="twitch-login-input" className="pb-settings-field-label">
                    Twitch channel login — for the Live now hub
                  </label>
                  <input
                    id="twitch-login-input"
                    type="text"
                    value={extras.twitch_login || ''}
                    onChange={(e) => setExtra('twitch_login', e.target.value.trim().slice(0, 60) || null)}
                    placeholder="your_twitch_login"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    style={{ maxWidth: 360 }}
                  />
                  <p style={{ fontSize: 11, color: 'var(--pb-faint)', marginTop: 4, marginBottom: 0 }}>
                    Just your channel name (or a twitch.tv link). When you go live, you'll appear on the{' '}
                    <Link to="/live">Live now</Link> page with an embedded player and chat.
                  </p>
                </div>
              </SettingsCard>

              {/* Share card */}
              <SettingsCard
                wide
                eyebrow="Connections"
                title="Share Card"
                description="Hero portrait and tagline shown when your profile link is pasted into Discord, Twitter, Slack, etc."
              >
                <ShareCardHeroPicker
                  accountId={accountId}
                  extras={extras}
                  setExtra={setExtra}
                  ownHeroes={ownHeroes}
                  pinnedHeroId={pinnedHeroId}
                />
              </SettingsCard>

              {/* Streamer setup */}
              <SettingsCard
                wide
                eyebrow="Connections"
                title="Streamer Setup"
                description="OBS browser-source URLs for live lobby, scoreboard, and ticker overlays, plus stream privacy controls."
              >
                <StreamerSetupSection accountId={accountId} />
              </SettingsCard>

              {/* Twitch extension */}
              <SettingsCard
                wide
                eyebrow="Connections"
                title="Twitch Extension"
                description="Show your OCE Inhouse rank, streak, and recent matches in a panel under your Twitch stream."
              >
                <TwitchExtensionSection accountId={accountId} />
              </SettingsCard>
            </div>

            {/* Save bar — always below the active tab content */}
            <div className="pb-settings-save-bar">
              <button
                type="button"
                className="pb-settings-save-btn"
                onClick={onSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save profile'}
              </button>
              {savedMsg && <span className="pb-settings-save-msg">{savedMsg}</span>}
              {error && <span className="pb-settings-save-err">{error}</span>}
            </div>
          </div>

          {/* ── Right: sticky preview rail ── */}
          <div className="pb-settings-preview-col">
            <div className="pb-card pb-settings-card pb-settings-preview-rail">
              <div className="pb-settings-preview-label">Live preview · Cover</div>
              <div className={`magazine-v3 v3-theme-${layoutTheme || 'court-pitch'}`} style={{ marginTop: 6 }}>
                <MagazineCover
                  accountId={accountId}
                  displayName={displayName}
                  customTitle={customTitle || null}
                  bio={bio || null}
                  pinnedHero={previewPinnedHero}
                  topHero={ownHeroes[0] || null}
                  streak={streak}
                  themeAccent={themeAccent || null}
                  foundersRing={Array.isArray(ownedEntitlements) && ownedEntitlements.includes('founders_pass_ring')}
                  coverFx={Array.isArray(coverFx) ? coverFx : []}
                />
              </div>
              <div className="pb-settings-preview-label" style={{ marginTop: 16 }}>Live preview · Profile card</div>
              <div style={{ marginTop: 6 }}>
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
              </div>
            </div>
          </div>

        </div>
        </>
      )}
    </div>
  );
}
