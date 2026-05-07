const { Client, GatewayIntentBits, Partials, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const cron = require('node-cron');
const { config, getMmrTier } = require('../config');
const { getStatsService } = require('../stats/statsService');
const { getSheetsStore } = require('../sheets/sheetsStore');
const { getReplayParser } = require('../replay/replayParser');
const { getOpenDota } = require('../api/opendota');
const db = require('../db');
const { generateWeeklyRecapBlurb, generatePlayerAnalysis, generatePlayerRoast, generateMatchMvpBlurb, generateMatchNarrative } = require('../services/groqService');
const { generateScoreboardImage, generateLeaderboardImage } = require('../services/scoreboardImage');

const OWNER_DISCORD_ID = '135991380760592384';

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
  } catch (err) {
    console.error('[LobbyManager] Failed to load lobby manager:', err.message);
    return null;
  }
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
        GatewayIntentBits.GuildVoiceStates,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    });
    this.prefix = config.discord.prefix;
    this.lobbyChannelId = null;
    this.pendingRatingSessions = new Map();
    this.pendingRegistrations = new Map(); // discord_id → { gameId, prompted }
    this._announcedMatchIds = new Set(); // dedup guard — prevents double-posting the same match
    // Stores last !balance result for !assign to apply.
    // { radiant: [{name, mmr, steam64, discordId}], dire: [{...}] }
    this._lastBalance = null;
    // Inhouse queue state
    this._inhouseQueue = new Map(); // discordId → { discordId, accountId, mmr, nickname }
    this._queueMsgRef = null;       // { channelId, messageId } for the live embed
    this._connectionMonitorTimer = null;
    this._setupHandlers();
  }

  setSteamAvailable(available) {
    steamAvailable = available;
  }

  setCommandsDisabled(disabled) {
    this._commandsDisabled = disabled;
    if (disabled) console.log('[Discord] Commands disabled — this instance is not the primary Steam session.');
  }

  _resolveLobbyManager() {
    if (this._lobbyManager) return this._lobbyManager;
    const lm = tryGetLobbyManager();
    if (lm) {
      console.log('[Bot] Lobby manager resolved via fallback require — caching on instance.');
      this._lobbyManager = lm;
    }
    return lm;
  }

  setupLobbyEvents(lobbyManager) {
    this._lobbyManager = lobbyManager;
    lobbyManager.on('matchIdCaptured', (matchId) => {
      this._notifyChannel(`Match detected! Match ID: **${matchId}**. Stats will auto-record when the game ends.`);
    });

    lobbyManager.on('matchStarted', async (lobby) => {
      this._notifyChannel(`Game is now **in progress** for lobby "${lobby.name}".`);
      // Move players into their team voice channels.
      await this._movePlayersToVoiceChannels(lobby).catch(e =>
        console.warn('[Discord] Voice channel move on matchStarted failed:', e.message)
      );
    });

    lobbyManager.on('launchedAndLeft', ({ matchId, lobbyName }) => {
      const idNote = matchId ? `Match ID: **${matchId}**` : 'Match ID not yet assigned by the game server';
      this._notifyChannel(
        `🚀 **Game launched!** Bot has stepped back from the lobby so it doesn't block the game connection.\n` +
        `${idNote}\n` +
        `Stats will auto-record via OpenDota when the game ends. If auto-record doesn't trigger within 2 hours, use \`!record ${matchId || '<match_id>'}\`.`
      );
      if (matchId) {
        this._pollAndRecordMatch(matchId, lobbyName);
      }
    });

    // Fired when launchLobby() detects the bot is still in a game slot at launch time.
    // Valve will not allow the lobby creator to leave a game slot, so the bot leaves the
    // lobby entirely before the game is launched. The new lobby host (whoever Valve picks
    // from the remaining players) must click Start Game in their Dota 2 client.
    lobbyManager.on('mustManualLaunch', ({ lobbyName, players, willRejoin }) => {
      const humanCount = players.filter(p => p.team === 0 || p.team === 1).length - 1; // minus bot
      const rejoinNote = willRejoin
        ? `The bot is rejoining the lobby as a spectator — stats should auto-record when the game ends as normal.`
        : `The bot could not rejoin — after the game type \`!gc_record <matchId>\` to record stats.`;
      this._notifyChannel(
        `⚠️ **Action required — please launch the game manually.**\n\n` +
        `The bot stepped out of **${lobbyName}** so its Radiant slot is empty at launch time ` +
        `(Valve prevents the lobby creator from moving to spectator — an occupied-but-absent slot kills the game).\n\n` +
        `**What to do:**\n` +
        `1. One of you is now the lobby host — check the top-right of the lobby screen.\n` +
        `2. The new host clicks ▶ **Start Game** whenever everyone is ready.\n\n` +
        `The bot will automatically join the game as a spectator once it starts and record full stats when it ends.\n` +
        `_(If auto-record doesn't post within 10 min of the game ending, type \`!gc_record <matchId>\` as a fallback.)_\n\n` +
        `_(${humanCount} human player(s) — bots will fill remaining slots)_`
      );
    });

    lobbyManager.on('spectatorJoined', ({ lobbyName, playerCount }) => {
      const playerNote = playerCount ? ` (${playerCount} players)` : '';
      this._notifyChannel(`👁️ Bot has joined **${lobbyName}** as a spectator and is watching the game${playerNote}. Stats will auto-record when it ends.`);
    });

    lobbyManager.on('connectionFailed', (lobby) => {
      const msg =
        `⚠️ **Game connection failed** — a player didn't load in time and the server dropped everyone back to the lobby.\n` +
        `The countdown will restart automatically once all 10 players are seated again. ` +
        `If you see a loading spinner next to a player in the lobby, ask them to relaunch Dota 2.`;
      this._notifyChannel(msg);
      // Also post in lobby chat so players inside the lobby see it.
      try {
        const { getLobbyManager } = require('../lobby/lobbyManager');
        getLobbyManager()._chat('⚠️ Connection failed — recheck your seats. Countdown will restart when all 10 are ready.');
      } catch {}
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

    lobbyManager.on('serverAssigned', ({ serverRegion, onDedicatedServer }) => {
      const ds = config.dota?.dedicatedServer;
      if (ds?.ip) {
        const regionNames = { 1: 'US West', 2: 'US East', 3: 'Europe', 5: 'SEA', 7: 'Australia' };
        const regionName = regionNames[serverRegion] || `Region ${serverRegion}`;
        if (onDedicatedServer) {
          this._notifyChannel(`🖥️ Game server assigned: **${regionName}** — running on your dedicated server (${ds.ip}:${ds.port || 27015})`);
        } else {
          this._notifyChannel(`🖥️ Game server assigned: **${regionName}** (Valve server). Dedicated server at ${ds.ip} was not selected by the GC.`);
        }
      }
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
        const ds = config.dota?.dedicatedServer;
        const hasSshConfig = !!(ds?.ssh?.host && ds?.ssh?.privateKey);

        if (hasSshConfig) {
          // Dedicated server path — SSH-fetch the .dem immediately after game ends.
          // Wait 60s for the game server to fully flush and close the replay file.
          setTimeout(async () => {
            try {
              const { fetchLatestReplay } = require('../services/serverReplayFetcher');
              const { processReplayInternal } = require('../web/server');
              const fs = require('fs');
              this._notifyChannel(`🖥️ Fetching replay from dedicated server for match **${matchId}**...`);
              const r = await fetchLatestReplay();
              const sizeMb = (fs.statSync(r.localPath).size / 1024 / 1024).toFixed(1);
              this._notifyChannel(`📦 Replay fetched (${sizeMb} MB) — parsing match **${matchId}**...`);
              await processReplayInternal(r.localPath, `auto-ds:${matchId}`, { remotePath: r.remotePath });
              try { fs.unlinkSync(r.localPath); } catch (_) {}
              console.log(`[ReplayDL] Dedicated server replay pipeline complete for match ${matchId}`);
            } catch (err) {
              console.warn(`[ReplayDL] Dedicated server replay fetch failed: ${err.message} — falling back to Steam GC`);
              this._notifyChannel(`⚠️ Dedicated server replay fetch failed: ${err.message}. Falling back to Steam GC download...`);
              const steamClient = tryGetSteamClient();
              const gcClient = steamClient?.gcClient;
              if (gcClient) {
                try {
                  const { autoDownloadAndProcessReplay } = require('../services/replayDownloader');
                  const { processReplayInternal } = require('../web/server');
                  autoDownloadAndProcessReplay(
                    gcClient, matchId,
                    (filePath, source) => processReplayInternal(filePath, source),
                    (msg) => this._notifyChannel(msg)
                  ).catch(e => console.error('[ReplayDL] Fallback GC error:', e.message));
                } catch (e) {
                  console.warn('[ReplayDL] Could not start GC fallback:', e.message);
                }
              } else {
                console.warn('[ReplayDL] No GC client available for fallback.');
              }
            }
          }, 60000);
        } else {
          // Original Steam GC path
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

  // Called on matchStarted — moves each lobby player to their team's voice channel.
  // Move all known players in `accountIds` (32-bit ids) into the configured
  // lobby voice channel — used after a match completes / before the next draft
  // so everyone ends up back in the same room.
  async _movePlayersToLobbyChannel(accountIds) {
    const lobbyChId = config.discord.lobbyVoiceChannelId;
    if (!lobbyChId || !Array.isArray(accountIds) || accountIds.length === 0) return;
    const guilds = [...this.client.guilds.cache.values()];
    let moved = 0, skipped = 0;
    for (const accountId32 of accountIds) {
      const discordId = await db.getDiscordIdByAccountId(String(accountId32)).catch(() => null);
      if (!discordId) { skipped++; continue; }
      for (const guild of guilds) {
        try {
          const member = await guild.members.fetch(discordId).catch(() => null);
          if (!member?.voice?.channel) continue;
          if (member.voice.channelId === lobbyChId) { break; }
          await member.voice.setChannel(lobbyChId);
          moved++;
          break;
        } catch (e) {
          console.warn(`[Discord] Lobby voice move failed for ${discordId}:`, e.message);
        }
      }
    }
    console.log(`[Discord] Lobby voice move: ${moved} moved, ${skipped} skipped.`);
    if (moved > 0) {
      this._notifyChannel(`🎙️ Moved **${moved}** player(s) back to the lobby voice channel.`);
    }
  }

  async _movePlayersToVoiceChannels(lobby) {
    const direChId = config.discord.direVoiceChannelId;
    const radChId = config.discord.radiantVoiceChannelId;
    if (!direChId || !radChId) return;

    const STEAM64_OFFSET = 76561197960265728n;
    const players = lobby.players || [];
    if (!players.length) return;

    // Gather all guilds the bot is in.
    const guilds = [...this.client.guilds.cache.values()];
    let moved = 0, skipped = 0;

    for (const p of players) {
      const team = p.team; // 0=Radiant, 1=Dire
      if (team !== 0 && team !== 1) continue;
      if (!p.steamId || p.steamId === '0') { skipped++; continue; }

      let discordId = null;
      try {
        const accountId32 = (BigInt(p.steamId) - STEAM64_OFFSET).toString();
        discordId = await db.getDiscordIdByAccountId(accountId32).catch(() => null);
      } catch { skipped++; continue; }

      if (!discordId) { skipped++; continue; }

      const targetChannelId = team === 0 ? radChId : direChId;

      for (const guild of guilds) {
        try {
          const member = await guild.members.fetch(discordId).catch(() => null);
          if (!member?.voice?.channel) continue;
          await member.voice.setChannel(targetChannelId);
          moved++;
          break; // found in this guild, no need to check others
        } catch (e) {
          console.warn(`[Discord] Voice move failed for ${discordId}:`, e.message);
        }
      }
    }

    console.log(`[Discord] Voice channel move: ${moved} moved, ${skipped} skipped.`);
    if (moved > 0) {
      this._notifyChannel(`🎙️ Moved **${moved}** player(s) to their team voice channels.`);
    }
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
    this.client.on('ready', async () => {
      console.log(`[Discord] Bot online as ${this.client.user.tag}`);
      this.client.user.setActivity('Dota 2 Inhouse | !help', { type: 3 });
      // Restore queue from DB so players don't lose their spot after a restart
      try {
        const rows = await db.getQueue();
        for (const row of rows) {
          this._inhouseQueue.set(row.discord_id, {
            discordId: row.discord_id,
            accountId: row.account_id.toString(),
            mmr: Math.round(Number(row.mmr) || 2600),
            nickname: row.nickname || 'Unknown',
          });
        }
        if (this._inhouseQueue.size > 0) {
          console.log(`[Queue] Restored ${this._inhouseQueue.size} player(s) from DB after restart.`);
          // Re-post the queue embed so the channel is up to date after restart
          try {
            const queueChannelId = config.discord.queueChannelId;
            let queueCh = null;
            if (queueChannelId) {
              queueCh = this.client.channels.cache.get(queueChannelId)
                || await this.client.channels.fetch(queueChannelId).catch(() => null);
            }
            if (queueCh) {
              const embed = this._buildQueueEmbed();
              const freshMsg = await queueCh.send({
                content: `♻️ Bot restarted — queue restored with **${this._inhouseQueue.size}** player(s).`,
                embeds: [embed],
              }).catch(() => null);
              if (freshMsg) this._queueMsgRef = { channelId: queueCh.id, messageId: freshMsg.id };
            }
          } catch (embedErr) {
            console.warn('[Queue] Could not re-post queue embed after restart:', embedErr.message);
          }

          // If the queue was already full when the bot restarted, auto-launch immediately
          // (provided no session is already running — checked inside _autoLaunchQueue).
          if (this._inhouseQueue.size >= 10) {
            console.log('[Queue] Restored queue is full — auto-launching after 5s delay.');
            setTimeout(() => {
              this._autoLaunchQueue(null).catch(e =>
                console.error('[Queue] Startup auto-launch error:', e.message)
              );
            }, 5000);
          }
        }
      } catch (err) {
        console.warn('[Queue] Failed to restore queue from DB:', err.message);
      }
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
      if (this._commandsDisabled) return;

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
          case 'perf-backfill': case 'perfbackfill': await this._cmdPerfBackfill(msg, args); break;
          case 'recompute-baselines': case 'recomputebaselines': await this._cmdRecomputeBaselines(msg, args); break;
          case 'top': await this._cmdTop(msg, args); break;
          case 'stats': await this._cmdStats(msg, args); break;
          case 'analyze': case 'analyse': await this._cmdAnalyze(msg, args); break;
          case 'roast': await this._cmdRoast(msg, args); break;
          case 'history': await this._cmdHistory(msg); break;
          case 'register': await this._cmdRegister(msg, args); break;
          case 'adminregister': await this._cmdAdminRegister(msg, args); break;
          case 'players': await this._cmdPlayers(msg); break;
          case 'recap': await this._cmdRecap(msg); break;
          case 'herostats': await this._cmdHeroStats(msg, args); break;
          case 'vs': await this._cmdVs(msg, args); break;
          case 'match': await this._cmdMatch(msg, args); break;
          case 'predict': await this._cmdPredict(msg, args); break;
          case 'predictions': await this._cmdPredictions(msg, args); break;
          case 'balance': await this._cmdBalance(msg, args); break;
          case 'assign': await this._cmdAssign(msg); break;
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
          case 'testgame': await this._cmdTestGame(msg, args); break;
          case 'testdm': await this._cmdTestDm(msg, args); break;
          case 'testrsvpdm': await this._cmdTestRsvpDm(msg, args); break;
          case 'create_lobby': await this._cmdCreateLobby(msg, args); break;
          case 'join_lobby': await this._cmdJoinLobby(msg, args); break;
          case 'lobby_status': await this._cmdLobbyStatus(msg); break;
          case 'ds_status': await this._cmdDsStatus(msg); break;
          case 'ds_replay': await this._cmdDsReplay(msg); break;
          case 'inhouse': await this._cmdInhouse(msg, args); break;
          case 'queue': await this._cmdQueue(msg, args); break;
          case 'gc_debug': await this._cmdGcDebug(msg); break;
          case 'invite': await this._cmdInvite(msg, args); break;
          case 'invite_me': await this._cmdInviteMe(msg); break;
          case 'end': await this._cmdEnd(msg); break;
          case 'start_game': await this._cmdStartGame(msg); break;
          case 'gc_record': await this._cmdGcRecord(msg, args); break;
          case 'captains': await this._cmdCaptains(msg); break;
          case 'roll': await this._cmdRoll(msg); break;
          case 'hrcaptains': await this._cmdHrCaptains(msg); break;
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
            '`!adminregister @Player <steam_id>` - Register a player on their behalf (owner only)',
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
            '`!assign` - Apply the last !balance result: move players into lobby slots + voice channels',
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
          name: '🎯 Auto-Queue',
          value: [
            '`!queue join` — Join the inhouse queue (must have Steam linked)',
            '`!queue leave` — Leave the queue',
            '`!queue status` — Show current queue',
            '`!queue clear` — Clear the queue *(admin)*',
            '`!queue force` — Force-launch with current players *(admin)*',
            'When 10 players join, teams are auto-balanced by MMR and a game starts instantly!',
          ].join('\n'),
        },
        {
          name: '🎮 Lobby Management',
          value: [
            '`!create_lobby [name]` - Create a Dota 2 CM lobby (name optional, default "OCE Inhouse")',
            '`!lobby_status` - Show current lobby info and how to join',
            '`!ds_status` - Check dedicated game server health',
            '`!ds_replay` - Pull the latest .dem replay from the dedicated server (admin)',
            '`!inhouse` - Open or status the FACEIT-style inhouse session (admin)',
            '`!invite <steam64_id>` - Send a lobby invite to a player by Steam64 ID',
            '`!invite @user` - Send a lobby invite to a Discord-linked player by @mention',
            '`!invite_me` - Invite yourself (your Discord must be linked on the Players page)',
            '`!join_lobby` - Force the bot to join an existing lobby it was invited to',
            '`!start_game` - Launch the game immediately from the lobby',
            '`!end` - Close/abandon the current lobby',
            '`!captains` - Pick 2 random captains from lobby players',
            '`!hrcaptains` - Pick the 2 highest-MMR players in lobby as captains',
            '`!roll` - Roll a number 1–100 for yourself',
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
        'Set `STEAM_ACCOUNT` and `STEAM_PASSWORD` in secrets.'
      );
    }

    const name = args.length > 0 ? args.join(' ') : 'OCE Inhouse';
    const lobbyManager = this._resolveLobbyManager();
    if (!lobbyManager) return msg.reply('Lobby manager is not available — the bot may need a restart.');

    const steamClient = tryGetSteamClient();
    if (!steamClient?.isGCReady || !steamClient?.gcClient) {
      return msg.reply('The Dota 2 Game Coordinator is not connected yet. Wait a moment and try again, or check `!steam_status`.');
    }

    this.lobbyChannelId = msg.channel.id;
    await msg.reply('Creating lobby, please wait...');

    try {
      const lobby = await lobbyManager.createLobby(name, '', msg.author.id);

      const embed = new EmbedBuilder()
        .setTitle('Lobby Created!')
        .setColor(0x00ff00)
        .addFields(
          { name: 'Name', value: name, inline: true },
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
    const lobbyManager = this._resolveLobbyManager();
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
        '3. Type `!invite_me` for a direct invite (Discord must be linked)\n' +
        '4. Or use `!invite <steam64_id>` or `!invite @user`',
      inline: false
    });

    await msg.reply({ embeds: [embed] });
  }

  async _cmdDsStatus(msg) {
    const ds = config.dota?.dedicatedServer;
    if (!ds?.ip) {
      return msg.reply('No dedicated server configured. Set `DEDICATED_SERVER_IP` in environment variables.');
    }
    const ip = ds.ip;
    const port = ds.port || 27015;
    await msg.reply(`Checking dedicated server at **${ip}:${port}**...`);

    // Source A2S_INFO query — standard server browser protocol used by all Source/Source 2 games
    const online = await new Promise((resolve) => {
      const dgram = require('dgram');
      const socket = dgram.createSocket('udp4');
      const query = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x54, ...Buffer.from('Source Engine Query\0')]);
      let done = false;
      const finish = (result) => { if (!done) { done = true; socket.close(); resolve(result); } };
      socket.on('message', () => finish(true));
      socket.on('error', () => finish(false));
      socket.send(query, 0, query.length, port, ip, (err) => { if (err) finish(false); });
      setTimeout(() => finish(false), 5000);
    });

    const embed = new EmbedBuilder()
      .setTitle('Dedicated Server Status')
      .setColor(online ? 0x00ae86 : 0xe74c3c)
      .addFields(
        { name: 'Address', value: `${ip}:${port}`, inline: true },
        { name: 'Status', value: online ? '🟢 Online' : '🔴 Offline', inline: true },
      );

    if (ds.steamId) {
      embed.addFields({ name: 'Server Steam ID', value: ds.steamId, inline: false });
    }

    if (!online) {
      embed.setFooter({ text: 'To start the server: SSH in and run screen -dmS dota2 /opt/dota2/start_server.sh' });
    }

    await msg.reply({ embeds: [embed] });
  }

  async _cmdDsReplay(msg) {
    if (!this._isAdmin(msg)) return msg.reply('Admin only.');
    try {
      const { fetchLatestReplay } = require('../services/serverReplayFetcher');
      await msg.reply('Fetching latest replay from the dedicated server over SSH...');
      const r = await fetchLatestReplay();
      const sizeMb = (require('fs').statSync(r.localPath).size / 1024 / 1024).toFixed(1);
      await msg.reply(`✅ Pulled **${r.filename}** (${sizeMb} MB) → \`${r.localPath}\`\n\nNext: feed it into the parser to record the match.`);
    } catch (err) {
      await msg.reply(`❌ Replay fetch failed: ${err.message}\n\nCheck DEDICATED_SERVER_SSH_PRIVATE_KEY, DEDICATED_SERVER_SSH_USER, DEDICATED_SERVER_REPLAY_DIR.`);
    }
  }

  async _cmdInhouse(msg, args) {
    const db = require('../db');
    const sub = (args[0] || 'status').toLowerCase();

    if (sub === 'status') {
      try {
        const session = await db.getActiveInhouseSession();
        if (!session) return msg.reply('No active inhouse session. Start one at the dashboard `/inhouse` page or with `!inhouse open`.');
        const players = await db.getInhouseSessionPlayers(session.id);
        const accepted = players.filter(p => p.status === 'accepted').length;
        const lines = [
          `**Inhouse Session #${session.id}** — \`${session.status.toUpperCase()}\``,
          `Captain mode: \`${session.captain_mode}\``,
          `Players: **${players.length}** registered, **${accepted}** accepted`,
        ];
        if (session.match_password && session.server_ip) {
          lines.push(`Server: \`${session.server_ip}:${session.server_port}\` · password \`${session.match_password}\``);
          lines.push(`Connect: <steam://connect/${session.server_ip}:${session.server_port}/${encodeURIComponent(session.match_password)}>`);
        }
        lines.push(`\nManage at the dashboard: \`/inhouse\``);
        return msg.reply(lines.join('\n'));
      } catch (err) {
        return msg.reply(`Error: ${err.message}`);
      }
    }

    if (sub === 'open' || sub === 'create') {
      if (!this._isAdmin(msg)) return msg.reply('Admin only.');
      try {
        const captainMode = (args[1] || 'highest_rank').toLowerCase();
        if (!['highest_rank','random','highest_roll'].includes(captainMode)) {
          return msg.reply('Captain mode must be one of: `highest_rank`, `random`, `highest_roll`.');
        }
        const existing = await db.getActiveInhouseSession();
        if (existing) return msg.reply(`There's already an active session (#${existing.id} — \`${existing.status}\`). Cancel it first at \`/inhouse\`.`);
        const session = await db.createInhouseSession({ captainMode, createdBy: msg.author?.tag || 'discord-admin' });
        return msg.reply(`✅ Opened inhouse session **#${session.id}** with captain mode \`${captainMode}\`.\nPlayers can now join at \`/inhouse\`.`);
      } catch (err) {
        return msg.reply(`Error: ${err.message}`);
      }
    }

    return msg.reply('Usage: `!inhouse status` | `!inhouse open [highest_rank|random|highest_roll]`');
  }

  // ---------------------------------------------------------------
  // Admin permission helper (also used by existing commands)
  // ---------------------------------------------------------------
  _isAdmin(msg) {
    if (!msg?.author) return false;
    return (
      msg.author.id === OWNER_DISCORD_ID ||
      msg.member?.permissions?.has('ManageGuild') ||
      msg.member?.permissions?.has('Administrator')
    );
  }

  // ---------------------------------------------------------------
  // Inhouse queue helpers
  // ---------------------------------------------------------------

  _buildQueueEmbed() {
    const players = [...this._inhouseQueue.values()].sort((a, b) => b.mmr - a.mmr);
    const count = players.length;
    const color = count >= 10 ? 0x4caf50 : count >= 7 ? 0xff9800 : 0x2196f3;
    const embed = new EmbedBuilder()
      .setTitle(`🎮 Inhouse Queue — ${count}/10`)
      .setColor(color)
      .setTimestamp();
    if (players.length === 0) {
      embed.setDescription('No players in queue. Type `!queue join` to be first!');
    } else {
      const lines = players.map((p, i) => `${i + 1}. **${p.nickname}** — ${p.mmr} MMR`);
      embed.setDescription(lines.join('\n'));
      embed.setFooter({
        text: count >= 10
          ? '🚀 Full! Starting game…'
          : `${10 - count} more player${10 - count === 1 ? '' : 's'} needed`,
      });
    }
    return embed;
  }

  async _postOrUpdateQueueEmbed(fallbackChannel) {
    const embed = this._buildQueueEmbed();
    const queueChannelId = config.discord.queueChannelId;
    let channel = null;
    if (queueChannelId) {
      channel = this.client.channels.cache.get(queueChannelId)
        || await this.client.channels.fetch(queueChannelId).catch(() => null);
    }
    if (!channel) channel = fallbackChannel;
    if (!channel) return;

    // Try to edit the existing live-embed message
    if (this._queueMsgRef) {
      try {
        const prevCh = this.client.channels.cache.get(this._queueMsgRef.channelId)
          || await this.client.channels.fetch(this._queueMsgRef.channelId).catch(() => null);
        if (prevCh) {
          const prevMsg = await prevCh.messages.fetch(this._queueMsgRef.messageId).catch(() => null);
          if (prevMsg) {
            await prevMsg.edit({ embeds: [embed] });
            return;
          }
        }
      } catch (_) {}
    }

    // Post a fresh embed
    const sent = await channel.send({ embeds: [embed] }).catch(() => null);
    if (sent) this._queueMsgRef = { channelId: channel.id, messageId: sent.id };
  }

  _notifyQueueChannel(message) {
    const ids = new Set();
    if (config.discord.queueChannelId) ids.add(config.discord.queueChannelId);
    config.discord.statsChannelIds.forEach(id => ids.add(id));
    if (this.lobbyChannelId) ids.add(this.lobbyChannelId);
    for (const id of ids) {
      const ch = this.client.channels.cache.get(id);
      if (ch) {
        ch.send(message).catch(() => {});
      } else {
        // Channel not in cache — fetch and send (non-blocking)
        this.client.channels.fetch(id).then(fetched => {
          if (fetched) fetched.send(message).catch(() => {});
        }).catch(() => {});
      }
    }
  }

  // Shared MMR balance algorithm (used by !balance, !rematch, and auto-queue)
  _mmrBalancePlayers(players) {
    const n = players.length;
    const half = Math.floor(n / 2);
    const indices = Array.from({ length: n }, (_, i) => i);
    function combinations(arr, k) {
      if (k === 0) return [[]];
      if (arr.length < k) return [];
      const [first, ...rest] = arr;
      return [...combinations(rest, k - 1).map(c => [first, ...c]), ...combinations(rest, k)];
    }
    const combos = combinations(indices, half);
    let bestDiff = Infinity, bestA = [], bestB = [];
    for (const comboA of combos) {
      const comboB = indices.filter(i => !comboA.includes(i));
      const mmrA = comboA.reduce((s, i) => s + players[i].mmr, 0);
      const mmrB = comboB.reduce((s, i) => s + players[i].mmr, 0);
      const diff = Math.abs(mmrA - mmrB);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestA = comboA.map(i => players[i]);
        bestB = comboB.map(i => players[i]);
      }
    }
    return { radiant: bestA, dire: bestB, diff: bestDiff };
  }

  // Parse Steam IDs from RCON 'status' output
  // Format: "STEAM_X:Y:Z" — accountId32 = Z*2+Y, steam64 = accountId32 + offset
  _parseRconStatusSteamIds(statusOutput) {
    const ids = new Set();
    if (!statusOutput) return ids;
    const STEAM64_OFFSET = 76561197960265728n;
    const re = /STEAM_\d+:(\d+):(\d+)/g;
    let m;
    while ((m = re.exec(statusOutput)) !== null) {
      const y = parseInt(m[1], 10);
      const z = parseInt(m[2], 10);
      const accountId32 = z * 2 + y;
      try {
        ids.add((BigInt(accountId32) + STEAM64_OFFSET).toString());
      } catch (_) {}
    }
    return ids;
  }

  // Start a periodic RCON-poll that pings Discord-linked players who haven't
  // connected to the game server within the configured timeout.
  _startConnectionMonitor(session, players) {
    if (this._connectionMonitorTimer) {
      clearInterval(this._connectionMonitorTimer);
      this._connectionMonitorTimer = null;
    }
    const ds = config.dota?.dedicatedServer;
    if (!ds?.ip || !ds?.rconPassword) return; // no RCON config, nothing to check

    const hasSshConfig = !!(ds.ssh?.host && ds.ssh?.privateKey);
    const timeoutMs = (config.discord.queueTimeoutMinutes || 10) * 60 * 1000;
    const pingIntervalMs = 30_000;
    const MAX_GAME_WATCH_MS = 3 * 60 * 60 * 1000; // 3-hour hard cap on game watch phase
    let elapsed = 0;
    let allConnected = false;
    let gameWatchElapsed = 0;
    let gameEndTriggered = false;
    // Guards game-watch phase: only enter if at least one expected player was ever
    // observed on the server — prevents false "game ended" when nobody joined at all.
    let gameEverStarted = false;
    console.log(`[Queue] Connection monitor started — ${players.length} expected, timeout ${timeoutMs / 60000} min`);

    this._connectionMonitorTimer = setInterval(async () => {
      elapsed += pingIntervalMs;
      try {
        const { pingServer } = require('../services/rconClient');
        const result = await pingServer();
        if (!result.ok) {
          console.warn('[Queue] RCON ping failed:', result.error);
          if (!allConnected && elapsed >= timeoutMs + pingIntervalMs) {
            clearInterval(this._connectionMonitorTimer);
            this._connectionMonitorTimer = null;
          }
          return;
        }

        const connectedIds = this._parseRconStatusSteamIds(result.response);
        const missing = players.filter(p => p.steam64 && !connectedIds.has(p.steam64));

        // Mark game started when a majority (≥60%) of expected players are simultaneously
        // connected in the same poll. Requiring a threshold prevents a single player who
        // briefly joins the lobby before the match starts from triggering game-watch mode.
        if (!gameEverStarted) {
          const expectedConnected = players.filter(p => p.steam64 && connectedIds.has(p.steam64)).length;
          const threshold = Math.max(2, Math.ceil(players.length * 0.6));
          if (expectedConnected >= threshold) {
            gameEverStarted = true;
            console.log(`[Queue] Game started — ${expectedConnected}/${players.length} expected players on server.`);
          }
        }

        if (!allConnected) {
          // === Phase 1: Wait for all players to connect ===
          if (missing.length === 0 && elapsed > pingIntervalMs) {
            allConnected = true;
            console.log('[Queue] All players connected — switching to game-watch mode.');
            this._notifyQueueChannel(`✅ All ${players.length} players connected! Good luck!`);
            // Do NOT stop — continue monitoring for game end in Phase 2 below
          } else if (elapsed >= timeoutMs) {
            if (missing.length > 0) {
              const mentions = missing.filter(p => p.discordId).map(p => `<@${p.discordId}>`).join(' ');
              const nameList = missing.map(p => `**${p.nickname}**`).join(', ');
              this._notifyQueueChannel(
                `⏰ **Connection timeout!** ${nameList} ${missing.length === 1 ? 'has' : 'have'} not connected.\n` +
                `${mentions ? mentions + ' — ' : ''}please join now!\n` +
                `Server: \`${session.server_ip}:${session.server_port}\` · Password: \`${session.match_password}\``
              );
              console.log(`[Queue] Connection timeout — ${missing.length} player(s) missing.`);
            }
            if (gameEverStarted) {
              // At least one player was seen — game is underway, switch to game-watch
              allConnected = true;
              console.log('[Queue] Timeout with partial connects; game started — continuing game-watch.');
            } else {
              // Nobody ever connected — stop cleanly, no game to watch for
              clearInterval(this._connectionMonitorTimer);
              this._connectionMonitorTimer = null;
              console.log('[Queue] Timeout with zero players connected — monitor stopped (no game).');
            }
          }
        } else {
          // === Phase 2: Game-watch — detect when all players have left (game over) ===
          gameWatchElapsed += pingIntervalMs;

          // Only trigger game-end if the game actually started (players were seen on server)
          if (!gameEndTriggered && gameEverStarted && connectedIds.size === 0) {
            // All players have disconnected — game has ended
            gameEndTriggered = true;
            clearInterval(this._connectionMonitorTimer);
            this._connectionMonitorTimer = null;
            console.log('[Queue] Game end detected via RCON (all players disconnected).');

            // Only use SSH replay fetch if GC is not currently available.
            // When GC is connected, the matchEnded event handles post-game automatically
            // and the SSH path would cause duplicate processing of the same game.
            const gcCurrentlyAvailable = !!(
              tryGetSteamClient()?.isGCReady && tryGetSteamClient()?.gcClient
            );
            if (hasSshConfig && !gcCurrentlyAvailable) {
              // SSH replay fetch: automatic fallback for GC-unavailable dedicated server games.
              this._notifyQueueChannel(
                '🏁 Game ended — fetching replay from dedicated server in 60 s...'
              );
              setTimeout(async () => {
                try {
                  const { fetchLatestReplay } = require('../services/serverReplayFetcher');
                  const { processReplayInternal } = require('../web/server');
                  const fs = require('fs');
                  this._notifyQueueChannel('📦 Fetching replay from server...');
                  const r = await fetchLatestReplay();
                  const sizeMb = (fs.statSync(r.localPath).size / 1024 / 1024).toFixed(1);
                  this._notifyQueueChannel(`📦 Replay fetched (${sizeMb} MB) — parsing...`);
                  await processReplayInternal(r.localPath, `auto-queue:${session.id}`, { remotePath: r.remotePath });
                  try { fs.unlinkSync(r.localPath); } catch (_) {}
                  console.log(`[Queue] Post-game SSH replay pipeline complete (session ${session.id}).`);
                } catch (err) {
                  console.warn('[Queue] Post-game SSH replay fetch failed:', err.message);
                  this._notifyQueueChannel(
                    `⚠️ Replay fetch failed: ${err.message}\n` +
                    `Use \`!record <match_id>\` to record stats manually.`
                  );
                }
              }, 60_000);
            } else {
              this._notifyQueueChannel(
                '🏁 Game ended. Stats should be recorded automatically via the GC lobby. ' +
                'If not, use `!record <match_id>`.'
              );
            }
            return;
          }

          if (gameWatchElapsed >= MAX_GAME_WATCH_MS) {
            clearInterval(this._connectionMonitorTimer);
            this._connectionMonitorTimer = null;
            console.log('[Queue] Game-watch monitor expired after 3 hours.');
          }
        }
      } catch (err) {
        console.error('[Queue] Connection monitor error:', err.message);
      }
    }, pingIntervalMs);
  }

  // When queue reaches 10, balance teams, create a session, provision the
  // server (if configured), post team embed, and start connection monitor.
  async _autoLaunchQueue(fallbackChannel, { forced = false } = {}) {
    const players = [...this._inhouseQueue.values()];
    if (!forced && players.length < 10) return;
    if (players.length < 2) return; // absolute minimum even when forced

    // Guard against a concurrent active session BEFORE touching the queue,
    // so queued players are not discarded if a session is already running.
    const existing = await db.getActiveInhouseSession().catch(() => null);
    if (existing) {
      this._notifyQueueChannel(
        `⚠️ Queue popped but an active session already exists (#${existing.id}). ` +
        `Queue has been kept intact — manage the existing session via the dashboard, ` +
        `then players can rejoin/relaunch when it ends.`
      );
      return;
    }

    // Balance teams
    const { radiant, dire, diff } = this._mmrBalancePlayers(players);

    // Create session BEFORE clearing queue so players are not lost on failure
    let session;
    try {
      session = await db.createInhouseSession({
        captainMode: 'balanced',
        createdBy: 'auto-queue',
        acceptPhaseSeconds: 0,
      });
    } catch (sessionErr) {
      this._notifyQueueChannel(
        `❌ Failed to create game session: ${sessionErr.message}. Queue preserved — please try again.`
      );
      throw sessionErr;
    }

    // Queue clear is safe now that session exists
    this._inhouseQueue.clear();
    this._queueMsgRef = null;
    await db.clearQueue().catch(e => console.warn('[Queue] DB clearQueue failed:', e.message));

    // Add players + assign teams
    const STEAM64_OFFSET = 76561197960265728n;
    const enriched = [];
    for (const [teamNum, group] of [[1, radiant], [2, dire]]) {
      for (let i = 0; i < group.length; i++) {
        const p = group[i];
        await db.joinInhouseSession(session.id, p.accountId).catch(e =>
          console.warn(`[Queue] joinInhouseSession failed for ${p.nickname} (${p.accountId}):`, e.message)
        );
        await db.updateInhouseSessionPlayer(session.id, p.accountId, {
          status: 'accepted',
          team: teamNum,
          pick_order: i,
        }).catch(e =>
          console.warn(`[Queue] updateSessionPlayer failed for ${p.nickname} (${p.accountId}):`, e.message)
        );
        let steam64 = null;
        try { steam64 = (BigInt(p.accountId) + STEAM64_OFFSET).toString(); } catch (_) {}
        enriched.push({ ...p, team: teamNum, steam64 });
      }
    }

    // Provision dedicated server if configured
    const ds = config.dota?.dedicatedServer;
    let matchPassword = null, serverIp = null, serverPort = null, rconOk = false;
    if (ds?.ip) {
      const { generateMatchPassword } = require('../services/steamConnectLink');
      matchPassword = generateMatchPassword(8);
      serverIp = ds.ip;
      serverPort = ds.port || 27015;
      try {
        const { setMatchPassword } = require('../services/rconClient');
        await setMatchPassword(matchPassword);
        rconOk = true;
      } catch (rconErr) {
        console.warn('[Queue] RCON setMatchPassword failed:', rconErr.message);
      }
    }

    await db.updateInhouseSession(session.id, {
      status: 'in_progress',
      server_ip: serverIp,
      server_port: serverPort,
      match_password: matchPassword,
      started_at: new Date(),
    });

    // Build and post team assignment embed
    const avgRadiant = Math.round(radiant.reduce((s, p) => s + p.mmr, 0) / radiant.length);
    const avgDire = Math.round(dire.reduce((s, p) => s + p.mmr, 0) / dire.length);
    const fmtTeam = (group) =>
      group.map(p => `• **${p.nickname}** (${p.mmr} MMR)`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🎮 Inhouse Match Ready!')
      .setColor(0x4caf50)
      .setDescription(`Queue popped with 10 players — MMR difference: **${diff}**`)
      .addFields(
        { name: `🟢 Radiant — avg ${avgRadiant} MMR`, value: fmtTeam(radiant), inline: true },
        { name: `🔴 Dire — avg ${avgDire} MMR`, value: fmtTeam(dire), inline: true },
      )
      .setTimestamp();

    if (serverIp && matchPassword) {
      const connectLink = `steam://connect/${serverIp}:${serverPort}/${encodeURIComponent(matchPassword)}`;
      embed.addFields({
        name: '🖥️ Connect to Server',
        value:
          `**[One-click connect](${connectLink})** — \`${serverIp}:${serverPort}\`\n` +
          `Password: \`${matchPassword}\`\n` +
          `Console: \`connect ${serverIp}:${serverPort}; password ${matchPassword}\``,
      });
      if (!rconOk) {
        embed.addFields({ name: '⚠️ RCON Note', value: 'Password push via RCON failed — set it manually in your Dota 2 lobby.' });
      }
    } else {
      embed.addFields({
        name: '⚙️ No Dedicated Server',
        value: 'No dedicated server configured. Create a lobby in Dota 2 and share the password with both teams.',
      });
    }

    const queueChannelId = config.discord.queueChannelId;
    let channel = null;
    if (queueChannelId) {
      channel = this.client.channels.cache.get(queueChannelId)
        || await this.client.channels.fetch(queueChannelId).catch(() => null);
    }
    if (!channel) channel = fallbackChannel;

    if (channel) {
      const pings = enriched.filter(p => p.discordId).map(p => `<@${p.discordId}>`).join(' ');
      if (pings) await channel.send(pings).catch(() => {});
      await channel.send({ embeds: [embed] }).catch(() => {});
      // Post a fresh empty queue embed so players can re-queue immediately
      const freshEmbed = this._buildQueueEmbed();
      const freshMsg = await channel.send({ embeds: [freshEmbed] }).catch(() => null);
      if (freshMsg) this._queueMsgRef = { channelId: channel.id, messageId: freshMsg.id };
    }

    // === GC Lobby — wires the matchEnded post-game pipeline ===
    // If Steam/GC is connected, create a practice lobby so the bot receives the
    // matchId and the existing matchEnded handler triggers replay fetch, stat
    // recording, MMR update, and all post-game announcements automatically.
    // If GC is not available the session is still valid; post-game recording
    // falls back to SSH replay fetch (Task #30) or manual !record.
    const lobbyManager = this._resolveLobbyManager();
    const steamClient = tryGetSteamClient();
    const gcAvailable = !!(steamClient?.isGCReady && steamClient?.gcClient && lobbyManager);

    if (gcAvailable) {
      const lobbyName = `Queue Game #${session.id}`;
      try {
        await lobbyManager.createLobby(lobbyName, matchPassword || '', 'auto-queue');
        console.log(`[Queue] GC lobby "${lobbyName}" created — inviting ${enriched.length} players.`);

        // Invite every player so they get a Steam pop-up to join.
        for (const p of enriched) {
          if (p.steam64) {
            try { lobbyManager.invitePlayer(p.steam64); } catch (_) {}
            await new Promise(r => setTimeout(r, 600));
          }
        }

        // Assign GC team slots 30 s after invites are sent — gives players time to join.
        const radiantSteam64 = enriched.filter(e => e.team === 1).map(e => e.steam64).filter(Boolean);
        const direSteam64   = enriched.filter(e => e.team === 2).map(e => e.steam64).filter(Boolean);
        setTimeout(async () => {
          try {
            const result = await lobbyManager.assignTeams(radiantSteam64, direSteam64);
            console.log(`[Queue] GC team slots assigned — ${result.moved.length} moved, ${result.errors.length} errors.`);
          } catch (e) {
            console.warn('[Queue] GC team assignment failed:', e.message);
          }
        }, 30_000);

        console.log(`[Queue] GC lobby wired — post-game pipeline active via matchEnded event.`);
        if (channel) {
          channel.send(
            `🖥️ **GC lobby created:** \`${lobbyName}\` — Steam invites sent to all players. ` +
            `Join via your Steam friends list. Team slots will be assigned automatically in 30 s.`
          ).catch(() => {});
        }
      } catch (gcErr) {
        console.warn('[Queue] GC lobby creation failed:', gcErr.message,
          '— post-game pipeline unavailable; use SSH replay fetch or !record to record stats.');
        if (channel) {
          channel.send(
            `⚠️ Could not create GC lobby (\`${gcErr.message}\`). ` +
            `Stats will be recorded via SSH replay fetch (if configured) or use \`!record <match_id>\` after the game.`
          ).catch(() => {});
        }
      }
    } else {
      console.log('[Queue] GC not available — RCON/SSH path only. Use !record to record stats after the game.');
    }

    // Start connection monitor if server was provisioned
    if (serverIp) {
      const updatedSession = await db.getInhouseSession(session.id).catch(() => session);
      this._startConnectionMonitor(updatedSession, enriched);
    }

    console.log(`[Queue] Auto-launched session #${session.id} — radiant avg ${avgRadiant}, dire avg ${avgDire}, diff ${diff}`);
  }

  // ---------------------------------------------------------------
  // !queue command
  // ---------------------------------------------------------------

  async _cmdQueue(msg, args) {
    const sub = (args[0] || 'status').toLowerCase();
    switch (sub) {
      case 'join':   await this._queueJoin(msg); break;
      case 'leave':  await this._queueLeave(msg); break;
      case 'status': await this._queueStatus(msg); break;
      case 'clear':  await this._queueClear(msg); break;
      case 'force':  await this._queueForce(msg); break;
      default:
        await msg.reply(
          '**Queue commands:**\n' +
          '`!queue join` — Join the inhouse queue\n' +
          '`!queue leave` — Leave the queue\n' +
          '`!queue status` — Show current queue\n' +
          '`!queue clear` — Clear the queue _(admin)_\n' +
          '`!queue force` — Force-launch with current players _(admin)_'
        );
    }
  }

  async _queueJoin(msg) {
    const discordId = msg.author.id;
    if (this._inhouseQueue.has(discordId)) {
      return msg.reply(`You're already in the queue! (${this._inhouseQueue.size}/10)`);
    }
    if (this._inhouseQueue.size >= 10) {
      return msg.reply('The queue is full (10/10). A game is starting — hang tight!');
    }

    // Check if player is registered
    const steamData = await db.getSteamByDiscordId(discordId).catch(() => null);
    if (!steamData || !steamData.account_id) {
      return msg.reply(
        "You need to link your Steam account first.\n" +
        "Use `!register <steam64_id>` or visit the Players page on the dashboard."
      );
    }

    const accountId = steamData.account_id.toString();
    const rating = await db.getPlayerRating(accountId).catch(() => null);
    const mmr = rating ? Math.round(Number(rating.mmr) || 0) : 2600;
    const nickname = steamData.nickname || msg.author.username;

    // Recheck capacity after async lookups — prevents race conditions where two
    // players join simultaneously around the 10-player limit (both see 9/10 → both
    // get accepted → 11-player launch with a 5/6 team split).
    if (this._inhouseQueue.has(discordId)) {
      return msg.reply(`You joined while we were loading your info — you're already in! (${this._inhouseQueue.size}/10)`);
    }
    if (this._inhouseQueue.size >= 10) {
      return msg.reply('Queue filled up while loading your info — it\'s at 10/10. A game is starting!');
    }

    this._inhouseQueue.set(discordId, { discordId, accountId, mmr, nickname });
    await db.addToQueue(discordId, accountId, mmr, nickname).catch(e =>
      console.warn('[Queue] DB addToQueue failed:', e.message)
    );

    const count = this._inhouseQueue.size;
    await msg.reply(`✅ Joined queue as **${nickname}** (${mmr} MMR) — **${count}/10**`);
    await this._postOrUpdateQueueEmbed(msg.channel).catch(() => {});

    if (count >= 10) {
      await this._autoLaunchQueue(msg.channel).catch(e => {
        console.error('[Queue] Auto-launch error:', e.message);
        this._notifyQueueChannel(`❌ Auto-launch failed: ${e.message}\nUse \`!inhouse open\` to start manually.`);
      });
    }
  }

  async _queueLeave(msg) {
    const discordId = msg.author.id;
    if (!this._inhouseQueue.has(discordId)) {
      return msg.reply("You're not in the queue.");
    }
    this._inhouseQueue.delete(discordId);
    await db.removeFromQueue(discordId).catch(e =>
      console.warn('[Queue] DB removeFromQueue failed:', e.message)
    );
    await msg.reply(`👋 Left the queue. Queue: **${this._inhouseQueue.size}/10**`);
    await this._postOrUpdateQueueEmbed(msg.channel).catch(() => {});
  }

  async _queueStatus(msg) {
    const embed = this._buildQueueEmbed();
    await msg.channel.send({ embeds: [embed] }).catch(() => {});
  }

  async _queueClear(msg) {
    if (!this._isAdmin(msg)) return msg.reply('Admin only.');
    this._inhouseQueue.clear();
    this._queueMsgRef = null;
    await db.clearQueue().catch(() => {});
    await msg.reply('✅ Queue cleared.');
  }

  async _queueForce(msg) {
    if (!this._isAdmin(msg)) return msg.reply('Admin only.');
    const count = this._inhouseQueue.size;
    if (count < 2) return msg.reply(`Not enough players to force-launch (${count} in queue, need at least 2).`);
    await msg.reply(`🚀 Force-launching with ${count} player(s)…`);
    await this._autoLaunchQueue(msg.channel, { forced: true }).catch(e => msg.reply(`❌ Launch failed: ${e.message}`));
  }

  async _cmdGcDebug(msg) {
    const steamClient = tryGetSteamClient();
    const lobbyManager = this._resolveLobbyManager();
    const lines = [];

    const { config } = require('../config');
    const trusted = config.steam?.trustedSteamIds || [];
    lines.push(`**Steam logged in:** ${steamClient?.isLoggedIn ? 'Yes' : 'No'}`);
    lines.push(`**GC ready:** ${steamClient?.isGCReady ? 'Yes' : 'No'}`);
    lines.push(`**GC invite listeners:** ${lobbyManager?._gcListenersSetup ? 'Active' : 'NOT registered'}`);
    lines.push(`**Lobby state:** ${lobbyManager?.state ?? 'unavailable'}`);
    lines.push(`**Trusted Steam IDs:** ${trusted.length ? trusted.join(', ') : '(none set — all party invites will be rejected)'}`);

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
    const lobbyManager = this._resolveLobbyManager();
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
        'Usage: `!invite <steam_id>` or `!invite @discorduser`\n' +
        'You can also use `!invite_me` to invite yourself directly.'
      );
    }

    const lobbyManager = this._resolveLobbyManager();
    if (!lobbyManager) return msg.reply('Lobby manager is not available.');

    // Support @mention — look up their Steam ID from the database
    const mentionMatch = args[0].match(/^<@!?(\d+)>$/);
    if (mentionMatch) {
      const targetDiscordId = mentionMatch[1];
      const row = await db.getSteamByDiscordId(targetDiscordId);
      if (!row) {
        return msg.reply(`No Steam account linked for that player. They need to register via \`!register\` first.`);
      }
      const steam64 = (BigInt('76561197960265728') + BigInt(row.account_id)).toString();
      try {
        const sent = lobbyManager.invitePlayer(steam64);
        const name = row.nickname || `<@${targetDiscordId}>`;
        if (sent) {
          await msg.reply(`Lobby invite sent to **${name}**. They should see it in Dota 2.`);
        } else {
          await msg.reply(`Failed to send invite to **${name}**. Make sure the bot has them as a friend on Steam.`);
        }
      } catch (err) {
        await msg.reply(`Error: ${err.message}`);
      }
      return;
    }

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

  async _cmdInviteMe(msg) {
    if (!steamAvailable) {
      return msg.reply('Steam is not connected. Cannot send invites.');
    }
    const lobbyManager = this._resolveLobbyManager();
    if (!lobbyManager) return msg.reply('Lobby manager is not available.');

    const status = lobbyManager.getStatus();
    if (!status.lobby) {
      return msg.reply('No active lobby right now. Ask an admin to create one with `!create_lobby`.');
    }

    const row = await db.getSteamByDiscordId(msg.author.id);
    if (!row) {
      return msg.reply(
        'Your Discord account isn\'t linked to a Steam ID yet.\n' +
        'Register with `!register <steam_id>` first.'
      );
    }

    const steam64 = (BigInt('76561197960265728') + BigInt(row.account_id)).toString();
    try {
      const sent = lobbyManager.invitePlayer(steam64);
      if (sent) {
        await msg.reply(`Lobby invite sent! Check your Dota 2 client — you should see an invite pop up.`);
      } else {
        await msg.reply(
          'Could not send the invite. Make sure you\'ve added the bot\'s Steam account as a friend — ' +
          'then the invite will come through.'
        );
      }
    } catch (err) {
      await msg.reply(`Error sending invite: ${err.message}`);
    }
  }

  async _cmdEnd(msg) {
    const lobbyManager = this._resolveLobbyManager();
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
    const lobbyManager = this._resolveLobbyManager();
    if (!lobbyManager) return msg.reply('Lobby manager is not available.');
    const status = lobbyManager.getStatus();
    if (!status.lobby) return msg.reply('No active lobby. Create one first with `!create_lobby`.');
    const seated = status.lobby._gamePlayerCount || 0;
    try {
      // Cancel any active countdown first, then attempt launch.
      // launchLobby() returns true if it sent the launch command, or undefined if it had
      // to leave the lobby first (mustManualLaunch path). In the latter case the channel
      // notification is handled by the mustManualLaunch event handler above.
      if (lobbyManager._countdownTimer) lobbyManager._abortCountdown();
      const launched = lobbyManager.launchLobby();
      if (launched) {
        await msg.reply(`🚀 **Game launched!** (${seated}/10 players seated) — Bot stepping back from lobby. Stats will auto-record when the game ends.`);
      } else {
        await msg.reply(`⚠️ Bot was in a game slot and had to leave the lobby first. Check the channel for instructions on how to launch the game manually.`);
      }
    } catch (err) {
      await msg.reply(`Error: ${err.message}`);
    }
  }

  // !gc_record <matchId>
  // Used when the bot left the lobby before launch (mustManualLaunch path) and therefore
  // never captured the matchId automatically. The player types the matchId from the
  // post-game scoreboard and the bot records stats via GC + replay pipeline.
  async _cmdGcRecord(msg, args) {
    const matchId = args[0]?.replace(/\D/g, '');
    if (!matchId) return msg.reply('Usage: `!gc_record <matchId>`');

    const steamClient = tryGetSteamClient();
    const gcClient = steamClient?.gcClient;
    if (!gcClient || !gcClient.isReady) {
      return msg.reply('❌ GC is not connected — cannot fetch match details right now. Try again in a moment.');
    }

    await msg.reply(`🔍 Fetching match **${matchId}** from the GC...`);

    // Attempt immediately (game is already over), then fall back to normal polling.
    try {
      const details = await gcClient.requestMatchDetails(matchId).catch(() => null);
      const match = details?.match;
      const outcome = match?.match_outcome ?? match?.matchOutcome ?? 0;

      if (!details || details.result !== 1 || !match || outcome === 0) {
        // Game might not be fully registered yet — kick off background polling.
        this._notifyChannel(`⏳ Match **${matchId}** isn't finalised on the GC yet — will keep checking every 5 min (up to 3 hours).`);
        this._pollAndRecordMatch(matchId, 'Manual GC Record');
        return;
      }

      // Match is done — run the replay pipeline immediately.
      this._notifyChannel(`📊 Match **${matchId}** confirmed ended — fetching replay for full stats...`);
      try {
        const { autoDownloadAndProcessReplay } = require('../services/replayDownloader');
        const { processReplayInternal } = require('../web/server');
        await autoDownloadAndProcessReplay(
          gcClient, matchId,
          (filePath, source) => processReplayInternal(filePath, source),
          (m) => this._notifyChannel(m)
        );
        console.log(`[GcRecord] Match ${matchId} recorded via replay.`);
      } catch (replayErr) {
        console.error(`[GcRecord] Replay failed for ${matchId}: ${replayErr.message}`);
        this._notifyChannel(`⚠️ Replay parse failed — falling back to basic GC stats for match **${matchId}**.`);
        this._pollAndRecordMatch(matchId, 'Manual GC Record', 1);
      }
    } catch (err) {
      console.error(`[GcRecord] Error:`, err.message);
      await msg.reply(`❌ Error fetching match: ${err.message}`);
    }
  }

  async _cmdCaptains(msg) {
    const lobbyManager = this._resolveLobbyManager();
    if (!lobbyManager || !lobbyManager.currentLobby) {
      return msg.reply('No active lobby. Captains can only be picked when a lobby is running.');
    }
    const players = await lobbyManager._getLobbyPlayerNames();
    if (players.length < 2) {
      return msg.reply('Not enough players in the lobby to pick captains (need at least 2).');
    }
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const [cap1, cap2] = shuffled;
    const embed = new EmbedBuilder()
      .setTitle('🎲 Random Captains')
      .setColor(0x00ae86)
      .addFields(
        { name: '🟢 Captain 1', value: cap1.name, inline: true },
        { name: '🔴 Captain 2', value: cap2.name, inline: true },
      )
      .setFooter({ text: `Picked from ${players.length} players in the lobby` });
    await msg.reply({ embeds: [embed] });
  }

  async _cmdRoll(msg) {
    const roll = Math.floor(Math.random() * 100) + 1;
    const name = msg.member?.displayName || msg.author.username;
    await msg.reply(`🎲 **${name}** rolled **${roll}** (1–100)`);
  }

  async _cmdHrCaptains(msg) {
    const lobbyManager = this._resolveLobbyManager();
    if (!lobbyManager || !lobbyManager.currentLobby) {
      return msg.reply('No active lobby. High-rank captains can only be picked when a lobby is running.');
    }
    const players = await lobbyManager._getLobbyPlayerNames();
    if (players.length < 2) {
      return msg.reply('Not enough players in the lobby to pick captains.');
    }
    const leaderboard = await db.getLeaderboard(200);
    const lobbyIds = new Set(players.map(p => p.accountId).filter(Boolean));
    const inLobby = leaderboard.filter(entry => lobbyIds.has(entry.player_id));
    if (inLobby.length < 2) {
      return msg.reply('Not enough ranked players found in the current lobby. Try `!captains` for random selection.');
    }
    const [cap1, cap2] = inLobby;
    const embed = new EmbedBuilder()
      .setTitle('👑 High-Rank Captains')
      .setColor(0xf1c40f)
      .addFields(
        { name: '🟢 Captain 1', value: `${cap1.nickname || cap1.display_name}\n${Math.round(cap1.mmr)} MMR`, inline: true },
        { name: '🔴 Captain 2', value: `${cap2.nickname || cap2.display_name}\n${Math.round(cap2.mmr)} MMR`, inline: true },
      )
      .setFooter({ text: 'Ranked by TrueSkill MMR from current lobby' });
    await msg.reply({ embeds: [embed] });
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

  async _cmdPerfBackfill(msg, args) {
    if (msg.author.id !== OWNER_DISCORD_ID) {
      return msg.reply('You don\'t have permission to use this command.');
    }
    // Args: optional numeric limit, optional 'all' keyword (recompute every
    // match, even those already scored — useful after weight/baseline changes).
    const all = args.some(a => a && a.toLowerCase() === 'all');
    const limit = args.find(a => /^\d+$/.test(a));
    const limitNum = limit ? parseInt(limit, 10) : null;
    await msg.reply(`PERF backfill starting (mode: ${all ? 'ALL historical matches (recompute)' : 'pending only'}, limit: ${limitNum || 'none'}). See bot logs for per-batch progress.`);
    try {
      const { backfillPerf } = require('../perf/perfService');
      const r = await backfillPerf(db.getPool, { limit: limitNum, batchSize: 50, sleepMs: 250, all });
      await msg.reply(
        `PERF backfill complete. Total candidates: ${r.total}, processed: ${r.processed}, ok: ${r.ok}, failed: ${r.failed}.`
      );
    } catch (err) {
      await msg.reply(`PERF backfill failed: ${err.message}`);
    }
  }

  async _cmdRecomputeBaselines(msg, args) {
    if (msg.author.id !== OWNER_DISCORD_ID) {
      return msg.reply('You don\'t have permission to use this command.');
    }
    const seasonArg = args.find(a => /^--season=\d+$/.test(a));
    const maxArg = args.find(a => /^--max-buckets=\d+$/.test(a));
    const seasonId = seasonArg ? parseInt(seasonArg.split('=')[1], 10) : null;
    const maxBuckets = maxArg ? parseInt(maxArg.split('=')[1], 10) : 120;
    if (this._baselinesRecomputeInFlight) {
      return msg.reply('A position baselines recompute is already running — wait for it to finish before starting another.');
    }
    await msg.reply(`Position baselines recompute starting (season=${seasonId || 'all'}, maxBuckets=${maxBuckets}). See bot logs for progress.`);
    this._baselinesRecomputeInFlight = (async () => {
      try {
        const { runRecompute } = require('../../scripts/recompute-position-baselines');
        const r = await runRecompute({ seasonId, maxBuckets });
        await msg.reply(
          `Position baselines recompute done. Matches scanned: ${r.matchesScanned}, samples: ${r.samplesScored}, rows written: ${r.written}, sparse buckets skipped: ${r.skipped}.`
        );
      } catch (err) {
        console.error('[Baselines] Manual recompute failed:', err);
        await msg.reply(`Position baselines recompute failed: ${err.message}`).catch(() => {});
      } finally {
        this._baselinesRecomputeInFlight = null;
      }
    })();
  }

  async _runPositionBaselinesRecompute(reason = 'scheduled') {
    // Single-flight: UPSERT is idempotent so concurrent runs are safe in terms
    // of correctness, but they're wasteful. Skip if one is already in progress.
    if (this._baselinesRecomputeInFlight) {
      console.log(`[Baselines] Skipping ${reason} recompute — another run is already in progress.`);
      return;
    }
    this._baselinesRecomputeInFlight = (async () => {
      try {
        console.log(`[Baselines] Starting ${reason} position-baselines recompute...`);
        const { runRecompute } = require('../../scripts/recompute-position-baselines');
        const r = await runRecompute({});
        console.log(`[Baselines] ${reason} recompute complete: matches=${r.matchesScanned}, samples=${r.samplesScored}, written=${r.written}, skipped=${r.skipped}.`);
      } catch (err) {
        console.error(`[Baselines] ${reason} recompute failed:`, err.message);
      } finally {
        this._baselinesRecomputeInFlight = null;
      }
    })();
    return this._baselinesRecomputeInFlight;
  }

  async _cmdAdminRegister(msg, args) {
    if (msg.author.id !== OWNER_DISCORD_ID) {
      return msg.reply('You don\'t have permission to use this command.');
    }

    const mention = msg.mentions.users.first();
    const steamId = args.find(a => /^\d{17}$/.test(a));

    if (!mention || !steamId) {
      return msg.reply(
        'Usage: `!adminregister @Player <steam64_id>`\n' +
        'Example: `!adminregister @SomePlayer 76561198012345678`'
      );
    }

    if (BigInt(steamId) < BigInt('76561197960265728')) {
      return msg.reply('That Steam ID doesn\'t look right. Make sure you\'re using the Steam64 ID (17 digits).');
    }

    try {
      const { accountId32 } = await db.registerPlayer(mention.id, mention.username, steamId);
      await msg.reply(
        `Registered **${mention.username}** — Steam ID: \`${steamId}\` (Account ID: \`${accountId32}\`)`
      );
      console.log(`[AdminRegister] ${msg.author.username} registered ${mention.username} (${mention.id}) with Steam64 ${steamId}`);
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
    const nicknames = await db.getAllNicknames();
    // Deduplicate by lowercase nickname — multiple account IDs can share the same nickname
    const seen = new Set();
    const players = [];
    for (const n of nicknames) {
      if (!n.nickname || !n.account_id) continue;
      const key = n.nickname.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      players.push(n);
    }
    if (players.length === 0) {
      return msg.reply('No players found in the database yet.');
    }

    const sorted = [...players].sort((a, b) => (a.nickname || '').localeCompare(b.nickname || ''));
    // Discord embed description limit is 4096 chars — chunk if needed
    const lines = sorted.map((p, i) => `${i + 1}. **${p.nickname}**`);
    const chunks = [];
    let current = '';
    for (const line of lines) {
      if (current.length + line.length + 1 > 3800) { chunks.push(current); current = ''; }
      current += (current ? '\n' : '') + line;
    }
    if (current) chunks.push(current);

    const embed = new EmbedBuilder()
      .setTitle(`OCE Inhouse Players (${players.length})`)
      .setColor(0x00ae86)
      .setDescription(chunks[0])
      .setFooter({ text: 'Full stats and profiles at the web dashboard' });

    await msg.reply({ embeds: [embed] });
  }

  // Polls Valve's GC directly every 5 minutes until the match is finished, then records.
  // Works for practice lobbies (which don't appear on OpenDota).
  //
  // Recording priority:
  //   1. Replay download + parse (full stats, TrueSkill, Discord summary, replay archive)
  //   2. Basic GC stats fallback (win/loss + basic K/D/A only, used if replay fails)
  //
  // We do NOT record basic GC stats before the replay parse because player_stats has no
  // unique constraint, so a pre-record + replay-parse would produce duplicate rows.
  _pollAndRecordMatch(matchId, lobbyName, attemptsLeft = 36) {
    if (attemptsLeft <= 0) {
      this._notifyChannel(`⏰ Auto-record gave up after 3 hours for match **${matchId}**. Use \`!record ${matchId}\` manually.`);
      return;
    }
    setTimeout(async () => {
      try {
        const steamClient = tryGetSteamClient();
        const gcClient = steamClient?.gcClient;
        if (!gcClient || !gcClient.isReady) {
          console.log(`[AutoRecord] GC not ready — retrying match ${matchId} in 5 min.`);
          this._pollAndRecordMatch(matchId, lobbyName, attemptsLeft - 1);
          return;
        }

        // Request match details directly from Valve's GC. Works for any match including
        // practice lobbies. Returns null/error while the game is still in progress.
        const details = await gcClient.requestMatchDetails(matchId).catch(() => null);
        const match = details?.match;
        const outcome = match?.match_outcome ?? match?.matchOutcome ?? 0;

        if (!details || details.result !== 1 || !match || outcome === 0) {
          console.log(`[AutoRecord] Match ${matchId} not finished yet (attempt ${37 - attemptsLeft}/36, result=${details?.result}, outcome=${outcome}) — retrying in 5 min.`);
          this._pollAndRecordMatch(matchId, lobbyName, attemptsLeft - 1);
          return;
        }

        // ── Match has ended ──────────────────────────────────────────────────────────
        // Primary path: replay download → Java parse → full DB record + TrueSkill +
        //               Discord summary + replay archive. `notifyWebUpload` handles all
        //               Discord messaging so we don't need separate _sendMatchSummary.
        this._notifyChannel(`📊 Match **${matchId}** ended — fetching replay for full stats...`);
        console.log(`[AutoRecord] Match ${matchId} finished (outcome=${outcome}). Starting replay pipeline.`);

        let replaySucceeded = false;
        try {
          const { autoDownloadAndProcessReplay } = require('../services/replayDownloader');
          const { processReplayInternal } = require('../web/server');
          await autoDownloadAndProcessReplay(
            gcClient, matchId,
            (filePath, source) => processReplayInternal(filePath, source),
            (msg) => this._notifyChannel(msg)
          );
          replaySucceeded = true;
          console.log(`[AutoRecord] Match ${matchId} fully recorded via replay parse.`);
        } catch (replayErr) {
          console.error(`[AutoRecord] Replay pipeline failed for ${matchId}: ${replayErr.message}`);
          this._notifyChannel(`⚠️ Replay parse failed for match **${matchId}** — recording basic stats from GC data as fallback.`);
        }

        if (replaySucceeded) return;

        // ── Fallback: record basic win/loss + K/D/A from GC response ─────────────────
        // Safe to do here because the replay parse didn't write anything to the DB.
        const STEAM64_OFFSET = BigInt('76561197960265728');
        const radiantWin = outcome === 2;
        const gcPlayers = match.players || [];
        const players = gcPlayers
          .filter((p) => p.team === 0 || p.team === 1)
          .map((p) => {
            const accountId = (p.account_id || p.accountId || 0).toString();
            const steam64 = accountId !== '0'
              ? (BigInt(accountId) + STEAM64_OFFSET).toString()
              : '0';
            return {
              accountId,
              steamId64: steam64,
              heroId: p.hero_id || p.heroId || 0,
              team: p.team === 0 ? 'radiant' : 'dire',
              slot: p.player_slot ?? p.slot ?? 0,
              kills: p.kills || 0,
              deaths: p.deaths || 0,
              assists: p.assists || 0,
              gpm: p.gold_per_min || p.goldPerMin || 0,
              xpm: p.xp_per_min || p.xpPerMin || 0,
              heroDamage: p.hero_damage || p.heroDamage || 0,
              towerDamage: p.tower_damage || p.towerDamage || 0,
              heroHealing: p.hero_healing || p.heroHealing || 0,
              lastHits: p.last_hits || p.lastHits || 0,
              denies: p.denies || 0,
            };
          });

        const matchStats = {
          matchId: matchId.toString(),
          radiantWin,
          duration: match.duration || 0,
          lobbyType: match.lobby_type ?? match.lobbyType ?? 1,
          gameMode: match.game_mode ?? match.gameMode ?? 0,
          startTime: match.start_time ?? match.startTime ?? Math.floor(Date.now() / 1000),
          players,
          source: 'gc-poll-fallback',
        };

        const sheetsStore = getSheetsStore();
        const statsService = getStatsService();
        await this._recordMatchData(matchStats, lobbyName, 'gc-poll-fallback');
        await this._markRecorded(matchId, 'gc-poll-fallback');
        const radiantPlayers = matchStats.players.filter((p) => p.team === 'radiant');
        const direPlayers = matchStats.players.filter((p) => p.team === 'dire');
        await this._processRatings(matchStats, radiantPlayers, direPlayers, sheetsStore, statsService);
        const statsChannels = await this._resolveChannels(
          config.discord.statsChannelIds.length > 0 ? config.discord.statsChannelIds : (this.lobbyChannelId ? [this.lobbyChannelId] : [])
        );
        for (const ch of statsChannels) {
          await this._sendMatchSummary(matchStats, lobbyName, ch).catch((e) =>
            console.error(`[AutoRecord] Fallback summary error (${ch.id}):`, e.message)
          );
        }
        console.log(`[AutoRecord] Match ${matchId} recorded from GC fallback (no replay).`);
      } catch (err) {
        console.error('[AutoRecord] GC poll error:', err.message);
        this._pollAndRecordMatch(matchId, lobbyName, attemptsLeft - 1);
      }
    }, 5 * 60 * 1000);
  }

  async _recordMatchData(matchStats, lobbyName, recordedBy) {
    const sheetsStore = getSheetsStore();
    if (sheetsStore.initialized) {
      await sheetsStore.recordMatch(matchStats, lobbyName, recordedBy);
    }
    try {
      // Resolve the active season so every match is correctly tagged to it in the DB.
      // recordMatch() accepts seasonId as its 6th argument (after fileHash and patch).
      const activeSeason = await db.getActiveSeason().catch(() => null);
      const activeSeasonId = activeSeason ? activeSeason.id : null;
      const recordResult = await db.recordMatch(matchStats, lobbyName, recordedBy, null, null, activeSeasonId);
      await this._checkMatchQuality(matchStats).catch(e => console.error('[QualityCheck] Error:', e.message));
      this._rconResetServer().catch(e => console.log('[RCON] Post-match reset skipped:', e.message));
      // Notify Discord about achievements granted inside recordMatch()
      if (recordResult && recordResult.achievementGrants && recordResult.achievementGrants.length > 0) {
        this._notifyAchievementsUnlocked(recordResult.achievementGrants).catch(e =>
          console.error('[Achievements] Notify error:', e.message)
        );
      }
    } catch (err) {
      console.error('[DB] Record match error:', err.message);
    }
    setTimeout(() => this._initiateRatingSession(matchStats).catch(e => console.error('[Ratings] DM error:', e.message)), 3000);
    setTimeout(() => this._sendReportCardDMs(matchStats).catch(e => console.error('[ReportCard] DM error:', e.message)), 5000);
    // Engagement checks — milestone announcements and record-breaking detection
    setTimeout(() => this._checkMatchMilestones(matchStats).catch(e => console.error('[Milestone] Error:', e.message)), 8000);
    setTimeout(() => this._checkAndAnnounceRecords(matchStats).catch(e => console.error('[Records] Error:', e.message)), 9000);
    // If queue has enough players for the next game, auto-launch immediately after
    // match recording so the continuous pipeline needs zero admin intervention
    setTimeout(() => {
      if (this._inhouseQueue.size >= 10) {
        this._notifyQueueChannel(
          `🎮 Queue has **${this._inhouseQueue.size}** players ready — auto-launching next game!`
        );
        this._autoLaunchQueue(null).catch(e =>
          console.error('[Queue] Post-match auto-launch error:', e.message)
        );
      }
    }, 6000);
    // Season end check is triggered from _processRatings() (after ratings are updated)
    // so the final match's MMR changes are reflected in the summary.
  }

  async _checkSeasonEndCondition() {
    try {
      const season = await db.getActiveSeason();
      if (!season) return;

      let shouldClose = false;
      let reason = '';

      if (season.end_date && new Date() >= new Date(season.end_date)) {
        shouldClose = true;
        reason = `end date reached (${new Date(season.end_date).toLocaleDateString('en-AU')})`;
      }

      if (!shouldClose && season.match_count_limit) {
        const { rows } = await db.getPool().query(
          `SELECT COUNT(*) AS cnt FROM matches WHERE season_id = $1 AND is_legacy = false`,
          [season.id]
        );
        const count = parseInt(rows[0].cnt);
        if (count >= season.match_count_limit) {
          shouldClose = true;
          reason = `match limit reached (${count}/${season.match_count_limit} games)`;
        }
      }

      if (shouldClose) {
        console.log(`[Season] Auto-closing season "${season.name}" — ${reason}`);
        await this._closeSeasonAndAnnounce(season);
      }
    } catch (err) {
      console.error('[Season] End condition check error:', err.message);
    }
  }

  _buildSeasonCompleteEmbed(season, summary) {
    const siteUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 5000}`;
    const summaryUrl = `${siteUrl}/seasons/${season.id}/summary`;

    const embed = new EmbedBuilder()
      .setColor(0x7c6bff)
      .setTitle(`🏆 ${season.name} — Season Complete!`)
      .setDescription(
        `**${summary.overview.totalMatches}** matches · **${summary.overview.totalPlayers}** players\n` +
        `[📊 View Full Season Summary](${summaryUrl})`
      )
      .setTimestamp();

    if (summary.topPlayers.length > 0) {
      const medals = ['🥇', '🥈', '🥉'];
      const topStr = summary.topPlayers
        .map((p, i) => `${medals[i]} **${p.display_name}** — ${p.mmr ?? '?'} MMR (${p.wins ?? 0}W/${p.losses ?? 0}L)`)
        .join('\n');
      embed.addFields({ name: '📊 Final Top 3', value: topStr });
    }

    if (summary.longestStreak) {
      embed.addFields({
        name: '🔥 Longest Win Streak',
        value: `**${summary.longestStreak.display_name}** — ${summary.longestStreak.longest_streak} wins in a row`,
      });
    }

    if (summary.mostImproved) {
      const delta = summary.mostImproved.delta > 0 ? `+${summary.mostImproved.delta}` : `${summary.mostImproved.delta}`;
      embed.addFields({
        name: '📈 Most Improved',
        value: `**${summary.mostImproved.display_name}** — ${delta} MMR (${summary.mostImproved.first_mmr} → ${summary.mostImproved.last_mmr})`,
      });
    }

    if (summary.heroOfSeason) {
      embed.addFields({
        name: '⚔️ Hero of the Season',
        value: `**${summary.heroOfSeason.hero_name}** — ${summary.heroOfSeason.winRate}% win rate over ${summary.heroOfSeason.games} games`,
      });
    }

    return embed;
  }

  _resolveAnnounceChannelIds() {
    const announceIds = config.discord.announceChannelId
      ? [config.discord.announceChannelId]
      : config.discord.statsChannelIds;
    return announceIds.length > 0 ? announceIds : config.discord.statsChannelIds;
  }

  async _closeSeasonAndAnnounce(season) {
    try {
      // Idempotency guard: re-fetch the season inside the transaction to confirm it
      // is still active. If a concurrent call already closed it, bail out silently.
      const { rows: check } = await db.getPool().query(
        `SELECT id FROM seasons WHERE id = $1 AND active = true AND season_status = 'active'`,
        [season.id]
      );
      if (!check.length) {
        console.log(`[Season] ${season.name} already closed by a concurrent call — skipping.`);
        return;
      }

      const summary = await db.getSeasonSummary(season.id);
      const embed = this._buildSeasonCompleteEmbed(season, summary);

      await db.archiveSeason(season.id);

      // Prefer the announce channel for season closure events; fall back to stats channels.
      const channels = await this._resolveChannels(this._resolveAnnounceChannelIds());
      for (const ch of channels) {
        await ch.send({ embeds: [embed] }).catch(err =>
          console.error(`[Season] Announce error on ${ch.id}:`, err.message)
        );
      }

      // Activate the next explicitly-pending season. Using season_status='pending'
      // is precise — it won't accidentally activate an old inactive/deactivated season.
      const { rows } = await db.getPool().query(
        `SELECT * FROM seasons WHERE season_status = 'pending' AND id > $1 ORDER BY id ASC LIMIT 1`,
        [season.id]
      );
      const nextSeason = rows[0];
      if (nextSeason) {
        await db.setActiveSeason(nextSeason.id);
        const openMsg = `🎉 **${nextSeason.name}** is now open! Good luck everyone.`;
        for (const ch of channels) {
          await ch.send(openMsg).catch(() => {});
        }
        console.log(`[Season] Auto-activated next season: ${nextSeason.name}`);
      } else {
        this._notifyAdminChannel(
          `⚠️ **${season.name}** has ended but no next season is configured. ` +
          `Create a new season in the admin panel to continue.`
        );
      }
    } catch (err) {
      console.error('[Season] Close and announce error:', err.message);
      throw err;
    }
  }

  async closeSeasonManually(seasonId) {
    const { rows } = await db.getPool().query(`SELECT * FROM seasons WHERE id = $1`, [parseInt(seasonId)]);
    if (!rows[0]) throw new Error('Season not found');
    await this._closeSeasonAndAnnounce(rows[0]);
  }

  async postSeasonAnnouncement(seasonId) {
    const { rows } = await db.getPool().query(`SELECT * FROM seasons WHERE id = $1`, [parseInt(seasonId)]);
    const season = rows[0];
    if (!season) throw new Error('Season not found');
    if (!season.is_legacy) throw new Error('Season is not archived — use Close Season to close and announce for the first time');

    const summary = await db.getSeasonSummary(season.id);
    const embed = this._buildSeasonCompleteEmbed(season, summary);

    const channels = await this._resolveChannels(this._resolveAnnounceChannelIds());
    if (!channels.length) throw new Error('No accessible announce channels found — check ANNOUNCE_CHANNEL_ID configuration');

    let sent = 0;
    for (const ch of channels) {
      await ch.send({ embeds: [embed] }).then(() => { sent++; }).catch(err =>
        console.error(`[Season] Re-announce error on ${ch.id}:`, err.message)
      );
    }

    if (sent === 0) throw new Error('Announcement embed could not be delivered to any Discord channel');
    console.log(`[Season] Re-announced end-of-season embed for "${season.name}" (${sent}/${channels.length} channel(s)).`);
  }

  async _checkMatchQuality(matchStats) {
    const players = matchStats.players || [];
    const reasons = [];
    if (players.length === 0) {
      reasons.push('zero player rows recorded');
    } else {
      const totalKills = players.reduce((s, p) => s + (p.kills || 0), 0);
      if (totalKills < 5) reasons.push(`suspiciously low total kills (${totalKills})`);
      const zeroStats = players.filter(p => (p.goldPerMin || 0) === 0 && (p.xpPerMin || 0) === 0);
      if (zeroStats.length > 0) reasons.push(`${zeroStats.length} player(s) with 0 GPM and 0 XPM (possible parse failure)`);
    }
    if (reasons.length === 0) return;
    const matchId = matchStats.matchId;
    console.warn(`[QualityCheck] Match ${matchId} flagged: ${reasons.join('; ')}`);
    try {
      await db.getPool().query(
        'UPDATE matches SET flagged_for_review = true WHERE match_id = $1',
        [matchId]
      );
    } catch (e) {
      console.error('[QualityCheck] DB flag error:', e.message);
    }
    const siteUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 5000}`;
    const reviewUrl = `${siteUrl}/admin/matches/${matchId}`;
    this._notifyAdminChannel(
      `⚠️ **Match ${matchId} flagged for review**\n` +
      `Issues detected: ${reasons.join(', ')}.\n` +
      `Review/delete: ${reviewUrl}`
    );
  }

  _notifyAdminChannel(msg) {
    const adminId = config.discord.adminChannelId;
    if (adminId) {
      const ch = this.client.channels.cache.get(adminId) || null;
      if (ch) { ch.send(msg).catch(e => console.error('[AdminChannel] Send error:', e.message)); return; }
      this.client.channels.fetch(adminId).then(fetched => {
        if (fetched) fetched.send(msg).catch(e => console.error('[AdminChannel] Send error:', e.message));
      }).catch(() => this._notifyChannel(msg));
    } else {
      this._notifyChannel(msg);
    }
  }

  async _rconResetServer() {
    const ds = config.dota?.dedicatedServer;
    if (!ds?.ip || !ds?.rconPassword) return;
    const { rconExec } = require('../services/rconClient');
    await rconExec('changelevel dota');
    console.log('[RCON] Server reset with changelevel dota after match recorded.');
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
        // Capture old MMR before updating so we can detect tier changes.
        let oldMmr = null;
        try {
          const oldRating = await db.getPlayerRating(r.id);
          oldMmr = oldRating ? oldRating.mmr : null;
        } catch (_) {}
        try {
          await db.updateRating(r.id, '', displayName, r.mu, r.sigma, r.mmr, won, matchStats.matchId || null);
        } catch (err) {
          console.error('[DB] Rating update error:', err.message);
        }
        // Rank-up announcement — fire-and-forget, must not block rating loop
        if (oldMmr !== null) {
          this._postRankUpAnnouncement(r.id, oldMmr, r.mmr, displayName)
            .catch(e => console.error('[RankUp] Error:', e.message));
        }
      }

      console.log(`[Ratings] Updated ${newRatings.length} player ratings.`);
    } catch (err) {
      console.error('[Ratings] Update error:', err.message);
    }
    // Check season end condition AFTER ratings are updated so the final
    // match's MMR changes are included in any summary that gets generated.
    this._checkSeasonEndCondition().catch(e => console.error('[Season] End check error:', e.message));
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
            const lm = this._lobbyManager;
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

      // Weekly leaderboard image — top 10 with weekly MMR delta
      try {
        const top10 = await db.getLeaderboardForImage(10);
        if (top10 && top10.length > 0) {
          const withDeltas = await Promise.all(top10.map(async pl => {
            const weekAgoMmr = await db.getPlayerMmrWeekAgo(pl.account_id).catch(() => null);
            return {
              ...pl,
              weeklyDelta: weekAgoMmr != null ? Math.round(pl.mmr - weekAgoMmr) : null,
            };
          }));
          const imgBuf = await generateLeaderboardImage(withDeltas, 'Weekly Leaderboard — Top 10');
          if (imgBuf) {
            const attachment = new AttachmentBuilder(imgBuf, { name: 'leaderboard.png' });
            await channel.send({ files: [attachment] });
          }
        }
      } catch (lbErr) {
        console.error('[Discord] Weekly leaderboard image error:', lbErr.message);
      }
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

        // Wave 2 F4 — per-category notification preference gate.
        const allowed = await db.isNotificationEnabled(reg.account_id_32, 'post_match_dm').catch(() => true);
        if (!allowed) continue;

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

    const STEAM64_OFFSET = 76561197960265728n;
    const toSteam64 = (accountId32) => {
      try { return (BigInt(accountId32) + STEAM64_OFFSET).toString(); } catch { return null; }
    };

    for (const user of mentions) {
      const nick = await db.getAllNicknames().then(ns => ns.find(n => n.discord_id === user.id));
      if (!nick) { allAccounts.push({ name: user.username, mmr: 2600, discordId: user.id, steam64: null }); continue; }
      const rating = await db.getPlayerRating(nick.account_id.toString());
      allAccounts.push({ name: nick.nickname, mmr: rating ? rating.mmr : 2600, discordId: user.id, steam64: toSteam64(nick.account_id) });
    }

    for (const name of names) {
      const nicks = await db.getAllNicknames();
      const nick = nicks.find(n => (n.nickname || '').toLowerCase() === name.toLowerCase());
      if (!nick) { allAccounts.push({ name, mmr: 2600, discordId: null, steam64: null }); continue; }
      const rating = await db.getPlayerRating(nick.account_id.toString());
      allAccounts.push({ name: nick.nickname, mmr: rating ? rating.mmr : 2600, discordId: nick.discord_id || null, steam64: toSteam64(nick.account_id) });
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

    // Save result so !assign can apply it later.
    this._lastBalance = { radiant: bestTeamA, dire: bestTeamB };

    const embed = new EmbedBuilder()
      .setTitle('⚖️ Balanced Teams')
      .setColor(0x6366f1)
      .setDescription(`MMR difference: **${bestDiff}** | ${n} players balanced`)
      .addFields(
        { name: `🟢 Radiant — avg ${avgA} MMR`, value: fmtTeam(bestTeamA) || 'None', inline: true },
        { name: `🔴 Dire — avg ${avgB} MMR`, value: fmtTeam(bestTeamB) || 'None', inline: true },
      )
      .setFooter({ text: 'Run !assign to move players into lobby slots and voice channels.' });

    await msg.channel.send({ embeds: [embed] });
  }

  async _cmdAssign(msg) {
    if (!this._lastBalance) {
      return msg.reply('No balance result found — run `!balance @p1 @p2 ...` first.');
    }
    const { radiant, dire } = this._lastBalance;
    const { getLobbyManager } = require('../lobby/lobbyManager');
    const lobbyManager = getLobbyManager();

    const radiantSteam64 = radiant.map(p => p.steam64).filter(Boolean);
    const direSteam64 = dire.map(p => p.steam64).filter(Boolean);

    // Attempt GC slot assignment (works if bot is lobby admin).
    let gcMsg = '';
    try {
      if (lobbyManager.state === 'WAITING') {
        const result = await lobbyManager.assignTeams(radiantSteam64, direSteam64);
        gcMsg = result.ok
          ? `\n✅ Lobby slots assigned via GC (${result.moved.length} players moved).`
          : `\n⚠️ GC slot assignment partial — ${result.errors.length} error(s). Players may need to join manually.`;
      } else {
        gcMsg = '\n⚠️ No active lobby — slot assignment skipped. Voice channels will still be moved.';
      }
    } catch (e) {
      gcMsg = `\n⚠️ GC slot assignment failed: ${e.message}`;
    }

    // Move Discord members to their voice channels.
    const direChId = config.discord.direVoiceChannelId;
    const radChId = config.discord.radiantVoiceChannelId;
    let voiceMoved = 0, voiceSkipped = 0;

    const moveGroup = async (players, channelId, teamName) => {
      for (const p of players) {
        if (!p.discordId) { voiceSkipped++; continue; }
        try {
          const guild = msg.guild;
          const member = guild ? await guild.members.fetch(p.discordId).catch(() => null) : null;
          if (!member?.voice?.channel) { voiceSkipped++; continue; }
          await member.voice.setChannel(channelId);
          voiceMoved++;
        } catch { voiceSkipped++; }
      }
    };

    await moveGroup(radiant, radChId, 'Radiant');
    await moveGroup(dire, direChId, 'Dire');

    const voiceMsg = voiceMoved > 0
      ? `\n🎙️ Moved ${voiceMoved} player(s) to voice channels.${voiceSkipped > 0 ? ` (${voiceSkipped} skipped — not in voice)` : ''}`
      : `\n🎙️ No players moved to voice (none in a voice channel).`;

    await msg.channel.send(`⚔️ Teams assigned!${gcMsg}${voiceMsg}`);
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

        // Wave 2 F4 — gate MVP/attitude DM on notification prefs (mvp_vote category covers both steps).
        const ratingsAllowed = await db.isNotificationEnabled(rater.account_id, 'mvp_vote').catch(() => true);
        if (!ratingsAllowed) continue;

        const allOthers = players.filter(p => p.account_id !== rater.account_id);
        if (allOthers.length === 0) continue;

        const user = await this.client.users.fetch(rater.discord_id).catch(e => {
          console.warn(`[Ratings] Could not fetch Discord user for ${rater.display_name} (id: ${rater.discord_id}): ${e.message}`);
          return null;
        });
        if (!user) {
          console.warn(`[Ratings] Skipping DM for ${rater.display_name} (discord_id: ${rater.discord_id}) — user not found`);
          continue;
        }

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
            // Check achievements for both the voter (votes_sent) and MVP recipient (mvp_wins)
            const raterAccountId = session.raterAccountId ? parseInt(session.raterAccountId) : 0;
            const mvpAccountId = mvpPlayer.account_id ? parseInt(mvpPlayer.account_id) : 0;
            const ratingGrants = [];
            if (raterAccountId) {
              const raterNew = await db.checkAndGrantAchievements([raterAccountId], session.matchId).catch(() => []);
              if (raterNew.length) ratingGrants.push({ player: { accountId: raterAccountId, personaname: '' }, newOnes: raterNew });
            }
            if (mvpAccountId) {
              const mvpNew = await db.checkAndGrantAchievements([mvpAccountId], session.matchId).catch(() => []);
              if (mvpNew.length) ratingGrants.push({ player: { accountId: mvpAccountId, personaname: mvpPlayer.display_name }, newOnes: mvpNew });
            }
            if (ratingGrants.length) this._notifyAchievementsUnlocked(ratingGrants).catch(() => {});
          }
          await msg.reply(`✅ MVP vote recorded for **${mvpPlayer.display_name}**!${session.isTest ? ' *(test — not saved)*' : ''}`);
        } else {
          await msg.reply(`Please reply with a number between 1 and ${session.teammates.length}, or \`skip\`.`);
          return;
        }
      }

      // Attitude step: only rate own team
      const ownTeam = session.teammates.filter(p => p.team === session.raterTeam);

      // Wave 2 F4 — gate the attitude DM step on the separate `attitude_vote` category.
      // If the player has opted out of attitude prompts only, end the session after MVP.
      const attitudeAllowed = await db.isNotificationEnabled(session.raterAccountId, 'attitude_vote').catch(() => true);
      if (!attitudeAllowed || ownTeam.length === 0) {
        this.pendingRatingSessions.delete(msg.author.id);
        return;
      }

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
          // Check achievements for all attitude recipients (well_rated)
          const attitudeGrants = [];
          for (const p of attitudePlayers) {
            const aid = p.account_id ? parseInt(p.account_id) : 0;
            if (!aid) continue;
            const newOnes = await db.checkAndGrantAchievements([aid], session.matchId).catch(() => []);
            if (newOnes.length) attitudeGrants.push({ player: { accountId: aid, personaname: p.display_name }, newOnes });
          }
          if (attitudeGrants.length) this._notifyAchievementsUnlocked(attitudeGrants).catch(() => {});
        }
        await msg.reply(`✅ Attitude ratings saved! Thanks for the feedback.${session.isTest ? ' *(test — not saved)*' : ''}`);
      } else {
        await msg.reply('Ratings skipped. See you next game!');
      }
      this.pendingRatingSessions.delete(msg.author.id);
    }
  }

  async _announceNewPatchNotes() {
    if (process.env.ANNOUNCE_PATCH_NOTES !== 'true') {
      console.log('[PatchNotes] Announcements disabled (ANNOUNCE_PATCH_NOTES != true) — skipping Discord post. Set this on the production server to enable.');
      return;
    }

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

  // Posts the Season 10 launch announcement. Called by the launch cron and the
  // manual "Launch Now" admin endpoint. Gated on ANNOUNCE_PATCH_NOTES so dev
  // bots don't double-post — flag flip and DB state still happen regardless.
  async announceSeason10Launch({ flippedKeys = [] } = {}) {
    if (process.env.ANNOUNCE_PATCH_NOTES !== 'true') {
      console.log('[Season10] Discord announcement disabled (ANNOUNCE_PATCH_NOTES != true) — skipping post.');
      return { posted: false, reason: 'announcements_disabled' };
    }

    const channelIds = config.discord.patchChannelIds.length > 0
      ? config.discord.patchChannelIds
      : (config.discord.announceChannelId ? [config.discord.announceChannelId] : []);
    if (!channelIds.length) {
      console.log('[Season10] No announcement channels configured — skipping post.');
      return { posted: false, reason: 'no_channels' };
    }
    const channels = await this._resolveChannels(channelIds);
    if (!channels.length) {
      console.error('[Season10] No accessible announcement channels found.');
      return { posted: false, reason: 'no_accessible_channels' };
    }

    const flagsLine = flippedKeys.length
      ? flippedKeys.map(k => `\`${k}\``).join(' · ')
      : '_(no preview flags were staged)_';

    const embed = new EmbedBuilder()
      .setTitle('⚡ Season 10 is live')
      .setColor(0xa855f7)
      .setDescription(
        'A fresh leaderboard, a brand-new 8-tier rank ladder, and a wave of features unlocking across the site.\n\n'
        + 'Every player starts on the new MMR baseline at **Tier V** — climb from there. '
        + 'Tournaments now support per-event Stripe buy-ins, and per-match MVP badges land on every scoreboard.\n\n'
        + 'Jump in now and start the climb. New here? **[Join the league](https://dota.stats.corvidaeinc.com/join)**.'
      )
      .addFields(
        { name: '🚀 Features unlocked', value: flagsLine, inline: false },
        { name: '🔗 Where to start', value: '[Leaderboard](https://dota.stats.corvidaeinc.com/leaderboard) · [Tournaments](https://dota.stats.corvidaeinc.com/tournaments) · [Patch Notes](https://dota.stats.corvidaeinc.com/patch-notes) · [Join the League](https://dota.stats.corvidaeinc.com/join)', inline: false }
      )
      .setFooter({ text: 'Season 10 — good luck on the climb' })
      .setTimestamp();

    let posted = 0;
    for (const ch of channels) {
      try {
        await ch.send({ content: '@everyone', embeds: [embed], allowedMentions: { parse: ['everyone'] } });
        posted++;
        console.log(`[Season10] Posted launch announcement to channel ${ch.id}.`);
      } catch (err) {
        console.error(`[Season10] Failed to post in channel ${ch.id}:`, err.message);
      }
    }
    return { posted: posted > 0, channels: posted };
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
            // Wave 2 F4 — gate schedule reminder DM on notification prefs.
            const reg = await db.getPlayerByDiscordId(rsvp.discord_id).catch(() => null);
            if (reg?.account_id_32) {
              const allowed = await db.isNotificationEnabled(reg.account_id_32, 'schedule_reminder').catch(() => true);
              if (!allowed) continue;
            }
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
      const lobbyManager = this._resolveLobbyManager();
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
          `${password ? `🔑 Password: \`${password}\`\n` : ''}` +
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

  /**
   * Post a rank-up announcement when a player crosses a tier boundary upward.
   */
  async _postRankUpAnnouncement(accountId, oldMmr, newMmr, displayName) {
    try {
      const oldTier = getMmrTier(oldMmr);
      const newTier = getMmrTier(newMmr);
      if (!oldTier || !newTier) return;
      if (oldTier.name === newTier.name) return;
      // Only announce promotions (not demotions)
      if (newMmr <= oldMmr) return;
      // Verify the tier actually changed (new tier must be higher min)
      if (newTier.min <= oldTier.min) return;

      const channelId = config.discord.announceChannelId
        || (config.discord.statsChannelIds.length > 0 ? config.discord.statsChannelIds[0] : null);
      if (!channelId) return;

      const channel = this.client.channels.cache.get(channelId)
        || await this.client.channels.fetch(channelId).catch(() => null);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`${newTier.emoji} Rank Up!`)
        .setDescription(
          `**${displayName}** has ranked up to **${newTier.emoji} ${newTier.name}**!\n` +
          `*${newTier.description}*`
        )
        .addFields(
          { name: 'Previous Tier', value: `${oldTier.emoji} ${oldTier.name}`, inline: true },
          { name: 'New Tier',      value: `${newTier.emoji} ${newTier.name}`, inline: true },
          { name: 'MMR',           value: `${Math.round(newMmr)}`,            inline: true },
        )
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      console.log(`[RankUp] ${displayName} ranked up from ${oldTier.name} → ${newTier.name}`);
    } catch (err) {
      console.error('[RankUp] Announce error:', err.message);
    }
  }

  /**
   * Check if any player in this match just hit a game-count milestone (50, 100, 150, …).
   * Posts a milestone embed to the announce channel for each hit.
   */
  async _checkMatchMilestones(matchStats) {
    const players = matchStats.players || [];
    if (players.length === 0) return;

    const channelId = config.discord.announceChannelId
      || (config.discord.statsChannelIds.length > 0 ? config.discord.statsChannelIds[0] : null);
    if (!channelId) return;

    const DEFAULT_MILESTONES = [50, 100, 150, 200];
    let milestoneThresholds = DEFAULT_MILESTONES;
    try {
      const stored = await db.getSetting('engagement_milestone_thresholds');
      if (stored) {
        const parsed = stored.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
        if (parsed.length > 0) milestoneThresholds = parsed;
      }
    } catch (e) {
      console.warn('[Milestone] Could not load thresholds from settings, using defaults:', e.message);
    }
    const milestoneSet = new Set(milestoneThresholds);

    for (const pl of players) {
      const accountId = pl.accountId || pl.account_id;
      if (!accountId || accountId === 0 || accountId === '0') continue;
      try {
        const count = await db.getPlayerMatchCount(accountId);
        if (!milestoneSet.has(count)) continue;
        const milestone = count;

        const channel = this.client.channels.cache.get(channelId)
          || await this.client.channels.fetch(channelId).catch(() => null);
        if (!channel) continue;

        const name = pl.personaname || pl.persona_name || `Player ${accountId}`;
        const embed = new EmbedBuilder()
          .setColor(0x3b82f6)
          .setTitle('\uD83C\uDF89 Match Milestone!')
          .setDescription(`**${name}** has played their **${milestone}th inhouse match!** Impressive commitment.`)
          .setTimestamp();

        await channel.send({ embeds: [embed] });
        console.log(`[Milestone] ${name} reached ${milestone} matches`);
      } catch (err) {
        console.error('[Milestone] Error:', err.message);
      }
    }
  }

  /**
   * Check all-time per-match records and post an embed for each broken record.
   */
  async _checkAndAnnounceRecords(matchStats) {
    try {
      const matchId = matchStats.matchId || matchStats.match_id;
      if (!matchId) return;

      const broken = await db.checkAndUpdateMatchRecords(matchId);
      if (!broken || broken.length === 0) return;

      const channelId = config.discord.announceChannelId
        || (config.discord.statsChannelIds.length > 0 ? config.discord.statsChannelIds[0] : null);
      if (!channelId) return;

      const channel = this.client.channels.cache.get(channelId)
        || await this.client.channels.fetch(channelId).catch(() => null);
      if (!channel) return;

      const STAT_LABELS = {
        kills:        { label: 'Most Kills',         emoji: '\u2694\uFE0F', format: v => Math.round(v) },
        gpm:          { label: 'Highest GPM',         emoji: '\uD83D\uDCB0', format: v => Math.round(v) + ' GPM' },
        assists:      { label: 'Most Assists',        emoji: '\uD83E\uDD1D', format: v => Math.round(v) },
        hero_damage:  { label: 'Most Hero Damage',    emoji: '\uD83D\uDCA5', format: v => Math.round(v).toLocaleString() },
        tower_damage: { label: 'Most Tower Damage',   emoji: '\uD83C\uDFF0', format: v => Math.round(v).toLocaleString() },
        last_hits:    { label: 'Most Last Hits',      emoji: '\u2694\uFE0F', format: v => Math.round(v) },
      };

      for (const rec of broken) {
        const meta = STAT_LABELS[rec.statKey] || { label: rec.statKey, emoji: '\uD83C\uDFC6', format: v => v };
        const newValStr = meta.format(rec.newValue);
        let desc = `**${rec.newHolderName || 'Unknown'}** set a new all-time record for **${meta.label}**: **${newValStr}**`;
        if (rec.oldHolderName && rec.oldValue != null) {
          desc += `\n*Previous record: ${meta.format(rec.oldValue)} by ${rec.oldHolderName}*`;
        } else {
          desc += '\n*This is the first time this record has been set!*';
        }

        const embed = new EmbedBuilder()
          .setColor(0xff9900)
          .setTitle(`${meta.emoji} All-Time Record Broken!`)
          .setDescription(desc)
          .setFooter({ text: `Match #${rec.matchId}` })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
        console.log(`[Record] ${rec.statKey} broken by ${rec.newHolderName} with ${rec.newValue}`);
      }
    } catch (err) {
      console.error('[Records] Announce error:', err.message);
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

      // Season 10 launch is no longer scheduled automatically. The launch is
      // now triggered exclusively via the superuser "Launch Season 10 Now"
      // button in the Admin Panel (with a double confirmation), which calls
      // POST /api/admin/launch-season-10 → db.executeSeason10Launch() →
      // bot.announceSeason10Launch(). Keeping this comment as a signpost.
      console.log('[Discord] Season 10 launch is manual-only (Admin Panel button).');

      // Game reminders: check every 10 minutes for upcoming games needing 24h/1h reminders
      setInterval(() => this._sendScheduleReminders().catch(err => console.error('[Reminders] Error:', err.message)), 10 * 60 * 1000);
      setTimeout(() => this._sendScheduleReminders().catch(() => {}), 15000);

      // Auto-create lobby at game time: check every minute
      setInterval(() => this._autoCreateScheduledLobbies().catch(err => console.error('[LobbyAuto] Error:', err.message)), 60 * 1000);

      // Position baselines recompute — weekly (Mondays 3am UTC) so PERF
      // timeline_v1 baselines stay current as the patch meta evolves. Owner can
      // also trigger it on demand via `!recompute-baselines`.
      cron.schedule('0 3 * * 1', () => {
        this._runPositionBaselinesRecompute('weekly').catch(() => {});
      }, { timezone: 'UTC' });
      console.log('[Discord] Position baselines recompute scheduled (Mondays 03:00 UTC).');

      // Startup catch-up: run once shortly after boot if the table is empty or
      // older than ~10 days, so a freshly redeployed bot does not have to wait
      // a full week before timeline_v1 becomes usable.
      setTimeout(() => {
        (async () => {
          try {
            const pool = db.getPool();
            const r = await pool.query(
              `SELECT COUNT(*)::int AS n, MAX(updated_at) AS last
                 FROM position_baselines`
            );
            const n = r.rows[0]?.n || 0;
            const last = r.rows[0]?.last ? new Date(r.rows[0].last) : null;
            const ageDays = last ? (Date.now() - last.getTime()) / 86400000 : Infinity;
            if (n < 200 || ageDays > 10) {
              console.log(`[Baselines] Startup recompute (rows=${n}, ageDays=${ageDays.toFixed(1)}).`);
              await this._runPositionBaselinesRecompute('startup');
            } else {
              console.log(`[Baselines] Startup check OK (rows=${n}, ageDays=${ageDays.toFixed(1)}) — skipping recompute.`);
            }
          } catch (err) {
            console.error('[Baselines] Startup check failed:', err.message);
          }
        })();
      }, 60_000);

      // Coaching marketplace reminders (T13) — hourly cron, no-ops while flag is off
      this.startCoachingReminderCron();
      this.startCoachingAutoReleaseCron();
      console.log('[Discord] Coaching reminder + auto-release crons scheduled.');

      // Daily season end-date check — runs at midnight Australia/Sydney time
      // (AEDT UTC+11 in summer, AEST UTC+10 in winter — node-cron handles DST).
      // Ensures seasons are closed and announced even if no match is played on
      // the final day (end_date check normally fires only after a match is recorded).
      cron.schedule('0 0 * * *', () => {
        console.log('[Season] Running daily end-condition check...');
        this._checkSeasonEndCondition().catch(e =>
          console.error('[Season] Daily end-condition check error:', e.message)
        );
      }, { timezone: 'Australia/Sydney' });
      console.log('[Discord] Daily season end-condition check scheduled (midnight Australia/Sydney time).');

      // Startup check — catch any season whose end_date already passed before
      // the next scheduled midnight (e.g. the bot restarted after a missed run).
      setTimeout(() => {
        console.log('[Season] Running startup end-condition check...');
        this._checkSeasonEndCondition().catch(e =>
          console.error('[Season] Startup end-condition check error:', e.message)
        );
      }, 30000);

      // 10-player seated notification
      const lobbyMgr = this._lobbyManager;
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

  async _cmdTestGame(msg, args) {
    // Creates a test lobby (All Pick, bots fill empty slots, cheats on) so the full
    // post-game pipeline — leave-after-launch, GC poll, replay download, parse, DB write,
    // TrueSkill, Discord summary — can be verified without 10 real players.
    //
    // Usage: !testgame [lobby name]
    // Steps after running:
    //   1. Join via Steam friends list or !invite
    //   2. Other empty slots auto-fill with bots when you launch
    //   3. In-game: open console, type  sv_cheats 1  then  dota_kill_buildings_now
    //      (or just play for a few minutes naturally and let bots lose)
    //   4. After the game ends the bot should auto-record and post a summary here

    if (!steamAvailable) {
      return msg.reply('Steam/Dota 2 is not connected. Cannot create test lobby.');
    }
    const lobbyManager = this._resolveLobbyManager();
    if (!lobbyManager) return msg.reply('Lobby manager is not available.');
    const steamClient = tryGetSteamClient();
    if (!steamClient?.isGCReady || !steamClient?.gcClient) {
      return msg.reply('Game Coordinator is not ready. Try `!steam_status`.');
    }

    const lobbyName = args.length > 0 ? args.join(' ') : 'TestGame';
    const password = 'test';
    this.lobbyChannelId = msg.channel.id;

    await msg.reply(`🧪 Creating test lobby **${lobbyName}** (All Pick, bots fill empty slots, cheats on)...`);

    try {
      const { GAME_MODE } = require('../steam/dota2GC');
      await lobbyManager.createLobby(lobbyName, password, msg.author.id, {
        fillWithBots: true,
        allowCheats: true,
        gameMode: GAME_MODE.ALL_PICK,
      });

      const embed = new EmbedBuilder()
        .setTitle('🧪 Test Lobby Ready')
        .setColor(0xf39c12)
        .setDescription(
          '**How to test:**\n' +
          '1. Join via Steam friends list → right-click bot → **Join Game**\n' +
          `2. Password: \`${password}\`\n` +
          '3. Use `!start_game` to launch — remaining slots auto-fill with bots\n' +
          '4. In-game console: `sv_cheats 1` → `dota_kill_buildings_now` to end quickly\n' +
          '   (or play naturally — bots will eventually lose/win)\n\n' +
          '**What will be tested:**\n' +
          '• Bot leaves lobby immediately after launch ✓\n' +
          '• GC poll detects match end (every 5 min) ✓\n' +
          '• Replay downloaded from Valve CDN ✓\n' +
          '• Java parser runs → full stats recorded ✓\n' +
          '• TrueSkill updated, match summary posted here ✓'
        )
        .setFooter({ text: 'Use !end to clean up if anything goes wrong' });

      await msg.channel.send({ embeds: [embed] });
    } catch (err) {
      await msg.reply(`❌ Failed to create test lobby: ${err.message}`);
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

  // ───────── Coaching Marketplace (T13) ─────────
  // All three DMs no-op when the `coaching_marketplace` flag is off (callers
  // already check it) and additionally consult `db.isNotificationEnabled` so
  // each player can opt out of any category from /settings/notifications.

  async notifyCoachingBookingConfirmed(booking) {
    if (!booking) return;
    try {
      // Booking rows expose `coach_account_id` (BIGINT, the Steam account id);
      // there is no `coach_id` field. db.getCoach takes the account_id.
      const coach = await db.getCoach(booking.coach_account_id).catch(() => null);
      if (!coach) return;
      // Site URL + voice channel link must be env-driven so DMs work across
      // dev / staging / prod and we never bake a deploy IP into chat. The
      // voice link points at the community guild (DISCORD_INVITE) since we
      // deliberately don't ship a built-in video tool — sessions happen in
      // the community Discord.
      const siteUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 5000}`;
      const voiceUrl = config.discord.serverInvite || null;
      const cancelUrl = `${siteUrl}/me/bookings`;
      const recipients = [
        { account_id: booking.student_account_id, role: 'student' },
        { account_id: coach.account_id, role: 'coach' },
      ];
      for (const r of recipients) {
        const allowed = await db.isNotificationEnabled(r.account_id, 'coaching_booking_confirmed').catch(() => true);
        if (!allowed) continue;
        const discordId = await db.getDiscordIdByAccountId(r.account_id).catch(() => null);
        if (!discordId) continue;
        const user = await this.client.users.fetch(discordId).catch(() => null);
        if (!user) continue;
        const when = new Date(booking.slot_start_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
        const otherName = r.role === 'student'
          ? (coach.display_name || `Coach #${coach.id}`)
          : (booking.student_name || `Player ${booking.student_account_id}`);
        const lines = [
          `Your coaching session is locked in!`,
          ``,
          `**With:** ${otherName}`,
          `**When:** ${when} (Sydney)`,
          `**Length:** ${booking.duration_minutes} minutes`,
          ``,
          (r.role === 'student'
            ? `Funds are held in escrow until you both confirm completion.`
            : `You'll receive payout via Stripe after the session is confirmed.`),
          ``,
          voiceUrl
            ? `🎙 **Voice:** [Join the community Discord](${voiceUrl}) — coach + student meet in voice at the scheduled time.`
            : `🎙 **Voice:** Meet in your community Discord voice channel at the scheduled time.`,
          (r.role === 'student'
            ? `❌ **Cancel / no-show refund:** [${cancelUrl}](${cancelUrl})`
            : `📋 **Manage booking:** [${cancelUrl}](${cancelUrl})`),
        ];
        const embed = new EmbedBuilder()
          .setTitle('🎓 Coaching booking confirmed')
          .setColor(0x10b981)
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Toggle off in /settings/notifications' });
        await user.send({ embeds: [embed] }).catch(() => {});
      }
    } catch (e) { console.warn('[Coaching] notifyCoachingBookingConfirmed failed:', e.message); }
  }

  async notifyCoachingReviewPrompt(booking) {
    if (!booking) return;
    try {
      const allowed = await db.isNotificationEnabled(booking.student_account_id, 'coaching_review_request').catch(() => true);
      if (!allowed) return;
      const discordId = await db.getDiscordIdByAccountId(booking.student_account_id).catch(() => null);
      if (!discordId) return;
      const user = await this.client.users.fetch(discordId).catch(() => null);
      if (!user) return;
      const coach = await db.getCoach(booking.coach_account_id).catch(() => null);
      const coachName = coach?.display_name || `Coach #${booking.coach_account_id}`;
      // Env-driven site URL — never bake a deploy IP into outbound DMs so
      // links keep working across dev / staging / prod.
      const siteUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 5000}`;
      const reviewUrl = `${siteUrl}/me/bookings`;
      const embed = new EmbedBuilder()
        .setTitle('★ How was your coaching session?')
        .setColor(0xfbbf24)
        .setDescription(
          `Your session with **${coachName}** is complete.\n\n` +
          `[Leave a review](${reviewUrl}) — it helps other players find great coaches.`
        )
        .setFooter({ text: 'Toggle off in /settings/notifications' });
      await user.send({ embeds: [embed] }).catch(() => {});
    } catch (e) { console.warn('[Coaching] notifyCoachingReviewPrompt failed:', e.message); }
  }

  // Hourly cron — DM both parties ~1h before slot starts.
  // Idempotent via `coaching_bookings.reminder_sent_at` (set inside the helper).
  startCoachingReminderCron() {
    if (this._coachingReminderTimer) return;
    const tick = async () => {
      try {
        const flag = await db.getFeatureFlag('coaching_marketplace').catch(() => null);
        if (flag?.state !== 'on') return;
        const due = await db.listBookingsDueForReminder().catch(() => []);
        for (const b of due) {
          try {
            const coach = await db.getCoach(b.coach_account_id).catch(() => null);
            if (!coach) continue;
            const recipients = [
              { account_id: b.student_account_id, name: coach.display_name || `Coach #${coach.id}` },
              { account_id: coach.account_id, name: b.student_name || `Player ${b.student_account_id}` },
            ];
            const siteUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 5000}`;
            for (const r of recipients) {
              const allowed = await db.isNotificationEnabled(r.account_id, 'coaching_session_reminder').catch(() => true);
              if (!allowed) continue;
              const discordId = await db.getDiscordIdByAccountId(r.account_id).catch(() => null);
              if (!discordId) continue;
              const user = await this.client.users.fetch(discordId).catch(() => null);
              if (!user) continue;
              const when = new Date(b.slot_start_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' });
              // Coach gets an extra nudge to click "Mark arrived" — without
              // it the student can unilaterally trigger no-show refund 10
              // minutes after slot start.
              const isCoach = String(r.account_id) === String(b.coach_account_id);
              const extra = isCoach
                ? `\n👉 When you join voice, click **✓ Mark arrived** on ${siteUrl}/me/bookings so the student can't accidentally trigger a no-show refund.`
                : '';
              await user.send(`⏰ Coaching session with **${r.name}** in ~1 hour (${when} Sydney). See you in Discord!${extra}`).catch(() => {});
            }
            await db.stampBookingReminderSent(b.id).catch(() => {});
          } catch (e) { console.warn(`[Coaching] reminder failed for booking ${b.id}:`, e.message); }
        }
      } catch (e) { console.warn('[Coaching] reminder cron failed:', e.message); }
    };
    this._coachingReminderTimer = setInterval(tick, 60 * 60 * 1000); // 1h
    setTimeout(tick, 30 * 1000); // first run after 30s
  }

  // Auto-release cron — every 30min, look for paid bookings whose slot ended
  // more than 48h ago without a dispute. With manual capture the funds were
  // only AUTHORIZED at payment time, not transferred — so "release" here
  // means: capture the PI via Stripe (which moves money to the coach's
  // Connect balance through the original transfer_data.destination + takes
  // our application_fee), THEN flip the row to 'completed' and DM the
  // student a review prompt. We never flip the row before capture succeeds:
  // if Stripe errors, the booking stays 'paid' and the next cron tick will
  // retry. Idempotent — autoReleaseBooking only fires when status='paid'.
  startCoachingAutoReleaseCron() {
    if (this._coachingAutoReleaseTimer) return;
    // Lazy Stripe instantiation — only construct the SDK when we actually
    // have a key. Bot starts fine without Stripe (cron just no-ops on rows
    // that need capture, which is the safe failure mode).
    let _stripe = null;
    const stripeFn = () => {
      if (_stripe) return _stripe;
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) return null;
      try { _stripe = require('stripe')(key); } catch (_) { _stripe = null; }
      return _stripe;
    };
    const tick = async () => {
      try {
        const flag = await db.getFeatureFlag('coaching_marketplace').catch(() => null);
        if (flag?.state !== 'on') return;
        const due = await db.listAutoReleasableBookings(48).catch(() => []);
        if (!due.length) return;
        const stripe = stripeFn();
        for (const b of due) {
          try {
            // Step 1: capture the held funds. Skip silently if we don't
            // have Stripe configured or the booking is missing a PI — those
            // rows can't be auto-released safely and need admin attention.
            if (!stripe || !b.stripe_payment_intent) {
              console.warn(`[Coaching] auto-release skipped booking ${b.id}: missing stripe or PI`);
              continue;
            }
            try {
              await stripe.paymentIntents.capture(b.stripe_payment_intent);
            } catch (capErr) {
              const code = capErr?.code || capErr?.raw?.code;
              // 'payment_intent_unexpected_state' = already captured (e.g.
              // race with confirm-completion). Treat as success and let
              // the DB flip proceed.
              if (code !== 'payment_intent_unexpected_state') {
                console.warn(`[Coaching] auto-release capture failed for booking ${b.id}: ${capErr.message}`);
                continue; // leave row at 'paid' for next tick / admin
              }
            }
            // Step 2: only now flip the DB row.
            const released = await db.autoReleaseBooking(b.id).catch(() => null);
            if (!released) continue; // raced with a dispute / manual release
            console.log(`[Coaching] Auto-released booking ${b.id} after 48h grace (captured)`);
            try {
              if (typeof this.notifyCoachingReviewPrompt === 'function') {
                this.notifyCoachingReviewPrompt(released).catch(() => {});
              }
            } catch (_) { /* DM dispatch is best-effort */ }
          } catch (e) { console.warn(`[Coaching] auto-release failed for booking ${b.id}:`, e.message); }
        }
      } catch (e) { console.warn('[Coaching] auto-release cron failed:', e.message); }
    };
    this._coachingAutoReleaseTimer = setInterval(tick, 30 * 60 * 1000); // 30min
    setTimeout(tick, 60 * 1000); // first run after 60s
  }

  async _notifyAchievementsUnlocked(allGrants) {
    const channels = await this._resolveChannels(
      config.discord.statsChannelIds.length > 0 ? config.discord.statsChannelIds : (this.lobbyChannelId ? [this.lobbyChannelId] : [])
    );
    if (!channels.length) return;

    for (const { player, newOnes } of allGrants) {
      const name = player.name || player.personaname || `Player ${player.accountId}`;
      const lines = newOnes.map(a => {
        const label = a.secret && !a.earned ? '???' : a.label;
        return `${a.icon}  **${label}** — ${a.desc}`;
      });
      const embed = {
        color: 0xf59e0b,
        title: `🏅 Achievement Unlocked!`,
        description: `**${name}** just earned ${newOnes.length === 1 ? 'a new achievement' : `${newOnes.length} new achievements`}!\n\n${lines.join('\n')}`,
        timestamp: new Date().toISOString(),
        footer: { text: 'Achievement Hunters' },
      };
      for (const ch of channels) {
        await ch.send({ embeds: [embed] }).catch(e =>
          console.error(`[Achievements] Discord send error (${ch.id}):`, e.message)
        );
      }
    }
  }

  async notifyGiftReceived({ recipientAccountId, gifterName, giftType }) {
    try {
      const discordId = await db.getDiscordIdByAccountId(recipientAccountId).catch(() => null);
      if (!discordId) return;
      const user = await this.client.users.fetch(discordId).catch(() => null);
      if (!user) return;
      const siteUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 5000}`;
      const giftLabel = giftType === 'pro' ? '⭐ Pro Membership' : '🎫 Season Pass';
      const embed = new EmbedBuilder()
        .setTitle(`🎁 You received a gift!`)
        .setColor(0xf59e0b)
        .setDescription(
          `**${gifterName || 'A fellow player'}** gifted you **${giftLabel}** on Inhouse Stats!\n\n` +
          `${giftType === 'pro'
            ? `Your Pro membership is now active. Enjoy all Pro features at [${siteUrl}/pro](${siteUrl}/pro).`
            : `Your Season Pass has been activated for the current season. Check your progress at [${siteUrl}/players](${siteUrl}/players).`}`
        )
        .setFooter({ text: 'Inhouse Stats' });
      await user.send({ embeds: [embed] }).catch(() => {});
    } catch (e) {
      console.warn('[Gift] notifyGiftReceived failed:', e.message);
    }
  }

  // Verify a Discord User ID before persisting it during the first-login
  // onboarding flow (task 97). Returns:
  //   { ok: true,  username }                    — ID is real AND we DM'd them
  //   { ok: false, code, error }                 — could not verify
  // Codes:
  //   not_ready   — bot client isn't logged in yet (transient)
  //   not_found   — Discord REST returned no such user
  //   dm_blocked  — user exists but won't accept DMs from us
  //   unknown     — anything else
  async verifyAndConfirmDiscordId(targetDiscordId) {
    if (!this.client || !this.client.readyAt) {
      return { ok: false, code: 'not_ready', error: 'Discord bot is starting up. Try again in a moment.' };
    }
    let user;
    try {
      user = await this.client.users.fetch(targetDiscordId);
    } catch (err) {
      const msg = (err && err.message) || '';
      if (err?.code === 10013 || /Unknown User/i.test(msg)) {
        return {
          ok: false,
          code: 'not_found',
          error: "That Discord ID doesn't belong to any user. Double-check you copied it correctly (right-click your name → Copy User ID).",
        };
      }
      return { ok: false, code: 'unknown', error: 'Could not reach Discord to verify that ID. Try again in a moment.' };
    }
    if (!user) {
      return {
        ok: false,
        code: 'not_found',
        error: "That Discord ID doesn't belong to any user. Double-check you copied it correctly.",
      };
    }
    try {
      await user.send(
        "✅ **OCE Inhouse — Discord linked.**\n" +
        "This DM confirms your Discord account is now linked to your Steam profile on the league site. " +
        "You'll receive match results, MVP votes, and league announcements here.\n\n" +
        "_(If you didn't just link your account on oceinhouse.gg, reply `!unlink` and let an admin know.)_"
      );
    } catch (err) {
      const code = err?.code;
      // 50007 = Cannot send messages to this user (DMs disabled / not in a shared server / blocked bot)
      if (code === 50007) {
        return {
          ok: false,
          code: 'dm_blocked',
          error: "We found that Discord user but couldn't DM them. In Discord, join the OCE Inhouse server and enable \"Direct Messages from server members\" in Privacy Settings, then try again.",
        };
      }
      return { ok: false, code: 'unknown', error: 'Could not send a confirmation DM to that Discord user. Try again in a moment.' };
    }
    return { ok: true, username: user.username };
  }

  // Task 104 — pull a freshly-OAuth-linked user into the league's Discord
  // server and assign them the standard "League Member" role, so brand-new
  // signups don't have to find and join the server manually.
  //
  // Requires:
  //   • DISCORD_TOKEN              — the bot token (already required for the
  //                                  rest of the bot)
  //   • DISCORD_GUILD_ID           — the snowflake of the OCE Inhouse server
  //   • DISCORD_LEAGUE_MEMBER_ROLE_ID (optional) — the role to attach at join
  //
  // The bot account also needs the **CREATE_INSTANT_INVITE** permission in
  // the target guild for `PUT /guilds/{guild.id}/members/{user.id}` to
  // succeed, plus **MANAGE_ROLES** if a role is being assigned. The OAuth
  // grant must include the `guilds.join` scope (the web /auth/discord route
  // requests it).
  //
  // Returns one of:
  //   { ok: true,  added: true }    — user was newly joined to the guild
  //   { ok: true,  added: false }   — user was already a member (204 from
  //                                   Discord); role assignment was still
  //                                   attempted if configured
  //   { ok: false, code, error }    — config missing or Discord API rejected
  //
  // Never throws — every failure path returns a result object so callers
  // can log without taking down the surrounding link flow.
  async addUserToLeagueGuild(discordId, accessToken) {
    const guildId = process.env.DISCORD_GUILD_ID;
    const botToken = process.env.DISCORD_TOKEN;
    const roleId = process.env.DISCORD_LEAGUE_MEMBER_ROLE_ID || null;
    if (!guildId) {
      const r = { ok: false, code: 'guild_not_configured', error: 'DISCORD_GUILD_ID is not set; skipping guild auto-join.' };
      this._recordGuildAutoJoinResult(discordId, r);
      this._alertGuildAutoJoinFailure(discordId, r);
      return r;
    }
    if (!botToken) {
      const r = { ok: false, code: 'bot_token_missing', error: 'DISCORD_TOKEN is not set; cannot call /guilds/.../members.' };
      this._recordGuildAutoJoinResult(discordId, r);
      this._alertGuildAutoJoinFailure(discordId, r);
      return r;
    }
    if (!/^\d{17,19}$/.test(String(discordId))) {
      const r = { ok: false, code: 'bad_discord_id', error: 'Invalid Discord user id.' };
      this._recordGuildAutoJoinResult(discordId, r);
      return r;
    }
    if (!accessToken || typeof accessToken !== 'string') {
      const r = { ok: false, code: 'no_access_token', error: 'Missing OAuth access token from caller.' };
      this._recordGuildAutoJoinResult(discordId, r);
      return r;
    }

    const url = `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`;
    const body = { access_token: accessToken };
    if (roleId && /^\d{17,19}$/.test(roleId)) body.roles = [roleId];

    let res;
    try {
      res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.warn(`[Discord] guild auto-join fetch failed for ${discordId}:`, err.message);
      const r = { ok: false, code: 'network', error: err.message };
      this._recordGuildAutoJoinResult(discordId, r);
      this._alertGuildAutoJoinFailure(discordId, r);
      return r;
    }

    // 201 Created = newly added. 204 No Content = already in the guild
    // (Discord returns 204 with no body in that case). Both are success.
    if (res.status === 201) {
      console.log(`[Discord] guild auto-join: added ${discordId} to guild ${guildId}${roleId ? ` with role ${roleId}` : ''}.`);
      const r = { ok: true, added: true };
      this._recordGuildAutoJoinResult(discordId, r);
      return r;
    }
    if (res.status === 204) {
      console.log(`[Discord] guild auto-join: ${discordId} already in guild ${guildId}; attempting role top-up.`);
      // The PUT does NOT (re-)assign roles when the member already exists, so
      // explicitly add the league role via the role-add endpoint. Best-effort.
      if (roleId && /^\d{17,19}$/.test(roleId)) {
        try {
          const roleRes = await fetch(
            `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}/roles/${roleId}`,
            { method: 'PUT', headers: { Authorization: `Bot ${botToken}` } },
          );
          if (!roleRes.ok && roleRes.status !== 204) {
            const text = await roleRes.text().catch(() => '');
            console.warn(`[Discord] guild role-add failed for ${discordId}: ${roleRes.status} ${text.slice(0, 200)}`);
          }
        } catch (err) {
          console.warn(`[Discord] guild role-add threw for ${discordId}:`, err.message);
        }
      }
      const r = { ok: true, added: false };
      this._recordGuildAutoJoinResult(discordId, r);
      return r;
    }

    // Any other status is a real failure — log enough context for ops to
    // diagnose (missing perms, invalid token, user banned, etc.) but don't
    // throw, so the caller can degrade gracefully.
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
    console.warn(`[Discord] guild auto-join failed for ${discordId}: ${res.status} ${detail}`);
    const result = { ok: false, code: `http_${res.status}`, error: detail || `HTTP ${res.status}` };
    this._recordGuildAutoJoinResult(discordId, result);
    this._alertGuildAutoJoinFailure(discordId, result);
    return result;
  }

  // Task #127 / Task #135 — record an auto-join outcome to both an in-memory
  // ring buffer (cheap fast path used as a fallback if the DB read in
  // getGuildAutoJoinStats fails) AND the persistent `discord_autojoin_log`
  // table so the admin health panel's 24h rollup and last-failure record
  // survive PM2 restarts and deploys. The DB write is fire-and-forget so a
  // transient DB blip can never break the OAuth sign-up flow. The on-write
  // prune is throttled to once per hour so we don't hammer the table.
  _recordGuildAutoJoinResult(discordId, result) {
    try {
      if (!this._guildAutoJoinHistory) this._guildAutoJoinHistory = [];
      let code;
      if (result?.ok) {
        code = result.added ? 'success_added' : 'success_already';
      } else {
        code = result?.code || 'unknown';
      }
      const entry = {
        ts: Date.now(),
        code,
        ok: Boolean(result?.ok),
        discordId: String(discordId || ''),
        error: result?.ok ? null : (result?.error ? String(result.error).slice(0, 200) : null),
      };
      this._guildAutoJoinHistory.push(entry);
      if (this._guildAutoJoinHistory.length > 50) {
        this._guildAutoJoinHistory.splice(0, this._guildAutoJoinHistory.length - 50);
      }

      // Fire-and-forget persistent write + opportunistic prune.
      try {
        const db = require('../db');
        if (typeof db.appendDiscordAutoJoinLog === 'function') {
          db.appendDiscordAutoJoinLog(entry).catch(err =>
            console.warn('[Discord] appendDiscordAutoJoinLog failed:', err.message)
          );
        }
        const ONE_HOUR = 60 * 60 * 1000;
        const now = Date.now();
        if (typeof db.pruneDiscordAutoJoinLog === 'function'
            && (!this._guildAutoJoinLastPruneTs || now - this._guildAutoJoinLastPruneTs > ONE_HOUR)) {
          this._guildAutoJoinLastPruneTs = now;
          db.pruneDiscordAutoJoinLog(7).catch(err =>
            console.warn('[Discord] pruneDiscordAutoJoinLog failed:', err.message)
          );
          // Task #143 — piggy-back on the same hourly throttle to drop
          // ancient pending auto-join failure rows so the admin queue
          // doesn't accumulate players who never come back. Threshold is
          // env-overridable for ops; defaults to 30 days.
          if (typeof db.pruneDiscordAutoJoinFailures === 'function') {
            const failureDays = Math.max(
              1,
              Math.min(365, parseInt(process.env.DISCORD_AUTOJOIN_FAILURE_PRUNE_DAYS, 10) || 30)
            );
            db.pruneDiscordAutoJoinFailures(failureDays).catch(err =>
              console.warn('[Discord] pruneDiscordAutoJoinFailures failed:', err.message)
            );
          }
        }
      } catch (err) {
        console.warn('[Discord] persist auto-join log failed:', err.message);
      }
    } catch (err) {
      console.warn('[Discord] _recordGuildAutoJoinResult error:', err.message);
    }
  }

  // Task #127 / Task #135 — rolled-up view of the auto-join history for the
  // admin dashboard. Reads from the persistent `discord_autojoin_log` table
  // so 24h counts and the last-failure record survive bot restarts and
  // deploys. Falls back to the in-memory ring buffer if the DB read fails.
  // Counts are scoped to the last 24 hours; `last_failure` is the most
  // recent non-ok entry across the whole returned slice (so admins can still
  // see what last broke even if the failure happened > 24h ago).
  async getGuildAutoJoinStats() {
    let history = [];
    try {
      const db = require('../db');
      if (typeof db.getRecentDiscordAutoJoinLog === 'function') {
        history = await db.getRecentDiscordAutoJoinLog(500);
        // DB returns newest-first; the rest of this method walks oldest-
        // first / newest-from-end, matching the ring-buffer ordering.
        history = history.slice().reverse();
      }
    } catch (err) {
      console.warn('[Discord] getGuildAutoJoinStats: DB read failed, using in-memory fallback:', err.message);
      history = [];
    }
    if (!history.length) {
      history = this._guildAutoJoinHistory || [];
    }
    const WINDOW_MS = 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - WINDOW_MS;
    const recent = history.filter(e => e.ts >= cutoff);
    const counts = {};
    for (const e of recent) {
      counts[e.code] = (counts[e.code] || 0) + 1;
    }
    const HINTS = {
      guild_not_configured: 'Set DISCORD_GUILD_ID on the bot host.',
      bot_token_missing: 'Set DISCORD_TOKEN on the bot host.',
      bad_discord_id: 'Caller passed an invalid Discord user id (likely an unlinked account).',
      no_access_token: 'Caller did not include an OAuth access token (re-link required).',
      network: 'Discord API was unreachable — check outbound connectivity / Discord status.',
      http_401: 'Bot token rejected — check DISCORD_TOKEN is current.',
      http_403: 'Missing Create Instant Invite / Manage Roles, or the league role sits above the bot in the role list.',
      http_404: 'Guild or user not found — verify DISCORD_GUILD_ID and that the user completed OAuth.',
      http_429: 'Rate limited by Discord — high signup volume or token shared with another instance.',
    };
    let lastFailure = null;
    let lastSuccessTs = null;
    for (let i = history.length - 1; i >= 0; i--) {
      const e = history[i];
      if (!lastFailure && !e.ok) {
        lastFailure = {
          ts: e.ts,
          code: e.code,
          discordId: e.discordId,
          error: e.error,
          hint: HINTS[e.code] || 'Check the bot logs for the full Discord response.',
        };
      }
      if (lastSuccessTs == null && e.ok) lastSuccessTs = e.ts;
      if (lastFailure && lastSuccessTs != null) break;
    }
    return {
      window_ms: WINDOW_MS,
      buffer_capacity: 50,
      total_recorded: history.length,
      recent_count: recent.length,
      counts,
      last_failure: lastFailure,
      last_success_ts: lastSuccessTs,
    };
  }

  // Task 116 — surface auto-join failures to an admin/log Discord channel so
  // that a silently-broken Discord integration (missing perms, role re-ordered
  // above the bot, missing env vars, etc.) gets noticed quickly instead of
  // sitting in PM2 logs while every new signup fails to join the server.
  //
  // Throttled: at most one alert per error `code` per 10 minutes, so a
  // persistently-broken state can't spam the channel. Configure with
  // `DISCORD_ADMIN_LOG_CHANNEL_ID` — when unset, this is a no-op.
  _alertGuildAutoJoinFailure(discordId, result) {
    try {
      const channelId = process.env.DISCORD_ADMIN_LOG_CHANNEL_ID;
      if (!channelId) return;
      const code = (result && result.code) || 'unknown';
      // Don't alert on input-shape errors that aren't actionable for ops.
      if (code === 'bad_discord_id' || code === 'no_access_token') return;

      if (!this._guildJoinAlertThrottle) this._guildJoinAlertThrottle = new Map();
      const now = Date.now();
      const last = this._guildJoinAlertThrottle.get(code) || 0;
      const TEN_MIN = 10 * 60 * 1000;
      if (now - last < TEN_MIN) return;
      this._guildJoinAlertThrottle.set(code, now);

      const hints = {
        guild_not_configured: 'Set `DISCORD_GUILD_ID` on the bot host.',
        bot_token_missing: 'Set `DISCORD_TOKEN` on the bot host.',
        network: 'Discord API was unreachable — check outbound connectivity / Discord status.',
        http_401: 'Bot token rejected — check `DISCORD_TOKEN` is current.',
        http_403: 'Missing **Create Instant Invite** / **Manage Roles**, or the league role sits above the bot in the role list.',
        http_404: 'Guild or user not found — verify `DISCORD_GUILD_ID` and that the user completed OAuth.',
        http_429: 'Rate limited by Discord — high signup volume or token shared with another instance.',
      };
      const hint = hints[code] || 'Check the bot logs for the full Discord response.';
      const errBlurb = result?.error ? ` — \`${String(result.error).slice(0, 120).replace(/`/g, "'")}\`` : '';
      const msg = `⚠️ **Discord auto-join failed** for user \`${discordId}\` — code \`${code}\`${errBlurb}\n${hint}\n_(throttled to 1 alert per code per 10 min)_`;

      const channel = this.client?.channels?.cache?.get(channelId);
      const send = (ch) => ch.send(msg).catch(err => console.warn('[Discord] admin-log alert send failed:', err.message));
      if (channel) {
        send(channel);
      } else if (this.client?.channels?.fetch) {
        this.client.channels.fetch(channelId)
          .then(ch => ch && send(ch))
          .catch(err => console.warn('[Discord] admin-log channel fetch failed:', err.message));
      }
    } catch (err) {
      console.warn('[Discord] _alertGuildAutoJoinFailure error:', err.message);
    }
  }

  // Task #136 — quick-and-dirty guild membership check used by the inhouse
  // join hard gate and the auth/me payload. Returns:
  //   { inGuild: true,  configured: true  } — bot can see the user in the guild
  //   { inGuild: false, configured: true  } — guild known but user isn't a member
  //   { inGuild: null,  configured: false } — DISCORD_GUILD_ID not set, or bot
  //                                           not ready (treat as "unknown" upstream)
  // Cached per discord_id for ~30s to keep the auth poll cheap. The cache is
  // shared across all callers on this process; for a multi-process deploy
  // each PM2 worker will warm its own copy independently.
  async isInLeagueGuild(discordId) {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) return { inGuild: null, configured: false };
    if (!this.client || !this.client.readyAt) return { inGuild: null, configured: true };
    if (!discordId || !/^\d{17,19}$/.test(String(discordId))) {
      return { inGuild: false, configured: true };
    }
    if (!this._guildMembershipCache) this._guildMembershipCache = new Map();
    const key = `${guildId}:${discordId}`;
    const now = Date.now();
    const cached = this._guildMembershipCache.get(key);
    if (cached && (now - cached.ts) < 30_000) {
      return { inGuild: cached.inGuild, configured: true };
    }
    let guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      try { guild = await this.client.guilds.fetch(guildId); } catch { guild = null; }
    }
    if (!guild) {
      // Bot can't reach the guild at all (not invited, etc.) — surface as
      // "unknown" rather than false so the UI doesn't lock everyone out
      // because of a bot-side misconfig.
      return { inGuild: null, configured: true };
    }
    let inGuild;
    try {
      const member = await guild.members.fetch(String(discordId));
      inGuild = !!member;
    } catch (err) {
      // Distinguish definitive "not a member" from transient/transport
      // failures. Discord API error code 10007 (and HTTP 404) is the only
      // signal that means "this user is not in the guild" — anything else
      // (rate limits, 5xx, network, websocket disconnect, etc.) is an
      // *unknown* result. Caching `false` on a transient hiccup would
      // hard-block legitimate users for 30s and break joins during minor
      // Discord outages, so we surface those as `null` (soft-pass upstream)
      // and skip caching so the next poll retries fresh.
      const code = err && (err.code ?? err.rawError?.code);
      const status = err && (err.httpStatus ?? err.status);
      const isUnknownMember = code === 10007 || status === 404;
      if (!isUnknownMember) {
        return { inGuild: null, configured: true };
      }
      inGuild = false;
    }
    this._guildMembershipCache.set(key, { inGuild, ts: now });
    return { inGuild, configured: true };
  }

  // Task #128 — best-effort DM nudge to a player whose `addUserToLeagueGuild`
  // call just failed, telling them to click *Reconnect with Discord* on the
  // site once an admin has fixed the underlying perms / config issue. Caller
  // (the OAuth callback) fires this without awaiting; any failure here is
  // swallowed so the auth flow can never be taken down by a flaky DM.
  async dmDiscordAutoJoinRetryHint(discordId) {
    try {
      if (!this.client?.users?.fetch) return;
      const user = await this.client.users.fetch(String(discordId)).catch(() => null);
      if (!user) return;
      await user.send(
        "Heads up — we couldn't add you to the **OCE Inhouse** Discord server " +
        "during sign-up (the bot was likely missing permissions). Once that's " +
        "fixed, head back to the site and click **Reconnect with Discord** on " +
        "the banner at the top of the page to retry the join."
      ).catch(() => {});
    } catch (err) {
      console.warn('[Discord] dmDiscordAutoJoinRetryHint failed:', err.message);
    }
  }

  async shutdown() {
    if (this._coachingReminderTimer) clearInterval(this._coachingReminderTimer);
    if (this._coachingAutoReleaseTimer) clearInterval(this._coachingAutoReleaseTimer);
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
