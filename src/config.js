const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    prefix: '!',
    announceChannelId: process.env.ANNOUNCE_CHANNEL_ID || null,
    weeklyRecapChannelId: process.env.WEEKLY_RECAP_CHANNEL_ID || process.env.ANNOUNCE_CHANNEL_ID || null,
    mmrRoles: {
      // Role IDs assigned based on MMR thresholds (set via env vars)
      // Format: DISCORD_ROLE_<TIER>=<discord_role_id>
      tiers: [
        { name: 'Immortal',  min: 2500, roleId: process.env.DISCORD_ROLE_IMMORTAL  || null },
        { name: 'Divine',    min: 2350, roleId: process.env.DISCORD_ROLE_DIVINE    || null },
        { name: 'Ancient',   min: 2250, roleId: process.env.DISCORD_ROLE_ANCIENT   || null },
        { name: 'Legend',    min: 2150, roleId: process.env.DISCORD_ROLE_LEGEND    || null },
        { name: 'Crusader',  min: 2050, roleId: process.env.DISCORD_ROLE_CRUSADER  || null },
        { name: 'Herald',    min: 0,    roleId: process.env.DISCORD_ROLE_HERALD    || null },
      ],
    },
  },
  steam: {
    accountName: process.env.STEAM_ACCOUNT,
    password: process.env.STEAM_PASSWORD,
    sharedSecret: process.env.STEAM_SHARED_SECRET,
  },
  sheets: {
    sheetId: process.env.SHEET_ID,
    credsPath: './creds.json',
  },
  dota: {
    serverRegion: 5,
    gameMode: 22,
  },

  // Feature flags — set to true to re-enable dormant features
  features: {
    // Google Sheets sync (requires SHEET_ID env var + creds.json)
    sheets: false,
    // OpenDota match auto-poller (polls every 5min for public matches)
    matchPoller: false,
    // Steam lobby creation + friend auto-detect (requires lobby bot setup)
    lobby: false,
  },
};

function validateConfig() {
  const missing = [];
  if (!config.discord.token) missing.push('DISCORD_TOKEN');
  if (!config.steam.accountName) missing.push('STEAM_ACCOUNT');
  if (!config.steam.password) missing.push('STEAM_PASSWORD');
  if (!config.sheets.sheetId) missing.push('SHEET_ID');

  if (missing.length > 0) {
    console.warn(`[Config] Missing env vars: ${missing.join(', ')}`);
    console.warn('[Config] Some features may be unavailable.');
  }
  return missing;
}

module.exports = { config, validateConfig };
