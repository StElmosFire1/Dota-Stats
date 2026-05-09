import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Dialog from './Dialog';

const DEFAULT_CONFIG = {
  enabled: false,
  version: 1,
  eyebrow: 'OCE Inhouse',
  title: 'Welcome',
  body: '',
  ctaText: '',
  ctaHref: '',
};

function parseConfig(raw) {
  if (!raw) return DEFAULT_CONFIG;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { ...DEFAULT_CONFIG, ...obj };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export default function WelcomeModal() {
  const [cfg, setCfg] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/settings/welcome-modal')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive || !d) return;
        const parsed = parseConfig(d.value);
        setCfg(parsed);
        if (!parsed.enabled) return;
        const dismissKey = `welcome_modal_dismissed_v${parsed.version || 1}`;
        try {
          if (localStorage.getItem(dismissKey)) return;
        } catch {}
        setOpen(true);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const dismiss = () => {
    if (cfg) {
      const dismissKey = `welcome_modal_dismissed_v${cfg.version || 1}`;
      try { localStorage.setItem(dismissKey, '1'); } catch {}
    }
    setOpen(false);
  };

  if (!cfg) return null;

  const ctaIsExternal = cfg.ctaHref && /^https?:\/\//.test(cfg.ctaHref);

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      label="Welcome"
      backdropStyle={{ zIndex: 10000, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
      contentClassName="oa-card oa-card-rule"
      contentStyle={{
        width: '100%', maxWidth: 540, padding: '28px 30px',
        color: 'var(--text-primary)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}
    >
      {cfg.eyebrow && <div className="oa-eyebrow" style={{ marginBottom: 8 }}>{cfg.eyebrow}</div>}
      <h2 className="font-serif" style={{ margin: '0 0 12px', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>
        {cfg.title}
      </h2>
      {cfg.body && (
        <div
          className="font-serif"
          style={{ margin: '0 0 18px', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
        >
          {cfg.body}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 18 }}>
        <button onClick={dismiss} className="oa-cta-ghost">Dismiss</button>
        {cfg.ctaText && cfg.ctaHref && (
          ctaIsExternal ? (
            <a href={cfg.ctaHref} className="oa-cta-primary" target="_blank" rel="noreferrer" onClick={dismiss}>
              {cfg.ctaText}
            </a>
          ) : (
            <Link to={cfg.ctaHref} className="oa-cta-primary" onClick={dismiss}>
              {cfg.ctaText}
            </Link>
          )
        )}
      </div>
    </Dialog>
  );
}
