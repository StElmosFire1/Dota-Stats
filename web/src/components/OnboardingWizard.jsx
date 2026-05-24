import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSteamAuth } from '../context/SteamAuthContext';
import Dialog from './Dialog';

const STEPS = [
  { id: 'welcome',    title: 'Welcome',           icon: '👋' },
  { id: 'link',       title: 'Link accounts',     icon: '🔗' },
  { id: 'customize',  title: 'Customize profile', icon: '🎨' },
  { id: 'queue',      title: 'How queueing works', icon: '🎮' },
  { id: 'done',       title: 'You\u2019re ready', icon: '🎉' },
];

export default function OnboardingWizard({ onComplete, onDismiss, initialStep = 0 }) {
  const { steamUser } = useSteamAuth() || {};
  const [stepIdx, setStepIdx] = useState(Math.max(0, Math.min(STEPS.length - 1, initialStep)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [discordLinked, setDiscordLinked] = useState(null);

  // Fetch discord-link status for the Link-Accounts step.
  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive) setDiscordLinked(!!(d && (d.discordId || d.discord_id))); })
      .catch(() => { if (alive) setDiscordLinked(false); });
    return () => { alive = false; };
  }, []);

  // Persist each step navigation server-side. Best-effort — the wizard keeps
  // working if this fails (e.g. transient network blip).
  const persistStep = useCallback(async (idx) => {
    try {
      await fetch('/api/me/onboarding/step', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: idx }),
      });
    } catch { /* tolerate */ }
  }, []);

  const go = (idx) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, idx));
    setStepIdx(next);
    persistStep(next);
  };

  const finish = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/me/onboarding/complete', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }
      onComplete?.();
    } catch (e) { setError(e.message); setSaving(false); return; }
    setSaving(false);
  };

  const modal = {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '28px 32px', maxWidth: 560, width: '100%',
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
    position: 'relative',
  };

  const stepDots = (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 24 }}>
      {STEPS.map((s, i) => (
        <div
          key={s.id}
          aria-label={`Step ${i + 1} of ${STEPS.length}: ${s.title}`}
          style={{
            width: i === stepIdx ? 28 : 8, height: 8, borderRadius: 4,
            background: i <= stepIdx ? 'var(--accent-blue, #3b82f6)' : 'var(--border)',
            transition: 'all 0.2s',
          }}
        />
      ))}
    </div>
  );

  const step = STEPS[stepIdx];

  const headerBlock = (
    <>
      <div style={{ fontSize: 32, marginBottom: 8, textAlign: 'center' }}>{step.icon}</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center' }}>
        {step.id === 'welcome' ? 'Welcome to OCE Inhouse' : step.title}
      </h2>
    </>
  );

  const Footer = ({ nextLabel = 'Next', onNext, hideBack = false }) => (
    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
      {!hideBack && (
        <button className="btn" type="button" style={{ flex: 1, padding: '10px' }} onClick={() => go(stepIdx - 1)}>
          ← Back
        </button>
      )}
      <button
        className="btn btn-primary" type="button"
        style={{ flex: hideBack ? 1 : 2, padding: '10px', fontSize: 14, fontWeight: 700 }}
        onClick={onNext || (() => go(stepIdx + 1))}
        disabled={saving}
      >
        {nextLabel}
      </button>
    </div>
  );

  return (
    <Dialog
      open={true}
      onClose={() => onDismiss?.()}
      label="Welcome to OCE Inhouse"
      backdropStyle={{ background: 'rgba(0,0,0,0.7)' }}
      contentStyle={modal}
    >
      <button
        type="button"
        onClick={onDismiss}
        style={{
          position: 'absolute', top: 12, right: 14,
          background: 'transparent', border: 'none',
          color: 'var(--text-muted)', cursor: 'pointer',
          fontSize: 20, lineHeight: 1, padding: 4,
        }}
        aria-label="Close onboarding"
      >×</button>

      {stepDots}
      {error && (
        <div role="alert" style={{ marginBottom: 14, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: 13, color: '#f87171' }}>
          {error}
        </div>
      )}

      {step.id === 'welcome' && (
        <div>
          {headerBlock}
          <p style={{ margin: '0 0 18px', fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
            A quick tour of OCE Inhouse — about a minute. You can close this at any time and replay it from Settings later.
          </p>
          <ul style={{
            margin: '0 0 8px', padding: '14px 18px',
            background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10,
            color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7, listStyle: 'none',
          }}>
            <li>1. Link your Discord (optional but recommended)</li>
            <li>2. Personalise your profile</li>
            <li>3. Learn how the inhouse queue works</li>
            <li>4. You\u2019re done — start playing</li>
          </ul>
          <Footer hideBack nextLabel="Get started →" />
        </div>
      )}

      {step.id === 'link' && (
        <div>
          {headerBlock}
          <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
            Steam is already connected. Linking Discord lets the bot DM you with match summaries, MVP prompts, and lobby alerts.
          </p>

          <div style={{
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '14px 16px', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <img src="https://store.steampowered.com/favicon.ico" alt="" style={{ width: 28, height: 28 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                {steamUser?.displayName || `Player ${steamUser?.accountId}`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Steam — linked</div>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px',
              borderRadius: 20, background: 'rgba(34,197,94,0.15)', color: '#22c55e',
              border: '1px solid rgba(34,197,94,0.3)',
            }}>✓ Linked</span>
          </div>

          <div style={{
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '14px 16px', marginBottom: 18,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: '#5865F2',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 14,
            }} aria-hidden="true">D</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Discord</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {discordLinked === null ? 'Checking\u2026' : discordLinked ? 'Linked' : 'Not linked yet'}
              </div>
            </div>
            {discordLinked ? (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 10px',
                borderRadius: 20, background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                border: '1px solid rgba(34,197,94,0.3)',
              }}>✓ Linked</span>
            ) : (
              <a href="/auth/discord?return=home" className="btn btn-primary" style={{ fontSize: 13, padding: '6px 12px' }}>
                Connect
              </a>
            )}
          </div>

          <Footer />
        </div>
      )}

      {step.id === 'customize' && (
        <div>
          {headerBlock}
          <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
            Add a bio, pin a signature hero, and choose a theme accent. This is what other players see on your profile.
          </p>
          <div style={{
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '16px 18px', marginBottom: 16,
            fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>You can customise:</div>
            • Bio &amp; custom title<br />
            • Pinned signature hero + match<br />
            • Theme accent colour<br />
            • Cosmetic frames &amp; voice packs (Pro)
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <Link to="/settings/profile" className="btn" style={{ flex: 1, textAlign: 'center', fontSize: 13 }} onClick={() => persistStep(stepIdx)}>
              Open profile editor
            </Link>
          </div>
          <Footer nextLabel="Next →" />
        </div>
      )}

      {step.id === 'queue' && (
        <div>
          {headerBlock}
          <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>
            Here\u2019s how an inhouse game comes together.
          </p>
          <ol style={{
            margin: '0 0 16px', padding: '14px 18px 14px 34px',
            background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10,
            color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7,
          }}>
            <li><strong>Sign up</strong> on the <Link to="/inhouse">/inhouse</Link> page and pick your positions.</li>
            <li>When 10 players queue, you\u2019ll get a <strong>timed accept</strong> prompt.</li>
            <li>Two captains <strong>draft teams</strong>, then a dedicated server is provisioned automatically.</li>
            <li>Play the match — the bot records it and updates your <Link to="/leaderboard">MMR</Link>.</li>
          </ol>
          <Footer />
        </div>
      )}

      {step.id === 'done' && (
        <div style={{ textAlign: 'center' }}>
          {headerBlock}
          <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)' }}>
            That\u2019s it. Jump in whenever you\u2019re ready — you can always tweak settings later.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
            <Link to="/inhouse" className="btn btn-primary" style={{ fontSize: 14 }} onClick={finish}>
              Go to /inhouse
            </Link>
            {steamUser?.accountId && (
              <Link to={`/player/${steamUser.accountId}`} className="btn" style={{ fontSize: 14 }} onClick={finish}>
                My profile
              </Link>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: 15, fontWeight: 700 }}
            onClick={finish}
            disabled={saving}
          >
            {saving ? 'Saving\u2026' : 'Finish'}
          </button>
        </div>
      )}
    </Dialog>
  );
}
