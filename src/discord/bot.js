const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const { config, getMmrTier } = require('../config');
const { getStatsService } = require('../stats/statsService');
const { getSheetsStore } = require('../sheets/sheetsStore');
const { getReplayParser } = require('../replay/replayParser');
const { getOpenDota } = require('../api/opendota');
const db = require('../db');
const { generateWeeklyRecapBlurb, generatePlayerAnalysis, generatePlayerRoast, generateMatchMvpBlurb } = require('../services/groqService');

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
      ],
    });
    this.prefix = config.discord.prefix;
    this.lobbyChannelId = null;
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

          const channel = this.lobbyChannelId ? this.client.channels.cache.get(this.lobbyChannelId) : null;
          if (channel) {
            await this._sendMatchSummary(lobbyMatchStats, lobby.name, channel);
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
              const channel = this.lobbyChannelId ? this.client.channels.cache.get(this.lobbyChannelId) : null;
              if (channel) await this._sendMatchSummary(matchStats, lobby.name, channel);
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

  _notifyChannel(message) {
    if (this.lobbyChannelId) {
      const channel = this.client.channels.cache.get(this.lobbyChannelId);
      if (channel) channel.send(message).catch(() => {});
    }
  }

  async notifyMatchRecorded(matchStats) {
    if (!this.lobbyChannelId) return;
    const channel = this.client.channels.cache.get(this.lobbyChannelId);
    if (!channel) return;

    try {
      await channel.send(`Auto-detected inhouse match **${matchStats.matchId}**! Recording stats...`);
      await this._sendMatchSummary(matchStats, '', channel);
    } catch (err) {
      console.error('[Discord] Notify error:', err.message);
    }
  }

  _setupHandlers() {
    this.client.on('ready', () => {
      console.log(`[Discord] Bot online as ${this.client.user.tag}`);
      this.client.user.setActivity('Dota 2 Inhouse | !help', { type: 3 });
    });

    this.client.on('messageCreate', async (msg) => {
      if (msg.author.bot) return;

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
            '`!stats [@user]` - Show your stats (or @mention another player)',
            '`!history` - Show recent match history',
            '`!match <id>` - Show scoreboard for a specific match',
            '`!herostats <hero>` - Win rate & top players for a hero',
            '`!vs @user` - Your head-to-head record against someone',
            '`!recap` - This week\'s highlights & fun stats',
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

    const steamId = args[0];
    try {
      const sent = lobbyManager.invitePlayer(steamId);
      if (sent) {
        await msg.reply(`Lobby invite sent to Steam ID \`${steamId}\`. They should see the invite in Dota 2.`);
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

          const streakCallouts = [];
          if (msg.guild) {
            for (const p of matchStats.players.filter(p => p.accountId && p.accountId !== 0)) {
              const rating = await db.getPlayerRating(p.accountId.toString()).catch(() => null);
              if (rating) await this._updateMmrRoles(msg.guild, p.accountId.toString(), rating.mmr).catch(() => {});

              const streak = await db.getPlayerCurrentStreak(p.accountId).catch(() => 0);
              const name = p.personaname || `ID:${p.accountId}`;
              if (streak >= 3) {
                const fireEmoji = '\u{1F525}';
                const prefix = streak >= 5 ? fireEmoji.repeat(3) : fireEmoji;
                streakCallouts.push(`${prefix} **${name}** is on a **${streak}-game win streak!**`);
              } else if (streak <= -3) {
                const skullEmoji = String.fromCodePoint(0x1F480);
                const prefix = Math.abs(streak) >= 5 ? skullEmoji.repeat(3) : skullEmoji;
                streakCallouts.push(`${prefix} **${name}** is on a **${Math.abs(streak)}-game losing streak...**`);
              }
            }
          }

          await this._markRecorded(matchStats.matchId, 'replay-upload');

          await statusMsg.edit(`Replay parsed! Match **${matchStats.matchId}** recorded with full stats.`);
          await this._sendMatchSummary(matchStats, 'Replay Upload', msg.channel);

          if (streakCallouts.length > 0) {
            await msg.channel.send(`\u{1F3C6} **Streak Watch:**\n${streakCallouts.join('\n')}`).catch(() => {});
          }

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
    return heroName
      .replace('npc_dota_hero_', '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
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

    if (config.discord.announceChannelId && channel.id !== config.discord.announceChannelId) {
      const announceChannel = channel.guild?.channels?.cache?.get(config.discord.announceChannelId);
      if (announceChannel) await announceChannel.send({ embeds: [embed] }).catch(() => {});
    }
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
    const channelId = config.discord.weeklyRecapChannelId;
    if (!channelId) return;
    const channel = this.client.channels.cache.get(channelId);
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
    });
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
