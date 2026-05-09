import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getHeroImageUrl, getHeroName } from '../heroNames';
import './MagazineCover.css';

const POS_LABEL = ['', 'Carry', 'Mid', 'Off', 'Soft Sup', 'Hard Sup'];

function buildSparkPath(values, w = 100, h = 22) {
  const arr = (values || []).filter(v => Number.isFinite(v));
  if (arr.length < 2) return null;
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const span = max - min || 1;
  const step = w / (arr.length - 1);
  let d = '';
  arr.forEach((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    d += (i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : ` L${x.toFixed(1)},${y.toFixed(1)}`);
  });
  return d;
}

// Task #205 — Live presence chip rendered on the v3 cover. Pure presentation;
// the parent polls /api/players/:id/presence and passes the latest payload in.
const PRESENCE_LABELS = {
  in_game: { label: 'In game', color: '#f59e0b', bg: 'rgba(245,158,11,0.18)', dot: '#f59e0b' },
  in_lobby: { label: 'In lobby', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', dot: '#fbbf24' },
  in_queue: { label: 'In queue', color: '#a78bfa', bg: 'rgba(167,139,250,0.18)', dot: '#a78bfa' },
  in_voice: { label: 'In voice', color: '#34d399', bg: 'rgba(52,211,153,0.18)', dot: '#34d399' },
  online:   { label: 'Online',   color: '#9ca3af', bg: 'rgba(156,163,175,0.18)', dot: '#9ca3af' },
};
function PresenceChip({ presence }) {
  const cfg = PRESENCE_LABELS[presence?.status];
  if (!cfg) return null;
  let label = cfg.label;
  if (presence.status === 'in_game' && presence.hero) label = `In game · ${presence.hero}`;
  return (
    <span
      className="v3-flair-pill v3-presence-pill"
      title={presence.updated_at ? `Updated ${new Date(presence.updated_at).toLocaleTimeString()}` : label}
      aria-label={`Live status: ${label}`}
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}55`, display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <span aria-hidden="true" style={{
        width: 8, height: 8, borderRadius: '50%', background: cfg.dot,
        boxShadow: `0 0 6px ${cfg.dot}`, display: 'inline-block',
        animation: presence.status === 'in_game' || presence.status === 'in_lobby' ? 'v3-presence-pulse 1.6s ease-in-out infinite' : 'none',
      }} />
      {label}
    </span>
  );
}

function Sparkline({ values, label }) {
  const path = useMemo(() => buildSparkPath(values), [values]);
  if (!path) return <div className="v3-vital-spark-empty" />;
  return (
    <svg className="v3-vital-spark" viewBox="0 0 100 22" preserveAspectRatio="none" aria-label={label || 'trend'}>
      <path d={path} />
    </svg>
  );
}

function Vital({ label, value, suffix, sub, spark, sparkLabel }) {
  return (
    <div className="v3-vital">
      <div className="v3-vital-lbl">{label}</div>
      <div className="v3-vital-val">
        {value}
        {suffix && <span className="v3-vital-suffix">{suffix}</span>}
      </div>
      {sub && <div className="v3-vital-sub">{sub}</div>}
      {spark && spark.length >= 2 && <Sparkline values={spark} label={sparkLabel} />}
    </div>
  );
}

function fmtNumber(n, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(digits);
}

export default function MagazineCover({
  accountId,
  displayName,
  customTitle,
  bio,
  pinnedHero,
  topHero,
  rating,
  averages,
  recentMatches,
  ratingHistory,
  winRateHistory,
  positions,
  streak,
  impactScore,
  themeAccent,
  socials,
  flair,
  nameAdornments,
  presence,
}) {
  // Sticky header visibility — driven by IntersectionObserver on the cover.
  const coverRef = useRef(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = coverRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => setStuck(!entries[0].isIntersecting),
      { threshold: 0, rootMargin: '-80px 0px 0px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Backdrop hero — pinned hero takes priority, then top played hero.
  const heroId = pinnedHero?.hero_id || topHero?.hero_id || topHero?.heroId || null;
  const heroName = heroId ? (pinnedHero?.name || getHeroName(heroId)) : null;
  const bgUrl = heroId ? getHeroImageUrl(heroId) : null;
  const primaryPos = positions && positions[0]?.position ? POS_LABEL[positions[0].position] : null;
  const wins = parseInt(rating?.wins || 0);
  const losses = parseInt(rating?.losses || 0);
  const totalGames = wins + losses;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : null;

  // Recent KDA from last 10 matches.
  const recent10 = (recentMatches || []).slice(0, 10);
  const recentWins = recent10.filter(m => m.won === 1 || m.won === true).length;
  const recentKDA = (() => {
    if (!recent10.length) return null;
    let k = 0, d = 0, a = 0;
    recent10.forEach(m => { k += parseInt(m.kills || 0); d += parseInt(m.deaths || 0); a += parseInt(m.assists || 0); });
    return ((k + a) / Math.max(d, 1));
  })();

  // Sparkline series from real data.
  const mmrSpark = useMemo(
    () => (ratingHistory || []).slice(-30).map(r => Number(r.mmr ?? r.new_mmr ?? r.rating)).filter(Number.isFinite),
    [ratingHistory]
  );
  const wrSpark = useMemo(
    () => (winRateHistory || []).slice(-30).map(r => Number(r.win_rate)).filter(Number.isFinite),
    [winRateHistory]
  );
  const kdaSpark = useMemo(() => {
    const arr = (recentMatches || []).slice(0, 30).reverse();
    return arr.map(m => {
      const dd = parseInt(m.deaths || 0);
      return (parseInt(m.kills || 0) + parseInt(m.assists || 0)) / Math.max(dd, 1);
    });
  }, [recentMatches]);

  const accent = themeAccent || null;
  const titleStyle = accent ? { color: accent } : undefined;

  return (
    <>
      {/* Sticky mini-header that slides in once the cover scrolls off-screen.
          Only mount the focusable CTA when actually visible so a tabbing
          keyboard user never lands on hidden off-screen content (architect
          review on Task #195). The shell stays mounted so the slide-in CSS
          transition still fires; the interactive link is conditional. */}
      <div
        className={`v3-sticky${stuck ? ' is-visible' : ''}`}
        aria-hidden={!stuck}
        {...(!stuck ? { inert: '' } : {})}
      >
        {bgUrl && <img className="v3-sticky-portrait" src={bgUrl} alt="" />}
        <span className="v3-sticky-name">{displayName}</span>
        {rating?.mmr != null && (
          <span className="v3-sticky-vital">MMR <b>{rating.mmr}</b></span>
        )}
        {winRate != null && (
          <span className="v3-sticky-vital">WR <b>{winRate}%</b></span>
        )}
        <span className="v3-sticky-spacer" />
        {stuck && <Link to="/players" className="v3-sticky-cta">All players</Link>}
      </div>

      <div ref={coverRef} className="v3-cover" data-account-id={accountId}>
        {bgUrl && (
          <img className="v3-cover-bg" src={bgUrl} alt={heroName ? `${heroName} backdrop` : ''} />
        )}
        <div className="v3-cover-overlay" />
        <div className="v3-cover-inner">
          <div className="v3-cover-eyebrow">
            <span>Player Profile</span>
            {heroName && (<><span className="v3-dot">·</span><span>Signature: {heroName}</span></>)}
            {primaryPos && (<><span className="v3-dot">·</span><span>{primaryPos}</span></>)}
          </div>

          <h1 className="v3-cover-name">
            <span>{displayName}</span>
            {nameAdornments}
          </h1>

          {customTitle && (
            <div className="v3-cover-title" style={titleStyle}>{customTitle}</div>
          )}

          <div className="v3-cover-flair">
            {primaryPos && <span className="v3-pos-pill">{primaryPos}</span>}
            {presence && presence.status && presence.status !== 'offline' && (
              <PresenceChip presence={presence} />
            )}
            {flair && <span className="v3-flair-pill" style={accent ? { background: `${accent}33`, color: accent, border: `1px solid ${accent}55` } : undefined}>{flair}</span>}
            {streak != null && Math.abs(streak) >= 3 && (
              <span className="v3-flair-pill" style={{
                background: streak > 0 ? 'rgba(245,158,11,0.18)' : 'rgba(248,113,113,0.18)',
                color: streak > 0 ? '#f59e0b' : '#f87171',
                border: `1px solid ${streak > 0 ? '#f59e0b66' : '#f8717166'}`,
              }}>
                {streak > 0 ? `🔥 ${streak}W streak` : `❄️ ${Math.abs(streak)}L slump`}
              </span>
            )}
          </div>

          {bio && <div className="v3-cover-bio">{bio}</div>}

          <div className="v3-cover-vitals">
            <Vital
              label="MMR"
              value={rating?.mmr != null ? rating.mmr : '—'}
              sub={totalGames > 0 ? `${wins}W ${losses}L` : null}
              spark={mmrSpark}
              sparkLabel="MMR trend"
            />
            <div className="v3-vital-sep" />
            <Vital
              label="Win rate"
              value={winRate != null ? winRate : '—'}
              suffix={winRate != null ? '%' : null}
              sub={totalGames > 0 ? `${totalGames} games` : null}
              spark={wrSpark}
              sparkLabel="Win-rate trend"
            />
            <div className="v3-vital-sep" />
            <Vital
              label="KDA (recent)"
              value={recentKDA != null ? fmtNumber(recentKDA, 2) : '—'}
              sub={recent10.length ? `${recentWins}W ${recent10.length - recentWins}L · last ${recent10.length}` : null}
              spark={kdaSpark}
              sparkLabel="KDA trend"
            />
            {(averages?.avg_gpm || averages?.avg_xpm) && (
              <>
                <div className="v3-vital-sep" />
                <Vital
                  label="GPM / XPM"
                  value={`${fmtNumber(averages.avg_gpm)} / ${fmtNumber(averages.avg_xpm)}`}
                  sub="per minute avg"
                />
              </>
            )}
            {impactScore != null && Number.isFinite(Number(impactScore)) && (
              <>
                <div className="v3-vital-sep" />
                <Vital
                  label="Impact"
                  value={fmtNumber(impactScore, 1)}
                  sub="position-neutral"
                />
              </>
            )}
          </div>

          {(socials?.twitch || socials?.youtube || socials?.steam) && (
            <div className="v3-cover-socials">
              {socials.twitch && (
                <a className="v3-flair-pill" href={socials.twitch} target="_blank" rel="noopener noreferrer">Twitch</a>
              )}
              {socials.youtube && (
                <a className="v3-flair-pill" href={socials.youtube} target="_blank" rel="noopener noreferrer">YouTube</a>
              )}
              {socials.steam && (
                <a className="v3-flair-pill" href={socials.steam} target="_blank" rel="noopener noreferrer">Steam</a>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
