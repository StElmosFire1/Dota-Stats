'use strict';

// Public join routes accept the existing comma-separated role format.
// Normalize valid selections; reject missing, partial or out-of-range values.
function parsePreferredPositions(value) {
  const roles = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(roles) || roles.length === 0 || roles.length > 5) return null;
  const normalized = roles.map(role => String(role).trim());
  if (normalized.some(role => !/^[1-5]$/.test(role))) return null;
  return [...new Set(normalized)].join(',');
}

module.exports = { parsePreferredPositions };
