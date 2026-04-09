const { getSteamClient } = require('../steam/steamClient');
const { config } = require('../config');
const { SERVER_REGION, GAME_MODE } = require('../steam/dota2GC');
const EventEmitter = require('events');

const LobbyState = {
  IDLE: 'IDLE',
  CREATING: 'CREATING',
  WAITING: 'WAITING',
  IN_PROGRESS: 'IN_PROGRESS',
  ENDED: 'ENDED',
};

const DOTA_GAME_STATE = {
  INIT: 0,
  WAIT: 1,
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
  }

  initListeners() {
    this._setupGCListeners();
  }

  _setupGCListeners() {
    if (this._gcListenersSetup) return;
    const client = getSteamClient();
    if (!client.gcClient) return;

    this._gcListenersSetup = true;
    console.log('[Lobby] GC listeners initialized (auto-accept invites enabled).');

    client.gcClient.on('lobbyUpdate', (update) => {
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
      }

      if (this.currentLobby && update.playerCount !== undefined) {
        this.currentLobby.playerCount = update.playerCount;
      }

      if (this.currentLobby && update.players) {
        const prevGamePlayers = this.currentLobby._gamePlayerCount || 0;
        const gamePlayers = update.players.filter(p => p.team === 0 || p.team === 1).length;
        this.currentLobby._gamePlayerCount = gamePlayers;
        this.currentLobby.players = update.players;
        if (prevGamePlayers < 10 && gamePlayers >= 10) {
          console.log('[Lobby] 10 game players seated — starting countdown!');
          this.emit('tenPlayersSeated', this.currentLobby);
          this._startCountdown();
        } else if (prevGamePlayers >= 10 && gamePlayers < 10 && this._countdownTimer) {
          console.log('[Lobby] Player left during countdown — aborting.');
          this._abortCountdown();
        }
      }

      if (update.gameState >= DOTA_GAME_STATE.GAME_IN_PROGRESS && this.state === LobbyState.WAITING) {
        this.state = LobbyState.IN_PROGRESS;
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
        console.log(`[Lobby] Ignoring lobby invite from ${invite.senderName} - already in a lobby.`);
        return;
      }
      console.log(`[Lobby] Auto-accepting lobby invite from ${invite.senderName}...`);
      try {
        await this.joinLobby(invite.lobbyId, '', `steam:${invite.senderId}`);
        this.emit('autoJoined', invite);
      } catch (e) {
        console.warn(`[Lobby] Failed to auto-accept invite: ${e.message}`);
      }
    });

    client.gcClient.on('partyInviteReceived', async (invite) => {
      const trusted = config.steam.trustedSteamIds || [];
      if (!trusted.includes(invite.senderId)) {
        console.log(`[Lobby] Ignoring party invite from ${invite.senderName} (${invite.senderId}) — not in trusted list.`);
        return;
      }
      if (!invite.partyId || invite.partyId === '0') {
        console.warn(`[Lobby] Party invite from ${invite.senderName} had no valid party ID — cannot accept.`);
        return;
      }
      console.log(`[Lobby] Trusted party invite from ${invite.senderName} — accepting party ${invite.partyId}...`);
      try {
        client.gcClient.acceptPartyInvite(invite.partyId);
        this.emit('partyJoined', { senderName: invite.senderName, senderId: invite.senderId, partyId: invite.partyId });
      } catch (e) {
        console.warn(`[Lobby] Failed to accept party invite: ${e.message}`);
      }
    });
  }

  async createLobby(name, password, requestedBy) {
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
        game_mode: config.dota.gameMode || GAME_MODE.CAPTAINS_MODE,
        allow_spectating: true,
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

      // Move bot to broadcast channel so it doesn't occupy a player slot
      setTimeout(() => {
        try { client.gcClient.joinBroadcastChannel(0); } catch {}
      }, 2000);

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
    return true;
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
        try { this.launchLobby(); } catch (e) {
          console.error('[Lobby] Auto-launch after countdown failed:', e.message);
        }
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
    this._clearRichPresence();
    this.state = LobbyState.IDLE;
    this.currentLobby = null;
    this.lobbyId = null;
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
