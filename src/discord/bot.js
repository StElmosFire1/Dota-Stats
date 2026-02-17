const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { config } = require('../config');
const { getStatsService } = require('../stats/statsService');
const { getSheetsStore } = require('../sheets/sheetsStore');
const { getReplayParser } = require('../replay/replayParser');
const { getOpenDota } = require('../api/opendota');

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

    lobbyManager.on('matchEnded', async (lobby) => {
      const matchId = lobby.matchId;
      if (!matchId) {
        this._notifyChannel('Match ended but no match ID was captured. Use `!record <match_id>` manually.');
        return;
      }

      this._notifyChannel(`Match ended! Auto-recording match **${matchId}**...`);

      setTimeout(async () => {
        try {
          const opendota = getOpenDota();
          const sheetsStore = getSheetsStore();
          const statsService = getStatsService();

          let matchStats = await opendota.getMatch(matchId);
          if (!matchStats) {
            await opendota.requestParse(matchId);
            this._notifyChannel(`Match ${matchId} not on OpenDota yet. Parse requested. Try \`!record ${matchId}\` in a few minutes.`);
            return;
          }

          await sheetsStore.recordMatch(matchStats, lobby.name, 'auto');
          const radiantPlayers = matchStats.players.filter((p) => p.team === 'radiant');
          const direPlayers = matchStats.players.filter((p) => p.team === 'dire');
          await this._processRatings(matchStats, radiantPlayers, direPlayers, sheetsStore, statsService);

          const channel = this.lobbyChannelId ? this.client.channels.cache.get(this.lobbyChannelId) : null;
          if (channel) {
            await this._sendMatchSummary(matchStats, lobby.name, channel);
          }
        } catch (err) {
          console.error('[AutoRecord] Error:', err.message);
          this._notifyChannel(`Auto-record failed: ${err.message}. Use \`!record ${matchId}\` manually.`);
        }
      }, 30000);
    });
  }

  _notifyChannel(message) {
    if (this.lobbyChannelId) {
      const channel = this.client.channels.cache.get(this.lobbyChannelId);
      if (channel) channel.send(message).catch(() => {});
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
          case 'create_lobby': await this._cmdCreateLobby(msg, args); break;
          case 'lobby_status': await this._cmdLobbyStatus(msg); break;
          case 'end': await this._cmdEnd(msg); break;
          case 'record': await this._cmdRecord(msg, args); break;
          case 'top': await this._cmdTop(msg, args); break;
          case 'stats': await this._cmdStats(msg, args); break;
          case 'history': await this._cmdHistory(msg); break;
          case 'steam_status': await this._cmdSteamStatus(msg); break;
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
          name: '**Lobby Management**',
          value: [
            '`!create_lobby <name> <password>` - Create a private lobby via Steam',
            '`!lobby_status` - Check current lobby status',
            '`!end` - End current lobby',
          ].join('\n'),
        },
        {
          name: '**Match Recording**',
          value: [
            '`!record <match_id>` - Record a match from OpenDota (auto-fetches stats)',
            'Upload a `.dem` replay file - Bot extracts match ID and fetches stats',
          ].join('\n'),
        },
        {
          name: '**Stats & Rankings**',
          value: [
            '`!top [count]` - Show leaderboard (default top 10)',
            '`!stats [@user]` - Show player stats',
            '`!history` - Show recent match history',
          ].join('\n'),
        },
        {
          name: '**System**',
          value: [
            '`!steam_status` - Check Steam/Dota2/Sheets connection status',
            '`!help` - Show this message',
          ].join('\n'),
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
        embed.addFields({
          name: 'How to Join',
          value:
            `**Option 1:** Open Dota 2 console and type:\n` +
            `\`dota_join_lobby ${lobby.lobbyId} ${password}\`\n\n` +
            `**Option 2:** Search for "${name}" in the lobby browser\n` +
            `*(Play > Custom Lobbies > Find a Lobby)*`,
          inline: false
        });
      }

      embed
        .setDescription(
          'Lobby is ready! Use the join command below.\n' +
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
    if (!status.lobby) return msg.reply('No active lobby. Use `!create_lobby` to start one.');

    const embed = new EmbedBuilder()
      .setTitle('Current Lobby')
      .setColor(0x00ae86)
      .addFields(
        { name: 'Name', value: status.lobby.name, inline: true },
        { name: 'State', value: status.state, inline: true }
      );

    if (status.lobby.lobbyId) {
      embed.addFields({ name: 'Lobby ID', value: status.lobby.lobbyId, inline: true });
      const pw = status.lobby.password || '';
      embed.addFields({
        name: 'Join Command',
        value: `\`dota_join_lobby ${status.lobby.lobbyId}${pw ? ' ' + pw : ''}\``,
        inline: false
      });
    }
    if (status.lobby.matchId) embed.addFields({ name: 'Match ID', value: status.lobby.matchId, inline: true });

    await msg.reply({ embeds: [embed] });
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

      await sheetsStore.recordMatch(matchStats, '', msg.author.username);

      const radiantPlayers = matchStats.players.filter((p) => p.team === 'radiant');
      const direPlayers = matchStats.players.filter((p) => p.team === 'dire');

      await this._processRatings(matchStats, radiantPlayers, direPlayers, sheetsStore, statsService);
      await this._sendMatchSummary(matchStats, '', msg.channel);

      await statusMsg.edit(`Match ${matchId} recorded successfully!`);
    } catch (err) {
      await statusMsg.edit(`Failed to record match: ${err.message}`);
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
      const existing = await sheetsStore.getPlayerRating(p.id);
      if (existing) {
        p.mu = existing.mu;
        p.sigma = existing.sigma;
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
        await sheetsStore.updateRating(r.id, '', displayName, r.mu, r.sigma, r.mmr, won);
      }

      console.log(`[Ratings] Updated ${newRatings.length} player ratings.`);
    } catch (err) {
      console.error('[Ratings] Update error:', err.message);
    }
  }

  async _cmdTop(msg, args) {
    const sheetsStore = getSheetsStore();
    if (!sheetsStore.initialized) {
      return msg.reply('Google Sheets is not connected. Set `SHEET_ID` and upload `creds.json`.');
    }

    const limit = parseInt(args[0]) || 10;
    const leaderboard = await sheetsStore.getLeaderboard(limit);

    if (leaderboard.length === 0) return msg.reply('No ratings recorded yet. Play some games first!');

    const lines = leaderboard.map((p, i) => {
      const medal = i === 0 ? '\u{1F947}' : i === 1 ? '\u{1F948}' : i === 2 ? '\u{1F949}' : `${i + 1}.`;
      const winRate = p.gamesPlayed > 0 ? ((p.wins / p.gamesPlayed) * 100).toFixed(0) : 0;
      return `${medal} **${p.displayName}** \u2014 MMR: ${p.mmr} | ${p.wins}W-${p.losses}L (${winRate}%)`;
    });

    const embed = new EmbedBuilder()
      .setTitle('Inhouse Leaderboard')
      .setColor(0xffd700)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Top ${leaderboard.length} players | TrueSkill MMR` })
      .setTimestamp();

    await msg.reply({ embeds: [embed] });
  }

  async _cmdStats(msg, args) {
    const sheetsStore = getSheetsStore();
    if (!sheetsStore.initialized) {
      return msg.reply('Google Sheets is not connected. Set `SHEET_ID` and upload `creds.json`.');
    }

    const target = msg.mentions.users.first() || msg.author;
    const rating = await sheetsStore.getPlayerRating(target.id);

    if (!rating) return msg.reply(`No stats found for ${target.username}. Play some games first!`);

    const winRate = rating.gamesPlayed > 0
      ? ((rating.wins / rating.gamesPlayed) * 100).toFixed(1)
      : '0';

    const embed = new EmbedBuilder()
      .setTitle(`Stats: ${rating.displayName}`)
      .setColor(0x00ae86)
      .addFields(
        { name: 'MMR', value: rating.mmr.toString(), inline: true },
        { name: 'Games', value: rating.gamesPlayed.toString(), inline: true },
        { name: 'Win Rate', value: `${winRate}%`, inline: true },
        { name: 'Wins', value: rating.wins.toString(), inline: true },
        { name: 'Losses', value: rating.losses.toString(), inline: true },
        { name: 'Confidence', value: `\u00b1${(rating.sigma * 3).toFixed(0)}`, inline: true }
      )
      .setTimestamp();

    await msg.reply({ embeds: [embed] });
  }

  async _cmdHistory(msg) {
    const sheetsStore = getSheetsStore();
    if (!sheetsStore.initialized) {
      return msg.reply('Google Sheets is not connected. Set `SHEET_ID` and upload `creds.json`.');
    }

    const matches = await sheetsStore.getMatchHistory(10);
    if (matches.length === 0) return msg.reply('No matches recorded yet.');

    const lines = matches.map((m) => {
      const winner = m.radiantWin ? 'Radiant' : 'Dire';
      return `**${m.matchId}** \u2014 ${m.lobbyName || 'Manual'} | ${winner} Win | ${m.date}`;
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
    const opendota = getOpenDota();
    const sheetsStore = getSheetsStore();
    const statsService = getStatsService();

    await msg.reply('Downloading and analyzing replay...');

    try {
      const filename = `replay_${Date.now()}.dem`;
      const filePath = await replayParser.downloadReplay(attachment.url, filename);
      const replayData = replayParser.parseReplay(filePath);

      let matchId = replayData.matchId;

      if (matchId && !matchId.startsWith('replay_')) {
        await msg.channel.send(`Found match ID: ${matchId}. Fetching full stats from OpenDota...`);

        const matchStats = await opendota.getMatch(matchId);
        if (matchStats) {
          await sheetsStore.recordMatch(matchStats, '', msg.author.username);
          const radiantPlayers = matchStats.players.filter((p) => p.team === 'radiant');
          const direPlayers = matchStats.players.filter((p) => p.team === 'dire');
          await this._processRatings(matchStats, radiantPlayers, direPlayers, sheetsStore, statsService);
          await this._sendMatchSummary(matchStats, 'Replay Upload', msg.channel);
        } else {
          await msg.channel.send(
            `Match ${matchId} not found on OpenDota yet. Requesting parse...\n` +
            'Try `!record ' + matchId + '` in a few minutes after OpenDota parses it.'
          );
          await opendota.requestParse(matchId);
        }
      } else {
        await msg.channel.send(
          'Could not extract match ID from replay header.\n' +
          'Use `!record <match_id>` with the match ID if you know it.'
        );
      }

      replayParser.cleanup(filePath);
    } catch (err) {
      await msg.reply(`Replay processing failed: ${err.message}`);
    }
  }

  async _sendMatchSummary(matchStats, lobbyName, channel) {
    const statsService = getStatsService();
    const radiant = matchStats.players.filter((p) => p.team === 'radiant');
    const dire = matchStats.players.filter((p) => p.team === 'dire');

    const formatPlayer = (p) => {
      const name = p.personaname || `ID:${p.accountId}`;
      return `**${name}** (Hero ${p.heroId}) | ${p.kills}/${p.deaths}/${p.assists} | CS: ${p.lastHits}/${p.denies} | GPM: ${p.goldPerMin} | DMG: ${p.heroDamage}`;
    };

    const embed = new EmbedBuilder()
      .setTitle(`Match Recorded: ${matchStats.matchId}`)
      .setColor(matchStats.radiantWin ? 0x92fc6d : 0xff4444)
      .addFields(
        { name: 'Duration', value: statsService.formatDuration(matchStats.duration), inline: true },
        { name: 'Winner', value: matchStats.radiantWin ? 'Radiant' : 'Dire', inline: true },
        { name: 'Game Mode', value: matchStats.gameMode.toString(), inline: true }
      );

    const radiantText = radiant.map(formatPlayer).join('\n');
    const direText = dire.map(formatPlayer).join('\n');

    if (radiantText) {
      embed.addFields({
        name: `Radiant ${matchStats.radiantWin ? '(Winner) \u2705' : '\u274c'}`,
        value: radiantText.slice(0, 1024),
      });
    }
    if (direText) {
      embed.addFields({
        name: `Dire ${!matchStats.radiantWin ? '(Winner) \u2705' : '\u274c'}`,
        value: direText.slice(0, 1024),
      });
    }

    if (lobbyName) {
      embed.addFields({ name: 'Lobby', value: lobbyName, inline: true });
    }

    embed
      .setFooter({ text: 'Stats from OpenDota | TrueSkill MMR updated' })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  }

  async start() {
    if (!config.discord.token) throw new Error('DISCORD_TOKEN not configured.');
    await this.client.login(config.discord.token);
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
