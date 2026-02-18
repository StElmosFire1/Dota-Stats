const { config, validateConfig } = require('./config');
const { getDiscordBot } = require('./discord/bot');
const { getSheetsStore } = require('./sheets/sheetsStore');

async function main() {
  console.log('=== Dota 2 Inhouse Stats Bot ===');
  console.log('Starting up...\n');

  const missing = validateConfig();

  const sheetsStore = getSheetsStore();
  try {
    await sheetsStore.init();
  } catch (err) {
    console.error('[Startup] Sheets init failed:', err.message);
    console.warn('[Startup] Continuing without Google Sheets...');
  }

  let steamConnected = false;
  let lobbyManager = null;

  if (config.steam.accountName && config.steam.password) {
    try {
      const { getSteamClient } = require('./steam/steamClient');
      const steamClient = getSteamClient();
      await steamClient.login();
      console.log('[Startup] Steam + Dota 2 GC connected.\n');

      const { getLobbyManager } = require('./lobby/lobbyManager');
      lobbyManager = getLobbyManager();
      lobbyManager.initListeners();
      steamConnected = true;
    } catch (err) {
      console.error('[Startup] Steam login failed:', err.message);
      console.warn('[Startup] Lobby features will be unavailable.');
      console.warn('[Startup] You can still use replay uploads and manual recording.\n');
    }
  } else {
    console.warn('[Startup] Steam credentials not set. Lobby features disabled.');
    console.warn('[Startup] Set STEAM_ACCOUNT, STEAM_PASSWORD, STEAM_SHARED_SECRET in secrets.\n');
  }

  const bot = getDiscordBot();
  bot.setSteamAvailable(steamConnected);

  if (lobbyManager) {
    bot.setupLobbyEvents(lobbyManager);
    console.log('[Startup] Lobby auto-record events wired.');
  }

  try {
    await bot.start();
    console.log('\n[Startup] Bot is running! Use !help in Discord.');
    console.log('[Startup] Features available:');
    console.log(`  - Discord commands: YES`);
    console.log(`  - Google Sheets:    ${sheetsStore.initialized ? 'YES' : 'NO (set SHEET_ID + creds.json)'}`);
    console.log(`  - Steam/Lobby:      ${steamConnected ? 'YES' : 'NO (set STEAM_ACCOUNT + STEAM_PASSWORD)'}`);
    console.log(`  - OpenDota API:     YES`);
    console.log(`  - Replay upload:    YES`);
    console.log(`  - TrueSkill MMR:    YES`);
    console.log(`  - Auto-record:      ${steamConnected ? 'YES' : 'NO (requires Steam)'}\n`);
  } catch (err) {
    console.error('[Startup] Discord bot failed to start:', err.message);
    console.error('[Startup] Make sure DISCORD_TOKEN is set correctly.');
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n[Shutdown] Graceful shutdown...');
  try { getDiscordBot().shutdown(); } catch (e) {}
  try {
    const { getSteamClient } = require('./steam/steamClient');
    getSteamClient().shutdown();
  } catch (e) {}
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Shutdown] Received SIGTERM...');
  try { getDiscordBot().shutdown(); } catch (e) {}
  try {
    const { getSteamClient } = require('./steam/steamClient');
    getSteamClient().shutdown();
  } catch (e) {}
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('[Error] Unhandled rejection:', err);
});

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
