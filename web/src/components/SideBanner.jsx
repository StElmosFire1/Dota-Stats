import React, { useState, useEffect } from 'react';
import './SideBanner.css';

function parseBanners(raw) {
  if (!raw) return null;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch {
    return null;
  }
}

function BannerCard({ data, side }) {
  if (!data || !data.enabled) return null;
  const inner = (
    <div className={`side-banner-card side-banner-${side}`}>
      {data.imageUrl && (
        <img
          src={data.imageUrl}
          alt={data.title || ''}
          className="side-banner-img"
          loading="lazy"
        />
      )}
      {!data.imageUrl && (
        <div className="side-banner-placeholder" aria-hidden="true">
          <span className="side-banner-placeholder-icon">🏆</span>
        </div>
      )}
      {data.title && <p className="side-banner-title">{data.title}</p>}
      {data.subtitle && <p className="side-banner-subtitle">{data.subtitle}</p>}
    </div>
  );

  if (data.linkUrl) {
    const isExternal = /^https?:\/\//.test(data.linkUrl);
    return (
      <a
        href={data.linkUrl}
        className="side-banner-link"
        aria-label={[data.title, data.subtitle].filter(Boolean).join(' — ') || `View ${side} banner`}
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {inner}
      </a>
    );
  }
  return inner;
}

export default function SideBanners() {
  const [banners, setBanners] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/settings/side-banners', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setBanners(parseBanners(d?.value));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    const onUpdate = (e) => setBanners(e.detail || null);
    window.addEventListener('side-banners-updated', onUpdate);
    return () => window.removeEventListener('side-banners-updated', onUpdate);
  }, []);

  if (!loaded || !banners) return null;

  const leftEnabled = banners.left?.enabled;
  const rightEnabled = banners.right?.enabled;
  if (!leftEnabled && !rightEnabled) return null;

  return (
    <>
      {leftEnabled && (
        <div className="side-banner-slot side-banner-slot-left" aria-label="Left sidebar banner">
          <BannerCard data={banners.left} side="left" />
        </div>
      )}
      {rightEnabled && (
        <div className="side-banner-slot side-banner-slot-right" aria-label="Right sidebar banner">
          <BannerCard data={banners.right} side="right" />
        </div>
      )}
    </>
  );
}
