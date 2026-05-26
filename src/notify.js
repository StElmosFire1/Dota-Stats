// Task #407 — Notification preference centre v2.
//
// Single send-site for every channel-bearing notification. Every caller
// in the codebase (Discord bot, server routes, crons) goes through
// `notify(accountId, eventKey, { discord, push })` so the per-channel
// pref is consulted in exactly one place.
//
// Channel resolution falls back through `db.isEventEnabled`:
//   v2 row (user_notification_prefs)
//     → legacy v1 row (notification_prefs.category, Discord only)
//     → per-event default declared in NOTIFICATION_EVENTS.
//
// Lives in its own module to avoid the circular require between
// `src/discord/bot.js` and `src/web/server.js`. The Discord client and
// web-push library are both lazily required so that:
//   - bot.js can `require('../notify')` without pulling in server.js
//   - a missing VAPID config keeps push as a silent no-op
//
// Unsubscribe tokens are HMAC-signed with SESSION_SECRET, scope-limited
// to a single (event, channel) tuple, and TTL'd to 30 days. They are
// embedded in every web-push payload so the service worker can surface a
// one-tap "Unsubscribe" action.

const crypto = require('crypto');
const db = require('./db');

const _UNSUB_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Fail closed when SESSION_SECRET is missing. Unsubscribe tokens are
// authority — a predictable fallback would let anyone mute arbitrary
// users by guessing account IDs. Throwing here means the helper aborts
// before signing/verifying rather than silently issuing forgeable
// tokens. Production deploys already require SESSION_SECRET for the
// session cookie, so this is the same guarantee, not a new one.
function _unsubSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || typeof s !== 'string' || s.length < 16) {
    throw new Error('SESSION_SECRET must be set (>=16 chars) to sign unsubscribe tokens');
  }
  return s;
}
function _b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function _b64urlDecode(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}
function signUnsubscribeToken({ accountId, eventKey, channel }) {
  const payload = { aid: String(accountId), ev: eventKey, ch: channel, ts: Date.now() };
  const body = _b64url(JSON.stringify(payload));
  let secret;
  try { secret = _unsubSecret(); } catch (_) { return null; }
  const sig = crypto.createHmac('sha256', secret).update(body).digest();
  return `${body}.${_b64url(sig)}`;
}
function verifyUnsubscribeToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.', 2);
  if (!body || !sig) return null;
  let secret;
  try { secret = _unsubSecret(); } catch (_) { return null; }
  const expected = _b64url(crypto.createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(_b64urlDecode(body).toString('utf8')); } catch { return null; }
  if (!payload || !payload.aid || !payload.ev || !payload.ch || !payload.ts) return null;
  if (Date.now() - Number(payload.ts) > _UNSUB_TOKEN_TTL_MS) return null;
  return { accountId: payload.aid, eventKey: payload.ev, channel: payload.ch };
}

// Lazy web-push loader — mirrors src/web/server.js so we don't double the
// VAPID setup. Returns null when web push isn't configured.
let _webpushLib = null;
let _webpushTried = false;
function _getWebPush() {
  if (_webpushTried) return _webpushLib;
  _webpushTried = true;
  try {
    const lib = require('web-push');
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      lib.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@dota-stats.local',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
      _webpushLib = lib;
    }
  } catch (_) { /* no-op */ }
  return _webpushLib;
}

// Lazy discord-bot accessor — avoids the bot.js ↔ notify.js ↔ server.js
// require cycle. If the bot module hasn't booted (CLI tooling, tests),
// this returns null and the Discord branch becomes a no-op.
function _getBot() {
  try { return require('./discord/bot').getDiscordBot(); }
  catch (_) { return null; }
}

// Lazy Expo push fan-out. The actual sender lives in src/web/server.js
// where the Stripe / web-push setup already exists; rather than duplicate
// the HTTP-batching loop we look it up off the started server when one
// is reachable, otherwise we skip Expo cleanly.
let _expoFanOut = null;
function setExpoFanOut(fn) { _expoFanOut = typeof fn === 'function' ? fn : null; }

async function isEventEnabled(accountId, eventKey, channel) {
  try { return await db.isEventEnabled(accountId, eventKey, channel); }
  catch (_) { return false; }
}

async function notify(accountId, eventKey, payload = {}) {
  const out = { discord: { sent: 0, skipped: true }, push: { sent: 0, skipped: true } };
  if (!accountId || !eventKey) return out;

  // ---- Discord branch ----
  if (payload.discord) {
    const allowed = await isEventEnabled(accountId, eventKey, 'discord');
    if (allowed) {
      out.discord.skipped = false;
      try {
        const bot = _getBot();
        const discordId = await db.getDiscordIdByAccountId?.(accountId).catch(() => null);
        if (bot?.client && discordId) {
          const user = await bot.client.users.fetch(discordId).catch(() => null);
          if (user) {
            if (typeof payload.discord === 'function') {
              await payload.discord({ user, bot }).catch((e) => { out.discord.error = e?.message; });
            } else if (payload.discord.embed || payload.discord.embeds || payload.discord.content) {
              const sendArgs = {};
              if (payload.discord.embeds) sendArgs.embeds = payload.discord.embeds;
              else if (payload.discord.embed) sendArgs.embeds = [payload.discord.embed];
              if (payload.discord.content) sendArgs.content = payload.discord.content;
              await user.send(sendArgs).catch((e) => { out.discord.error = e?.message; });
            }
            out.discord.sent = 1;
          }
        }
      } catch (e) { out.discord.error = e?.message; }
    }
  }

  // ---- Push branch (web push + Expo push) ----
  if (payload.push) {
    const allowed = await isEventEnabled(accountId, eventKey, 'push');
    if (allowed) {
      out.push.skipped = false;
      const { title, body, url, data } = payload.push;
      const tok = signUnsubscribeToken({ accountId, eventKey, channel: 'push' });
      // tok is null only when SESSION_SECRET is missing — in that case
      // we still deliver the push but without the unsubscribe action,
      // since the route would reject the forged-looking token anyway.
      const unsubscribeUrl = tok ? ((process.env.SITE_URL || '') + '/unsubscribe?t=' + tok) : null;
      const webpush = _getWebPush();
      if (webpush) {
        try {
          const subs = await db.getPushSubscriptionsForAccount(accountId).catch(() => []);
          const wpPayload = JSON.stringify({
            title, body, url,
            event: eventKey,
            unsubscribeUrl,
            data: { ...(data || {}), event: eventKey, unsubscribeUrl },
          });
          for (const s of (subs || [])) {
            try {
              await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                wpPayload,
              );
              out.push.sent++;
              if (typeof db.touchPushSubscription === 'function') {
                await db.touchPushSubscription(s.endpoint).catch(() => {});
              }
            } catch (err) {
              if (err && (err.statusCode === 404 || err.statusCode === 410)
               && typeof db.removePushSubscriptionByEndpoint === 'function') {
                await db.removePushSubscriptionByEndpoint(s.endpoint).catch(() => {});
              }
            }
          }
        } catch (_) {}
      }
      if (_expoFanOut) {
        try {
          const r = await _expoFanOut(accountId, {
            title, body, url,
            data: { ...(data || {}), event: eventKey, unsubscribeUrl },
          });
          out.push.sent += r?.sent || 0;
        } catch (_) {}
      }
    }
  }

  return out;
}

module.exports = {
  notify,
  isEventEnabled,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  setExpoFanOut,
};
