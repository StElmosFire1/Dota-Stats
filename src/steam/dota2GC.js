const protobuf = require('protobufjs');
const path = require('path');

const DOTA2_APPID = 570;

const EventEmitter = require('events');

const EDOTAGCMsg = {
  k_EMsgClientHello: 4006,
  k_EMsgClientWelcome: 4004,
  k_EMsgGCPracticeLobbyCreate: 7038,
  k_EMsgGCPracticeLobbyJoin: 7040,
  k_EMsgGCPracticeLobbyLeave: 7041,
  k_EMsgGCLaunchPracticeLobby: 7043,
  k_EMsgGCPracticeLobbyUpdate: 7049,
  k_EMsgGCPracticeLobbyResponse: 7055,
  k_EMsgGCPracticeLobbyList: 7045,
  k_EMsgGCPracticeLobbyListResponse: 7046,
  k_EMsgGCPracticeLobbyKick: 7047,
  k_EMsgGCJoinChatChannel: 7009,
  k_EMsgGCAbandonCurrentGame: 7104,
  k_EMsgGCMatchDetailsRequest: 7095,
  k_EMsgGCMatchDetailsResponse: 7096,
};

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

function getProtoRoot() {
  if (protoRoot) return protoRoot;
  protoRoot = new protobuf.Root();
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgPracticeLobbySetDetails')
      .add(new protobuf.Field('game_name', 1, 'string'))
      .add(new protobuf.Field('pass_key', 6, 'string'))
      .add(new protobuf.Field('server_region', 5, 'uint32'))
      .add(new protobuf.Field('game_mode', 3, 'uint32'))
      .add(new protobuf.Field('allow_spectating', 10, 'bool'))
      .add(new protobuf.Field('leagueid', 13, 'uint32'))
      .add(new protobuf.Field('cm_pick', 28, 'uint32'))
      .add(new protobuf.Field('visibility', 22, 'uint32'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgPracticeLobbyCreate')
      .add(new protobuf.Field('search_key', 1, 'string'))
      .add(new protobuf.Field('lobby_details', 2, 'dota.CMsgPracticeLobbySetDetails'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgPracticeLobbyJoin')
      .add(new protobuf.Field('lobby_id', 1, 'uint64'))
      .add(new protobuf.Field('pass_key', 2, 'string'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgPracticeLobbyLeave').add(new protobuf.Field('dummy', 1, 'uint32'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgPracticeLobbyResponse')
      .add(new protobuf.Field('id', 1, 'uint64'))
      .add(new protobuf.Field('eresult', 2, 'uint32'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgClientHello')
      .add(new protobuf.Field('engine', 1, 'uint32'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgClientWelcome')
      .add(new protobuf.Field('version', 1, 'uint32'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgGCMatchDetailsRequest')
      .add(new protobuf.Field('match_id', 1, 'uint64'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgGCMatchDetailsResponse')
      .add(new protobuf.Field('result', 1, 'uint32'))
      .add(new protobuf.Field('match', 2, 'dota.CMsgDOTAMatch'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgDOTAMatchPlayer')
      .add(new protobuf.Field('account_id', 1, 'uint32'))
      .add(new protobuf.Field('player_slot', 2, 'uint32'))
      .add(new protobuf.Field('hero_id', 3, 'uint32'))
      .add(new protobuf.Field('kills', 5, 'uint32'))
      .add(new protobuf.Field('deaths', 6, 'uint32'))
      .add(new protobuf.Field('assists', 7, 'uint32'))
      .add(new protobuf.Field('last_hits', 9, 'uint32'))
      .add(new protobuf.Field('denies', 10, 'uint32'))
      .add(new protobuf.Field('gold_per_min', 11, 'uint32'))
      .add(new protobuf.Field('xp_per_min', 12, 'uint32'))
      .add(new protobuf.Field('hero_damage', 41, 'uint32'))
      .add(new protobuf.Field('tower_damage', 42, 'uint32'))
      .add(new protobuf.Field('hero_healing', 43, 'uint32'))
      .add(new protobuf.Field('level', 44, 'uint32'))
      .add(new protobuf.Field('net_worth', 60, 'uint32'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgDOTAMatch')
      .add(new protobuf.Field('match_id', 1, 'uint64'))
      .add(new protobuf.Field('duration', 3, 'uint32'))
      .add(new protobuf.Field('start_time', 4, 'fixed32'))
      .add(new protobuf.Field('match_outcome', 11, 'uint32'))
      .add(new protobuf.Field('game_mode', 12, 'uint32'))
      .add(new protobuf.Field('players', 2, 'dota.CMsgDOTAMatchPlayer', 'repeated'))
  );

  protoRoot.define('dota').add(
    new protobuf.Type('CMsgLobbyMember')
      .add(new protobuf.Field('id', 1, 'fixed64'))
      .add(new protobuf.Field('team', 6, 'uint32'))
      .add(new protobuf.Field('slot', 7, 'uint32'))
      .add(new protobuf.Field('hero_id', 5, 'uint32'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CSODOTALobby')
      .add(new protobuf.Field('lobby_id', 1, 'uint64'))
      .add(new protobuf.Field('state', 4, 'uint32'))
      .add(new protobuf.Field('game_name', 53, 'string'))
      .add(new protobuf.Field('match_id', 6, 'uint64'))
      .add(new protobuf.Field('game_mode', 13, 'uint32'))
      .add(new protobuf.Field('game_state', 3, 'uint32'))
      .add(new protobuf.Field('server_region', 16, 'uint32'))
      .add(new protobuf.Field('all_members', 8, 'dota.CMsgLobbyMember', 'repeated'))
  );

  protoRoot.resolveAll();
  return protoRoot;
}

function encodeMessage(typeName, payload) {
  const root = getProtoRoot();
  const Type = root.lookupType(`dota.${typeName}`);
  const msg = Type.create(payload);
  return Type.encode(msg).finish();
}

function decodeMessage(typeName, buffer) {
  const root = getProtoRoot();
  const Type = root.lookupType(`dota.${typeName}`);
  return Type.decode(buffer);
}

class Dota2GCClient extends EventEmitter {
  constructor(steamClient) {
    super();
    this.steamClient = steamClient;
    this.isReady = false;
    this._callbacks = new Map();
    this._lobbyCallback = null;
    this._matchCallback = null;
    this.currentLobby = null;

    this.steamClient.on('receivedFromGC', (appid, msgType, payload) => {
      if (appid !== DOTA2_APPID) return;
      this._handleGCMessage(msgType, payload);
    });
  }

  sendHello() {
    const buffer = encodeMessage('CMsgClientHello', { engine: 1 });
    this.steamClient.sendToGC(DOTA2_APPID, EDOTAGCMsg.k_EMsgClientHello, {}, buffer);
    console.log('[Dota2 GC] Sent hello.');
  }

  _handleGCMessage(msgType, payload) {
    switch (msgType) {
      case EDOTAGCMsg.k_EMsgClientWelcome: {
        try {
          const welcome = decodeMessage('CMsgClientWelcome', payload);
          console.log(`[Dota2 GC] Welcome received. Version: ${welcome.version || 'unknown'}`);
        } catch (e) {
          console.log('[Dota2 GC] Welcome received (could not decode details).');
        }
        this.isReady = true;
        if (this._helloInterval) {
          clearInterval(this._helloInterval);
          this._helloInterval = null;
        }
        this.emit('ready');
        if (this._callbacks.has('ready')) {
          this._callbacks.get('ready')();
          this._callbacks.delete('ready');
        }
        break;
      }
      case EDOTAGCMsg.k_EMsgGCPracticeLobbyResponse: {
        try {
          const response = decodeMessage('CMsgPracticeLobbyResponse', payload);
          console.log(`[Dota2 GC] Lobby response: id=${response.id}, result=${response.eresult}`);
          if (this._lobbyCallback) {
            this._lobbyCallback(null, response);
            this._lobbyCallback = null;
          }
        } catch (e) {
          console.error('[Dota2 GC] Failed to decode lobby response:', e.message);
          if (this._lobbyCallback) {
            this._lobbyCallback(e);
            this._lobbyCallback = null;
          }
        }
        break;
      }
      case EDOTAGCMsg.k_EMsgGCMatchDetailsResponse: {
        try {
          const response = decodeMessage('CMsgGCMatchDetailsResponse', payload);
          console.log(`[Dota2 GC] Match details received: result=${response.result}`);
          if (this._matchCallback) {
            this._matchCallback(null, response);
            this._matchCallback = null;
          }
        } catch (e) {
          console.error('[Dota2 GC] Failed to decode match details:', e.message);
          if (this._matchCallback) {
            this._matchCallback(e);
            this._matchCallback = null;
          }
        }
        break;
      }
      case EDOTAGCMsg.k_EMsgGCPracticeLobbyUpdate: {
        try {
          const lobby = decodeMessage('CSODOTALobby', payload);
          this.currentLobby = lobby;
          console.log(`[Dota2 GC] Lobby update: state=${lobby.game_state}, match_id=${lobby.match_id || 'none'}, members=${(lobby.all_members || []).length}`);
          this.emit('lobbyUpdate', {
            lobbyId: lobby.lobby_id ? lobby.lobby_id.toString() : null,
            matchId: lobby.match_id && lobby.match_id.toString() !== '0' ? lobby.match_id.toString() : null,
            gameState: lobby.game_state,
            gameName: lobby.game_name,
            playerCount: (lobby.all_members || []).length,
            players: (lobby.all_members || []).map((m) => ({
              steamId: m.id ? m.id.toString() : '0',
              team: m.team,
              slot: m.slot,
            })),
          });
        } catch (e) {
          console.warn('[Dota2 GC] Could not decode lobby update:', e.message);
          this.emit('lobbyUpdate', { raw: true });
        }
        break;
      }
      default:
        console.log(`[Dota2 GC] Unhandled message type: ${msgType} (0x${msgType.toString(16)}), payload size: ${payload.length}`);
        break;
    }
  }

  waitForReady(timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      if (this.isReady) return resolve();

      const timer = setTimeout(() => {
        this._callbacks.delete('ready');
        reject(new Error('Dota 2 GC connection timed out.'));
      }, timeoutMs);

      this._callbacks.set('ready', () => {
        clearTimeout(timer);
        resolve();
      });

      this.sendHello();
    });
  }

  startPeriodicHello(intervalMs = 30000) {
    if (this._helloInterval) clearInterval(this._helloInterval);
    this._helloInterval = setInterval(() => {
      if (!this.isReady) {
        console.log('[Dota2 GC] Retrying hello...');
        this.sendHello();
      }
    }, intervalMs);
  }

  createPracticeLobby(options) {
    return new Promise((resolve, reject) => {
      if (!this.isReady) return reject(new Error('GC not ready.'));

      const lobbyDetails = {
        game_name: options.game_name || 'Inhouse',
        pass_key: options.pass_key || '',
        server_region: options.server_region || SERVER_REGION.AUSTRALIA,
        game_mode: options.game_mode || GAME_MODE.CAPTAINS_MODE,
        allow_spectating: options.allow_spectating !== false,
        leagueid: options.leagueid || 0,
        visibility: 1,
      };

      const payload = encodeMessage('CMsgPracticeLobbyCreate', {
        search_key: '',
        lobby_details: lobbyDetails,
      });

      const timer = setTimeout(() => {
        this._lobbyCallback = null;
        reject(new Error('Lobby creation timed out.'));
      }, 30000);

      this._lobbyCallback = (err, response) => {
        clearTimeout(timer);
        if (err) return reject(err);
        resolve(response);
      };

      this.steamClient.sendToGC(
        DOTA2_APPID,
        EDOTAGCMsg.k_EMsgGCPracticeLobbyCreate,
        {},
        payload
      );
      console.log(`[Dota2 GC] Lobby create request sent: ${lobbyDetails.game_name}`);
    });
  }

  leavePracticeLobby() {
    const payload = encodeMessage('CMsgPracticeLobbyLeave', {});
    this.steamClient.sendToGC(
      DOTA2_APPID,
      EDOTAGCMsg.k_EMsgGCPracticeLobbyLeave,
      {},
      payload
    );
    console.log('[Dota2 GC] Left practice lobby.');
  }

  requestMatchDetails(matchId) {
    return new Promise((resolve, reject) => {
      if (!this.isReady) return reject(new Error('GC not ready.'));

      const payload = encodeMessage('CMsgGCMatchDetailsRequest', {
        match_id: matchId,
      });

      const timer = setTimeout(() => {
        this._matchCallback = null;
        reject(new Error('Match details request timed out.'));
      }, 15000);

      this._matchCallback = (err, response) => {
        clearTimeout(timer);
        if (err) return reject(err);
        resolve(response);
      };

      this.steamClient.sendToGC(
        DOTA2_APPID,
        EDOTAGCMsg.k_EMsgGCMatchDetailsRequest,
        {},
        payload
      );
      console.log(`[Dota2 GC] Match details requested: ${matchId}`);
    });
  }

  shutdown() {
    this.isReady = false;
    this.leavePracticeLobby();
  }
}

module.exports = {
  Dota2GCClient,
  EDOTAGCMsg,
  DOTA2_APPID,
  GAME_MODE,
  SERVER_REGION,
  LOBBY_TYPE,
  encodeMessage,
  decodeMessage,
};
