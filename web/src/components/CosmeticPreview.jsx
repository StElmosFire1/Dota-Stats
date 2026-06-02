import React from 'react';
import {
  avatarRingStyle,
  bannerStyle,
  nameplateStyle,
  recapSkinSwatch,
} from '../profileCosmetics';

const DIMS = {
  sm: { ring: 40, bannerH: 28, nameFontSize: 15 },
  md: { ring: 56, bannerH: 38, nameFontSize: 20 },
  lg: { ring: 88, bannerH: 60, nameFontSize: 28 },
};

export default function CosmeticPreview({ kind, value, label, size = 'md' }) {
  const d = DIMS[size] || DIMS.md;

  if (kind === 'avatar_ring') {
    const s = avatarRingStyle(value);
    return (
      <div aria-hidden="true" style={{
        width: d.ring, height: d.ring, borderRadius: '50%', margin: '0 auto',
        background: 'var(--bg-primary)', flexShrink: 0, ...(s || {}),
      }} />
    );
  }
  if (kind === 'profile_banner') {
    const s = bannerStyle(value);
    return <div aria-hidden="true" style={{ height: d.bannerH, borderRadius: 8, ...(s || {}) }} />;
  }
  if (kind === 'nameplate_fx') {
    const s = nameplateStyle(value);
    return (
      <div aria-hidden="true" style={{
        textAlign: 'center', fontFamily: 'var(--font-serif, inherit)', fontWeight: 800,
        fontSize: d.nameFontSize, color: 'var(--text-primary)', lineHeight: 1.2, ...(s || {}),
      }}>
        {(label || '').replace(/ (Text|Wave|Glow)$/, '')}
      </div>
    );
  }
  if (kind === 'recap_skin') {
    const s = recapSkinSwatch(value);
    return <div aria-hidden="true" style={{ height: d.bannerH, borderRadius: 8, ...(s || {}) }} />;
  }
  return null;
}
