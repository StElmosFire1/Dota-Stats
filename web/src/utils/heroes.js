export function formatHeroName(raw) {
  if (!raw) return '—';
  return raw
    .replace(/^npc_dota_hero_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
