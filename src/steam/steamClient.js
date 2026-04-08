const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const { config } = require('../config');
const { Dota2GCClient, DOTA2_APPID } = require('./dota2GC');
const EventEmitter = require('events');

const FRIEND_POLL_INTERVAL_MS = 60 * 1000;

class SteamDotaClient extends EventEmitter {
  constructor() {
    super();
    this.steamClient = new SteamUser();
    this.gcClient = null;
    this.isLoggedIn = false;
    this.isGCReady = false;
    this._friendMonitorTimer = null;
    this._lastSeenLobbyIds = new Map();
    this._friendMonitorEnabled = false;
    this._setupListeners();
  }

  _setupListeners() {
    this.steamClient.on('loggedOn', () => {
      console.log('[Steam] Logged in successfully.');
      this.isLoggedIn = true;
      this.steamClient.setPersona(SteamUser.EPersonaState.Online, 'Dota Bot');

      this.gcClient = new Dota2GCClient(this.steamClient);

      this.gcClient.on('ready', () => {
        console.log('[Steam] Dota 2 GC is ready!');
        this.isGCReady = true;
        this.emit('gcReady');
      });

      this.steamClient.gamesPlayed([DOTA2_APPID]);
    });

    this.steamClient.on('steamGuard', (domain, callback, lastCodeWrong) => {
      if (config.steam.sharedSecret) {
        const code = SteamTotp.generateAuthCode(config.steam.sharedSecret);
        console.log('[Steam] Providing Steam Guard code from shared secret...');
        callback(code);
      } else {
        console.error('[Steam] Steam Guard code requested but no shared secret configured.');
        console.error('[Steam] Either disable Steam Guard on this account or set STEAM_SHARED_SECRET.');
        callback('');
      }
    });

    this.steamClient.on('friendRelationship', (steamID, relationship) => {
      if (relationship === SteamUser.EFriendRelationship.RequestRecipient) {
        this.steamClient.addFriend(steamID, (err) => {
          if (err) {
            console.warn(`[Steam] Failed to accept friend request from ${steamID.getSteamID64()}: ${err.message}`);
          } else {
            console.log(`[Steam] Accepted friend request from ${steamID.getSteamID64()}`);
          }
        });
      }
    });

    this.steamClient.on('user', (sid, persona) => {
      if (!this._friendMonitorEnabled) return;
      if (!persona || !persona.rich_presence) return;

      const steamId64 = sid.getSteamID64();
      const gameAppId = persona.gameid || persona.game_played_app_id;
      if (gameAppId && gameAppId.toString() === '570') {
        const rp = persona.rich_presence;
        const lobbyGroup = Array.isArray(rp)
          ? rp.find((x) => x.key === 'steam_player_group')
          : null;
        const lobbyId = lobbyGroup ? lobbyGroup.value : null;

        if (lobbyId && lobbyId !== '0') {
          const lastSeen = this._lastSeenLobbyIds.get(steamId64);
          if (lastSeen !== lobbyId) {
            this._lastSeenLobbyIds.set(steamId64, lobbyId);
            console.log(`[Steam] Friend ${persona.player_name || steamId64} detected in Dota 2 lobby: ${lobbyId}`);
            this.emit('friendInLobby', {
              steamId64,
              playerName: persona.player_name || steamId64,
              lobbyId,
            });
          }
        }
      } else {
        this._lastSeenLobbyIds.delete(steamId64);
      }
    });

    this.steamClient.on('error', (err) => {
      this.isLoggedIn = false;
      this.isGCReady = false;
      if (err.eresult === 34 || err.message === 'LogonSessionReplaced') {
        console.warn('[Steam] Session replaced by another login — Steam disconnected. Bot continues running without Steam.');
        this.emit('steamDisconnected', 'LogonSessionReplaced');
      } else {
        console.error('[Steam] Login error:', err.message);
        this.emit('steamDisconnected', err.message);
      }
    });

    this.steamClient.on('disconnected', (eresult, msg) => {
      console.warn(`[Steam] Disconnected: ${msg} (${eresult})`);
      this.isLoggedIn = false;
      this.isGCReady = false;
    });
  }

  startFriendMonitor() {
    if (this._friendMonitorEnabled) return;
    this._friendMonitorEnabled = true;
    console.log('[Steam] Friend lobby monitor enabled - watching for friends in Dota 2 lobbies.');

    this._friendMonitorTimer = setInterval(() => {
      this._pollFriendsRichPresence();
    }, FRIEND_POLL_INTERVAL_MS);

    setTimeout(() => this._pollFriendsRichPresence(), 15000);
  }

  _pollFriendsRichPresence() {
    if (!this.isLoggedIn || !this.steamClient.myFriends) return;

    const friendIds = Object.keys(this.steamClient.myFriends).filter(
      (id) => this.steamClient.myFriends[id] === SteamUser.EFriendRelationship.Friend
    );

    if (friendIds.length === 0) return;

    for (const friendId of friendIds) {
      const user = this.steamClient.users ? this.steamClient.users[friendId] : null;
      if (!user) continue;

      const gameAppId = user.gameid || user.game_played_app_id;
      if (!gameAppId || gameAppId.toString() !== '570') continue;

      if (user.rich_presence) {
        const rp = user.rich_presence;
        const lobbyGroup = Array.isArray(rp)
          ? rp.find((x) => x.key === 'steam_player_group')
          : null;
        const lobbyId = lobbyGroup ? lobbyGroup.value : null;

        if (lobbyId && lobbyId !== '0') {
          const lastSeen = this._lastSeenLobbyIds.get(friendId);
          if (lastSeen !== lobbyId) {
            this._lastSeenLobbyIds.set(friendId, lobbyId);
            console.log(`[Steam] Friend ${user.player_name || friendId} detected in Dota 2 lobby: ${lobbyId} (via poll)`);
            this.emit('friendInLobby', {
              steamId64: friendId,
              playerName: user.player_name || friendId,
              lobbyId,
            });
          }
        }
      }
    }
  }

  stopFriendMonitor() {
    this._friendMonitorEnabled = false;
    if (this._friendMonitorTimer) {
      clearInterval(this._friendMonitorTimer);
      this._friendMonitorTimer = null;
    }
  }

  login() {
    return new Promise((resolve, reject) => {
      if (!config.steam.accountName || !config.steam.password) {
        return reject(new Error('Steam credentials not configured.'));
      }

      const loginOptions = {
        accountName: config.steam.accountName,
        password: config.steam.password,
      };

      const gcTimeout = setTimeout(() => {
        cleanup();
        console.warn('[Steam] GC connection timed out, but Steam is logged in. Lobby features may not work immediately.');
        this.isGCReady = true;
        resolve();
      }, 45000);

      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        clearTimeout(gcTimeout);
        this.removeListener('gcReady', onReady);
        this.steamClient.removeListener('error', onError);
      };

      this.once('gcReady', onReady);
      this.steamClient.once('error', onError);

      console.log('[Steam] Logging in...');
      this.steamClient.logOn(loginOptions);
    });
  }

  /**
   * Add all known players as Steam friends. Skips anyone already on the friends list.
   * Sends requests slowly (1 per second) to avoid rate limits.
   */
  async addAllKnownFriends(accountIds) {
    if (!this.isLoggedIn || !this.steamClient) return;
    const friends = this.steamClient.myFriends || {};
    let added = 0;
    let skipped = 0;
    for (const accountId32 of accountIds) {
      try {
        const steam64 = (BigInt('76561197960265728') + BigInt(accountId32)).toString();
        const rel = friends[steam64];
        if (rel === 3 /* EFriendRelationship.Friend */) { skipped++; continue; }
        await new Promise((resolve) => {
          this.steamClient.addFriend(steam64, (err) => {
            if (err) console.warn(`[Steam] addFriend ${steam64} failed: ${err.message}`);
            else added++;
            resolve();
          });
        });
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`[Steam] addAllKnownFriends error for ${accountId32}:`, err.message);
      }
    }
    console.log(`[Steam] addAllKnownFriends: ${added} requests sent, ${skipped} already friends`);
  }

  /**
   * Send a Steam friend message to a player by their 32-bit account ID.
   * The bot must be Steam friends with them for this to work.
   */
  sendSteamMessage(accountId32, message) {
    if (!this.isLoggedIn || !this.steamClient) {
      console.warn('[Steam] Cannot send message — not logged in');
      return false;
    }
    try {
      const steam64 = (BigInt('76561197960265728') + BigInt(accountId32)).toString();
      if (typeof this.steamClient.chat?.sendFriendMessage === 'function') {
        this.steamClient.chat.sendFriendMessage(steam64, message);
      } else {
        this.steamClient.chatMessage(steam64, message);
      }
      console.log(`[Steam] Sent message to account ${accountId32} (${steam64})`);
      return true;
    } catch (err) {
      console.error(`[Steam] Failed to send message to ${accountId32}:`, err.message);
      return false;
    }
  }

  shutdown() {
    if (this.gcClient) {
      this.gcClient.shutdown();
    }
    if (this.isLoggedIn) {
      this.steamClient.logOff();
    }
    this.isLoggedIn = false;
    this.isGCReady = false;
    console.log('[Steam] Shut down.');
  }
}

let instance = null;

function getSteamClient() {
  if (!instance) {
    instance = new SteamDotaClient();
  }
  return instance;
}

module.exports = { getSteamClient, SteamDotaClient };
