const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const { config } = require('../config');
const { Dota2GCClient, DOTA2_APPID } = require('./dota2GC');
const EventEmitter = require('events');

class SteamDotaClient extends EventEmitter {
  constructor() {
    super();
    this.steamClient = new SteamUser();
    this.gcClient = null;
    this.isLoggedIn = false;
    this.isGCReady = false;
    this._setupListeners();
  }

  _setupListeners() {
    this.steamClient.on('loggedOn', () => {
      console.log('[Steam] Logged in successfully.');
      this.isLoggedIn = true;
      this.steamClient.setPersona(SteamUser.EPersonaState.Online);

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

    this.steamClient.on('error', (err) => {
      console.error('[Steam] Login error:', err.message);
      this.isLoggedIn = false;
      this.isGCReady = false;
      this.emit('error', err);
    });

    this.steamClient.on('disconnected', (eresult, msg) => {
      console.warn(`[Steam] Disconnected: ${msg} (${eresult})`);
      this.isLoggedIn = false;
      this.isGCReady = false;
    });
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
