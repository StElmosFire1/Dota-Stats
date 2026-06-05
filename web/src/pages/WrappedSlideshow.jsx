import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getSeasonWrappedCards,
  getMyLatestWrapped,
} from '../api';
import useRovingTabs from '../hooks/useRovingTabs';

// Task #443 — Personal Season Wrapped slideshow. Spotify-Wrapped style
// 8–10 card retrospective for one (player, season) pair. Used in three
// shapes via the App.jsx routes:
//   /wrapped/me/latest           → resolveLatest prop, redirect into the
//                                   viewer's most recent archived season.
//   /wrapped/:seasonId/:accountId → fully-qualified.
//   /wrapped/:accountId          → no season → server picks the most
//                                   recently archived season.
//
// A11y: arrow-key + on-screen prev/next buttons (real <button>s with
// aria-labels), `role="region"` + `aria-roledescription="carousel"` on
// the slide stage, `aria-live="polite"` so screen readers announce the
// new card on each step.

const ACCENT_MAP = {
  amber: 'var(--amber, #f59e0b)',
  brass: 'var(--brass, #c5a975)',
};

function SlideCard({ card, index, total }) {
  const accent = ACCENT_MAP[card.accent] || 'var(--accent, #c5a975)';
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={`Card ${index + 1} of ${total}: ${card.title}`}
      style={{
        position: 'relative',
        background: 'linear-gradient(140deg, rgba(13,20,36,0.95) 0%, rgba(26,36,64,0.95) 100%)',
        border: `1px solid ${accent}`,
        borderRadius: 18,
        padding: '48px 40px',
        minHeight: 360,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(circle at 90% 10%, ${accent}22 0%, transparent 60%)`,
      }} />
      <div style={{
        textTransform: 'uppercase', letterSpacing: '0.18em',
        fontSize: 13, fontWeight: 700, color: accent, marginBottom: 18,
      }}>
        {card.title}
      </div>
      <div style={{
        fontFamily: 'var(--font-serif, "Playfair Display", Georgia, serif)',
        fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 800,
        color: 'var(--parchment, #f5efe2)', lineHeight: 1.05, marginBottom: 16,
      }}>
        {card.headline}
      </div>
      {card.sub && (
        <div style={{
          fontSize: 'clamp(15px, 1.5vw, 19px)',
          color: 'rgba(245,239,226,0.78)', lineHeight: 1.45,
        }}>
          {card.sub}
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 18, right: 24,
        fontSize: 12, color: 'rgba(245,239,226,0.4)', letterSpacing: '0.1em',
      }}>
        {index + 1} / {total}
      </div>
    </div>
  );
}

function DotNav({ count, index, onPick }) {
  const tabs = Array.from({ length: count }, (_, i) => ({ id: i }));
  const { setRef: setTabRef, onKeyDown: onTabKeyDown } = useRovingTabs(tabs, (_, idx) => onPick(idx));
  return (
    <div role="tablist" aria-label="Wrapped cards" style={{
      display: 'flex', gap: 6, justifyContent: 'center', marginTop: 18,
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          ref={setTabRef(i)}
          aria-selected={i === index}
          tabIndex={i === index ? 0 : -1}
          aria-label={`Go to card ${i + 1}`}
          onClick={() => onPick(i)}
          onKeyDown={(e) => onTabKeyDown(e, i)}
          style={{
            width: i === index ? 28 : 10,
            height: 10,
            border: 'none',
            borderRadius: 5,
            background: i === index ? 'var(--amber, #f59e0b)' : 'rgba(245,239,226,0.3)',
            cursor: 'pointer',
            transition: 'width 200ms ease, background 200ms ease',
            padding: 0,
          }}
        />
      ))}
    </div>
  );
}

export default function WrappedSlideshow({ resolveLatest = false }) {
  const params = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const stageRef = useRef(null);

  // Resolve the viewer's latest wrapped, then bounce to the canonical URL.
  useEffect(() => {
    if (!resolveLatest) return;
    let alive = true;
    (async () => {
      try {
        const r = await getMyLatestWrapped();
        if (!alive) return;
        if (r && r.seasonId && r.accountId) {
          navigate(`/wrapped/${r.seasonId}/${r.accountId}`, { replace: true });
        } else {
          setErr('no_season');
          setLoading(false);
        }
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || 'failed');
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [resolveLatest, navigate]);

  // Load wrapped cards for the explicit route shape.
  useEffect(() => {
    if (resolveLatest) return;
    const { accountId, seasonId } = params;
    if (!accountId) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    getSeasonWrappedCards(accountId, seasonId || null)
      .then((r) => { if (alive) { setData(r); setIdx(0); setLoading(false); } })
      .catch((e) => { if (alive) { setErr(e?.message || 'failed'); setLoading(false); } });
    return () => { alive = false; };
  }, [resolveLatest, params.accountId, params.seasonId]);

  const total = data?.cards?.length || 0;
  const next = useCallback(() => setIdx((i) => Math.min(total - 1, i + 1)), [total]);
  const prev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  // Keyboard navigation — arrows step through, Home/End jump to edges.
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      // The DotNav tablist handles its own arrow/Home/End keys via the shared
      // roving-tabindex hook — don't double-step when a dot has focus.
      if (e.target.getAttribute && e.target.getAttribute('role') === 'tab') return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'Home') { e.preventDefault(); setIdx(0); }
      else if (e.key === 'End') { e.preventDefault(); setIdx(Math.max(0, total - 1)); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, total]);

  if (loading) {
    return (
      <div style={{ padding: 40, color: 'var(--parchment, #f5efe2)' }}>
        <p>Loading your season wrapped…</p>
      </div>
    );
  }
  if (err === 'no_season' || (data && !data.cards?.length)) {
    return (
      <div style={{ padding: 40, color: 'var(--parchment, #f5efe2)', maxWidth: 640 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', color: 'var(--amber)' }}>
          No wrapped yet
        </h1>
        <p>You haven't played enough matches in an archived season to generate a wrapped.</p>
        <p><Link to="/seasons" style={{ color: 'var(--amber)' }}>Browse past seasons →</Link></p>
      </div>
    );
  }
  if (err) {
    return (
      <div style={{ padding: 40, color: 'var(--parchment, #f5efe2)' }}>
        <h1 style={{ color: 'var(--amber)' }}>Couldn't load your wrapped</h1>
        <p>Something went wrong — please try again.</p>
        <p><Link to="/" style={{ color: 'var(--amber)' }}>← Back to home</Link></p>
      </div>
    );
  }
  if (!data || !data.cards) return null;

  const card = data.cards[idx];
  const shareUrl = data.season && data.player
    ? `${window.location.origin}/wrapped/${data.season.id}/${data.player.account_id}`
    : null;

  return (
    <div style={{
      maxWidth: 920, margin: '0 auto', padding: '32px 20px 64px',
      color: 'var(--parchment, #f5efe2)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 18, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <div style={{
            fontSize: 12, letterSpacing: '0.2em', color: 'var(--brass, #c5a975)',
            textTransform: 'uppercase', fontWeight: 700,
          }}>
            Season Wrapped
          </div>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 32,
            color: 'var(--parchment)', margin: '4px 0 0',
          }}>
            {data.player?.display_name}
          </h1>
          <div style={{ color: 'rgba(245,239,226,0.65)', fontSize: 14 }}>
            {data.season?.name}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            to={`/player/${data.player?.account_id}`}
            className="btn btn-small"
            style={{ background: 'transparent', borderColor: 'var(--brass)', color: 'var(--brass)' }}
          >
            View profile
          </Link>
          {shareUrl && (
            <button
              type="button"
              className="btn btn-small"
              aria-label="Copy share link"
              onClick={async () => {
                try { await navigator.clipboard.writeText(shareUrl); } catch (_) {}
              }}
              style={{ background: 'var(--amber)', borderColor: 'var(--amber)', color: 'var(--ink-navy, #0d1424)' }}
            >
              🔗 Share
            </button>
          )}
        </div>
      </div>

      <div
        ref={stageRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="Season wrapped cards"
        aria-live="polite"
        style={{ position: 'relative' }}
      >
        <SlideCard card={card} index={idx} total={total} />
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginTop: 18, gap: 12,
        }}>
          <button
            type="button"
            aria-label="Previous card"
            disabled={idx === 0}
            onClick={prev}
            className="btn btn-small"
            style={{
              opacity: idx === 0 ? 0.4 : 1,
              cursor: idx === 0 ? 'not-allowed' : 'pointer',
              minWidth: 110,
            }}
          >
            ← Previous
          </button>
          <DotNav count={total} index={idx} onPick={setIdx} />
          <button
            type="button"
            aria-label={idx === total - 1 ? 'Restart' : 'Next card'}
            onClick={idx === total - 1 ? () => setIdx(0) : next}
            className="btn btn-small"
            style={{
              background: 'var(--amber, #f59e0b)',
              borderColor: 'var(--amber, #f59e0b)',
              color: 'var(--ink-navy, #0d1424)',
              minWidth: 110,
              fontWeight: 700,
            }}
          >
            {idx === total - 1 ? '↻ Restart' : 'Next →'}
          </button>
        </div>
      </div>

      <p style={{
        marginTop: 32, fontSize: 12, color: 'rgba(245,239,226,0.45)',
        textAlign: 'center',
      }}>
        Tip — use ← / → on your keyboard to step through, Home / End to jump to the ends.
      </p>
    </div>
  );
}
