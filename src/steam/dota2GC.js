const { Dota2User } = require('dota2-user');
const { EDOTAGCMsg, ESOMsg, CSODOTALobby, CMsgSOCacheSubscribed, CMsgSOSingleObject, CMsgSOMultipleObjects } = require('dota2-user/protobufs');
const protobuf = require('protobufjs');
const EventEmitter = require('events');

const DOTA2_APPID = 570;
const LOBBY_TYPE_ID = 2004;

const GAME_MODE = {
  CAPTAINS_MODE: 2,
  ALL_PICK: 1,
};

const SERVER_REGION = {
  AUSTRALIA: 7,
  SEA: 5,
  US_WEST: 1,
  US_EAST: 2,
  EUROPE: 3,
};

const LOBBY_TYPE = {
  PRACTICE: 1,
};

let protoRoot = null;
function getLobbyProtos() {
  if (protoRoot) return protoRoot;
  protoRoot = new protobuf.Root();
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgPracticeLobbySetDetails')
      .add(new protobuf.Field('game_name', 2, 'string'))
      .add(new protobuf.Field('server_region', 4, 'uint32'))
      .add(new protobuf.Field('game_mode', 5, 'uint32'))
      .add(new protobuf.Field('cm_pick', 6, 'uint32'))
      .add(new protobuf.Field('allow_cheats', 10, 'bool'))
      .add(new protobuf.Field('fill_with_bots', 11, 'bool'))
      .add(new protobuf.Field('allow_spectating', 13, 'bool'))
      .add(new protobuf.Field('pass_key', 15, 'string'))
      .add(new protobuf.Field('leagueid', 16, 'uint32'))
      .add(new protobuf.Field('allchat', 23, 'bool'))
      .add(new protobuf.Field('dota_tv_delay', 24, 'uint32'))
      .add(new protobuf.Field('visibility', 33, 'uint32'))
      .add(new protobuf.Field('pause_setting', 42, 'uint32'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgPracticeLobbyCreate')
      .add(new protobuf.Field('search_key', 1, 'string'))
      .add(new protobuf.Field('pass_key', 5, 'string'))
      .add(new protobuf.Field('client_version', 6, 'uint32'))
      .add(new protobuf.Field('lobby_details', 7, 'dota.CMsgPracticeLobbySetDetails'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgPracticeLobbyLeave')
      .add(new protobuf.Field('dummy', 1, 'uint32'))
  );
  protoRoot.resolveAll();
  return protoRoot;
}

function encodeLobbyCreate(options) {
  const root = getLobbyProtos();
  const Type = root.lookupType('dota.CMsgPracticeLobbyCreate');
  const msg = Type.create({
    search_key: '',
    lobby_details: {
      game_name: options.game_name || 'Inhouse',
      pass_key: options.pass_key || '',
      server_region: options.server_region || SERVER_REGION.AUSTRALIA,
      game_mode: options.game_mode || GAME_MODE.CAPTAINS_MODE,
      allow_spectating: options.allow_spectating !== false,
      visibility: 0,
      allchat: true,
      dota_tv_delay: 2,
      pause_setting: 1,
    },
  });
  return Buffer.from(Type.encode(msg).finish());
}

function encodeLobbyLeave() {
  const root = getLobbyProtos();
  const Type = root.lookupType('dota.CMsgPracticeLobbyLeave');
  const msg = Type.create({});
  return Buffer.from(Type.encode(msg).finish());
}

class Dota2GCClient extends EventEmitter {
  constructor(steamClient) {
    super();
    this.steamClient = steamClient;
    this.dota2 = new Dota2User(steamClient);
    this.isReady = false;
    this.currentLobby = null;
    this._pendingLobbyCreate = false;

    this._setupListeners();
  }

  _setupListeners() {
    this.dota2.on('connectedToGC', () => {
      console.log('[Dota2 GC] Connected to Game Coordinator.');
      this.isReady = true;
      this.emit('ready');
    });

    this.dota2.on('disconnectedFromGC', (reason) => {
      console.warn(`[Dota2 GC] Disconnected from GC: ${reason}`);
      this.isReady = false;
    });

    this.dota2.router.on(EDOTAGCMsg.k_EMsgGCPracticeLobbyResponse, (data) => {
      console.log(`[Dota2 GC] Lobby response received: result=${data.result}`);
      this.emit('lobbyResponse', data);
    });

    this.dota2.router.on(EDOTAGCMsg.k_EMsgGCMatchDetailsResponse, (data) => {
      console.log(`[Dota2 GC] Match details received: result=${data.result}`);
      this.emit('matchDetailsResponse', data);
    });

    this.steamClient.on('receivedFromGC', (appid, msgType, payload) => {
      if (appid !== DOTA2_APPID) return;

      if (msgType === ESOMsg.k_ESOMsg_CacheSubscribed) {
        this._handleSOCacheSubscribed(payload);
      } else if (msgType === ESOMsg.k_ESOMsg_Create) {
        this._handleSOCreate(payload);
      } else if (msgType === ESOMsg.k_ESOMsg_Update) {
        this._handleSOUpdate(payload);
      } else if (msgType === ESOMsg.k_ESOMsg_UpdateMultiple) {
        this._handleSOUpdateMultiple(payload);
      } else if (msgType === ESOMsg.k_ESOMsg_Destroy) {
        this._handleSODestroy(payload);
      }
    });
  }

  _tryDecodeLobby(typeId, objectData) {
    if (typeId !== LOBBY_TYPE_ID) return null;
    try {
      const lobby = CSODOTALobby.decode(objectData);
      return lobby;
    } catch (e) {
      console.warn('[Dota2 GC] Failed to decode CSODOTALobby:', e.message);
      return null;
    }
  }

  _processLobbyData(lobby) {
    if (!lobby) return;

    const lobbyId = lobby.lobbyId ? lobby.lobbyId.toString() : null;
    const matchId = lobby.matchId && lobby.matchId.toString() !== '0' ? lobby.matchId.toString() : null;
    const gameName = lobby.gameName || '';
    const gameState = lobby.gameState;
    const members = lobby.allMembers || [];

    this.currentLobby = lobby;

    console.log(`[Dota2 GC] Lobby update: id=${lobbyId}, state=${gameState}, match=${matchId || 'none'}, members=${members.length}, name="${gameName}"`);

    this.emit('lobbyUpdate', {
      lobbyId,
      matchId,
      gameState,
      gameName,
      playerCount: members.length,
      players: members.map((m) => ({
        steamId: m.id ? m.id.toString() : '0',
        team: m.team,
        slot: m.slot,
      })),
    });

    if (this._pendingLobbyCreate) {
      this._pendingLobbyCreate = false;
      this.emit('lobbyCreatedViaCache', { lobbyId, matchId });
    }
  }

  _handleSOCacheSubscribed(payload) {
    try {
      const msg = CMsgSOCacheSubscribed.decode(payload);
      const objects = msg.objects || [];
      for (const obj of objects) {
        const typeId = obj.typeId;
        const dataList = obj.objectData || [];
        for (const data of dataList) {
          const lobby = this._tryDecodeLobby(typeId, data);
          if (lobby) {
            this._processLobbyData(lobby);
          }
        }
      }
    } catch (e) {
      console.warn('[Dota2 GC] Could not process SO cache subscription:', e.message);
    }
  }

  _handleSOCreate(payload) {
    try {
      const msg = CMsgSOSingleObject.decode(payload);
      const lobby = this._tryDecodeLobby(msg.typeId, msg.objectData);
      if (lobby) {
        this._processLobbyData(lobby);
      }
    } catch (e) {
      console.warn('[Dota2 GC] Could not process SO create:', e.message);
    }
  }

  _handleSOUpdate(payload) {
    try {
      const msg = CMsgSOSingleObject.decode(payload);
      const lobby = this._tryDecodeLobby(msg.typeId, msg.objectData);
      if (lobby) {
        this._processLobbyData(lobby);
      }
    } catch (e) {
      console.warn('[Dota2 GC] Could not process SO update:', e.message);
    }
  }

  _handleSOUpdateMultiple(payload) {
    try {
      const msg = CMsgSOMultipleObjects.decode(payload);
      const allObjects = [...(msg.objectsModified || []), ...(msg.objectsAdded || [])];
      for (const obj of allObjects) {
        const lobby = this._tryDecodeLobby(obj.typeId, obj.objectData);
        if (lobby) {
          this._processLobbyData(lobby);
        }
      }
    } catch (e) {
      console.warn('[Dota2 GC] Could not process SO update multiple:', e.message);
    }
  }

  _handleSODestroy(payload) {
    try {
      const msg = CMsgSOSingleObject.decode(payload);
      if (msg.typeId === LOBBY_TYPE_ID) {
        console.log('[Dota2 GC] Lobby destroyed (SO cache).');
        this.currentLobby = null;
        this.emit('lobbyDestroyed');
      }
    } catch (e) {
      console.warn('[Dota2 GC] Could not process SO destroy:', e.message);
    }
  }

  waitForReady(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      if (this.isReady) return resolve();

      const timer = setTimeout(() => {
        reject(new Error('Dota 2 GC connection timed out.'));
      }, timeoutMs);

      this.once('ready', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  createPracticeLobby(options) {
    return new Promise((resolve, reject) => {
      if (!this.isReady) return reject(new Error('GC not ready.'));

      this._pendingLobbyCreate = true;
      let resolved = false;

      const timer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this._pendingLobbyCreate = false;
        cleanup();
        reject(new Error('Lobby creation timed out.'));
      }, 30000);

      const onLobbyResponse = (data) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        cleanup();
        if (data.result === 0 || data.result === 1) {
          resolve({ id: null, eresult: data.result });
        } else {
          this._pendingLobbyCreate = false;
          reject(new Error(`Lobby creation failed with result: ${data.result}`));
        }
      };

      const onLobbyViaCache = (data) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        cleanup();
        console.log('[Dota2 GC] Lobby created (confirmed via SO cache).');
        resolve({ id: data.lobbyId, eresult: 0 });
      };

      const cleanup = () => {
        this.removeListener('lobbyResponse', onLobbyResponse);
        this.removeListener('lobbyCreatedViaCache', onLobbyViaCache);
      };

      this.on('lobbyResponse', onLobbyResponse);
      this.on('lobbyCreatedViaCache', onLobbyViaCache);

      try {
        const buffer = encodeLobbyCreate(options);
        this.dota2.sendRawBuffer(EDOTAGCMsg.k_EMsgGCPracticeLobbyCreate, buffer);
        console.log(`[Dota2 GC] Lobby create request sent: ${options.game_name || 'Inhouse'}`);
      } catch (err) {
        resolved = true;
        clearTimeout(timer);
        cleanup();
        this._pendingLobbyCreate = false;
        reject(new Error(`Failed to send lobby create: ${err.message}`));
      }
    });
  }

  leavePracticeLobby() {
    try {
      const buffer = encodeLobbyLeave();
      this.dota2.sendRawBuffer(EDOTAGCMsg.k_EMsgGCPracticeLobbyLeave, buffer);
      this.currentLobby = null;
      console.log('[Dota2 GC] Left practice lobby.');
    } catch (e) {
      console.warn('[Dota2 GC] Error leaving lobby:', e.message);
    }
  }

  requestMatchDetails(matchId) {
    return new Promise((resolve, reject) => {
      if (!this.isReady) return reject(new Error('GC not ready.'));

      const timer = setTimeout(() => {
        this.removeAllListeners('matchDetailsResponse');
        reject(new Error('Match details request timed out.'));
      }, 15000);

      this.once('matchDetailsResponse', (data) => {
        clearTimeout(timer);
        resolve(data);
      });

      try {
        this.dota2.send(EDOTAGCMsg.k_EMsgGCMatchDetailsRequest, {
          matchId: matchId.toString(),
        });
        console.log(`[Dota2 GC] Match details requested: ${matchId}`);
      } catch (err) {
        clearTimeout(timer);
        this.removeAllListeners('matchDetailsResponse');
        reject(new Error(`Failed to request match details: ${err.message}`));
      }
    });
  }

  shutdown() {
    this.isReady = false;
    this.leavePracticeLobby();
  }
}

module.exports = {
  Dota2GCClient,
  DOTA2_APPID,
  GAME_MODE,
  SERVER_REGION,
  LOBBY_TYPE,
};
