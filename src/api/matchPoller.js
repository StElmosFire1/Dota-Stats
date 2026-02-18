const EventEmitter = require('events');
const { getOpenDota } = require('./opendota');
const { getSheetsStore } = require('../sheets/sheetsStore');

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const BATCH_SIZE = 10;
const MIN_REGISTERED_PLAYERS = 2;
const MAX_MATCH_AGE_HOURS = 48;

class MatchPoller extends EventEmitter {
  constructor() {
    super();
    this._timer = null;
    this._polling = false;
    this._seenMatchIds = new Set();
    this._batchOffset = 0;
    this._pendingCandidates = new Map();
  }

  start() {
    if (this._timer) return;
    console.log(`[Poller] Starting match poller (every ${POLL_INTERVAL_MS / 1000}s)`);
    this._timer = setInterval(() => this._poll(), POLL_INTERVAL_MS);
    setTimeout(() => this._poll(), 10000);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  async _poll() {
    if (this._polling) return;
    this._polling = true;

    try {
      const sheetsStore = getSheetsStore();
      if (!sheetsStore.initialized) {
        this._polling = false;
        return;
      }

      const players = await sheetsStore.getRegisteredPlayers();
      if (players.length === 0) {
        this._polling = false;
        return;
      }

      if (this._batchOffset >= players.length) {
        this._batchOffset = 0;
      }
      const batch = players.slice(this._batchOffset, this._batchOffset + BATCH_SIZE);
      const isLastBatch = (this._batchOffset + BATCH_SIZE) >= players.length;
      this._batchOffset += BATCH_SIZE;

      console.log(`[Poller] Checking ${batch.length} players (offset ${this._batchOffset - BATCH_SIZE}/${players.length})`);

      const opendota = getOpenDota();
      const now = Math.floor(Date.now() / 1000);
      const cutoff = now - (MAX_MATCH_AGE_HOURS * 3600);
      const allRegisteredAccountIds = new Set(players.map((p) => p.accountId32));

      for (const player of batch) {
        if (!player.accountId32) continue;

        const matches = await opendota.getPlayerRecentMatches(player.accountId32, 10);
        for (const m of matches) {
          if (!m.match_id) continue;
          const matchIdStr = m.match_id.toString();

          if (this._seenMatchIds.has(matchIdStr)) continue;
          if (m.start_time && m.start_time < cutoff) continue;

          if (!this._pendingCandidates.has(matchIdStr)) {
            this._pendingCandidates.set(matchIdStr, new Set());
          }
          this._pendingCandidates.get(matchIdStr).add(player.accountId32);
        }
      }

      if (!isLastBatch && players.length > BATCH_SIZE) {
        console.log(`[Poller] Batch complete, ${this._pendingCandidates.size} candidates pending. Waiting for more batches.`);
        this._polling = false;
        return;
      }

      const candidatesToProcess = new Map(this._pendingCandidates);
      this._pendingCandidates.clear();

      for (const [matchId, playerSet] of candidatesToProcess) {
        if (playerSet.size < MIN_REGISTERED_PLAYERS) continue;

        const alreadyRecorded = await sheetsStore.isMatchRecorded(matchId);
        if (alreadyRecorded) {
          this._seenMatchIds.add(matchId);
          continue;
        }

        console.log(`[Poller] Found new inhouse match: ${matchId} (${playerSet.size} registered players)`);

        try {
          let matchStats = await opendota.getMatch(matchId);
          if (!matchStats) {
            console.log(`[Poller] Match ${matchId} not parsed yet, requesting parse...`);
            await opendota.requestParse(matchId);
            continue;
          }

          if (matchStats.lobbyType !== undefined && matchStats.lobbyType !== 1) {
            console.log(`[Poller] Match ${matchId} is lobby_type=${matchStats.lobbyType}, skipping (not practice lobby)`);
            this._seenMatchIds.add(matchId);
            continue;
          }

          const matchRegisteredCount = matchStats.players.filter(
            (p) => allRegisteredAccountIds.has(p.accountId.toString())
          ).length;

          if (matchRegisteredCount < MIN_REGISTERED_PLAYERS) {
            this._seenMatchIds.add(matchId);
            continue;
          }

          await sheetsStore.recordMatch(matchStats, '', 'auto-poller');
          await sheetsStore.markMatchRecorded(matchId, 'auto');
          this._seenMatchIds.add(matchId);

          this.emit('matchRecorded', matchStats);
          console.log(`[Poller] Auto-recorded match ${matchId}`);
        } catch (err) {
          console.error(`[Poller] Error recording match ${matchId}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Poller] Poll error:', err.message);
    } finally {
      this._polling = false;
    }
  }
}

let instance = null;
function getMatchPoller() {
  if (!instance) {
    instance = new MatchPoller();
  }
  return instance;
}

module.exports = { getMatchPoller };
