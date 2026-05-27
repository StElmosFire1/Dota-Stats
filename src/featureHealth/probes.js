// Task #425 — Feature health probe registry.
//
// One entry per major subsystem. Each `run` returns either the literal
// string 'ok', a `{ ok: true, detail? }` object, or `{ ok: false, reason }`.
// Probes MUST be cheap (single SELECT / module-load / connection check) and
// MUST NOT throw — wrap I/O in try/catch and surface the message as reason.
// Adding a new feature is a one-line append to the array below.

const db = require('../db');

function _truthy(v) { return v != null && v !== '' && v !== false; }
async function _tableHasRow(table) {
  const p = db.getPool();
  const r = await p.query(`SELECT 1 FROM ${table} LIMIT 1`);
  return r.rowCount >= 0; // table exists; emptiness is still "ok"
}

const PROBES = [
  {
    key: 'steam_auth',
    label: 'Steam auth (bot login)',
    async run() {
      if (process.env.DISABLE_STEAM === 'true') return { ok: true, detail: 'disabled by env' };
      if (!process.env.STEAM_ACCOUNT_NAME && !process.env.STEAM_USERNAME) {
        return { ok: false, reason: 'no Steam credentials configured' };
      }
      try {
        const { getSteamClient } = require('../steam/steamClient');
        const sc = getSteamClient();
        const connected = !!(sc?.client?.steamID || sc?._loggedOn || sc?.loggedOn);
        return connected ? 'ok' : { ok: false, reason: 'Steam client not connected' };
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'discord_bot',
    label: 'Discord bot connection',
    async run() {
      try {
        const { getDiscordBot } = require('../discord/bot');
        const bot = getDiscordBot();
        const status = bot?.client?.ws?.status;
        // discord.js Status.Ready === 0
        if (status === 0) return { ok: true, detail: `gateway ping ${bot.client.ws.ping}ms` };
        return { ok: false, reason: `gateway status=${status}` };
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'parser_service',
    label: 'Java replay parser',
    async run() {
      try {
        const { getReplayParser } = require('../replay/replayParser');
        const parser = getReplayParser();
        return parser?.parserReady ? 'ok' : { ok: false, reason: 'parser not ready' };
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'opendota_fallback',
    label: 'OpenDota fallback API',
    async run() {
      try {
        const fetch = global.fetch || require('node-fetch');
        const r = await fetch('https://api.opendota.com/api/status', { method: 'GET' });
        if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` };
        return { ok: true, detail: `HTTP ${r.status}` };
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'replay_download',
    label: 'Replay store (download path)',
    async run() {
      const fs = require('fs');
      const path = require('path');
      const dir = process.env.REPLAY_STORE_DIR || path.join(__dirname, '../../replay-store');
      try {
        fs.accessSync(dir, fs.constants.W_OK);
        return { ok: true, detail: dir };
      } catch (e) { return { ok: false, reason: `replay-store dir not writable: ${e.message}` }; }
    },
  },
  {
    key: 'inhouse_lobby_creation',
    label: 'Inhouse lobby table',
    async run() {
      try { await _tableHasRow('inhouse_sessions'); return 'ok'; }
      catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'inhouse_provisioner',
    label: 'Inhouse dedicated-server provisioner',
    async run() {
      try {
        require('../inhouse/serverProvisioner');
        require('../inhouse/autoStartTicker');
        return 'ok';
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'captains_draft',
    label: 'Captains-draft state machine',
    async run() {
      try {
        const p = db.getPool();
        await p.query(`SELECT 1 FROM inhouse_sessions WHERE state IS NOT NULL LIMIT 1`);
        return 'ok';
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'tournaments',
    label: 'Tournaments (create + entry)',
    async run() {
      try {
        const p = db.getPool();
        await p.query(`SELECT COUNT(*)::int AS n FROM tournaments`);
        return 'ok';
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'prize_pool',
    label: 'Prize pool helper',
    async run() {
      try {
        const p = db.getPool();
        await p.query(`SELECT COALESCE(SUM(prize_pool_cents),0)::bigint AS pool FROM season_tiers`);
        return 'ok';
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'coaching_1to1',
    label: 'Coaching (1:1 bookings)',
    async run() {
      try { await _tableHasRow('coaching_bookings'); return 'ok'; }
      catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'coaching_group_sessions',
    label: 'Coaching (group sessions)',
    async run() {
      try { await _tableHasRow('coach_group_sessions'); return 'ok'; }
      catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'coaching_vod_reviews',
    label: 'Coaching (VOD reviews)',
    async run() {
      try { await _tableHasRow('coach_vod_reviews'); return 'ok'; }
      catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'coach_earnings',
    label: 'Coach earnings query',
    async run() {
      try {
        const p = db.getPool();
        await p.query(`SELECT COUNT(*)::int FROM coaches WHERE stripe_account_status = 'active'`);
        return 'ok';
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'stripe_checkout',
    label: 'Stripe Checkout reachable',
    async run() {
      if (!process.env.STRIPE_SECRET_KEY) {
        return { ok: false, reason: 'STRIPE_SECRET_KEY not set' };
      }
      try {
        const Stripe = require('stripe');
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 0, timeout: 5000 });
        const bal = await stripe.balance.retrieve();
        return { ok: true, detail: `livemode=${bal.livemode}` };
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'stripe_webhook',
    label: 'Stripe webhook signing secret',
    async run() {
      return process.env.STRIPE_WEBHOOK_SECRET
        ? 'ok'
        : { ok: false, reason: 'STRIPE_WEBHOOK_SECRET not set' };
    },
  },
  {
    key: 'web_push',
    label: 'Web push (VAPID + table)',
    async run() {
      if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        return { ok: false, reason: 'VAPID keys not configured' };
      }
      try { await _tableHasRow('web_push_subscriptions'); return 'ok'; }
      catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'leaderboard_query',
    label: 'Leaderboard query',
    async run() {
      try {
        const p = db.getPool();
        const r = await p.query(`SELECT COUNT(*)::int AS n FROM ratings`);
        return { ok: true, detail: `${r.rows[0].n} players` };
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'hero_meta',
    label: 'Hero meta queries',
    async run() {
      try {
        const p = db.getPool();
        await p.query(`SELECT hero_id, COUNT(*)::int FROM player_stats WHERE hero_id > 0 GROUP BY hero_id LIMIT 1`);
        return 'ok';
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'replay_viewer',
    label: 'Replay viewer data',
    async run() {
      try {
        const p = db.getPool();
        const r = await p.query(`SELECT COUNT(*)::int AS n FROM matches WHERE replay_file_path IS NOT NULL`);
        return { ok: true, detail: `${r.rows[0].n} stored replays` };
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'public_v1_api',
    label: 'Public /v1 API router',
    async run() {
      try {
        const { createPublicApiRouter } = require('../web/publicApiRouter');
        return typeof createPublicApiRouter === 'function'
          ? 'ok'
          : { ok: false, reason: 'createPublicApiRouter missing' };
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'mobile_api',
    label: 'Mobile API (Expo push tokens)',
    async run() {
      try {
        const p = db.getPool();
        await p.query(`SELECT 1 FROM expo_push_tokens LIMIT 1`);
        return 'ok';
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'season_state',
    label: 'Season state (active season)',
    async run() {
      try {
        const s = await db.getActiveSeason();
        return s
          ? { ok: true, detail: `season "${s.name}" (id=${s.id})` }
          : { ok: false, reason: 'no active season' };
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
  {
    key: 'notification_prefs',
    label: 'Push-notification preference reads',
    async run() {
      try {
        const p = db.getPool();
        await p.query(`SELECT 1 FROM notification_prefs LIMIT 1`);
        return 'ok';
      } catch (e) { return { ok: false, reason: e.message }; }
    },
  },
];

function normalise(result) {
  if (result === 'ok') return { ok: true, reason: null };
  if (result && typeof result === 'object') {
    return {
      ok: Boolean(result.ok),
      reason: result.ok ? (result.detail || null) : (result.reason || 'failed'),
    };
  }
  return { ok: false, reason: 'probe returned no result' };
}

module.exports = { PROBES, normalise };
