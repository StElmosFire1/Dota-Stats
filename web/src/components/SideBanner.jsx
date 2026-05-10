import React, { useState, useEffect } from 'react';
import './SideBanner.css';

function parseBanners(raw) {
  if (!raw) return null;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return (obj && typeof obj === 'object') ? obj : null;
  } catch {
    return null;
  }
}

function BannerCard({ data, side }) {
  if (!data || !data.enabled) return null;
  const hasImage = !!data.imageUrl;

  const cardBody = (
    <div className={`side-banner-card side-banner-${side}`}>
      {hasImage && (
        <img
          src={data.imageUrl}
          alt={data.title || ''}
          className="side-banner-img"
          loading="lazy"
        />
      )}
      {!hasImage && (data.title || data.subtitle) && (
        <div className="side-banner-no-image">
          {data.title    && <p className="side-banner-title">{data.title}</p>}
          {data.subtitle && <p className="side-banner-subtitle">{data.subtitle}</p>}
        </div>
      )}
      {hasImage && (data.title || data.subtitle) && (
        <div className="side-banner-overlay">
          {data.title    && <p className="side-banner-title">{data.title}</p>}
          {data.subtitle && <p className="side-banner-subtitle">{data.subtitle}</p>}
        </div>
      )}
    </div>
  );

  if (data.linkUrl) {
    const isExternal = /^https?:\/\//.test(data.linkUrl);
    return (
      <a
        href={data.linkUrl}
        className="side-banner-link"
        aria-label={[data.title, data.subtitle].filter(Boolean).join(' — ') || `${side} side banner`}
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {cardBody}
      </a>
    );
  }

  return <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{cardBody}</div>;
}

export default function SideBanners() {
  const [banners, setBanners] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/settings/side-banners', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setBanners(parseBanners(d?.value)); setLoaded(true); })
      .catch(() => setLoaded(true));

    const onUpdate = (e) => setBanners(e.detail || null);
    window.addEventListener('side-banners-updated', onUpdate);
    return () => window.removeEventListener('side-banners-updated', onUpdate);
  }, []);

  if (!loaded || !banners) return null;
  if (!banners.left?.enabled && !banners.right?.enabled) return null;

  return (
    <>
      {banners.left?.enabled && (
        <div className="side-banner-slot side-banner-slot-left" aria-label="Left sidebar banner">
          <BannerCard data={banners.left} side="left" />
        </div>
      )}
      {banners.right?.enabled && (
        <div className="side-banner-slot side-banner-slot-right" aria-label="Right sidebar banner">
          <BannerCard data={banners.right} side="right" />
        </div>
      )}
    </>
  );
}
