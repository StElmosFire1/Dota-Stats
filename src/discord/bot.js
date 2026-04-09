const { Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const cron = require('node-cron');
const { config, getMmrTier } = require('../config');
const { getStatsService } = require('../stats/statsService');
const { getSheetsStore } = require('../sheets/sheetsStore');
const { getReplayParser } = require('../replay/replayParser');
const { getOpenDota } = require('../api/opendota');
const db = require('../db');
const { generateWeeklyRecapBlurb, generatePlayerAnalysis, generatePlayerRoast, generateMatchMvpBlurb, generateMatchNarrative } = require('../services/groqService');
const { generateScoreboardImage } = require('../services/scoreboardImage');

let steamAvailable = false;

function tryGetSteamClient() {
  try {
    const { getSteamClient } = require('../steam/steamClient');
    return getSteamClient();
  } catch { return null; }
}

function tryGetLobbyManager() {
  try {
    const { getLobbyManager } = require('../lobby/lobbyManager');
    return getLobbyManager();
  } catch { return null; }
}

class DiscordBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    });
    this.prefix = config.discord.prefix;
    this.lobbyChannelId = null;
    this.pendingRatingSessions = new Map();
    this.pendingRegistrations = new Map(); // discord_id → { gameId, prompted }
    this._announcedMatchIds = new Set(); // dedup guard — prevents double-posting the same match
    this._setupHandlers();
  }

  setSteamAvailable(available) {
    steamAvailable = available;
  }

  setupLobbyEvents(lobbyManager) {
    lobbyManager.on('matchIdCaptured', (matchId) => {
      this._notifyChannel(`Match detected! Match ID: **${matchId}**. Stats will auto-record when the game ends.`);
    });

    lobbyManager.on('matchStarted', (lobby) => {
      this._notifyChannel(`Game is now **in progress** for lobby "${lobby.name}".`);
    });

    lobbyManager.on('autoJoined', (invite) => {
      const embed = new EmbedBuilder()
        .setTitle('Auto-Joined Lobby')
        .setColor(0x00ae86)
        .setDescription(
          `Bot was invited to a lobby by **${invite.senderName}** and has auto-joined.\n` +
          'It will track the match automatically when it starts.\n\n' +
          'Use `!lobby_status` to check the current lobby.'
        )
        .setTimestamp();
      this._notifyChannel({ embeds: [embed] });
    });

    lobbyManager.on('partyJoined', (info) => {
      this._notifyChannel(
        `🤝 **Joined party** with **${info.senderName}**. ` +
        `When they create a practice lobby, the bot will auto-join and track the match.`
      );
    });

    lobbyManager.on('matchEnded', async (lobby) => {
      const matchId = lobby.matchId;
      const lobbyMatchStats = lobby.lobbyMatchStats;
      const outcomeKnown = lobby.outcomeKnown;

      if (!matchId && !lobbyMatchStats) {
        this._notifyChannel('Match ended but no data was captured. Use `!record <match_id>` manually.');
        return;
      }

      if (!outcomeKnown) {
        this._notifyChannel(
          `Match **${matchId || 'unknown'}** ended but the winner could not be determined from lobby data.\n` +
          `Use \`!record ${matchId}\` to manually record if the match is available on OpenDota.`
        );
        return;
      }

      this._notifyChannel(`Match ended! Recording match **${matchId || 'unknown'}**...`);

      if (matchId) {
        const steamClient = tryGetSteamClient();
        const gcClient = steamClient?.gcClient;
        if (gcClient) {
          try {
            const { autoDownloadAndProcessReplay } = require('../services/replayDownloader');
            const { processReplayInternal } = require('../web/server');
            autoDownloadAndProcessReplay(
              gcClient,
              matchId,
              (filePath, source) => processReplayInternal(filePath, source),
              (msg) => this._notifyChannel(msg)
            ).catch(err => console.error('[ReplayDL] Unhandled error:', err.message));
          } catch (err) {
            console.warn('[ReplayDL] Could not start auto-download:', err.message);
          }
        } else {
          console.warn('[ReplayDL] No GC client available — skipping auto-replay download.');
        }
      }

      try {
        const sheetsStore = getSheetsStore();
        const statsService = getStatsService();

        if (sheetsStore.initialized && matchId) {
          const alreadyRecorded = await sheetsStore.isMatchRecorded(matchId);
          if (alreadyRecorded) {
            this._notifyChannel(`Match **${matchId}** was already recorded.`);
            console.log(`[AutoRecord] Match ${matchId} already recorded, skipping.`);
            return;
          }
        }

        if (lobbyMatchStats && lobbyMatchStats.players.length > 0) {
          await this._recordMatchData(lobbyMatchStats, lobby.name, 'lobby-gc');
          await this._markRecorded(lobbyMatchStats.matchId || matchId, 'lobby-gc');
          const radiantPlayers = lobbyMatchStats.players.filter((p) => p.team === 'radiant');
          const direPlayers = lobbyMatchStats.players.filter((p) => p.team === 'dire');
          await this._processRatings(lobbyMatchStats, radiantPlayers, direPlayers, sheetsStore, statsService);

          const statsChannels = await this._resolveChannels(
            config.discord.statsChannelIds.length > 0 ? config.discord.statsChannelIds : (this.lobbyChannelId ? [this.lobbyChannelId] : [])
          );
          for (const ch of statsChannels) {
            await this._sendMatchSummary(lobbyMatchStats, lobby.name, ch).catch(e => console.error(`[AutoRecord] Summary error (${ch.id}):`, e.message));
          }
          console.log(`[AutoRecord] Match ${matchId} recorded from lobby GC data.`);
        } else if (matchId) {
          this._notifyChannel(`Lobby data incomplete. Trying OpenDota in 30 seconds...`);
          setTimeout(async () => {
            try {
              const alreadyRecorded = await sheetsStore.isMatchRecorded(matchId);
              if (alreadyRecorded) return;
              const opendota = getOpenDota();
              let matchStats = await opendota.getMatch(matchId);
              if (!matchStats) {
                this._notifyChannel(`Match ${matchId} not available on OpenDota (practice lobby). Use \`!record ${matchId}\` later if it appears.`);
                return;
              }
              await this._recordMatchData(matchStats, lobby.name, 'auto-opendota');
              await this._markRecorded(matchId, 'auto-opendota');
              const radiantPlayers = matchStats.players.filter((p) => p.team === 'radiant');
              const direPlayers = matchStats.players.filter((p) => p.team === 'dire');
              await this._processRatings(matchStats, radiantPlayers, direPlayers, sheetsStore, statsService);
              const statsChannels = await this._resolveChannels(
                config.discord.statsChannelIds.length > 0 ? config.discord.statsChannelIds : (this.lobbyChannelId ? [this.lobbyChannelId] : [])
              );
              for (const ch of statsChannels) {
                await this._sendMatchSummary(matchStats, lobby.name, ch).catch(e => console.error(`[AutoRecord] OD summary error (${ch.id}):`, e.message));
              }
            } catch (err) {
              console.error('[AutoRecord] OpenDota fallback error:', err.message);
              this._notifyChannel(`OpenDota fallback failed: ${err.message}`);
            }
          }, 30000);
        }
      } catch (err) {
        console.error('[AutoRecord] Error:', err.message);
        this._notifyChannel(`Auto-record failed: ${err.message}. Use \`!record ${matchId}\` manually.`);
      }
    });
  }

  async _resolveChannels(ids) {
    const channels = [];
    for (const id of ids) {
      let ch = this.client.channels.cache.get(id);
      if (!ch) ch = await this.client.channels.fetch(id).catch(() => null);
      if (ch) channels.push(ch);
    }
    return channels;
  }

  async _broadcastToStatsChannels(content) {
    const ids = new Set(config.discord.statsChannelIds);
    if (this.lobbyChannelId) ids.add(this.lobbyChannelId);
    const channels = await this._resolveChannels([...ids]);
    for (const ch of channels) {
      await ch.send(content).catch(err => console.error(`[Broadcast] Stats channel ${ch.id} error:`, err.message));
    }
  }

  async _broadcastToScheduleChannels(content) {
    const channels = await this._resolveChannels(config.discord.scheduleChannelIds);
    for (const ch of channels) {
      await ch.send(content).catch(err => console.error(`[Broadcast] Schedule channel ${ch.id} error:`, err.message));
    }
  }

  async _broadcastToPatchChannels(content) {
    const channels = await this._resolveChannels(config.discord.patchChannelIds);
    for (const ch of channels) {
      await ch.send(content).catch(err => console.error(`[Broadcast] Patch channel ${ch.id} error:`, err.message));
    }
  }

  _notifyChannel(message) {
    const ids = new Set(config.discord.statsChannelIds);
    if (this.lobbyChannelId) ids.add(this.lobbyChannelId);
    for (const id of ids) {
      const channel = this.client.channels.cache.get(id);
      if (channel) channel.send(message).catch(() => {});
    }
  }

  async _getAnnounceChannel() {
    const ids = config.discord.statsChannelIds;
    const fallbackId = config.discord.announceChannelId || this.lobbyChannelId;
    const lookupIds = ids.length > 0 ? ids : (fallbackId ? [fallbackId] : []);
    if (!lookupIds.length) return null;
    const channels = await this._resolveChannels(lookupIds);
    return channels[0] || null;
  }

  async notifyMatchRecorded(matchStats) {
    const channels = await this._resolveChannels(
      config.discord.statsChannelIds.length > 0
        ? config.discord.statsChannelIds
        : (config.discord.announceChannelId ? [config.discord.announceChannelId] : [])
    );
    if (!channels.length) return;
    try {
      for (const ch of channels) {
        await ch.send(`Auto-detected inhouse match **${matchStats.matchId}**! Recording stats...`).catch(() => {});
        await this._sendMatchSummary(matchStats, '', ch);
      }
    } catch (err) {
      console.error('[Discord] Notify error:', err.message);
    }
  }

  async notifyWebUpload(matchStats) {
    const channels = await this._resolveChannels(
      config.discord.statsChannelIds.length > 0
        ? config.discord.statsChannelIds
        : (config.discord.announceChannelId ? [config.discord.announceChannelId] : [])
    );
    if (!channels.length) {
      console.log('[Discord] Web upload: no stats channels configured, skipping Discord notification.');
    } else {
      for (const ch of channels) {
        try {
          await this._sendMatchSummary(matchStats, 'Replay Upload', ch);
        } catch (err) {
          console.error(`[Discord] Web upload notify error (channel ${ch.id}):`, err.message);
        }
      }
    }
    // Trigger post-match DMs regardless of whether a channel is configured
    setTimeout(() => this._initiateRatingSession(matchStats).catch(e => console.error('[Ratings] DM error:', e.message)), 3000);
    setTimeout(() => this._sendReportCardDMs(matchStats).catch(e => console.error('[ReportCard] DM error:', e.message)), 5000);
  }

  _setupHandlers() {
    this.client.on('ready', () => {
      console.log(`[Discord] Bot online as ${this.client.user.tag}`);
      this.client.user.setActivity('Dota 2 Inhouse | !help', { type: 3 });
    });

    this.client.on('messageReactionAdd', async (reaction, user) => {
      if (user.bot) return;
      try {
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();
        const game = await db.getScheduledGameByRsvpMessage(reaction.message.id).catch(() => null);
        if (!game) return;
        const emoji = reaction.emoji.name;
        // Prefer nickname from DB over raw Discord display name
        const nickname = await db.getNicknameByDiscordId(user.id).catch(() => null);
        const displayName = nickname || user.username;
        if (emoji === '\u2705') {
          await db.addScheduleRsvp(game.id, user.id, displayName, 'yes').catch(() => {});
          // Check if this person is registered — if not, DM them to sign up
          this._promptUnregisteredRsvp(user, game).catch(() => {});
        } else if (emoji === '\u274C') {
          await db.addScheduleRsvp(game.id, user.id, displayName, 'no').catch(() => {});
        }
        await this._updateRsvpEmbed(reaction.message, game.id).catch(() => {});
      } catch (err) {
        console.error('[RSVP] reactionAdd error:', err.message);
      }
    });

    this.client.on('messageReactionRemove', async (reaction, user) => {
      if (user.bot) return;
      try {
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();
        const game = await db.getScheduledGameByRsvpMessage(reaction.message.id).catch(() => null);
        if (!game) return;
        const emoji = reaction.emoji.name;
        if (emoji === '\u2705' || emoji === '\u274C') {
          await db.removeScheduleRsvp(game.id, user.id).catch(() => {});
          await this._updateRsvpEmbed(reaction.message, game.id).catch(() => {});
        }
      } catch (err) {
        console.error('[RSVP] reactionRemove error:', err.message);
      }
    });

    this.client.on('messageCreate', async (msg) => {
      if (msg.author.bot) return;

      const isDM = !msg.guild;
      if (isDM && this.pendingRegistrations.has(msg.author.id)) {
        await this._handleRegistrationReply(msg);
        return;
      }
      if (isDM && this.pendingRatingSessions.has(msg.author.id)) {
        await this._handleRatingReply(msg);
        return;
      }

      if (msg.attachments.size > 0) {
        const demFile = msg.attachments.find((a) => a.name && a.name.endsWith('.dem'));
        if (demFile) {
          await this._handleReplayUpload(msg, demFile);
          return;
        }
      }

      if (!msg.content.startsWith(this.prefix)) return;

      const args = msg.content.slice(this.prefix.length).trim().split(/\s+/);
      const command = args.shift().toLowerCase();

      try {
        switch (command) {
          case 'help': await this._cmdHelp(msg); break;
          case 'top': await this._cmdTop(msg, args); break;
          case 'stats': await this._cmdStats(msg, args); break;
          case 'analyze': case 'analyse': await this._cmdAnalyze(msg, args); break;
          case 'roast': await this._cmdRoast(msg, args); break;
          case 'history': await this._cmdHistory(msg); break;
          case 'register': await this._cmdRegister(msg, args); break;
          case 'players': await this._cmdPlayers(msg); break;
          case 'recap': await this._cmdRecap(msg); break;
          case 'herostats': await this._cmdHeroStats(msg, args); break;
          case 'vs': await this._cmdVs(msg, args); break;
          case 'match': await this._cmdMatch(msg, args); break;
          case 'predict': await this._cmdPredict(msg, args); break;
          case 'predictions': await this._cmdPredictions(msg, args); break;
          case 'balance': await this._cmdBalance(msg, args); break;
          case 'rematch': await this._cmdRematch(msg); break;
          case 'schedule': await this._cmdSchedule(msg, args); break;
          case 'upcoming': await this._cmdUpcoming(msg); break;
          case 'cancel': await this._cmdCancelGame(msg, args); break;
          case 'rank': await this._cmdRank(msg, args); break;
          case 'meta': await this._cmdMeta(msg, args); break;
          case 'mystats': await this._cmdMyStats(msg); break;
          case 'reportcard': await this._cmdReportCard(msg, args); break;
          case 'ratings': await this._cmdRatings(msg, args); break;
          case 'streak': await this._cmdStreak(msg, args); break;
          case 'tournament': await this._cmdTournament(msg, args); break;
          case 'testdm': await this._cmdTestDm(msg, args); break;
          case 'testrsvpdm': await this._cmdTestRsvpDm(msg, args); break;
          case 'create_lobby': await this._cmdCreateLobby(msg, args); break;
          case 'join_lobby': await this._cmdJoinLobby(msg, args); break;
          case 'lobby_status': await this._cmdLobbyStatus(msg); break;
          case 'gc_debug': await this._cmdGcDebug(msg); break;
          case 'invite': await this._cmdInvite(msg, args); break;
          case 'end': await this._cmdEnd(msg); break;
          case 'start_game': await this._cmdStartGame(msg); break;
          default: break;
        }
      } catch (err) {
        console.error(`[Discord] Command error (${command}):`, err.message);
        await msg.reply(`Error: ${err.message}`).catch(() => {});
      }
    });
  }

  async _cmdHelp(msg) {
    const embed = new EmbedBuilder()
      .setTitle('Dota 2 Inhouse Bot - Commands')
      .setColor(0x00ae86)
      .setDescription('Track your inhouse games and climb the leaderboard!')
      .addFields(
        {
          name: '**Player Registration**',
          value: [
            '`!register <steam_id>` - Link your Steam account to this Discord account',
            '`!players` - Show all registered players',
            'Your Steam64 ID can be found at https://steamid.io',
          ].join('\n'),
        },
        {
          name: '**Match Recording**',
          value: [
            'Upload a `.dem` replay file - Bot parses full stats (KDA, GPM, damage, items, etc.)',
            'Replay parsing works for all private inhouse matches!',
          ].join('\n'),
        },
        {
          name: '**Stats & Rankings**',
          value: [
            '`!top [count]` - Show leaderboard (default top 10)',
            '`!rank [@user]` - Your MMR rank, tier, and leaderboard position',
            '`!stats [@user]` - Show your stats (or @mention another player)',
            '`!mystats` - Your personal stats summary (sent via DM)',
            '`!history` - Show recent match history',
            '`!match <id>` - Show scoreboard for a specific match',
            '`!herostats <hero>` - Win rate & top players for a hero',
            '`!meta [days]` - Top 10 most-picked heroes this week (or last N days)',
            '`!vs @user` - Your head-to-head record against someone',
            '`!recap` - This week\'s highlights, Player of Week & fun stats',
          ].join('\n'),
        },
        {
          name: '⚖️ Team Balancer',
          value: [
            '`!balance @p1 @p2 @p3 ... @p10` - Suggest the most balanced 5v5 split based on MMR',
            '`!rematch` - Re-balance last game\'s players for an instant rematch',
            'Works with @mentions (if Discord ID linked) or player nicknames',
          ].join('\n'),
        },
        {
          name: '📅 Schedule',
          value: [
            '`!upcoming` - List upcoming scheduled games',
            '`!schedule 2026-04-10 20:00 Weekly inhouse` - Schedule a game (AEST) + auto RSVP post',
            '`!cancel <id>` - Cancel a scheduled game by ID',
            'React ✅/❌ on the RSVP post to mark yourself in or out!',
          ].join('\n'),
        },
        {
          name: '🎯 Predictions',
          value: [
            '`!predict <matchId> <radiant|dire>` - Predict who wins a match',
            '`!predictions <matchId>` - See all predictions for a match',
            'Results auto-reveal after match is recorded!',
          ].join('\n'),
        },
        {
          name: '⭐ Post-Match Ratings & Reports',
          value: [
            'After each match, the bot DMs players to vote for MVP and rate teammates\' attitude (1–10)',
            '`!ratings [on|off]` - Toggle post-match teammate rating DMs (on by default)',
            '`!reportcard on` - **Opt in** to receive your personal stats DM after each match',
            '`!reportcard off` - Opt out of personal stats DMs',
            'Ratings are anonymous and appear on player profiles',
          ].join('\n'),
        },
        {
          name: '🔥 Streaks & Tournaments',
          value: [
            '`!streak [@user]` - Check your (or another player\'s) current win/loss streak',
            '`!tournament` - List active and upcoming tournaments',
          ].join('\n'),
        },
        {
          name: '🤖 AI Commands',
          value: [
            '`!analyze [@user]` - AI performance analysis from the coaching bot',
            '`!roast [@user]` - Let the AI trash-talk someone\'s stats (all in good fun)',
          ].join('\n'),
        },
        {
          name: '**Info**',
          value: '`!help` - Show this message',
        }
      )
      .setFooter({ text: 'OCE Dota 2 Inhouse Community' });

    await msg.reply({ embeds: [embed] });
  }

  async _cmdCreateLobby(msg, args) {
    if (!steamAvailable) {
      return msg.reply(
        'Steam/Dota 2 is not connected. Lobby creation requires Steam credentials.\n' +
        'Set `STEAM_ACCOUNT`, `STEAM_PASSWORD`, and `STEAM_SHARED_SECRET` in secrets.'
      );
    }

    if (args.length < 2) {
      return msg.reply('Usage: `!create_lobby <name> <password>`');
    }

    const name = args[0];
    const password = args.slice(1).join(' ');
    const lobbyManager = tryGetLobbyManager();
    if (!lobbyManager) return msg.reply('Lobby manager is not available.');

    this.lobbyChannelId = msg.channel.id;
    await msg.reply('Creating lobby, please wait...');

    try {
      const lobby = await lobbyManager.createLobby(name, password, msg.author.id);

      const embed = new EmbedBuilder()
        .setTitle('Lobby Created!')
        .setColor(0x00ff00)
        .addFields(
          { name: 'Name', value: name, inline: true },
          { name: 'Password', value: `||${password}||`, inline: true },
          { name: 'Region', value: 'Australia/OCE', inline: true },
          { name: 'Mode', value: "Captain's Mode", inline: true }
        );

      if (lobby.lobbyId) {
        embed.addFields({ name: 'Lobby ID', value: lobby.lobbyId, inline: true });
      }

      embed
        .setDescription(
          'Lobby is ready! **How to join:**\n' +
          '1. Add the bot\'s Steam account as a friend\n' +
          '2. Right-click the bot in your friends list > **Join Game**\n' +
          '3. Or use `!invite <steam_id>` to get a lobby invite\n\n' +
          'When the match finishes, use `!end` to close the lobby, ' +
          'then `!record <match_id>` to save stats.'
        )
        .setFooter({ text: `Created by ${msg.author.username}` })
        .setTimestamp();

      await msg.channel.send({ embeds: [embed] });
    } catch (err) {
      await msg.reply(`Failed to create lobby: ${err.message}`);
    }
  }

  async _cmdLobbyStatus(msg) {
    const lobbyManager = tryGetLobbyManager();
    if (!lobbyManager) return msg.reply('Lobby manager is not available. Steam may not be connected.');

    const status = lobbyManager.getStatus();
    if (!status.lobby) return msg.reply('No active lobby. Use `!create_lobby` to create one or `!join_lobby` to join an existing one.');

    const embed = new EmbedBuilder()
      .setTitle('Current Lobby')
      .setColor(0x00ae86)
      .addFields(
        { name: 'Name', value: status.lobby.name, inline: true },
        { name: 'State', value: status.state, inline: true }
      );

    if (status.lobby.lobbyId) {
      embed.addFields({ name: 'Lobby ID', value: status.lobby.lobbyId, inline: true });
    }
    if (status.lobby.matchId) embed.addFields({ name: 'Match ID', value: status.lobby.matchId, inline: true });
    embed.addFields({
      name: 'How to Join',
      value:
        '1. Add the bot on Steam as a friend\n' +
        '2. Right-click bot > **Join Game**\n' +
        '3. Or use `!invite <steam_id>` for a direct invite',
      inline: false
    });

    await msg.reply({ embeds: [embed] });
  }

  async _cmdGcDebug(msg) {
    const steamClient = tryGetSteamClient();
    const lobbyManager = tryGetLobbyManager();
    const lines = [];

    lines.push(`**Steam logged in:** ${steamClient?.isLoggedIn ? 'Yes' : 'No'}`);
    lines.push(`**GC ready:** ${steamClient?.isGCReady ? 'Yes' : 'No'}`);
    lines.push(`**GC invite listeners:** ${lobbyManager?._gcListenersSetup ? 'Active' : 'NOT registered'}`);
    lines.push(`**Lobby state:** ${lobbyManager?.state ?? 'unavailable'}`);

    if (lobbyManager && !lobbyManager._gcListenersSetup) {
      lines.push('');
      lines.push('Attempting to re-register GC listeners now...');
      try {
        lobbyManager._gcListenersSetup = false;
        lobbyManager._setupGCListeners();
        lines.push(`Re-register result: ${lobbyManager._gcListenersSetup ? 'Success' : 'GC not ready yet — will retry on next GC connect'}`);
      } catch (e) {
        lines.push(`Re-register failed: ${e.message}`);
      }
    }

    await msg.reply(lines.join('\n'));
  }

  async _cmdJoinLobby(msg, args) {
    if (!steamAvailable) {
      return msg.reply(
        'Steam/Dota 2 is not connected. Joining lobbies requires Steam credentials.\n' +
        'Set `STEAM_ACCOUNT`, `STEAM_PASSWORD`, and `STEAM_SHARED_SECRET` in secrets.'
      );
    }

    if (args.length < 1) {
      return msg.reply(
        'Usage: `!join_lobby <lobby_id> [password]`\n' +
        'The lobby ID is a long number (e.g. `29712964177916965`).\n' +
        'You can find it in the Dota 2 console with `dota_lobby_debug`.\n\n' +
        '**Easier method:** Invite the bot\'s Steam account to your lobby from within Dota 2 and it will auto-join!'
      );
    }

    const lobbyId = args[0];

    if (!/^\d+$/.test(lobbyId)) {
      return msg.reply(
        'The lobby ID should be a number (e.g. `29712964177916965`), not a name.\n' +
        'You can find it in the Dota 2 console with `dota_lobby_debug`.\n\n' +
        '**Easier method:** Just invite the bot\'s Steam account to your lobby from within Dota 2!'
      );
    }

    const password = args.length > 1 ? args.slice(1).join(' ') : '';
    const lobbyManager = tryGetLobbyManager();
    if (!lobbyManager) return msg.reply('Lobby manager is not available.');

    this.lobbyChannelId = msg.channel.id;
    await msg.reply('Joining lobby, please wait...');

    try {
      const lobby = await lobbyManager.joinLobby(lobbyId, password, msg.author.id);

      const embed = new EmbedBuilder()
        .setTitle('Joined Lobby!')
        .setColor(0x00ff00)
        .addFields(
          { name: 'Lobby ID', value: lobby.lobbyId || lobbyId, inline: true }
        )
        .setDescription(
          'Bot has joined the lobby as a spectator/observer.\n' +
          'It will automatically track the match when it starts.\n\n' +
          'When the match finishes, use `!end` to disconnect the bot, ' +
          'then `!record <match_id>` to save stats if auto-record doesn\'t trigger.'
        )
        .setFooter({ text: `Requested by ${msg.author.username}` })
        .setTimestamp();

      if (lobby.name && lobby.name !== `Lobby ${lobbyId}`) {
        embed.addFields({ name: 'Name', value: lobby.name, inline: true });
      }

      await msg.channel.send({ embeds: [embed] });
    } catch (err) {
      await msg.reply(`Failed to join lobby: ${err.message}`);
    }
  }

  async _cmdInvite(msg, args) {
    if (!steamAvailable) {
      return msg.reply('Steam is not connected. Cannot send invites.');
    }
    if (args.length < 1) {
      return msg.reply(
        'Usage: `!invite <steam_id>`\n' +
        'Provide a Steam ID (e.g. `76561198012345678`).\n' +
        'Find yours at <https://steamid.io/>'
      );
    }

    const lobbyManager = tryGetLobbyManager();
    if (!lobbyManager) return msg.reply('Lobby manager is not available.');

    const rawId = args[0];
    let steamId64;
    try {
      ({ steamId64 } = this._parseSteamId(rawId));
    } catch (e) {
      return msg.reply(`Invalid Steam ID \`${rawId}\`: ${e.message}`);
    }
    try {
      const sent = lobbyManager.invitePlayer(steamId64);
      if (sent) {
        await msg.reply(`Lobby invite sent to \`${steamId64}\`. They should see the invite in Dota 2.`);
      } else {
        await msg.reply('Failed to send invite. Make sure the bot is friends with that Steam account.');
      }
    } catch (err) {
      await msg.reply(`Error: ${err.message}`);
    }
  }

  async _cmdEnd(msg) {
    const lobbyManager = tryGetLobbyManager();
    if (!lobbyManager) return msg.reply('Lobby manager is not available.');

    try {
      const lobbyInfo = await lobbyManager.endLobby();
      await msg.reply(
        `Lobby "${lobbyInfo.name}" ended.\n` +
        'Use `!record <match_id>` to record the match stats from OpenDota.'
      );
      lobbyManager.resetState();
    } catch (err) {
      await msg.reply(`Error: ${err.message}`);
    }
  }

  async _cmdStartGame(msg) {
    const lobbyManager = tryGetLobbyManager();
    if (!lobbyManager) return msg.reply('Lobby manager is not available.');
    const status = lobbyManager.getStatus();
    if (!status.lobby) return msg.reply('No active lobby. Create one first with `!create_lobby`.');
    const seated = status.lobby._gamePlayerCount || 0;
    try {
      // Cancel any active countdown first, then force-launch
      if (lobbyManager._countdownTimer) lobbyManager._abortCountdown();
      lobbyManager.launchLobby();
      await msg.reply(`🚀 **Game launched!** (${seated}/10 players seated) — Match is starting in "${status.lobby.name}".`);
    } catch (err) {
      await msg.reply(`Error: ${err.message}`);
    }
  }

  async _cmdRecord(msg, args) {
    if (args.length < 1) return msg.reply('Usage: `!record <match_id>`');

    const matchId = args[0];
    const opendota = getOpenDota();
    const sheetsStore = getSheetsStore();
    const statsService = getStatsService();

    const statusMsg = await msg.reply(`Fetching match ${matchId} from OpenDota...`);

    try {
      let matchStats = await opendota.getMatch(matchId);

      if (!matchStats) {
        await statusMsg.edit(
          `Match ${matchId} not found on OpenDota. Requesting parse...\n` +
          'This may take a few minutes. Try `!record` again after parsing completes.'
        );
        await opendota.requestParse(matchId);
        return;
      }

      await this._recordMatchData(matchStats, '', msg.author.username);

      const radiantPlayers = matchStats.players.filter((p) => p.team === 'radiant');
      const direPlayers = matchStats.players.filter((p) => p.team === 'dire');

      await this._processRatings(matchStats, radiantPlayers, direPlayers, sheetsStore, statsService);
      await this._sendMatchSummary(matchStats, '', msg.channel);

      await statusMsg.edit(`Match ${matchId} recorded successfully!`);
      await this._markRecorded(matchId, 'manual');
    } catch (err) {
      await statusMsg.edit(`Failed to record match: ${err.message}`);
    }
  }

  async _cmdRegister(msg, args) {
    if (args.length < 1) {
      return msg.reply(
        'Usage: `!register <steam_id>`\n' +
        'Your Steam64 ID is a 17-digit number (e.g. `76561198012345678`).\n' +
        'Find it at https://steamid.io'
      );
    }

    const steamId = args[0].trim();
    if (!/^\d{17}$/.test(steamId)) {
      return msg.reply(
        'That doesn\'t look like a valid Steam64 ID — it should be 17 digits (e.g. `76561198012345678`).\n' +
        'Find yours at https://steamid.io'
      );
    }

    if (BigInt(steamId) < BigInt('76561197960265728')) {
      return msg.reply('That Steam ID doesn\'t look right. Make sure you\'re using your Steam64 ID.');
    }

    try {
      const { accountId32 } = await db.registerPlayer(msg.author.id, msg.author.username, steamId);
      await msg.reply(
        `Registered! Steam ID: \`${steamId}\` (Account ID: \`${accountId32}\`)\n` +
        'Your account is now linked. Upload a `.dem` replay file in this channel to record a match.'
      );
    } catch (err) {
      await msg.reply(`Registration failed: ${err.message}`);
    }
  }

  async _promptUnregisteredRsvp(user, game) {
    // Don't DM someone we've already prompted this session
    if (this.pendingRegistrations.has(user.id)) return;

    // Check if already registered in either the players table or nicknames
    let registered = false;
    try {
      registered = await db.isDiscordRegistered(user.id);
      console.log(`[RSVP] isDiscordRegistered(${user.id} / ${user.username}): ${registered}`);
    } catch (err) {
      console.error(`[RSVP] isDiscordRegistered error for ${user.username}:`, err.message);
      return; // Fail safe — if DB check fails, don't DM
    }
    if (registered) return;

    // Not registered — DM them
    const when = new Date(game.scheduled_at).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney', weekday: 'short', month: 'short',
      day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    });
    this.pendingRegistrations.set(user.id, { gameId: game.id, step: 'awaiting_steam_id' });

    const dmUser = await this.client.users.fetch(user.id).catch(() => null);
    if (!dmUser) return;

    await dmUser.send(
      `👋 Hey **${user.username}**! You signed up for the inhouse on **${when}** AEST — nice one!\n\n` +
      `It looks like you haven't linked your Steam account yet. To show up properly on the leaderboard and stats, reply here with your **Steam64 ID** (17 digits).\n\n` +
      `📌 Find yours at: https://steamid.io\n` +
      `_(It looks like \`76561198012345678\`)_\n\n` +
      `Reply with just the number, or type \`skip\` to ignore this.`
    ).catch(() => {
      this.pendingRegistrations.delete(user.id);
    });
    console.log(`[Registration] Prompted unregistered RSVP user ${user.username} (${user.id}) for game #${game.id}`);
  }

  /**
   * Parse various Steam ID formats into a Steam64 string.
   * Returns { steamId64: '765...', format: 'steam64|steam3|steam2|url' }
   * or throws an Error with a human-readable message.
   */
  _parseSteamId(raw) {
    const MIN = BigInt('76561197960265728');
    const MAX = BigInt('76561202255233023'); // MIN + 4294967295
    const input = raw.trim();

    const validate64 = (n, label) => {
      if (n < MIN || n > MAX) {
        throw new Error(
          `❌ That ${label} doesn't correspond to a real Steam account.\n` +
          `Make sure you're copying your **Steam64 ID** (17 digits starting with \`7656\`) from https://steamid.io — not your username or profile name.`
        );
      }
      return n.toString();
    };

    // ── Steam profile URL ──────────────────────────────────────────────
    // https://steamcommunity.com/profiles/76561198012345678
    const profileUrlMatch = input.match(/steamcommunity\.com\/profiles\/(\d{17})/);
    if (profileUrlMatch) {
      return { steamId64: validate64(BigInt(profileUrlMatch[1]), 'profile URL'), format: 'url' };
    }

    // ── Vanity URL (can't resolve without API key) ─────────────────────
    // https://steamcommunity.com/id/SomeVanityName
    if (/steamcommunity\.com\/id\//i.test(input)) {
      throw new Error(
        `⚠️ That looks like a **custom Steam URL** (vanity name), not your Steam ID.\n\n` +
        `To find your real Steam64 ID:\n` +
        `1. Go to https://steamid.io\n` +
        `2. Paste your profile URL or username there\n` +
        `3. Copy the **steamID64** field (17 digits starting with \`7656\`)\n\n` +
        `Then reply here with just that number.`
      );
    }

    // ── Steam3 format: [U:1:ACCOUNTID] ────────────────────────────────
    const steam3Match = input.match(/^\[U:1:(\d+)\]$/i);
    if (steam3Match) {
      const accountId32 = BigInt(steam3Match[1]);
      return { steamId64: validate64(MIN + accountId32, 'Steam3 ID'), format: 'steam3' };
    }

    // ── Legacy Steam2 format: STEAM_X:Y:Z ─────────────────────────────
    const steam2Match = input.match(/^STEAM_[01]:([01]):(\d+)$/i);
    if (steam2Match) {
      const y = BigInt(steam2Match[1]);
      const z = BigInt(steam2Match[2]);
      return { steamId64: validate64(MIN + z * 2n + y, 'Steam2 ID'), format: 'steam2' };
    }

    // ── Plain 17-digit Steam64 ─────────────────────────────────────────
    if (/^\d{17}$/.test(input)) {
      return { steamId64: validate64(BigInt(input), 'Steam64 ID'), format: 'steam64' };
    }

    // ── Nothing matched ────────────────────────────────────────────────
    // Give targeted hints based on what they sent
    if (/^\d+$/.test(input)) {
      const len = input.length;
      if (len < 17) {
        throw new Error(
          `❌ That number is only **${len} digits** — a Steam64 ID is always **17 digits**.\n\n` +
          `You might have sent your account's short ID. To get the full Steam64:\n` +
          `1. Go to https://steamid.io\n` +
          `2. Paste your profile URL and copy the **steamID64** value.`
        );
      }
      if (len > 17) {
        throw new Error(
          `❌ That number is **${len} digits** — a Steam64 ID is always exactly **17 digits**.\n` +
          `Double-check you copied the right field from https://steamid.io`
        );
      }
    }

    throw new Error(
      `❌ I couldn't recognise that as a Steam ID. Here's what I accept:\n\n` +
      `• **Steam64 ID** → \`76561198012345678\` _(17 digits)_\n` +
      `• **Steam3 format** → \`[U:1:52079950]\`\n` +
      `• **Steam2 format** → \`STEAM_0:0:26039975\`\n` +
      `• **Profile URL** → \`https://steamcommunity.com/profiles/76561198012345678\`\n\n` +
      `Find yours at https://steamid.io — paste your profile link there and copy the **steamID64** field.\n` +
      `Or type \`skip\` to skip registration for now.`
    );
  }

  async _handleRegistrationReply(msg) {
    const session = this.pendingRegistrations.get(msg.author.id);
    if (!session) return;

    const input = msg.content.trim();

    if (input.toLowerCase() === 'skip' || input.toLowerCase() === 'cancel') {
      this.pendingRegistrations.delete(msg.author.id);
      await msg.reply(
        `No worries! You can register any time with \`!register <steam_id>\` in the Discord server. ` +
        `You're still on the RSVP list — we'll see you at the inhouse! 🎮`
      );
      return;
    }

    // Parse & validate the Steam ID (handles Steam64, Steam3, Steam2, profile URLs)
    let steamId64;
    let format;
    try {
      ({ steamId64, format } = this._parseSteamId(input));
    } catch (err) {
      await msg.reply(err.message + `\n\nOr type \`skip\` to skip for now.`);
      return;
    }

    // Show a conversion note if they used a non-standard format
    const formatNote = {
      steam3: `_(Converted from Steam3 format to \`${steamId64}\`)_\n`,
      steam2: `_(Converted from Steam2 format to \`${steamId64}\`)_\n`,
      url: `_(Extracted Steam64 ID \`${steamId64}\` from your profile URL)_\n`,
      steam64: '',
    }[format] || '';

    try {
      const { accountId32 } = await db.registerPlayer(msg.author.id, msg.author.username, steamId64);
      this.pendingRegistrations.delete(msg.author.id);
      await msg.reply(
        `✅ **You're registered!** Steam ID \`${steamId64}\` linked to your Discord account.\n` +
        formatNote +
        `\nYour stats will now appear on the leaderboard and your profile will be on the website. ` +
        `See you at the inhouse! 🎮`
      );
      console.log(`[Registration] Registered ${msg.author.username} (${msg.author.id}) via RSVP DM — Steam64: ${steamId64} (format: ${format})`);
    } catch (err) {
      if (err.message && err.message.includes('already registered')) {
        this.pendingRegistrations.delete(msg.author.id);
        await msg.reply(`Looks like that Steam ID is already registered! You're all set. 🎮`);
      } else {
        await msg.reply(
          `Something went wrong registering you: ${err.message}\n` +
          `Try again, or type \`skip\` to skip for now.`
        );
      }
    }
  }

  async _cmdPlayers(msg) {
    const players = await db.getRegisteredPlayers();
    if (players.length === 0) {
      return msg.reply('No players registered yet. Use `!register <steam_id>` to sign up!');
    }

    const list = players.map((p, i) =>
      `${i + 1}. **${p.discord_name || 'Unknown'}** - Account ID: \`${p.account_id_32}\``
    ).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('Registered Players')
      .setColor(0x00ae86)
      .setDescription(list)
      .setFooter({ text: `${players.length} player${players.length !== 1 ? 's' : ''} registered` });

    await msg.reply({ embeds: [embed] });
  }

  async _recordMatchData(matchStats, lobbyName, recordedBy) {
    const sheetsStore = getSheetsStore();
    if (sheetsStore.initialized) {
      await sheetsStore.recordMatch(matchStats, lobbyName, recordedBy);
    }
    try {
      await db.recordMatch(matchStats, lobbyName, recordedBy);
    } catch (err) {
      console.error('[DB] Record match error:', err.message);
    }
    setTimeout(() => this._initiateRatingSession(matchStats).catch(e => console.error('[Ratings] DM error:', e.message)), 3000);
    setTimeout(() => this._sendReportCardDMs(matchStats).catch(e => console.error('[ReportCard] DM error:', e.message)), 5000);
  }

  async _markRecorded(matchId, source) {
    const sheetsStore = getSheetsStore();
    if (sheetsStore.initialized) {
      await sheetsStore.markMatchRecorded(matchId, source);
    }
  }

  async _processRatings(matchStats, radiantPlayers, direPlayers, sheetsStore, statsService) {
    const radiant = radiantPlayers.map((p) => ({
      id: p.accountId.toString(),
      mu: 25,
      sigma: 8.333,
    }));
    const dire = direPlayers.map((p) => ({
      id: p.accountId.toString(),
      mu: 25,
      sigma: 8.333,
    }));

    for (const p of [...radiant, ...dire]) {
      if (p.id === '0') continue;
      const dbRating = await db.getPlayerRating(p.id);
      if (dbRating) {
        p.mu = dbRating.mu;
        p.sigma = dbRating.sigma;
      } else {
        const existing = sheetsStore.initialized ? await sheetsStore.getPlayerRating(p.id) : null;
        if (existing) {
          p.mu = existing.mu;
          p.sigma = existing.sigma;
        }
      }
    }

    const validRadiant = radiant.filter((p) => p.id !== '0');
    const validDire = dire.filter((p) => p.id !== '0');

    if (validRadiant.length === 0 || validDire.length === 0) {
      console.warn('[Ratings] Skipping ratings update - missing player account IDs.');
      return;
    }

    try {
      const newRatings = statsService.calculateNewRatings(validRadiant, validDire, matchStats.radiantWin);

      for (const r of newRatings) {
        const isRadiant = validRadiant.some((p) => p.id === r.id);
        const won = isRadiant ? matchStats.radiantWin : !matchStats.radiantWin;
        const player = matchStats.players.find((p) => p.accountId.toString() === r.id);
        const displayName = player ? (player.personaname || r.id) : r.id;
        if (sheetsStore.initialized) {
          await sheetsStore.updateRating(r.id, '', displayName, r.mu, r.sigma, r.mmr, won);
        }
        try {
          await db.updateRating(r.id, '', displayName, r.mu, r.sigma, r.mmr, won);
        } catch (err) {
          console.error('[DB] Rating update error:', err.message);
        }
      }

      console.log(`[Ratings] Updated ${newRatings.length} player ratings.`);
    } catch (err) {
      console.error('[Ratings] Update error:', err.message);
    }
  }

  async _cmdTop(msg, args) {
    const limit = Math.min(parseInt(args[0]) || 10, 25);
    const leaderboard = await db.getComputedLeaderboard(null);
    if (leaderboard.length === 0) return msg.reply('No ratings recorded yet. Play some games first!');

    const lines = leaderboard.slice(0, limit).map((p, i) => {
      const medal = i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : `${i + 1}.`;
      const name = p.nickname || p.display_name || `Player ${p.player_id}`;
      const winRate = p.games_played > 0 ? ((p.wins / p.games_played) * 100).toFixed(0) : 0;
      const tier = getMmrTier(p.mmr);
      const tierTag = tier ? ` ${tier.emoji}` : '';
      return `${medal} **${name}**${tierTag} \u2014 ${p.mmr} MMR | ${p.wins}W-${p.losses}L (${winRate}%)`;
    });

    const embed = new EmbedBuilder()
      .setTitle('\u{1F3C6} Inhouse Leaderboard')
      .setColor(0xffd700)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Top ${Math.min(limit, leaderboard.length)} players \u2022 TrueSkill MMR \u2022 \u{1F916}NPC \u{1F423}Noob \u{1F3AE}First Timer \u{1F525}Getting Warm \u{1F624}Actually Scary \u{1F451}The Guy` })
      .setTimestamp();

    await msg.reply({ embeds: [embed] });
  }

  async _cmdStats(msg, args) {
    const mentioned = msg.mentions.users.first();
    const targetUser = mentioned || msg.author;

    const registered = await db.getPlayerByDiscordId(targetUser.id);
    if (!registered) {
      const hint = targetUser.id === msg.author.id
        ? 'You\'re not registered. Use `!register <steam_id>` to link your Steam account.'
        : `${targetUser.username} hasn't registered their Steam account yet.`;
      return msg.reply(hint);
    }

    const accountId = registered.account_id_32;
    const [stats, rating, nemesisData, streak] = await Promise.all([
      db.getPlayerStats(accountId),
      db.getPlayerRating(accountId),
      db.getPlayerNemesis(accountId).catch(() => []),
      db.getPlayerCurrentStreak(accountId).catch(() => 0),
    ]);

    const avg = stats.averages || {};
    const games = parseInt(avg.total_matches) || 0;
    if (games === 0) return msg.reply(`No match data found yet for ${targetUser.username}.`);

    const wins = rating ? rating.wins : 0;
    const losses = rating ? rating.losses : 0;
    const mmr = rating ? rating.mmr : 2000;
    const winRate = games > 0 ? ((wins / games) * 100).toFixed(1) : '0';
    const kda = parseFloat(avg.avg_deaths) > 0
      ? ((parseFloat(avg.avg_kills) + parseFloat(avg.avg_assists)) / parseFloat(avg.avg_deaths)).toFixed(2)
      : (parseFloat(avg.avg_kills) + parseFloat(avg.avg_assists)).toFixed(2);

    const displayName = registered.discord_name || targetUser.username;

    let streakText = '';
    if (streak >= 3) streakText = ` \u{1F525} ${streak}W streak`;
    else if (streak <= -3) streakText = ` ${String.fromCodePoint(0x1F480)} ${Math.abs(streak)}L streak`;

    const tier = getMmrTier(mmr);
    const tierBadge = tier ? `${tier.emoji} ${tier.name}` : '';

    const embed = new EmbedBuilder()
      .setTitle(`\u{1F4CA} ${displayName}${streakText}`)
      .setColor(0x00ae86)
      .addFields(
        { name: 'Rank', value: tierBadge || 'Unranked', inline: true },
        { name: 'MMR', value: mmr.toString(), inline: true },
        { name: 'Games', value: games.toString(), inline: true },
        { name: 'Win Rate', value: `${winRate}%`, inline: true },
        { name: 'W / L', value: `${wins} / ${losses}`, inline: true },
        { name: 'Avg KDA', value: `${avg.avg_kills}/${avg.avg_deaths}/${avg.avg_assists} (${kda})`, inline: true },
        { name: 'Avg GPM', value: avg.avg_gpm?.toString() || '\u2014', inline: true },
        { name: 'Avg Damage', value: avg.avg_hero_damage ? parseInt(avg.avg_hero_damage).toLocaleString() : '\u2014', inline: true },
        { name: 'Avg Last Hits', value: avg.avg_last_hits?.toString() || '\u2014', inline: true },
      )
      .setFooter({ text: tier ? `${tier.description} \u00B7 Account ID: ${accountId}` : `Account ID: ${accountId}` })
      .setTimestamp();

    if (nemesisData && nemesisData.length > 0) {
      const nemLines = nemesisData.map((n, i) => {
        const hero = this._heroDisplayName(n.last_hero);
        return `${i + 1}. **${n.killer_name || 'Unknown'}** (${hero}) \u2014 killed you ${n.total_kills}x`;
      });
      embed.addFields({ name: '\u{1F608} Your Nemesis', value: nemLines.join('\n'), inline: false });
    }

    await msg.reply({ embeds: [embed] });
  }

  async _cmdAnalyze(msg, args) {
    const mentioned = msg.mentions.users.first();
    const targetUser = mentioned || msg.author;
    const registered = await db.getPlayerByDiscordId(targetUser.id);
    if (!registered) {
      return msg.reply(`${targetUser.id === msg.author.id ? 'You\'re' : `${targetUser.username} isn't`} not registered. Use \`!register <steam_id>\` first.`);
    }
    const accountId = registered.account_id_32;
    const [stats, rating, heroes] = await Promise.all([
      db.getPlayerStats(accountId),
      db.getPlayerRating(accountId),
      db.getPlayerHeroStats(accountId).catch(() => []),
    ]);
    const avg = stats.averages || {};
    if (!parseInt(avg.total_matches)) return msg.reply('Not enough match data to analyse yet.');

    await msg.reply('\u{1F916} Asking the AI coach\u2026');
    const blurb = await generatePlayerAnalysis({
      name: registered.discord_name || targetUser.username,
      avg,
      rating,
      recentHeroes: heroes,
    });
    if (!blurb) return msg.reply('AI analysis is unavailable right now. Try again later.');

    const embed = new EmbedBuilder()
      .setTitle(`\u{1F9E0} AI Analysis \u2014 ${registered.discord_name || targetUser.username}`)
      .setColor(0x7c3aed)
      .setDescription(blurb)
      .setFooter({ text: 'Powered by Grok (xAI)' })
      .setTimestamp();
    await msg.channel.send({ embeds: [embed] });
  }

  async _cmdRoast(msg, args) {
    const mentioned = msg.mentions.users.first();
    const targetUser = mentioned || msg.author;
    const registered = await db.getPlayerByDiscordId(targetUser.id);
    if (!registered) {
      return msg.reply(`Can't roast someone who doesn't exist in the system. Use \`!register <steam_id>\` first.`);
    }
    const accountId = registered.account_id_32;
    const [stats, rating, heroes] = await Promise.all([
      db.getPlayerStats(accountId),
      db.getPlayerRating(accountId),
      db.getPlayerHeroStats(accountId).catch(() => []),
    ]);
    const avg = stats.averages || {};
    if (!parseInt(avg.total_matches)) return msg.reply('Not enough data to roast yet — play more games!');

    await msg.reply('\u{1F608} Firing up the roast machine\u2026');
    const blurb = await generatePlayerRoast({
      name: registered.discord_name || targetUser.username,
      avg,
      rating,
      recentHeroes: heroes,
    });
    if (!blurb) return msg.reply('The roast machine broke. Probably your fault.');

    const embed = new EmbedBuilder()
      .setTitle(`\u{1F525} Roast \u2014 ${registered.discord_name || targetUser.username}`)
      .setColor(0xe05c5c)
      .setDescription(blurb)
      .setFooter({ text: 'All in good fun \u00B7 Powered by Grok (xAI)' })
      .setTimestamp();
    await msg.channel.send({ embeds: [embed] });
  }

  async _cmdHistory(msg) {
    const matches = await db.getMatchHistory(10);
    if (matches.length === 0) return msg.reply('No matches recorded yet.');

    const lines = matches.map((m) => {
      const winner = m.radiantWin ? 'Radiant' : 'Dire';
      const duration = m.duration
        ? `${Math.floor(m.duration / 60)}m${String(m.duration % 60).padStart(2, '0')}s`
        : null;
      const date = m.date ? new Date(m.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '';
      const parts = [m.lobbyName || 'Match', `${winner} Win`];
      if (duration) parts.push(duration);
      if (date) parts.push(date);
      return `**#${m.matchId}** \u2014 ${parts.join(' | ')}`;
    });

    const embed = new EmbedBuilder()
      .setTitle('Recent Matches')
      .setColor(0x00ae86)
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Last 10 matches' })
      .setTimestamp();

    await msg.reply({ embeds: [embed] });
  }

  async _cmdSteamStatus(msg) {
    const steamClient = tryGetSteamClient();
    const sheetsStore = getSheetsStore();

    const embed = new EmbedBuilder()
      .setTitle('System Status')
      .setColor(steamAvailable ? 0x00ff00 : 0xffaa00)
      .addFields(
        {
          name: 'Steam',
          value: steamClient && steamClient.isLoggedIn ? '\u2705 Connected' : '\u274c Disconnected',
          inline: true,
        },
        {
          name: 'Dota 2 GC',
          value: steamClient && steamClient.isGCReady ? '\u2705 Ready' : '\u274c Not Ready',
          inline: true,
        },
        {
          name: 'GC Invite Listeners',
          value: (() => {
            const lm = tryGetLobbyManager();
            if (!lm) return '\u274c Lobby manager unavailable';
            return lm._gcListenersSetup ? '\u2705 Active' : '\u26a0\ufe0f Not registered';
          })(),
          inline: true,
        },
        {
          name: 'Google Sheets',
          value: sheetsStore.initialized ? '\u2705 Connected' : '\u274c Not Connected',
          inline: true,
        },
        {
          name: 'OpenDota API',
          value: '\u2705 Available (no auth needed)',
          inline: true,
        },
        {
          name: 'Replay Upload',
          value: '\u2705 Available',
          inline: true,
        },
        {
          name: 'TrueSkill MMR',
          value: '\u2705 Available',
          inline: true,
        }
      )
      .setTimestamp();

    await msg.reply({ embeds: [embed] });
  }

  async _handleReplayUpload(msg, attachment) {
    const replayParser = getReplayParser();
    const sheetsStore = getSheetsStore();
    const statsService = getStatsService();

    const statusMsg = await msg.reply('Downloading replay...');

    try {
      const filename = `replay_${Date.now()}.dem`;
      const filePath = await replayParser.downloadReplay(attachment.url, filename);

      if (replayParser.parserReady) {
        await statusMsg.edit('Parsing replay for full stats (this may take a moment)...');

        try {
          const matchStats = await replayParser.parseReplayFull(filePath);

          if (!matchStats || matchStats.players.length === 0) {
            await statusMsg.edit('Replay parsed but no player data was found. The replay may be corrupted or empty.');
            replayParser.cleanup(filePath);
            return;
          }

          if (matchStats.matchId) {
            const alreadyInDb = await db.isMatchRecorded(matchStats.matchId);
            const alreadyInSheets = sheetsStore.initialized ? await sheetsStore.isMatchRecorded(matchStats.matchId) : false;
            if (alreadyInDb || alreadyInSheets) {
              await statusMsg.edit(`Match **${matchStats.matchId}** was already recorded.`);
              replayParser.cleanup(filePath);
              return;
            }
          }

          await this._recordMatchData(matchStats, '', `replay:${msg.author.username}`);

          const radiantPlayers = matchStats.players.filter((p) => p.team === 'radiant');
          const direPlayers = matchStats.players.filter((p) => p.team === 'dire');
          await this._processRatings(matchStats, radiantPlayers, direPlayers, sheetsStore, statsService);

          await this._markRecorded(matchStats.matchId, 'replay-upload');

          await statusMsg.edit(`Replay parsed! Match **${matchStats.matchId}** recorded with full stats.`);
          await this._sendMatchSummary(matchStats, 'Replay Upload', msg.channel);

          replayParser.cleanup(filePath);
          return;
        } catch (parseErr) {
          console.error('[Replay] Full parse failed:', parseErr.message);
          await msg.channel.send(`Full replay parsing failed: ${parseErr.message}. Trying header-only fallback...`);
        }
      }

      const headerData = replayParser.parseReplayHeader(filePath);
      let matchId = headerData.matchId;

      if (matchId) {
        await statusMsg.edit(`Found match ID: ${matchId}. Trying OpenDota for stats...`);
        const opendota = getOpenDota();
        const matchStats = await opendota.getMatch(matchId);
        if (matchStats) {
          await this._recordMatchData(matchStats, '', msg.author.username);
          const radiantPlayers = matchStats.players.filter((p) => p.team === 'radiant');
          const direPlayers = matchStats.players.filter((p) => p.team === 'dire');
          await this._processRatings(matchStats, radiantPlayers, direPlayers, sheetsStore, statsService);
          await this._markRecorded(matchId, 'replay-opendota');
          await this._sendMatchSummary(matchStats, 'Replay Upload', msg.channel);
        } else {
          await msg.channel.send(
            `Match ${matchId} not found on OpenDota (may be a practice lobby).\n` +
            'Full replay parser is not available. Try again later or use `!record ' + matchId + '`.'
          );
        }
      } else {
        await statusMsg.edit(
          'Could not extract match data from the replay.\n' +
          'Make sure the file is a valid Dota 2 .dem replay.'
        );
      }

      replayParser.cleanup(filePath);
    } catch (err) {
      await msg.reply(`Replay processing failed: ${err.message}`);
    }
  }

  _heroDisplayName(heroName, heroId) {
    if (!heroName) return heroId ? `Hero ${heroId}` : 'Unknown';
    const HERO_NAME_OVERRIDES = {
      nevermore: 'Shadow Fiend', zuus: 'Zeus', rattletrap: 'Clockwerk',
      furion: "Nature's Prophet", magnataur: 'Magnus', shredder: 'Timbersaw',
      obsidian_destroyer: 'Outworld Destroyer', doom_bringer: 'Doom',
      treant: 'Treant Protector', abyssal_underlord: 'Underlord', wisp: 'Io',
    };
    const slug = heroName.replace('npc_dota_hero_', '');
    if (HERO_NAME_OVERRIDES[slug]) return HERO_NAME_OVERRIDES[slug];
    return slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  _buildAwardsFromFun(fun) {
    const awards = [];
    const fmtDur = (secs) => `${Math.floor(secs / 60)}m${String(secs % 60).padStart(2, '0')}s`;

    if (fun.rampage) {
      const hero = this._heroDisplayName(fun.rampage.hero_name);
      awards.push(`\u{1F3C6} **RAMPAGE** \u2014 ${fun.rampage.name} (${hero}) in #${fun.rampage.match_id}!`);
    }
    if (fun.deathless) {
      const hero = this._heroDisplayName(fun.deathless.hero_name);
      awards.push(`\u{1F47B} **Untouchable** \u2014 ${fun.deathless.name} (${hero}) ${fun.deathless.kills}/${fun.deathless.deaths}/${fun.deathless.assists} without dying in #${fun.deathless.match_id}`);
    }
    if (fun.highKDA) {
      const k = fun.highKDA;
      awards.push(`\u{1F451} **Best KDA** \u2014 ${k.name}: ${k.kills}/${k.deaths}/${k.assists} (${parseFloat(k.kda).toFixed(2)}) in #${k.match_id}`);
    }
    if (fun.mostKills) {
      const hero = this._heroDisplayName(fun.mostKills.hero_name);
      awards.push(`\u2694\uFE0F **Slayer** \u2014 ${fun.mostKills.name} (${hero}): ${fun.mostKills.kills} kills in #${fun.mostKills.match_id}`);
    }
    if (fun.highestGPM) {
      const hero = this._heroDisplayName(fun.highestGPM.hero_name);
      awards.push(`\u{1F4B0} **Gold Machine** \u2014 ${fun.highestGPM.name} (${hero}): ${fun.highestGPM.gpm} GPM in #${fun.highestGPM.match_id}`);
    }
    if (fun.mostTowerDmg && parseInt(fun.mostTowerDmg.tower_damage) >= 5000) {
      const hero = this._heroDisplayName(fun.mostTowerDmg.hero_name);
      awards.push(`\u{1F3DB}\uFE0F **Tower Terror** \u2014 ${fun.mostTowerDmg.name} (${hero}): ${Math.round(parseInt(fun.mostTowerDmg.tower_damage) / 1000)}k tower dmg in #${fun.mostTowerDmg.match_id}`);
    }
    if (fun.mostWards && parseInt(fun.mostWards.total_wards) >= 6) {
      awards.push(`\u{1F441}\uFE0F **Vision King** \u2014 ${fun.mostWards.name}: ${fun.mostWards.obs_placed} obs + ${fun.mostWards.sen_placed} sentry in #${fun.mostWards.match_id}`);
    }
    if (fun.mostHealing && parseInt(fun.mostHealing.hero_healing) >= 3000) {
      const hero = this._heroDisplayName(fun.mostHealing.hero_name);
      awards.push(`\u{1FA79} **Lifesaver** \u2014 ${fun.mostHealing.name} (${hero}): ${Math.round(parseInt(fun.mostHealing.hero_healing) / 1000)}k healing in #${fun.mostHealing.match_id}`);
    }
    if (fun.mostStuns && parseFloat(fun.mostStuns.stun_duration) >= 15) {
      const hero = this._heroDisplayName(fun.mostStuns.hero_name);
      awards.push(`\u{1F9CA} **Perma-Stunner** \u2014 ${fun.mostStuns.name} (${hero}): ${parseFloat(fun.mostStuns.stun_duration).toFixed(0)}s of CC in #${fun.mostStuns.match_id}`);
    }
    if (fun.mostStacks && parseInt(fun.mostStacks.camps_stacked) >= 5) {
      awards.push(`\u{1F432} **Stack God** \u2014 ${fun.mostStacks.name}: ${fun.mostStacks.camps_stacked} camps stacked in #${fun.mostStacks.match_id}`);
    }
    if (fun.bestKI && parseInt(fun.bestKI.ki_pct) >= 80) {
      const hero = this._heroDisplayName(fun.bestKI.hero_name);
      awards.push(`\u{1F525} **Everywhere** \u2014 ${fun.bestKI.name} (${hero}): ${fun.bestKI.ki_pct}% kill involvement in #${fun.bestKI.match_id}`);
    }
    if (fun.mostWardKills && parseInt(fun.mostWardKills.wards_killed) >= 5) {
      awards.push(`\u{1F440} **Ward Hunter** \u2014 ${fun.mostWardKills.name}: ${fun.mostWardKills.wards_killed} wards destroyed in #${fun.mostWardKills.match_id}`);
    }
    if (fun.mostDeaths) {
      awards.push(`\u{1F480} **Sacrificial Lamb** \u2014 ${fun.mostDeaths.name}: fed ${fun.mostDeaths.deaths} times in #${fun.mostDeaths.match_id}`);
    }
    if (fun.bloodbath && parseInt(fun.bloodbath.total_kills) >= 60) {
      awards.push(`\u{1F9DF} **Bloodbath** \u2014 #${fun.bloodbath.match_id}: ${fun.bloodbath.total_kills} kills`);
    }
    if (fun.fastGame && fun.fastGame.duration < 25 * 60) {
      awards.push(`\u26A1 **Speed Run** \u2014 #${fun.fastGame.match_id} ended in ${fmtDur(fun.fastGame.duration)}`);
    }
    if (fun.slowGame && fun.slowGame.duration > 55 * 60) {
      awards.push(`\u{1F62B} **Marathon** \u2014 #${fun.slowGame.match_id} dragged to ${fmtDur(fun.slowGame.duration)}`);
    }

    return awards;
  }

  async _sendMatchSummary(matchStats, lobbyName, channel) {
    // Dedup guard — the lobby GC path and the OpenDota poller can both fire for the
    // same match; only the first call posts to Discord.
    const matchIdStr = matchStats.matchId?.toString();
    if (matchIdStr) {
      if (this._announcedMatchIds.has(matchIdStr)) {
        console.log(`[Bot] Match ${matchIdStr} already announced — skipping duplicate post.`);
        return;
      }
      this._announcedMatchIds.add(matchIdStr);
      if (this._announcedMatchIds.size > 200) {
        this._announcedMatchIds.delete(this._announcedMatchIds.values().next().value);
      }
    }

    const statsService = getStatsService();
    const radiant = matchStats.players.filter((p) => p.team === 'radiant');
    const dire = matchStats.players.filter((p) => p.team === 'dire');
    const allPlayers = matchStats.players;

    const winner = matchStats.radiantWin ? 'Radiant' : 'Dire';
    const duration = statsService.formatDuration(matchStats.duration);
    const totalKills = allPlayers.reduce((s, p) => s + (p.kills || 0), 0);

    const mvp = [...allPlayers].sort((a, b) => {
      const kdaA = a.deaths > 0 ? (a.kills + a.assists) / a.deaths : a.kills + a.assists;
      const kdaB = b.deaths > 0 ? (b.kills + b.assists) / b.deaths : b.kills + b.assists;
      return kdaB - kdaA;
    })[0];

    const goldKing = [...allPlayers].sort((a, b) => (b.goldPerMin || 0) - (a.goldPerMin || 0))[0];
    const slayer = [...allPlayers].sort((a, b) => (b.kills || 0) - (a.kills || 0))[0];
    const damage = [...allPlayers].sort((a, b) => (b.heroDamage || 0) - (a.heroDamage || 0))[0];

    const durationSecs = matchStats.duration || 0;
    let flavour = '';
    if (durationSecs < 20 * 60) flavour = '\u26A1 Lightning fast stomp!';
    else if (durationSecs > 60 * 60) flavour = '\u{1F62B} Marathon of suffering...';
    else if (totalKills >= 70) flavour = '\u{1F9DF} Bloodbath — nobody was safe.';
    else if (totalKills <= 20) flavour = '\u{1F6AB} Turtlefest — barely anyone died.';

    const titleEmoji = matchStats.radiantWin ? '\u{1F7E2}' : '\u{1F534}';
    const title = `${titleEmoji} ${winner} Victory! ${lobbyName ? `\u2014 ${lobbyName}` : ''}`;

    const formatPlayer = (p) => {
      const name = p.personaname || `ID:${p.accountId}`;
      const hero = this._heroDisplayName(p.heroName, p.heroId);
      const kda = `${p.kills}/${p.deaths}/${p.assists}`;
      const gpm = p.goldPerMin ? ` | ${p.goldPerMin}g` : '';
      const dmg = p.heroDamage ? ` | ${Math.round(p.heroDamage / 1000)}k dmg` : '';
      const supportGold = (p.supportGoldSpent || 0) >= 500
        ? ` | \u{1F441}\uFE0F ${p.supportGoldSpent}g` : '';
      return `**${name}** (${hero}) ${kda}${gpm}${dmg}${supportGold}`;
    };

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(matchStats.radiantWin ? 0x57d95a : 0xe05c5c)
      .addFields(
        { name: '\u23F1 Duration', value: duration, inline: true },
        { name: '\u2694\uFE0F Total Kills', value: totalKills.toString(), inline: true },
        { name: '\u{1F3C6} Winner', value: winner, inline: true },
      );

    if (flavour) {
      embed.addFields({ name: '\u200b', value: flavour, inline: false });
    }

    const radiantText = radiant.map(formatPlayer).join('\n');
    const direText = dire.map(formatPlayer).join('\n');
    const radiantKills = radiant.reduce((s, p) => s + (p.kills || 0), 0);
    const direKills = dire.reduce((s, p) => s + (p.kills || 0), 0);

    if (radiantText) {
      embed.addFields({
        name: `\u{1F7E2} Radiant ${matchStats.radiantWin ? '\u2705' : '\u274c'} \u2014 ${radiantKills} kills`,
        value: radiantText.slice(0, 1024),
      });
    }
    if (direText) {
      embed.addFields({
        name: `\u{1F534} Dire ${!matchStats.radiantWin ? '\u2705' : '\u274c'} \u2014 ${direKills} kills`,
        value: direText.slice(0, 1024),
      });
    }

    const highlights = [];
    const hName = (p) => p.personaname || 'Unknown';

    if (mvp) {
      const mvpKda = mvp.deaths > 0
        ? `${((mvp.kills + mvp.assists) / mvp.deaths).toFixed(2)} KDA`
        : `${mvp.kills + mvp.assists} KDA (deathless)`;
      highlights.push(`\u{1F451} **MVP:** ${hName(mvp)} (${this._heroDisplayName(mvp.heroName, mvp.heroId)}) \u2014 ${mvpKda}`);
    }
    if (goldKing && goldKing !== mvp) {
      highlights.push(`\u{1F4B0} **Gold King:** ${hName(goldKing)} \u2014 ${goldKing.goldPerMin} GPM`);
    }
    if (slayer && slayer.kills >= 10) {
      highlights.push(`\u2694\uFE0F **Slayer:** ${hName(slayer)} \u2014 ${slayer.kills} kills`);
    }
    if (damage) {
      highlights.push(`\u{1F4A5} **Top Damage:** ${hName(damage)} \u2014 ${Math.round((damage.heroDamage || 0) / 1000)}k`);
    }

    // Most Impactful — per-match kill involvement × efficiency rank
    const radiantKillsImp = radiant.reduce((s, p) => s + (p.kills || 0), 0);
    const direKillsImp    = dire.reduce((s, p) => s + (p.kills || 0), 0);
    const impactRanked = [...allPlayers]
      .map(p => {
        const teamK = p.team === 'radiant' ? radiantKillsImp : direKillsImp;
        const ki  = teamK > 0 ? ((p.kills || 0) + (p.assists || 0)) / teamK : 0;
        const eff = ((p.kills || 0) + (p.assists || 0) * 1.35) / Math.pow((p.deaths || 0) + 3, 0.85);
        return { p, score: ki * 0.5 + eff * 0.5 };
      })
      .sort((a, b) => b.score - a.score);
    const topImpact = impactRanked[0]?.p;
    if (topImpact && topImpact !== mvp) {
      highlights.push(`\u{1F3AF} **Top Impact:** ${hName(topImpact)} (${this._heroDisplayName(topImpact.heroName, topImpact.heroId)})`);
    }

    const topRampage = allPlayers.find(p => (p.rampages || 0) > 0);
    if (topRampage) {
      highlights.push(`\u{1F3C6} **RAMPAGE!** ${hName(topRampage)} (${this._heroDisplayName(topRampage.heroName, topRampage.heroId)})`);
    }

    const topWards = [...allPlayers].sort((a, b) => ((b.obsPlaced || 0) + (b.senPlaced || 0)) - ((a.obsPlaced || 0) + (a.senPlaced || 0)))[0];
    if (topWards && (topWards.obsPlaced || 0) + (topWards.senPlaced || 0) >= 6) {
      const tot = (topWards.obsPlaced || 0) + (topWards.senPlaced || 0);
      highlights.push(`\u{1F441}\uFE0F **Vision King:** ${hName(topWards)} \u2014 ${topWards.obsPlaced || 0} obs + ${topWards.senPlaced || 0} sentry (${tot})`);
    }

    const topHealer = [...allPlayers].sort((a, b) => (b.heroHealing || 0) - (a.heroHealing || 0))[0];
    if (topHealer && (topHealer.heroHealing || 0) >= 3000) {
      highlights.push(`\u{1FA79} **Lifesaver:** ${hName(topHealer)} \u2014 ${Math.round(topHealer.heroHealing / 1000)}k healing`);
    }

    const topTower = [...allPlayers].sort((a, b) => (b.towerDamage || 0) - (a.towerDamage || 0))[0];
    if (topTower && (topTower.towerDamage || 0) >= 5000) {
      highlights.push(`\u{1F3DB}\uFE0F **Tower Terror:** ${hName(topTower)} \u2014 ${Math.round(topTower.towerDamage / 1000)}k tower dmg`);
    }

    const topStun = [...allPlayers].sort((a, b) => (b.stunDuration || 0) - (a.stunDuration || 0))[0];
    if (topStun && (topStun.stunDuration || 0) >= 15) {
      highlights.push(`\u{1F9CA} **CC Machine:** ${hName(topStun)} \u2014 ${Math.round(topStun.stunDuration)}s of stuns`);
    }

    const winnerPlayers = allPlayers.filter(p => matchStats.radiantWin ? p.team === 'radiant' : p.team === 'dire');
    const winTeamKills = winnerPlayers.reduce((s, p) => s + (p.kills || 0), 0);
    if (winTeamKills >= 5) {
      const topKI = [...winnerPlayers].sort((a, b) =>
        ((b.kills + b.assists) / winTeamKills) - ((a.kills + a.assists) / winTeamKills))[0];
      const kiPct = Math.round(((topKI.kills + topKI.assists) / winTeamKills) * 100);
      if (kiPct >= 60 && topKI !== mvp) {
        highlights.push(`\u{1F525} **Everywhere:** ${hName(topKI)} \u2014 ${kiPct}% kill involvement`);
      }
    }

    // Nemesis callouts: anyone killed by the same enemy 2+ times this game
    for (const p of allPlayers) {
      if ((p.nemesisKills || 0) >= 2 && p.nemesisHeroName) {
        const nemHero = this._heroDisplayName(p.nemesisHeroName);
        highlights.push(`\u{1F608} **Nemesis:** ${hName(p)} got slapped by ${nemHero} \u00D7${p.nemesisKills}`);
      }
    }

    // Support gold recognition — highest support spender gets a callout if >= 1000g
    const topSupport = [...allPlayers].sort((a, b) => (b.supportGoldSpent || 0) - (a.supportGoldSpent || 0))[0];
    if (topSupport && (topSupport.supportGoldSpent || 0) >= 1000) {
      highlights.push(`\u{1F4B8} **Support Tax:** ${hName(topSupport)} spent ${topSupport.supportGoldSpent}g on team items`);
    }

    if (highlights.length > 0) {
      embed.addFields({ name: '\u2B50 Highlights', value: highlights.join('\n').slice(0, 1024), inline: false });
    }

    const sourceText = matchStats.parseMethod === 'odota-parser' ? 'Full replay stats' : 'Stats from OpenDota';
    embed.setFooter({ text: `Match #${matchStats.matchId} \u2022 ${sourceText} \u2022 MMR updated` }).setTimestamp();

    await channel.send({ embeds: [embed] });

    // Generate and send the scoreboard image
    ;(async () => {
      try {
        const imgBuf = await generateScoreboardImage(matchStats);
        if (imgBuf) {
          const attachment = new AttachmentBuilder(imgBuf, { name: `scoreboard_${matchStats.matchId || Date.now()}.png` });
          await channel.send({ files: [attachment] }).catch(() => {});
          // Cross-post scoreboard image to any stats channels not already receiving it
          const extraIds = config.discord.statsChannelIds.filter(id => id !== channel.id);
          for (const id of extraIds) {
            const ac = this.client.channels.cache.get(id) || await this.client.channels.fetch(id).catch(() => null);
            if (ac) await ac.send({ files: [new AttachmentBuilder(imgBuf, { name: `scoreboard_${matchStats.matchId || Date.now()}.png` })] }).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[ScoreboardImage] Send failed:', err.message);
      }
    })();

    // Cross-post match embed to any stats channels not already receiving it
    const crossPostIds = config.discord.statsChannelIds.filter(id => id !== channel.id);
    for (const id of crossPostIds) {
      const xch = this.client.channels.cache.get(id) || await this.client.channels.fetch(id).catch(() => null);
      if (xch) await xch.send({ embeds: [embed] }).catch(() => {});
    }

    // Streak callouts — runs for ALL recording paths
    ;(async () => {
      try {
        const streakCallouts = [];
        const milestones = [];
        const guild = channel.guild;
        for (const p of matchStats.players.filter(q => q.accountId && q.accountId !== 0)) {
          if (guild) {
            const rating = await db.getPlayerRating(p.accountId.toString()).catch(() => null);
            if (rating) await this._updateMmrRoles(guild, p.accountId.toString(), rating.mmr).catch(() => {});
          }
          const streak = await db.getPlayerCurrentStreak(p.accountId).catch(() => 0);
          const name = p.personaname || `ID:${p.accountId}`;
          const fire = '\u{1F525}';
          const skull = '\u{1F480}';
          const trophy = '\u{1F3C6}';
          if (streak === 10) {
            milestones.push(`${trophy}${fire}${trophy} **LEGENDARY! ${name} just hit a 10-GAME WIN STREAK!** ${trophy}${fire}${trophy}`);
          } else if (streak === 5) {
            milestones.push(`${fire}${fire}${fire} **${name} is on FIRE \u2014 5-game win streak!** ${fire}${fire}${fire}`);
          } else if (streak >= 3) {
            streakCallouts.push(`${fire} **${name}** is on a **${streak}-game win streak!**`);
          } else if (streak === -10) {
            milestones.push(`${skull}${skull}${skull} **${name} has lost 10 in a row...** someone help them.`);
          } else if (streak === -5) {
            milestones.push(`${skull}${skull} **${name}** is on a brutal 5-game losing skid. F.`);
          } else if (streak <= -3) {
            streakCallouts.push(`${skull} **${name}** is on a **${Math.abs(streak)}-game losing streak...**`);
          }
        }
        for (const m of milestones) {
          await channel.send(m).catch(() => {});
        }
        if (streakCallouts.length > 0) {
          await channel.send(`\u{1F3C6} **Streak Watch:**\n${streakCallouts.join('\n')}`).catch(() => {});
        }
      } catch (err) {
        console.error('[Bot] Streak callout failed:', err.message);
      }
    })();

    // Fire AI commentary async — don't block match recording
    const topDamage = [...allPlayers].sort((a, b) => (b.heroDamage || 0) - (a.heroDamage || 0))[0];
    const topRampageAi = allPlayers.find(p => (p.rampages || 0) > 0);
    const radiantKillsAi = radiant.reduce((s, p) => s + (p.kills || 0), 0);
    const direKillsAi = dire.reduce((s, p) => s + (p.kills || 0), 0);
    const loserKills = matchStats.radiantWin ? direKillsAi : radiantKillsAi;
    const winnerKills = matchStats.radiantWin ? radiantKillsAi : direKillsAi;
    const isBlowout = winnerKills >= 3 * Math.max(loserKills, 1);
    const mvpKdaVal = mvp
      ? (mvp.deaths > 0 ? `${((mvp.kills + mvp.assists) / mvp.deaths).toFixed(2)}` : `${mvp.kills + mvp.assists} (deathless)`)
      : null;

    ;(async () => {
      try {
        const [mvpBlurb, narrative] = await Promise.all([
          mvp ? generateMatchMvpBlurb({
            name: mvp.personaname || 'Unknown',
            heroName: this._heroDisplayName(mvp.heroName, mvp.heroId),
            kills: mvp.kills,
            deaths: mvp.deaths,
            assists: mvp.assists,
            damage: mvp.heroDamage,
            gpm: mvp.goldPerMin,
            team: mvp.team,
          }) : Promise.resolve(null),
          generateMatchNarrative({
            winner: matchStats.radiantWin ? 'Radiant' : 'Dire',
            durationMins: Math.floor((matchStats.duration || 0) / 60),
            totalKills,
            mvpName: mvp ? (mvp.personaname || 'Unknown') : null,
            mvpHero: mvp ? this._heroDisplayName(mvp.heroName, mvp.heroId) : null,
            mvpKda: mvpKdaVal,
            topDamager: topDamage ? (topDamage.personaname || 'Unknown') : null,
            topDamage: topDamage?.heroDamage,
            hasRampage: !!topRampageAi,
            rampageName: topRampageAi ? (topRampageAi.personaname || 'Unknown') : null,
            isBlowout,
            radiantKills: radiantKillsAi,
            direKills: direKillsAi,
            loserTeam: matchStats.radiantWin ? 'Dire' : 'Radiant',
          }),
        ]);
        const parts = [mvpBlurb, narrative].filter(Boolean);
        if (parts.length > 0) {
          await channel.send(`\u{1F916} **AI Commentary**\n${parts.join('\n\n')}`).catch(() => {});
        }
      } catch (err) {
        console.error('[Grok] Post-match commentary failed:', err.message);
      }
    })();
  }

  async _cmdHeroStats(msg, args) {
    if (args.length === 0) return msg.reply('Usage: `!herostats <hero name>` e.g. `!herostats pudge`');
    const query = args.join(' ').toLowerCase().replace(/\s+/g, '_');
    const allHeroes = await db.getHeroStats(null);

    const match = allHeroes.find(h => {
      const name = (h.hero_name || '').toLowerCase().replace('npc_dota_hero_', '');
      return name.includes(query) || query.includes(name.replace(/_/g, ''));
    });

    if (!match) {
      return msg.reply(`Couldn't find a hero matching \`${args.join(' ')}\`. Check the spelling and try again.`);
    }

    const heroDisplay = this._heroDisplayName(match.hero_name, match.hero_id);
    const winRate = match.games > 0 ? ((match.wins / match.games) * 100).toFixed(1) : '0';

    const topPlayersText = (match.top_players || []).slice(0, 5).map((p, i) => {
      const medal = ['\u{1F947}', '\u{1F948}', '\u{1F949}'][i] || `${i + 1}.`;
      const pr = match.games > 0 ? ((p.games / match.games) * 100).toFixed(0) : '0';
      return `${medal} **${p.name}** \u2014 ${p.wins}W/${p.games - p.wins}L (${((p.wins / p.games) * 100).toFixed(0)}% WR)`;
    }).join('\n') || 'Not enough data';

    const embed = new EmbedBuilder()
      .setTitle(`\u{1F9B8} ${heroDisplay} Stats`)
      .setColor(0x9b59b6)
      .addFields(
        { name: 'Matches Played', value: match.games.toString(), inline: true },
        { name: 'Win Rate', value: `${winRate}%`, inline: true },
        { name: 'Wins / Losses', value: `${match.wins} / ${match.games - match.wins}`, inline: true },
        { name: '\u{1F3C6} Top Players on this Hero', value: topPlayersText, inline: false },
      )
      .setFooter({ text: 'All time inhouse stats' })
      .setTimestamp();

    await msg.reply({ embeds: [embed] });
  }

  async _cmdVs(msg, args) {
    const mentioned = msg.mentions.users.first();
    if (!mentioned) return msg.reply('Usage: `!vs @player` — mention who you want to check your record against.');
    if (mentioned.id === msg.author.id) return msg.reply('You can\'t check a record against yourself!');

    const [myReg, theirReg] = await Promise.all([
      db.getPlayerByDiscordId(msg.author.id),
      db.getPlayerByDiscordId(mentioned.id),
    ]);

    if (!myReg) return msg.reply('You\'re not registered. Use `!register <steam_id>` to link your account.');
    if (!theirReg) return msg.reply(`${mentioned.username} hasn't registered their Steam account yet.`);

    const h2h = await db.getHeadToHead(myReg.account_id_32, theirReg.account_id_32, null);

    if (h2h.total === 0) {
      return msg.reply(`You and ${mentioned.username} have never been on opposing teams in a recorded match.`);
    }

    const myName = myReg.discord_name || msg.author.username;
    const theirName = theirReg.discord_name || mentioned.username;
    const myWinRate = ((h2h.a_wins / h2h.total) * 100).toFixed(0);

    let verdict = '';
    if (h2h.a_wins > h2h.b_wins) verdict = `\u{1F4AA} **${myName}** has the edge.`;
    else if (h2h.b_wins > h2h.a_wins) verdict = `\u{1F62D} **${theirName}** has the upper hand.`;
    else verdict = '\u{1F91D} Dead even.';

    const recentLines = h2h.matches.slice(0, 5).map(m => {
      const myWon = (m.a_team === 'radiant' && m.radiant_win) || (m.a_team === 'dire' && !m.radiant_win);
      const result = myWon ? '\u2705 Win' : '\u274c Loss';
      const date = m.date ? new Date(m.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '?';
      return `${result} — #${m.match_id} (${date})`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle(`\u2694\uFE0F ${myName} vs ${theirName}`)
      .setColor(0xe67e22)
      .addFields(
        { name: `${myName} wins`, value: h2h.a_wins.toString(), inline: true },
        { name: `${theirName} wins`, value: h2h.b_wins.toString(), inline: true },
        { name: 'Total matches', value: h2h.total.toString(), inline: true },
        { name: 'Verdict', value: verdict, inline: false },
        { name: 'Recent Results', value: recentLines || 'None', inline: false },
      )
      .setFooter({ text: 'Head-to-head \u2022 opposing teams only' })
      .setTimestamp();

    await msg.reply({ embeds: [embed] });
  }

  async _cmdMatch(msg, args) {
    if (!args[0]) return msg.reply('Usage: `!match <match_id>`');
    const matchId = parseInt(args[0]);
    if (isNaN(matchId)) return msg.reply('Please provide a valid match ID number.');

    const match = await db.getMatch(matchId);
    if (!match) return msg.reply(`Match #${matchId} not found.`);

    const radiant = (match.players || []).filter(p => p.team === 'radiant');
    const dire = (match.players || []).filter(p => p.team === 'dire');
    const duration = match.duration
      ? `${Math.floor(match.duration / 60)}m${String(match.duration % 60).padStart(2, '0')}s`
      : '?';
    const date = match.date ? new Date(match.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '?';

    const formatLine = (p) => {
      const name = p.nickname || p.persona_name || `ID:${p.account_id}`;
      const hero = this._heroDisplayName(p.hero_name, p.hero_id);
      const kda = `${p.kills}/${p.deaths}/${p.assists}`;
      const gpm = p.gpm ? ` ${p.gpm}GPM` : '';
      return `**${name}** (${hero}) ${kda}${gpm}`;
    };

    const radiantText = radiant.length > 0 ? radiant.map(formatLine).join('\n') : 'No data';
    const direText = dire.length > 0 ? dire.map(formatLine).join('\n') : 'No data';
    const winner = match.radiant_win ? 'Radiant' : 'Dire';

    const embed = new EmbedBuilder()
      .setTitle(`Match #${matchId} \u2014 ${winner} Victory`)
      .setColor(match.radiant_win ? 0x57d95a : 0xe05c5c)
      .addFields(
        { name: '\u23F1 Duration', value: duration, inline: true },
        { name: '\u{1F4C5} Date', value: date, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: '\u{1F7E2} Radiant', value: radiantText.slice(0, 1024), inline: false },
        { name: '\u{1F534} Dire', value: direText.slice(0, 1024), inline: false },
      )
      .setFooter({ text: `Match ID: ${matchId}` })
      .setTimestamp();

    await msg.reply({ embeds: [embed] });
  }

  async _cmdRecap(msg) {
    try {
      const [recap, fun] = await Promise.all([
        db.getWeeklyRecap(null),
        db.getFunRecapStats(null),
      ]);
      const { matches, top_performers } = recap;

      if (!matches || matches.length === 0) {
        return msg.reply('No matches played in the last 7 days!');
      }

      const radiantWins = matches.filter(m => m.radiant_win).length;
      const direWins = matches.length - radiantWins;
      const totalDuration = matches.reduce((s, m) => s + (m.duration || 0), 0);
      const avgDuration = matches.length > 0 ? Math.round(totalDuration / matches.length) : 0;
      const avgDurStr = avgDuration > 0
        ? `${Math.floor(avgDuration / 60)}m${String(avgDuration % 60).padStart(2, '0')}s`
        : '?';

      const aiBlurb = await generateWeeklyRecapBlurb({
        matches,
        topPerformers: top_performers,
        fun,
      });

      const embed = new EmbedBuilder()
        .setTitle('\u{1F4CA} Weekly Recap')
        .setColor(0x3b82f6)
        .addFields({
          name: `\u{1F3AE} ${matches.length} match${matches.length !== 1 ? 'es' : ''} this week`,
          value: `\u{1F7E2} Radiant ${radiantWins} \u2013 ${direWins} Dire \u{1F534}  \u2022  Avg game: ${avgDurStr}`,
          inline: false,
        });

      if (aiBlurb) {
        embed.addFields({ name: '\u{1F916} AI Recap', value: aiBlurb.slice(0, 1024), inline: false });
      }

      if (top_performers && top_performers.length > 0) {
        const topLines = top_performers.slice(0, 5).map((p, i) => {
          const kda = parseFloat(p.avg_kda).toFixed(2);
          const gpm = Math.round(parseFloat(p.avg_gpm));
          const medal = ['\u{1F947}', '\u{1F948}', '\u{1F949}'][i] || `${i + 1}.`;
          return `${medal} **${p.player_name}** \u2014 ${kda} KDA | ${gpm} GPM | ${p.games} games`;
        });
        embed.addFields({
          name: '\u2B50 Top Performers (KDA)',
          value: topLines.join('\n'),
          inline: false,
        });
      }

      const [potw, cotw] = await Promise.all([
        db.getPlayerOfWeek(7).catch(() => null),
        db.getCurseOfWeek(7).catch(() => null),
      ]);

      if (potw) {
        embed.addFields({
          name: '\u{1F451} Player of the Week',
          value: `**${potw.player_name}** — ${potw.wins}W/${parseInt(potw.games) - parseInt(potw.wins)}L in ${potw.games} games · ${parseFloat(potw.avg_kda).toFixed(2)} avg KDA`,
          inline: false,
        });
      }
      if (cotw) {
        embed.addFields({
          name: '\u{1F480} Curse of the Week',
          value: `**${cotw.player_name}** — ${cotw.total_deaths} deaths in ${cotw.games} games`,
          inline: false,
        });
      }

      const awards = this._buildAwardsFromFun(fun);
      if (awards.length > 0) {
        const chunks = [];
        let chunk = '';
        for (const a of awards) {
          if ((chunk + '\n' + a).length > 1024) { chunks.push(chunk); chunk = a; }
          else chunk = chunk ? chunk + '\n' + a : a;
        }
        if (chunk) chunks.push(chunk);
        chunks.forEach((c, i) => embed.addFields({
          name: i === 0 ? '\u{1F3C5} Awards' : '\u200b',
          value: c, inline: false,
        }));
      }

      embed.setFooter({ text: 'Last 7 days \u2022 Use !top for full leaderboard' }).setTimestamp();
      await msg.reply({ embeds: [embed] });

      // Save to DB so the landing page can display the latest recap
      try {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        await db.saveWeeklyRecap({
          matchesCount: matches.length,
          aiBlurb: aiBlurb || null,
          topPerformers: top_performers || [],
          funHighlights: fun || {},
          periodStart: weekAgo,
          periodEnd: new Date(),
        });
      } catch (saveErr) {
        console.error('[Discord] Failed to save recap to DB:', saveErr.message);
      }
    } catch (err) {
      console.error('[Discord] Recap error:', err);
      await msg.reply('Failed to fetch weekly recap.');
    }
  }

  async _updateMmrRoles(guild, playerId, mmr) {
    const tiers = config.discord.mmrRoles.tiers.filter(t => t.roleId);
    if (tiers.length === 0) return;

    const players = await db.getRegisteredPlayers();
    const player = players.find(p => p.account_id_32 === playerId?.toString());
    if (!player?.discord_id) return;

    const member = await guild.members.fetch(player.discord_id).catch(() => null);
    if (!member) return;

    const targetTier = tiers.find(t => mmr >= t.min);
    const allRoleIds = tiers.map(t => t.roleId).filter(Boolean);

    const toRemove = member.roles.cache.filter(r => allRoleIds.includes(r.id));
    if (toRemove.size > 0) await member.roles.remove(toRemove).catch(() => {});
    if (targetTier?.roleId) await member.roles.add(targetTier.roleId).catch(() => {});
  }

  async _postWeeklyRecap() {
    const channelId = config.discord.weeklyRecapChannelId
      || (config.discord.statsChannelIds.length > 0 ? config.discord.statsChannelIds[0] : null)
      || config.discord.announceChannelId;
    if (!channelId) return;
    let channel = this.client.channels.cache.get(channelId);
    if (!channel) channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    try {
      const [recap, fun] = await Promise.all([
        db.getWeeklyRecap(null),
        db.getFunRecapStats(null),
      ]);
      const { matches, top_performers } = recap;
      if (!matches || matches.length === 0) return;

      const radiantWins = matches.filter(m => m.radiant_win).length;
      const direWins = matches.length - radiantWins;
      const totalDuration = matches.reduce((s, m) => s + (m.duration || 0), 0);
      const avgDuration = matches.length > 0 ? Math.round(totalDuration / matches.length) : 0;
      const avgDurStr = avgDuration > 0
        ? `${Math.floor(avgDuration / 60)}m${String(avgDuration % 60).padStart(2, '0')}s`
        : '?';

      const aiBlurb = await generateWeeklyRecapBlurb({
        matches,
        topPerformers: top_performers,
        fun,
      });

      // Save recap to DB for display on landing page
      try {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        await db.saveWeeklyRecap({
          matchesCount: matches.length,
          aiBlurb: aiBlurb || null,
          topPerformers: top_performers || [],
          funHighlights: fun || {},
          periodStart: weekAgo,
          periodEnd: new Date(),
        });
      } catch (saveErr) {
        console.error('[Discord] Failed to save weekly recap to DB:', saveErr.message);
      }

      const embed = new EmbedBuilder()
        .setTitle('\u{1F4CA} Weekly Recap \u2014 Automated')
        .setColor(0x3b82f6)
        .addFields({
          name: `\u{1F3AE} ${matches.length} match${matches.length !== 1 ? 'es' : ''} this week`,
          value: `\u{1F7E2} Radiant ${radiantWins} \u2013 ${direWins} Dire \u{1F534}  \u2022  Avg game: ${avgDurStr}`,
          inline: false,
        });

      if (aiBlurb) {
        embed.addFields({ name: '\u{1F916} AI Recap', value: aiBlurb.slice(0, 1024), inline: false });
      }

      if (top_performers?.length > 0) {
        const topLines = top_performers.slice(0, 5).map((p, i) => {
          const kda = parseFloat(p.avg_kda).toFixed(2);
          const gpm = Math.round(parseFloat(p.avg_gpm));
          const medal = ['\u{1F947}', '\u{1F948}', '\u{1F949}'][i] || `${i + 1}.`;
          return `${medal} **${p.player_name}** \u2014 ${kda} KDA | ${gpm} GPM | ${p.games} games`;
        });
        embed.addFields({ name: '\u2B50 Top Performers', value: topLines.join('\n'), inline: false });
      }

      const [potw, cotw] = await Promise.all([
        db.getPlayerOfWeek(7).catch(() => null),
        db.getCurseOfWeek(7).catch(() => null),
      ]);

      if (potw) {
        embed.addFields({
          name: '\u{1F451} Player of the Week',
          value: `**${potw.player_name}** — ${potw.wins}W/${parseInt(potw.games) - parseInt(potw.wins)}L in ${potw.games} games · ${parseFloat(potw.avg_kda).toFixed(2)} avg KDA`,
          inline: false,
        });
      }
      if (cotw) {
        embed.addFields({
          name: '\u{1F480} Curse of the Week',
          value: `**${cotw.player_name}** — ${cotw.total_deaths} deaths in ${cotw.games} games`,
          inline: false,
        });
      }

      const awards = this._buildAwardsFromFun(fun);
      if (awards.length > 0) {
        const chunks = [];
        let chunk = '';
        for (const a of awards) {
          if ((chunk + '\n' + a).length > 1024) { chunks.push(chunk); chunk = a; }
          else chunk = chunk ? chunk + '\n' + a : a;
        }
        if (chunk) chunks.push(chunk);
        chunks.forEach((c, i) => embed.addFields({
          name: i === 0 ? '\u{1F3C5} Awards' : '\u200b',
          value: c, inline: false,
        }));
      }
      embed.setFooter({ text: 'Use !top for full leaderboard' }).setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[Discord] Weekly recap post error:', err.message);
    }
  }

  async _cmdPredict(msg, args) {
    if (!args || args.length < 2) {
      return msg.reply(
        '**Usage:** `!predict <matchId> <radiant|dire>`\n' +
        'Example: `!predict 12345 radiant` — predict Radiant wins match 12345.\n' +
        'Use `!predictions <matchId>` to see current predictions.'
      );
    }
    const matchId = parseInt(args[0]);
    const side = args[1]?.toLowerCase();
    if (isNaN(matchId)) return msg.reply('Invalid match ID.');
    if (!['radiant', 'dire'].includes(side)) return msg.reply('Specify `radiant` or `dire`.');

    const discordUser = msg.author;
    const predictorName = discordUser.username;

    let predictorAccountId = null;
    try {
      const player = await db.getPlayerByDiscordId(discordUser.id);
      if (player) predictorAccountId = player.account_id;
    } catch (_) {}

    await db.upsertMatchPrediction(matchId, predictorAccountId, predictorName, side);

    const sideEmoji = side === 'radiant' ? '🟢' : '🔴';
    const embed = new EmbedBuilder()
      .setTitle('🎯 Prediction Submitted')
      .setColor(side === 'radiant' ? 0x4caf50 : 0xf44336)
      .setDescription(`**${predictorName}** predicts ${sideEmoji} **${side.charAt(0).toUpperCase() + side.slice(1)}** wins match **#${matchId}**.`)
      .setFooter({ text: `Use !predictions ${matchId} to see all picks` });
    await msg.channel.send({ embeds: [embed] });
  }

  async _cmdPredictions(msg, args) {
    if (!args || !args[0]) {
      return msg.reply('**Usage:** `!predictions <matchId>` — Show all predictions for a match.');
    }
    const matchId = parseInt(args[0]);
    if (isNaN(matchId)) return msg.reply('Invalid match ID.');

    const preds = await db.getMatchPredictions(matchId);
    if (!preds || preds.length === 0) {
      return msg.reply(`No predictions recorded for match **#${matchId}** yet. Use \`!predict ${matchId} radiant\` or \`!predict ${matchId} dire\` to submit yours!`);
    }

    const radiant = preds.filter(p => p.predicted_winner === 'radiant');
    const dire = preds.filter(p => p.predicted_winner === 'dire');
    const resolved = preds.some(p => p.resolved);

    const radiantList = radiant.map(p => {
      if (!resolved) return p.predictor_name;
      return `${p.predictor_name}${p.correct ? ' ✅' : ' ❌'}`;
    }).join(', ') || '*none*';
    const direList = dire.map(p => {
      if (!resolved) return p.predictor_name;
      return `${p.predictor_name}${p.correct ? ' ✅' : ' ❌'}`;
    }).join(', ') || '*none*';

    const embed = new EmbedBuilder()
      .setTitle(`🎯 Predictions — Match #${matchId}`)
      .setColor(0x3b82f6)
      .addFields(
        { name: `🟢 Radiant (${radiant.length})`, value: radiantList, inline: true },
        { name: `🔴 Dire (${dire.length})`, value: direList, inline: true },
      );

    if (resolved) {
      const winner = preds.find(p => p.correct)?.predicted_winner;
      embed.addFields({ name: 'Result', value: winner ? `${winner === 'radiant' ? '🟢' : '🔴'} **${winner}** won!` : 'Match result recorded.', inline: false });
    } else {
      embed.setFooter({ text: 'Predictions locked in — results revealed when match is recorded.' });
    }

    await msg.channel.send({ embeds: [embed] });
  }

  async _cmdRank(msg, args) {
    const targetUser = msg.mentions.users.first() || msg.author;
    const reg = await db.getPlayerByDiscordId(targetUser.id);
    if (!reg) {
      const isSelf = targetUser.id === msg.author.id;
      return msg.reply(isSelf
        ? 'You\'re not registered. Use `!register <steam_id>` first.'
        : `${targetUser.username} hasn't registered their Steam account yet.`);
    }
    const [rating, leaderboard] = await Promise.all([
      db.getPlayerRating(reg.account_id_32),
      db.getLeaderboard(200),
    ]);
    if (!rating) return msg.reply(`No rating data found for ${targetUser.username} yet.`);

    const pos = leaderboard.findIndex(r => r.player_id?.toString() === reg.account_id_32?.toString()) + 1;
    const tier = getMmrTier(rating.mmr);
    const tiers = config.discord.mmrRoles.tiers;
    const currentTierIdx = tiers.findIndex(t => t.min <= rating.mmr && (!tiers[tiers.indexOf(t) - 1] || tiers[tiers.indexOf(t) - 1].min > rating.mmr));
    const nextTier = tiers.slice().reverse().find(t => t.min > rating.mmr);
    const gapText = nextTier ? `**${nextTier.min - rating.mmr} MMR** to reach ${nextTier.emoji} ${nextTier.name}` : '🎩 Peak tier achieved';
    const winRate = (rating.wins + rating.losses) > 0 ? ((rating.wins / (rating.wins + rating.losses)) * 100).toFixed(0) : '0';

    const embed = new EmbedBuilder()
      .setTitle(`${tier.emoji} ${reg.display_name || targetUser.username} — Rank`)
      .setColor(0x6366f1)
      .addFields(
        { name: 'MMR', value: `**${rating.mmr}**`, inline: true },
        { name: 'Tier', value: `${tier.emoji} ${tier.name}`, inline: true },
        { name: 'Leaderboard', value: pos > 0 ? `#${pos} of ${leaderboard.length}` : 'Unranked', inline: true },
        { name: 'Record', value: `${rating.wins}W — ${rating.losses}L (${winRate}% WR)`, inline: true },
        { name: 'Next milestone', value: gapText, inline: false },
      )
      .setFooter({ text: 'Use !top for the full leaderboard' });
    await msg.reply({ embeds: [embed] });
  }

  async _cmdRematch(msg) {
    const lastMatch = await db.getLastMatchPlayers();
    if (!lastMatch || lastMatch.players.length === 0) {
      return msg.reply('No recent match found to rematch.');
    }

    const allAccounts = [];
    for (const p of lastMatch.players) {
      const rating = await db.getPlayerRating(p.account_id?.toString()).catch(() => null);
      allAccounts.push({ name: p.display_name || p.persona_name || `ID:${p.account_id}`, mmr: rating ? rating.mmr : 2600 });
    }

    if (allAccounts.length < 2) return msg.reply('Not enough players in the last match.');

    const n = allAccounts.length;
    const half = Math.floor(n / 2);
    const indices = Array.from({ length: n }, (_, i) => i);

    function combinations(arr, k) {
      if (k === 0) return [[]];
      if (arr.length < k) return [];
      const [first, ...rest] = arr;
      return [...combinations(rest, k - 1).map(c => [first, ...c]), ...combinations(rest, k)];
    }

    const combos = combinations(indices, half);
    let bestDiff = Infinity, bestTeamA = [], bestTeamB = [];
    for (const comboA of combos) {
      const comboB = indices.filter(i => !comboA.includes(i));
      const mmrA = comboA.reduce((s, i) => s + allAccounts[i].mmr, 0);
      const mmrB = comboB.reduce((s, i) => s + allAccounts[i].mmr, 0);
      const diff = Math.abs(mmrA - mmrB);
      if (diff < bestDiff) { bestDiff = diff; bestTeamA = comboA.map(i => allAccounts[i]); bestTeamB = comboB.map(i => allAccounts[i]); }
    }

    const fmtTeam = (team) => team.map(p => `**${p.name}** (${p.mmr})`).join('\n');
    const avgA = Math.round(bestTeamA.reduce((s, p) => s + p.mmr, 0) / bestTeamA.length);
    const avgB = Math.round(bestTeamB.reduce((s, p) => s + p.mmr, 0) / bestTeamB.length);

    const embed = new EmbedBuilder()
      .setTitle(`\u267B\uFE0F Rematch — Match #${lastMatch.matchId}`)
      .setColor(0x6366f1)
      .setDescription(`Rebalanced from the last game's ${allAccounts.length} players | MMR diff: **${bestDiff}**`)
      .addFields(
        { name: `\u{1F7E2} Team A — avg ${avgA} MMR`, value: fmtTeam(bestTeamA) || 'None', inline: true },
        { name: `\u{1F534} Team B — avg ${avgB} MMR`, value: fmtTeam(bestTeamB) || 'None', inline: true },
      )
      .setFooter({ text: 'Coin flip for sides!' });
    await msg.channel.send({ embeds: [embed] });
  }

  async _cmdMeta(msg, args) {
    const days = parseInt(args[0]) || 7;
    const capped = Math.min(days, 90);
    const rows = await db.getHeroMetaWeek(capped);
    if (!rows || rows.length === 0) return msg.reply(`No hero data in the last ${capped} days.`);

    const lines = rows.slice(0, 10).map((h, i) => {
      const heroName = (h.hero_name || '').replace('npc_dota_hero_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const wr = h.picks > 0 ? ((parseInt(h.wins) / parseInt(h.picks)) * 100).toFixed(0) : '0';
      const bar = wr >= 60 ? '🟢' : wr >= 45 ? '🟡' : '🔴';
      const medal = ['\u{1F947}', '\u{1F948}', '\u{1F949}'][i] || `${i + 1}.`;
      return `${medal} **${heroName}** — ${h.picks} picks · ${wr}% WR ${bar}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`\u{1F4CA} Hero Meta — Last ${capped} Days`)
      .setColor(0x9b59b6)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Top 10 most-picked heroes · Use !meta 30 for last 30 days` });
    await msg.reply({ embeds: [embed] });
  }

  async _cmdMyStats(msg) {
    const reg = await db.getPlayerByDiscordId(msg.author.id);
    if (!reg) return msg.reply('You\'re not registered. Use `!register <steam_id>` to link your account.');

    const [stats, rating, streak] = await Promise.all([
      db.getPlayerStats(reg.account_id_32, null),
      db.getPlayerRating(reg.account_id_32),
      db.getPlayerCurrentStreak(reg.account_id_32).catch(() => 0),
    ]);

    if (!rating) return msg.reply('No stats found yet — play some matches first!');

    const tier = getMmrTier(rating.mmr);
    const winRate = (rating.wins + rating.losses) > 0 ? ((rating.wins / (rating.wins + rating.losses)) * 100).toFixed(0) : '0';
    const kda = stats?.avg_deaths > 0 ? ((parseFloat(stats.avg_kills || 0) + parseFloat(stats.avg_assists || 0)) / parseFloat(stats.avg_deaths)).toFixed(2) : 'Perfect';
    const streakText = streak > 0 ? `\u{1F525} ${streak}W streak` : streak < 0 ? `\u{1F480} ${Math.abs(streak)}L streak` : 'No streak';

    const embed = new EmbedBuilder()
      .setTitle(`\u{1F4CA} ${reg.display_name || msg.author.username} — Personal Stats`)
      .setColor(0x3b82f6)
      .addFields(
        { name: 'MMR', value: `**${rating.mmr}** ${tier.emoji} ${tier.name}`, inline: true },
        { name: 'Record', value: `${rating.wins}W—${rating.losses}L (${winRate}% WR)`, inline: true },
        { name: 'Streak', value: streakText, inline: true },
        { name: 'Avg K/D/A', value: stats ? `${parseFloat(stats.avg_kills||0).toFixed(1)}/${parseFloat(stats.avg_deaths||0).toFixed(1)}/${parseFloat(stats.avg_assists||0).toFixed(1)}` : '—', inline: true },
        { name: 'KDA Ratio', value: `${kda}`, inline: true },
        { name: 'Avg GPM', value: stats ? `${Math.round(parseFloat(stats.avg_gpm||0))}` : '—', inline: true },
      )
      .setFooter({ text: 'Full profile at the web dashboard · !reportcard off to stop post-game DMs' });

    try {
      await msg.author.send({ embeds: [embed] });
      await msg.reply('\u{1F4EC} Sent your stats to your DMs!');
    } catch {
      await msg.reply({ embeds: [embed] });
    }
  }

  async _cmdReportCard(msg, args) {
    const sub = (args[0] || '').toLowerCase();
    if (sub !== 'on' && sub !== 'off') {
      const current = await db.getPlayerReportCardOptOut(msg.author.id);
      return msg.reply(
        `Post-match report card DMs are currently **${current ? 'ON \u2705' : 'OFF'}** for you.\n` +
        `Use \`!reportcard on\` to opt in, or \`!reportcard off\` to opt out.\n` +
        `_The report card DMs you a personal stats summary after each inhouse match._`
      );
    }
    const optIn = sub === 'on';
    await db.setPlayerReportCardOptOut(msg.author.id, optIn);
    return msg.reply(optIn
      ? '\u2705 You\'ve opted **in** — you\'ll receive a personal stats DM after each match you play.'
      : '\u274C You\'ve opted **out** of post-match report card DMs.');
  }

  async _cmdRatings(msg, args) {
    const sub = (args[0] || '').toLowerCase();
    if (sub !== 'on' && sub !== 'off') {
      const current = await db.getPlayerRatingsOptOut(msg.author.id);
      return msg.reply(
        `Post-match teammate rating DMs are currently **${current ? 'OFF \u274C' : 'ON \u2705'}** for you.\n` +
        `Use \`!ratings off\` to stop getting MVP/attitude vote requests after matches.\n` +
        `Use \`!ratings on\` to turn them back on.`
      );
    }
    const optOut = sub === 'off';
    await db.setPlayerRatingsOptOut(msg.author.id, optOut);
    return msg.reply(optOut
      ? '\u274C You\'ve opted **out** of post-match teammate rating DMs.'
      : '\u2705 You\'ve opted **in** to post-match teammate rating DMs.');
  }

  async _sendReportCardDMs(matchStats) {
    if (!matchStats?.players || matchStats.players.length === 0) return;
    const registeredPlayers = await db.getRegisteredPlayers().catch(() => []);

    for (const player of matchStats.players) {
      try {
        const reg = registeredPlayers.find(r =>
          r.account_id_32?.toString() === player.accountId?.toString() ||
          r.account_id_64?.toString() === player.accountId?.toString()
        );
        if (!reg?.discord_id) continue;

        const optedIn = await db.getPlayerReportCardOptOut(reg.discord_id).catch(() => false);
        if (!optedIn) continue;

        const user = await this.client.users.fetch(reg.discord_id).catch(() => null);
        if (!user) continue;

        const won = (player.team === 'radiant' && matchStats.radiantWin) ||
                    (player.team === 'dire' && !matchStats.radiantWin);
        const resultEmoji = won ? '\u{1F7E2} WIN' : '\u{1F534} LOSS';
        const heroName = (player.heroName || '').replace('npc_dota_hero_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const kda = player.deaths > 0
          ? `${player.kills}/${player.deaths}/${player.assists} (${((player.kills + player.assists) / player.deaths).toFixed(2)} KDA)`
          : `${player.kills}/${player.deaths}/${player.assists} (Perfect KDA)`;

        const rating = await db.getPlayerRating(reg.account_id_32).catch(() => null);
        const tier = rating ? getMmrTier(rating.mmr) : null;

        const embed = new EmbedBuilder()
          .setTitle(`\u{1F4CB} Match Report — #${matchStats.matchId}`)
          .setColor(won ? 0x4ade80 : 0xf87171)
          .setDescription(`${resultEmoji} · ${heroName}`)
          .addFields(
            { name: 'K/D/A', value: kda, inline: true },
            { name: 'GPM', value: `${player.gpm || player.goldPerMin || 0}`, inline: true },
            { name: 'XPM', value: `${player.xpm || player.xpPerMin || 0}`, inline: true },
            { name: 'Hero Dmg', value: `${(player.heroDamage || 0).toLocaleString()}`, inline: true },
            { name: 'Tower Dmg', value: `${(player.towerDamage || 0).toLocaleString()}`, inline: true },
            { name: 'Healing', value: `${(player.heroHealing || 0).toLocaleString()}`, inline: true },
          );

        if (rating) {
          embed.addFields({
            name: `${tier?.emoji || ''} MMR`,
            value: `**${rating.mmr}** (${rating.wins}W—${rating.losses}L)`,
            inline: false,
          });
        }

        embed.setFooter({ text: 'Use !reportcard off to stop these DMs' });
        await user.send({ embeds: [embed] });
      } catch (err) {
        console.error(`[ReportCard] Failed to DM player ${player.accountId}:`, err.message);
      }
    }
  }

  async _cmdBalance(msg, args) {
    const mentions = [...msg.mentions.users.values()];
    const names = args.filter(a => !a.startsWith('<@'));

    if (mentions.length === 0 && names.length === 0) {
      return msg.reply('Usage: `!balance @player1 @player2 ... @player10` — mention all players to balance into two teams.');
    }

    const allAccounts = [];

    for (const user of mentions) {
      const nick = await db.getAllNicknames().then(ns => ns.find(n => n.discord_id === user.id));
      if (!nick) { allAccounts.push({ name: user.username, mmr: 2600 }); continue; }
      const rating = await db.getPlayerRating(nick.account_id.toString());
      allAccounts.push({ name: nick.nickname, mmr: rating ? rating.mmr : 2600 });
    }

    for (const name of names) {
      const nicks = await db.getAllNicknames();
      const nick = nicks.find(n => (n.nickname || '').toLowerCase() === name.toLowerCase());
      if (!nick) { allAccounts.push({ name, mmr: 2600 }); continue; }
      const rating = await db.getPlayerRating(nick.account_id.toString());
      allAccounts.push({ name: nick.nickname, mmr: rating ? rating.mmr : 2600 });
    }

    if (allAccounts.length < 2) {
      return msg.reply('Need at least 2 players to balance teams.');
    }

    const n = allAccounts.length;
    const half = Math.floor(n / 2);
    const indices = Array.from({ length: n }, (_, i) => i);

    function combinations(arr, k) {
      if (k === 0) return [[]];
      if (arr.length < k) return [];
      const [first, ...rest] = arr;
      return [
        ...combinations(rest, k - 1).map(c => [first, ...c]),
        ...combinations(rest, k),
      ];
    }

    const combos = combinations(indices, half);
    let bestDiff = Infinity, bestTeamA = [], bestTeamB = [];

    for (const comboA of combos) {
      const comboB = indices.filter(i => !comboA.includes(i));
      const mmrA = comboA.reduce((s, i) => s + allAccounts[i].mmr, 0);
      const mmrB = comboB.reduce((s, i) => s + allAccounts[i].mmr, 0);
      const diff = Math.abs(mmrA - mmrB);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestTeamA = comboA.map(i => allAccounts[i]);
        bestTeamB = comboB.map(i => allAccounts[i]);
      }
    }

    const fmtTeam = (team) => team.map(p => `**${p.name}** (${p.mmr})`).join('\n');
    const avgA = Math.round(bestTeamA.reduce((s, p) => s + p.mmr, 0) / bestTeamA.length);
    const avgB = Math.round(bestTeamB.reduce((s, p) => s + p.mmr, 0) / bestTeamB.length);

    const embed = new EmbedBuilder()
      .setTitle('⚖️ Balanced Teams')
      .setColor(0x6366f1)
      .setDescription(`MMR difference: **${bestDiff}** | ${n} players balanced`)
      .addFields(
        { name: `🟢 Team A — avg ${avgA} MMR`, value: fmtTeam(bestTeamA) || 'None', inline: true },
        { name: `🔴 Team B — avg ${avgB} MMR`, value: fmtTeam(bestTeamB) || 'None', inline: true },
      )
      .setFooter({ text: 'Coin flip to decide sides!' });

    await msg.channel.send({ embeds: [embed] });
  }

  async _cmdSchedule(msg, args) {
    if (!config.superuserKey || msg.member?.roles?.cache?.size === undefined) {
      // allow from any channel if configured
    }
    if (args.length < 2) {
      return msg.reply('Usage: `!schedule YYYY-MM-DD HH:MM [note]` — e.g. `!schedule 2026-04-05 20:00 Weekly inhouse`');
    }
    const datePart = args[0];
    const timePart = args[1];
    const note = args.slice(2).join(' ');
    const scheduledAt = new Date(`${datePart}T${timePart}:00+10:00`);
    if (isNaN(scheduledAt.getTime())) {
      return msg.reply('Invalid date/time format. Use `YYYY-MM-DD HH:MM` (AEST).');
    }
    const game = await db.scheduleGame(scheduledAt, note, msg.author.username);
    const when = scheduledAt.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'full', timeStyle: 'short' });
    const embed = new EmbedBuilder()
      .setTitle('📅 Game Scheduled!')
      .setColor(0x4ade80)
      .addFields(
        { name: 'When', value: when, inline: false },
        { name: 'Note', value: note || '—', inline: false },
        { name: 'ID', value: `#${game.id}`, inline: true },
        { name: 'Scheduled by', value: msg.author.username, inline: true },
      );
    await msg.channel.send({ embeds: [embed] });

    // Post RSVP embed
    const rsvpEmbed = new EmbedBuilder()
      .setTitle(`\u{1F9E0} RSVP — Inhouse ${when}`)
      .setColor(0x3b82f6)
      .setDescription(`Are you **in** for this game? React below!\n\n\u2705 **In** | \u274C **Out**\n\n_Check-ins are not binding — just helps gauge numbers!_`)
      .setFooter({ text: `Game ID #${game.id} · ${note || 'Weekly Inhouse'}` });
    const rsvpMsg = await msg.channel.send({ embeds: [rsvpEmbed] });
    await rsvpMsg.react('\u2705').catch(() => {});
    await rsvpMsg.react('\u274C').catch(() => {});
    await db.saveRsvpMessageId(game.id, rsvpMsg.id, msg.channel.id).catch(() => {});
  }

  async _cmdUpcoming(msg) {
    const games = await db.getUpcomingGames();
    if (games.length === 0) {
      return msg.reply('No upcoming games scheduled. Use `!schedule YYYY-MM-DD HH:MM [note]` to add one.');
    }
    const embed = new EmbedBuilder()
      .setTitle('📅 Upcoming Games')
      .setColor(0x6366f1)
      .setDescription(games.map(g => {
        const when = new Date(g.scheduled_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' });
        const note = g.note ? ` — ${g.note}` : '';
        return `**#${g.id}** ${when}${note}`;
      }).join('\n'));
    await msg.channel.send({ embeds: [embed] });
  }

  async _cmdCancelGame(msg, args) {
    const id = parseInt(args[0]);
    if (isNaN(id)) return msg.reply('Usage: `!cancel <game_id>` — use `!upcoming` to see game IDs.');
    const game = await db.cancelGame(id);
    if (!game) return msg.reply(`No game found with ID #${id}.`);
    await msg.reply(`✅ Game #${id} cancelled.`);
  }

  async _updateRsvpEmbed(message, gameId) {
    const rsvps = await db.getScheduleRsvps(gameId);
    const inList = rsvps.filter(r => r.status === 'yes').map(r => r.username);
    const outList = rsvps.filter(r => r.status === 'no').map(r => r.username);
    const embed = EmbedBuilder.from(message.embeds[0])
      .setFields(
        { name: `\u2705 In (${inList.length})`, value: inList.length > 0 ? inList.join(', ') : '_No one yet_', inline: true },
        { name: `\u274C Out (${outList.length})`, value: outList.length > 0 ? outList.join(', ') : '_No one yet_', inline: true },
      );
    await message.edit({ embeds: [embed] });
  }

  async _initiateRatingSession(matchStats, sendToAccountIds = null) {
    if (!matchStats || !matchStats.matchId || !matchStats.players) return;
    const players = await db.getDiscordIdsForMatch(matchStats.matchId.toString());
    console.log(`[Ratings] Match ${matchStats.matchId}: found ${players.length} players, ${players.filter(p => p.discord_id && p.discord_id.trim() !== '').length} with Discord IDs linked`);
    players.forEach(p => console.log(`[Ratings]   ${p.display_name} (account:${p.account_id}) discord_id="${p.discord_id || ''}"`));
    let withDiscord = players.filter(p => p.discord_id && p.discord_id.trim() !== '');
    if (sendToAccountIds) {
      const allowSet = new Set(sendToAccountIds.map(String));
      withDiscord = withDiscord.filter(p => allowSet.has(String(p.account_id)));
      console.log(`[Ratings] Filtered to ${withDiscord.length} players who haven't rated yet`);
    }
    if (withDiscord.length === 0) {
      console.log(`[Ratings] No eligible players to DM — skipping.`);
      return;
    }

    for (const rater of withDiscord) {
      try {
        const optedOut = await db.getPlayerRatingsOptOut(rater.discord_id).catch(() => false);
        if (optedOut) continue;

        const allOthers = players.filter(p => p.account_id !== rater.account_id);
        if (allOthers.length === 0) continue;

        const user = await this.client.users.fetch(rater.discord_id).catch(() => null);
        if (!user) continue;

        const session = {
          matchId: matchStats.matchId.toString(),
          raterAccountId: rater.account_id,
          raterTeam: rater.team,
          teammates: allOthers,
          step: 'mvp',
        };
        this.pendingRatingSessions.set(rater.discord_id, session);

        const heroLabel = (p) => p.hero_name ? ` (${this._heroDisplayName(p.hero_name)})` : '';
        const mvpList = allOthers.map((p, i) => `**${i + 1}.** ${p.display_name}${heroLabel(p)} ${p.team === 'radiant' ? '🟢' : '🔴'}`).join('\n');
        const matchUrl = `http://170.64.182.110:5000/match/${matchStats.matchId}`;
        const embed = new EmbedBuilder()
          .setTitle(`⭐ Match #${matchStats.matchId} — Rate Your Teammates`)
          .setURL(matchUrl)
          .setColor(0xfbbf24)
          .setDescription(
            `The inhouse just finished!\n` +
            `[View match page](${matchUrl})\n\n` +
            `**Step 1 of 2 — MVP Vote**\nWho was the MVP of the match? Vote for any player (both teams). Reply with just the number:\n\n${mvpList}\n\n` +
            `_(Reply \`skip\` to skip this step)_`
          )
          .setFooter({ text: 'Ratings are anonymous • You have 30 minutes to respond • Type !ratings off to stop receiving these' });

        await user.send({ embeds: [embed] });
        await db.logMatchDMSent(matchStats.matchId.toString(), rater.account_id).catch(() => {});

        setTimeout(() => {
          if (this.pendingRatingSessions.has(rater.discord_id)) {
            this.pendingRatingSessions.delete(rater.discord_id);
          }
        }, 30 * 60 * 1000);

      } catch (e) {
        console.error(`[Ratings] Could not DM ${rater.display_name}:`, e.message);
      }
    }
  }

  async _handleRatingReply(msg) {
    const session = this.pendingRatingSessions.get(msg.author.id);
    if (!session) return;

    const content = msg.content.trim().toLowerCase();

    if (session.step === 'mvp') {
      if (content !== 'skip') {
        const num = parseInt(content);
        if (!isNaN(num) && num >= 1 && num <= session.teammates.length) {
          const mvpPlayer = session.teammates[num - 1];
          if (!session.isTest) {
            await db.saveMatchRating(session.matchId, session.raterAccountId, mvpPlayer.account_id, null, true);
          }
          await msg.reply(`✅ MVP vote recorded for **${mvpPlayer.display_name}**!${session.isTest ? ' *(test — not saved)*' : ''}`);
        } else {
          await msg.reply(`Please reply with a number between 1 and ${session.teammates.length}, or \`skip\`.`);
          return;
        }
      }

      // Attitude step: only rate own team
      const ownTeam = session.teammates.filter(p => p.team === session.raterTeam);
      session.step = 'attitude';
      session.attitudePlayers = ownTeam;
      this.pendingRatingSessions.set(msg.author.id, session);

      const heroLabel = (p) => p.hero_name ? ` (${this._heroDisplayName(p.hero_name)})` : '';
      const attitudeList = ownTeam.map((p, i) => `**${i + 1}.** ${p.display_name}${heroLabel(p)}`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle(`👍 Step 2 of 2 — Attitude Ratings`)
        .setColor(0x4ade80)
        .setDescription(
          `Rate each of your **teammates'** attitude / enjoyment to play with (1–10).\n` +
          `Reply with ${ownTeam.length} space-separated numbers in this order:\n\n` +
          `${attitudeList}\n\n` +
          `**Example:** \`8 9 7 6 8\`\n_(Reply \`skip\` to skip)_`
        );
      await msg.author.send({ embeds: [embed] });

    } else if (session.step === 'attitude') {
      const attitudePlayers = session.attitudePlayers || session.teammates.filter(p => p.team === session.raterTeam);
      if (content !== 'skip') {
        const scores = msg.content.trim().split(/\s+/).map(Number);
        if (scores.length !== attitudePlayers.length || scores.some(s => isNaN(s) || s < 1 || s > 10)) {
          await msg.reply(`Please send exactly ${attitudePlayers.length} numbers (1–10), space-separated. Or reply \`skip\`.`);
          return;
        }
        if (!session.isTest) {
          for (let i = 0; i < attitudePlayers.length; i++) {
            await db.saveMatchRating(session.matchId, session.raterAccountId, attitudePlayers[i].account_id, scores[i], false);
          }
        }
        await msg.reply(`✅ Attitude ratings saved! Thanks for the feedback.${session.isTest ? ' *(test — not saved)*' : ''}`);
      } else {
        await msg.reply('Ratings skipped. See you next game!');
      }
      this.pendingRatingSessions.delete(msg.author.id);
    }
  }

  async _announceNewPatchNotes() {
    const unannounced = await db.getUnannouncedPatchNotes().catch(err => {
      console.error('[PatchNotes] Failed to fetch unannounced notes:', err.message);
      return [];
    });

    if (!unannounced.length) {
      console.log('[PatchNotes] No new patch notes to announce.');
      return;
    }

    console.log(`[PatchNotes] ${unannounced.length} unannounced note(s): ${unannounced.map(n => `v${n.version}`).join(', ')}`);

    const patchChannelIds = config.discord.patchChannelIds.length > 0
      ? config.discord.patchChannelIds
      : (config.discord.announceChannelId ? [config.discord.announceChannelId] : []);

    if (!patchChannelIds.length) {
      // No channel configured — skip silently so production bot can post them.
      console.log('[PatchNotes] No patch channels configured — skipping (notes remain pending for production bot).');
      return;
    }

    const patchChannels = await this._resolveChannels(patchChannelIds);
    if (!patchChannels.length) {
      console.error('[PatchNotes] No accessible patch channels found — notes remain pending for next restart.');
      return;
    }

    console.log(`[PatchNotes] Posting to ${patchChannels.length} channel(s)...`);

    for (const note of unannounced) {
      const embed = new EmbedBuilder()
        .setTitle(`\u{1F4CB} Bot Update \u2014 v${note.version} | ${note.title}`)
        .setColor(0x60a5fa)
        .setDescription(note.content.slice(0, 2000))
        .setFooter({ text: `Released ${new Date(note.published_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` })
        .setTimestamp();

      let anySucceeded = false;
      for (const ch of patchChannels) {
        try {
          await ch.send({ embeds: [embed] });
          anySucceeded = true;
          console.log(`[PatchNotes] Announced v${note.version} in channel ${ch.id}.`);
        } catch (err) {
          console.error(`[PatchNotes] Failed to announce v${note.version} in channel ${ch.id}:`, err.message);
        }
      }
      // Only mark as announced if at least one channel received it
      if (anySucceeded) {
        await db.markPatchNoteAnnounced(note.id);
        console.log(`[PatchNotes] v${note.version} marked as announced.`);
      }
    }
  }

  async postScheduleRsvpEmbed(game) {
    const channelIds = config.discord.scheduleChannelIds.length > 0
      ? config.discord.scheduleChannelIds
      : (config.discord.announceChannelId ? [config.discord.announceChannelId] : []);

    if (!channelIds.length) {
      throw new Error('No schedule channels configured — set SCHEDULE_CHANNEL_IDS or ANNOUNCE_CHANNEL_ID');
    }

    const channels = await this._resolveChannels(channelIds);
    if (!channels.length) {
      throw new Error('No accessible schedule channels found');
    }

    const when = new Date(game.scheduled_at).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney', dateStyle: 'full', timeStyle: 'short',
    });
    const combinedEmbed = new EmbedBuilder()
      .setTitle(`📅 Inhouse Scheduled — ${when} AEST`)
      .setColor(0x3b82f6)
      .setDescription(
        `${game.note ? `**${game.note}**\n\n` : ''}` +
        `Are you **in** for this game? React below!\n\n✅ **In** | ❌ **Out**\n\n` +
        `_Check-ins are not binding — just helps gauge numbers!_`
      )
      .addFields(
        { name: 'Scheduled by', value: game.created_by || 'admin', inline: true },
        { name: 'Game ID', value: `#${game.id}`, inline: true },
      )
      .setFooter({ text: 'Reminder will be posted 1 hour before game time' });

    let primarySaved = false;
    for (const channel of channels) {
      try {
        const rsvpMsg = await channel.send({ embeds: [combinedEmbed] });
        await rsvpMsg.react('✅').catch(() => {});
        await rsvpMsg.react('❌').catch(() => {});
        // Save RSVP message ID for the first (primary) channel only — used for reaction tracking
        if (!primarySaved) {
          await db.saveRsvpMessageId(game.id, rsvpMsg.id, channel.id).catch(() => {});
          primarySaved = true;
        }
        console.log(`[Schedule] Posted RSVP embed for game #${game.id} in channel ${channel.id}`);
      } catch (err) {
        console.error(`[Schedule] Failed to post RSVP embed in channel ${channel.id}:`, err.message);
      }
    }
  }

  async _sendScheduleReminders() {
    const games = await db.getGamesNeedingReminders().catch(() => []);
    if (!games.length) return;

    for (const game of games) {
      const diff = new Date(game.scheduled_at) - new Date();
      const is24h = !game.reminder_24h_sent && diff >= 82800000 && diff <= 90000000; // 23h→25h window
      const is1h  = !game.reminder_1h_sent  && diff >= 2700000  && diff <= 4500000;  // 45m→75m window
      const is10m = !game.reminder_10m_sent && diff >= 300000   && diff <= 900000;   // 5m→15m window

      if (!is24h && !is1h && !is10m) continue;

      const when = new Date(game.scheduled_at).toLocaleString('en-AU', {
        timeZone: 'Australia/Sydney', weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
      const label = is24h ? '24 hours' : is1h ? '1 hour' : '10 minutes';
      const rsvps = await db.getScheduleRsvps(game.id).catch(() => []);
      const inList = rsvps.filter(r => r.status === 'yes').map(r => r.username);

      // Post channel reminder to all schedule channels
      const scheduleChannelIds = config.discord.scheduleChannelIds.length > 0
        ? config.discord.scheduleChannelIds
        : (game.rsvp_channel_id || config.discord.announceChannelId
          ? [(game.rsvp_channel_id || config.discord.announceChannelId)]
          : []);
      if (scheduleChannelIds.length) {
        const reminderEmbed = new EmbedBuilder()
          .setTitle(`⏰ Inhouse in ${label}!`)
          .setDescription(
            `**${when}** AEST\n${game.note ? `📝 ${game.note}\n` : ''}` +
            `\n✅ **${inList.length} player${inList.length !== 1 ? 's' : ''}** registered: ${inList.join(', ') || '_no one yet_'}` +
            `\n\nReact ✅/❌ on the original RSVP post, or use the website to update your availability.`
          )
          .setColor(is1h ? 0xf44336 : 0x60a5fa);
        const reminderChannels = await this._resolveChannels(scheduleChannelIds);
        for (const ch of reminderChannels) {
          await ch.send({ embeds: [reminderEmbed] }).catch(err =>
            console.error(`[Reminders] Failed to post reminder in channel ${ch.id}:`, err.message)
          );
        }
      }

      // DM players who are ✅ and have real Discord IDs (24h and 1h only)
      if (!is10m) {
        const discordIn = rsvps.filter(r => r.status === 'yes' && !r.discord_id.startsWith('web:'));
        for (const rsvp of discordIn) {
          try {
            const user = await this.client.users.fetch(rsvp.discord_id).catch(() => null);
            if (!user) continue;
            await user.send(
              `⏰ **Reminder:** Inhouse in **${label}** — ${when} AEST` +
              (game.note ? `\n📝 ${game.note}` : '') +
              `\n\n${inList.length} player${inList.length !== 1 ? 's' : ''} registered so far.`
            ).catch(() => {});
          } catch {
            // ignore failed DMs
          }
        }
      }

      // Steam message for 1h and 10m reminders
      if (is1h || is10m) {
        const steamMsg = is10m
          ? `⚔️ Dota inhouse starting in ~10 minutes! Hop on — ${inList.length} player${inList.length !== 1 ? 's' : ''} ready.`
          : `⚔️ Dota inhouse in 1 hour! — ${when} AEST\n${inList.length} player${inList.length !== 1 ? 's' : ''} signed up so far.`;
        const steamClient = tryGetSteamClient();
        if (steamClient && steamClient.isLoggedIn) {
          const accountIds = await db.getRsvpSteamAccountIds(game.id).catch(() => []);
          console.log(`[Reminders] Sending Steam messages to ${accountIds.length} players for game #${game.id}`);
          for (const accountId32 of accountIds) {
            steamClient.sendSteamMessage(accountId32, steamMsg);
            await new Promise(r => setTimeout(r, 300)); // small delay between messages
          }
        } else {
          console.warn('[Reminders] Steam client not logged in — skipping Steam messages');
        }
      }

      // Mark sent
      if (is24h) await db.markReminder24hSent(game.id).catch(() => {});
      if (is1h) await db.markReminder1hSent(game.id).catch(() => {});
      if (is10m) await db.markReminder10mSent(game.id).catch(() => {});
      console.log(`[Reminders] Sent ${label} reminder for game #${game.id} (${when})`);
    }
  }

  async _autoCreateScheduledLobbies() {
    const games = await db.getGamesNeedingLobby().catch(() => []);
    if (!games.length) return;

    for (const game of games) {
      const lobbyManager = tryGetLobbyManager();
      if (!lobbyManager) {
        console.warn('[LobbyAuto] Lobby manager not available — skipping auto-create');
        continue;
      }
      const steamClient = tryGetSteamClient();
      if (!steamClient || !steamClient.isGCReady) {
        console.warn('[LobbyAuto] GC not ready — skipping auto-create for game #' + game.id);
        continue;
      }

      const gameNum = game.game_number || game.id;
      const lobbyName = `OCE Inhouse #${gameNum}`;
      const password = game.password || '';

      console.log(`[LobbyAuto] Auto-creating lobby for game #${game.id}: "${lobbyName}"`);
      try {
        await db.markLobbyCreated(game.id); // mark first to prevent double-create on retry
        await lobbyManager.createLobby(lobbyName, password, 'schedule-auto');

        // Invite all RSVP'd players with Steam IDs
        const accountIds = await db.getRsvpSteamAccountIds(game.id).catch(() => []);
        console.log(`[LobbyAuto] Inviting ${accountIds.length} RSVP'd players...`);
        for (const accountId32 of accountIds) {
          const steam64 = (BigInt('76561197960265728') + BigInt(accountId32)).toString();
          await new Promise(r => setTimeout(r, 500));
          try { lobbyManager.invitePlayer(steam64); } catch {}
        }

        // Post to Discord — schedule channel (lobby is live) + stats channel (game event)
        const lobbyMsg =
          `🎮 **Lobby created: ${lobbyName}**\n` +
          `📅 ${new Date(game.scheduled_at).toLocaleString('en-AU', {
            timeZone: 'Australia/Sydney', weekday: 'short', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true,
          })} AEST${game.note ? ` — ${game.note}` : ''}\n` +
          `${password ? `🔑 Password: \`${password}\`` : '🔓 No password'}\n` +
          `📨 Invites sent to ${accountIds.length} RSVP'd player${accountIds.length !== 1 ? 's' : ''}. ` +
          `Join via your Steam friends list or Dota 2 lobby browser.\n` +
          `An admin can start the game with \`!start_game\` once all 10 players are seated.`;
        const lobbyPostIds = new Set([
          ...config.discord.scheduleChannelIds,
          ...config.discord.statsChannelIds,
          ...(game.rsvp_channel_id ? [game.rsvp_channel_id] : []),
          ...(config.discord.announceChannelId ? [config.discord.announceChannelId] : []),
        ]);
        for (const id of lobbyPostIds) {
          const ch = this.client.channels.cache.get(id) || await this.client.channels.fetch(id).catch(() => null);
          if (ch) await ch.send(lobbyMsg).catch(() => {});
        }
        console.log(`[LobbyAuto] Lobby "${lobbyName}" created and invites sent for game #${game.id}`);
      } catch (err) {
        console.error(`[LobbyAuto] Failed to auto-create lobby for game #${game.id}:`, err.message);
        // Unmark so we can retry
        await db.getPool().query('UPDATE scheduled_games SET lobby_created = FALSE WHERE id = $1', [game.id]).catch(() => {});
      }
    }
  }

  async start() {
    if (!config.discord.token) throw new Error('DISCORD_TOKEN not configured.');
    await this.client.login(config.discord.token);

    this.client.once('ready', () => {
      // Weekly recap: Monday 9am AEST (Sunday 11pm UTC)
      cron.schedule('0 23 * * 0', () => {
        console.log('[Discord] Posting weekly recap...');
        this._postWeeklyRecap();
      }, { timezone: 'UTC' });
      console.log('[Discord] Weekly recap scheduled (Mondays 9am AEST).');

      // Game reminders: check every 10 minutes for upcoming games needing 24h/1h reminders
      setInterval(() => this._sendScheduleReminders().catch(err => console.error('[Reminders] Error:', err.message)), 10 * 60 * 1000);
      setTimeout(() => this._sendScheduleReminders().catch(() => {}), 15000);

      // Auto-create lobby at game time: check every minute
      setInterval(() => this._autoCreateScheduledLobbies().catch(err => console.error('[LobbyAuto] Error:', err.message)), 60 * 1000);

      // 10-player seated notification
      const lobbyMgr = tryGetLobbyManager();
      if (lobbyMgr) {
        lobbyMgr.on('tenPlayersSeated', async (lobby) => {
          const seatedMsg = `🟢 **10 players seated in "${lobby.name}"** — lobby is full and ready! An admin can launch with \`!start_game\` or via the admin panel.`;
          const seatedIds = new Set([
            ...config.discord.statsChannelIds,
            ...(config.discord.announceChannelId ? [config.discord.announceChannelId] : []),
          ]);
          for (const id of seatedIds) {
            try {
              const ch = this.client.channels.cache.get(id) || await this.client.channels.fetch(id).catch(() => null);
              if (ch) await ch.send(seatedMsg);
            } catch {}
          }
        });
      }

      // Announce any new patch notes after a short delay (let channel cache populate)
      setTimeout(() => this._announceNewPatchNotes().catch(() => {}), 8000);
    });
  }

  async _cmdStreak(msg, args) {
    const mentioned = msg.mentions.users.first();
    const targetUser = mentioned || msg.author;
    const reg = await db.getPlayerByDiscordId(targetUser.id);
    if (!reg) {
      const hint = targetUser.id === msg.author.id
        ? 'You\'re not registered. Use `!register <steam_id>` to link your Steam account.'
        : `${targetUser.username} hasn't registered their Steam account yet.`;
      return msg.reply(hint);
    }

    const [streak, rating, recentMatches] = await Promise.all([
      db.getPlayerCurrentStreak(reg.account_id_32).catch(() => 0),
      db.getPlayerRating(reg.account_id_32).catch(() => null),
      db.getPlayerRecentResults(reg.account_id_32, 10).catch(() => []),
    ]);

    const displayName = reg.display_name || targetUser.username;
    const mmr = rating ? rating.mmr : null;
    const wins = rating ? rating.wins : 0;
    const losses = rating ? rating.losses : 0;
    const wr = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : 0;

    let streakEmoji, streakDesc, color;
    if (streak >= 10) { streakEmoji = '🔥🔥🔥'; streakDesc = `ON FIRE — ${streak} wins in a row!`; color = 0xff4500; }
    else if (streak >= 5) { streakEmoji = '🔥🔥'; streakDesc = `Hot streak — ${streak} wins in a row`; color = 0xff6600; }
    else if (streak >= 3) { streakEmoji = '🔥'; streakDesc = `${streak}-game win streak`; color = 0xf59e0b; }
    else if (streak === 0) { streakEmoji = '➖'; streakDesc = 'No active streak'; color = 0x64748b; }
    else if (streak <= -10) { streakEmoji = '💀💀💀'; streakDesc = `STRUGGLING — ${Math.abs(streak)} losses in a row`; color = 0x7f1d1d; }
    else if (streak <= -5) { streakDesc = `Cold streak — ${Math.abs(streak)} losses in a row`; streakEmoji = '❄️'; color = 0x1e40af; }
    else { streakEmoji = '📉'; streakDesc = `${Math.abs(streak)}-game losing streak`; color = 0xef4444; }

    const last10 = recentMatches.slice(0, 10).map(m => m.won ? '✅' : '❌').join(' ');

    const embed = new EmbedBuilder()
      .setTitle(`${streakEmoji} ${displayName} — Streak`)
      .setColor(color)
      .addFields(
        { name: 'Current Streak', value: streakDesc, inline: false },
        { name: 'Record', value: `${wins}W — ${losses}L (${wr}% WR)`, inline: true },
        ...(mmr ? [{ name: 'MMR', value: `${mmr}`, inline: true }] : []),
        ...(last10 ? [{ name: 'Last 10 Results', value: last10 || '—', inline: false }] : []),
      )
      .setFooter({ text: 'Use !stats for full profile' });

    await msg.reply({ embeds: [embed] });
  }

  async _cmdTournament(msg, args) {
    const tournaments = await db.getTournaments().catch(() => []);

    const active = tournaments.filter(t => t.status === 'active');
    const upcoming = tournaments.filter(t => t.status === 'upcoming');
    const completed = tournaments.filter(t => t.status === 'completed').slice(0, 3);

    if (tournaments.length === 0) {
      return msg.reply('No tournaments found. Create one at the web dashboard!');
    }

    const fmtTournament = (t) => {
      const fmt = t.format === 'double_elim' ? 'Double Elim' : 'Single Elim';
      const players = t.participant_count || 0;
      return `**${t.name}** — ${fmt} · ${players} players`;
    };

    const embed = new EmbedBuilder()
      .setTitle('🏆 Tournaments')
      .setColor(0xf59e0b);

    if (active.length > 0) {
      embed.addFields({ name: '🏆 Active', value: active.map(fmtTournament).join('\n'), inline: false });
    }
    if (upcoming.length > 0) {
      embed.addFields({ name: '⏳ Upcoming', value: upcoming.map(fmtTournament).join('\n'), inline: false });
    }
    if (completed.length > 0) {
      embed.addFields({ name: '✅ Recent Completed', value: completed.map(fmtTournament).join('\n'), inline: false });
    }

    embed.setFooter({ text: 'View full brackets at the web dashboard → /tournaments' });
    await msg.reply({ embeds: [embed] });
  }

  // Public method called from the web server superuser API
  async sendTestDm(targetDiscordId) {
    return this._runTestDm(targetDiscordId);
  }

  // Manually trigger post-match DMs — only for players who haven't rated yet
  async triggerMatchDMs(matchId, missingOnly = false) {
    const players = await db.getDiscordIdsForMatch(matchId.toString());
    if (!players.length) throw new Error(`No player stats found for match ${matchId}`);

    let sendToAccountIds = null;
    let skipped = 0;
    if (missingOnly) {
      const alreadySent = await db.getMatchDMLog(matchId.toString());
      const targets = players.filter(p => !alreadySent.has(String(p.account_id)));
      skipped = players.length - targets.length;
      sendToAccountIds = targets.map(p => p.account_id);
    }

    await this._initiateRatingSession({ matchId, players }, sendToAccountIds);

    const eligible = sendToAccountIds
      ? players.filter(p => sendToAccountIds.includes(p.account_id) && p.discord_id && p.discord_id.trim())
      : players.filter(p => p.discord_id && p.discord_id.trim());
    return { matchId, sent: eligible.length, skipped };
  }

  async _runTestDm(targetId) {
    const user = await this.client.users.fetch(targetId);

    const mockTeammates = [
      { account_id: '1', display_name: 'Teammate Alpha', team: 'radiant' },
      { account_id: '2', display_name: 'Teammate Beta', team: 'radiant' },
      { account_id: '3', display_name: 'Teammate Gamma', team: 'radiant' },
      { account_id: '4', display_name: 'Teammate Delta', team: 'radiant' },
      { account_id: '5', display_name: 'Opponent One', team: 'dire' },
      { account_id: '6', display_name: 'Opponent Two', team: 'dire' },
      { account_id: '7', display_name: 'Opponent Three', team: 'dire' },
      { account_id: '8', display_name: 'Opponent Four', team: 'dire' },
      { account_id: '9', display_name: 'Opponent Five', team: 'dire' },
    ];

    const session = {
      matchId: 'TEST-0000',
      raterAccountId: '0',
      raterTeam: 'radiant',
      teammates: mockTeammates,
      step: 'mvp',
      isTest: true,
    };
    this.pendingRatingSessions.set(user.id, session);

    setTimeout(() => {
      if (this.pendingRatingSessions.get(user.id)?.matchId === 'TEST-0000') {
        this.pendingRatingSessions.delete(user.id);
      }
    }, 10 * 60 * 1000);

    const teammateList = mockTeammates.map((p, i) => `**${i + 1}.** ${p.display_name} (🟢)`).join('\n');
    const matchUrl = `http://170.64.182.110:5000/match/TEST-0000`;
    const embed = new EmbedBuilder()
      .setTitle('⭐ TEST DM — Rate Your Teammates')
      .setURL(matchUrl)
      .setColor(0xfbbf24)
      .setDescription(
        `This is a **test DM** to verify the post-match rating system is working.\n` +
        `[View match page](${matchUrl})\n\n` +
        `**Step 1 of 2 — MVP Vote**\nWho was the MVP of the match? Vote for any player (both teams). Reply with just the number:\n\n${teammateList}\n\n` +
        `_(Reply \`skip\` to skip this step)_`
      )
      .setFooter({ text: 'Ratings are anonymous • You have 30 minutes to respond • Type !ratings off to stop receiving these' });

    await user.send({ embeds: [embed] });
    return { username: user.username, id: user.id };
  }

  async _cmdTestRsvpDm(msg, args) {
    // Allow targeting another user: !testrsvpdm [userId]
    const targetId = args[0] || msg.author.id;

    let targetUser;
    try {
      targetUser = await this.client.users.fetch(targetId);
    } catch {
      return msg.reply(`❌ Couldn't find user \`${targetId}\`.`);
    }

    // Remove them from pendingRegistrations so the DM will fire even if they were prompted before
    this.pendingRegistrations.delete(targetUser.id);

    // Use the nearest real upcoming game, or create a mock if none exist
    const upcomingGames = await db.getUpcomingGames().catch(() => []);
    const fakeGame = upcomingGames[0] || {
      id: 0,
      scheduled_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
      description: 'Test Inhouse',
    };

    // Force-send the DM regardless of registration status
    const when = new Date(fakeGame.scheduled_at).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney', weekday: 'short', month: 'short',
      day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
    });
    this.pendingRegistrations.set(targetUser.id, { gameId: fakeGame.id, step: 'awaiting_steam_id' });

    try {
      await targetUser.send(
        `👋 Hey **${targetUser.username}**! You signed up for the inhouse on **${when}** AEST — nice one!\n\n` +
        `It looks like you haven't linked your Steam account yet. To show up properly on the leaderboard and stats, reply here with your **Steam64 ID** (17 digits).\n\n` +
        `📌 Find yours at: https://steamid.io\n` +
        `_(It looks like \`76561198012345678\`)_\n\n` +
        `Reply with just the number, or type \`skip\` to ignore this.\n\n` +
        `_[This is a test DM — the reply handler is fully live]_`
      );
      await msg.reply(
        `✅ Test RSVP registration DM sent to **${targetUser.username}** (\`${targetUser.id}\`).\n` +
        `They can now reply with a Steam ID to test the full registration flow, or type \`skip\` to cancel.`
      );
    } catch (err) {
      this.pendingRegistrations.delete(targetUser.id);
      await msg.reply(`❌ Couldn't DM **${targetUser.username}**: ${err.message}\n_(They may have DMs disabled)_`);
    }
  }

  async _cmdTestDm(msg, args) {
    const targetId = args[0] || msg.author.id;
    try {
      const { username, id } = await this._runTestDm(targetId);
      await msg.reply(`✅ Test DM sent to **${username}** (\`${id}\`). They should see the MVP vote prompt.`);
    } catch (e) {
      await msg.reply(`❌ Could not send test DM to \`${targetId}\`: ${e.message}`);
    }
  }

  async shutdown() {
    this.client.destroy();
    console.log('[Discord] Bot shut down.');
  }
}

let instance = null;
function getDiscordBot() {
  if (!instance) {
    instance = new DiscordBot();
  }
  return instance;
}

module.exports = { getDiscordBot };
