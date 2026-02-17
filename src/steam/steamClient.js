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
      this.steamClient.gamesPlayed([DOTA2_APPID]);
    });

    this.steamClient.on('appLaunched', (appid) => {
      if (appid === DOTA2_APPID) {
        console.log('[Steam] Dota 2 launched, connecting to GC...');
        this.gcClient = new Dota2GCClient(this.steamClient);
        this.gcClient.waitForReady()
          .then(() => {
            this.isGCReady = true;
            this.emit('gcReady');
          })
          .catch((err) => {
            console.warn('[Steam] GC connection issue:', err.message);
            this.isGCReady = true;
            this.emit('gcReady');
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

      if (config.steam.sharedSecret) {
        loginOptions.twoFactorCode = SteamTotp.generateAuthCode(config.steam.sharedSecret);
      }

      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
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
