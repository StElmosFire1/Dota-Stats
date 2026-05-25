// Task #378 — Pro replay browser sync job.
//
// Polls OpenDota's /proMatches feed (rolling list of recent pro/league
// matches) every ~6 hours, upserts the headers into `pro_matches`, and then
// drains the queue of rows without picks/bans by calling /matches/:id (with
// the existing OpenDota rate-limit of 1 req/sec). The frontend reads
// straight from the table so the filter UI never hits the upstream API.
//
// Why a separate module: the existing matchPoller is feature-gated dormant
// and is owned by the inhouse poller code path. Coupling pro-match sync
// into it would make both jobs harder to reason about and would tie pro-
// match scheduling to the sheetsStore readiness check, which is unrelated.

const { getOpenDota } = require('./opendota');
const db = require('../db');

// Runtime kill-switch. Re-read the feature flag at the top of every tick
// so an operator flipping `pro_replay_browser` to `off` halts OpenDota
// polling within one interval — no bot restart required. Returns true if
// the flag is fetchable and not in the `off` state; on DB error we keep
// running (don't accidentally kill the job because of a transient query
// failure) but log the issue.
async function _flagAllowsSync() {
  try {
    const flag = await db.getFeatureFlag('pro_replay_browser');
    if (!flag) return true; // seed hasn't landed yet
    return flag.state !== 'off';
  } catch (err) {
    console.warn('[ProMatchSync] flag re-check failed, continuing:', err.message);
    return true;
  }
}

const HEADER_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const DETAILS_BATCH_SIZE = 20; // matches detail-fetched per sweep
const HEADER_PAGES_PER_SYNC = 2; // ~200 matches per header sweep

function _splitPicksBans(raw) {
  const radiantPicks = [];
  const direPicks = [];
  const radiantBans = [];
  const direBans = [];
  for (const pb of raw || []) {
    if (!pb || pb.hero_id == null) continue;
    const team = pb.team === 0 ? 'radiant' : pb.team === 1 ? 'dire' : null;
    const target = pb.is_pick
      ? (team === 'radiant' ? radiantPicks : team === 'dire' ? direPicks : null)
      : (team === 'radiant' ? radiantBans : team === 'dire' ? direBans : null);
    if (!target) continue;
    target.push({ hero_id: pb.hero_id, order: pb.order ?? null });
  }
  return { radiantPicks, direPicks, radiantBans, direBans };
}

function _normalizePlayers(raw) {
  return (raw || []).map((p) => ({
    account_id: p.account_id || null,
    persona: p.personaname || null,
    hero_id: p.hero_id || 0,
    player_slot: p.player_slot ?? null,
    is_radiant: p.player_slot != null ? (p.player_slot < 128) : null,
    lane_role: p.lane_role != null ? Number(p.lane_role) : null,
    kills: p.kills || 0,
    deaths: p.deaths || 0,
    assists: p.assists || 0,
    gpm: p.gold_per_min || 0,
    xpm: p.xp_per_min || 0,
    net_worth: p.net_worth || p.total_gold || 0,
  }));
}

class ProMatchSyncer {
  constructor() {
    this._timer = null;
    this._detailsTimer = null;
    this._running = false;
  }

  start() {
    if (this._timer) return;
    console.log(`[ProMatchSync] Starting — header sweep every ${HEADER_SYNC_INTERVAL_MS / 3600000}h, details every 5m`);
    // Kick off first run shortly after boot so an empty DB seeds within a
    // minute; subsequent runs follow the regular interval.
    setTimeout(() => this.runOnce().catch((e) => console.warn('[ProMatchSync] initial run error:', e.message)), 30_000);
    this._timer = setInterval(() => this.runOnce().catch((e) => console.warn('[ProMatchSync] sweep error:', e.message)), HEADER_SYNC_INTERVAL_MS);
    this._detailsTimer = setInterval(() => this.drainDetails().catch((e) => console.warn('[ProMatchSync] details error:', e.message)), 5 * 60 * 1000);
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._detailsTimer) { clearInterval(this._detailsTimer); this._detailsTimer = null; }
  }

  async runOnce() {
    if (this._running) return;
    if (!(await _flagAllowsSync())) {
      console.log('[ProMatchSync] sweep skipped — pro_replay_browser is off');
      return;
    }
    this._running = true;
    try {
      const opendota = getOpenDota();
      let cursor = null;
      let totalUpserts = 0;
      for (let page = 0; page < HEADER_PAGES_PER_SYNC; page++) {
        const matches = await opendota.getProMatches(cursor);
        if (!matches.length) break;
        for (const m of matches) {
          await db.upsertProMatchHeader({
            match_id: m.match_id,
            league_id: m.leagueid ?? m.league_id ?? null,
            league_name: m.league_name ?? null,
            league_tier: m.league_tier ?? null,
            radiant_team_id: m.radiant_team_id ?? null,
            radiant_team_name: m.radiant_name ?? null,
            dire_team_id: m.dire_team_id ?? null,
            dire_team_name: m.dire_name ?? null,
            radiant_win: typeof m.radiant_win === 'boolean' ? m.radiant_win : null,
            duration: m.duration ?? null,
            start_time: m.start_time ?? null,
          });
          totalUpserts++;
        }
        cursor = matches[matches.length - 1].match_id;
      }
      console.log(`[ProMatchSync] Header sweep done — ${totalUpserts} rows upserted`);
      await this.drainDetails();
    } finally {
      this._running = false;
    }
  }

  async drainDetails() {
    if (!(await _flagAllowsSync())) {
      console.log('[ProMatchSync] details drain skipped — pro_replay_browser is off');
      return;
    }
    const opendota = getOpenDota();
    const pending = await db.listProMatchesAwaitingDetails(DETAILS_BATCH_SIZE);
    if (!pending.length) return;
    let ok = 0; let fail = 0;
    for (const matchId of pending) {
      try {
        const raw = await opendota.getMatchRaw(matchId);
        if (!raw) { fail++; continue; }
        const { radiantPicks, direPicks, radiantBans, direBans } = _splitPicksBans(raw.picks_bans);
        await db.upsertProMatchDetails(matchId, {
          radiant_picks: radiantPicks,
          dire_picks: direPicks,
          radiant_bans: radiantBans,
          dire_bans: direBans,
          players: _normalizePlayers(raw.players),
          patch: raw.patch ?? null,
          has_replay: Boolean(raw.replay_url),
          radiant_win: typeof raw.radiant_win === 'boolean' ? raw.radiant_win : null,
          duration: raw.duration ?? null,
          start_time: raw.start_time ?? null,
        });
        ok++;
      } catch (err) {
        console.warn(`[ProMatchSync] details ${matchId} failed:`, err.message);
        fail++;
      }
    }
    console.log(`[ProMatchSync] Details drain — ${ok} ok, ${fail} fail (queue had ${pending.length})`);
  }
}

let instance = null;
function getProMatchSyncer() {
  if (!instance) instance = new ProMatchSyncer();
  return instance;
}

module.exports = { getProMatchSyncer };
