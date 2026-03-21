const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    prefix: '!',
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
