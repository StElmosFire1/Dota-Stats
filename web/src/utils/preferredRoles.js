
const ROLE_NAMES = {
  1: 'Carry',
  2: 'Mid',
  3: 'Offlane',
  4: 'Soft support',
  5: 'Hard support',
};

/**
 * Accepts the legacy comma-separated form, JSON-encoded arrays, and native
 * arrays. Returns canonical human-readable role names without leaking storage
 * formats into the UI.
 */
export function normalizePreferredRoles(value) {
  if (value == null || value === '') return [];
  let values = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      values = trimmed.slice(1, -1).split(',').map(item => item.trim().replace(/^"|"$/g, ''));
    } else if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        values = Array.isArray(parsed) ? parsed : trimmed.split(',');
      } catch {
        values = trimmed.split(',');
      }
    } else {
      values = trimmed.split(',');
    }
  }
  if (!Array.isArray(values)) values = [values];
  const roles = values.map(item => {
    if (typeof item === 'number' || /^\d+$/.test(String(item).trim())) {
      return ROLE_NAMES[Number(item)] || 'Unknown role';
    }
    const text = String(item ?? '').trim();
    if (!text) return '';
    const numeric = text.match(/(?:position|pos)?\s*([1-5])$/i);
    return numeric ? ROLE_NAMES[Number(numeric[1])] : text;
  }).filter(Boolean);
  return [...new Set(roles)];
}
