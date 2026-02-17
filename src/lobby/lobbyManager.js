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

  _setupGCListeners() {
    if (this._gcListenersSetup) return;
    const client = getSteamClient();
    if (!client.gcClient) return;

    this._gcListenersSetup = true;

    client.gcClient.on('lobbyUpdate', (update) => {
      if (this.state === LobbyState.IDLE) return;

      if (update.lobbyId) {
        this.lobbyId = update.lobbyId;
        if (this.currentLobby) {
          this.currentLobby.lobbyId = update.lobbyId;
        }
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
