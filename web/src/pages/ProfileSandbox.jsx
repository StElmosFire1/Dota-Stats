import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import { ALL_HEROES, getHeroName, getHeroImageUrl } from '../heroNames';
import {
  FREE_TITLES, PREMIUM_TITLES,
  FREE_THEMES, PREMIUM_THEMES,
  FREE_FRAMES, PREMIUM_FRAMES,
  BIO_MAX, PINNED_HERO_CAPTION_MAX, DEFAULT_THEME, DEFAULT_FRAME, FRAME_META,
  ALL_VOICE_PACKS, VOICE_PACK_META, isPremiumVoicePack,
  COVER_FX_IDS, COVER_FX_META,
} from '../profileCosmetics';
import ProfileCard from '../components/ProfileCard';
import MagazineCover from '../components/MagazineCover';
import '../components/MagazineCover.css';

// ---- Mock data ------------------------------------------------------------
// All numbers below are fabricated for the sandbox preview only — nothing is
// pulled from the live database. The sandbox exists to verify how the new
// customization controls render before they ship to /settings/profile + the
// real backend (planned for v5.75).

const SAMPLE_RECENT_MATCHES = [
  { match_id: 8001, hero_id: 14, kills: 18, deaths: 4,  assists: 11, win: true,  date: '2026-05-04', radiantScore: 32, direScore: 18, side: 'radiant', duration: 38 * 60 + 14 },
  { match_id: 8002, hero_id: 32, kills: 9,  deaths: 8,  assists: 16, win: false, date: '2026-05-03', radiantScore: 28, direScore: 41, side: 'radiant', duration: 44 * 60 + 22 },
  { match_id: 8003, hero_id: 41, kills: 21, deaths: 6,  assists: 9,  win: true,  date: '2026-05-02', radiantScore: 51, direScore: 22, side: 'dire',    duration: 32 * 60 + 8 },
  { match_id: 8004, hero_id: 9,  kills: 4,  deaths: 12, assists: 19, win: false, date: '2026-05-01', radiantScore: 19, direScore: 35, side: 'dire',    duration: 51 * 60 + 47 },
];

// Per-hero career stats so the pinned-hero card can show real KDA / WR /
// games for the chosen hero.
const SAMPLE_HERO_STATS = {
  14: { games: 84, wins: 53, kda: 4.21, avgK: 11.2, avgD: 4.4, avgA: 7.1 },
  32: { games: 47, wins: 24, kda: 2.88, avgK: 8.4,  avgD: 6.2, avgA: 9.8 },
  41: { games: 61, wins: 38, kda: 5.04, avgK: 14.1, avgD: 4.9, avgA: 9.5 },
  9:  { games: 22, wins: 14, kda: 3.12, avgK: 6.0,  avgD: 8.1, avgA: 19.2 },
};
function getHeroStats(heroId) {
  if (!heroId) return null;
  return SAMPLE_HERO_STATS[heroId] || { games: 12, wins: 6, kda: 2.50, avgK: 7.0, avgD: 5.0, avgA: 8.0 };
}

// "Top 3 heroes" auto-derived strip — would come from player_stats grouped by
// hero_id ORDER BY games DESC LIMIT 3 in the real impl.
const SAMPLE_TOP_HEROES = [
  { hero_id: 14, games: 84, wins: 53 },
  { hero_id: 41, games: 61, wins: 38 },
  { hero_id: 32, games: 47, wins: 24 },
];

// Sample mock streak — would come from a server-side derived "current run"
// query. Positive = win streak, negative = loss streak. ≥3 displays a badge.
const SAMPLE_STREAK = 4;

// Curated paid flair list. Player must *unlock* the flair feature (e.g. 100
// wins, top-10 season finish) — once unlocked they pick freely from this list
// and it never auto-changes. Exact unlock criteria TBD when the backend lands.
const PAID_FLAIRS = [
  'GOAT', 'Mid Lord', 'Carry GOAT', 'Hard Carry', 'King of Mid', 'Off-Lane Bruiser',
  'Roamer Supreme', 'Captain Material', 'Vision King', 'Untouchable',
  'Tilt Lord', 'Last-Pick Andy', 'Coinflip Specialist', 'Ratting Andy',
  'Smoke Connoisseur', 'Six-Slot Snowballer', 'Throw God', 'Comeback King',
  '1v9 Andy', 'Permaban Material', 'Mr. Farm', '6-Minute Echo', 'Rampage Andy',
  'Disco Pony', 'Dagger God', 'Ulti-Bot 9000',
];

// Pinned achievement list — would resolve to *earned* achievements from the
// real achievements table. For the sandbox we just show all of them unlocked.
const SAMPLE_ACHIEVEMENTS = [
  { id: 'first_blood',  emoji: '🩸', label: 'First Blood King',   sub: '50+ first bloods' },
  { id: 'comeback',     emoji: '🔥', label: 'Comeback King',       sub: 'Won 10 games down 15k+ gold' },
  { id: 'rampage',      emoji: '⚡', label: 'Rampage Master',      sub: '5+ career rampages' },
  { id: 'support_god',  emoji: '👁️', label: 'Vision Lord',         sub: 'Top 1% wards/min' },
  { id: 'season_champ', emoji: '🏆', label: 'Season X Champion',   sub: 'Won the Season X grand final' },
  { id: 'oneshot',      emoji: '💥', label: 'Glass Cannon',        sub: '20+ kills in <30 min game' },
];

// Hex colour palette for the paid pinned-hero icon border. Curated to brand,
// not a free-form colour picker.
const HERO_BORDER_COLORS = [
  { value: '', label: 'None' },
  { value: '#c5a975', label: 'Brass' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#22c55e', label: 'Radiant' },
  { value: '#ef4444', label: 'Dire' },
  { value: '#a855f7', label: 'Royal Purple' },
  { value: '#3b82f6', label: 'Steel Blue' },
  { value: '#f5efe2', label: 'Parchment' },
];

// Mock auto-derived flair (free tier). In live, the flair service would read
// player_stats and pick the highest-priority match based on rules like:
//   pos 1 main + WR ≥60% + KDA ≥4 → "Hard Carry"
//   most wards/min in pool        → "Vision King"
//   etc. Sandbox just picks one.
function autoFlair({ wr, kda, mainPos }) {
  if (wr >= 65 && kda >= 4) return 'GOAT';
  if (mainPos === 1 && wr >= 55) return 'Hard Carry';
  if (mainPos === 2 && kda >= 3.5) return 'Mid Threat';
  if (mainPos === 3) return 'Off-Lane Bruiser';
  if (mainPos === 4) return 'Roaming Support';
  if (mainPos === 5) return 'Captain Material';
  return 'Inhouse Regular';
}

function fmtDuration(s) {
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

// ---- Preview card ---------------------------------------------------------
// v6.18 — Sandbox now renders the same shared <ProfileCard /> the public
// profile uses. The legacy inline FullPreviewCard below is gone; this thin
// adapter just maps the sandbox's flat editor state into the shape ProfileCard
// expects so the sandbox keeps acting as a one-stop visual harness for every
// cosmetic knob.

function FullPreviewCard({ displayName, c, frame, foundersRing, coverFx }) {
  const heroStats = getHeroStats(c.pinned_hero_id);
  const pinnedMatch = SAMPLE_RECENT_MATCHES.find(m => m.match_id === c.pinned_match_id) || null;
  const pinnedAch = SAMPLE_ACHIEVEMENTS.find(a => a.id === c.pinned_achievement_id) || null;

  const customization = {
    bio: c.bio,
    custom_title: c.custom_title,
    theme_accent: c.theme_accent,
    profile_frame: frame,
    extras: {
      flair_unlocked: c.flair_unlocked,
      flair_override: c.flair_override,
      show_top_heroes: c.show_top_heroes,
      show_streak: c.show_streak,
      frame_animated: c.frame_animated,
      bg_pattern: c.bg_pattern,
      pinned_hero_border: c.pinned_hero_border_color,
      social_twitch: c.social_twitch,
      social_youtube: c.social_youtube,
      social_steam: c.social_steam,
    },
  };
  const pinnedHero = c.pinned_hero_id ? {
    hero_id: c.pinned_hero_id,
    name: getHeroName(c.pinned_hero_id),
    games: heroStats?.games || 0,
    wins: heroStats?.wins || 0,
    kda: heroStats?.kda ?? null,
    caption: c.pinned_hero_caption,
    borderColor: c.pinned_hero_border_color || null,
  } : null;
  const pinnedMatchProp = pinnedMatch ? {
    match_id: pinnedMatch.match_id,
    hero_id: pinnedMatch.hero_id,
    hero: getHeroName(pinnedMatch.hero_id),
    kills: pinnedMatch.kills,
    deaths: pinnedMatch.deaths,
    assists: pinnedMatch.assists,
    duration: pinnedMatch.duration,
    player_won: pinnedMatch.win,
    radiantScore: pinnedMatch.radiantScore,
    direScore: pinnedMatch.direScore,
  } : null;

  const previewPinnedHero = pinnedHero;
  return (
    <div>
      {/* Task #219 — Magazine v3 cover preview reacts live to Cover FX +
          Founders ring toggles, matching what /players/:id renders. CSS
          gates animations behind `prefers-reduced-motion: no-preference`. */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1.5, marginBottom: 6, textTransform: 'uppercase' }}>
        Live Preview · cover
      </div>
      <div className="magazine-v3 v3-theme-court-pitch">
        {/* Task #314 / v7.34 — ProfileSandbox doesn't surface a ring-picker
            yet, so the equipped slug is just propagated through if present in
            the sandbox state (defaults to none). */}
        <MagazineCover
          displayName={displayName}
          customTitle={c.custom_title || null}
          bio={c.bio || null}
          pinnedHero={previewPinnedHero}
          topHero={SAMPLE_TOP_HEROES[0] || null}
          streak={c.show_streak ? SAMPLE_STREAK : 0}
          themeAccent={c.theme_accent || null}
          flair={c.flair_unlocked && c.flair_override ? c.flair_override : (c.flair_auto || null)}
          foundersRing={!!foundersRing}
          coverFx={Array.isArray(coverFx) ? coverFx : []}
        />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1.5, margin: '14px 0 6px', textTransform: 'uppercase' }}>
        Live Preview · profile card
      </div>
      <ProfileCard
        displayName={displayName}
        customization={customization}
        pinnedHero={pinnedHero}
        pinnedMatch={pinnedMatchProp}
        pinnedAchievement={pinnedAch}
        topHeroes={SAMPLE_TOP_HEROES}
        streak={c.show_streak ? SAMPLE_STREAK : 0}
        frame={frame}
        flairAuto={c.flair_auto}
      />

      {/* Mock recent matches strip kept here so the sandbox still doubles as a
          full visual harness — the public profile renders this from real data
          inside its own match-history widget below the card. */}
      <div style={{ marginTop: 18, padding: 12, borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
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

// ---- Sandbox page ---------------------------------------------------------

export default function ProfileSandbox() {
  const { isSuperuser } = useSuperuser();

  const [displayName, setDisplayName] = useState('TestPlayer');
  const [bio, setBio] = useState('Just a sandbox account testing every customization knob.');
  const [customTitle, setCustomTitle] = useState(FREE_TITLES[1] || '');
  const [themeAccent, setThemeAccent] = useState(DEFAULT_THEME);
  const [profileFrame, setProfileFrame] = useState(DEFAULT_FRAME);
  // v6.62 / Task #206 — voice pack sandbox picker (Pro-only). Mirrors the
  // production picker in /settings/profile so superusers can audition the
  // pack catalogue without flipping their own row.
  const [selectedVoicePack, setSelectedVoicePack] = useState('');
  const voicePreviewElsRef = React.useRef(new Map());
  const [pinnedHeroId, setPinnedHeroId] = useState('14');
  const [pinnedHeroSearch, setPinnedHeroSearch] = useState('Pudge');
  const [pinnedHeroCaption, setPinnedHeroCaption] = useState('My signature pick');
  const [pinnedMatchId, setPinnedMatchId] = useState('8001');
  const [proPreview, setProPreview] = useState(true);

  // New v5.74 controls
  const [pinnedHeroBorder, setPinnedHeroBorder] = useState('#c5a975');
  const [pinnedAchievementId, setPinnedAchievementId] = useState('comeback');
  const [showTopHeroes, setShowTopHeroes] = useState(true);
  const [showStreak, setShowStreak] = useState(true);
  const [frameAnimated, setFrameAnimated] = useState(false);
  const [bgPattern, setBgPattern] = useState(false);
  const [socialTwitch, setSocialTwitch] = useState('https://twitch.tv/sample');
  const [socialYoutube, setSocialYoutube] = useState('');
  const [socialSteam, setSocialSteam] = useState('');

  // Flair controls
  const [flairUnlocked, setFlairUnlocked] = useState(true);
  const [flairOverride, setFlairOverride] = useState('Mid Lord');

  // v6.63 / Task #207 — Founders Pass ring + Cover FX simulation. The
  // sandbox doesn't render MagazineCover, so this section just toggles
  // the simulated state and surfaces it in the preview footer below.
  const [foundersRing, setFoundersRing] = useState(true);
  const [coverFx, setCoverFx] = useState([]);

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

  // Auto-flair preview based on mock player headline stats — would come from
  // /api/player/:id/flair-auto in production.
  const autoFlairValue = autoFlair({ wr: 58, kda: 3.4, mainPos: 2 });

  const customization = {
    bio, custom_title: customTitle, theme_accent: themeAccent,
    pinned_hero_id: pinnedHeroId ? parseInt(pinnedHeroId, 10) : null,
    pinned_hero_caption: pinnedHeroCaption,
    pinned_hero_border_color: proPreview ? pinnedHeroBorder : '',
    pinned_match_id: pinnedMatchId ? parseInt(pinnedMatchId, 10) : null,
    pinned_achievement_id: proPreview ? pinnedAchievementId : null,
    show_top_heroes: showTopHeroes,
    show_streak: showStreak,
    frame_animated: proPreview && frameAnimated,
    bg_pattern: proPreview && bgPattern,
    social_twitch: socialTwitch.trim() || null,
    social_youtube: socialYoutube.trim() || null,
    social_steam: socialSteam.trim() || null,
    flair_auto: autoFlairValue,
    flair_override: flairOverride,
    flair_unlocked: proPreview && flairUnlocked,
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
    setPinnedHeroBorder('#c5a975');
    setPinnedAchievementId('comeback');
    setShowTopHeroes(true); setShowStreak(true);
    setFrameAnimated(false); setBgPattern(false);
    setSocialTwitch('https://twitch.tv/sample'); setSocialYoutube(''); setSocialSteam('');
    setFlairUnlocked(true); setFlairOverride('Mid Lord');
  }

  const inputStyle = {
    width: '100%', padding: 10, borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    color: 'var(--text-primary)', fontSize: 14,
  };

  const proLabel = (
    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#3b2a08', color: '#fbbf24', fontWeight: 700, marginLeft: 6 }}>🔒 PRO</span>
  );

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>👤 Profile Sandbox</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/admin/profile-demo" className="btn btn-sm">👁️ View as public profile</Link>
          <button className="btn btn-sm" onClick={reset}>↺ Reset to defaults</button>
          <Link to="/admin" className="btn btn-sm">← Back to Admin Panel</Link>
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 0, marginBottom: 18 }}>
        Fully interactive test profile with every customization control wired up. Edit on the right —
        the live preview updates on the left. <strong>Nothing here is persisted</strong>: pure
        client-side simulator of <code>/settings/profile</code> for verifying how new cosmetic
        options render before exposing them to real users. Backend rollout for the new v5.74
        features is planned for v5.75.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1fr) minmax(360px, 1fr)', gap: 20 }}>
        {/* PREVIEW */}
        <div style={{ position: 'sticky', top: 16, alignSelf: 'flex-start' }}>
          <FullPreviewCard displayName={displayName} c={customization} frame={profileFrame} foundersRing={foundersRing} coverFx={coverFx} />
          <div style={{
            marginTop: 14, padding: 12, borderRadius: 8,
            background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)',
          }}>
            <strong>Frame:</strong> {profileFrame || 'default'} ·
            <strong> Accent:</strong> <code>{themeAccent}</code> ·
            <strong> Pro mode:</strong> {proPreview ? 'on (premium options unlocked)' : 'off'}
            <br />
            <strong>Flair auto:</strong> <em>{autoFlairValue}</em>
            {customization.flair_unlocked && customization.flair_override
              ? <> · <strong>Override:</strong> <em>{customization.flair_override}</em></>
              : <> · <em>(no override — auto in use)</em></>}
          </div>
        </div>

        {/* EDITOR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Display name (mock)</h2>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} style={inputStyle} />
          </section>

          <section style={{ padding: 12, border: '1px dashed var(--border)', borderRadius: 8, background: 'rgba(245,158,11,0.04)' }}>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Pro preview toggle</h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={proPreview} onChange={e => setProPreview(e.target.checked)} />
              Treat sandbox account as <strong>Pro</strong> (unlocks premium titles / themes / frames / achievements / hero borders / animated frame / bg pattern / flair override)
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
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Flair</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              Free players show an <strong>auto-derived</strong> flair (recomputed every time stats change).
              Pro players who have <strong>unlocked</strong> the override (e.g. via 100 wins / season-pass top-10) can pick
              freely from the curated list and the system never auto-changes it.
            </div>
            <div style={{ padding: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Auto flair (mock derivation): </span>
              <strong style={{ color: 'var(--accent, #f59e0b)' }}>✦ {autoFlairValue}</strong>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8, opacity: proPreview ? 1 : 0.5 }}>
              <input type="checkbox" disabled={!proPreview} checked={flairUnlocked} onChange={e => setFlairUnlocked(e.target.checked)} />
              Flair override <strong>unlocked</strong> {proLabel}
            </label>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-muted)' }}>
              Override (pick any once unlocked):
            </label>
            <select
              value={flairOverride}
              onChange={e => setFlairOverride(e.target.value)}
              disabled={!proPreview || !flairUnlocked}
              style={{ ...inputStyle, opacity: (proPreview && flairUnlocked) ? 1 : 0.5 }}
            >
              <option value="">(use auto)</option>
              {PAID_FLAIRS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
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
                  {proLabel}
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10, opacity: proPreview ? 1 : 0.5 }}>
              <input type="checkbox" disabled={!proPreview} checked={frameAnimated} onChange={e => setFrameAnimated(e.target.checked)} />
              Animated frame (subtle shimmer pulse) {proLabel}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 6, opacity: proPreview ? 1 : 0.5 }}>
              <input type="checkbox" disabled={!proPreview} checked={bgPattern} onChange={e => setBgPattern(e.target.checked)} />
              Heraldic diagonal background pattern {proLabel}
            </label>
          </section>

          {/* v6.63 / Task #207 — Founders Pass ring + Cover FX sandbox. */}
          <section style={{ padding: 12, border: '1px dashed var(--border)', borderRadius: 8, background: 'rgba(245,158,11,0.04)' }}>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Founders Pass + Cover FX (Magazine v3 only)</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              These layer onto the live <code>MagazineCover</code> on <code>/players/:id</code>.
              Task #219 — the cover preview at the top of this page now reflects every
              toggle in real time. Animations respect <em>prefers-reduced-motion</em>.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
              <input type="checkbox" checked={foundersRing} onChange={e => setFoundersRing(e.target.checked)} />
              Simulate Founders Pass ring around the cover
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COVER_FX_IDS.map(id => {
                const meta = COVER_FX_META[id] || { label: id, sub: '' };
                const on = coverFx.includes(id);
                const locked = !proPreview;
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
                      setCoverFx(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                    }}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      cursor: locked ? 'not-allowed' : 'pointer',
                      opacity: locked ? 0.5 : 1,
                      background: on ? 'rgba(168,85,247,0.18)' : 'rgba(168,85,247,0.05)',
                      border: on ? '2px solid #a855f7' : '1px dashed rgba(168,85,247,0.5)',
                      color: '#a855f7',
                    }}
                  >{meta.label} ★</button>
                );
              })}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              Active FX: {coverFx.length === 0 ? '(none)' : coverFx.join(', ')} · Founders ring: {foundersRing ? 'on' : 'off'}
            </div>
          </section>

          <section>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Inhouse voice pack</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
              Sandbox copy of the production picker in /settings/profile. ▶ Preview
              plays each pack's <code>match-start.mp3</code> so you can audition the
              new Pro voice packs (Task #206) without saving anything.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setSelectedVoicePack('')}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: !selectedVoicePack ? 'rgba(245,158,11,0.18)' : 'var(--bg-card)',
                  border: !selectedVoicePack ? '2px solid var(--accent, #f59e0b)' : '1px solid var(--border)',
                  color: !selectedVoicePack ? 'var(--accent, #f59e0b)' : 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >Default bell</button>
              {ALL_VOICE_PACKS.map(p => {
                const m = VOICE_PACK_META[p] || { label: p, sub: '' };
                const sel = selectedVoicePack === p;
                const locked = isPremiumVoicePack(p) && !proPreview;
                return (
                  <div key={p} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={locked ? undefined : () => setSelectedVoicePack(p)}
                      title={locked ? 'Toggle Pro preview to enable' : m.sub}
                      style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        background: sel ? 'rgba(168,85,247,0.18)' : 'rgba(168,85,247,0.05)',
                        border: sel ? '2px solid #a855f7' : '1px dashed rgba(168,85,247,0.5)',
                        color: '#a855f7', cursor: locked ? 'not-allowed' : 'pointer',
                        opacity: locked ? 0.5 : 1,
                      }}
                    >{m.label} ★</button>
                    <button
                      type="button"
                      aria-label={`Preview ${m.label} voice pack`}
                      onClick={() => {
                        try {
                          const key = `${p}|match-start`;
                          let el = voicePreviewElsRef.current.get(key);
                          if (!el) {
                            el = new Audio(`/voice-packs/${encodeURIComponent(p)}/match-start.mp3`);
                            el.preload = 'auto'; el.volume = 0.85;
                            voicePreviewElsRef.current.set(key, el);
                          }
                          el.currentTime = 0;
                          const pr = el.play();
                          if (pr && typeof pr.then === 'function') pr.catch(() => {});
                        } catch (_) { /* ignore */ }
                      }}
                      style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 6,
                        background: 'transparent', border: '1px solid var(--border)',
                        color: 'var(--text-muted)', cursor: 'pointer',
                      }}
                    >▶ Preview</button>
                  </div>
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

            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4, opacity: proPreview ? 1 : 0.5 }}>
                Hero icon border colour {proLabel}
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {HERO_BORDER_COLORS.map(c => (
                  <button key={c.value || 'none'} type="button"
                    disabled={!proPreview}
                    onClick={() => proPreview && setPinnedHeroBorder(c.value)}
                    title={c.label}
                    style={{
                      width: 30, height: 30, borderRadius: 6,
                      background: c.value || 'transparent',
                      border: pinnedHeroBorder === c.value
                        ? '3px solid #fff'
                        : (c.value ? '1px solid var(--border)' : '1px dashed var(--text-muted)'),
                      cursor: proPreview ? 'pointer' : 'not-allowed',
                      opacity: proPreview ? 1 : 0.4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, color: c.value ? 'transparent' : 'var(--text-muted)',
                    }}>
                    {!c.value ? '✕' : ''}
                  </button>
                ))}
              </div>
            </div>

            <button className="btn btn-sm" type="button" style={{ marginTop: 12 }}
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
                  #{m.match_id} — {getHeroName(m.hero_id)} {m.win ? 'W' : 'L'} {m.kills}/{m.deaths}/{m.assists} ({m.radiantScore}-{m.direScore})
                </option>
              ))}
            </select>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
              Pinned match preview now shows result, score, your hero, KDA and duration — not just the match number.
            </div>
          </section>

          <section>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Pinned achievement {proLabel}</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              In production, only <em>earned</em> achievements appear here. Sandbox unlocks all of them for preview.
            </div>
            <select value={pinnedAchievementId} onChange={e => setPinnedAchievementId(e.target.value)} disabled={!proPreview} style={{ ...inputStyle, opacity: proPreview ? 1 : 0.5 }}>
              <option value="">(none)</option>
              {SAMPLE_ACHIEVEMENTS.map(a => (
                <option key={a.id} value={a.id}>{a.emoji} {a.label}</option>
              ))}
            </select>
          </section>

          <section>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Auto strips</h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
              <input type="checkbox" checked={showTopHeroes} onChange={e => setShowTopHeroes(e.target.checked)} />
              Show "Most-played heroes" auto-row (top 3 by games)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={showStreak} onChange={e => setShowStreak(e.target.checked)} />
              Show win/loss streak chip (only renders when streak ≥ 3)
            </label>
          </section>

          <section>
            <h2 style={{ marginBottom: 8, fontSize: 16 }}>Linked socials</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              URLs render as small chips on the public profile. URLs are validated server-side in production.
            </div>
            <input type="text" value={socialTwitch} placeholder="Twitch URL" onChange={e => setSocialTwitch(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
            <input type="text" value={socialYoutube} placeholder="YouTube URL" onChange={e => setSocialYoutube(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
            <input type="text" value={socialSteam} placeholder="Steam profile URL" onChange={e => setSocialSteam(e.target.value)} style={inputStyle} />
          </section>
        </div>
      </div>
    </div>
  );
}
