import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './HomeBanner.css';

const DEFAULT_CONFIG = {
  enabled: false,
  version: 1,
  eyebrow: '',
  title: '',
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

export default function HomeBanner() {
  const [cfg, setCfg] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/settings/home-banner')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!alive || !d) return;
        const parsed = parseConfig(d.value);
        setCfg(parsed);
        try {
          const key = `home_banner_dismissed_v${parsed.version || 1}`;
          setDismissed(localStorage.getItem(key) === '1');
        } catch { setDismissed(false); }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!cfg || !cfg.enabled || !cfg.title || dismissed) return null;

  const handleDismiss = () => {
    try {
      const key = `home_banner_dismissed_v${cfg.version || 1}`;
      localStorage.setItem(key, '1');
    } catch {}
    setDismissed(true);
  };

  const ctaIsExternal = cfg.ctaHref && /^https?:\/\//.test(cfg.ctaHref);

  return (
    <div className="oa-card oa-card-rule oa-hero-glow oa-home-hero home-banner-notice" style={{ paddingRight: '3rem', position: 'relative' }}>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          position: 'absolute', top: 12, right: 14,
          background: 'transparent', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4, zIndex: 2,
        }}
      >×</button>
      {cfg.eyebrow && <div className="oa-eyebrow">{cfg.eyebrow}</div>}
      <h1>{cfg.title}</h1>
      {cfg.body && <p>{cfg.body}</p>}
      {cfg.ctaText && cfg.ctaHref && (
        <div className="oa-home-hero-cta">
          {ctaIsExternal ? (
            <a href={cfg.ctaHref} className="oa-cta-primary" target="_blank" rel="noreferrer">
              {cfg.ctaText}
            </a>
          ) : (
            <Link to={cfg.ctaHref} className="oa-cta-primary">
              {cfg.ctaText}
            </Link>
          )}
          <Link to="/patch-notes" className="oa-cta-ghost">Patch notes</Link>
        </div>
      )}
    </div>
  );
}
