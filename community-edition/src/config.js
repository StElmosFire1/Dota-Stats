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
    dedicatedServer: {
      ip: process.env.DEDICATED_SERVER_IP || '',
      port: parseInt(process.env.DEDICATED_SERVER_PORT || '27015', 10),
      steamId: process.env.DEDICATED_SERVER_STEAM_ID || '',
      rconPassword: process.env.DEDICATED_SERVER_RCON_PASSWORD || '',
      ssh: {
        host: process.env.DEDICATED_SERVER_SSH_HOST || process.env.DEDICATED_SERVER_IP || '',
        port: parseInt(process.env.DEDICATED_SERVER_SSH_PORT || '22', 10),
        user: process.env.DEDICATED_SERVER_SSH_USER || 'root',
        privateKey: process.env.DEDICATED_SERVER_SSH_PRIVATE_KEY || '',
        replayDir: process.env.DEDICATED_SERVER_REPLAY_DIR || '/opt/dota2/game/dota/replays',
      },
    },
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
  const required = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'UPLOAD_KEY',
    'SUPERUSER_PASSWORD',
    'DISCORD_TOKEN',
    'STEAM_ACCOUNT',
    'STEAM_PASSWORD',
  ];

  const optional = [
    'SHEET_ID',
    'ANNOUNCE_CHANNEL_ID',
    'WEEKLY_RECAP_CHANNEL_ID',
    'SCHEDULE_CHANNEL_IDS',
    'STATS_CHANNEL_IDS',
    'PATCH_CHANNEL_IDS',
    'DISCORD_INVITE',
    'STEAM_SHARED_SECRET',
    'TRUSTED_STEAM_IDS',
    'DEDICATED_SERVER_IP',
    'DEDICATED_SERVER_PORT',
    'DEDICATED_SERVER_STEAM_ID',
    'DEDICATED_SERVER_RCON_PASSWORD',
    'DISABLE_STEAM',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('[Config] ===================================================');
    console.error('[Config] STARTUP FAILED — missing required environment variables:');
    missing.forEach((key) => console.error(`[Config]   - ${key}`));
    console.error('[Config]');
    console.error('[Config] Set the above variables in your .env file or shell');
    console.error('[Config] environment and restart the process.');
    console.error('[Config] ===================================================');
    process.exit(1);
  }

  const missingOptional = optional.filter((key) => !process.env[key]);
  if (missingOptional.length > 0) {
    console.warn('[Config] Optional env vars not set (some features may be limited):');
    missingOptional.forEach((key) => console.warn(`[Config]   - ${key}`));
  }

  return missing;
}

module.exports = { config, validateConfig, getMmrTier };
