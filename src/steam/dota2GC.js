const { Dota2User } = require('dota2-user');
const { EDOTAGCMsg, EGCBaseMsg, ESOMsg, CSODOTALobby, CSODOTALobbyInvite, CMsgSOCacheSubscribed, CMsgSOSingleObject, CMsgSOMultipleObjects, CMsgPartyInviteResponse, CMsgLobbyInviteResponse, CMsgInviteToParty, CMsgClientWelcome } = require('dota2-user/protobufs');
const { CSODOTAPartyInvite } = require('dota2-user/protobufs/generated/dota_gcmessages_common_match_management');
const protobuf = require('protobufjs');
const EventEmitter = require('events');

const DOTA2_APPID = 570;
const LOBBY_TYPE_ID = 2004;
const LOBBY_INVITE_TYPE_ID = 2006;
const PARTY_INVITE_TYPE_ID = 2007;

const STEAM64_BASE = BigInt('76561197960265728');
function accountId32ToSteam64(accountId) {
  if (!accountId && accountId !== 0) return null;
  try {
    return (STEAM64_BASE + BigInt(accountId.toString())).toString();
  } catch {
    return accountId.toString();
  }
}

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
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgInviteToLobby')
      .add(new protobuf.Field('steam_id', 1, 'fixed64'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgPracticeLobbyJoin')
      .add(new protobuf.Field('lobby_id', 1, 'fixed64'))
      .add(new protobuf.Field('client_version', 2, 'uint32'))
      .add(new protobuf.Field('pass_key', 3, 'string'))
      .add(new protobuf.Field('custom_game_crc', 4, 'fixed64'))
      .add(new protobuf.Field('custom_game_timestamp', 5, 'fixed32'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgPracticeLobbyJoinResponse')
      .add(new protobuf.Field('result', 1, 'uint32'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgPracticeLobbyLaunch')
      .add(new protobuf.Field('dummy', 1, 'uint32'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgPracticeLobbyJoinBroadcastChannel')
      .add(new protobuf.Field('channel_id', 1, 'uint32'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgDOTAJoinChatChannel')
      .add(new protobuf.Field('channel_name', 1, 'string'))
      .add(new protobuf.Field('channel_type', 2, 'uint32'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgDOTAJoinChatChannelResponse')
      .add(new protobuf.Field('result', 1, 'uint32'))
      .add(new protobuf.Field('channel_name', 2, 'string'))
      .add(new protobuf.Field('channel_id', 3, 'uint64'))
      .add(new protobuf.Field('max_users', 4, 'uint32'))
  );
  protoRoot.define('dota').add(
    new protobuf.Type('CMsgDOTAChatMessage')
      .add(new protobuf.Field('channel_id', 1, 'uint64'))
      .add(new protobuf.Field('text', 2, 'string'))
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
      cm_pick: options.cm_pick !== undefined ? options.cm_pick : 1,  // 1=Radiant/home picks first
      allow_cheats: false,
      fill_with_bots: false,
      allow_spectating: options.allow_spectating !== false,
      visibility: 1, // 0=Public, 1=Friends, 2=Unlisted
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
    this.lobbyChatChannelId = null;
    // Holds info from a k_EMsgGCInviteToParty message until CSO data arrives with partyId
    this._pendingPartyInvite = null;
    // Holds inviter steamId from k_EMsgGCInviteToLobby until CSO data arrives with lobbyId
    this._pendingLobbyInviteFromSteamId = null;
    this.gcVersion = 0;

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
      } else if (msgType === ESOMsg.k_ESOMsg_CacheSubscriptionRefresh) {
        this._handleSOCacheSubscribed(payload);
      } else if (msgType === EDOTAGCMsg.k_EMsgGCPracticeLobbyJoinResponse) {
        try {
          const root = getLobbyProtos();
          const Type = root.lookupType('dota.CMsgPracticeLobbyJoinResponse');
          const decoded = Type.decode(payload);
          console.log(`[Dota2 GC] Lobby join response received (raw): result=${decoded.result}`);
          this.emit('lobbyJoinResponse', decoded);
        } catch (e) {
          console.log(`[Dota2 GC] Lobby join response received (raw decode failed): ${e.message}`);
          this.emit('lobbyJoinResponse', { result: 0 });
        }
      } else if (msgType === EDOTAGCMsg.k_EMsgGCPracticeLobbyResponse) {
        try {
          const root = getLobbyProtos();
          const Type = root.lookupType('dota.CMsgPracticeLobbyJoinResponse');
          const decoded = Type.decode(payload);
          console.log(`[Dota2 GC] Lobby response received (raw): result=${decoded.result}`);
          this.emit('lobbyResponse', decoded);
        } catch (e) {
          console.log(`[Dota2 GC] Lobby response (raw decode failed): ${e.message}`);
        }
      } else if (msgType === EDOTAGCMsg.k_EMsgGCJoinChatChannelResponse) {
        try {
          const root = getLobbyProtos();
          const Type = root.lookupType('dota.CMsgDOTAJoinChatChannelResponse');
          const decoded = Type.decode(payload);
          if (decoded.channelId && decoded.channelId !== '0') {
            this.lobbyChatChannelId = decoded.channelId;
            console.log(`[Dota2 GC] Lobby chat channel joined: "${decoded.channelName}" (id=${decoded.channelId})`);
          }
        } catch (e) {
          console.warn('[Dota2 GC] JoinChatChannelResponse decode failed:', e.message);
        }
      } else if (msgType === EGCBaseMsg.k_EMsgGCInviteToLobby) {
        // Direct lobby invite notification — contains inviter's steamId but NOT the lobbyId.
        // Buffer the inviter; when CSO type 2006 arrives with the lobbyId, _processLobbyInvite
        // will use _pendingLobbyInviteFromSteamId to enrich the event.
        try {
          const { CMsgInviteToLobby: InviteToLobby } = require('dota2-user/protobufs');
          const decoded = InviteToLobby.decode(payload);
          const inviterSteamId = decoded.steamId ? decoded.steamId.toString() : null;
          console.log(`[Dota2 GC] k_EMsgGCInviteToLobby received — inviter steamId: ${inviterSteamId}`);
          this._pendingLobbyInviteFromSteamId = inviterSteamId;
          // If CSO type 2006 doesn't arrive within 3s, clear the buffer
          if (this._pendingLobbyInviteTimer) clearTimeout(this._pendingLobbyInviteTimer);
          this._pendingLobbyInviteTimer = setTimeout(() => {
            this._pendingLobbyInviteFromSteamId = null;
          }, 3000);
        } catch (e) {
          console.log('[Dota2 GC] Could not decode CMsgInviteToLobby:', e.message);
        }
      } else if (msgType === 4004) {
        // CMsgClientWelcome — GC sends this at startup with initial CSO subscriptions.
        // It may contain pending lobby invites (typeId=2006) we'd otherwise miss.
        try {
          const welcome = CMsgClientWelcome.decode(payload);
          if (welcome.version) {
            this.gcVersion = welcome.version;
            console.log(`[Dota2 GC] GC version from welcome: ${this.gcVersion}`);
          }
          const caches = [...(welcome.outofdateSubscribedCaches || []), ...(welcome.uptodateSubscribedCaches || [])];
          console.log(`[Dota2 GC] ClientWelcome: ${caches.length} CSO cache(s) in startup payload`);
          for (const cache of caches) {
            for (const obj of (cache.objects || [])) {
              const typeId = obj.typeId;
              for (const data of (obj.objectData || [])) {
                const lobby = this._tryDecodeLobby(typeId, data);
                if (lobby) this._processLobbyData(lobby);
                const invite = this._tryDecodeLobbyInvite(typeId, data);
                if (invite) { console.log(`[Dota2 GC] Startup pending lobby invite found (typeId=${typeId})`); this._processLobbyInvite(invite); }
                const partyInvite = this._tryDecodePartyInvite(typeId, data);
                if (partyInvite) this._processPartyInvite(partyInvite);
              }
            }
          }
        } catch (e) {
          console.log(`[Dota2 GC] ClientWelcome (4004) decode failed: ${e.message}`);
        }
      } else if (msgType === EGCBaseMsg.k_EMsgGCInviteToParty) {
        // Decode to get the inviter's Steam64 ID
        try {
          const inviteMsg = CMsgInviteToParty.decode(payload);
          const inviterSteamId = inviteMsg.steamId ? inviteMsg.steamId.toString() : null;
          console.log(`[Dota2 GC] Party invite received via GC message — inviter steamId: ${inviterSteamId}`);
          // Buffer this; CSO update (type 2007) should arrive with partyId shortly.
          // If CSO doesn't arrive within 2s, emit with partyId=null so handler can still accept.
          if (this._pendingPartyInvite && this._pendingPartyInvite._timer) {
            clearTimeout(this._pendingPartyInvite._timer);
          }
          this._pendingPartyInvite = { inviterSteamId, senderName: 'Unknown' };
          this._pendingPartyInvite._timer = setTimeout(() => {
            if (this._pendingPartyInvite) {
              const p = this._pendingPartyInvite;
              this._pendingPartyInvite = null;
              console.log('[Dota2 GC] No CSO party data received — emitting partyInviteReceived without partyId.');
              this.emit('partyInviteReceived', { partyId: null, senderId: p.inviterSteamId, senderName: p.senderName });
            }
          }, 2000);
        } catch (e) {
          console.warn('[Dota2 GC] Could not decode CMsgInviteToParty:', e.message);
        }
      } else {
        console.log(`[Dota2 GC] Unhandled GC message: msgType=${msgType} (${payload.length} bytes)`);
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

  _tryDecodeLobbyInvite(typeId, objectData) {
    if (typeId !== LOBBY_INVITE_TYPE_ID) return null;
    try {
      const invite = CSODOTALobbyInvite.decode(objectData);
      return invite;
    } catch (e) {
      return null;
    }
  }

  _processLobbyInvite(invite) {
    if (!invite) return;
    const lobbyId = invite.groupId ? invite.groupId.toString() : null;
    const senderName = invite.senderName || 'Unknown';
    // senderId in CSODOTALobbyInvite is a 32-bit account ID — convert to Steam64
    const senderId = invite.senderId ? accountId32ToSteam64(invite.senderId) : 'Unknown';
    const inviteGid = invite.inviteGid ? invite.inviteGid.toString() : null;
    console.log(`[Dota2 GC] Lobby invite from ${senderName} (Steam64: ${senderId}), lobbyId: ${lobbyId}, inviteGid: ${inviteGid}`);
    this.emit('lobbyInviteReceived', { lobbyId, senderId, senderName, inviteGid });
  }

  acceptLobbyInvite(lobbyId) {
    if (!this.dota2 || !this.dota2.sendRawBuffer) {
      console.warn('[Dota2 GC] Cannot accept lobby invite — GC not ready.');
      return false;
    }
    try {
      // Include the actual lobbyId — encoder skips it when "0", GC can't match the invite without it
      const inviteFields = { accept: true, lobbyId: lobbyId ? lobbyId.toString() : '0' };
      if (this.gcVersion) inviteFields.clientVersion = this.gcVersion;
      const msg = CMsgLobbyInviteResponse.fromPartial(inviteFields);
      const buf = CMsgLobbyInviteResponse.encode(msg).finish();
      this.dota2.sendRawBuffer(EGCBaseMsg.k_EMsgGCLobbyInviteResponse, buf);
      console.log(`[Dota2 GC] Sent lobby invite acceptance for lobby ${lobbyId} (${buf.length} bytes, clientVersion=${this.gcVersion})`);
      return true;
    } catch (e) {
      console.warn('[Dota2 GC] Failed to send lobby invite response:', e.message);
      return false;
    }
  }

  _tryDecodePartyInvite(typeId, objectData) {
    if (typeId !== PARTY_INVITE_TYPE_ID) return null;
    try {
      return CSODOTAPartyInvite.decode(objectData);
    } catch (e) {
      return null;
    }
  }

  _processPartyInvite(invite) {
    if (!invite) return;
    const partyId = invite.groupId ? invite.groupId.toString() : null;
    // senderId in CSODOTAPartyInvite is a 32-bit account ID — convert to Steam64
    const senderId = invite.senderId ? accountId32ToSteam64(invite.senderId) : null;
    const senderName = invite.senderName || 'Unknown';
    console.log(`[Dota2 GC] Party invite (CSO) from ${senderName} (Steam64: ${senderId}), party: ${partyId}`);

    // Cancel the fallback timer from the direct GC message if we got full CSO data
    if (this._pendingPartyInvite) {
      if (this._pendingPartyInvite._timer) clearTimeout(this._pendingPartyInvite._timer);
      this._pendingPartyInvite = null;
    }

    this.emit('partyInviteReceived', { partyId, senderId, senderName });
  }

  acceptPartyInvite(partyId) {
    if (!this.dota2 || !this.dota2.sendRawBuffer) {
      console.warn('[Dota2 GC] Cannot accept party invite — GC not ready.');
      return;
    }
    try {
      const msg = { accept: true };
      if (partyId && partyId !== '0') msg.partyId = partyId.toString();
      const buf = CMsgPartyInviteResponse.encode(msg).finish();
      this.dota2.sendRawBuffer(EGCBaseMsg.k_EMsgGCPartyInviteResponse, buf);
      console.log(`[Dota2 GC] Sent party invite acceptance${partyId ? ` for party ${partyId}` : ' (no partyId — GC will match pending invite)'}`);
    } catch (e) {
      console.warn('[Dota2 GC] Failed to send party invite response:', e.message);
    }
  }

  _processLobbyData(lobby) {
    if (!lobby) return;

    const lobbyId = lobby.lobbyId ? lobby.lobbyId.toString() : null;
    const matchId = lobby.matchId && lobby.matchId.toString() !== '0' ? lobby.matchId.toString() : null;
    const gameName = lobby.gameName || '';
    const gameState = lobby.gameState;
    const matchOutcome = lobby.matchOutcome || 0;
    const matchDuration = lobby.matchDuration || 0;
    const members = lobby.allMembers || [];

    this.currentLobby = lobby;

    console.log(`[Dota2 GC] Lobby update: id=${lobbyId}, state=${gameState}, match=${matchId || 'none'}, outcome=${matchOutcome}, members=${members.length}, name="${gameName}"`);

    this.emit('lobbyUpdate', {
      lobbyId,
      matchId,
      gameState,
      gameName,
      matchOutcome,
      matchDuration,
      playerCount: members.length,
      players: members.map((m) => ({
        steamId: m.id ? m.id.toString() : '0',
        heroId: m.heroId || 0,
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
        console.log(`[Dota2 GC] SO CacheSubscribed object: typeId=${typeId}` +
          (typeId === LOBBY_TYPE_ID ? ' (Lobby)' :
            typeId === LOBBY_INVITE_TYPE_ID ? ' (LobbyInvite)' :
            typeId === PARTY_INVITE_TYPE_ID ? ' (PartyInvite-2007)' :
            typeId === 2003 ? ' (Party-2003)' : ''));
        for (const data of dataList) {
          const lobby = this._tryDecodeLobby(typeId, data);
          if (lobby) {
            this._processLobbyData(lobby);
          }
          const invite = this._tryDecodeLobbyInvite(typeId, data);
          if (invite) {
            this._processLobbyInvite(invite);
          }
          const partyInvite = this._tryDecodePartyInvite(typeId, data);
          if (partyInvite) {
            this._processPartyInvite(partyInvite);
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
      console.log(`[Dota2 GC] SO Create: typeId=${msg.typeId}, dataLen=${msg.objectData ? msg.objectData.length : 0}` +
        (msg.typeId === LOBBY_TYPE_ID ? ' (Lobby)' :
          msg.typeId === LOBBY_INVITE_TYPE_ID ? ' (LobbyInvite)' :
          msg.typeId === PARTY_INVITE_TYPE_ID ? ' (PartyInvite-2007)' :
          msg.typeId === 2003 ? ' (Party-2003)' : ''));
      const lobby = this._tryDecodeLobby(msg.typeId, msg.objectData);
      if (lobby) this._processLobbyData(lobby);
      const invite = this._tryDecodeLobbyInvite(msg.typeId, msg.objectData);
      if (invite) this._processLobbyInvite(invite);
      const partyInvite = this._tryDecodePartyInvite(msg.typeId, msg.objectData);
      if (partyInvite) this._processPartyInvite(partyInvite);
    } catch (e) {
      console.warn('[Dota2 GC] Could not process SO create:', e.message);
    }
  }

  _handleSOUpdate(payload) {
    try {
      const msg = CMsgSOSingleObject.decode(payload);
      console.log(`[Dota2 GC] SO Update: typeId=${msg.typeId}` +
        (msg.typeId === LOBBY_TYPE_ID ? ' (Lobby)' :
          msg.typeId === LOBBY_INVITE_TYPE_ID ? ' (LobbyInvite)' :
          msg.typeId === PARTY_INVITE_TYPE_ID ? ' (PartyInvite-2007)' : ''));
      const lobby = this._tryDecodeLobby(msg.typeId, msg.objectData);
      if (lobby) this._processLobbyData(lobby);
      const invite = this._tryDecodeLobbyInvite(msg.typeId, msg.objectData);
      if (invite) this._processLobbyInvite(invite);
      const partyInvite = this._tryDecodePartyInvite(msg.typeId, msg.objectData);
      if (partyInvite) this._processPartyInvite(partyInvite);
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
        if (lobby) this._processLobbyData(lobby);
        const invite = this._tryDecodeLobbyInvite(obj.typeId, obj.objectData);
        if (invite) this._processLobbyInvite(invite);
        const partyInvite = this._tryDecodePartyInvite(obj.typeId, obj.objectData);
        if (partyInvite) this._processPartyInvite(partyInvite);
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
        if (data.lobbyId) {
          setTimeout(() => this.joinLobbyChatChannel(data.lobbyId), 2000);
        }
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
      this.lobbyChatChannelId = null;
      console.log('[Dota2 GC] Left practice lobby.');
    } catch (e) {
      console.warn('[Dota2 GC] Error leaving lobby:', e.message);
    }
  }

  joinPracticeLobby(lobbyId, password) {
    return new Promise((resolve, reject) => {
      if (!this.isReady) return reject(new Error('GC not ready.'));

      this._pendingLobbyCreate = true;
      let resolved = false;

      const timer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this._pendingLobbyCreate = false;
        cleanup();
        reject(new Error('Lobby join timed out.'));
      }, 30000);

      const onJoinResponse = (data) => {
        if (resolved) return;
        if (data.result !== 0 && data.result !== 1) {
          resolved = true;
          clearTimeout(timer);
          this._pendingLobbyCreate = false;
          cleanup();
          reject(new Error(`Lobby join failed with result: ${data.result}`));
        }
      };

      const onLobbyResponse = (data) => {
        if (resolved) return;
        if (data.result !== 0 && data.result !== 1) {
          resolved = true;
          clearTimeout(timer);
          this._pendingLobbyCreate = false;
          cleanup();
          reject(new Error(`Lobby join failed with result: ${data.result}`));
        }
      };

      const onLobbyViaCache = (data) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        cleanup();
        console.log('[Dota2 GC] Joined lobby (confirmed via SO cache).');
        resolve({ id: data.lobbyId, eresult: 0 });
      };

      const cleanup = () => {
        this.removeListener('lobbyJoinResponse', onJoinResponse);
        this.removeListener('lobbyResponse', onLobbyResponse);
        this.removeListener('lobbyCreatedViaCache', onLobbyViaCache);
      };

      this.on('lobbyJoinResponse', onJoinResponse);
      this.on('lobbyResponse', onLobbyResponse);
      this.on('lobbyCreatedViaCache', onLobbyViaCache);

      try {
        const root = getLobbyProtos();
        const Type = root.lookupType('dota.CMsgPracticeLobbyJoin');
        const joinFields = { lobby_id: lobbyId.toString() };
        if (password) joinFields.pass_key = password;
        const msg = Type.create(joinFields);
        const buf = Buffer.from(Type.encode(msg).finish());
        console.log(`[Dota2 GC] Join buffer (${buf.length} bytes): ${buf.toString('hex')}`);
        console.log(`[Dota2 GC] Sending k_EMsgGCPracticeLobbyJoin (${EDOTAGCMsg.k_EMsgGCPracticeLobbyJoin}) for lobby: ${lobbyId}`);
        this.dota2.sendRawBuffer(EDOTAGCMsg.k_EMsgGCPracticeLobbyJoin, buf);
        console.log(`[Dota2 GC] Lobby join request sent successfully`);
      } catch (err) {
        resolved = true;
        clearTimeout(timer);
        this._pendingLobbyCreate = false;
        cleanup();
        reject(new Error(`Failed to send lobby join: ${err.message}`));
      }
    });
  }

  launchLobby() {
    if (!this.isReady) throw new Error('GC not ready.');
    try {
      const root = getLobbyProtos();
      const Type = root.lookupType('dota.CMsgPracticeLobbyLaunch');
      const buf = Buffer.from(Type.encode(Type.create({})).finish());
      this.dota2.sendRawBuffer(EDOTAGCMsg.k_EMsgGCPracticeLobbyLaunch, buf);
      console.log('[Dota2 GC] Lobby launch request sent.');
    } catch (e) {
      throw new Error(`Failed to launch lobby: ${e.message}`);
    }
  }

  joinLobbyChatChannel(lobbyId) {
    if (!this.isReady) return false;
    try {
      const root = getLobbyProtos();
      const Type = root.lookupType('dota.CMsgDOTAJoinChatChannel');
      const channelName = `Lobby_${lobbyId}`;
      const buf = Buffer.from(Type.encode(Type.create({
        channel_name: channelName,
        channel_type: 4, // DOTAChatChannelType_Lobby
      })).finish());
      this.dota2.sendRawBuffer(EDOTAGCMsg.k_EMsgGCJoinChatChannel, buf);
      console.log(`[Dota2 GC] Sent join lobby chat channel request: ${channelName}`);
      return true;
    } catch (e) {
      console.warn('[Dota2 GC] Failed to join lobby chat channel:', e.message);
      return false;
    }
  }

  sendLobbyChat(text) {
    if (!this.isReady) return false;
    if (!this.lobbyChatChannelId) {
      console.warn('[Dota2 GC] Cannot send lobby chat — no channel ID (not yet joined).');
      return false;
    }
    try {
      const root = getLobbyProtos();
      const Type = root.lookupType('dota.CMsgDOTAChatMessage');
      const buf = Buffer.from(Type.encode(Type.create({
        channel_id: this.lobbyChatChannelId,
        text,
      })).finish());
      this.dota2.sendRawBuffer(EDOTAGCMsg.k_EMsgGCChatMessage, buf);
      return true;
    } catch (e) {
      console.warn('[Dota2 GC] Failed to send lobby chat:', e.message);
      return false;
    }
  }

  joinBroadcastChannel(channelId = 0) {
    if (!this.isReady) return false;
    try {
      const root = getLobbyProtos();
      const Type = root.lookupType('dota.CMsgPracticeLobbyJoinBroadcastChannel');
      const buf = Buffer.from(Type.encode(Type.create({ channel_id: channelId })).finish());
      this.dota2.sendRawBuffer(EDOTAGCMsg.k_EMsgGCPracticeLobbyJoinBroadcastChannel, buf);
      console.log(`[Dota2 GC] Joined broadcast channel ${channelId}.`);
      return true;
    } catch (e) {
      console.warn('[Dota2 GC] Failed to join broadcast channel:', e.message);
      return false;
    }
  }

  inviteToLobby(steamId64) {
    if (!this.isReady) {
      console.warn('[Dota2 GC] Cannot invite - GC not ready.');
      return false;
    }
    try {
      const root = getLobbyProtos();
      const Type = root.lookupType('dota.CMsgInviteToLobby');
      const msg = Type.create({ steam_id: steamId64.toString() });
      const buf = Buffer.from(Type.encode(msg).finish());
      this.dota2.sendRawBuffer(EGCBaseMsg.k_EMsgGCInviteToLobby, buf);
      console.log(`[Dota2 GC] Lobby invite sent to: ${steamId64}`);
      return true;
    } catch (e) {
      console.warn(`[Dota2 GC] Error inviting to lobby: ${e.message}`);
      return false;
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

  // Request a player's Dota 2 profile card from the GC.
  // Works for Steam friends even if match data is private.
  // Returns { rankTier, leaderboardRank } or null on failure/timeout.
  requestProfileCard(accountId32) {
    return new Promise((resolve) => {
      if (!this.isReady) { resolve(null); return; }

      const PROFILE_CARD_REQUEST  = 7538;
      const PROFILE_CARD_RESPONSE = 7539;

      // Encode CMsgClientToGCGetProfileCard manually:
      // field 1 (account_id), wire type 0 (varint)
      const encodeVarint = (value) => {
        const bytes = [];
        let v = value >>> 0;
        while (v > 0x7F) { bytes.push((v & 0x7F) | 0x80); v >>>= 7; }
        bytes.push(v & 0x7F);
        return Buffer.from(bytes);
      };
      const readVarint = (buf, offset) => {
        let result = 0, shift = 0;
        while (offset < buf.length) {
          const byte = buf[offset++];
          result |= (byte & 0x7F) << shift;
          if (!(byte & 0x80)) break;
          shift += 7;
        }
        return { value: result >>> 0, offset };
      };
      const parseProfileCard = (buf) => {
        const fields = {};
        let pos = 0;
        while (pos < buf.length) {
          const tag = readVarint(buf, pos);
          pos = tag.offset;
          const fieldNum = tag.value >>> 3;
          const wireType = tag.value & 0x7;
          if (wireType === 0) {
            const val = readVarint(buf, pos);
            pos = val.offset;
            fields[fieldNum] = val.value;
          } else if (wireType === 2) {
            const len = readVarint(buf, pos);
            pos = len.offset;
            pos += len.value;
          } else break;
        }
        return {
          rankTier:        fields[9]  ? fields[9]  : null,
          leaderboardRank: fields[10] ? fields[10] : null,
        };
      };

      const acctId = parseInt(accountId32) >>> 0;
      const payload = Buffer.concat([Buffer.from([0x08]), encodeVarint(acctId)]);

      let resolved = false;
      const finish = (val) => {
        if (resolved) return;
        resolved = true;
        this.steamClient.removeListener('receivedFromGC', handler);
        clearTimeout(timer);
        resolve(val);
      };

      const handler = (appid, msgType, payload) => {
        if (appid !== DOTA2_APPID) return;
        const rawType = msgType & 0x7FFFFFFF;
        if (rawType !== PROFILE_CARD_RESPONSE) return;
        try {
          // Response is CMsgClientToGCGetProfileCardResponse { profile_card = 1 (bytes) }
          // But often the GC returns CMsgDOTAProfileCard directly — try both
          let cardBuf = payload;
          if (payload[0] === 0x0A) {
            // wrapped: field 1, wire type 2 — extract inner bytes
            let pos = 1;
            const len = readVarint(payload, pos);
            pos = len.offset;
            cardBuf = payload.slice(pos, pos + len.value);
          }
          finish(parseProfileCard(cardBuf));
        } catch { finish(null); }
      };

      const timer = setTimeout(() => finish(null), 8000);
      this.steamClient.on('receivedFromGC', handler);

      try {
        // Use the steam client to send raw GC message
        this.steamClient.sendToGC(DOTA2_APPID, PROFILE_CARD_REQUEST | 0x80000000, {}, payload);
        console.log(`[GC] Profile card requested for account ${accountId32}`);
      } catch (e) {
        console.warn('[GC] Profile card request failed:', e.message);
        finish(null);
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
