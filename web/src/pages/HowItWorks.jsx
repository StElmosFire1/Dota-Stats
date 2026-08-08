import React from 'react';
import { Link } from 'react-router-dom';
import { useSteamAuth } from '../context/SteamAuthContext';
import { useTour } from '../components/SpotlightTour';
import { TUTORIAL_VIDEO_URL, toEmbedUrl, isFileVideo } from '../config/tutorial';
import '../styles/tutorial.css';

// Task #656 — public "How it works" guide. Explains the core flow end to end
// (what OCE Inhouse is -> Steam sign-in -> inhouse lobby -> MMR/stats ->
// coaching), embeds a walkthrough video driven by TUTORIAL_VIDEO_URL (the
// whole video section is hidden when unset), and offers the interactive tour.

const STEPS = [
  {
    n: '01',
    title: 'What OCE Inhouse is',
    body: (
      <>A community-run Dota 2 league for the Oceanic region. Instead of public
      matchmaking, you queue into balanced 5v5 inhouse lobbies, get drafted by
      captains, and play on auto-provisioned OCE dedicated servers for low ping.</>
    ),
  },
  {
    n: '02',
    title: 'Sign in with Steam',
    body: (
      <>One click signs you in through Valve &mdash; we never see your password.
      This links your Dota account so your matches, hero stats and rating are
      recorded automatically. Look for <strong>Sign in with Steam</strong> in the
      top-right of every page.</>
    ),
  },
  {
    n: '03',
    title: 'Join an inhouse lobby',
    body: (
      <>Head to the <Link to="/inhouse">Inhouse</Link> page, register the role you
      want to play, and accept when the lobby pops. Two captains draft the ten
      players into teams, and a dedicated server is provisioned automatically on
      the 10th pick &mdash; no host-shopping required.</>
    ),
  },
  {
    n: '04',
    title: 'Climb the MMR ladder & track your stats',
    body: (
      <>Every game adjusts your TrueSkill rating across an 8-tier ladder. Your
      replays are parsed for a position-aware performance score, and the{' '}
      <Link to="/leaderboard">leaderboard</Link>, hero meta, and your{' '}
      personal profile update after each match.</>
    ),
  },
  {
    n: '05',
    title: 'Level up with coaching',
    body: (
      <>When you&rsquo;re ready to improve, the{' '}
      <Link to="/coaches">coaching marketplace</Link> connects you with
      experienced players for 1:1 sessions, group sessions and VOD reviews.</>
    ),
  },
];

function VideoBlock() {
  const url = (TUTORIAL_VIDEO_URL || '').trim();
  // No video configured → render nothing (the section heading is also
  // hidden by the caller). We deliberately do NOT advertise a
  // "coming soon" video; the written steps + interactive tour stand alone.
  if (!url) return null;
  if (isFileVideo(url)) {
    return (
      <div className="hiw-video-frame">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={url} controls preload="metadata" />
      </div>
    );
  }
  return (
    <div className="hiw-video-frame">
      <iframe
        src={toEmbedUrl(url)}
        title="OCE Inhouse walkthrough video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

export default function HowItWorks() {
  const { steamUser, signIn } = useSteamAuth() || {};
  const { startTour } = useTour() || {};
  const signedIn = !!(steamUser && steamUser.accountId);

  return (
    <div className="hiw-page">
      <header className="hiw-hero">
        <div className="hiw-eyebrow">New here?</div>
        <h1 className="hiw-title pb-serif">How OCE Inhouse works</h1>
        <p className="hiw-sub">
          From your first Steam sign-in to climbing the ladder &mdash; here&rsquo;s
          the whole flow in five steps, plus an interactive tour of the site.
        </p>
        <div className="hiw-cta-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => startTour && startTour()}
          >
            &#9655; Take the interactive tour
          </button>
          {!signedIn && (
            <button
              type="button"
              className="btn"
              onClick={() => { if (signIn) signIn(); else window.location.href = '/auth/steam'; }}
            >
              Sign in with Steam
            </button>
          )}
        </div>
      </header>

      {(TUTORIAL_VIDEO_URL || '').trim() && (
        <>
          <h2 className="hiw-section-head">Watch the walkthrough</h2>
          <VideoBlock />
        </>
      )}

      <h2 className="hiw-section-head">The five-step flow</h2>
      <div className="hiw-steps">
        {STEPS.map(s => (
          <div key={s.n} className="hiw-step">
            <div className="hiw-step-num pb-serif pb-num">{s.n}</div>
            <div>
              <h3 className="hiw-step-title pb-serif">{s.title}</h3>
              <p className="hiw-step-body">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="hiw-close-banner">
        <div className="hiw-eyebrow">Ready when you are</div>
        <h2 className="pb-serif">Jump in tonight.</h2>
        <p>Your first inhouse is one Steam click away.</p>
        <div className="hiw-cta-row">
          {signedIn ? (
            <Link to="/inhouse" className="btn btn-primary">Go to the inhouse lobby</Link>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { if (signIn) signIn(); else window.location.href = '/auth/steam'; }}
            >
              Sign in with Steam
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => startTour && startTour()}
          >
            Replay the tour
          </button>
        </div>
      </div>
    </div>
  );
}
