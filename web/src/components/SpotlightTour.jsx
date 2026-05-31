import React, {
  createContext, useContext, useState, useEffect, useRef,
  useCallback, useMemo, useLayoutEffect,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSteamAuth } from '../context/SteamAuthContext';
import { hasSeenIntro, markIntroSeen } from '../config/tutorial';
import '../styles/tutorial.css';

// Task #656 — interactive spotlight tour.
//
// Highlights real navbar/UI elements with next/back/skip tooltips. Fully
// keyboard-operable (←/→ to move, Esc to close, Tab trapped inside the
// tooltip) and screen-reader friendly (the tooltip is a labelled, polite
// live region that grabs focus on every step). Deliberately uses
// role="region" (NOT a modal role): the shared <Dialog> primitive centres a
// backdrop modal, which can't anchor to an arbitrary on-screen element, and
// the a11y gate reserves the modal role for Dialog.jsx.

const TourContext = createContext({ startTour: () => {} });
export const useTour = () => useContext(TourContext);

const TOOLTIP_W = 340;
const GAP = 14;

// Steps reference elements via [data-tour="..."] anchors added in App.jsx.
// A null target renders a centred, anchor-less card (the welcome step). Steps
// whose anchor isn't in the DOM right now are skipped gracefully.
function buildSteps({ signedIn }) {
  return [
    {
      key: 'welcome',
      target: null,
      title: signedIn ? 'Welcome back — here\u2019s the lay of the land' : 'Welcome to OCE Inhouse',
      body: signedIn
        ? 'A 30-second tour of the bits you\u2019ll use most — your account menu, ladder, inhouse lobbies and where to learn more.'
        : 'OCE Inhouse is a community-run Dota 2 league: sign in, get drafted into balanced lobbies, and climb a TrueSkill ladder. Let\u2019s take a quick tour.',
    },
    {
      key: 'account',
      target: '[data-tour="account"]',
      title: signedIn ? 'Your account lives here' : 'Sign in with Steam',
      body: signedIn
        ? 'Open this menu for your profile, settings, billing and sign-out. Steam keeps you logged in for the session.'
        : 'One click signs you in through Valve \u2014 we never see your password. This links your Dota account so your matches and rating track automatically.',
    },
    {
      key: 'leaderboard',
      target: '[data-tour="nav-leaderboard"]',
      title: 'Climb the ladder',
      body: 'Every inhouse adjusts your TrueSkill rating across 8 tiers. The leaderboard is the live standings for the active season.',
    },
    {
      key: 'inhouse',
      target: '[data-tour="nav-play"]',
      title: 'Play an inhouse',
      body: 'The Play menu is your way into FACEIT-style inhouse lobbies, tournaments and leagues. Register a role, accept the pop, captains draft \u2014 a dedicated OCE server spins up on the 10th pick.',
    },
    {
      key: 'guide',
      target: '[data-tour="nav-guide"]',
      title: 'Want the full rundown?',
      body: 'The Help menu has the complete How-It-Works guide (with a walkthrough video) and lets you replay this tour any time.',
    },
  ];
}

function computeTooltipStyle(rect) {
  if (!rect) {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: TOOLTIP_W,
      maxWidth: 'calc(100vw - 32px)',
    };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const below = rect.top + rect.height + GAP;
  const placeBelow = below + 180 < vh || rect.top < 200;
  let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
  left = Math.max(12, Math.min(left, vw - TOOLTIP_W - 12));
  const style = {
    position: 'fixed',
    left,
    width: TOOLTIP_W,
    maxWidth: 'calc(100vw - 24px)',
  };
  if (placeBelow) style.top = Math.min(below, vh - 40);
  else style.bottom = Math.max(GAP, vh - rect.top + GAP);
  return style;
}

function SpotlightTour({ steps, onClose, onFinish }) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const tooltipRef = useRef(null);
  const headingRef = useRef(null);

  const step = steps[idx];
  const isLast = idx === steps.length - 1;

  const next = useCallback(() => {
    setIdx(i => (i >= steps.length - 1 ? i : i + 1));
  }, [steps.length]);
  const back = useCallback(() => {
    setIdx(i => (i <= 0 ? 0 : i - 1));
  }, []);

  // Measure the current anchor (and keep it pinned on scroll/resize).
  useLayoutEffect(() => {
    let raf = 0;
    const measure = () => {
      if (!step || !step.target) { setRect(null); return; }
      const el = document.querySelector(step.target);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { setRect(null); return; }
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    // Bring the anchor into view first, then measure on the next frame.
    if (step && step.target) {
      const el = document.querySelector(step.target);
      if (el && el.scrollIntoView) {
        try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); } catch { /* ignore */ }
      }
    }
    raf = requestAnimationFrame(measure);
    const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [idx, step]);

  // Focus the heading on each step so screen readers announce it and keyboard
  // users land inside the trapped tooltip.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (headingRef.current) { try { headingRef.current.focus(); } catch { /* ignore */ } }
    }, 80);
    return () => window.clearTimeout(t);
  }, [idx]);

  // Keyboard: arrows move, Escape closes, Tab is trapped inside the tooltip.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); isLast ? onFinish() : next(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); back(); return; }
      if (e.key === 'Tab') {
        const node = tooltipRef.current;
        if (!node) return;
        const f = node.querySelectorAll('button:not([disabled]), a[href]');
        if (f.length === 0) { e.preventDefault(); return; }
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !node.contains(active))) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (active === last || !node.contains(active))) {
          e.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isLast, next, back, onClose, onFinish]);

  if (!step) return null;

  const tooltipStyle = computeTooltipStyle(rect);

  return (
    <div className="oi-tour-root">
      {/* Click-blocker + dimmer. When an anchor is measured, the dim comes from
          the highlight box's huge box-shadow so the anchor stays bright. */}
      <div
        className="oi-tour-blocker"
        aria-hidden="true"
        style={rect ? { background: 'transparent' } : undefined}
      />
      {rect && (
        <div
          className="oi-tour-highlight"
          aria-hidden="true"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <div
        ref={tooltipRef}
        className="oi-tour-tooltip"
        role="region"
        aria-label={`Site tour, step ${idx + 1} of ${steps.length}`}
        aria-live="polite"
        style={tooltipStyle}
      >
        <button
          type="button"
          className="oi-tour-close"
          onClick={onClose}
          aria-label="Close tour"
        >
          &times;
        </button>
        <div className="oi-tour-step-count pb-num">
          Step {idx + 1} of {steps.length}
        </div>
        <h2
          className="oi-tour-title pb-serif"
          ref={headingRef}
          tabIndex={-1}
        >
          {step.title}
        </h2>
        <p className="oi-tour-body">{step.body}</p>
        <div className="oi-tour-dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.key} className={`oi-tour-dot${i === idx ? ' is-active' : ''}`} />
          ))}
        </div>
        <div className="oi-tour-actions">
          <button
            type="button"
            className="oi-tour-skip"
            onClick={onClose}
          >
            {isLast ? 'Close' : 'Skip tour'}
          </button>
          <div className="oi-tour-nav">
            <button
              type="button"
              className="btn btn-small"
              onClick={back}
              disabled={idx === 0}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-small btn-primary oi-tour-next"
              onClick={() => (isLast ? onFinish() : next())}
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Guest-only auto-offer. Signed-in newcomers are covered by the existing
// OnboardingWizard/OnboardingNudge, so this only fires for logged-out
// visitors and only once per browser (hasSeenIntro/markIntroSeen). Marking
// "seen" the moment it shows guarantees the auto-offer never re-nags.
function GuestTourNudge({ onStart }) {
  const { steamUser, loading } = useSteamAuth() || {};
  const location = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (loading) return undefined;
    if (steamUser && steamUser.accountId) return undefined;
    if (hasSeenIntro()) return undefined;
    if (/^\/(overlay|admin)/.test(location.pathname)) return undefined;
    const t = window.setTimeout(() => {
      markIntroSeen();
      setShow(true);
    }, 1400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, steamUser && steamUser.accountId]);

  if (!show) return null;
  if (steamUser && steamUser.accountId) return null;

  const dismiss = () => setShow(false);
  const start = () => { setShow(false); onStart(); };

  return (
    <div className="oi-tour-nudge" role="region" aria-label="New visitor tour">
      <span aria-hidden="true" className="oi-tour-nudge-icon">{'\u{1F44B}'}</span>
      <div className="oi-tour-nudge-text">
        <strong>New here?</strong> Take a 30-second tour of OCE Inhouse.
      </div>
      <button type="button" className="btn btn-small btn-primary" onClick={start}>
        Take the tour
      </button>
      <Link to="/how-it-works" className="btn btn-small" onClick={dismiss}>
        Watch the guide
      </Link>
      <button
        type="button"
        className="oi-tour-nudge-close"
        onClick={dismiss}
        aria-label="Dismiss tour offer"
      >
        &times;
      </button>
    </div>
  );
}

export function TourProvider({ children }) {
  const { steamUser, setOnboardingComplete } = useSteamAuth() || {};
  const [active, setActive] = useState(false);
  const signedIn = !!(steamUser && steamUser.accountId);
  const steps = useMemo(() => buildSteps({ signedIn }), [signedIn]);

  const startTour = useCallback(() => {
    markIntroSeen();
    setActive(true);
  }, []);

  // Skip/close: remember it was offered; don't touch server onboarding so the
  // signed-in wizard's own state stays authoritative.
  const close = useCallback(() => {
    setActive(false);
    markIntroSeen();
  }, []);

  // Finish: remember it locally and, for signed-in users, persist completion
  // server-side so it follows them across devices and the wizard won't re-nag.
  const finish = useCallback(() => {
    setActive(false);
    markIntroSeen();
    if (signedIn) {
      fetch('/api/me/onboarding/complete', { method: 'POST', credentials: 'include' })
        .then(() => { if (setOnboardingComplete) setOnboardingComplete(true); })
        .catch(() => {});
    }
  }, [signedIn, setOnboardingComplete]);

  const value = useMemo(() => ({ startTour }), [startTour]);

  return (
    <TourContext.Provider value={value}>
      {children}
      <GuestTourNudge onStart={startTour} />
      {active && <SpotlightTour steps={steps} onClose={close} onFinish={finish} />}
    </TourContext.Provider>
  );
}

export default TourProvider;
