// Process-wide policy: sync GC commands use the last successfully loaded value.
// Unknown policy fails closed; an absent setting preserves existing installations.
const db = require('../db');
let enabled = false;
let loaded = false;
const KEY = 'inhouse_dota_automation';

async function refresh() {
  try {
    const raw = await db.getSetting(KEY);
    enabled = raw == null || raw === '' ? true : raw === 'true' || raw === true;
    loaded = true;
    return enabled;
  } catch (err) {
    enabled = false;
    loaded = false;
    throw err;
  }
}

function assertEnabled() {
  if (!loaded || !enabled) {
    const error = new Error('Dota automation is off. Use the website lobby for joining and player drafting; arrange the Dota match manually.');
    error.code = 'DOTA_AUTOMATION_DISABLED';
    throw error;
  }
}

async function setEnabled(value) {
  if (typeof value !== 'boolean') throw new TypeError('enabled must be a boolean');
  await db.setSetting(KEY, String(value));
  enabled = value;
  loaded = true;
  return enabled;
}

module.exports = { refresh, assertEnabled, setEnabled, isEnabled: () => loaded && enabled };
