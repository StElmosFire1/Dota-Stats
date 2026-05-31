import React, { useState } from 'react';
import { getHeroImageUrl } from '../heroNames';

const CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes';

function heroSlug(heroName) {
  if (!heroName) return null;
  return heroName
    .replace(/^npc_dota_hero_/, '')
    .toLowerCase();
}

export default function HeroIcon({ heroName, heroId, size = 'sm', style = {}, className = '' }) {
  const [failed, setFailed] = useState(false);
  // Prefer the id→slug map (it knows Dota's legacy CDN codenames, e.g.
  // Nature's Prophet → furion / Windranger → windrunner, which a naive
  // display-name slug can't produce); fall back to the npc_/display-name slug
  // for callers that only pass a name.
  const slug = heroSlug(heroName);
  const url = getHeroImageUrl(heroId, heroName) || (slug ? `${CDN}/${slug}.png` : null);

  if (!url || failed) {
    const dim = size === 'lg' ? 38 : size === 'md' ? 28 : 19;
    return (
      <span
        style={{
          display: 'inline-block',
          width: dim * 1.78,
          height: dim,
          background: 'var(--bg-hover)',
          borderRadius: 3,
          verticalAlign: 'middle',
          ...style,
        }}
        className={className}
      />
    );
  }

  const heights = { sm: 19, md: 28, lg: 38, xl: 52 };
  const h = heights[size] || 19;
  const w = Math.round(h * 1.78);

  return (
    <img
      src={url}
      alt={slug || 'hero'}
      width={w}
      height={h}
      onError={() => setFailed(true)}
      style={{
        borderRadius: 3,
        objectFit: 'cover',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
      className={className}
    />
  );
}
