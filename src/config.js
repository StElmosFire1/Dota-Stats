const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    prefix: '!',
    announceChannelId: process.env.ANNOUNCE_CHANNEL_ID || null,
    weeklyRecapChannelId: process.env.WEEKLY_RECAP_CHANNEL_ID || process.env.ANNOUNCE_CHANNEL_ID || null,
    mmrRoles: {
      // Role IDs assigned based on MMR thresholds (set via env vars in Discord server)
      // Tiers ordered highest to lowest — first match wins
      tiers: [
        {
          name: 'The Guy',
          emoji: '👑',
          description: 'Undisputed. Feared. Respected.',
          min: 2500,
          roleId: process.env.DISCORD_ROLE_THEGUY || null,
        },
        {
          name: 'Actually Scary',
          emoji: '😤',
          description: 'People check your profile before picking.',
          min: 2350,
          roleId: process.env.DISCORD_ROLE_ACTUALLYSCARY || null,
        },
        {
          name: 'Getting Warm',
          emoji: '🔥',
          description: 'Finally showing a pulse.',
          min: 2250,
          roleId: process.env.DISCORD_ROLE_GETTINGWARM || null,
        },
        {
          name: 'First Timer',
          emoji: '🎮',
          description: 'Someone hand them a tutorial.',
          min: 2150,
          roleId: process.env.DISCORD_ROLE_FIRSTTIMER || null,
        },
        {
          name: 'Noob',
          emoji: '🐣',
          description: 'Hatched, but not dangerous.',
          min: 2050,
          roleId: process.env.DISCORD_ROLE_NOOB || null,
        },
        {
          name: 'NPC',
          emoji: '🤖',
          description: 'You could be replaced by a bot.',
          min: 0,
          roleId: process.env.DISCORD_ROLE_NPC || null,
        },
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

/**
 * Get the MMR tier for a given MMR value.
 * Returns { name, emoji, description, min } or null.
 */
function getMmrTier(mmr) {
  const tiers = config.discord.mmrRoles.tiers;
  for (const tier of tiers) {
    if (mmr >= tier.min) return tier;
  }
  return tiers[tiers.length - 1];
}

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

module.exports = { config, validateConfig, getMmrTier };
