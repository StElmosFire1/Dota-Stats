const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    prefix: '!',
    announceChannelId: process.env.ANNOUNCE_CHANNEL_ID || null,
    weeklyRecapChannelId: process.env.WEEKLY_RECAP_CHANNEL_ID || process.env.ANNOUNCE_CHANNEL_ID || null,
    // Multi-channel routing — comma-separated channel IDs, supports multiple servers.
    // Falls back to ANNOUNCE_CHANNEL_ID for backward compatibility.
    scheduleChannelIds: process.env.SCHEDULE_CHANNEL_IDS
      ? process.env.SCHEDULE_CHANNEL_IDS.split(',').map(s => s.trim()).filter(Boolean)
      : (process.env.ANNOUNCE_CHANNEL_ID ? [process.env.ANNOUNCE_CHANNEL_ID] : []),
    statsChannelIds: process.env.STATS_CHANNEL_IDS
      ? process.env.STATS_CHANNEL_IDS.split(',').map(s => s.trim()).filter(Boolean)
      : (process.env.ANNOUNCE_CHANNEL_ID ? [process.env.ANNOUNCE_CHANNEL_ID] : []),
    patchChannelIds: process.env.PATCH_CHANNEL_IDS
      ? process.env.PATCH_CHANNEL_IDS.split(',').map(s => s.trim()).filter(Boolean)
      : (process.env.ANNOUNCE_CHANNEL_ID ? [process.env.ANNOUNCE_CHANNEL_ID] : []),
    serverInvite: process.env.DISCORD_INVITE || null,
    // Voice channels to move players into when a game starts.
    direVoiceChannelId: process.env.DIRE_VOICE_CHANNEL_ID || '1380084433239015527',
    radiantVoiceChannelId: process.env.RADIANT_VOICE_CHANNEL_ID || '1380084465665183754',
    mmrRoles: {
      // Role IDs assigned based on MMR thresholds (set via env vars in Discord server)
      // Tiers ordered highest to lowest — first match wins
      tiers: [
        {
          name: 'Gaben',
          emoji: '🎩',
          description: 'A personal friend of the man himself.',
          min: 4600,
          roleId: process.env.DISCORD_ROLE_GABEN || null,
        },
        {
          name: 'Prime Pick',
          emoji: '🎯',
          description: 'Everyone wants you on their team.',
          min: 4400,
          roleId: process.env.DISCORD_ROLE_PRIMEPICK || null,
        },
        {
          name: 'Apex',
          emoji: '⚡',
          description: 'Operating at peak Dota capacity.',
          min: 4100,
          roleId: process.env.DISCORD_ROLE_APEX || null,
        },
        {
          name: 'Veteran',
          emoji: '🎖️',
          description: 'Seen things. Done things. Knows things.',
          min: 3700,
          roleId: process.env.DISCORD_ROLE_VETERAN || null,
        },
        {
          name: 'Solid',
          emoji: '💪',
          description: 'Reliable. People can actually count on you.',
          min: 3200,
          roleId: process.env.DISCORD_ROLE_SOLID || null,
        },
        {
          name: 'Average',
          emoji: '😐',
          description: 'Not bad. Not good. Just... there.',
          min: 2600,
          roleId: process.env.DISCORD_ROLE_AVERAGE || null,
        },
        {
          name: 'NPC',
          emoji: '🤖',
          description: 'Standing in the trees doing nothing.',
          min: 2000,
          roleId: process.env.DISCORD_ROLE_NPC || null,
        },
        {
          name: 'Anchor',
          emoji: '⚓',
          description: 'Dragging your team straight to the bottom.',
          min: 1500,
          roleId: process.env.DISCORD_ROLE_ANCHOR || null,
        },
        {
          name: 'Neutral Creep',
          emoji: '🐗',
          description: 'You exist. The jungle thanks you for feeding it.',
          min: 1100,
          roleId: process.env.DISCORD_ROLE_NEUTRALCREEP || null,
        },
        {
          name: 'Observer Ward',
          emoji: '👁️',
          description: 'Placed. Ignored. Immediately dewarded.',
          min: 800,
          roleId: process.env.DISCORD_ROLE_OBSERVERWARD || null,
        },
        {
          name: 'Position 6',
          emoji: '🗺️',
          description: 'The position that doesn\'t exist — neither do your contributions.',
          min: 600,
          roleId: process.env.DISCORD_ROLE_POSITION6 || null,
        },
      ],
    },
  },
  steam: {
    accountName: process.env.STEAM_ACCOUNT,
    password: process.env.STEAM_PASSWORD,
    sharedSecret: process.env.STEAM_SHARED_SECRET,
    // Comma-separated Steam64 IDs allowed to invite the bot to parties/lobbies.
    // STEAM_0:1:17972010 = 76561197996209749
    trustedSteamIds: process.env.TRUSTED_STEAM_IDS
      ? process.env.TRUSTED_STEAM_IDS.split(',').map(s => s.trim()).filter(Boolean)
      : ['76561197996209749'],
  },
  sheets: {
    sheetId: process.env.SHEET_ID,
    credsPath: './creds.json',
  },
  dota: {
    serverRegion: 7, // 7 = Australia, 5 = SEA
    gameMode: 22,
  },

  // Feature flags — set to true to re-enable dormant features
  features: {
    sheets: false,
    matchPoller: false,
    lobby: true,
  },
};

/**
 * Get the MMR tier for a given MMR value.
 * Returns { name, emoji, description, min } or the lowest tier.
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
