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

class LobbyManager extends EventEmitter {
  constructor() {
    super();
    this.currentLobby = null;
    this.state = LobbyState.IDLE;
    this.lobbyId = null;
    this._gcListenersSetup = false;
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
        this.currentLobby.players = update.players;
      }

      if (update.gameState >= DOTA_GAME_STATE.GAME_IN_PROGRESS && this.state === LobbyState.WAITING) {
        this.state = LobbyState.IN_PROGRESS;
        console.log('[Lobby] Match is now in progress.');
        this.emit('matchStarted', this.currentLobby);
      }

      if (update.gameState === DOTA_GAME_STATE.POST_GAME && this.state === LobbyState.IN_PROGRESS) {
        console.log('[Lobby] Match ended (post-game detected).');
        this.emit('matchEnded', {
          ...this.currentLobby,
          matchId: this.currentLobby.matchId || update.matchId,
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

      console.log(`[Lobby] Created lobby: ${name} (ID: ${this.lobbyId || 'pending'})`);
      return this.currentLobby;
    } catch (err) {
      this.state = LobbyState.IDLE;
      throw new Error(`Lobby creation failed: ${err.message}`);
    }
  }

  async endLobby() {
    if (this.state === LobbyState.IDLE) {
      throw new Error('No active lobby to end.');
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
