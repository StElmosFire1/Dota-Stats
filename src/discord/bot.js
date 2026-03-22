const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const { config } = require('../config');
const { getStatsService } = require('../stats/statsService');
const { getSheetsStore } = require('../sheets/sheetsStore');
const { getReplayParser } = require('../replay/replayParser');
const { getOpenDota } = require('../api/opendota');
const db = require('../db');

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
          case 'history': await this._cmdHistory(msg); break;
          case 'register': await this._cmdRegister(msg, args); break;
          case 'players': await this._cmdPlayers(msg); break;
          case 'recap': await this._cmdRecap(msg); break;
          case 'herostats': await this._cmdHeroStats(msg, args); break;
          case 'vs': await this._cmdVs(msg, args); break;
          case 'match': await this._cmdMatch(msg, args); break;
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
      return `${medal} **${name}** \u2014 ${p.mmr} MMR | ${p.wins}W-${p.losses}L (${winRate}%)`;
    });

    const embed = new EmbedBuilder()
      .setTitle('\u{1F3C6} Inhouse Leaderboard')
      .setColor(0xffd700)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Top ${Math.min(limit, leaderboard.length)} players \u2022 TrueSkill MMR` })
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
    const [stats, rating] = await Promise.all([
      db.getPlayerStats(accountId),
      db.getPlayerRating(accountId),
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

    const embed = new EmbedBuilder()
      .setTitle(`\u{1F4CA} ${displayName}`)
      .setColor(0x00ae86)
      .addFields(
        { name: 'MMR', value: mmr.toString(), inline: true },
        { name: 'Games', value: games.toString(), inline: true },
        { name: 'Win Rate', value: `${winRate}%`, inline: true },
        { name: 'W / L', value: `${wins} / ${losses}`, inline: true },
        { name: 'Avg KDA', value: `${avg.avg_kills}/${avg.avg_deaths}/${avg.avg_assists} (${kda})`, inline: true },
        { name: 'Avg GPM', value: avg.avg_gpm?.toString() || '—', inline: true },
        { name: 'Avg Damage', value: avg.avg_hero_damage ? parseInt(avg.avg_hero_damage).toLocaleString() : '—', inline: true },
        { name: 'Avg Last Hits', value: avg.avg_last_hits?.toString() || '—', inline: true },
        { name: 'Avg Healing', value: avg.avg_hero_healing ? parseInt(avg.avg_hero_healing).toLocaleString() : '—', inline: true },
      )
      .setFooter({ text: `Account ID: ${accountId}` })
      .setTimestamp();

    await msg.reply({ embeds: [embed] });
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

          if (msg.guild) {
            for (const p of matchStats.players.filter(p => p.accountId && p.accountId !== 0)) {
              const rating = await db.getPlayerRating(p.accountId.toString()).catch(() => null);
              if (rating) await this._updateMmrRoles(msg.guild, p.accountId.toString(), rating.mmr).catch(() => {});
            }
          }

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
    return heroName
      .replace('npc_dota_hero_', '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
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
      const gpm = p.goldPerMin ? ` | ${p.goldPerMin} GPM` : '';
      const dmg = p.heroDamage ? ` | ${Math.round(p.heroDamage / 1000)}k dmg` : '';
      return `**${name}** (${hero}) ${kda}${gpm}${dmg}`;
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
    if (mvp) {
      const mvpKda = mvp.deaths > 0
        ? `${((mvp.kills + mvp.assists) / mvp.deaths).toFixed(2)} KDA`
        : `${mvp.kills + mvp.assists} KDA (deathless)`;
      highlights.push(`\u{1F451} **MVP:** ${mvp.personaname || 'Unknown'} (${this._heroDisplayName(mvp.heroName, mvp.heroId)}) \u2014 ${mvpKda}`);
    }
    if (goldKing && goldKing !== mvp) {
      highlights.push(`\u{1F4B0} **Gold King:** ${goldKing.personaname || 'Unknown'} \u2014 ${goldKing.goldPerMin} GPM`);
    }
    if (slayer && slayer.kills >= 10) {
      highlights.push(`\u2694\uFE0F **Slayer:** ${slayer.personaname || 'Unknown'} \u2014 ${slayer.kills} kills`);
    }
    if (damage) {
      highlights.push(`\u{1F4A5} **Most Damage:** ${damage.personaname || 'Unknown'} \u2014 ${Math.round((damage.heroDamage || 0) / 1000)}k`);
    }

    if (highlights.length > 0) {
      embed.addFields({ name: '\u2B50 Highlights', value: highlights.join('\n'), inline: false });
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

      const embed = new EmbedBuilder()
        .setTitle('\u{1F4CA} Weekly Recap')
        .setColor(0x3b82f6)
        .addFields({
          name: `\u{1F3AE} ${matches.length} match${matches.length !== 1 ? 'es' : ''} this week`,
          value: `\u{1F7E2} Radiant ${radiantWins} \u2013 ${direWins} Dire \u{1F534}  \u2022  Avg game: ${avgDurStr}`,
          inline: false,
        });

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

      const awards = [];
      if (fun.highKDA) {
        const k = fun.highKDA;
        awards.push(`\u{1F451} **Best KDA** — ${k.name}: ${k.kills}/${k.deaths}/${k.assists} (${parseFloat(k.kda).toFixed(2)}) in match #${k.match_id}`);
      }
      if (fun.mostKills) {
        awards.push(`\u2694\uFE0F **Most Kills** — ${fun.mostKills.name}: ${fun.mostKills.kills} kills in match #${fun.mostKills.match_id}`);
      }
      if (fun.mostDeaths) {
        awards.push(`\u{1F480} **Sacrificial Lamb** — ${fun.mostDeaths.name}: ${fun.mostDeaths.deaths} deaths in match #${fun.mostDeaths.match_id}`);
      }
      if (fun.highestGPM) {
        awards.push(`\u{1F4B0} **Gold King** — ${fun.highestGPM.name}: ${fun.highestGPM.gpm} GPM in match #${fun.highestGPM.match_id}`);
      }
      if (fun.bloodbath && parseInt(fun.bloodbath.total_kills) >= 60) {
        const dur = fun.bloodbath.duration ? `${Math.floor(fun.bloodbath.duration / 60)}m` : '';
        awards.push(`\u{1F9DF} **Bloodbath** — Match #${fun.bloodbath.match_id}: ${fun.bloodbath.total_kills} kills${dur ? ` in ${dur}` : ''}`);
      }
      if (fun.fastGame && fun.fastGame.duration < 25 * 60) {
        const dur = `${Math.floor(fun.fastGame.duration / 60)}m${String(fun.fastGame.duration % 60).padStart(2, '0')}s`;
        awards.push(`\u26A1 **Fastest Game** — Match #${fun.fastGame.match_id}: ${dur}`);
      }
      if (fun.slowGame && fun.slowGame.duration > 50 * 60) {
        const dur = `${Math.floor(fun.slowGame.duration / 60)}m${String(fun.slowGame.duration % 60).padStart(2, '0')}s`;
        awards.push(`\u{1F62B} **Marathon** — Match #${fun.slowGame.match_id}: ${dur}`);
      }

      if (awards.length > 0) {
        embed.addFields({ name: '\u{1F3C5} Weekly Awards', value: awards.join('\n'), inline: false });
      }

      embed.setFooter({ text: 'Last 7 days \u2022 Use !top for full leaderboard' }).setTimestamp();

      await msg.reply({ embeds: [embed] });
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

      const embed = new EmbedBuilder()
        .setTitle('\u{1F4CA} Weekly Recap \u2014 Automated')
        .setColor(0x3b82f6)
        .addFields({
          name: `\u{1F3AE} ${matches.length} match${matches.length !== 1 ? 'es' : ''} this week`,
          value: `\u{1F7E2} Radiant ${radiantWins} \u2013 ${direWins} Dire \u{1F534}  \u2022  Avg game: ${avgDurStr}`,
          inline: false,
        });

      if (top_performers?.length > 0) {
        const topLines = top_performers.slice(0, 5).map((p, i) => {
          const kda = parseFloat(p.avg_kda).toFixed(2);
          const gpm = Math.round(parseFloat(p.avg_gpm));
          const medal = ['\u{1F947}', '\u{1F948}', '\u{1F949}'][i] || `${i + 1}.`;
          return `${medal} **${p.player_name}** \u2014 ${kda} KDA | ${gpm} GPM | ${p.games} games`;
        });
        embed.addFields({ name: '\u2B50 Top Performers', value: topLines.join('\n'), inline: false });
      }

      const awards = [];
      if (fun.highKDA) {
        const k = fun.highKDA;
        awards.push(`\u{1F451} **Best KDA** — ${k.name}: ${k.kills}/${k.deaths}/${k.assists} (${parseFloat(k.kda).toFixed(2)}) in #${k.match_id}`);
      }
      if (fun.mostKills) awards.push(`\u2694\uFE0F **Most Kills** — ${fun.mostKills.name}: ${fun.mostKills.kills} in #${fun.mostKills.match_id}`);
      if (fun.mostDeaths) awards.push(`\u{1F480} **Sacrificial Lamb** — ${fun.mostDeaths.name}: ${fun.mostDeaths.deaths} deaths in #${fun.mostDeaths.match_id}`);
      if (fun.highestGPM) awards.push(`\u{1F4B0} **Gold King** — ${fun.highestGPM.name}: ${fun.highestGPM.gpm} GPM in #${fun.highestGPM.match_id}`);
      if (fun.fastGame && fun.fastGame.duration < 25 * 60) {
        const d = `${Math.floor(fun.fastGame.duration / 60)}m${String(fun.fastGame.duration % 60).padStart(2, '0')}s`;
        awards.push(`\u26A1 **Fastest Game** — #${fun.fastGame.match_id}: ${d}`);
      }
      if (fun.slowGame && fun.slowGame.duration > 50 * 60) {
        const d = `${Math.floor(fun.slowGame.duration / 60)}m${String(fun.slowGame.duration % 60).padStart(2, '0')}s`;
        awards.push(`\u{1F62B} **Marathon** — #${fun.slowGame.match_id}: ${d}`);
      }

      if (awards.length > 0) embed.addFields({ name: '\u{1F3C5} Weekly Awards', value: awards.join('\n'), inline: false });
      embed.setFooter({ text: 'Use !top for full leaderboard' }).setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[Discord] Weekly recap post error:', err.message);
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
