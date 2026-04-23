const { getSteamClient } = require('../steam/steamClient');
const { config } = require('../config');
const { SERVER_REGION, GAME_MODE } = require('../steam/dota2GC');
const EventEmitter = require('events');
const db = require('../db');

const LobbyState = {
  IDLE: 'IDLE',
  CREATING: 'CREATING',
  WAITING: 'WAITING',
  IN_PROGRESS: 'IN_PROGRESS',
  ENDED: 'ENDED',
};

const DOTA_GAME_STATE = {
  INIT: 0,
  WAIT_FOR_PLAYERS: 1, // "Players Connecting" screen — game server allocated but clients loading
  HERO_SELECTION: 2,
  STRATEGY_TIME: 3,
  PRE_GAME: 4,
  GAME_IN_PROGRESS: 5,
  POST_GAME: 6,
  DISCONNECT: 7,
};

const MATCH_OUTCOME = {
  UNKNOWN: 0,
  RAD_VICTORY: 2,
  DIRE_VICTORY: 3,
};

const STEAM64_OFFSET = BigInt('76561197960265728');

class LobbyManager extends EventEmitter {
  constructor() {
    super();
    this.currentLobby = null;
    this.state = LobbyState.IDLE;
    this.lobbyId = null;
    this._gcListenersSetup = false;
    this._countdownTimer = null;
    this._countdownAborted = false;
    this._pendingInviteAccept = null;
    // Connection phase tracking — detects when "Players Connecting" screen fails.
    this._lastGameState = 0;
    this._enteredLoadingPhase = false;
    // Leave-after-launch: bot leaves lobby right after sending the launch command so
    // its host account doesn't interfere with the game server connection phase.
    this._leaveAfterLaunch = false;
    this._leaveTimer = null;
  }

  initListeners() {
    const client = getSteamClient();
    // If GC isn't ready yet, wait for it then set up
    if (!client.gcClient) {
      console.log('[Lobby] GC not ready yet — will set up listeners when GC connects.');
      client.once('gcReady', () => this._setupGCListeners());
    } else {
      this._setupGCListeners();
    }
    // Re-register on every future GC reconnect (new gcClient instance each time)
    client.on('gcReady', () => {
      console.log('[Lobby] GC reconnected — re-initialising GC listeners.');
      this._gcListenersSetup = false;
      this._setupGCListeners();
    });
  }

  async _getLobbyPlayerNames() {
    const players = this.currentLobby?.players || [];
    const result = [];
    for (const p of players) {
      if (!p.steamId || p.steamId === '0') continue;
      try {
        const accountId32 = (BigInt(p.steamId) - STEAM64_OFFSET).toString();
        let name;
        try {
          name = await db.getNickname(accountId32);
        } catch (_) {}
        result.push({
          name: name || `Player-${accountId32.slice(-5)}`,
          accountId: accountId32,
          steamId: p.steamId,
          team: p.team,
        });
      } catch (e) {
        result.push({ name: 'Unknown', accountId: null, steamId: p.steamId, team: p.team });
      }
    }
    return result;
  }

  _setupGCListeners() {
    if (this._gcListenersSetup) return;
    const client = getSteamClient();
    if (!client.gcClient) return;

    // Remove any stale listeners from a previous GC connection to prevent duplicates.
    client.gcClient.removeAllListeners('lobbyUpdate');
    client.gcClient.removeAllListeners('lobbyDestroyed');
    client.gcClient.removeAllListeners('lobbyInviteReceived');
    client.gcClient.removeAllListeners('partyInviteReceived');
    client.gcClient.removeAllListeners('lobbyChatMessage');

    this._gcListenersSetup = true;
    console.log('[Lobby] GC listeners initialized (auto-accept invites enabled).');

    // Listen for commands typed in the Dota 2 lobby chat
    client.gcClient.on('lobbyChatMessage', async ({ text, sender, accountId }) => {
      if (!text.startsWith('!')) return;
      const [cmd, ...cmdArgs] = text.slice(1).trim().toLowerCase().split(/\s+/);
      console.log(`[Lobby] Chat command from ${sender}: !${cmd}`);
      switch (cmd) {
        case 'start_game':
        case 'start': {
          if (this.state !== LobbyState.WAITING && this.state !== LobbyState.IN_PROGRESS) {
            this._chat(`⚠️ No active lobby to launch.`);
            break;
          }
          const seated = this.currentLobby?._gamePlayerCount || 0;
          if (this._countdownTimer) this._abortCountdown();
          try { this.launchLobby(); } catch (e) { console.error('[Lobby] Manual launch failed:', e.message); }
          this._chat(`🚀 Game launched by ${sender}! (${seated}/10 players seated)`);
          this.emit('lobbyChatCommandStartGame', { sender, accountId });
          break;
        }
        case 'status': {
          if (!this.currentLobby) {
            this._chat('No active lobby.');
          } else {
            const seated = this.currentLobby._gamePlayerCount || 0;
            const countdown = this._countdownTimer ? ' — countdown active' : '';
            this._chat(`📊 ${seated}/10 players seated | State: ${this.state}${countdown}`);
          }
          break;
        }
        case 'captains': {
          const players = await this._getLobbyPlayerNames();
          if (players.length < 2) {
            this._chat('⚠️ Need at least 2 players in lobby to pick captains.');
            break;
          }
          const shuffled = [...players].sort(() => Math.random() - 0.5);
          const [cap1, cap2] = shuffled;
          this._chat(`🎲 Captains: 🟢 ${cap1.name}  vs  🔴 ${cap2.name}`);
          break;
        }
        case 'roll': {
          const players = await this._getLobbyPlayerNames();
          if (players.length === 0) {
            this._chat('⚠️ No players found in lobby.');
            break;
          }
          const rolls = players
            .map(p => ({ name: p.name, roll: Math.floor(Math.random() * 100) + 1 }))
            .sort((a, b) => b.roll - a.roll);
          // Split into chunks of 5 to stay within lobby chat character limits
          const lines = rolls.map((r, i) => `${i + 1}. ${r.name}: ${r.roll}`);
          const chunkSize = 5;
          for (let i = 0; i < lines.length; i += chunkSize) {
            const header = i === 0 ? '🎲 Roll results (1-100):\n' : '';
            this._chat(header + lines.slice(i, i + chunkSize).join('\n'));
          }
          break;
        }
        case 'hrcaptains': {
          const players = await this._getLobbyPlayerNames();
          if (players.length < 2) {
            this._chat('⚠️ Need at least 2 players in lobby to pick captains.');
            break;
          }
          try {
            const leaderboard = await db.getLeaderboard(200);
            const lobbyIds = new Set(players.map(p => p.accountId).filter(Boolean));
            const inLobby = leaderboard.filter(entry => lobbyIds.has(entry.player_id));
            if (inLobby.length < 2) {
              this._chat('⚠️ Not enough ranked players in lobby for high-rank captains. Try !captains instead.');
              break;
            }
            const [cap1, cap2] = inLobby;
            const mmr1 = Math.round(cap1.mmr || 0);
            const mmr2 = Math.round(cap2.mmr || 0);
            this._chat(`👑 High-rank captains: 🟢 ${cap1.nickname || cap1.display_name} (${mmr1} MMR)  vs  🔴 ${cap2.nickname || cap2.display_name} (${mmr2} MMR)`);
          } catch (err) {
            console.error('[Lobby] !hrcaptains error:', err.message);
            this._chat('⚠️ Failed to fetch leaderboard for high-rank captains.');
          }
          break;
        }
        default:
          break;
      }
    });

    client.gcClient.on('lobbyUpdate', (update) => {
      // When waiting for the GC to add us to an invited lobby, the state is still IDLE.
      // Detect the CSO 2004 lobby update here — this is how the GC confirms a lobby invite join.
      if ((this.state === LobbyState.IDLE || this.state === LobbyState.ENDED) && this._pendingInviteAccept) {
        const pending = this._pendingInviteAccept;
        if (!update.lobbyId || !pending.lobbyId || update.lobbyId.toString() !== pending.lobbyId.toString()) return;
        // GC confirmed — we're now in the lobby.
        clearTimeout(pending.timer);
        this._pendingInviteAccept = null;
        this.lobbyId = update.lobbyId;
        this.currentLobby = {
          name: update.gameName || `Lobby ${update.lobbyId}`,
          password: '',
          requestedBy: `invite:${pending.invite.senderId}`,
          createdAt: new Date(),
          lobbyId: update.lobbyId,
          matchId: update.matchId || null,
          playerCount: update.playerCount || 0,
          players: update.players || [],
          joinedExisting: true,
        };
        this.state = LobbyState.WAITING;
        this._setRichPresence(update.lobbyId);
        console.log(`[Lobby] GC confirmed invite join for lobby ${update.lobbyId} via CSO update.`);
        this.emit('autoJoined', pending.invite);
        return;
      }
      if (this.state === LobbyState.IDLE) return;

      if (update.lobbyId) {
        const hadNoId = !this.lobbyId;
        this.lobbyId = update.lobbyId;
        if (this.currentLobby) {
          this.currentLobby.lobbyId = update.lobbyId;
        }
        if (hadNoId) {
          this._setRichPresence(update.lobbyId);
        }
      }

      if (update.gameName && this.currentLobby && this.currentLobby.joinedExisting) {
        this.currentLobby.name = update.gameName;
      }

      if (update.matchId && this.currentLobby && !this.currentLobby.matchId) {
        this.currentLobby.matchId = update.matchId;
        console.log(`[Lobby] Match ID captured: ${update.matchId}`);
        this.emit('matchIdCaptured', update.matchId);
        // If we're in leave-after-launch mode, this matchId is exactly what we were
        // waiting for — leave the lobby immediately now we have it.
        if (this._leaveAfterLaunch) {
          console.log('[Lobby] matchId captured — leaving lobby now so bot does not interfere with game connection.');
          this._doLeaveAfterLaunch();
          return;
        }
      }

      if (this.currentLobby && update.playerCount !== undefined) {
        this.currentLobby.playerCount = update.playerCount;
      }

      if (this.currentLobby && update.players) {
        const prevGamePlayers = this.currentLobby._gamePlayerCount || 0;
        const gamePlayers = update.players.filter(p => p.team === 0 || p.team === 1).length;
        this.currentLobby._gamePlayerCount = gamePlayers;
        this.currentLobby.players = update.players;

        // Check bot's own slot. If still in a game slot (Radiant/Dire), retry the move.
        const client = getSteamClient();
        const botSteam64 = client && client.steamClient && client.steamClient.steamID
          ? client.steamClient.steamID.getSteamID64()
          : null;
        if (botSteam64) {
          const TEAM_NAMES = { 0: 'Radiant', 1: 'Dire', 4: 'Broadcaster', 5: 'Spectator', 6: 'Unassigned' };
          const botEntry = update.players.find((p) => p.steamId === botSteam64);
          if (botEntry) {
            console.log(`[Lobby] Bot slot status: team=${botEntry.team}(${TEAM_NAMES[botEntry.team] ?? '?'}) slot=${botEntry.slot}`);
            // If the bot is still in a Radiant or Dire game slot, push it out again.
            if ((botEntry.team === 0 || botEntry.team === 1) && !this._leaveAfterLaunch) {
              console.log('[Lobby] Bot detected in game slot — re-sending spectator move.');
              this._moveBotToSpectator();
            }
          }
        }

        if (prevGamePlayers < 10 && gamePlayers >= 10) {
          console.log('[Lobby] 10 game players seated — starting countdown!');
          this.emit('tenPlayersSeated', this.currentLobby);
          this._startCountdown();
        } else if (prevGamePlayers >= 10 && gamePlayers < 10 && this._countdownTimer) {
          console.log('[Lobby] Player left during countdown — aborting.');
          this._abortCountdown();
        }
      }

      // Track game state transitions for connection failure detection.
      if (update.gameState !== undefined) {
        const prev = this._lastGameState;
        const curr = update.gameState;

        // Once we see the "Players Connecting" screen state, flag it.
        if (curr === DOTA_GAME_STATE.WAIT_FOR_PLAYERS) {
          this._enteredLoadingPhase = true;
          console.log('[Lobby] Entered Players Connecting phase.');
        }

        // If we were in the loading phase and game state drops back to INIT (0),
        // the connection timed out and everyone returned to lobby.
        if (this._enteredLoadingPhase && curr === DOTA_GAME_STATE.INIT && this.state === LobbyState.WAITING) {
          console.log('[Lobby] Connection phase failed — gameState dropped from loading back to INIT.');
          this._enteredLoadingPhase = false;
          // Reset player count tracking so the countdown re-arms when all 10 are seated again.
          if (this.currentLobby) this.currentLobby._gamePlayerCount = 0;
          this.emit('connectionFailed', this.currentLobby);
        }

        this._lastGameState = curr;
      }

      if (update.gameState >= DOTA_GAME_STATE.GAME_IN_PROGRESS && this.state === LobbyState.WAITING) {
        this.state = LobbyState.IN_PROGRESS;
        this._enteredLoadingPhase = false;
        console.log('[Lobby] Match is now in progress.');
        this.emit('matchStarted', this.currentLobby);
      }

      if (update.gameState === DOTA_GAME_STATE.POST_GAME && this.state === LobbyState.IN_PROGRESS) {
        this.state = LobbyState.ENDED;

        const matchId = this.currentLobby.matchId || update.matchId;
        const radiantWin = update.matchOutcome === MATCH_OUTCOME.RAD_VICTORY;
        const direWin = update.matchOutcome === MATCH_OUTCOME.DIRE_VICTORY;
        const outcomeKnown = radiantWin || direWin;

        let lobbyMatchStats = null;
        if (outcomeKnown) {
          lobbyMatchStats = this._buildLobbyMatchStats(matchId, update, radiantWin);
        }

        console.log(`[Lobby] Match ended (post-game). Match: ${matchId}, Outcome: ${update.matchOutcome} (${radiantWin ? 'Radiant' : direWin ? 'Dire' : 'Unknown'} victory)`);

        this.emit('matchEnded', {
          ...this.currentLobby,
          matchId,
          lobbyMatchStats,
          outcomeKnown,
        });
      }
    });

    client.gcClient.on('lobbyDestroyed', () => {
      if (this.state !== LobbyState.IDLE) {
        console.log('[Lobby] Lobby destroyed by GC.');
      }
    });

    client.gcClient.on('lobbyInviteReceived', async (invite) => {
      if (this.state !== LobbyState.IDLE && this.state !== LobbyState.ENDED) {
        console.log(`[Lobby] Ignoring lobby invite from ${invite.senderName} — already in state: ${this.state}.`);
        return;
      }
      if (!invite.lobbyId) {
        console.warn(`[Lobby] Received lobby invite from ${invite.senderName} but lobbyId is missing — cannot join.`);
        return;
      }
      console.log(`[Lobby] Received lobby invite from ${invite.senderName} (lobbyId: ${invite.lobbyId}). Accepting + joining...`);
      // Step 1: Send CMsgLobbyInviteResponse to dismiss the invite in the GC.
      client.gcClient.acceptLobbyInvite(invite.lobbyId);
      // Step 2: Explicitly join via CMsgPracticeLobbyJoin — this is the reliable path.
      // acceptLobbyInvite alone is not sufficient; the GC requires an explicit join message.
      try {
        await this.joinLobby(invite.lobbyId, '', `invite:${invite.senderId}`);
        console.log(`[Lobby] Successfully joined invited lobby ${invite.lobbyId} from ${invite.senderName}.`);
        this.emit('autoJoined', invite);
      } catch (err) {
        console.warn(`[Lobby] Failed to join invited lobby ${invite.lobbyId}: ${err.message}`);
      }
    });

    client.gcClient.on('partyInviteReceived', async (invite) => {
      const trusted = config.steam.trustedSteamIds || [];
      console.log(`[Lobby] Party invite from ${invite.senderName} (${invite.senderId}), partyId=${invite.partyId}, trusted=${trusted.includes(invite.senderId)}`);
      if (!trusted.includes(invite.senderId)) {
        console.log(`[Lobby] Party invite rejected — ${invite.senderId} not in trusted list [${trusted.join(',')}].`);
        return;
      }
      // partyId may be null when the fallback timer fires before CSO arrives; GC will match the pending invite.
      console.log(`[Lobby] Trusted party invite from ${invite.senderName} — accepting (partyId=${invite.partyId ?? 'null, GC will match'})...`);
      try {
        client.gcClient.acceptPartyInvite(invite.partyId);
        this.emit('partyJoined', { senderName: invite.senderName, senderId: invite.senderId, partyId: invite.partyId });
      } catch (e) {
        console.warn(`[Lobby] Failed to accept party invite: ${e.message}`);
      }
    });
  }

  async createLobby(name, password, requestedBy, opts = {}) {
    const client = getSteamClient();
    if (!client.isGCReady || !client.gcClient) {
      throw new Error('Steam/Dota 2 GC is not connected. Check !steam_status.');
    }
    if (this.state !== LobbyState.IDLE && this.state !== LobbyState.ENDED) {
      throw new Error(`Cannot create lobby - current state: ${this.state}. Use !end first.`);
    }

    this._setupGCListeners();
    this.state = LobbyState.CREATING;

    try {
      const response = await client.gcClient.createPracticeLobby({
        game_name: name,
        pass_key: password,
        server_region: config.dota.serverRegion || SERVER_REGION.AUSTRALIA,
        game_mode: opts.gameMode ?? config.dota.gameMode ?? GAME_MODE.CAPTAINS_MODE,
        allow_spectating: true,
        fill_with_bots: opts.fillWithBots || false,
        allow_cheats: opts.allowCheats || false,
      });

      this.lobbyId = response.id ? response.id.toString() : null;
      this.currentLobby = {
        name,
        password,
        requestedBy,
        createdAt: new Date(),
        lobbyId: this.lobbyId,
        matchId: null,
        playerCount: 0,
        players: [],
      };
      this.state = LobbyState.WAITING;

      if (this.lobbyId) {
        this._setRichPresence(this.lobbyId);
      }

      // Move bot out of game slots so it doesn't occupy a Radiant/Dire position.
      // The bot has no Dota 2 binary and cannot connect as a player.
      // DOTA_GC_TEAM: 4=Spectator, 5=PlayerPool(Unassigned), 0=Radiant, 1=Dire.
      // Use setSelfTeamSlot (no steam_id) — the GC applies it to the message sender.
      // The admin-move path (setPlayerTeamSlot with own steam_id) is ignored by the GC for self.
      // Retry at 1 s, 3 s, 7 s and also reactively on each lobby update (see _handleLobbyUpdate).
      this._moveBotToSpectator();

      console.log(`[Lobby] Created lobby: ${name} (ID: ${this.lobbyId || 'pending'})`);
      return this.currentLobby;
    } catch (err) {
      this.state = LobbyState.IDLE;
      throw new Error(`Lobby creation failed: ${err.message}`);
    }
  }

  launchLobby() {
    const client = getSteamClient();
    if (!client.gcClient || !client.gcClient.isReady) throw new Error('GC not connected.');
    if (this.state !== LobbyState.WAITING) throw new Error('No active lobby in waiting state.');

    client.gcClient.launchLobby();
    console.log('[Lobby] Launch command sent. Bot will leave lobby once matchId is captured (or after 25s timeout).');

    // The bot is the lobby creator/host. Even in a spectator slot, Valve's game server
    // requires the host account to connect. Since the bot has no Dota 2 binary it
    // can never connect, causing the "Players Connecting" timer to expire and the
    // game to be cancelled.  Leaving the lobby immediately after launch transfers
    // host ownership to a real player and lets the game proceed normally.
    this._leaveAfterLaunch = true;
    this._leaveTimer = setTimeout(() => {
      if (this._leaveAfterLaunch) {
        console.log('[Lobby] 25s timeout — leaving lobby without matchId (game server may not have assigned one yet).');
        this._doLeaveAfterLaunch();
      }
    }, 25000);

    return true;
  }

  // Called when the bot should leave the lobby post-launch.
  // Preserves matchId + lobbyName for auto-recording, then exits cleanly.
  _doLeaveAfterLaunch() {
    if (this._leaveTimer) { clearTimeout(this._leaveTimer); this._leaveTimer = null; }
    this._leaveAfterLaunch = false;

    const client = getSteamClient();
    const matchId = this.currentLobby ? this.currentLobby.matchId : null;
    const lobbyName = this.currentLobby ? this.currentLobby.name : 'Unknown';
    const players = this.currentLobby ? [...(this.currentLobby.players || [])] : [];

    try {
      if (client && client.gcClient) client.gcClient.leavePracticeLobby();
    } catch (e) {
      console.warn('[Lobby] leavePracticeLobby error:', e.message);
    }

    this._clearRichPresence();
    if (this._countdownTimer) { clearInterval(this._countdownTimer); this._countdownTimer = null; }
    this.state = LobbyState.IDLE;
    this.currentLobby = null;
    this.lobbyId = null;
    this._lastGameState = 0;
    this._enteredLoadingPhase = false;

    console.log(`[Lobby] Bot left lobby after launch. matchId=${matchId || 'none'}, lobbyName="${lobbyName}"`);
    this.emit('launchedAndLeft', { matchId, lobbyName, players });
  }

  // Assign balanced teams in the lobby via GC.
  // radiantSteamIds / direSteamIds are arrays of steam64 strings (up to 5 each).
  // Returns { ok, moved, errors }.
  async assignTeams(radiantSteamIds, direSteamIds) {
    const client = getSteamClient();
    if (!client.gcClient || !client.gcClient.isReady) throw new Error('GC not connected.');
    if (this.state !== LobbyState.WAITING) throw new Error('No active lobby — cannot assign teams.');

    const RADIANT = 0;
    const DIRE = 1;
    const PLAYER_POOL = 6;
    const STEAM64_OFFSET = 76561197960265728n;

    // First kick everyone who currently has a slot back to the pool so slots are free.
    const allPlayers = this.currentLobby?.players || [];
    for (const p of allPlayers) {
      if ((p.team === RADIANT || p.team === DIRE) && p.steamId && p.steamId !== '0') {
        try {
          const accountId32 = (BigInt(p.steamId) - STEAM64_OFFSET).toString();
          client.gcClient.kickPlayerFromTeam(accountId32);
          await new Promise(r => setTimeout(r, 150)); // small delay between GC messages
        } catch (_) {}
      }
    }

    await new Promise(r => setTimeout(r, 500));

    const moved = [];
    const errors = [];

    const assign = async (ids, team, teamName) => {
      for (let slot = 0; slot < ids.length; slot++) {
        const steamId64 = ids[slot];
        if (!steamId64) continue;
        try {
          client.gcClient.setPlayerTeamSlot(steamId64, team, slot);
          moved.push({ steamId64, team: teamName, slot });
          await new Promise(r => setTimeout(r, 200));
        } catch (e) {
          errors.push({ steamId64, error: e.message });
        }
      }
    };

    await assign(radiantSteamIds, RADIANT, 'Radiant');
    await assign(direSteamIds, DIRE, 'Dire');

    return { ok: errors.length === 0, moved, errors };
  }

  _chat(text) {
    try {
      const client = getSteamClient();
      if (client.gcClient) client.gcClient.sendLobbyChat(text);
    } catch {}
  }

  _startCountdown(seconds = 15) {
    this._countdownAborted = false;
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }

    this._chat(`⚔️ All 10 players seated! Game starts in ${seconds} seconds... (move to a team slot if you haven't)`);
    console.log(`[Lobby] Starting ${seconds}s countdown.`);

    let remaining = seconds;
    const ANNOUNCE_AT = new Set([15, 10, 5, 4, 3, 2, 1]);

    this._countdownTimer = setInterval(() => {
      if (this._countdownAborted) {
        clearInterval(this._countdownTimer);
        this._countdownTimer = null;
        return;
      }
      remaining--;

      if (remaining <= 0) {
        clearInterval(this._countdownTimer);
        this._countdownTimer = null;
        this._chat('🚀 Launching game now!');
        console.log('[Lobby] Countdown complete — launching lobby.');
        try { this.launchLobby(); } catch (e) { console.error('[Lobby] Auto-launch after countdown failed:', e.message); }
      } else if (ANNOUNCE_AT.has(remaining)) {
        this._chat(`⏱ Game starting in ${remaining} second${remaining !== 1 ? 's' : ''}...`);
      }
    }, 1000);
  }

  _abortCountdown() {
    this._countdownAborted = true;
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
    this._chat('⚠️ Countdown aborted — a player left the lobby. Waiting for 10 players again...');
    console.log('[Lobby] Countdown aborted — player count dropped below 10.');
  }

  async endLobby() {
    if (this.state === LobbyState.IDLE) {
      throw new Error('No active lobby to end.');
    }

    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
      this._countdownAborted = true;
    }

    const lobbyInfo = { ...this.currentLobby };

    const client = getSteamClient();
    if (client.gcClient) {
      client.gcClient.leavePracticeLobby();
    }

    this._clearRichPresence();
    this.state = LobbyState.ENDED;
    return lobbyInfo;
  }

  async requestMatchDetails(matchId) {
    const client = getSteamClient();
    if (!client.gcClient || !client.gcClient.isReady) {
      throw new Error('GC not connected. Use !record instead.');
    }
    return client.gcClient.requestMatchDetails(matchId);
  }

  async joinLobby(lobbyId, password, requestedBy) {
    const client = getSteamClient();
    if (!client.isGCReady || !client.gcClient) {
      throw new Error('Steam/Dota 2 GC is not connected. Check !steam_status.');
    }
    if (this.state !== LobbyState.IDLE && this.state !== LobbyState.ENDED) {
      throw new Error(`Cannot join lobby - current state: ${this.state}. Use !end first.`);
    }

    this._setupGCListeners();
    this.state = LobbyState.CREATING;

    try {
      const response = await client.gcClient.joinPracticeLobby(lobbyId, password);

      this.lobbyId = response.id ? response.id.toString() : lobbyId.toString();
      this.currentLobby = {
        name: `Lobby ${this.lobbyId}`,
        password: password || '',
        requestedBy,
        createdAt: new Date(),
        lobbyId: this.lobbyId,
        matchId: null,
        playerCount: 0,
        players: [],
        joinedExisting: true,
      };
      this.state = LobbyState.WAITING;

      // Move bot out of game slots — same logic as createLobby.
      this._moveBotToSpectator();

      console.log(`[Lobby] Joined existing lobby: ${this.lobbyId}`);
      return this.currentLobby;
    } catch (err) {
      this.state = LobbyState.IDLE;
      throw new Error(`Failed to join lobby: ${err.message}`);
    }
  }

  invitePlayer(steamId64) {
    const client = getSteamClient();
    if (!client.gcClient || !client.gcClient.isReady) {
      throw new Error('GC not connected.');
    }
    if (this.state !== LobbyState.WAITING && this.state !== LobbyState.IN_PROGRESS) {
      throw new Error('No active lobby to invite to.');
    }
    return client.gcClient.inviteToLobby(steamId64);
  }

  _setRichPresence(lobbyId) {
    try {
      const client = getSteamClient();
      if (client.steamClient) {
        client.steamClient.uploadRichPresence(570, {
          steam_display: '#DOTA_RP_LOBBY',
          status: 'WatchableGame',
          connect: `+connect_lobby ${lobbyId}`,
          steam_player_group: lobbyId.toString(),
          steam_player_group_size: '10',
        });
        console.log(`[Lobby] Rich presence set for lobby ${lobbyId} - Join Game should be visible.`);
      }
    } catch (e) {
      console.warn('[Lobby] Failed to set rich presence:', e.message);
    }
  }

  _clearRichPresence() {
    try {
      const client = getSteamClient();
      if (client.steamClient) {
        client.steamClient.uploadRichPresence(570, {});
        console.log('[Lobby] Rich presence cleared.');
      }
    } catch (e) {
      console.warn('[Lobby] Failed to clear rich presence:', e.message);
    }
  }

  // Push the bot out of Radiant/Dire slots into the non-game pool.
  // DOTA_GC_TEAM: 4=Spectator, 5=PlayerPool(Unassigned).
  // Uses setSelfTeamSlot (no steam_id) — the GC applies the move to the message sender.
  // The admin-move variant (setPlayerTeamSlot with own steam_id) is silently dropped by the GC.
  // Tries spectator first, pool as backup, retried at 1 s / 3 s / 7 s.
  _moveBotToSpectator() {
    const client = getSteamClient();
    const gc = client?.gcClient;
    if (!gc) return;

    const tryMove = (label) => {
      try {
        // Team 4 = Spectator, Team 5 = PlayerPool/Unassigned
        gc.setSelfTeamSlot(4, 0);
        console.log(`[Lobby] Bot self-move to Spectator (team=4) sent [${label}]`);
        // Immediately also try team=5 as a belt-and-braces fallback (one of them will stick)
        setTimeout(() => {
          try { gc.setSelfTeamSlot(5, 0); console.log(`[Lobby] Bot self-move to PlayerPool (team=5) sent [${label}+100ms]`); } catch (_) {}
        }, 100);
      } catch (e) {
        console.warn(`[Lobby] Bot spectator move failed [${label}]:`, e.message);
      }
    };

    tryMove('immediate');
    setTimeout(() => tryMove('1s'), 1000);
    setTimeout(() => tryMove('3s'), 3000);
    setTimeout(() => tryMove('7s'), 7000);
  }

  _buildLobbyMatchStats(matchId, update, radiantWin) {
    const players = (update.players || [])
      .filter((p) => p.team === 0 || p.team === 1)
      .map((p) => {
        const steamId64 = p.steamId || '0';
        let accountId = '0';
        try {
          const big = BigInt(steamId64);
          if (big > STEAM64_OFFSET) {
            accountId = (big - STEAM64_OFFSET).toString();
          }
        } catch (e) {}

        return {
          accountId,
          steamId64,
          heroId: p.heroId || 0,
          team: p.team === 0 ? 'radiant' : 'dire',
          slot: p.slot || 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          gpm: 0,
          xpm: 0,
          heroDamage: 0,
          towerDamage: 0,
          heroHealing: 0,
          lastHits: 0,
          denies: 0,
          personaname: '',
        };
      });

    return {
      matchId: matchId || '0',
      radiantWin,
      duration: update.matchDuration || 0,
      lobbyType: 1,
      gameMode: 0,
      startTime: Math.floor(Date.now() / 1000),
      players,
      source: 'lobby-gc',
    };
  }

  getStatus() {
    return {
      state: this.state,
      lobby: this.currentLobby
        ? {
            name: this.currentLobby.name,
            lobbyId: this.lobbyId,
            matchId: this.currentLobby.matchId,
            password: this.currentLobby.password,
            playerCount: this.currentLobby.playerCount || 0,
          }
        : null,
    };
  }

  resetState() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
      this._countdownAborted = true;
    }
    if (this._connectionFailTimer) {
      clearTimeout(this._connectionFailTimer);
      this._connectionFailTimer = null;
    }
    if (this._leaveTimer) {
      clearTimeout(this._leaveTimer);
      this._leaveTimer = null;
    }
    this._leaveAfterLaunch = false;
    this._clearRichPresence();
    this.state = LobbyState.IDLE;
    this.currentLobby = null;
    this.lobbyId = null;
    this._lastGameState = 0;
    this._enteredLoadingPhase = false;
  }
}

let instance = null;
function getLobbyManager() {
  if (!instance) {
    instance = new LobbyManager();
  }
  return instance;
}

module.exports = { getLobbyManager, LobbyState };
