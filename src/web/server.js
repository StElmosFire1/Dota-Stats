const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const multer = require('multer');
const session = require('express-session');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const db = require('../db');
// Web push (Wave 3 F7). Loaded lazily — if VAPID env vars are missing the
// push routes respond 503 cleanly. We do require() unconditionally so the
// module is in the bundle, but configure it only when keys exist.
let webpush = null;
try {
  webpush = require('web-push');
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@dota-stats.local',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }
} catch (e) {
  console.warn('[WebPush] module load failed:', e.message);
}
function _webPushReady() {
  return Boolean(webpush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
const { getReplayParser } = require('../replay/replayParser');
const { getStatsService } = require('../stats/statsService');
const { generateChatResponse, generateWeeklyRecapBlurb } = require('../services/groqService');
const { getDiscordBot } = require('../discord/bot');
const voiceEventQueue = require('./voiceEventQueue');

// Pro Tier membership cache (module-scope so the Stripe webhook handler
// in createServer() and the _isProAccount() helper inside createApiRouter()
// share the same Map). Keyed by stringified account_id; entries TTL after 60s.
const _proCache = new Map();

const CHUNK_DIR = '/tmp/replay-chunks';
const UPLOAD_DIR = '/tmp/replay-uploads';
// Replay store: persistent directory where parsed .dem files are kept for download.
// Override via REPLAY_STORE_DIR env var. Defaults to replay-store/ beside the server file.
const REPLAY_STORE_DIR = process.env.REPLAY_STORE_DIR
  || path.join(__dirname, '../../replay-store');
// How many days to keep uploaded replays (0 = keep forever, which is the default).
const REPLAY_STORE_DAYS = parseInt(process.env.REPLAY_STORE_DAYS || '0', 10);
const uploadJobs = new Map();
const STALE_JOB_TTL = 30 * 60 * 1000;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(CHUNK_DIR);
ensureDir(UPLOAD_DIR);
ensureDir(REPLAY_STORE_DIR);

setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of uploadJobs) {
    const age = now - (job.startedAt || 0);
    if (age > STALE_JOB_TTL && (job.status === 'uploading' || job.status === 'assembling')) {
      console.log(`[API] Reaping stale job ${jobId} (status=${job.status}, age=${Math.round(age / 60000)}m)`);
      cleanupChunks(jobId);
      if (job.filePath) cleanupFile(job.filePath);
      uploadJobs.delete(jobId);
    }
  }
}, 5 * 60 * 1000);

// Replay store cleanup: runs every 12 hours, deletes expired files from disk.
setInterval(async () => {
  try {
    const expired = await db.expireOldReplayFiles();
    for (const row of expired) {
      if (row.replay_file_path && fs.existsSync(row.replay_file_path)) {
        try { fs.unlinkSync(row.replay_file_path); } catch (_) {}
        console.log(`[ReplayStore] Deleted expired replay for match ${row.match_id}`);
      }
    }
  } catch (e) {
    console.warn('[ReplayStore] Cleanup error:', e.message);
  }
}, 12 * 60 * 60 * 1000);

function authMiddleware(req, res, next) {
  // Session-based auth: a browser operator who completed /admin/login or /admin/superuser-login
  // carries their privilege in the signed server session — no credential in the header needed.
  if (req.session && (req.session.isAdmin || req.session.isSuperuser)) return next();

  const uploadKey = process.env.UPLOAD_KEY;
  const superuserPassword = process.env.SUPERUSER_PASSWORD;
  if (!uploadKey && !superuserPassword) {
    return res.status(503).json({ error: 'Admin not configured. Set UPLOAD_KEY or SUPERUSER_PASSWORD.' });
  }
  // Header fallback for non-browser clients (bots, scripts, deploy hooks).
  // Accept either header — upload endpoints send 'x-upload-key',
  // while some admin endpoints also accept 'x-superuser-key'.
  const providedKey = req.headers['x-upload-key'] || req.headers['x-superuser-key'];
  const validKey = (uploadKey && providedKey === uploadKey) || (superuserPassword && providedKey === superuserPassword);
  if (!validKey) {
    return res.status(403).json({ error: 'Invalid upload key' });
  }
  next();
}

function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

function cleanupChunks(jobId) {
  try {
    const jobChunkDir = path.join(CHUNK_DIR, jobId);
    if (fs.existsSync(jobChunkDir)) {
      fs.rmSync(jobChunkDir, { recursive: true, force: true });
    }
  } catch {}
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Public-write limiter for unauthenticated POSTs that mutate state. Tighter
// than authLimiter since callers don't need to be signed in. Used on routes
// like /api/join (signup form) to prevent spam / enumeration.
const publicWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this address, please wait and try again.' },
});

function createServer(startupStatus = {}) {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // CORS: same-origin only by default. Set CORS_ALLOWED_ORIGINS as a
  // comma-separated allowlist to permit cross-origin browsers (e.g. a staging
  // dashboard). The previous `app.use(cors())` accepted *any* Origin header,
  // which made CSRF + credential abuse easier; the explicit allowlist closes
  // that gap while preserving the dev workflow.
  const corsOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, cb) => {
      // Same-origin or non-browser callers (no Origin header) — always allow.
      if (!origin) return cb(null, true);
      if (corsOrigins.length === 0) return cb(null, false);
      // Strict allowlist only — wildcard is intentionally NOT supported here.
      // If you ever need to open this up, do it by adding the explicit origin
      // to CORS_ALLOWED_ORIGINS, never with `*`, because `*` combined with
      // `credentials: true` would re-introduce the vulnerability we just
      // closed.
      if (corsOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  }));

  // SECURITY (v5.66): SESSION_SECRET is mandatory in production. Without a
  // strong, secret, env-supplied value the session cookie can be forged by an
  // attacker who knows the default — letting them impersonate any logged-in
  // Steam user. We hard-fail at startup in prod so a missing/short secret
  // can never silently fall back to a known string. In dev we still allow a
  // generated ephemeral secret so local boots work without configuration.
  const inProd = process.env.NODE_ENV === 'production';
  let sessionSecret = process.env.SESSION_SECRET;
  if (inProd) {
    if (!sessionSecret || sessionSecret.length < 32) {
      console.error('[Session] FATAL: SESSION_SECRET is missing or shorter than 32 chars in production. Refusing to start.');
      process.exit(1);
    }
  } else if (!sessionSecret) {
    sessionSecret = require('crypto').randomBytes(48).toString('hex');
    console.warn('[Session] SESSION_SECRET not set — generated a random ephemeral secret for this dev boot. Sessions will not survive a restart.');
  }

  // Session cookie hardening: in production we serve over HTTPS (deploy.sh +
  // PM2 → reverse proxy), so we mark the cookie Secure to prevent it being
  // sent over plain HTTP. Locally (NODE_ENV !== 'production') we keep
  // `secure: false` so dev over plain HTTP still works.
  // sameSite=lax is our primary CSRF defence: it prevents the session cookie
  // from being sent on cross-site POST/PUT/DELETE requests. Combined with
  // strict CORS origin allow-listing above, this blocks the standard CSRF
  // vector without requiring per-request CSRF tokens.
  // Trust the first hop reverse proxy in EVERY environment so req.protocol /
  // req.get('host') reflect what the *browser* connected to (https + canonical
  // domain) — not the bot↔nginx hop which is plain http on localhost.
  // Previously this was gated on NODE_ENV==='production'; if PM2 booted the
  // bot without NODE_ENV set, trust-proxy was OFF and steamBaseUrl() handed
  // Steam an http:// realm while the user's browser was on https://, so
  // OpenID rejected the verify and the visitor landed back signed-out.
  // It is safe in dev too: with no proxy in front, the X-Forwarded-* headers
  // simply aren't set and req.protocol falls back to the connection scheme.
  app.set('trust proxy', 1);
  // Task #151 (v6.26) — Postgres-backed session store.
  //
  // We previously used express-session's in-memory MemoryStore. That made
  // every PM2 restart wipe every signed-in user's session, which was the
  // most likely root cause of the long-running "?auth=success but signed
  // out" regression: between the OpenID redirect and the browser's
  // follow-up `/api/auth/me` request, the bot could restart (post-deploy
  // hook, crash, manual `pm2 restart oi-bot`) and the just-saved session
  // would no longer exist. Moving the store into Postgres also unblocks
  // future cluster-mode rollout — every worker reads/writes the same
  // session row instead of holding its own private cache.
  //
  // The cookie settings, name (`oi.sid`), and secret are all unchanged so
  // existing valid sessions are honoured and new ones are created in the
  // new store transparently.
  //
  // Task #136 still needs a callback-style `store.get(sid, cb)` for the
  // inhouse stale-seat sweep — connect-pg-simple exposes the same
  // express-session Store interface, so `app.locals.sessionStore` keeps
  // working with no autoStartTicker changes required.
  let sessionStore;
  try {
    const PgSession = require('connect-pg-simple')(session);
    sessionStore = new PgSession({
      pool: db.getPool(),
      tableName: 'user_sessions',
      createTableIfMissing: true,
      // Prune expired rows every 15 minutes so the table doesn't bloat
      // forever; connect-pg-simple's default is 60 minutes.
      pruneSessionInterval: 15 * 60,
    });
    sessionStore.on('error', (err) => {
      console.error('[Session] Postgres session store error:', err?.message || err);
    });
    console.log('[Session] Using Postgres-backed session store (table=user_sessions).');
  } catch (err) {
    // Fail loudly but stay up — falling back to MemoryStore preserves the
    // pre-v6.26 behaviour, so a bad DB at boot doesn't lock everyone out
    // of an otherwise-working site. The startup log makes the degraded
    // mode obvious in PM2 output.
    console.error('[Session] FATAL fallback: could not initialise Postgres session store, using MemoryStore. Sessions will NOT survive a restart.', err?.message || err);
    sessionStore = new session.MemoryStore();
  }
  app.locals.sessionStore = sessionStore;
  app.use(session({
    name: 'oi.sid',
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: inProd,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));

  // Steam OpenID authentication
  const fetch = require('node-fetch');
  const STEAM_OPEN_ID = 'https://steamcommunity.com/openid/login';
  const STEAM_ID_REGEX = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;

  // Build the canonical site URL for Steam OpenID. We prefer the live request
  // host so the user is always returned to the same origin they signed in
  // from (e.g. https://oceinhouse.gg). SITE_URL acts as an override for
  // unusual deployment setups. The previous hardcoded IP fallback caused
  // Steam to redirect to the bare host:port, which dropped the user back at
  // a domain Steam never authed against.
  function steamBaseUrl(req) {
    const proto = req.protocol; // honoured via app.set('trust proxy', 1)
    const host = req.get('host');
    const requestUrl = `${proto}://${host}`;
    const env = process.env.SITE_URL && process.env.SITE_URL.trim();
    if (env) {
      const cleaned = env.replace(/\/$/, '');
      // If SITE_URL is set but disagrees with the live request host, log a
      // loud warning and prefer the live request — a stale SITE_URL pointing
      // at the bare server IP was the v5.69 root cause for "sign-in returns
      // me to the site signed-out" because Steam rejects realm/return mismatches.
      try {
        const envHost = new URL(cleaned).host;
        if (envHost && envHost !== host) {
          console.warn(`[Steam Auth] SITE_URL=${cleaned} disagrees with request host ${host}; preferring request host. Unset SITE_URL or align it with the canonical domain.`);
          return requestUrl;
        }
      } catch (_) {
        console.warn(`[Steam Auth] SITE_URL=${cleaned} is not a valid URL; ignoring and using request host ${requestUrl}.`);
        return requestUrl;
      }
      return cleaned;
    }
    return requestUrl;
  }

  app.get('/auth/steam', authLimiter, (req, res) => {
    const baseUrl = steamBaseUrl(req);
    const returnUrl = `${baseUrl}/auth/steam/return`;
    const params = new URLSearchParams({
      'openid.mode': 'checkid_setup',
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.return_to': returnUrl,
      'openid.realm': baseUrl,
    });
    console.log('[Steam Auth] /auth/steam redirect — realm:', baseUrl);
    res.redirect(`${STEAM_OPEN_ID}?${params}`);
  });

  app.get('/auth/steam/return', authLimiter, async (req, res) => {
    try {
      if (req.query['openid.mode'] !== 'id_res') {
        return res.redirect('/?auth=cancelled');
      }
      const claimedId = req.query['openid.claimed_id'] || '';
      if (!STEAM_ID_REGEX.test(claimedId)) {
        return res.redirect('/?auth=invalid');
      }

      // ⚠️  v5.80 — DO NOT rebuild the verify body from `req.query`.
      // Steam OpenID 2.0 `check_authentication` requires the params we POST
      // back to be byte-for-byte identical to what Steam signed. Round-
      // tripping `req.url` → Express qs parser → JS object → URLSearchParams
      // → `.toString()` re-encodes characters differently (e.g. `:` ↔ `%3A`,
      // `+` ↔ `%20`), which silently invalidates the signature and causes
      // Steam to return `is_valid:false`. The user lands at `?auth=invalid`
      // even though their Steam credentials were correct. This was the v5.78
      // mystery — trust-proxy was already fine; the verify body was the
      // actual culprit. Pull the raw query string off req.url and only swap
      // `openid.mode=id_res` for `check_authentication`. Same approach as
      // the canonical `passport-steam` library.
      const rawQuery = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
      const verifyBody = rawQuery.replace(/(^|&)openid\.mode=id_res(&|$)/g, '$1openid.mode=check_authentication$2');
      const verifyRes = await fetch(STEAM_OPEN_ID, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: verifyBody,
      });
      const text = await verifyRes.text();
      const isValid = text.includes('is_valid:true');
      console.log(`[Steam Auth] /auth/steam/return — host=${req.get('host')} proto=${req.protocol} verify=${isValid ? 'OK' : 'INVALID'} cookie-len=${(req.headers.cookie || '').length} body-len=${verifyBody.length}`);
      if (!isValid) {
        // Log the upstream Steam response on a verify failure so the next
        // PM2 line tells you exactly why (e.g. `is_valid:false\nns:...`).
        console.warn('[Steam Auth] Steam check_authentication response:', text.replace(/\s+/g, ' ').slice(0, 300));
        return res.redirect('/?auth=invalid');
      }

      const steamId64 = claimedId.match(STEAM_ID_REGEX)[1];
      const accountId = (BigInt(steamId64) - 76561197960265728n).toString();

      const pool = db.getPool();
      const lookup = await pool.query(
        `SELECT COALESCE(n.nickname, ps.persona_name) as display_name
         FROM player_stats ps
         LEFT JOIN nicknames n ON n.account_id = ps.account_id
         WHERE ps.account_id = $1
         ORDER BY ps.id DESC LIMIT 1`,
        [accountId]
      );

      req.session.steamId64 = steamId64;
      req.session.accountId = accountId;
      req.session.displayName = lookup.rows[0]?.display_name || null;

      // Force the session row to be persisted to the store before we redirect.
      // Without this, the express-session "save on response end" hook can race
      // with the 302 redirect — the browser may follow the redirect and hit
      // /api/auth/me before the new session has actually been written, leaving
      // the user in a "signed in nowhere" state.
      req.session.save((err) => {
        if (err) console.error('[Steam Auth] session.save failed:', err);
        console.log('[Steam Auth] success — accountId:', accountId);
        res.redirect('/?auth=success');
      });
    } catch (err) {
      // SECURITY: log full error server-side, redirect with a generic flag so
      // we never echo upstream Steam OpenID failure details (which can include
      // network/host info) back to the visitor's URL bar.
      //
      // v5.82 — granular diagnostics. Reports of `?auth=error` after the v5.80
      // verify-body fix mean the *post-verify* steps are throwing (DB lookup,
      // session save, BigInt parse, …). The catch was previously a black box;
      // we now log the error name, message, and stack so the very next PM2
      // line says exactly which step failed in prod.
      console.error('[Steam Auth] catch hit — error name:', err?.name, '| message:', err?.message);
      if (err?.code) console.error('[Steam Auth] error code:', err.code);
      if (err?.stack) console.error('[Steam Auth] stack:', err.stack.split('\n').slice(0, 6).join('\n'));
      res.redirect('/?auth=error');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Discord OAuth — one-click "Connect with Discord" flow (task 98).
  //
  // Replaces the manual paste-your-User-ID step from task 89/97. The user
  // clicks a button, we bounce them through Discord's OAuth2 authorize
  // endpoint with the `identify` scope, exchange the returned code for an
  // access token, fetch their Discord user from `/users/@me`, and then run
  // the **same** verifyAndConfirmDiscordId + linkOwnDiscordId path the manual
  // POST /api/me/link-discord uses — so the DM round-trip + 409 already-linked
  // guarantees still apply. The manual route remains as a fallback.
  //
  // Requires DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET. The redirect_uri must
  // be registered in the Discord developer portal as
  // `<SITE_URL>/auth/discord/callback`.
  // ─────────────────────────────────────────────────────────────────────────
  const DISCORD_OAUTH_AUTHORIZE = 'https://discord.com/api/oauth2/authorize';
  const DISCORD_OAUTH_TOKEN = 'https://discord.com/api/oauth2/token';
  const DISCORD_OAUTH_USER = 'https://discord.com/api/users/@me';
  const DISCORD_OAUTH_RETURNS = { home: '/', settings: '/settings/profile' };

  function discordOAuthRedirectUri(req) {
    return `${steamBaseUrl(req)}/auth/discord/callback`;
  }
  function buildDiscordReturnUrl(returnKey, params) {
    const target = DISCORD_OAUTH_RETURNS[returnKey] || DISCORD_OAUTH_RETURNS.home;
    const qs = new URLSearchParams(params).toString();
    return `${target}${target.includes('?') ? '&' : '?'}${qs}`;
  }

  app.get('/auth/discord', authLimiter, (req, res) => {
    if (!req.session?.accountId) {
      return res.redirect('/?auth=required');
    }
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(buildDiscordReturnUrl(req.query.return, {
        discord_link: 'error', reason: 'oauth_disabled',
      }));
    }
    const returnKey = DISCORD_OAUTH_RETURNS[req.query.return] ? req.query.return : 'home';
    const state = crypto.randomBytes(24).toString('hex');
    req.session.discordOAuth = { state, returnKey, createdAt: Date.now() };
    // NB: do NOT set `prompt=none` here — it asks Discord for a *silent*
    // auth, which fails (returning ?error=...) for any user who isn't
    // already logged in to Discord in this browser with consent
    // pre-granted, i.e. the exact first-time visitors this OAuth flow is
    // meant to serve. Omitting `prompt` lets Discord show the login /
    // consent UI when needed and skip it transparently when not.
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'identify guilds.join',
      state,
      redirect_uri: discordOAuthRedirectUri(req),
    });
    res.redirect(`${DISCORD_OAUTH_AUTHORIZE}?${params}`);
  });

  app.get('/auth/discord/callback', authLimiter, async (req, res) => {
    const stash = req.session?.discordOAuth || {};
    const returnKey = DISCORD_OAUTH_RETURNS[stash.returnKey] ? stash.returnKey : 'home';
    // Always clear the stash so a state nonce is single-use.
    if (req.session) req.session.discordOAuth = null;

    const back = (params) => res.redirect(buildDiscordReturnUrl(returnKey, params));

    if (!req.session?.accountId) return back({ discord_link: 'error', reason: 'signed_out' });
    if (req.query.error) {
      return back({ discord_link: 'error', reason: req.query.error === 'access_denied' ? 'cancelled' : 'oauth_error' });
    }
    const code = (req.query.code || '').toString();
    const state = (req.query.state || '').toString();
    if (!code || !state || !stash.state || state !== stash.state) {
      return back({ discord_link: 'error', reason: 'bad_state' });
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return back({ discord_link: 'error', reason: 'oauth_disabled' });
    }

    let accessToken;
    try {
      const tokenRes = await fetch(DISCORD_OAUTH_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: discordOAuthRedirectUri(req),
        }).toString(),
      });
      if (!tokenRes.ok) {
        const body = await tokenRes.text().catch(() => '');
        console.error('[discord-oauth] token exchange failed:', tokenRes.status, body.slice(0, 200));
        return back({ discord_link: 'error', reason: 'token_exchange' });
      }
      const tokenJson = await tokenRes.json();
      accessToken = tokenJson.access_token;
      if (!accessToken) return back({ discord_link: 'error', reason: 'token_exchange' });
    } catch (err) {
      console.error('[discord-oauth] token exchange threw:', err.message);
      return back({ discord_link: 'error', reason: 'token_exchange' });
    }

    let discordUser;
    try {
      const userRes = await fetch(DISCORD_OAUTH_USER, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!userRes.ok) {
        console.error('[discord-oauth] /users/@me failed:', userRes.status);
        return back({ discord_link: 'error', reason: 'user_fetch' });
      }
      discordUser = await userRes.json();
    } catch (err) {
      console.error('[discord-oauth] /users/@me threw:', err.message);
      return back({ discord_link: 'error', reason: 'user_fetch' });
    }

    const discordId = (discordUser?.id || '').toString();
    if (!/^\d{17,19}$/.test(discordId)) {
      return back({ discord_link: 'error', reason: 'bad_id' });
    }

    const accountId = req.session.accountId;

    // Idempotency / collision guard — same rules as POST /api/me/link-discord.
    // Task 102: when the OAuth round-trip was started from /settings/profile
    // (returnKey === 'settings', i.e. the user clicked *Reconnect with
    // Discord*), allow replacing an existing different Discord ID — they
    // explicitly asked to re-link. The home/modal entry point still 409s so
    // a stale first-login modal can never silently overwrite.
    const allowRelink = returnKey === 'settings';
    try {
      const existing = await db.getDiscordIdByAccountId(accountId);
      if (existing && existing !== discordId && !allowRelink) {
        return back({ discord_link: 'error', reason: 'already_linked_other' });
      }
      if (existing === discordId) {
        return back({ discord_link: 'success', already: '1', username: discordUser.username || '' });
      }
      // Task 103 — also refuse if a *different* account already owns this
      // Discord ID. OAuth proves the caller owns the Discord account, but
      // some other Steam account already has it bound — collapsing them is
      // an admin operation, not a self-service one.
      const owners = await db.findAccountIdsByDiscordId(discordId);
      const otherOwner = owners.find((id) => String(id) !== String(accountId));
      if (otherOwner) {
        return back({ discord_link: 'error', reason: 'discord_id_taken' });
      }
    } catch (err) {
      console.error('[discord-oauth] existing-link check failed:', err.message);
      return back({ discord_link: 'error', reason: 'db_error' });
    }

    // Run the same verify-and-DM round-trip the manual flow uses, so a Discord
    // user who has DMs disabled still gets a clear error rather than a silent
    // "linked but bot can never reach you" state.
    let verification;
    try {
      const bot = getDiscordBot();
      verification = await bot.verifyAndConfirmDiscordId(discordId);
    } catch (err) {
      console.error('[discord-oauth] verify threw for account', accountId, ':', err.message);
      return back({ discord_link: 'error', reason: 'verify_unavailable' });
    }
    if (!verification?.ok) {
      return back({ discord_link: 'error', reason: verification?.code || 'verify_failed' });
    }

    try {
      await db.linkOwnDiscordId(accountId, discordId);
    } catch (err) {
      // Task 103 — race path against the partial unique index.
      if (err && err.code === '23505') {
        return back({ discord_link: 'error', reason: 'discord_id_taken' });
      }
      console.error('[discord-oauth] save failed for account', accountId, ':', err.message);
      return back({ discord_link: 'error', reason: 'save_failed' });
    }

    // Task 104 — close the last gap in onboarding: also pull the user into the
    // OCE Inhouse Discord server (if they aren't already in it) and assign the
    // standard league-member role. Requires the `guilds.join` scope on the
    // OAuth grant (set above) plus `DISCORD_GUILD_ID` (and optionally
    // `DISCORD_LEAGUE_MEMBER_ROLE_ID`) configured on the host. Best-effort:
    // any failure here is logged but does NOT fail the link — the Steam ↔
    // Discord binding has already been saved and the DM has already gone out,
    // so the user is in a usable state regardless.
    try {
      const bot = getDiscordBot();
      if (typeof bot.addUserToLeagueGuild === 'function') {
        const joinResult = await bot.addUserToLeagueGuild(discordId, accessToken);
        // Helper returns structured failure objects instead of throwing for
        // non-throwing failure modes (missing config, non-2xx from Discord,
        // etc.) — surface them here so they're visible in the auth log
        // alongside the existing throw-path warning.
        if (joinResult && joinResult.ok === false) {
          console.warn(
            '[discord-oauth] guild add returned non-ok for', discordId,
            ':', joinResult.code, '-', joinResult.error,
          );
          // Task #128 — queue the failure so the next-visit site banner can
          // prompt the player to click *Reconnect with Discord* once an admin
          // fixes the underlying perms / config issue. Skip the input-shape
          // codes that re-linking can't fix on its own.
          const code = joinResult.code || 'unknown';
          const skipQueue = code === 'bad_discord_id' || code === 'no_access_token';
          if (!skipQueue) {
            try {
              await db.recordDiscordAutoJoinFailure(discordId, accountId, code, joinResult.error);
            } catch (qErr) {
              console.warn('[discord-oauth] recordDiscordAutoJoinFailure failed:', qErr.message);
            }
            // Best-effort DM nudge so the player doesn't have to wait until
            // their next site visit to find out the join failed.
            try {
              if (typeof bot.dmDiscordAutoJoinRetryHint === 'function') {
                bot.dmDiscordAutoJoinRetryHint(discordId);
              }
            } catch (_) { /* swallow */ }
          }
        } else if (joinResult && joinResult.ok === true) {
          // Task #128 — successful join (newly added or already a member);
          // clear any pending retry row so the banner stops showing.
          try {
            await db.clearDiscordAutoJoinFailure(discordId, accountId);
          } catch (qErr) {
            console.warn('[discord-oauth] clearDiscordAutoJoinFailure failed:', qErr.message);
          }
        }
      }
    } catch (err) {
      console.warn('[discord-oauth] guild add threw for', discordId, ':', err.message);
      // Task #128 — the helper is meant to never throw, but defend against
      // future regressions: if it does, queue a generic failure so we can
      // still prompt the player to retry on their next visit.
      try {
        await db.recordDiscordAutoJoinFailure(discordId, accountId, 'threw', err.message);
      } catch (_) { /* swallow */ }
    }

    return back({ discord_link: 'success', username: verification.username || discordUser.username || '' });
  });

  // Stripe webhook MUST be registered before express.json() to receive raw body
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!process.env.STRIPE_SECRET_KEY) return res.status(503).send('Stripe not configured');
    // SECURITY: refuse to process unsigned webhook payloads. Without
    // `STRIPE_WEBHOOK_SECRET` an attacker who finds the webhook URL could
    // POST a forged `checkout.session.completed` payload and mark arbitrary
    // tournament entries / season buy-ins as paid. Always require the
    // signature.
    if (!webhookSecret) {
      console.error('[Stripe] Webhook rejected: STRIPE_WEBHOOK_SECRET is not configured.');
      return res.status(503).send('Stripe webhook secret not configured');
    }
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const sig = req.headers['stripe-signature'];
      if (!sig) return res.status(400).send('Missing stripe-signature header');
      const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      // Extracted so both `checkout.session.completed` (sync card payments)
      // and `checkout.session.async_payment_succeeded` (BECS / other async
      // methods enabled by Task #235's automatic_payment_methods swap) run
      // the same fulfillment path. Card payments arrive on
      // `checkout.session.completed` already paid; BECS / Direct Debit lands
      // here with `payment_status === 'unpaid'` first and only flips to
      // 'paid' on a later `checkout.session.async_payment_succeeded`. We
      // MUST NOT fulfil unpaid sessions or we grant entitlements before
      // the funds settle.
      const fulfillCompletedSession = async (session) => {
        const purpose = session.metadata?.purpose;
        if (purpose === 'tournament_entry') {
          // 1.7 — per-tournament Stripe self-signup. v5.92 also stashes the
          // PaymentIntent so the withdraw/refund flow can issue a refund.
          const entry = await db.markTournamentEntryPaid(session.id, session.payment_intent || null);
          if (entry) {
            await db.recomputeTournamentPrizePool(entry.tournament_id).catch(() => {});
            console.log('[Stripe] Confirmed tournament entry', entry.id, 'session', session.id);
          } else {
            console.warn('[Stripe] tournament_entry webhook: no entry for session', session.id);
          }
        } else if (purpose === 'pro_lifetime') {
          // Pro Tier — lifetime unlock. Flip the pending row to active and
          // stash the payment_intent so a later refund can find it.
          const row = await db.confirmProPurchase({
            stripeSessionId: session.id,
            stripePaymentIntent: session.payment_intent || null,
            amountCents: session.amount_total != null ? session.amount_total : null,
            currency: session.currency || null,
          });
          if (row) {
            // Drop the cached membership status so the player sees Pro
            // immediately on their next request (no 60s wait).
            try { _proCache.delete(String(row.account_id)); } catch (_) {}
            console.log('[Stripe] Confirmed Pro purchase', row.id, 'session', session.id, 'account', row.account_id);
          } else {
            console.warn('[Stripe] pro_lifetime webhook: no row for session', session.id);
          }
        } else if (purpose === 'coaching_booking') {
          // Coaching marketplace — primary success path. Bookings are created
          // with stripe_session_id but no payment_intent (Stripe doesn't
          // surface that until the session is paid), so we key off session.id
          // here and stash the PI for the later refund flow + the
          // payment_intent.succeeded fallback.
          const row = await db.markBookingPaidBySession(
            session.id,
            session.payment_intent || null,
            null,
          );
          if (row) {
            console.log('[Stripe] Coaching booking paid (session)', row.id);
            try {
              const bot = getDiscordBot();
              if (bot && typeof bot.notifyCoachingBookingConfirmed === 'function') {
                bot.notifyCoachingBookingConfirmed(row).catch(() => {});
              }
            } catch (_) { /* DM dispatch is best-effort */ }
          } else {
            console.warn('[Stripe] coaching_booking webhook: no booking for session', session.id);
          }
        } else if (purpose === 'verified_badge' || purpose === 'org_sponsorship' || purpose === 'one_off_perk') {
          // Task #157 — Magazine v3 monetization purposes are dispatched to
          // a self-contained handler so the giant webhook switch stays small.
          try {
            const { handleStripeWebhookPurpose } = require('../monetization/magazineV3');
            await handleStripeWebhookPurpose({
              purpose, session, db, magV3: db.magV3,
              log: console,
            });
          } catch (e) {
            console.error('[mag-v3] webhook handler failed:', e.message);
            // Re-throw so Stripe retries on transient DB failures.
            throw e;
          }
        } else if (purpose === 'founders_ring') {
          // v6.63 / Task #207 — fulfil the limited Founders Pass cover ring.
          // Cap is re-checked under transaction; if the cap has been hit
          // between checkout-init and webhook (concurrent buyer race) we
          // log loudly so an operator can refund. Errors propagate so
          // Stripe retries on transient DB failures.
          const cosm = require('../profileCosmetics');
          const ringAccountId = session.metadata?.account_id;
          if (ringAccountId) {
            const cap = parseInt(process.env.FOUNDERS_RING_CAP || '200', 10);
            const result = await db.grantEntitlementWithCap({
              accountId: ringAccountId,
              sku: cosm.FOUNDERS_RING_SKU,
              cap: Number.isFinite(cap) && cap > 0 ? cap : 200,
              grantedBy: 'stripe',
              metadata: {
                stripe_session_id: session.id,
                amount_cents: session.amount_total || null,
                currency: session.currency || 'aud',
              },
            });
            if (!result.ok && result.reason === 'cap_reached') {
              // Task #256 — auto-refund the cap-race loser. The funds have
              // already settled on Stripe's side; we issue a refund against
              // the payment_intent, persist the outcome (success/failure +
              // refund id) so superusers can audit, and DM the buyer via
              // the Discord bot. recordFoundersRingRefund is idempotent on
              // stripe_session_id so a Stripe webhook retry is safe.
              console.error('[Stripe] founders_ring CAP RACE — paid session', session.id, 'for account', ringAccountId, 'rejected: cap reached. Auto-refunding.');
              const refundStripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
              let refundId = null;
              let refundStatus = 'refund_failed';
              let refundError = null;
              try {
                if (!session.payment_intent) {
                  throw new Error('no payment_intent on cap-race session');
                }
                const refund = await refundStripe.refunds.create({
                  payment_intent: session.payment_intent,
                  metadata: {
                    reason: 'founders_ring_cap_race',
                    account_id: String(ringAccountId),
                    stripe_session_id: session.id,
                  },
                });
                refundId = refund?.id || null;
                refundStatus = 'refunded';
                console.log('[Stripe] founders_ring auto-refund OK:', refundId, 'session', session.id);
              } catch (refundErr) {
                refundError = refundErr.message || String(refundErr);
                console.error('[Stripe] founders_ring auto-refund FAILED for session', session.id, '—', refundError);
              }
              // Persist audit row (best-effort: a DB failure here must not
              // block the webhook from acking, but we still log loudly).
              try {
                await db.recordFoundersRingRefund({
                  accountId: ringAccountId,
                  sku: cosm.FOUNDERS_RING_SKU,
                  stripeSessionId: session.id,
                  stripePaymentIntent: session.payment_intent || null,
                  stripeRefundId: refundId,
                  amountCents: session.amount_total || null,
                  currency: session.currency || 'aud',
                  status: refundStatus,
                  errorMessage: refundError,
                });
              } catch (auditErr) {
                console.error('[Stripe] founders_ring refund audit-row insert failed:', auditErr.message);
              }
              // DM the buyer (best-effort — never blocks the webhook ack).
              try {
                const bot = getDiscordBot();
                if (bot && typeof bot.notifyFoundersRingRefund === 'function') {
                  bot.notifyFoundersRingRefund({
                    accountId: ringAccountId,
                    amountCents: session.amount_total || null,
                    currency: session.currency || 'aud',
                    refundId,
                  }).catch(() => {});
                }
              } catch (_) { /* DM dispatch is best-effort */ }
              // If the refund itself failed (Stripe rejected), re-throw so
              // Stripe retries the webhook — the audit row's UNIQUE on
              // stripe_session_id keeps the record idempotent.
              if (refundStatus !== 'refunded') {
                throw new Error(`founders_ring auto-refund failed: ${refundError}`);
              }
            } else {
              console.log('[Stripe] Founders Pass ring granted:', ringAccountId, 'reason=', result.reason);
            }
          }
        } else if (purpose === 'frame_purchase') {
          const frameId = session.metadata?.frame_id;
          const frameAccountId = session.metadata?.account_id;
          if (frameId && frameAccountId) {
            // Errors propagate — no catch — so Stripe retries on transient DB failures.
            await db.confirmFramePurchase(session.id, frameAccountId, frameId);
            console.log('[Stripe] Frame purchase confirmed:', frameId, 'for account', frameAccountId);
          }
        } else if (purpose === 'gift_pro') {
          let gift = await db.confirmGiftCheckout(session.id).catch(() => null);
          // Recovery path: if the gift row was never persisted (DB failure at checkout time),
          // reconstruct from Stripe session metadata so fulfillment is not lost.
          if (!gift && session.metadata?.recipient_account_id) {
            const metaGifter = session.metadata.account_id;
            const metaRecipient = session.metadata.recipient_account_id;
            try {
              await db.createGiftCheckout({ gifterAccountId: metaGifter, recipientAccountId: metaRecipient, giftType: 'pro', stripeSessionId: session.id, amountCents: session.amount_total || 0, currency: session.currency || 'aud' });
              gift = await db.confirmGiftCheckout(session.id).catch(() => null);
            } catch (_) {}
          }
          if (gift) {
            // Check if entitlement was already granted (idempotent — Stripe may retry).
            const giftSessionRef = `gift_${session.id}`;
            const alreadyPro = await db.isProMember(gift.recipient_account_id).catch(() => false);
            if (!alreadyPro) {
              // Fulfil Pro for the recipient — errors propagate so Stripe retries.
              await db.createProCheckout({
                accountId: gift.recipient_account_id,
                stripeSessionId: giftSessionRef,
                planType: 'lifetime',
                amountCents: session.amount_total || gift.amount_cents,
                currency: session.currency || 'aud',
              });
              await db.confirmProPurchase({
                stripeSessionId: giftSessionRef,
                stripePaymentIntent: session.payment_intent || null,
                amountCents: session.amount_total || gift.amount_cents,
                currency: session.currency || 'aud',
              });
            }
            try { _proCache.delete(String(gift.recipient_account_id)); } catch (_) {}
            console.log('[Stripe] Gift Pro confirmed for recipient', gift.recipient_account_id);
            // DM notification is best-effort; failure should NOT block Stripe ACK.
            (async () => {
              try {
                const pool = db.getPool();
                const r = await pool.query(
                  `SELECT COALESCE(n.nickname, ps.persona_name) AS name
                   FROM player_stats ps
                   LEFT JOIN nicknames n ON n.account_id = ps.account_id
                   WHERE ps.account_id = $1 ORDER BY ps.id DESC LIMIT 1`,
                  [gift.gifter_account_id]
                );
                const gifterName = r.rows[0]?.name || null;
                const bot = getDiscordBot();
                if (bot?.notifyGiftReceived) {
                  await bot.notifyGiftReceived({ recipientAccountId: gift.recipient_account_id, gifterName, giftType: 'pro' });
                }
              } catch (dmErr) {
                console.warn('[Stripe] gift_pro DM failed (non-fatal):', dmErr.message);
              }
            })();
          } else {
            console.warn('[Stripe] gift_pro webhook: no gift for session', session.id);
          }
        } else if (purpose === 'gift_season_pass') {
          let gift = await db.confirmGiftCheckout(session.id).catch(() => null);
          // Recovery path: if the gift row was never persisted (DB failure at checkout time),
          // reconstruct from Stripe session metadata so fulfillment is not lost.
          if (!gift && session.metadata?.recipient_account_id) {
            const metaGifter = session.metadata.account_id;
            const metaRecipient = session.metadata.recipient_account_id;
            try {
              await db.createGiftCheckout({ gifterAccountId: metaGifter, recipientAccountId: metaRecipient, giftType: 'season_pass', stripeSessionId: session.id, amountCents: session.amount_total || 0, currency: session.currency || 'aud' });
              gift = await db.confirmGiftCheckout(session.id).catch(() => null);
            } catch (_) {}
          }
          if (gift) {
            const p = db.getPool();
            const seasonMeta = session.metadata?.season_id
              ? await p.query(`SELECT id FROM seasons WHERE id = $1`, [session.metadata.season_id]).then(r => r.rows[0])
              : await p.query(`SELECT id FROM seasons WHERE active = true ORDER BY id DESC LIMIT 1`).then(r => r.rows[0]);
            const seasonNumber = seasonMeta?.id || null;
            // Activate the season pass (idempotent ON CONFLICT DO NOTHING).
            // Returns the newly-created row, or null if already activated.
            const activation = await db.grantSeasonPassActivation({
              accountId: gift.recipient_account_id,
              seasonNumber,
              giftStripeSessionId: session.id,
            });
            // Grant 500 XP bonus only when a new activation row was created.
            // This prevents duplicate XP on Stripe webhook retries because the
            // UNIQUE(account_id, season_number, match_id, source) key allows
            // duplicate NULLs for match_id (PostgreSQL NULL != NULL in indexes).
            if (activation && seasonNumber) {
              await db.grantSeasonPassXpGift({
                recipientAccountId: gift.recipient_account_id,
                seasonId: seasonNumber,
                xpAmount: 500,
                stripeSessionId: session.id,
              });
            }
            console.log('[Stripe] Gift Season Pass activated for', gift.recipient_account_id, 'season', seasonNumber);
            // DM notification is best-effort.
            (async () => {
              try {
                const pool = db.getPool();
                const r = await pool.query(
                  `SELECT COALESCE(n.nickname, ps.persona_name) AS name
                   FROM player_stats ps
                   LEFT JOIN nicknames n ON n.account_id = ps.account_id
                   WHERE ps.account_id = $1 ORDER BY ps.id DESC LIMIT 1`,
                  [gift.gifter_account_id]
                );
                const gifterName = r.rows[0]?.name || null;
                const bot = getDiscordBot();
                if (bot?.notifyGiftReceived) {
                  await bot.notifyGiftReceived({ recipientAccountId: gift.recipient_account_id, gifterName, giftType: 'season_pass' });
                }
              } catch (dmErr) {
                console.warn('[Stripe] gift_season_pass DM failed (non-fatal):', dmErr.message);
              }
            })();
          } else {
            console.warn('[Stripe] gift_season_pass webhook: no gift for session', session.id);
          }
        } else {
          await db.confirmBuyin(session.id);
          console.log('[Stripe] Confirmed buyin for session', session.id);
        }
      };

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const ps = session.payment_status;
        // Card / wallet payments arrive here already 'paid'. Async methods
        // (BECS Direct Debit, etc.) arrive 'unpaid' and we MUST defer
        // fulfillment until `checkout.session.async_payment_succeeded`.
        if (ps === 'paid' || ps === 'no_payment_required') {
          await fulfillCompletedSession(session);
        } else {
          console.log('[Stripe] checkout.session.completed deferred (async settlement)',
            'session=', session.id, 'status=', ps, 'purpose=', session.metadata?.purpose);
        }
      } else if (event.type === 'checkout.session.async_payment_succeeded') {
        // BECS / async method has settled — run the same fulfillment now.
        await fulfillCompletedSession(event.data.object);
      } else if (event.type === 'checkout.session.async_payment_failed') {
        // BECS / async method failed to settle. Free coaching slots so the
        // pending row doesn't block future bookings; other purposes have
        // no pre-fulfillment side effects, so logging is enough.
        const session = event.data.object;
        const purpose = session.metadata?.purpose;
        console.warn('[Stripe] async payment failed', 'session=', session.id, 'purpose=', purpose);
        if (purpose === 'coaching_booking') {
          const cancelled = await db.markBookingCancelledBySession(session.id).catch(() => null);
          if (cancelled) console.log('[Stripe] Coaching booking async payment failed (slot freed)', cancelled.id);
        }
      } else if (event.type === 'charge.refunded') {
        // Refund handler — match by payment_intent so we revoke the right
        // Pro subscription. Non-Pro refunds (tournament entries, buy-ins)
        // fall through silently. Coaching bookings also funnel through here
        // so any Stripe-issued refund (auto or manual) flips the booking row.
        const charge = event.data.object;
        const pi = charge.payment_intent;
        if (pi) {
          const refunded = await db.markProRefunded(pi).catch(() => null);
          if (refunded) {
            try { _proCache.delete(String(refunded.account_id)); } catch (_) {}
            console.log('[Stripe] Refunded Pro subscription', refunded.id, 'account', refunded.account_id);
          }
          const refundedBooking = await db.markBookingRefundedByIntent(pi).catch(() => null);
          if (refundedBooking) {
            console.log('[Stripe] Refunded coaching booking', refundedBooking.id);
          }
        }
      } else if (event.type === 'payment_intent.succeeded') {
        // With manual capture, payment_intent.succeeded only fires AFTER
        // we call paymentIntents.capture() — which our route handlers do
        // synchronously when releasing funds, then mark the row 'completed'
        // themselves. So this branch is the safety net: if Stripe captured
        // but our route crashed before updating the DB, the webhook will
        // promote the row from 'paid' -> 'completed' here. Idempotent.
        const intent = event.data.object;
        if (intent.metadata?.purpose === 'coaching_booking') {
          const row = await db.markBookingCompletedByIntent(intent.id).catch(() => null);
          if (row) console.log('[Stripe] Coaching booking captured (PI safety net)', row.id);
        }
      } else if (event.type === 'account.updated') {
        // Stripe Connect Express KYC completion. We require BOTH
        // `charges_enabled` (we can run a payment intent) AND
        // `payouts_enabled` (Stripe can actually pay the coach out) before
        // promoting the coach to 'active'. With manual capture funds sit
        // in escrow until completion, so charges_enabled alone isn't
        // enough — there's no point taking a booking we can't pay out.
        const acct = event.data.object;
        if (acct.charges_enabled && acct.payouts_enabled) {
          const updated = await db.setCoachKycActive(acct.id).catch(() => null);
          if (updated) {
            console.log('[Stripe] Coach KYC active', updated.account_id, 'stripe_account', acct.id);
          }
        }
      } else if (event.type === 'checkout.session.expired') {
        // Student opened checkout and walked away. Stripe expires the
        // session after the `expires_at` we set on creation (30min for
        // coaching) and fires this event. Without this branch the row
        // would stay 'pending' indefinitely and the slot-conflict check
        // in validateBookingSlot would block all future bookings on that
        // time. We only flip rows that are still 'pending' (idempotent —
        // a session that paid right before expiry is already 'paid' and
        // we don't touch it).
        const session = event.data.object;
        if (session.metadata?.purpose === 'coaching_booking') {
          const cancelled = await db.markBookingCancelledBySession(session.id).catch(() => null);
          if (cancelled) {
            console.log('[Stripe] Coaching booking checkout expired (slot freed)', cancelled.id);
          }
        }
      } else if (event.type === 'payment_intent.canceled') {
        // Backup: payment_intent.cancel is what we call from no-show /
        // dispute-refund / admin-refund routes. Synchronous DB update is
        // already done there; this is the safety-net flip in case the API
        // call returned 200 but the route then crashed before updating.
        const intent = event.data.object;
        if (intent.metadata?.purpose === 'coaching_booking') {
          const refunded = await db.markBookingRefundedByIntent(intent.id).catch(() => null);
          if (refunded) console.log('[Stripe] Coaching booking canceled (PI)', refunded.id);
        }
      }
      res.json({ received: true });
    } catch (err) {
      console.error('[Stripe] Webhook error:', err.message);
      res.status(400).send(`Webhook error: ${err.message}`);
    }
  });

  app.use(express.json());

  // Stash `app` on a module-shared symbol so createApiRouter() can reach it
  // when mounting Magazine v3 routes that need to live at the app level
  // (e.g. the public `/embed/:accountId` widget which must not sit under /api).
  const apiRouter = createApiRouter(startupStatus, app);
  app.use('/api', apiRouter);

  // Magazine v3 nightly worker — review fix. Generates weekly AI reports,
  // expires stale verified badges, and DMs deliveries via the Discord bot.
  // Best-effort: failure to start the worker does not block the server.
  try {
    const { startWeeklyReportWorker } = require('../monetization/magazineV3');
    const bot = startupStatus.botInstance || null;
    startWeeklyReportWorker({
      db, magV3: db.magV3,
      getGroq: () => {
        try { return require('../services/groqService'); } catch { return null; }
      },
      // Round-4 review: gate weekly report on the existing `weekly_recap`
      // notification category — users can disable from notification settings.
      isNotificationEnabled: async (accountId, category) => {
        try { return await db.isNotificationEnabled(accountId, category); }
        catch { return true; }
      },
      // Round-4: email is the spec'd primary channel. Default impl logs
      // to console so behaviour is deterministic on dev hosts; production
      // can wire Resend/Mailgun by replacing this dep.
      sendEmail: async ({ accountId, email, subject, markdown }) => {
        if (process.env.RESEND_API_KEY) {
          try {
            const r = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: process.env.WEEKLY_REPORT_FROM_EMAIL
                       || 'OCE Inhouse <noreply@oceinhouse.gg>',
                to: [email], subject,
                text: markdown,
              }),
            });
            if (!r.ok) throw new Error(`Resend ${r.status}`);
          } catch (e) {
            console.warn('[mag-v3:weekly] resend failed:', e.message);
            throw e;
          }
        } else {
          console.log(`[mag-v3:weekly] (no RESEND_API_KEY) would email account=${accountId} to=${email} subject=${JSON.stringify(subject)}`);
        }
      },
      // Pull the set of currently-Pro account IDs. We treat the
      // `subscriptions` table (existing Pro/Stripe infra) as authoritative;
      // if the helper isn't available on this deployment, return [].
      getProAccountIds: async () => {
        try {
          const r = await db.getPool().query(
            `SELECT DISTINCT account_id FROM subscriptions
              WHERE status = 'active' AND tier = 'pro'`
          );
          return r.rows.map(x => x.account_id);
        } catch { return []; }
      },
      notifyWeeklyReport: async (accountId, contentMd) => {
        if (!bot || typeof bot.sendDmToAccount !== 'function') return;
        try {
          await bot.sendDmToAccount(accountId, {
            content: `Your weekly report is ready:\n\n${contentMd.slice(0, 1800)}`,
          });
        } catch { /* best-effort */ }
      },
    });
    console.log('[mag-v3] weekly report worker started');
  } catch (err) {
    console.warn('[mag-v3] weekly worker failed to start:', err.message);
  }

  // Convert any middleware errors (body-parser etc) to JSON instead of HTML
  app.use((err, req, res, next) => {
    console.error('[Server] Middleware error:', err.message, 'on', req.method, req.path);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });


  let minimapCache = null;
  const MINIMAP_URLS = [
    'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/minimap/minimap.png',
    'https://cdn.akamai.steamstatic.com/apps/dota2/images/dota_react/minimap/minimap.png',
    'https://www.opendota.com/public/images/map/minimap.png',
  ];
  app.get('/minimap.png', async (req, res) => {
    try {
      if (minimapCache) {
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(minimapCache);
      }
      const fetch = require('node-fetch');
      let buf = null;
      for (const url of MINIMAP_URLS) {
        try {
          const r = await fetch(url, { timeout: 8000 });
          if (!r.ok) continue;
          const b = await r.buffer();
          // verify PNG magic bytes
          if (b.length > 4 && b[0] === 0x89 && b[1] === 0x50) { buf = b; break; }
        } catch (_) { /* try next */ }
      }
      if (!buf) throw new Error('All minimap sources failed');
      minimapCache = buf;
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch (err) {
      console.warn('[Server] Minimap proxy failed:', err.message);
      res.status(404).send('Minimap unavailable');
    }
  });

  // ── Standalone AI Scouting Report page ────────────────────────────────────
  // Public-read: renders cached report as a print-friendly standalone HTML page.
  // If no cached report exists, shows a 404 prompting the viewer to generate one.
  app.get('/scouting/:accountId', async (req, res) => {
    const accountId = req.params.accountId;
    if (!/^\d+$/.test(accountId)) {
      return res.status(400).send('<h1>Invalid account ID</h1>');
    }
    let report = null;
    try {
      report = await db.getCachedScoutingReport(accountId);
    } catch (err) {
      console.warn('[Scouting] Cache read failed for', accountId, ':', err.message);
    }

    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const siteUrl = process.env.SITE_URL || '';

    if (!report) {
      return res.status(404).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>AI Scouting Report</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:40px;max-width:480px;text-align:center}
  h1{color:#06b6d4;margin-bottom:12px}p{color:#94a3b8;line-height:1.6}
  a{color:#06b6d4;text-decoration:none}
</style></head><body>
<div class="card">
  <h1>🔍 AI Scouting Report</h1>
  <p>No cached report found for this player. A Pro member needs to generate the report first from the player&apos;s profile page.</p>
  <p><a href="${esc(siteUrl)}/player/${esc(accountId)}">View player profile &rarr;</a></p>
</div></body></html>`);
    }

    const listItems = (arr) => (Array.isArray(arr) ? arr : []).map(s => `<li>${esc(s)}</li>`).join('');
    const tags = (arr) => (Array.isArray(arr) ? arr : []).map(s => `<span class="tag">${esc(s)}</span>`).join('');
    const genDate = report.generated_at ? new Date(report.generated_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : '';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>AI Scouting Report &mdash; ${esc(report.player_name)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:title" content="AI Scouting Report &mdash; ${esc(report.player_name)}">
<meta property="og:description" content="${esc(report.summary)}">
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:20px}
  .page{max-width:780px;margin:0 auto}
  header{text-align:center;margin-bottom:32px}
  header h1{font-size:26px;font-weight:800;color:#06b6d4;margin:0 0 4px}
  header .sub{color:#64748b;font-size:13px}
  .summary-box{background:linear-gradient(135deg,rgba(6,182,212,0.12),rgba(30,41,59,0.8));border:1px solid rgba(6,182,212,0.35);border-radius:12px;padding:18px 22px;margin-bottom:20px}
  .summary-box .label{font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#06b6d4;margin-bottom:6px}
  .summary-box .text{font-size:17px;font-weight:700;color:#e2e8f0;line-height:1.5}
  .overview{font-size:14px;color:#cbd5e1;line-height:1.7;margin-bottom:20px;padding:14px 18px;background:#1e293b;border-radius:10px;border:1px solid #334155}
  .stats-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
  .stat{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:12px 16px;text-align:center;flex:1;min-width:90px}
  .stat .val{font-size:22px;font-weight:800}
  .stat .lbl{font-size:11px;color:#64748b;margin-top:2px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px}
  @media(max-width:520px){.grid{grid-template-columns:1fr}}
  .section{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 18px}
  .section-title{font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px}
  .green{color:#22c55e;border-color:rgba(34,197,94,.25);background:rgba(34,197,94,.05)}
  .orange{color:#fb923c;border-color:rgba(251,146,60,.25);background:rgba(251,146,60,.05)}
  .red{color:#ef4444;border-color:rgba(239,68,68,.25);background:rgba(239,68,68,.05)}
  .purple{color:#a855f7;border-color:rgba(168,85,247,.25);background:rgba(168,85,247,.05)}
  .cyan{color:#06b6d4;border-color:rgba(6,182,212,.25);background:rgba(6,182,212,.05)}
  ul{margin:0;padding-left:18px}li{font-size:13px;color:#e2e8f0;margin-bottom:4px;line-height:1.5}
  .tags{display:flex;flex-wrap:wrap;gap:6px}
  .tag{font-size:12px;padding:3px 10px;border-radius:6px;background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.25)}
  .footer{text-align:center;margin-top:32px;color:#475569;font-size:12px}
  .footer a{color:#06b6d4;text-decoration:none}
  @media print{body{background:#fff;color:#000}.page{max-width:100%}.summary-box,.section,.overview{border-color:#ccc}.footer{display:none}}
</style></head><body>
<div class="page">
  <header>
    <h1>&#128269; AI Scouting Report</h1>
    <div class="sub">
      ${esc(report.player_name)}
      ${genDate ? ` &middot; Generated ${genDate}` : ''}
      &middot; <a href="${esc(siteUrl)}/player/${esc(accountId)}">View Profile &rarr;</a>
    </div>
  </header>

  ${report.summary ? `<div class="summary-box"><div class="label">Summary</div><div class="text">${esc(report.summary)}</div></div>` : ''}

  ${report.overview ? `<div class="overview">${esc(report.overview)}</div>` : ''}

  ${report.stats ? `<div class="stats-row">
    <div class="stat"><div class="val" style="color:#4ade80">${esc(report.stats.wins)}W</div><div class="lbl">Wins</div></div>
    <div class="stat"><div class="val" style="color:#f87171">${esc(report.stats.losses)}L</div><div class="lbl">Losses</div></div>
    <div class="stat"><div class="val">${esc(report.stats.avg_kills)}/${esc(report.stats.avg_deaths)}/${esc(report.stats.avg_assists)}</div><div class="lbl">KDA</div></div>
    ${report.strongest_position ? `<div class="stat"><div class="val" style="font-size:14px">${esc(report.strongest_position)}</div><div class="lbl">Best Position</div></div>` : ''}
  </div>` : ''}

  <div class="grid">
    ${report.strengths?.length ? `<div class="section green"><div class="section-title">&#10003; Strengths</div><ul>${listItems(report.strengths)}</ul></div>` : ''}
    ${report.improvements?.length ? `<div class="section orange"><div class="section-title">&#8593; Areas to Improve</div><ul>${listItems(report.improvements)}</ul></div>` : ''}
    ${report.hero_pool?.length ? `<div class="section cyan"><div class="section-title">&#127918; Hero Pool</div><ul>${listItems(report.hero_pool)}</ul></div>` : ''}
    ${report.counters?.length ? `<div class="section red"><div class="section-title">&#9876; Counter Picks</div><div class="tags">${tags(report.counters)}</div></div>` : ''}
  </div>

  ${report.draft_recommendation ? `<div class="section purple" style="margin-bottom:20px"><div class="section-title">Draft Recommendation</div><p style="margin:0;font-size:13px;color:#e2e8f0;line-height:1.6">${esc(report.draft_recommendation)}</p></div>` : ''}

  <div class="footer">
    <span>Generated by Inhouse Stats &middot; AI-powered scouting &middot; <a href="${esc(siteUrl)}">inhouse.gg</a></span>
  </div>
</div>
</body></html>`);
  });

  // v6.64 / Task #208 — Vanity slug redirect. Server-side 302 from
  // `/p/<slug>` to `/player/<account_id>` so the short URL works even
  // before the SPA boots, and so search engines / unfurlers see the real
  // canonical profile target. Mounted BEFORE the SPA catch-all below so
  // it wins over the index.html fallback. Falls through to the SPA on
  // unknown slugs so the React 404 page can take over.
  //
  // Task #221 — When a known social-media unfurler / crawler hits this
  // route (Discordbot, Twitterbot, Slackbot, facebookexternalhit, etc.),
  // serve a tiny HTML response with Open Graph + Twitter card meta tags
  // so the link unfurls into a real card instead of bare text. Real
  // browsers continue to get the fast 302 redirect to the canonical
  // profile URL.
  app.get('/p/:slug', async (req, res, next) => {
    try {
      const db = require('../db');
      const slug = req.params.slug || '';
      if (!db.isWellFormedVanitySlug(slug)) {
        return _sendVanityNotFound(res, slug);
      }
      const accountId = await db.getAccountIdByVanitySlug(slug);
      if (!accountId) return _sendVanityNotFound(res, slug);
      res.set('Cache-Control', 'no-store');

      const ua = String(req.get('user-agent') || '');
      if (_isSocialUnfurler(ua)) {
        return _sendVanityOgCard(req, res, db, slug, accountId);
      }
      return res.redirect(302, `/player/${encodeURIComponent(accountId)}`);
    } catch (err) {
      console.error('[vanity-slug] redirect error:', err.message);
      return _sendVanityNotFound(res, req.params.slug || '');
    }
  });

  // Task #221 — User-agent sniff for the well-known social-media unfurler
  // bots. We deliberately keep this list narrow (matched as a substring of
  // the UA, case-insensitive) so a real Chrome/Safari/Firefox visit always
  // takes the fast 302 path. The OG-card response is only for crawlers.
  function _isSocialUnfurler(ua) {
    if (!ua) return false;
    const u = ua.toLowerCase();
    return (
      u.includes('discordbot') ||
      u.includes('twitterbot') ||
      u.includes('slackbot') ||
      u.includes('facebookexternalhit') ||
      u.includes('linkedinbot') ||
      u.includes('telegrambot') ||
      u.includes('whatsapp') ||
      u.includes('redditbot') ||
      u.includes('skypeuripreview') ||
      u.includes('embedly') ||
      u.includes('iframely') ||
      u.includes('googlebot')
    );
  }

  function _escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Task #241 — Pick the hero we want to show on the OG card. Preference
  // order: pinned hero (player picked it themselves on /settings/profile),
  // then their most-played hero from player_stats. Returns
  // { heroId, heroName, heroDisplayName } or nulls when nothing is known.
  async function _resolveOgProfileHero(db, accountId) {
    let heroId = null;
    let heroName = null;
    try {
      const cust = await db.getPlayerProfileCustomization(accountId).catch(() => null);
      if (cust && cust.pinned_hero_id) heroId = parseInt(cust.pinned_hero_id, 10) || null;
    } catch (_) { /* ignore */ }
    if (!heroId) {
      try {
        const pool = db.getPool && db.getPool();
        if (pool) {
          const r = await pool.query(
            `SELECT hero_id, MAX(hero_name) AS hero_name, COUNT(*)::int AS games
               FROM player_stats
              WHERE account_id = $1 AND hero_id > 0
              GROUP BY hero_id
              ORDER BY games DESC
              LIMIT 1`,
            [accountId]
          );
          if (r.rows[0]) {
            heroId = parseInt(r.rows[0].hero_id, 10) || null;
            heroName = r.rows[0].hero_name || null;
          }
        }
      } catch (_) { /* ignore */ }
    }
    if (heroId && !heroName) {
      try {
        const pool = db.getPool && db.getPool();
        if (pool) {
          const r = await pool.query(
            `SELECT hero_name FROM player_stats
              WHERE hero_id = $1 AND hero_name IS NOT NULL
              LIMIT 1`,
            [heroId]
          );
          heroName = r.rows[0]?.hero_name || null;
        }
      } catch (_) { /* ignore */ }
    }
    let heroDisplayName = null;
    if (heroName && typeof heroName === 'string') {
      heroDisplayName = heroName.replace('npc_dota_hero_', '').replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    }
    return { heroId, heroName, heroDisplayName };
  }

  // Task #241 — Generated 1200×630 OG card endpoint. Crawlers fetch this
  // when they unfurl `/p/<slug>`; we render the player's pinned/most-played
  // hero portrait with name + MMR + W/L overlay. Falls back to the static
  // OA logo when canvas is unavailable or generation fails.
  app.get('/og/profile/:slug.png', async (req, res) => {
    try {
      const db = require('../db');
      const slug = req.params.slug || '';
      if (!db.isWellFormedVanitySlug(slug)) {
        return res.redirect(302, '/oa-logo.png');
      }
      const accountId = await db.getAccountIdByVanitySlug(slug);
      if (!accountId) return res.redirect(302, '/oa-logo.png');

      const [nick, rating, hero] = await Promise.all([
        db.getNickname(accountId).catch(() => null),
        db.getPlayerRating(accountId).catch(() => null),
        _resolveOgProfileHero(db, accountId),
      ]);
      const displayName = nick || rating?.display_name || `Player ${accountId}`;
      const wins = parseInt(rating?.wins) || 0;
      const losses = parseInt(rating?.losses) || 0;
      const mmr = rating ? parseInt(rating.mmr) : NaN;
      let tierName = null;
      try {
        const { getMmrTier } = require('../config');
        if (Number.isFinite(mmr) && typeof getMmrTier === 'function') {
          const tier = getMmrTier(mmr);
          if (tier && tier.name) tierName = tier.name;
        }
      } catch (_) { /* tier lookup optional */ }

      const { generateProfileOgCard } = require('../services/profileOgCard');
      const buf = await generateProfileOgCard({
        displayName,
        mmr: Number.isFinite(mmr) ? mmr : null,
        wins,
        losses,
        tierName,
        heroId: hero.heroId,
        heroName: hero.heroName,
        heroDisplayName: hero.heroDisplayName,
      });
      if (!buf) return res.redirect(302, '/oa-logo.png');
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=600');
      return res.send(buf);
    } catch (err) {
      console.warn('[vanity-slug] OG card render failed:', err.message);
      return res.redirect(302, '/oa-logo.png');
    }
  });

  async function _sendVanityOgCard(req, res, db, slug, accountId) {
    let displayName = `Player ${accountId}`;
    let descriptionParts = [];
    let hasHero = false;
    try {
      const [nick, rating, hero] = await Promise.all([
        db.getNickname(accountId).catch(() => null),
        db.getPlayerRating(accountId).catch(() => null),
        _resolveOgProfileHero(db, accountId).catch(() => ({ heroId: null })),
      ]);
      displayName = nick || rating?.display_name || displayName;
      hasHero = !!(hero && hero.heroId);
      if (rating) {
        const wins = parseInt(rating.wins) || 0;
        const losses = parseInt(rating.losses) || 0;
        const total = wins + losses;
        const wr = total > 0 ? Math.round((wins / total) * 100) : null;
        const mmr = parseInt(rating.mmr);
        if (Number.isFinite(mmr)) descriptionParts.push(`${mmr} MMR`);
        if (total > 0) descriptionParts.push(`${wins}W ${losses}L`);
        if (wr != null) descriptionParts.push(`${wr}% win rate`);
      }
      if (hasHero && hero.heroDisplayName) {
        descriptionParts.push(`Signature: ${hero.heroDisplayName}`);
      }
    } catch (err) {
      console.warn('[vanity-slug] OG meta fetch failed:', err.message);
    }
    const description = descriptionParts.length
      ? descriptionParts.join(' · ')
      : 'View this player\'s profile on OCE Inhouse.';
    const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
    const host = req.get('host') || 'oceinhouse.gg';
    const origin = `${proto}://${host}`;
    const canonical = `${origin}/p/${encodeURIComponent(slug)}`;
    const profileUrl = `${origin}/player/${encodeURIComponent(accountId)}`;
    // Task #241 — point unfurlers at the per-player generated card. The
    // endpoint itself falls back to /oa-logo.png if rendering fails, so
    // crawlers always get a real image even on the error path.
    const imageUrl = `${origin}/og/profile/${encodeURIComponent(slug)}.png`;
    const twitterCard = 'summary_large_image';

    const title = `${displayName} · OCE Inhouse`;
    const eTitle = _escapeHtml(title);
    const eDesc = _escapeHtml(description);
    const eCanonical = _escapeHtml(canonical);
    const eImage = _escapeHtml(imageUrl);
    const eProfile = _escapeHtml(profileUrl);
    const eName = _escapeHtml(displayName);

    res.status(200).set('Cache-Control', 'public, max-age=300').type('html').send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<title>${eTitle}</title>` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="description" content="${eDesc}">` +
      `<link rel="canonical" href="${eCanonical}">` +
      `<meta property="og:type" content="profile">` +
      `<meta property="og:site_name" content="OCE Inhouse">` +
      `<meta property="og:title" content="${eTitle}">` +
      `<meta property="og:description" content="${eDesc}">` +
      `<meta property="og:url" content="${eCanonical}">` +
      `<meta property="og:image" content="${eImage}">` +
      `<meta property="og:image:width" content="1200">` +
      `<meta property="og:image:height" content="630">` +
      `<meta property="og:image:alt" content="${eName} — OCE Inhouse profile card">` +
      `<meta property="profile:username" content="${_escapeHtml(slug)}">` +
      `<meta name="twitter:card" content="${twitterCard}">` +
      `<meta name="twitter:title" content="${eTitle}">` +
      `<meta name="twitter:description" content="${eDesc}">` +
      `<meta name="twitter:image" content="${eImage}">` +
      `<meta name="twitter:image:alt" content="${eName} — OCE Inhouse profile card">` +
      `<meta http-equiv="refresh" content="0; url=${eProfile}">` +
      `</head><body><p><a href="${eProfile}">${eName} on OCE Inhouse</a></p></body></html>`
    );
  }

  // Tiny self-contained 404 page so unknown vanity slugs return a real
  // HTTP 404 (not the SPA shell at 200, which would mislead crawlers and
  // unfurlers and bypass the requirement that unknown slugs return clean
  // 404 semantics).
  function _sendVanityNotFound(res, slug) {
    const safeSlug = String(slug).replace(/[<>&"']/g, '');
    res.status(404).set('Cache-Control', 'no-store').type('html').send(
      `<!doctype html><html><head><meta charset="utf-8">` +
      `<title>Vanity link not found · OCE Inhouse</title>` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<style>body{font-family:Inter,system-ui,sans-serif;background:#0d1424;color:#f5efe2;` +
      `display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}` +
      `h1{font-family:'Playfair Display',serif;color:#c5a975;margin:0 0 12px}` +
      `a{color:#f59e0b;text-decoration:none;font-weight:600}</style></head>` +
      `<body><div><h1>Link not found</h1>` +
      `<p>No player has claimed <code>/p/${safeSlug}</code>.</p>` +
      `<p><a href="/">← Back to OCE Inhouse</a></p></div></body></html>`
    );
  }

  const staticPath = path.join(__dirname, '../../web/dist');
  if (fs.existsSync(staticPath)) {
    app.use(express.static(staticPath));
    app.get('/{*splat}', (req, res) => {
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  }

  return app;
}

function createApiRouter(startupStatus = {}, _app = null) {
  const router = express.Router();

  router.get('/health', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let dbOk = false;
    try {
      const db = require('../db');
      await db.getPool().query('SELECT 1');
      dbOk = true;
    } catch {}

    const replayParser = getReplayParser();
    const parserOk = replayParser?.parserReady === true;

    res.json({
      ok: startupStatus.discord && dbOk,
      uptime: startupStatus.startedAt
        ? Math.round((Date.now() - new Date(startupStatus.startedAt).getTime()) / 1000)
        : null,
      startedAt: startupStatus.startedAt || null,
      services: {
        discord:      { ok: !!startupStatus.discord,      label: 'Discord Bot' },
        database:     { ok: dbOk,                         label: 'Database' },
        steam:        { ok: !!startupStatus.steam,        label: 'Steam' },
        replayParser: { ok: parserOk,                     label: 'Replay Parser' },
      },
      dormant: {
        sheets:      'Google Sheets sync',
        matchPoller: 'OpenDota match poller',
        lobby:       'Steam lobby / friend monitor',
      },
    });
  });

  router.get('/auth/me', async (req, res) => {
    if (req.session && req.session.accountId) {
      // First-login Discord onboarding (task 89): tell the frontend whether
      // we still need to prompt this user for their Discord User ID. We check
      // nicknames.discord_id directly so a user who joined via the public
      // Join-the-League form (which already populates discord_id) is never
      // bothered by the modal.
      let discordId = null;
      try {
        discordId = await db.getDiscordIdByAccountId(req.session.accountId);
      } catch (err) {
        console.warn('[auth/me] discord-link check failed:', err.message);
      }
      // Task #136 — surface live guild-membership state so the inhouse page
      // can render the tri-state gate (signed-out → no Discord link → not in
      // guild → ready to join). null means "unknown" (bot not ready / guild
      // not configured) and the UI should treat that as "allow" rather than
      // locking everyone out on a bot-side outage.
      let discordInGuild = null;
      let guildConfigured = false;
      if (discordId) {
        try {
          const bot = getDiscordBot();
          const r = await bot.isInLeagueGuild(discordId);
          discordInGuild = r.inGuild;
          guildConfigured = !!r.configured;
        } catch (err) {
          console.warn('[auth/me] guild-membership check failed:', err.message);
        }
      } else {
        guildConfigured = !!process.env.DISCORD_GUILD_ID;
      }
      // Task #139 — inline the Discord auto-join "pending retry" boolean here
      // so the site-wide DiscordRetryBanner doesn't have to fire its own
      // round-trip on every page load. For the ~99% of users with no pending
      // failure this is a single indexed PK lookup that returns null. We only
      // expose the boolean (the banner doesn't render any of the detail
      // fields the standalone endpoint returned), and we fail soft so a
      // flaky DB read on this side-channel can't blank out /api/auth/me.
      let discordAutojoinPending = false;
      try {
        const row = await db.getDiscordAutoJoinFailureForAccount(req.session.accountId);
        discordAutojoinPending = !!row;
      } catch (err) {
        console.warn('[auth/me] discord-autojoin-pending check failed:', err.message);
      }
      res.json({
        accountId: req.session.accountId,
        steamId64: req.session.steamId64,
        displayName: req.session.displayName || null,
        discord_id: discordId || null,
        needs_discord_link: !discordId,
        discord_in_guild: discordInGuild,
        discord_guild_configured: guildConfigured,
        discord_invite_url: config.discord.serverInvite || null,
        discord_oauth_enabled: Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
        discord_autojoin_pending: discordAutojoinPending,
      });
    } else {
      res.json(null);
    }
  });

  // Task #151 (v6.26) — POST /api/auth/diagnose
  //
  // Fired by the frontend when it detects ?auth=success in the URL but
  // /api/auth/me returned null — i.e. the OpenID round-trip claimed
  // success on the server but the browser is still signed-out. We log
  // every signal that distinguishes the four known causes so prod logs
  // can pin down which one is firing without asking the user to copy
  // headers out of devtools:
  //   1. host    — apex vs www drift between sign-in and follow-up
  //   2. cookie  — cookie present at all? right name? length?
  //   3. session — does the cookie's sid resolve to a session row?
  //   4. proto   — was the follow-up over https (cookie won't ride http)?
  //
  // The endpoint is unauthenticated by design (the whole point is that
  // there is no valid session) but is rate-limited via authLimiter so it
  // can't be used to spam logs. It always returns 204 — the client
  // doesn't need a body, just acknowledgement.
  router.post('/auth/diagnose', authLimiter, async (req, res) => {
    try {
      const cookieHeader = req.headers.cookie || '';
      const hasOiSid = /(^|; *)oi\.sid=/.test(cookieHeader);
      const cookieLen = cookieHeader.length;
      const sid = req.sessionID || null;
      let sessionExists = null;
      if (sid && req.app.locals.sessionStore && typeof req.app.locals.sessionStore.get === 'function') {
        sessionExists = await new Promise((resolve) => {
          try {
            req.app.locals.sessionStore.get(sid, (err, sess) => {
              if (err) return resolve(`error:${err.message || err}`);
              resolve(Boolean(sess));
            });
          } catch (e) {
            resolve(`throw:${e.message || e}`);
          }
        });
      }
      const sessionAccountId = req.session?.accountId || null;
      console.warn(
        `[Steam Auth] /auth/diagnose — host=${req.get('host')} proto=${req.protocol} ` +
        `cookie-len=${cookieLen} has-oi.sid=${hasOiSid} sid=${sid ? sid.slice(0, 8) + '…' : 'none'} ` +
        `session-exists=${sessionExists} session-accountId=${sessionAccountId} ` +
        `referer=${(req.get('referer') || '').slice(0, 120)} ua=${(req.get('user-agent') || '').slice(0, 80)}`
      );
    } catch (err) {
      console.error('[Steam Auth] /auth/diagnose log failed:', err?.message || err);
    }
    res.status(204).end();
  });

  // POST /api/me/link-discord — first-login Discord ID onboarding (task 89).
  // Signed-in only. Accepts a 17–19 digit Discord snowflake and writes it
  // into nicknames.discord_id for the caller's account.
  //
  // Task 97: before saving, ask the bot to verify the ID actually points at
  // a real Discord user AND that we can DM them — by fetching the user via
  // the Discord REST API and sending a confirmation DM. If either step fails
  // we return a specific 400 and do NOT persist anything, so a typo or a
  // someone-else's-ID never silently breaks future bot DMs.
  router.post('/me/link-discord', async (req, res) => {
    const accountId = req.session?.accountId;
    if (!accountId) return res.status(401).json({ error: 'Sign in with Steam first.' });
    const raw = (req.body?.discord_id || '').toString().trim();
    if (!/^\d{17,19}$/.test(raw)) {
      return res.status(400).json({ error: 'That doesn\'t look like a Discord User ID. It should be 17–19 digits.' });
    }

    // Don't let the same player re-bind to a different Discord ID via this
    // self-service path — the modal only fires for users with no link yet,
    // but be defensive. Fail closed if the precheck itself errors so we
    // can never accidentally overwrite an existing link on a flaky DB read.
    try {
      const existing = await db.getDiscordIdByAccountId(accountId);
      if (existing && existing !== raw) {
        return res.status(409).json({ error: 'Your account is already linked to a different Discord ID. Update it from Settings → Profile.' });
      }
      if (existing === raw) {
        return res.json({ ok: true, discord_id: existing, alreadyLinked: true });
      }
      // Task 103 — refuse if a *different* account already owns this Discord
      // ID. Without this check, two Steam accounts could both bind to the
      // same discord_id and let an attacker who knows a victim's ID hijack
      // DM-driven flows (MVP voting, post-match rating).
      const owners = await db.findAccountIdsByDiscordId(raw);
      const otherOwner = owners.find((id) => String(id) !== String(accountId));
      if (otherOwner) {
        return res.status(409).json({
          error: 'That Discord ID is already linked to another player. If this is your account, ask an admin to help reconcile it.',
          code: 'discord_id_taken',
        });
      }
    } catch (err) {
      console.error('[me/link-discord] existing-link check failed:', err.message);
      return res.status(503).json({ error: 'Could not check your existing link right now. Try again in a moment.' });
    }

    let verification;
    try {
      const bot = getDiscordBot();
      verification = await bot.verifyAndConfirmDiscordId(raw);
    } catch (err) {
      console.error('[me/link-discord] verify threw for account', accountId, ':', err.message);
      return res.status(503).json({ error: 'Discord verification is unavailable right now. Try again in a moment.' });
    }

    if (!verification?.ok) {
      // 503 for transient bot/Discord failures (the UI can suggest a retry);
      // 400 only for definitive user-input failures (bad ID, DMs disabled).
      const transient = verification?.code === 'not_ready' || verification?.code === 'unknown';
      const status = transient ? 503 : 400;
      return res.status(status).json({
        error: verification?.error || 'Could not verify that Discord ID.',
        code: verification?.code || 'unknown',
      });
    }

    try {
      const saved = await db.linkOwnDiscordId(accountId, raw);
      res.json({ ok: true, discord_id: saved, verified_username: verification.username || null });
    } catch (err) {
      // Task 103 — race path: another request slipped in between our
      // findAccountIdsByDiscordId() check and this save and won the
      // partial unique index (idx_nicknames_discord_id_unique). Surface
      // the same friendly 409 the precheck would have returned instead
      // of a generic 500.
      if (err && err.code === '23505') {
        return res.status(409).json({
          error: 'That Discord ID is already linked to another player. If this is your account, ask an admin to help reconcile it.',
          code: 'discord_id_taken',
        });
      }
      console.error('[me/link-discord] failed for account', accountId, ':', err.message);
      res.status(500).json({ error: 'Could not save your Discord ID. Try again in a moment.' });
    }
  });

  // PUT /api/me/link-discord — self-service *re-link* path (task 102).
  //
  // POST above intentionally 409s if the caller already has a different
  // Discord ID linked, so the first-login modal can never silently overwrite
  // an existing link on a stale page. But a real user who lost access to
  // their old Discord account, or made a new one, needs a way to update
  // themselves without bugging an admin to run the superuser setDiscordId.
  //
  // PUT runs the *same* verify-and-DM round-trip the POST does — the bot
  // must be able to fetch the new Discord user AND DM them — and only then
  // overwrites the existing nicknames.discord_id row in place. The DB write
  // itself is a single UPDATE so the previous ID is replaced atomically with
  // no orphaned half-linked state.
  router.put('/me/link-discord', async (req, res) => {
    const accountId = req.session?.accountId;
    if (!accountId) return res.status(401).json({ error: 'Sign in with Steam first.' });
    const raw = (req.body?.discord_id || '').toString().trim();
    if (!/^\d{17,19}$/.test(raw)) {
      return res.status(400).json({ error: 'That doesn\'t look like a Discord User ID. It should be 17–19 digits.' });
    }

    // No-op short-circuit: if the user re-saves the same ID we already have,
    // skip the verify/DM round-trip so they aren't spammed with confirmation
    // DMs every time they hit Save.
    try {
      const existing = await db.getDiscordIdByAccountId(accountId);
      if (existing === raw) {
        return res.json({ ok: true, discord_id: existing, alreadyLinked: true });
      }
      // Task 103 — even on the re-link path, refuse if a *different* account
      // already owns this Discord ID. The DM-driven flows (MVP voting,
      // post-match rating) lookup by discord_id, so two accounts sharing the
      // same id makes the lookup ambiguous and exploitable.
      const owners = await db.findAccountIdsByDiscordId(raw);
      const otherOwner = owners.find((id) => String(id) !== String(accountId));
      if (otherOwner) {
        return res.status(409).json({
          error: 'That Discord ID is already linked to another player. If this is your account, ask an admin to help reconcile it.',
          code: 'discord_id_taken',
        });
      }
    } catch (err) {
      console.error('[me/link-discord PUT] existing-link check failed:', err.message);
      return res.status(503).json({ error: 'Could not check your existing link right now. Try again in a moment.' });
    }

    let verification;
    try {
      const bot = getDiscordBot();
      verification = await bot.verifyAndConfirmDiscordId(raw);
    } catch (err) {
      console.error('[me/link-discord PUT] verify threw for account', accountId, ':', err.message);
      return res.status(503).json({ error: 'Discord verification is unavailable right now. Try again in a moment.' });
    }
    if (!verification?.ok) {
      const transient = verification?.code === 'not_ready' || verification?.code === 'unknown';
      const status = transient ? 503 : 400;
      return res.status(status).json({
        error: verification?.error || 'Could not verify that Discord ID.',
        code: verification?.code || 'unknown',
      });
    }

    try {
      const saved = await db.linkOwnDiscordId(accountId, raw);
      res.json({ ok: true, discord_id: saved, verified_username: verification.username || null, relinked: true });
    } catch (err) {
      // Task 103 — race path against the partial unique index.
      if (err && err.code === '23505') {
        return res.status(409).json({
          error: 'That Discord ID is already linked to another player. If this is your account, ask an admin to help reconcile it.',
          code: 'discord_id_taken',
        });
      }
      console.error('[me/link-discord PUT] failed for account', accountId, ':', err.message);
      res.status(500).json({ error: 'Could not save your Discord ID. Try again in a moment.' });
    }
  });

  // Task #128's `GET /api/me/discord-autojoin-status` was removed in Task
  // #139 — its only consumer (the site-wide DiscordRetryBanner) now reads
  // `discord_autojoin_pending` from the existing `/api/auth/me` payload, so
  // we no longer need a standalone endpoint and the per-page-load round-trip
  // is gone for everyone.

  // DELETE /api/me/link-discord — self-service *unlink* path (task 109).
  //
  // POST creates a first-time link, PUT replaces an existing one — but neither
  // gives a player a way to fully clear their link if they've quit the league
  // or permanently lost access to their Discord account. Without this they
  // had to ask an admin to run the superuser setDiscordId with an empty
  // value. DELETE clears nicknames.discord_id for the caller's account so
  // the bot will stop DMing / mentioning / role-assigning that account, and
  // the first-login modal + Connect-with-Discord button become available
  // again so they can re-link a new account later.
  router.delete('/me/link-discord', async (req, res) => {
    const accountId = req.session?.accountId;
    if (!accountId) return res.status(401).json({ error: 'Sign in with Steam first.' });
    try {
      const cleared = await db.unlinkOwnDiscordId(accountId);
      res.json({ ok: true, cleared });
    } catch (err) {
      console.error('[me/link-discord DELETE] failed for account', accountId, ':', err.message);
      res.status(500).json({ error: 'Could not unlink your Discord ID. Try again in a moment.' });
    }
  });

  router.post('/auth/logout', async (req, res) => {
    // v5.88 — also remove the player from any open/accepting inhouse session
    // so logging out frees their slot for someone else.
    try {
      // The Steam OpenID handler stores the 32-bit dota id under
      // req.session.accountId (see Steam auth flow); some legacy callsites
      // also reference steamAccountId. Accept either to be safe.
      const acc = req.session?.accountId || req.session?.steamAccountId;
      if (acc) {
        const removed = await db.leaveAllJoinableInhouseSessions(acc);
        if (removed > 0) console.log(`[auth/logout] removed ${acc} from ${removed} open inhouse session(s)`);
      }
    } catch (err) {
      console.error('[auth/logout] inhouse cleanup failed:', err.message);
    }
    req.session.destroy(() => res.json({ success: true }));
  });

  router.post('/admin/login', authLimiter, express.json(), (req, res) => {
    const uploadKey = process.env.UPLOAD_KEY;
    if (!uploadKey) return res.status(503).json({ error: 'Admin not configured' });
    const { password } = req.body || {};
    if (password !== uploadKey) return res.status(401).json({ error: 'Invalid password' });
    req.session.isAdmin = true;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      res.json({ success: true });
    });
  });

  router.post('/admin/superuser-login', authLimiter, express.json(), (req, res) => {
    const superuserPassword = process.env.SUPERUSER_PASSWORD;
    if (!superuserPassword) {
      return res.status(503).json({ error: 'Superuser not configured. Set SUPERUSER_PASSWORD.' });
    }
    const { password } = req.body || {};
    if (password !== superuserPassword) return res.status(401).json({ error: 'Invalid password' });
    req.session.isSuperuser = true;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      res.json({ success: true });
    });
  });

  router.get('/admin/session-status', (req, res) => {
    res.json({
      isAdmin: !!(req.session && req.session.isAdmin),
      isSuperuser: !!(req.session && req.session.isSuperuser),
    });
  });

  router.post('/admin/admin-logout', (req, res) => {
    if (req.session) {
      req.session.isAdmin = false;
      req.session.save(() => res.json({ success: true }));
    } else {
      res.json({ success: true });
    }
  });

  router.post('/admin/superuser-logout', (req, res) => {
    if (req.session) {
      req.session.isSuperuser = false;
      req.session.save(() => res.json({ success: true }));
    } else {
      res.json({ success: true });
    }
  });

  function requireSuperuser(req, res, next) {
    // Session-based auth: preferred path for browser operators.
    if (req.session && req.session.isSuperuser) return next();

    // Header fallback for non-browser clients (scripts, bots).
    // Only SUPERUSER_PASSWORD is accepted — the lower-privilege UPLOAD_KEY
    // must never satisfy superuser checks.
    const superuserPassword = process.env.SUPERUSER_PASSWORD;
    if (!superuserPassword) {
      return res.status(503).json({ error: 'Superuser not configured. Set SUPERUSER_PASSWORD.' });
    }
    const provided = req.headers['x-superuser-key'];
    if (provided && provided === superuserPassword) return next();
    // Split: 401 = no credential / browser session expired (the frontend
    // wrapper in web/src/api.js triggers re-login on 401); 403 = caller
    // explicitly presented a wrong header value (do not auto-reprompt).
    // The browser client's session sentinel is the literal string 'session';
    // when that arrives without a valid session cookie we treat it as an
    // expired session, not a bad credential.
    if (!provided || provided === 'session') {
      return res.status(401).json({ error: 'Superuser session expired' });
    }
    return res.status(403).json({ error: 'Invalid superuser key' });
  }

  router.put('/matches/:matchId/player-stats', express.json(), requireSuperuser, async (req, res) => {
    try {
      const { players } = req.body;
      if (!Array.isArray(players)) return res.status(400).json({ error: 'players must be an array' });
      await db.updatePlayerStats(req.params.matchId, players);
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating player stats:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/matches/:matchId/match-details', express.json(), requireSuperuser, async (req, res) => {
    try {
      await db.updateMatchDetails(req.params.matchId, req.body);
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating match details:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/matches/:matchId/notes', async (req, res) => {
    try {
      const notes = await db.getMatchNotes(req.params.matchId);
      res.json(notes);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/matches/:matchId/notes', express.json(), authMiddleware, async (req, res) => {
    try {
      const { content, added_by } = req.body;
      if (!content || !content.trim()) return res.status(400).json({ error: 'content is required' });
      const note = await db.addMatchNote(req.params.matchId, content.trim(), added_by || 'admin');
      res.json(note);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/notes/:noteId', authMiddleware, async (req, res) => {
    try {
      await db.deleteMatchNote(req.params.noteId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/matches/:matchId/draft', express.json(), requireSuperuser, async (req, res) => {
    try {
      const { entries } = req.body;
      if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries must be an array' });
      await db.updateMatchDraft(req.params.matchId, entries);
      res.json({ success: true });
    } catch (err) {
      console.error('Error updating match draft:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/setup/parser', (req, res) => {
    const jarPath = path.join(__dirname, '../../odota-parser/target/stats-0.1.0.jar');
    if (!fs.existsSync(jarPath)) return res.status(404).json({ error: 'not found' });
    const data = fs.readFileSync(jarPath);
    const b64 = data.toString('base64');
    const chunkSize = 1024 * 1024; // 1MB chunks
    const page = parseInt(req.query.page) || 0;
    const total = Math.ceil(b64.length / chunkSize);
    const chunk = b64.slice(page * chunkSize, (page + 1) * chunkSize);
    res.json({ page, total, size: b64.length, chunk });
  });

  router.get('/matches', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const offset = parseInt(req.query.offset) || 0;
      const seasonId = req.query.season_id || null;
      const matches = await db.getMatches(limit, offset, seasonId);
      const total = await db.getMatchCount(seasonId);
      res.json({ matches, total, limit, offset });
    } catch (err) {
      console.error('[API] Error fetching matches:', err.message);
      res.status(500).json({ error: 'Failed to fetch matches' });
    }
  });

  router.get('/matches/:matchId', async (req, res) => {
    try {
      const match = await db.getMatch(req.params.matchId);
      if (!match) return res.status(404).json({ error: 'Match not found' });
      if (match.players && match.players.length > 0) {
        const radiant = match.players.filter(p => p.team === 'radiant' && p.account_id && p.account_id !== '0');
        const dire = match.players.filter(p => p.team === 'dire' && p.account_id && p.account_id !== '0');
        const getRatings = async (players) => {
          const ratings = await Promise.all(players.map(p => db.getPlayerRating(p.account_id).catch(() => null)));
          return ratings.filter(Boolean).map(r => r.mmr || 0);
        };
        const [radiantMmrs, direMmrs] = await Promise.all([getRatings(radiant), getRatings(dire)]);
        if (radiantMmrs.length > 0 && direMmrs.length > 0) {
          const radiantAvg = radiantMmrs.reduce((a, b) => a + b, 0) / radiantMmrs.length;
          const direAvg = direMmrs.reduce((a, b) => a + b, 0) / direMmrs.length;
          const diff = Math.abs(radiantAvg - direAvg);
          match.radiant_avg_mmr = Math.round(radiantAvg);
          match.dire_avg_mmr = Math.round(direAvg);
          match.mmr_diff = Math.round(diff);
          const lowerMmrIsRadiant = radiantAvg < direAvg;
          const radiantWon = match.radiant_win;
          if (diff >= 50) {
            match.is_upset = lowerMmrIsRadiant === radiantWon;
            match.underdog_team = lowerMmrIsRadiant ? 'radiant' : 'dire';
          }
        }
      }
      // Indicate whether a locally stored replay file exists for this match.
      const replayRow = await db.getReplayFilePath(req.params.matchId).catch(() => null);
      match.has_replay = !!(replayRow?.replay_file_path && fs.existsSync(replayRow.replay_file_path));
      // Indicate whether a remote (dedicated-server) archived replay is available.
      // Do NOT expose replay_path (internal filesystem path) to public clients.
      const remoteReplayRow = await db.getReplayPath(req.params.matchId).catch(() => null);
      match.has_remote_replay = !!(remoteReplayRow?.replay_path);
      // Per-player V3 performance modifier breakdown (so the scoreboard can
      // explain "why did my MMR change by +24"). Failure to compute this is
      // non-fatal — the rest of the match payload should still render.
      try {
        const v3 = await db.getMatchV3Modifiers(req.params.matchId);
        match.v3_modifiers = v3;
      } catch (modErr) {
        console.error('[API] V3 modifier breakdown failed:', modErr.message);
        match.v3_modifiers = { modifiers: [], hasStats: false };
      }
      res.json(match);
    } catch (err) {
      console.error('[API] Error fetching match:', err.message);
      res.status(500).json({ error: 'Failed to fetch match' });
    }
  });

  router.delete('/matches/:matchId', authMiddleware, async (req, res) => {
    try {
      const { reason } = req.body || {};
      const result = await db.deleteMatch(req.params.matchId, `web:${req.ip}`, reason);
      if (!result) return res.status(404).json({ error: 'Match not found' });

      let ratingsRecalculated = false;
      try {
        await db.recalculateAllRatings();
        ratingsRecalculated = true;
      } catch (ratingErr) {
        console.error('[API] Rating recalculation failed after deleting match:', ratingErr.message);
      }

      res.json({ deleted: true, matchId: req.params.matchId, ratingsRecalculated });
    } catch (err) {
      console.error('[API] Error deleting match:', err.message);
      res.status(500).json({ error: 'Failed to delete match' });
    }
  });

  router.get('/leaderboard', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const pool = db.getPool();
      const [leaderboard, streaks, framesRes] = await Promise.all([
        db.getComputedLeaderboard(seasonId),
        db.getPlayerStreaks(seasonId),
        pool.query(`SELECT account_id, profile_frame FROM player_profiles WHERE profile_frame IS NOT NULL AND profile_frame != 'none'`).catch(() => ({ rows: [] })),
      ]);
      const framesByAccountId = {};
      for (const fr of framesRes.rows) {
        framesByAccountId[String(fr.account_id)] = fr.profile_frame;
      }
      for (const p of leaderboard) {
        p.streak = streaks[p.player_id?.toString()] || 0;
        p.profile_frame = framesByAccountId[String(p.player_id)] || null;
      }
      // v5.90 — V3 is the only supported engine; field kept for client compat.
      res.json({ leaderboard, useV3: true });
    } catch (err) {
      console.error('[API] Error fetching leaderboard:', err.message);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  });

  router.get('/players/:accountId', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const stats = await db.getPlayerStats(req.params.accountId, seasonId);
      res.json(stats);
    } catch (err) {
      console.error('[API] Error fetching player:', err.message);
      res.status(500).json({ error: 'Failed to fetch player stats' });
    }
  });

  router.get('/players', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const players = await db.getAllPlayers(seasonId);
      res.json({ players });
    } catch (err) {
      console.error('[API] Error fetching players:', err.message);
      res.status(500).json({ error: 'Failed to fetch players' });
    }
  });

  router.get('/nicknames', async (req, res) => {
    try {
      const nicknames = await db.getAllNicknames();
      res.json({ nicknames });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch nicknames' });
    }
  });

  router.post('/nicknames/:accountId', requireSuperuser, async (req, res) => {
    try {
      const { nickname } = req.body;
      const accountId = parseInt(req.params.accountId);
      if (isNaN(accountId) || accountId <= 0) {
        return res.status(400).json({ error: 'Invalid account ID' });
      }
      const result = await db.setNickname(accountId, nickname);
      res.json({ accountId, nickname: result });
    } catch (err) {
      res.status(500).json({ error: 'Failed to set nickname' });
    }
  });

  router.post('/players/:accountId/discord', requireSuperuser, async (req, res) => {
    try {
      const { discord_id } = req.body;
      const accountId = parseInt(req.params.accountId);
      if (isNaN(accountId) || accountId <= 0) {
        return res.status(400).json({ error: 'Invalid account ID' });
      }
      const result = await db.setDiscordId(accountId, discord_id);
      res.json({ accountId, discord_id: result });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to set Discord ID' });
    }
  });

  // Task 114 — admin reconciliation UI for Discord-ID collisions. Lists every
  // discord_id currently bound to >1 account so an operator can pick the
  // canonical owner in one click instead of running setDiscordId by hand.
  // Also reports whether the partial unique index (added in Task 103) is
  // already enforced; once the listing is empty the UI lets the operator
  // create the index without redeploying.
  router.get('/admin/discord-id-collisions', requireSuperuser, async (req, res) => {
    try {
      const collisions = await db.getDiscordIdCollisions();
      // Pure read: report whether the unique index already exists, but DO
      // NOT attempt to create it here — index creation only happens on the
      // explicit resolve / enforce-index POST routes below so a list call
      // never has a side effect.
      const indexStatus = await db.getDiscordIdUniqueIndexStatus().catch(err => ({
        exists: false, error: err.message,
      }));
      res.json({ collisions, index: indexStatus });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to load collisions' });
    }
  });

  router.post('/admin/discord-id-collisions/resolve', express.json(), requireSuperuser, async (req, res) => {
    try {
      const { discord_id, keep_account_id } = req.body || {};
      if (!discord_id || !keep_account_id) {
        return res.status(400).json({ error: 'discord_id and keep_account_id required' });
      }
      const result = await db.resolveDiscordIdCollision(discord_id, keep_account_id);
      // Try to enforce the index opportunistically once a group is resolved
      // — does nothing if other collisions still exist.
      const indexStatus = await db.tryEnforceDiscordIdUniqueIndex().catch(err => ({
        exists: false, created: false, error: err.message,
      }));
      res.json({ ...result, index: indexStatus });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Failed to resolve collision' });
    }
  });

  router.post('/admin/discord-id-collisions/enforce-index', requireSuperuser, async (req, res) => {
    try {
      const indexStatus = await db.tryEnforceDiscordIdUniqueIndex();
      res.json({ index: indexStatus });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to enforce index' });
    }
  });

  router.get('/social-graph', requirePro('player_network'), async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const minGames = parseInt(req.query.min_games) || 3;
      const duos = await db.getTopDuos(seasonId, minGames);
      res.json({ duos });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch social graph' });
    }
  });

  router.get('/player-connections/:accountId', requirePro('player_network'), async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const data = await db.getPlayerConnections(req.params.accountId, seasonId);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch player connections' });
    }
  });

  router.get('/player-form', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const form = await db.getPlayerFormBatch(seasonId);
      res.json({ form });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch player form' });
    }
  });

  router.get('/position-averages', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const averages = await db.getPositionAverages(seasonId);
      res.json({ averages });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch position averages' });
    }
  });

  router.get('/hero-matchups', requirePro('hero_matchups'), async (req, res) => {
    try {
      const { hero_id, season_id } = req.query;
      if (!hero_id) return res.status(400).json({ error: 'hero_id required' });
      const matchups = await db.getHeroMatchups(hero_id, season_id || null);
      res.json({ matchups });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch hero matchups' });
    }
  });

  router.get('/schedule', async (req, res) => {
    try {
      const games = await db.getUpcomingGamesWithRsvps();
      res.json({ games });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch schedule' });
    }
  });

  router.post('/schedule', requireSuperuser, async (req, res) => {
    try {
      const { scheduled_at, note } = req.body;
      if (!scheduled_at) return res.status(400).json({ error: 'scheduled_at required' });
      const creator = req.session?.displayName || req.body.created_by || 'admin';
      const game = await db.scheduleGame(scheduled_at, note, creator);
      // Post Discord RSVP announcement — await so we can report success/failure
      let discordPosted = false;
      try {
        await getDiscordBot().postScheduleRsvpEmbed(game);
        discordPosted = true;
      } catch (discordErr) {
        console.error('[Schedule] Failed to post Discord RSVP embed:', discordErr.message);
      }
      res.json({ game, discordPosted });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to schedule game' });
    }
  });

  router.delete('/schedule/:id', requireSuperuser, async (req, res) => {
    try {
      const game = await db.cancelGame(parseInt(req.params.id));
      if (!game) return res.status(404).json({ error: 'Game not found' });
      res.json({ game });
    } catch (err) {
      res.status(500).json({ error: 'Failed to cancel game' });
    }
  });

  router.get('/schedule/:id/rsvps', async (req, res) => {
    try {
      const rsvps = await db.getScheduleRsvps(parseInt(req.params.id));
      res.json({ rsvps });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch RSVPs' });
    }
  });

  router.post('/schedule/:id/rsvp', async (req, res) => {
    try {
      if (!req.session || !req.session.accountId) {
        return res.status(401).json({ error: 'Steam login required to RSVP' });
      }
      const { status } = req.body;
      if (!['yes', 'no'].includes(status)) return res.status(400).json({ error: 'status must be yes or no' });
      const gameId = parseInt(req.params.id);
      const displayName = req.session.displayName || `Player ${req.session.accountId}`;
      await db.addScheduleRsvpBySteam(gameId, req.session.accountId, displayName, status);
      const rsvps = await db.getScheduleRsvps(gameId);
      res.json({ success: true, rsvps });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to update RSVP' });
    }
  });

  router.delete('/schedule/:id/rsvp', async (req, res) => {
    try {
      if (!req.session || !req.session.accountId) {
        return res.status(401).json({ error: 'Steam login required' });
      }
      const gameId = parseInt(req.params.id);
      await db.removeScheduleRsvpBySteam(gameId, req.session.accountId);
      const rsvps = await db.getScheduleRsvps(gameId);
      res.json({ success: true, rsvps });
    } catch (err) {
      res.status(500).json({ error: 'Failed to remove RSVP' });
    }
  });

  router.get('/ratings/match/:matchId', async (req, res) => {
    try {
      const ratings = await db.getMatchRatings(req.params.matchId);
      res.json({ ratings });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch match ratings' });
    }
  });

  router.get('/ratings/player/:accountId', async (req, res) => {
    try {
      const ids = await db.getMergedAccountIds(req.params.accountId);
      const ratings = await db.getPlayerRatingsReceived(ids);
      res.json({ ratings });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch player ratings' });
    }
  });

  router.get('/heroes', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const data = await db.getHeroStats(seasonId);
      res.json(data);
    } catch (err) {
      console.error('[API] Error fetching hero stats:', err.message);
      res.status(500).json({ error: 'Failed to fetch hero stats' });
    }
  });

  router.get('/heroes/:heroId/players', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const players = await db.getHeroPlayers(parseInt(req.params.heroId), seasonId);
      res.json({ players });
    } catch (err) {
      console.error('[API] Error fetching hero players:', err.message);
      res.status(500).json({ error: 'Failed to fetch hero players' });
    }
  });

  router.get('/heroes/tier-list', async (req, res) => {
    try {
      const seasonId = req.query.season || null;
      const data = await db.getHeroTierList(seasonId);
      res.json(data);
    } catch (err) {
      console.error('[API] heroes/tier-list:', err.message);
      res.status(500).json({ error: 'Failed to fetch hero tier list' });
    }
  });

  router.get('/player/:id/hero-suggestions', async (req, res) => {
    try {
      const seasonId = req.query.season || null;
      const accountId = req.params.id;
      const sessionAccountId = req.session?.accountId;
      const isPro = await _isProAccount(sessionAccountId);
      const data = await db.getPlayerHeroSuggestions(accountId, seasonId);
      if (!isPro) {
        data.suggestions = data.suggestions.map(({ correlation_score, similar_players_count, based_on_hero_wr, ...rest }) => rest);
      }
      res.json({ ...data, is_pro: isPro });
    } catch (err) {
      console.error('[API] player/hero-suggestions:', err.message);
      res.status(500).json({ error: 'Failed to fetch hero suggestions' });
    }
  });

  router.get('/admin/heroes/tier-overrides', authMiddleware, async (req, res) => {
    try {
      const seasonId = req.query.season || null;
      const overrides = await db.getHeroTierOverrides(seasonId);
      res.json({ overrides });
    } catch (err) {
      console.error('[API] admin/heroes/tier-overrides GET:', err.message);
      res.status(500).json({ error: 'Failed to fetch tier overrides' });
    }
  });

  router.post('/admin/heroes/tier-overrides', authMiddleware, async (req, res) => {
    try {
      const { season_id, hero_id, tier } = req.body;
      if (!hero_id || !tier) return res.status(400).json({ error: 'hero_id and tier are required' });
      await db.setHeroTierOverride(season_id || null, hero_id, tier, 'admin');
      res.json({ success: true });
    } catch (err) {
      console.error('[API] admin/heroes/tier-overrides POST:', err.message);
      res.status(400).json({ error: err.message || 'Failed to set tier override' });
    }
  });

  router.delete('/admin/heroes/tier-overrides/:heroId', authMiddleware, async (req, res) => {
    try {
      const seasonId = req.query.season || null;
      await db.deleteHeroTierOverride(seasonId, req.params.heroId);
      res.json({ success: true });
    } catch (err) {
      console.error('[API] admin/heroes/tier-overrides DELETE:', err.message);
      res.status(500).json({ error: 'Failed to delete tier override' });
    }
  });

  router.get('/hero-meta', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const rows = await db.getHeroMetaByPosition(seasonId);
      res.json({ rows });
    } catch (err) {
      console.error('[API] Error fetching hero meta:', err.message);
      res.status(500).json({ error: 'Failed to fetch hero meta' });
    }
  });

  router.get('/multikills', async (req, res) => {
    try {
      const seasonId = req.query.season || null;
      const rows = await db.getMultiKillStats(seasonId);
      res.json({ rows });
    } catch (err) {
      console.error('[API] Error fetching multikill stats:', err.message);
      res.status(500).json({ error: 'Failed to fetch multikill stats' });
    }
  });

  router.get('/most-improved', async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30;
      const seasonId = req.query.season_id ? parseInt(req.query.season_id) : null;
      const rows = await db.getMostImproved(days, seasonId);
      res.json({ rows, days, season_id: seasonId });
    } catch (err) {
      console.error('[API] Error fetching most improved:', err.message);
      res.status(500).json({ error: 'Failed to fetch most improved' });
    }
  });

  router.get('/best-and-fairest', async (req, res) => {
    try {
      const seasonId = req.query.season_id ? parseInt(req.query.season_id) : null;
      const minRatings = parseInt(req.query.min_ratings) || 3;
      const rows = await db.getBestAndFairest(seasonId, minRatings);
      res.json({ rows, season_id: seasonId });
    } catch (err) {
      console.error('[API] Error fetching best and fairest:', err.message);
      res.status(500).json({ error: 'Failed to fetch best and fairest' });
    }
  });

  router.get('/predictions/open', async (req, res) => {
    try {
      const data = await db.getOpenPrediction();
      res.json({ prediction: data });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch open prediction' });
    }
  });

  router.post('/match-predictions/:matchId', async (req, res) => {
    try {
      const matchId = parseInt(req.params.matchId);
      const { predictor_account_id, predictor_name, predicted_winner } = req.body;
      if (!predictor_name || !['radiant', 'dire'].includes(predicted_winner)) {
        return res.status(400).json({ error: 'predictor_name and predicted_winner (radiant|dire) required' });
      }
      const pred = await db.upsertMatchPrediction(matchId, predictor_account_id || null, predictor_name, predicted_winner);
      res.json({ prediction: pred });
    } catch (err) {
      console.error('[API] Error saving prediction:', err.message);
      res.status(500).json({ error: 'Failed to save prediction' });
    }
  });

  router.get('/matches/:matchId/predictions', async (req, res) => {
    try {
      const preds = await db.getMatchPredictions(parseInt(req.params.matchId));
      res.json({ predictions: preds });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch predictions' });
    }
  });

  router.get('/players/:accountId/predictions', async (req, res) => {
    try {
      const stats = await db.getPlayerPredictionStats(parseInt(req.params.accountId));
      res.json({ stats });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch prediction stats' });
    }
  });

  router.get('/players/:accountId/ward-placements', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const ids = await db.getMergedAccountIds(req.params.accountId);
      const placements = await db.getPlayerWardPlacements(ids, seasonId);
      res.json({ placements });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch ward placements' });
    }
  });

  router.get('/ward-placements', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const players = await db.getAllPlayersWardPlacements(seasonId);
      res.json({ players });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch ward placements' });
    }
  });

  router.get('/players/:accountId/hero-counters', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const ids = await db.getMergedAccountIds(req.params.accountId);
      const counters = await db.getPlayerHeroCounters(ids, seasonId);
      res.json({ counters });
    } catch (err) {
      console.error('[API] Error fetching hero counters:', err.message);
      res.status(500).json({ error: 'Failed to fetch hero counters' });
    }
  });

  router.get('/players/:accountId/streak', async (req, res) => {
    try {
      const ids = await db.getMergedAccountIds(req.params.accountId);
      const streak = await db.getPlayerCurrentStreak(ids);
      res.json({ streak });
    } catch (err) {
      console.error('[API] Error fetching streak:', err.message);
      res.status(500).json({ error: 'Failed to fetch streak' });
    }
  });

  router.get('/draft-stats', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const data = await db.getDraftStats(seasonId);
      res.json(data);
    } catch (err) {
      console.error('[API] Error fetching draft stats:', err.message);
      res.status(500).json({ error: 'Failed to fetch draft stats' });
    }
  });

  router.get('/records', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const records = await db.getPersonalRecords(seasonId);
      res.json({ records });
    } catch (err) {
      console.error('[API] Error fetching records:', err.message);
      res.status(500).json({ error: 'Failed to fetch records' });
    }
  });

  router.get('/matches/:matchId/hook-report.txt', async (req, res) => {
    try {
      const { matchId } = req.params;
      const p = db.getPool();
      const matchRes = await p.query('SELECT * FROM matches WHERE match_id = $1', [matchId]);
      if (matchRes.rows.length === 0) return res.status(404).send('Match not found');
      const match = matchRes.rows[0];

      const playersRes = await p.query(
        `SELECT ps.*, COALESCE(n.nickname, ps.persona_name) as display_name
         FROM player_stats ps
         LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
         WHERE ps.match_id = $1 AND ps.hero_name = 'npc_dota_hero_pudge'
         ORDER BY ps.slot`,
        [matchId]
      );
      const pudgePlayers = playersRes.rows;
      if (pudgePlayers.length === 0) return res.status(404).send('No Pudge players found in this match.');

      const fmtTime = (s) => {
        if (s == null) return '?';
        const m = Math.floor(s / 60), sec = s % 60;
        return `${m}:${String(sec).padStart(2, '0')}`;
      };

      const outcomeLabel = {
        hero_hit: 'HERO HIT ✓',
        miss: 'MISS',
        creep_hit_genuine: 'CREEP HIT (enemy nearby — counted as attempt)',
        farming_hook: 'FARMING HOOK (no enemy in path — NOT counted as attempt)',
      };

      const durationSecs = match.duration || 0;
      let lines = [];
      lines.push(`PUDGE HOOK ACCURACY VERIFICATION REPORT`);
      lines.push(`Match #${matchId}  |  Duration: ${fmtTime(durationSecs)}  |  Date: ${match.date ? new Date(match.date).toUTCString() : 'unknown'}`);
      lines.push(`Generated: ${new Date().toUTCString()}`);
      lines.push(`${'='.repeat(70)}`);
      lines.push('');
      lines.push('HOW TO READ THIS REPORT');
      lines.push('  - Scrub to each cast timestamp in your replay to verify it manually.');
      lines.push('  - "HERO HIT" = hook connected with enemy hero → counted as attempt AND hit.');
      lines.push('  - "MISS" = hook hit nothing → counted as attempt (not a hit).');
      lines.push('  - "CREEP HIT (enemy nearby)" = hit a creep, but an enemy was in the path → counted as attempt.');
      lines.push('  - "FARMING HOOK" = hit a creep/unit with no enemy near path → NOT counted as attempt or hit.');
      lines.push('  - Accuracy = Hits / Genuine Attempts  (farming hooks excluded from denominator).');
      lines.push('');

      for (const p of pudgePlayers) {
        const castLog = Array.isArray(p.hook_cast_log) ? p.hook_cast_log : [];
        const acc = p.hook_attempts > 0
          ? ((p.hook_hits / p.hook_attempts) * 100).toFixed(1) + '%'
          : 'N/A';

        lines.push(`${'─'.repeat(70)}`);
        lines.push(`PLAYER: ${p.display_name}  (Team: ${p.team}, Slot: ${p.slot})`);
        lines.push(`SUMMARY: ${castLog.length} total casts  |  ${p.hook_attempts ?? '?'} genuine attempts  |  ${p.hook_hits ?? '?'} hero hits  |  Accuracy: ${acc}`);
        lines.push('');

        if (castLog.length === 0) {
          lines.push('  No per-cast data available. Re-parse this replay to generate the detailed log.');
        } else {
          lines.push(`  #    TIME     OUTCOME`);
          lines.push(`  ${'─'.repeat(60)}`);
          castLog.forEach((entry, i) => {
            const label = outcomeLabel[entry.outcome] || entry.outcome;
            const target = entry.hitTarget ? `  → ${entry.hitTarget}` : '';
            lines.push(`  ${String(i + 1).padStart(3)}  ${fmtTime(entry.time).padEnd(7)}  ${label}${target}`);
          });
        }
        lines.push('');
      }

      lines.push(`${'='.repeat(70)}`);
      lines.push('END OF REPORT');

      const body = lines.join('\n');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="hook-report-match-${matchId}.txt"`);
      res.send(body);
    } catch (err) {
      console.error('[API] Error generating hook report:', err.message);
      res.status(500).send('Failed to generate hook report');
    }
  });

  router.get('/season-player-records', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const data = await db.getSeasonPlayerRecords(seasonId);
      res.json(data);
    } catch (err) {
      console.error('[API] Error fetching season player records:', err.message);
      res.status(500).json({ error: 'Failed to fetch season player records' });
    }
  });

  router.get('/pudge-stats', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const rows = await db.getPudgeStats(seasonId);
      res.json({ players: rows });
    } catch (err) {
      console.error('[API] Error fetching pudge stats:', err.message);
      res.status(500).json({ error: 'Failed to fetch pudge stats' });
    }
  });

  router.get('/pudge-stats/games', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const rows = await db.getPudgeGames(seasonId);
      res.json({ games: rows });
    } catch (err) {
      console.error('[API] Error fetching pudge games:', err.message);
      res.status(500).json({ error: 'Failed to fetch pudge games' });
    }
  });

  // (round-7 review) The canonical `/matches/:matchId/replay` route used
  // to be registered here as a remote-archive-only handler, then *again*
  // a few hundred lines later as the local-file + quota-aware handler.
  // Express resolves the first match, so the quota path was dead code on
  // the canonical URL and a Pro user could bulk-scrape the archive
  // without ever tripping the per-day limit. The unified handler now
  // lives at the registration site below (`_replayDownloadHandler`),
  // which performs auth + quota first and then tries the local store
  // before falling back to the remote SFTP archive.

  // Superuser: manually set (or clear) the remote replay_path for a match.
  // If the value looks like a bare filename (no leading slash or path separator),
  // it is resolved against REPLAY_ARCHIVE_DIR so admins can type just the filename.
  router.post('/admin/matches/:matchId/set-replay-path', requireSuperuser, express.json(), async (req, res) => {
    try {
      const { matchId } = req.params;
      let { replay_path } = req.body || {};
      if (replay_path) {
        const ssh = config.dota?.dedicatedServer?.ssh || {};
        const archiveDir = process.env.REPLAY_ARCHIVE_DIR || ssh.replayArchiveDir || '/opt/dota2/game/dota/replays/archive';
        // Resolve bare filenames (no path separator) against the archive directory.
        if (!replay_path.startsWith('/')) {
          replay_path = `${archiveDir}/${replay_path}`;
        }
        // Normalize and validate the path is within the archive directory.
        const normalizedPath = require('path').normalize(replay_path);
        const normalizedDir = require('path').normalize(archiveDir);
        if (!normalizedPath.startsWith(normalizedDir + '/') && normalizedPath !== normalizedDir) {
          return res.status(400).json({ error: 'Replay path must be within the archive directory.' });
        }
        // Only allow .dem files.
        if (!normalizedPath.endsWith('.dem')) {
          return res.status(400).json({ error: 'Replay path must point to a .dem file.' });
        }
        replay_path = normalizedPath;
      }
      await db.setReplayPath(matchId, replay_path || null);
      res.json({ success: true, matchId, replay_path: replay_path || null });
    } catch (err) {
      console.error('[API] set-replay-path error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Superuser: list all matches with their replay archive status.
  router.get('/admin/matches/replay-status', requireSuperuser, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);
      const offset = parseInt(req.query.offset) || 0;
      const rows = await db.getMatchesWithReplayStatus(limit, offset);
      res.json({ matches: rows, limit, offset });
    } catch (err) {
      console.error('[API] replay-status error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Pro/admin: download the locally stored .dem replay file for a match.
  // This route is gated the same way as /matches/:matchId/replay to prevent
  // free users from bypassing the paywall via the legacy local-copy URL.
  // Drift closure (Task #157 round-3): the spec listed `/api/matches/:id/replay`
  // as the canonical endpoint. We keep `/replays/:matchId/download` as the
  // implementation but alias `/matches/:matchId/replay` so any consumer using
  // the spec'd contract works identically — same handler, same gating, same
  // quota.
  const _replayDownloadHandler = async (req, res) => {
    try {
      const { matchId } = req.params;
      // Enforce Pro/admin — session-based auth preferred; header fallback for non-browser clients.
      const isSu = _isSu(req);
      const isAdminSession = Boolean(req.session && req.session.isAdmin);
      const uploadKey = process.env.UPLOAD_KEY;
      const providedKey = req.headers['x-upload-key'] || req.headers['x-admin-key'];
      const isAdminKey = Boolean(uploadKey && providedKey === uploadKey);
      const accountId = req.session?.accountId;
      if (!isSu && !isAdminSession && !isAdminKey) {
        const isPro = await _isProAccount(accountId);
        if (!isPro) {
          return res.status(402).json({
            error: 'Replay download requires Pro membership.',
            paywall: true,
            feature: 'replay_download',
            signed_in: Boolean(accountId),
          });
        }
        // Task #157 — per-user daily quota even for Pro, to keep the local
        // replay store from being scraped wholesale by a single account.
        try {
          const used = await db.magV3.countReplayDownloadsLast24h(accountId);
          const { REPLAY_RATE_LIMIT_PER_DAY } = require('../monetization/magazineV3');
          if (used >= REPLAY_RATE_LIMIT_PER_DAY) {
            return res.status(429).json({
              error: `Daily replay download limit reached (${REPLAY_RATE_LIMIT_PER_DAY}). Resets in 24h.`,
              feature: 'replay_download',
              limit: REPLAY_RATE_LIMIT_PER_DAY,
              used,
            });
          }
        } catch (qErr) {
          // Quota check is non-fatal — better to let the download through
          // than to break replay access on a transient DB blip.
          console.warn('[mag-v3] replay quota check failed:', qErr.message);
        }
      }
      // Local-file path first (free + fast), with remote archive as
      // fallback. Both paths run AFTER the same Pro/admin gate + the
      // Pro-only daily quota check above, so the canonical
      // `/matches/:matchId/replay` URL is never a scraping bypass.
      const localRow = await db.getReplayFilePath(matchId);
      if (localRow && localRow.replay_file_path && fs.existsSync(localRow.replay_file_path)) {
        const filename = path.basename(localRow.replay_file_path);
        let bytes = null;
        try { bytes = fs.statSync(localRow.replay_file_path).size; } catch (_) {}
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        if (accountId && !isSu && !isAdminSession && !isAdminKey) {
          db.magV3.logReplayDownload(accountId, matchId, bytes).catch(() => {});
        }
        return fs.createReadStream(localRow.replay_file_path).pipe(res);
      }
      // Fall back to the remote SFTP archive if the dedicated server
      // recorded a `replay_path` for this match.
      const remoteRow = await db.getReplayPath(matchId);
      if (remoteRow && remoteRow.replay_path) {
        const safeMatchId = String(matchId).replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `match_${safeMatchId}.dem`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        if (accountId && !isSu && !isAdminSession && !isAdminKey) {
          db.magV3.logReplayDownload(accountId, matchId, null).catch(() => {});
        }
        try {
          const { streamReplayFromArchive } = require('../services/serverReplayFetcher');
          await streamReplayFromArchive(remoteRow.replay_path, res);
          return;
        } catch (streamErr) {
          if (!res.headersSent) {
            const code = streamErr?.code;
            if (code === 2 /* SSH_FX_NO_SUCH_FILE */ || code === 'ENOENT') {
              return res.status(404).json({ error: 'Replay file not found on archive server.' });
            }
            return res.status(500).json({ error: 'Replay download failed: ' + streamErr.message });
          }
          throw streamErr;
        }
      }
      return res.status(404).json({ error: 'No replay stored for this match.' });
    } catch (err) {
      console.error('[API] Replay download error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
    }
  };
  router.get('/replays/:matchId/download', _replayDownloadHandler);
  // Spec'd canonical alias — same handler, same paywall + quota.
  router.get('/matches/:matchId/replay', _replayDownloadHandler);

  // Superuser-only: list all stored replay files (match id, file size, expiry).
  router.get('/replays/stored', requireSuperuser, async (req, res) => {
    try {
      const p = db.getPool();
      const result = await p.query(
        `SELECT match_id, replay_file_path, replay_file_expires_at, date
         FROM matches
         WHERE replay_file_path IS NOT NULL
         ORDER BY date DESC`
      );
      const rows = result.rows.map(r => {
        let fileSize = null;
        if (r.replay_file_path && fs.existsSync(r.replay_file_path)) {
          try { fileSize = fs.statSync(r.replay_file_path).size; } catch (_) {}
        }
        return {
          matchId: r.match_id,
          date: r.date,
          expiresAt: r.replay_file_expires_at,
          fileSize,
          available: !!(r.replay_file_path && fs.existsSync(r.replay_file_path)),
        };
      });
      res.json({ replays: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Superuser-only: extend or clear the expiry on a stored replay.
  router.post('/replays/:matchId/extend', requireSuperuser, express.json(), async (req, res) => {
    try {
      const { matchId } = req.params;
      const { days } = req.body; // null/0 = keep forever, >0 = extend by N days from now
      const expiresAt = days > 0 ? new Date(Date.now() + days * 86400 * 1000) : null;
      await db.setReplayFilePath(
        matchId,
        (await db.getReplayFilePath(matchId))?.replay_file_path,
        expiresAt
      );
      res.json({ success: true, expiresAt });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/first-blood-stats', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const stats = await db.getFirstBloodStats(seasonId);
      res.json({ stats });
    } catch (err) {
      console.error('[API] Error fetching first blood stats:', err.message);
      res.status(500).json({ error: 'Failed to fetch first blood stats' });
    }
  });

  router.get('/heroes/:heroId/skill-builds', requirePro('skill_builds'), async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const data = await db.getHeroSkillBuilds(parseInt(req.params.heroId), seasonId);
      res.json(data);
    } catch (err) {
      console.error('[API] Error fetching skill builds:', err.message);
      res.status(500).json({ error: 'Failed to fetch skill builds' });
    }
  });

  router.get('/players/:accountId/duration-stats', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const ids = await db.getMergedAccountIds(req.params.accountId);
      const stats = await db.getPlayerGameDurationStats(ids, seasonId);
      res.json({ stats });
    } catch (err) {
      console.error('[API] Error fetching duration stats:', err.message);
      res.status(500).json({ error: 'Failed to fetch duration stats' });
    }
  });

  router.get('/comeback-matches', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const matches = await db.getComebackMatches(seasonId);
      res.json({ matches });
    } catch (err) {
      console.error('[API] Error fetching comeback matches:', err.message);
      res.status(500).json({ error: 'Failed to fetch comeback matches' });
    }
  });

  router.get('/overall-stats', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const stats = await db.getOverallStats(seasonId);
      res.json({ stats });
    } catch (err) {
      console.error('[API] Error fetching overall stats:', err.message);
      res.status(500).json({ error: 'Failed to fetch overall stats' });
    }
  });

  router.get('/position-stats/:position', async (req, res) => {
    try {
      const pos = parseInt(req.params.position);
      if (pos < 1 || pos > 5) return res.status(400).json({ error: 'Position must be 1-5' });
      const minGames = Math.max(1, parseInt(req.query.min_games) || 1);
      const seasonId = req.query.season_id || null;
      const stats = await db.getPositionStats(pos, minGames, seasonId);
      res.json({ stats });
    } catch (err) {
      console.error('[API] Error fetching position stats:', err.message);
      res.status(500).json({ error: 'Failed to fetch position stats' });
    }
  });

  router.get('/player-profiles/positions', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const players = await db.getPlayerPositionProfiles(seasonId);
      res.json({ players });
    } catch (err) {
      console.error('[API] Error fetching player position profiles:', err.message);
      res.status(500).json({ error: 'Failed to fetch player position profiles' });
    }
  });

  router.get('/player-profiles/heroes', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const players = await db.getPlayerHeroProfiles(seasonId);
      res.json({ players });
    } catch (err) {
      console.error('[API] Error fetching player hero profiles:', err.message);
      res.status(500).json({ error: 'Failed to fetch player hero profiles' });
    }
  });

  router.get('/synergy', requirePro('synergy_matrix'), async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const data = await db.getSynergyMatrix(seasonId);
      res.json(data);
    } catch (err) {
      console.error('[API] Error fetching synergy:', err.message);
      res.status(500).json({ error: 'Failed to fetch synergy data' });
    }
  });

  router.get('/seasons', async (req, res) => {
    try {
      const seasons = await db.getSeasons();
      res.json({ seasons });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch seasons' });
    }
  });

  router.post('/seasons', authMiddleware, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ error: 'Season name required' });
      const season = await db.createSeason(name.trim());
      res.json({ season });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create season' });
    }
  });

  router.put('/seasons/:id/activate', authMiddleware, async (req, res) => {
    try {
      const season = await db.setActiveSeason(parseInt(req.params.id));
      if (!season) return res.status(404).json({ error: 'Season not found' });
      res.json({ season });
    } catch (err) {
      res.status(500).json({ error: 'Failed to activate season' });
    }
  });

  router.put('/seasons/none/activate', authMiddleware, async (req, res) => {
    try {
      const p = db.getPool();
      await p.query('UPDATE seasons SET active = false');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to deactivate seasons' });
    }
  });

  router.put('/seasons/:id/archive', requireSuperuser, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid season id' });
      const season = await db.archiveSeason(id);
      if (!season) return res.status(404).json({ error: 'Season not found' });
      // Magazine v3 (Task #157 round-4): season-end is the natural rollover
      // point for pickem too. Award the cosmetic champion frame to the #1
      // pickem player and roll a fresh pickem season into place. Both calls
      // are best-effort — they never block the main season archive response.
      let pickemAward = null;
      try {
        if (db.magV3?.getActivePickemSeason && db.magV3.awardPickemSeasonChampion) {
          const ps = await db.magV3.getActivePickemSeason();
          if (ps?.id) {
            pickemAward = await db.magV3.awardPickemSeasonChampion(ps.id);
            // Close the old pickem season + open a fresh one so the next
            // main season starts with an empty leaderboard.
            try {
              await db.getPool().query(
                `UPDATE pickem_seasons SET status = 'closed', ends_at = NOW()
                  WHERE id = $1 AND status = 'open'`, [ps.id]);
            } catch (_) {}
            try { await db.magV3.ensureDefaultPickemSeason(); } catch (_) {}
          }
        }
      } catch (e) {
        console.warn('[API] archiveSeason: pickem rollover failed:', e.message);
      }
      res.json({ season, pickem_award: pickemAward });
    } catch (err) {
      console.error('[API] archiveSeason:', err.message);
      res.status(500).json({ error: 'Failed to archive season' });
    }
  });

  // --- Season Buy-in Routes ---

  router.put('/seasons/:id/buyin-amount', authMiddleware, async (req, res) => {
    try {
      const seasonId = parseInt(req.params.id);
      const { amount_cents } = req.body;
      if (typeof amount_cents !== 'number' || amount_cents < 0) {
        return res.status(400).json({ error: 'amount_cents must be a non-negative number' });
      }
      const season = await db.setSeasonBuyinAmount(seasonId, amount_cents);
      if (!season) return res.status(404).json({ error: 'Season not found' });
      res.json({ season });
    } catch (err) {
      console.error('[API] Error setting buyin amount:', err.message);
      res.status(500).json({ error: 'Failed to set buy-in amount' });
    }
  });

  router.get('/seasons/:id/buyins', async (req, res) => {
    try {
      const seasonId = parseInt(req.params.id);
      const data = await db.getSeasonBuyins(seasonId);
      res.json(data);
    } catch (err) {
      console.error('[API] Error fetching buyins:', err.message);
      res.status(500).json({ error: 'Failed to fetch buy-ins' });
    }
  });

  router.post('/buyin/create-checkout', async (req, res) => {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const { season_id, display_name, account_id } = req.body;
      if (!season_id || !display_name || !display_name.trim()) {
        return res.status(400).json({ error: 'season_id and display_name are required' });
      }
      const seasons = await db.getSeasons();
      const season = seasons.find(s => s.id === parseInt(season_id));
      if (!season) return res.status(404).json({ error: 'Season not found' });
      if (!season.buyin_amount_cents || season.buyin_amount_cents <= 0) {
        return res.status(400).json({ error: 'This season does not have a buy-in configured' });
      }

      const baseUrl = process.env.SITE_URL || `http://170.64.182.110:5000`;

      const session = await stripe.checkout.sessions.create({
        automatic_payment_methods: { enabled: true },
        line_items: [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: `${season.name} Season Buy-in`,
              description: `Inhouse season buy-in for ${display_name.trim()}`,
            },
            unit_amount: season.buyin_amount_cents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/buyin-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/seasons`,
        metadata: {
          season_id: String(season_id),
          display_name: display_name.trim(),
          account_id: account_id ? String(account_id) : '',
        },
      });

      await db.createBuyin(
        parseInt(season_id),
        account_id || null,
        display_name.trim(),
        season.buyin_amount_cents,
        session.id
      );

      res.json({ url: session.url });
    } catch (err) {
      console.error('[API] Error creating checkout session:', err.message);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  router.get('/buyin/confirm', async (req, res) => {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const { session_id } = req.query;
      if (!session_id) return res.status(400).json({ error: 'session_id required' });

      const existing = await db.getBuyinBySession(session_id);
      if (!existing) return res.status(404).json({ error: 'Buy-in record not found' });
      if (existing.status === 'paid') return res.json({ buyin: existing, already_confirmed: true });

      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.payment_status !== 'paid') {
        return res.status(402).json({ error: 'Payment not completed', status: session.payment_status });
      }

      const buyin = await db.confirmBuyin(session_id);
      res.json({ buyin: buyin || existing, already_confirmed: false });
    } catch (err) {
      console.error('[API] Error confirming buyin:', err.message);
      res.status(500).json({ error: 'Failed to confirm buy-in' });
    }
  });

  router.get('/seasons/:id/summary', async (req, res) => {
    try {
      const seasonId = parseInt(req.params.id);
      if (!Number.isFinite(seasonId)) return res.status(400).json({ error: 'Invalid season id' });
      const [seasonR, summary] = await Promise.all([
        db.getPool().query(`SELECT * FROM seasons WHERE id = $1`, [seasonId]),
        db.getSeasonSummary(seasonId),
      ]);
      if (!seasonR.rows[0]) return res.status(404).json({ error: 'Season not found' });
      res.json({ season: seasonR.rows[0], summary });
    } catch (err) {
      console.error('[API] Season summary error:', err.message);
      res.status(500).json({ error: 'Failed to fetch season summary' });
    }
  });

  router.put('/seasons/:id/end-conditions', authMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid season id' });
      const { end_date, match_count_limit } = req.body;

      if (end_date != null && end_date !== '') {
        const d = new Date(end_date);
        if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid end_date — must be an ISO 8601 date string' });
      }
      if (match_count_limit != null && match_count_limit !== '') {
        const n = parseInt(match_count_limit);
        if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: 'Invalid match_count_limit — must be a positive integer' });
      }

      const season = await db.setSeasonEndConditions(id, {
        endDate: end_date || null,
        matchCountLimit: match_count_limit != null && match_count_limit !== '' ? parseInt(match_count_limit) : null,
      });
      if (!season) return res.status(404).json({ error: 'Season not found' });
      res.json({ season });
    } catch (err) {
      console.error('[API] setSeasonEndConditions error:', err.message);
      res.status(500).json({ error: 'Failed to update end conditions' });
    }
  });

  router.post('/seasons/:id/close', requireSuperuser, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid season id' });
      const { rows } = await db.getPool().query(`SELECT * FROM seasons WHERE id = $1`, [id]);
      if (!rows[0]) return res.status(404).json({ error: 'Season not found' });
      if (rows[0].is_legacy) return res.status(400).json({ error: `Season "${rows[0].name}" is already archived. Use the Repost Announcement button to resend the Discord embed.` });
      const bot = getDiscordBot();
      if (bot && typeof bot.closeSeasonManually === 'function') {
        await bot.closeSeasonManually(id);
        res.json({ success: true, message: `Season "${rows[0].name}" closed — summary announced on Discord.` });
      } else {
        await db.archiveSeason(id);
        res.json({ success: true, archived_only: true, message: `Season "${rows[0].name}" archived. Discord bot is unavailable — no announcement was posted and next-season activation did not run. Restart the bot and use the re-announce feature.` });
      }
    } catch (err) {
      console.error('[API] closeSeason error:', err.message);
      res.status(500).json({ error: 'Failed to close season' });
    }
  });

  router.post('/seasons/:id/announce', requireSuperuser, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid season id' });
      const { rows } = await db.getPool().query(`SELECT * FROM seasons WHERE id = $1`, [id]);
      if (!rows[0]) return res.status(404).json({ error: 'Season not found' });
      if (!rows[0].is_legacy) return res.status(400).json({ error: 'Season is not archived — use Close Season to close and announce for the first time' });
      const bot = getDiscordBot();
      if (!bot || typeof bot.postSeasonAnnouncement !== 'function') {
        return res.status(503).json({ error: 'Discord bot is unavailable — cannot post announcement' });
      }
      await bot.postSeasonAnnouncement(id);
      res.json({ success: true, message: `End-of-season announcement for "${rows[0].name}" reposted to Discord.` });
    } catch (err) {
      console.error('[API] reannounce season error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to repost announcement' });
    }
  });

  router.delete('/seasons/:id', requireSuperuser, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await db.deleteSeason(id);
      if (!deleted) return res.status(404).json({ error: 'Season not found' });
      res.json({ success: true, deleted });
    } catch (err) {
      console.error('[API] Error deleting season:', err.message);
      if (err.message && err.message.includes('foreign key')) {
        return res.status(409).json({ error: 'Cannot delete a season that has matches assigned to it. Remove those matches first or reassign them.' });
      }
      res.status(500).json({ error: 'Failed to delete season' });
    }
  });

  router.get('/seasons/:id/payouts', async (req, res) => {
    try {
      const payouts = await db.getSeasonPayouts(parseInt(req.params.id));
      res.json({ payouts });
    } catch (err) {
      console.error('[API] Error fetching payouts:', err.message);
      res.status(500).json({ error: 'Failed to fetch payouts' });
    }
  });

  router.post('/seasons/:id/payouts', authMiddleware, async (req, res) => {
    try {
      const seasonId = parseInt(req.params.id);
      const { category_type, label, amount_cents, notes, payout_mode, amount_percent } = req.body;
      if (!category_type || !label) {
        return res.status(400).json({ error: 'category_type and label are required' });
      }
      const mode = payout_mode === 'percent' ? 'percent' : 'cents';
      if (mode === 'cents' && typeof amount_cents !== 'number') {
        return res.status(400).json({ error: 'amount_cents required for fixed mode' });
      }
      if (mode === 'percent' && (typeof amount_percent !== 'number' || amount_percent < 0 || amount_percent > 100)) {
        return res.status(400).json({ error: 'amount_percent must be 0–100' });
      }
      const payout = await db.addSeasonPayout(seasonId, category_type, label, amount_cents || 0, notes, mode, amount_percent || 0);
      res.json({ payout });
    } catch (err) {
      console.error('[API] Error adding payout:', err.message);
      res.status(500).json({ error: 'Failed to add payout category' });
    }
  });

  router.delete('/seasons/:id/payouts/:payoutId', authMiddleware, async (req, res) => {
    try {
      await db.deleteSeasonPayout(parseInt(req.params.payoutId));
      res.json({ success: true });
    } catch (err) {
      console.error('[API] Error deleting payout:', err.message);
      res.status(500).json({ error: 'Failed to delete payout' });
    }
  });

  router.put('/seasons/:id/payouts/:payoutId/winner', authMiddleware, async (req, res) => {
    try {
      const { winner_account_id, winner_display_name } = req.body;
      const payout = await db.setPayoutWinner(
        parseInt(req.params.payoutId),
        winner_account_id || null,
        winner_display_name || null
      );
      res.json({ payout });
    } catch (err) {
      console.error('[API] Error setting winner:', err.message);
      res.status(500).json({ error: 'Failed to set winner' });
    }
  });

  router.put('/matches/:matchId/meta', authMiddleware, express.json(), async (req, res) => {
    try {
      const { patch, seasonId, date } = req.body;
      console.log(`[API] updateMatchMeta: matchId=${req.params.matchId}, patch=${patch}, seasonId=${seasonId}, date=${date}`);
      await db.updateMatchMeta(req.params.matchId, { patch, seasonId, date });
      res.json({ success: true });
    } catch (err) {
      console.error('[API] Error updating match meta:', err.message);
      res.status(500).json({ error: err.message || 'Failed to update match' });
    }
  });

  router.put('/matches/:matchId/winner', requireSuperuser, express.json(), async (req, res) => {
    try {
      const { radiantWin } = req.body;
      if (typeof radiantWin !== 'boolean') {
        return res.status(400).json({ error: 'radiantWin must be a boolean' });
      }
      const result = await db.setMatchWinner(req.params.matchId, radiantWin, req.session?.user?.steamId || 'admin');
      if (!result) return res.status(404).json({ error: 'Match not found' });
      console.log(`[Admin] Match ${req.params.matchId} winner corrected to ${radiantWin ? 'Radiant' : 'Dire'} — recalculating all ratings...`);
      await db.recalculateAllRatings();
      console.log(`[Admin] Ratings recalculated after winner correction on match ${req.params.matchId}`);
      res.json({ success: true, matchId: result.match_id, radiantWin: result.radiant_win, ratingsRecalculated: true });
    } catch (err) {
      console.error('[API] Error correcting match winner:', err.message);
      res.status(500).json({ error: err.message || 'Failed to update winner' });
    }
  });

  router.get('/synergy/heatmap', requirePro('synergy_heatmap'), async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const data = await db.getSynergyHeatmap(seasonId);
      res.json(data);
    } catch (err) {
      console.error('[API] Error fetching synergy heatmap:', err.message);
      res.status(500).json({ error: 'Failed to fetch synergy heatmap' });
    }
  });

  router.get('/enemy-synergy/heatmap', requirePro('synergy_heatmap'), async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const data = await db.getEnemySynergyHeatmap(seasonId);
      res.json(data);
    } catch (err) {
      console.error('[API] Error fetching enemy synergy heatmap:', err.message);
      res.status(500).json({ error: 'Failed to fetch enemy synergy heatmap' });
    }
  });

  router.post('/matches/:matchId/clear-hash', authMiddleware, async (req, res) => {
    try {
      await db.clearMatchFileHash(req.params.matchId);
      res.json({ success: true, message: 'File hash cleared — replay can now be re-uploaded.' });
    } catch (err) {
      console.error('[API] Error clearing file hash:', err.message);
      res.status(500).json({ error: 'Failed to clear file hash' });
    }
  });

  // ── Steam Bot Controls ────────────────────────────────────────────────────
  function tryGetSteamClient() {
    try { return require('../steam/steamClient').getSteamClient(); } catch { return null; }
  }
  function tryGetLobbyManager() {
    try { return require('../lobby/lobbyManager').getLobbyManager(); } catch { return null; }
  }

  /** Convert any Steam ID format to Steam64 string */
  function parseSteamIdToSteam64(raw) {
    const input = (raw || '').trim();
    const MIN = 76561197960265728n;
    // Steam2: STEAM_0:Y:Z or STEAM_1:Y:Z
    const s2 = input.match(/^STEAM_[01]:(\d+):(\d+)$/i);
    if (s2) return (MIN + BigInt(s2[2]) * 2n + BigInt(s2[1])).toString();
    // Steam3: [U:1:N]
    const s3 = input.match(/^\[U:1:(\d+)\]$/i);
    if (s3) return (MIN + BigInt(s3[1])).toString();
    // Steam64
    if (/^\d{17}$/.test(input)) return input;
    // Account ID (32-bit)
    if (/^\d{1,10}$/.test(input)) return (MIN + BigInt(input)).toString();
    throw new Error(`Unrecognised Steam ID format: ${input}`);
  }

  router.get('/admin/steam/status', requireSuperuser, (req, res) => {
    try {
      const steam = tryGetSteamClient();
      const lobby = tryGetLobbyManager();
      const friends = steam?.steamClient?.myFriends || {};
      const friendCount = Object.values(friends).filter(v => v === 3).length;
      const lobbyStatus = lobby ? lobby.getStatus() : null;
      res.json({
        steamConnected: !!steam?.isLoggedIn,
        gcReady: !!steam?.isGCReady,
        friendCount,
        lobby: lobbyStatus,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/steam/lobby/create', requireSuperuser, express.json(), async (req, res) => {
    try {
      const lobby = tryGetLobbyManager();
      if (!lobby) return res.status(503).json({ error: 'Lobby manager not available' });
      const { name, password } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const result = await lobby.createLobby(name, password || '', 'web-admin');
      res.json({ ok: true, lobby: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/steam/lobby/join', requireSuperuser, express.json(), async (req, res) => {
    try {
      const lobby = tryGetLobbyManager();
      if (!lobby) return res.status(503).json({ error: 'Lobby manager not available' });
      const { lobbyId, password } = req.body;
      if (!lobbyId) return res.status(400).json({ error: 'lobbyId is required' });
      const result = await lobby.joinLobby(lobbyId, password || '', 'web-admin');
      res.json({ ok: true, lobby: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/steam/lobby/end', requireSuperuser, async (req, res) => {
    try {
      const lobby = tryGetLobbyManager();
      if (!lobby) return res.status(503).json({ error: 'Lobby manager not available' });
      await lobby.endLobby();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/steam/lobby/invite', requireSuperuser, express.json(), async (req, res) => {
    try {
      const lobby = tryGetLobbyManager();
      if (!lobby) return res.status(503).json({ error: 'Lobby manager not available' });
      const { steamId } = req.body;
      if (!steamId) return res.status(400).json({ error: 'steamId is required' });
      const steam64 = parseSteamIdToSteam64(steamId);
      const ok = lobby.invitePlayer(steam64);
      res.json({ ok: !!ok, steam64 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/steam/lobby/start', requireSuperuser, async (req, res) => {
    try {
      const lobby = tryGetLobbyManager();
      if (!lobby) return res.status(503).json({ error: 'Lobby manager not available' });
      if (lobby._countdownTimer) lobby._abortCountdown();
      lobby.launchLobby();
      res.json({ ok: true, message: 'Game launch requested.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/steam/friends/add-all', requireSuperuser, async (req, res) => {
    try {
      const steam = tryGetSteamClient();
      if (!steam?.isLoggedIn) return res.status(503).json({ error: 'Steam not connected' });
      const accountIds = await db.getAllSteamAccountIds();
      res.json({ ok: true, count: accountIds.length, message: `Sending friend requests to ${accountIds.length} players in the background...` });
      // Run non-blocking after response
      steam.addAllKnownFriends(accountIds).catch(e => console.error('[Admin] addAllKnownFriends:', e.message));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  // ─────────────────────────────────────────────────────────────────────────

  router.post('/admin/recalculate-ratings', requireSuperuser, async (req, res) => {
    try {
      console.log('[API] Recalculating all TrueSkill ratings...');
      await db.recalculateAllRatings();
      res.json({ success: true, message: 'Ratings and rating history recalculated from all match history.' });
    } catch (err) {
      console.error('[API] Error recalculating ratings:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Reparse a single stored replay for a given match (updates stats, preserves season).
  router.post('/admin/reparse-replay/:matchId', requireSuperuser, express.json(), async (req, res) => {
    try {
      const { matchId } = req.params;
      const row = await db.getReplayFilePath(matchId);
      if (!row || !row.replay_file_path) {
        return res.status(404).json({ error: 'No replay file stored for this match.' });
      }
      if (!fs.existsSync(row.replay_file_path)) {
        return res.status(404).json({ error: 'Replay file no longer exists on disk.' });
      }
      const replayParser = getReplayParser();
      if (!replayParser?.parserReady) {
        return res.status(503).json({ error: 'Replay parser is not available.' });
      }
      console.log(`[Admin] Re-parsing stored replay for match ${matchId}...`);
      const matchStats = await replayParser.parseReplayFull(row.replay_file_path);
      if (!matchStats || matchStats.matchId.toString() !== matchId.toString()) {
        return res.status(400).json({ error: `Replay match ID mismatch: file contains ${matchStats?.matchId}, expected ${matchId}.` });
      }
      const result = await db.reparseMatchFromStats(matchId, matchStats, req.body?.patch || null);
      if (!result) return res.status(404).json({ error: 'Match not found in database.' });
      console.log(`[Admin] Re-parse complete for match ${matchId}. Recalculating ratings...`);
      await db.recalculateAllRatings();
      res.json({ success: true, matchId, radiantWin: matchStats.radiantWin, message: 'Match reparsed and ratings recalculated.' });
    } catch (err) {
      console.error(`[Admin] Reparse error for match ${req.params.matchId}:`, err.message);
      await db.logServerError('error', 'admin/reparse-replay', err.message, { matchId: req.params.matchId, stack: err.stack });
      res.status(500).json({ error: err.message });
    }
  });

  // Queue all stored replays for re-parsing (one at a time, async).
  const reparseQueue = [];
  let reparseRunning = false;
  let reparseStatus = null;

  async function drainReparseQueue() {
    if (reparseRunning) return;
    reparseRunning = true;
    while (reparseQueue.length > 0) {
      const { matchId, filePath } = reparseQueue.shift();
      try {
        const replayParser = getReplayParser();
        const matchStats = await replayParser.parseReplayFull(filePath);
        if (matchStats && matchStats.matchId.toString() === matchId.toString()) {
          await db.reparseMatchFromStats(matchId, matchStats, null);
          reparseStatus.done++;
          console.log(`[Admin] Re-parsed ${matchId} (${reparseStatus.done}/${reparseStatus.total})`);
        } else {
          reparseStatus.failed++;
          reparseStatus.errors.push(`${matchId}: match ID mismatch`);
        }
      } catch (err) {
        reparseStatus.failed++;
        reparseStatus.errors.push(`${matchId}: ${err.message}`);
        console.error(`[Admin] Reparse-all error for ${matchId}:`, err.message);
      }
      reparseStatus.remaining = reparseQueue.length;
    }
    if (reparseStatus) {
      console.log(`[Admin] Reparse-all complete. Recalculating ratings...`);
      try { await db.recalculateAllRatings(); } catch (e) { console.error('[Admin] Reparse-all rating recalc error:', e.message); }
      reparseStatus.phase = 'complete';
    }
    reparseRunning = false;
  }

  // --- DB Backup helpers ---

  async function createDbBackup(label) {
    const p = db.getPool();
    const now = new Date();
    const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const slug = label ? `${label}_${ts}` : ts;
    const safe = slug.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    await p.query(`CREATE TABLE player_stats_bak_${safe} AS SELECT * FROM player_stats`);
    await p.query(`CREATE TABLE ratings_bak_${safe} AS SELECT * FROM ratings`);
    await p.query(`CREATE TABLE rating_history_bak_${safe} AS SELECT * FROM rating_history`);
    return safe;
  }

  async function listDbBackups() {
    const p = db.getPool();
    const res = await p.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE 'player_stats_bak_%'
      ORDER BY table_name DESC
    `);
    return res.rows.map(r => r.table_name.replace('player_stats_bak_', ''));
  }

  router.post('/admin/backup-db', requireSuperuser, async (req, res) => {
    try {
      const label = (req.body?.label || 'manual').replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 20);
      const slug = await createDbBackup(label);
      res.json({ success: true, backup: slug, message: `Backup created: ${slug}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/admin/list-backups', requireSuperuser, async (req, res) => {
    try {
      const backups = await listDbBackups();
      res.json({ backups });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/restore-backup', requireSuperuser, async (req, res) => {
    const { backup } = req.body || {};
    if (!backup || !/^[a-z0-9_]+$/i.test(backup)) {
      return res.status(400).json({ error: 'Invalid backup name.' });
    }
    const p = db.getPool();
    const client = await p.connect();
    try {
      const check = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      `, [`player_stats_bak_${backup}`]);
      if (check.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'Backup not found.' });
      }
      await client.query('BEGIN');
      await client.query(`DELETE FROM player_stats`);
      await client.query(`INSERT INTO player_stats SELECT * FROM player_stats_bak_${backup}`);
      await client.query(`DELETE FROM ratings`);
      await client.query(`INSERT INTO ratings SELECT * FROM ratings_bak_${backup}`);
      await client.query(`DELETE FROM rating_history`);
      await client.query(`INSERT INTO rating_history SELECT * FROM rating_history_bak_${backup}`);
      await client.query('COMMIT');
      client.release();
      res.json({ success: true, message: `Restored from backup: ${backup}` });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      client.release();
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/admin/delete-backup/:backup', requireSuperuser, async (req, res) => {
    const backup = req.params.backup;
    if (!backup || !/^[a-z0-9_]+$/i.test(backup)) {
      return res.status(400).json({ error: 'Invalid backup name.' });
    }
    try {
      const p = db.getPool();
      await p.query(`DROP TABLE IF EXISTS player_stats_bak_${backup}`);
      await p.query(`DROP TABLE IF EXISTS ratings_bak_${backup}`);
      await p.query(`DROP TABLE IF EXISTS rating_history_bak_${backup}`);
      res.json({ success: true, message: `Deleted backup: ${backup}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fix wrong account IDs in the nicknames table by comparing a backup (pre-reparse)
  // against the current player_stats (post-reparse) on match_id+slot.
  router.post('/admin/fix-nickname-account-ids', requireSuperuser, async (req, res) => {
    const p = db.getPool();
    try {
      // Find the most recent pre_reparse backup (or any backup if specified)
      const backupArg = req.body?.backup || null;
      let backupSlug = backupArg;

      if (!backupSlug) {
        const found = await p.query(`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name LIKE 'player_stats_bak_%'
          ORDER BY table_name DESC LIMIT 1
        `);
        if (found.rows.length === 0) return res.status(404).json({ error: 'No backup tables found. Please specify a backup or create one first.' });
        backupSlug = found.rows[0].table_name.replace('player_stats_bak_', '');
      }

      const bakTable = `player_stats_bak_${backupSlug}`;

      // Verify backup exists
      const check = await p.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
        [bakTable]
      );
      if (check.rows.length === 0) return res.status(404).json({ error: `Backup table ${bakTable} not found.` });

      // Build mapping: old account_id (from backup) → new account_id (current player_stats)
      // Join on match_id + slot. Count occurrences of each old→new pair across all matches
      // so we can use majority vote when a collision occurs (two different real players
      // happened to get the same wrong ID due to float64 rounding).
      const mappingRes = await p.query(`
        SELECT bak.account_id AS old_id, ps.account_id AS new_id, COUNT(*) AS occurrences
        FROM ${bakTable} bak
        JOIN player_stats ps ON ps.match_id = bak.match_id AND ps.slot = bak.slot
        WHERE bak.account_id IS NOT NULL
          AND ps.account_id IS NOT NULL
          AND bak.account_id != ps.account_id
          AND bak.account_id > 0
          AND ps.account_id > 0
        GROUP BY bak.account_id, ps.account_id
        ORDER BY bak.account_id, occurrences DESC
      `);

      if (mappingRes.rows.length === 0) {
        return res.json({ success: true, updated: 0, message: 'No account ID differences found between backup and current player_stats. Nicknames are already correct, or backup matches current data.' });
      }

      // Resolve mapping using majority vote: for each old_id, pick the new_id that
      // appears in the most matches. If two candidates are tied, skip and report.
      const grouped = {};
      for (const { old_id, new_id, occurrences } of mappingRes.rows) {
        const key = old_id.toString();
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push({ new_id: new_id.toString(), occurrences: parseInt(occurrences) });
      }

      const oldToNew = {};
      const skippedConflicts = [];
      for (const [oldId, candidates] of Object.entries(grouped)) {
        if (candidates.length === 1) {
          // Unambiguous
          oldToNew[oldId] = candidates[0].new_id;
        } else {
          // Multiple candidates — pick the one with the most matches
          candidates.sort((a, b) => b.occurrences - a.occurrences);
          if (candidates[0].occurrences > candidates[1].occurrences) {
            // Clear winner by majority
            oldToNew[oldId] = candidates[0].new_id;
          } else {
            // Genuine tie — skip and report
            skippedConflicts.push({ old_id: oldId, candidates });
          }
        }
      }

      // Apply mapping to nicknames table
      let updated = 0;
      const notFound = [];
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        for (const [oldId, newId] of Object.entries(oldToNew)) {
          const r = await client.query(
            `UPDATE nicknames SET account_id = $1, dota_rank_updated_at = NULL, dota_rank_tier = NULL, dota_rank_source = NULL, dota_leaderboard_rank = NULL
             WHERE account_id = $2`,
            [parseInt(newId), parseInt(oldId)]
          );
          if (r.rowCount > 0) {
            updated++;
          } else {
            notFound.push(oldId);
          }
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        client.release();
        throw err;
      }
      client.release();

      const skippedMsg = skippedConflicts.length > 0
        ? ` ${skippedConflicts.length} IDs skipped (genuine tie — set those manually via Rank Management).`
        : '';
      return res.json({
        success: true,
        updated,
        total_mapped: Object.keys(oldToNew).length,
        not_in_nicknames: notFound.length,
        skipped_conflicts: skippedConflicts.length,
        skipped_details: skippedConflicts.slice(0, 5),
        backup_used: backupSlug,
        message: `Updated ${updated} nickname account IDs.${skippedMsg} Rank data cleared — run rank sync to re-fetch.`
      });

    } catch (err) {
      console.error('[Admin] fix-nickname-account-ids error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- End DB Backup helpers ---

  router.post('/admin/reparse-all-replays', requireSuperuser, async (req, res) => {
    if (reparseRunning) {
      return res.json({ running: true, status: reparseStatus });
    }
    const skipBackup = req.body?.skipBackup === true;
    const p = db.getPool();
    const rows = await p.query(`SELECT match_id, replay_file_path FROM matches WHERE replay_file_path IS NOT NULL ORDER BY date ASC`);
    const available = rows.rows.filter(r => r.replay_file_path && fs.existsSync(r.replay_file_path));
    if (available.length === 0) {
      return res.json({ success: true, queued: 0, message: 'No stored replay files found on disk.' });
    }
    let backupSlug = null;
    if (!skipBackup) {
      try {
        backupSlug = await createDbBackup('pre_reparse');
        console.log(`[Admin] Pre-reparse backup created: ${backupSlug}`);
      } catch (err) {
        console.error('[Admin] Backup failed before reparse:', err.message);
        return res.status(500).json({ error: `Backup failed: ${err.message}. Reparse aborted. Use skipBackup:true to force without backup.` });
      }
    }
    reparseStatus = { total: available.length, done: 0, failed: 0, remaining: available.length, errors: [], phase: 'running', backup: backupSlug };
    reparseQueue.length = 0;
    for (const r of available) reparseQueue.push({ matchId: r.match_id, filePath: r.replay_file_path });
    drainReparseQueue();
    res.json({ success: true, queued: available.length, backup: backupSlug, message: `Queued ${available.length} replays for re-parsing.${backupSlug ? ` Backup: ${backupSlug}` : ''}` });
  });

  router.get('/admin/reparse-all-status', requireSuperuser, async (req, res) => {
    res.json({ running: reparseRunning, status: reparseStatus });
  });

  // Set all stored replays to never expire.
  router.post('/admin/replays/set-all-permanent', requireSuperuser, async (req, res) => {
    try {
      const p = db.getPool();
      const result = await p.query(
        `UPDATE matches SET replay_file_expires_at = NULL WHERE replay_file_path IS NOT NULL RETURNING match_id`
      );
      res.json({ success: true, updated: result.rowCount, message: `${result.rowCount} replays set to never expire.` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Server error log viewer (for Replit diagnostics).
  router.get('/admin/error-log', requireSuperuser, async (req, res) => {
    try {
      const level = req.query.level || null;
      const limit = Math.min(parseInt(req.query.limit || '100'), 500);
      const logs = await db.getServerLogs(limit, level);
      res.json({ logs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/admin/error-log', requireSuperuser, async (req, res) => {
    try {
      const p = db.getPool();
      const olderThan = req.query.days ? parseInt(req.query.days) : 30;
      await p.query(`DELETE FROM server_logs WHERE created_at < NOW() - ($1 || ' days')::INTERVAL`, [olderThan]);
      res.json({ success: true, message: `Cleared logs older than ${olderThan} days.` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/admin/overview', requireSuperuser, async (req, res) => {
    try {
      const p = db.getPool();
      const [matchCount, playerCount, manualCount, activeSeason] = await Promise.all([
        p.query(`SELECT COUNT(*) FROM matches WHERE is_legacy = false`),
        p.query(`SELECT COUNT(DISTINCT account_id) FROM player_stats WHERE account_id != 0`),
        p.query(`SELECT COUNT(*) FROM matches WHERE parse_method = 'manual'`),
        p.query(`SELECT * FROM seasons WHERE active = true LIMIT 1`),
      ]);
      res.json({
        totalMatches: parseInt(matchCount.rows[0].count),
        totalPlayers: parseInt(playerCount.rows[0].count),
        manualMatches: parseInt(manualCount.rows[0].count),
        activeSeason: activeSeason.rows[0] || null,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/matches/manual', requireSuperuser, express.json(), async (req, res) => {
    try {
      const { date, duration, radiantWin, players, lobbyName, patch, seasonId } = req.body;
      if (!players || !Array.isArray(players) || players.length !== 10) {
        return res.status(400).json({ error: 'Exactly 10 players required.' });
      }
      const radiantPlayers = players.filter(p => p.team === 'radiant');
      const direPlayers = players.filter(p => p.team === 'dire');
      if (radiantPlayers.length !== 5 || direPlayers.length !== 5) {
        return res.status(400).json({ error: 'Must have exactly 5 Radiant and 5 Dire players.' });
      }
      const matchId = await db.createManualMatch({ date, duration, radiantWin, players, lobbyName, patch, seasonId, createdBy: 'admin' });
      await db.recalculateAllRatings();
      res.json({ success: true, matchId });
    } catch (err) {
      console.error('[API] Error creating manual match:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/matches/:matchId/position', authMiddleware, async (req, res) => {
    try {
      const { slot, position } = req.body;
      if (slot == null || position == null || position < 0 || position > 5) {
        return res.status(400).json({ error: 'Invalid slot or position (0-5)' });
      }
      await db.updatePlayerPosition(req.params.matchId, slot, position);
      res.json({ success: true });
    } catch (err) {
      console.error('[API] Error updating position:', err.message);
      res.status(500).json({ error: 'Failed to update position' });
    }
  });

  router.get('/players/:accountId/heroes', async (req, res) => {
    try {
      const heroes = await db.getPlayerHeroes(req.params.accountId);
      res.json({ heroes });
    } catch (err) {
      console.error('[API] Error fetching player heroes:', err.message);
      res.status(500).json({ error: 'Failed to fetch player heroes' });
    }
  });

  router.get('/players/:accountId/positions', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const ids = await db.getMergedAccountIds(req.params.accountId);
      const positions = await db.getPlayerPositions(req.params.accountId, seasonId, ids);
      res.json({ positions });
    } catch (err) {
      console.error('[API] Error fetching player positions:', err.message);
      res.status(500).json({ error: 'Failed to fetch player positions' });
    }
  });

  const inspectUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => { ensureDir(UPLOAD_DIR); cb(null, UPLOAD_DIR); },
      filename: (req, file, cb) => { cb(null, `inspect-${Date.now()}-${Math.random().toString(36).slice(2)}.dem`); },
    }),
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.originalname.endsWith('.dem') || file.mimetype === 'application/octet-stream') cb(null, true);
      else cb(new Error('Only .dem files are accepted'));
    },
  });

  router.post('/replay-inspect', requireSuperuser, inspectUpload.single('replay'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No .dem file provided' });
    const filePath = req.file.path;
    try {
      const parser = getReplayParser();
      if (!parser?.parserReady) {
        return res.status(503).json({ error: 'Parser service not running. Start the bot first.' });
      }
      const result = await parser.parseReplayFull(filePath);
      const players = (result.players || []).map(p => ({
        slot: p.slot,
        account_id: p.accountId || 0,
        steam64: p.accountId ? String(BigInt('76561197960265728') + BigInt(p.accountId)) : null,
        persona_name: p.personaname || p.personaName || '',
        hero_name: p.heroName || '',
        hero_id: p.heroId || 0,
        team: p.team || (p.slot < 5 ? 'radiant' : 'dire'),
        kills: p.kills || 0,
        deaths: p.deaths || 0,
        assists: p.assists || 0,
      }));
      res.json({
        match_id: result.matchId || null,
        duration: result.duration || null,
        radiant_win: result.radiantWin ?? null,
        players,
      });
    } catch (err) {
      console.error('[API] Replay inspect error:', err.message);
      res.status(500).json({ error: err.message });
    } finally {
      try { fs.unlinkSync(filePath); } catch {}
    }
  });

  router.post('/upload/init', authMiddleware, (req, res) => {
    const parserCheck = getReplayParser();
    if (!parserCheck?.parserReady) {
      return res.status(503).json({ error: 'Parser service is not running. Replay parsing unavailable.' });
    }
    const { fileName, fileSize, totalChunks, patch } = req.body;
    if (!fileName || !fileSize || !totalChunks) {
      return res.status(400).json({ error: 'Missing fileName, fileSize, or totalChunks' });
    }
    if (!fileName.endsWith('.dem') && !fileName.endsWith('.dem.bz2')) {
      return res.status(400).json({ error: 'Only .dem replay files are accepted' });
    }
    const parsedSize = parseInt(fileSize);
    const parsedChunks = parseInt(totalChunks);
    if (isNaN(parsedSize) || parsedSize <= 0 || parsedSize > 300 * 1024 * 1024) {
      return res.status(400).json({ error: 'Invalid file size (max 300MB)' });
    }
    if (isNaN(parsedChunks) || parsedChunks <= 0 || parsedChunks > 1000) {
      return res.status(400).json({ error: 'Invalid chunk count' });
    }

    const jobId = crypto.randomBytes(8).toString('hex');
    const jobChunkDir = path.join(CHUNK_DIR, jobId);
    ensureDir(jobChunkDir);

    uploadJobs.set(jobId, {
      status: 'uploading',
      fileName,
      fileSize: parsedSize,
      totalChunks: parsedChunks,
      chunksReceived: new Set(),
      startedAt: Date.now(),
      patch: patch ? patch.trim() : null,
    });

    console.log(`[API] Upload init: job=${jobId}, file=${fileName}, size=${(parsedSize / 1024 / 1024).toFixed(1)}MB, chunks=${parsedChunks}, patch=${patch || 'none'}`);
    res.json({ jobId });
  });

  const chunkUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  router.post('/upload/chunk/:jobId', authMiddleware, chunkUpload.single('chunk'), async (req, res) => {
    try {
      const { jobId } = req.params;
      const chunkIndex = parseInt(req.headers['x-chunk-index']);
      const job = uploadJobs.get(jobId);

      if (!job) return res.status(404).json({ error: 'Job not found — server may have restarted, please retry the upload' });
      if (job.status !== 'uploading') return res.status(400).json({ error: `Job not accepting chunks (status: ${job.status})` });
      if (isNaN(chunkIndex) || chunkIndex < 0 || chunkIndex >= job.totalChunks) {
        return res.status(400).json({ error: `Invalid chunk index: ${chunkIndex}` });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No chunk data received — ensure body is multipart/form-data with field "chunk"' });
      }

      const chunkPath = path.join(CHUNK_DIR, jobId, `chunk_${String(chunkIndex).padStart(5, '0')}`);
      await fs.promises.writeFile(chunkPath, req.file.buffer);
      console.log(`[Upload] Chunk ${chunkIndex} received: ${req.file.size} bytes, job=${jobId}`);
      job.chunksReceived.add(chunkIndex);
      res.json({ received: job.chunksReceived.size, total: job.totalChunks });
    } catch (err) {
      console.error(`[Upload] Chunk error:`, err.message);
      res.status(500).json({ error: `Chunk failed: ${err.message}` });
    }
  });

  router.post('/upload/complete/:jobId', authMiddleware, (req, res) => {
    const { jobId } = req.params;
    const job = uploadJobs.get(jobId);

    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'uploading') return res.status(400).json({ error: `Job in '${job.status}' state, not accepting complete` });

    job.status = 'assembling';
    uploadJobs.set(jobId, job);

    const jobChunkDir = path.join(CHUNK_DIR, jobId);
    const chunks = fs.readdirSync(jobChunkDir).filter(f => f.startsWith('chunk_')).sort();

    if (chunks.length !== job.totalChunks) {
      job.status = 'uploading';
      uploadJobs.set(jobId, job);
      return res.status(400).json({
        error: `Expected ${job.totalChunks} chunks, got ${chunks.length}`,
      });
    }

    const filePath = path.join(UPLOAD_DIR, `${jobId}.dem`);
    try {
      const writeStream = fs.createWriteStream(filePath);
      for (const chunk of chunks) {
        const data = fs.readFileSync(path.join(jobChunkDir, chunk));
        writeStream.write(data);
      }
      writeStream.end();

      writeStream.on('finish', () => {
        cleanupChunks(jobId);
        const assembledSize = fs.statSync(filePath).size;
        console.log(`[API] Chunks assembled: job=${jobId}, size=${(assembledSize / 1024 / 1024).toFixed(1)}MB`);

        uploadJobs.set(jobId, {
          status: 'processing',
          fileName: job.fileName,
          step: 'Parsing replay...',
          startedAt: job.startedAt,
          filePath,
        });

        res.json({ status: 'processing', message: 'File assembled, parsing started.' });

        enqueueParse(jobId, filePath, req.ip);
      });

      writeStream.on('error', (err) => {
        cleanupChunks(jobId);
        cleanupFile(filePath);
        console.error(`[API] Assembly error for job ${jobId}:`, err);
        setJobTerminal(jobId, { status: 'error', error: 'Failed to assemble file' });
        res.status(500).json({ error: 'Failed to assemble file' });
      });
    } catch (err) {
      cleanupChunks(jobId);
      cleanupFile(filePath);
      setJobTerminal(jobId, { status: 'error', error: 'Assembly failed: ' + err.message });
      res.status(500).json({ error: 'Assembly failed' });
    }
  });

  router.get('/upload/status/:jobId', (req, res) => {
    const job = uploadJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const { filePath, chunksReceived, ...safeJob } = job;
    if (safeJob.status === 'uploading') {
      safeJob.chunksReceived = chunksReceived ? chunksReceived.size : 0;
    }
    res.json(safeJob);
  });

  router.get('/available-stats', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="available_replay_stats.txt"');
    res.send(`Dota 2 Inhouse Bot - Available Replay Stats
=============================================
Stats extracted from .dem replay files via OpenDota parser.
All stats are per-player, per-match.

CORE STATS (from interval events - always available)
----------------------------------------------------
kills                  - Total kills
deaths                 - Total deaths
assists                - Total assists
last_hits              - Total last hits
denies                 - Total denies
gpm                    - Gold per minute (calculated)
xpm                    - XP per minute (calculated)
level                  - Final hero level
net_worth              - Final net worth (gold)
hero_id                - Hero ID number
hero_name              - Hero internal name (npc_dota_hero_*)
team                   - radiant or dire
slot                   - Player slot (0-9)
position               - Detected position 1-5 (carry to hard support)
is_captain             - Captain flag (slot 0 radiant, slot 5 dire)

COMBAT STATS (from combat log events)
--------------------------------------
hero_damage            - Total damage dealt to enemy heroes
tower_damage           - Total damage dealt to towers
hero_healing           - Total healing done to heroes
damage_taken           - Total damage received from enemy heroes

VISION/SUPPORT STATS (from interval + ward events)
---------------------------------------------------
obs_placed             - Observer wards placed
sen_placed             - Sentry wards placed
obs_purchased          - Observer wards purchased (includes dispensers)
sen_purchased          - Sentry wards purchased (includes dispensers)
wards_killed           - Enemy wards dewarded/destroyed
creeps_stacked         - Creeps stacked count
camps_stacked          - Camps stacked count

ADVANCED STATS (from interval events)
--------------------------------------
rune_pickups           - Total runes picked up
stun_duration          - Total stun duration dealt (seconds)
towers_killed          - Towers destroyed by this player
roshans_killed         - Roshan kills by this player
teamfight_participation - Teamfight participation percentage (0-1)
firstblood_claimed     - Whether this player got first blood (0/1)
first_death            - Whether this player died first in the match (0/1)
buybacks               - Number of buybacks used
courier_kills          - Enemy couriers killed
lane_cs_10min          - Last hits at 10 minutes

MULTI-KILL & STREAK STATS (from combat log events)
---------------------------------------------------
double_kills           - Double kill count
triple_kills           - Triple kill count
ultra_kills            - Ultra kill count
rampages               - Rampage count
kill_streak            - Longest kill streak

ITEM STATS (from purchase events + interval snapshots)
------------------------------------------------------
items                  - Final inventory (up to 9 slots including backpack)
has_scepter            - Whether player had Aghanim's Scepter
has_shard              - Whether player had Aghanim's Shard
tp_scrolls_used        - TP scrolls purchased (proxy for usage)
smoke_kills            - Kills made while under Smoke of Deceit

ABILITY/SKILL BUILD (from ability level events)
-----------------------------------------------
abilities              - Full skill build order with timestamps

PLAYER IDENTITY (from epilogue data)
-------------------------------------
account_id             - Steam account ID (derived from Steam64 ID)
persona_name           - Steam display name at time of match

MATCH-LEVEL DATA (from epilogue/interval)
------------------------------------------
match_id               - Valve match ID
duration               - Match duration in seconds
game_mode              - Game mode ID
radiant_win            - Whether radiant won (true/false)

CALCULATED AGGREGATES (available on stats pages)
-------------------------------------------------
kill_involvement       - (kills + assists) / team_kills * 100
win_rate               - wins / total_games * 100
captain_win_rate       - wins as captain / captain_games * 100

NOTES
-----
- Position detection uses first 10 min x/y coordinates + last hits.
  Lane classification: safe lane = carry (1) + hard support (5),
  mid lane = mid (2), off lane = offlaner (3) + soft support (4).
- Ward kills are detected from obs_left/sen_left events with an
  attackername, meaning the ward was killed (not expired).
- Stun duration is cumulative total seconds of stun dealt.
- Teamfight participation is Valve's internal metric.
- Items are captured from interval snapshots (item0-item8 fields).
  When interval items aren't available, falls back to purchase log.
- Ability build order is captured from DOTA_COMBATLOG_ABILITY_LEVEL events.
- Stats only populate for newly uploaded replays (not retroactive).
  Re-upload old replays to backfill.
`);
  });

  router.get('/stats', async (req, res) => {
    try {
      const matchCount = await db.getMatchCount();
      const leaderboard = await db.getLeaderboard(1000);
      res.json({
        totalMatches: matchCount,
        totalPlayers: leaderboard.length,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  router.get('/players/:accountId/rating-history', async (req, res) => {
    try {
      const history = await db.getPlayerRatingHistory(req.params.accountId);
      res.json({ history });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch rating history' });
    }
  });

  router.get('/players/:accountId/v3-modifier-history', async (req, res) => {
    try {
      const history = await db.getPlayerV3ModifierHistory(req.params.accountId);
      res.json({ history });
    } catch (err) {
      console.error('[API] v3-modifier-history error:', err.message);
      res.status(500).json({ error: 'Failed to fetch V3 modifier history' });
    }
  });

  router.get('/players/:accountId/achievements', async (req, res) => {
    try {
      const ids = await db.getMergedAccountIds(req.params.accountId);
      const achievements = await db.getPlayerAchievements(ids);
      res.json({ achievements });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch achievements' });
    }
  });

  router.get('/head-to-head', requirePro('head_to_head'), async (req, res) => {
    try {
      const { a, b, season_id } = req.query;
      if (!a || !b) return res.status(400).json({ error: 'Provide ?a=accountId&b=accountId' });
      const data = await db.getHeadToHead(a, b, season_id || null);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch head-to-head' });
    }
  });

  router.get('/compare', requirePro('compare_players'), async (req, res) => {
    try {
      const { a, b, season_id } = req.query;
      if (!a || !b) return res.status(400).json({ error: 'Provide ?a=accountId&b=accountId' });
      const data = await db.getPlayerComparison(a, b, season_id || null);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch comparison' });
    }
  });

  router.get('/draft-assistant', async (req, res) => {
    try {
      const parseIds = (str) => str ? str.split(',').map(Number).filter(Boolean) : [];
      const allies = parseIds(req.query.allies);
      const enemies = parseIds(req.query.enemies);
      const banned = parseIds(req.query.banned);
      const position = req.query.position ? parseInt(req.query.position) : null;
      const season_id = req.query.season_id || null;
      const suggestions = await db.getDraftSuggestions(allies, enemies, banned, position, season_id);
      res.json({ suggestions });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch draft suggestions' });
    }
  });

  router.get('/predictions/:seasonId', async (req, res) => {
    try {
      const predictions = await db.getPredictions(req.params.seasonId);
      res.json({ predictions });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch predictions' });
    }
  });

  router.post('/predictions/:seasonId', express.json(), async (req, res) => {
    try {
      const { predictor_name, predictions } = req.body;
      if (!predictor_name || !Array.isArray(predictions)) {
        return res.status(400).json({ error: 'Provide predictor_name and predictions array' });
      }
      await db.savePrediction(req.params.seasonId, predictor_name, predictions);

      const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        const picks = [...predictions].sort((a, b) => a.rank - b.rank)
          .map(p => `**#${p.rank}:** <@${p.player_id}>`)
          .join('\n');
        const siteUrl = process.env.SITE_URL || '';
        const fetch_ = (...a) => import('node-fetch').then(m => m.default(...a));
        fetch_(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `🎯 **${predictor_name}** submitted a season prediction!\n${picks}\n[View all predictions](${siteUrl}/predictions)`,
          }),
        }).catch(() => {});
      }

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save prediction' });
    }
  });

  router.get('/predictions/:seasonId/accuracy', async (req, res) => {
    try {
      const seasonId = parseInt(req.params.seasonId);
      const predictions = await db.getPredictions(seasonId);
      const pool = db.getPool();

      const topRows = await pool.query(`
        SELECT rh.player_id,
               COALESCE(MAX(n.nickname), MAX(ps.persona_name)) as display_name,
               MAX(rh.mmr) as mmr
        FROM rating_history rh
        JOIN matches m ON m.match_id = rh.match_id
        LEFT JOIN player_stats ps ON ps.account_id = rh.player_id AND ps.match_id = rh.match_id
        LEFT JOIN nicknames n ON n.account_id = rh.player_id
        WHERE m.season_id = $1
        GROUP BY rh.player_id
        ORDER BY MAX(rh.mmr) DESC
        LIMIT 5
      `, [seasonId]);

      const actualTop5 = topRows.rows.map((r, i) => ({
        rank: i + 1,
        player_id: r.player_id.toString(),
        display_name: r.display_name,
        mmr: parseInt(r.mmr),
      }));

      const actualSet = new Set(actualTop5.map(x => x.player_id));
      const actualByRank = {};
      actualTop5.forEach(a => { actualByRank[a.rank] = a.player_id; });

      const scored = predictions.map(pred => {
        const picks = Array.isArray(pred.predictions) ? pred.predictions : [];
        let score = 0, exactMatches = 0, inTop5 = 0;
        picks.forEach(pick => {
          const pid = pick.player_id?.toString();
          if (actualByRank[pick.rank] === pid) { score += 3; exactMatches++; inTop5++; }
          else if (actualSet.has(pid)) { score += 1; inTop5++; }
        });
        return { ...pred, score, exactMatches, inTop5 };
      }).sort((a, b) => b.score - a.score);

      res.json({ accuracy: scored, actual: actualTop5 });
    } catch (err) {
      console.error('[API] prediction accuracy error:', err.message);
      res.status(500).json({ error: 'Failed to fetch prediction accuracy' });
    }
  });

  router.get('/weekly-recap', async (req, res) => {
    try {
      const season_id = req.query.season_id || null;
      const data = await db.getWeeklyRecap(season_id);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch weekly recap' });
    }
  });

  // Player-of-the-Week PERF spotlight: highest persisted PERF score across
  // matches in the past 7 days. Used by the Home page widget.
  router.get('/home/perf-spotlight', async (req, res) => {
    try {
      const pool = db.getPool();
      const r = await pool.query(`
        SELECT
          ps.account_id,
          ps.match_id,
          ps.hero_name,
          ps.position,
          ps.kills, ps.deaths, ps.assists,
          ps.perf,
          COALESCE(n.nickname, ps.persona_name, 'Player ' || ps.account_id::text) AS display_name
        FROM player_stats ps
        JOIN matches m ON m.match_id = ps.match_id
        LEFT JOIN LATERAL (
          SELECT nickname FROM nicknames WHERE account_id = ps.account_id
          ORDER BY updated_at DESC LIMIT 1
        ) n ON true
        WHERE ps.perf IS NOT NULL
          AND m.date > NOW() - INTERVAL '7 days'
        ORDER BY ps.perf DESC NULLS LAST, m.date DESC
        LIMIT 1
      `);
      res.set('Cache-Control', 'public, max-age=120');
      res.json({ player: r.rows[0] || null });
    } catch (err) {
      console.error('[API] home/perf-spotlight error:', err.message);
      res.status(500).json({ error: 'Failed to fetch perf spotlight' });
    }
  });

  // Hot heroes — top picks past 7 days with WR delta vs prior 7 days.
  router.get('/home/hot-heroes', async (req, res) => {
    try {
      const pool = db.getPool();
      const r = await pool.query(`
        WITH recent AS (
          SELECT
            ps.hero_name,
            COUNT(*) AS picks,
            SUM(CASE
              WHEN (ps.team = 'radiant' AND m.radiant_win)
                OR (ps.team = 'dire'    AND NOT m.radiant_win)
              THEN 1 ELSE 0
            END) AS wins
          FROM player_stats ps
          JOIN matches m ON m.match_id = ps.match_id
          WHERE m.date > NOW() - INTERVAL '7 days'
            AND ps.hero_name IS NOT NULL AND ps.hero_name <> ''
          GROUP BY ps.hero_name
        ),
        prev AS (
          SELECT
            ps.hero_name,
            COUNT(*) AS picks,
            SUM(CASE
              WHEN (ps.team = 'radiant' AND m.radiant_win)
                OR (ps.team = 'dire'    AND NOT m.radiant_win)
              THEN 1 ELSE 0
            END) AS wins
          FROM player_stats ps
          JOIN matches m ON m.match_id = ps.match_id
          WHERE m.date > NOW() - INTERVAL '14 days'
            AND m.date <= NOW() - INTERVAL '7 days'
            AND ps.hero_name IS NOT NULL AND ps.hero_name <> ''
          GROUP BY ps.hero_name
        )
        SELECT
          r.hero_name,
          r.picks::int AS picks,
          (r.wins::float / NULLIF(r.picks, 0)) AS win_rate,
          CASE WHEN p.picks > 0
            THEN (r.wins::float / NULLIF(r.picks, 0)) - (p.wins::float / NULLIF(p.picks, 0))
            ELSE NULL
          END AS win_rate_delta
        FROM recent r
        LEFT JOIN prev p ON p.hero_name = r.hero_name
        WHERE r.picks >= 2
        ORDER BY r.picks DESC, r.hero_name ASC
        LIMIT 4
      `);
      const heroes = r.rows.map(h => ({
        hero_name: h.hero_name,
        picks: h.picks,
        win_rate: h.win_rate == null ? null : Number(h.win_rate),
        win_rate_delta_pp: h.win_rate_delta == null ? null : Number(h.win_rate_delta) * 100,
      }));
      res.set('Cache-Control', 'public, max-age=120');
      res.json({ heroes });
    } catch (err) {
      console.error('[API] home/hot-heroes error:', err.message);
      res.status(500).json({ error: 'Failed to fetch hot heroes' });
    }
  });

  router.get('/home-stats', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const data = await db.getHomeStats(seasonId);
      res.json(data);
    } catch (err) {
      console.error('[API] home-stats error:', err);
      res.status(500).json({ error: 'Failed to fetch home stats' });
    }
  });

  router.get('/latest-recap', async (req, res) => {
    try {
      const recap = await db.getLatestWeeklyRecap();
      res.json(recap || {});
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch latest recap' });
    }
  });

  router.post('/generate-recap', authMiddleware, express.json(), async (req, res) => {
    try {
      const [recap, fun] = await Promise.all([
        db.getWeeklyRecap(null),
        db.getFunRecapStats(null),
      ]);
      const { matches, top_performers } = recap;
      if (!matches || matches.length === 0) {
        return res.status(400).json({ error: 'No matches in the last 7 days to recap.' });
      }
      const aiBlurb = await generateWeeklyRecapBlurb({
        matches,
        topPerformers: top_performers,
        fun,
      });
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await db.saveWeeklyRecap({
        matchesCount: matches.length,
        aiBlurb: aiBlurb || null,
        topPerformers: top_performers || [],
        funHighlights: fun || {},
        periodStart: weekAgo,
        periodEnd: new Date(),
      });
      const saved = await db.getLatestWeeklyRecap();
      res.json(saved || {});
    } catch (err) {
      console.error('[API] generate-recap error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to generate recap' });
    }
  });

  router.get('/player/:id/nemesis', async (req, res) => {
    try {
      const accountId = BigInt(req.params.id);
      const nemesis = await db.getPlayerNemesis(accountId);
      res.json(nemesis);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch nemesis data' });
    }
  });

  router.get('/player/:id/ally', async (req, res) => {
    try {
      const seasonId = req.query.season || null;
      const ally = await db.getPlayerAlly(req.params.id, seasonId);
      res.json(ally);
    } catch (err) {
      console.error('[API] ally error:', err.message);
      res.status(500).json({ error: 'Failed to fetch ally data' });
    }
  });

  router.get('/player/:id/win-rate-history', async (req, res) => {
    try {
      const seasonId = req.query.season || null;
      const history = await db.getPlayerWinRateHistory(req.params.id, seasonId);
      res.json({ history });
    } catch (err) {
      console.error('[API] win-rate-history error:', err.message);
      res.status(500).json({ error: 'Failed to fetch win rate history' });
    }
  });

  // 1.4 — Profile chart v2 — per-match KDA / GPM / hero damage timeseries
  // for the new chart on the player's own profile. Gated client-side on
  // `profile_chart_v2`. Returns up to 100 most-recent matches.
  router.get('/player/:id/match-stats-history', requirePro('performance_trend'), async (req, res) => {
    try {
      const seasonId = req.query.season || null;
      const history = await db.getPlayerMatchStatsHistory(req.params.id, seasonId);
      res.json({ history });
    } catch (err) {
      console.error('[API] match-stats-history error:', err.message);
      res.status(500).json({ error: 'Failed to fetch match stats history' });
    }
  });

  router.get('/impact-scores', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const scores = await db.getImpactScores(seasonId);
      res.json({ scores });
    } catch (err) {
      console.error('[API] impact-scores error:', err.message);
      res.status(500).json({ error: 'Failed to fetch impact scores' });
    }
  });

  // Task #203 — Magazine v3 stat panels (full edition only).
  // Lightweight in-memory TTL cache so repeat profile loads don't re-aggregate
  // these on every request. Keyed by `<endpoint>:<accountId>:<seasonId|''>`.
  const _v3PanelCache = new Map();
  const V3_PANEL_TTL_MS = 5 * 60 * 1000;
  const _v3PanelGet = async (key, fn) => {
    const now = Date.now();
    const hit = _v3PanelCache.get(key);
    if (hit && hit.exp > now) return hit.value;
    const value = await fn();
    _v3PanelCache.set(key, { value, exp: now + V3_PANEL_TTL_MS });
    return value;
  };

  router.get('/players/:id/time-of-day', async (req, res) => {
    try {
      const accountId = BigInt(req.params.id);
      const seasonId = req.query.season || null;
      const data = await _v3PanelGet(`tod:${accountId}:${seasonId || ''}`,
        () => db.getPlayerTimeOfDayHeatmap(accountId, seasonId));
      res.json(data);
    } catch (err) {
      console.error('[API] time-of-day error:', err.message);
      res.status(500).json({ error: 'Failed to fetch time-of-day heatmap' });
    }
  });

  router.get('/players/:id/hero-items', async (req, res) => {
    try {
      const accountId = BigInt(req.params.id);
      const data = await _v3PanelGet(`heroitems:${accountId}`,
        () => db.getPlayerHeroItems(accountId));
      res.json(data);
    } catch (err) {
      console.error('[API] hero-items error:', err.message);
      res.status(500).json({ error: 'Failed to fetch hero items' });
    }
  });

  const seasonWrappedHandler = async (req, res) => {
    try {
      const accountId = BigInt(req.params.id);
      const seasonId = req.params.seasonId || null;
      const data = await _v3PanelGet(`wrapped:${accountId}:${seasonId || ''}`,
        () => db.getPlayerSeasonWrapped(accountId, seasonId));
      res.json(data);
    } catch (err) {
      console.error('[API] season-wrapped error:', err.message);
      res.status(500).json({ error: 'Failed to fetch season wrapped' });
    }
  };
  router.get('/players/:id/season-wrapped', seasonWrappedHandler);
  router.get('/players/:id/season-wrapped/:seasonId', seasonWrappedHandler);

  router.get('/players/:id/hall-of-fame', async (req, res) => {
    try {
      const accountId = BigInt(req.params.id);
      const data = await _v3PanelGet(`hof:${accountId}`,
        () => db.getPlayerHallOfFamePlaques(accountId));
      res.json(data);
    } catch (err) {
      console.error('[API] player hall-of-fame error:', err.message);
      res.status(500).json({ error: 'Failed to fetch hall-of-fame plaques' });
    }
  });

  router.get('/hall-of-fame', async (req, res) => {
    try {
      const seasonId = req.query.season || null;
      const [records, career, impactMap, achievementHunters] = await Promise.all([
        db.getPersonalRecords(seasonId),
        db.getHallOfFameCareerStats(seasonId),
        db.getImpactScores(seasonId),
        db.getAchievementLeaderboard(10).catch(() => []),
      ]);
      for (const p of career) {
        const pid = p.account_id?.toString();
        if (pid && impactMap[pid] != null) p.impact_score = impactMap[pid].score;
      }
      res.json({ records, career, achievementHunters });
    } catch (err) {
      console.error('[API] hall-of-fame error:', err.message);
      res.status(500).json({ error: 'Failed to fetch hall of fame data' });
    }
  });

  router.get('/achievement-leaderboard', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 25, 100);
      const hunters = await db.getAchievementLeaderboard(limit);
      res.json({ hunters });
    } catch (err) {
      console.error('[API] achievement-leaderboard error:', err.message);
      res.status(500).json({ error: 'Failed to fetch achievement leaderboard' });
    }
  });

  router.get('/leaderboard/referrals', async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 10, 50));
      const referrers = await db.getReferralLeaderboard(limit);
      res.json({ referrers });
    } catch (err) {
      console.error('[API] leaderboard/referrals error:', err.message);
      res.status(500).json({ error: 'Failed to fetch referral leaderboard' });
    }
  });

  router.post('/admin/recompute-achievements', requireSuperuser, async (req, res) => {
    try {
      console.log('[Admin] Recomputing all achievements...');
      const result = await db.recomputeAllAchievements();
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[Admin] recompute-achievements error:', err.message);
      res.status(500).json({ error: 'Failed to recompute achievements' });
    }
  });

  router.get('/benchmarks', requirePro('player_benchmarks'), async (req, res) => {
    try {
      const seasonId = req.query.season || null;
      const data = await db.getPlayerBenchmarkAverages(seasonId);
      console.log(`[benchmarks] returned ${data.length} rows (season=${seasonId})`);
      res.json({ benchmarks: data });
    } catch (err) {
      console.error('[API] benchmarks error:', err.message, err.stack);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/benchmarks/debug', async (req, res) => {
    try {
      const p = db.getPool();
      const [total, sample, zeroIds] = await Promise.all([
        p.query('SELECT COUNT(*) AS cnt FROM player_stats'),
        p.query('SELECT account_id, persona_name, match_id FROM player_stats LIMIT 5'),
        p.query('SELECT COUNT(*) AS cnt FROM player_stats WHERE account_id = 0'),
      ]);
      res.json({
        total_rows: total.rows[0].cnt,
        zero_account_id_rows: zeroIds.rows[0].cnt,
        sample: sample.rows,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/tournaments', async (req, res) => {
    try {
      const seasonId = req.query.season || null;
      const data = await db.getTournaments(seasonId);
      // Disable HTTP caching: stale CDN/browser caches were the root cause of
      // listings showing tournaments that the detail endpoint could no longer
      // resolve after admin edits/deletes. Force fresh on every request.
      res.set('Cache-Control', 'no-store, must-revalidate');
      res.json({ tournaments: data });
    } catch (err) {
      console.error('[API] tournaments error:', err.message);
      res.status(500).json({ error: 'Failed to fetch tournaments' });
    }
  });

  router.get('/tournaments/:id', async (req, res) => {
    try {
      const [tournament, participants, matches] = await Promise.all([
        db.getTournamentById(req.params.id),
        db.getTournamentParticipants(req.params.id),
        db.getTournamentMatches(req.params.id),
      ]);
      if (!tournament) {
        // Cross-table fallback: this id may belong to a weekend tournament.
        // Return a 404 with a redirect hint so the frontend can navigate
        // to /weekend-tournament/:id without an extra round-trip. This
        // rescues stale or shared `/tournaments/:id` links for events that
        // actually live in the weekend_tournaments table.
        try {
          const weekend = await db.getWeekendTournamentById(req.params.id);
          if (weekend) {
            return res.status(404).json({
              error: 'Tournament not found',
              redirect: `/weekend-tournament/${req.params.id}`,
              kind: 'weekend',
            });
          }
        } catch (_) { /* fall through to plain 404 */ }
        return res.status(404).json({ error: 'Tournament not found' });
      }
      res.json({ tournament, participants, matches });
    } catch (err) {
      console.error('[API] tournament detail error:', err.message);
      res.status(500).json({ error: 'Failed to fetch tournament' });
    }
  });

  router.post('/tournaments', authMiddleware, async (req, res) => {
    try {
      const {
        name, description, seasonId, format, bracketSize,
        tierNumber, entryFeeCents, signupOpenAt, signupCloseAt,
        maxParticipants, prizeSplit,
      } = req.body;
      if (!name) return res.status(400).json({ error: 'Name required' });
      const tournament = await db.createTournament({
        name, description, seasonId, format, bracketSize,
        tierNumber, entryFeeCents,
        signupOpenAt, signupCloseAt,
        maxParticipants, prizeSplit,
        createdBy: req.session?.username,
      });
      res.json({ tournament });
    } catch (err) {
      console.error('[API] create tournament error:', err.message);
      res.status(500).json({ error: 'Failed to create tournament' });
    }
  });

  router.patch('/tournaments/:id/status', authMiddleware, async (req, res) => {
    try {
      const { status } = req.body;
      const tournament = await db.updateTournamentStatus(req.params.id, status);
      res.json({ tournament });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update tournament status' });
    }
  });

  router.delete('/tournaments/:id', authMiddleware, async (req, res) => {
    try {
      await db.deleteTournament(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete tournament' });
    }
  });

  router.get('/tournaments/:id/participants', async (req, res) => {
    try {
      const data = await db.getTournamentParticipants(req.params.id);
      res.json({ participants: data });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch participants' });
    }
  });

  router.post('/tournaments/:id/participants', authMiddleware, async (req, res) => {
    try {
      const { accountId, seed } = req.body;
      if (!accountId) return res.status(400).json({ error: 'accountId required' });
      const p = await db.addTournamentParticipant(req.params.id, accountId, seed || null);
      res.json({ participant: p });
    } catch (err) {
      console.error('[API] add participant error:', err.message);
      res.status(500).json({ error: 'Failed to add participant' });
    }
  });

  router.delete('/tournaments/:id/participants/:accountId', authMiddleware, async (req, res) => {
    try {
      await db.removeTournamentParticipant(req.params.id, req.params.accountId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to remove participant' });
    }
  });

  router.post('/tournaments/:id/generate', authMiddleware, async (req, res) => {
    try {
      const matches = await db.generateTournamentBracket(req.params.id);
      res.json({ matches });
    } catch (err) {
      console.error('[API] generate bracket error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to generate bracket' });
    }
  });

  router.post('/tournament-matches/:matchId/winner', authMiddleware, async (req, res) => {
    try {
      const { winnerId } = req.body;
      if (!winnerId) return res.status(400).json({ error: 'winnerId required' });

      const matches = await db.setTournamentMatchWinner(req.params.matchId, winnerId);
      const tournamentId = matches.length ? matches[0].tournament_id : null;
      const tournament = tournamentId ? await db.getTournamentById(tournamentId) : null;
      res.json({ matches, tournament });

      // Discord notification — fire-and-forget
      try {
        const match = (matches || []).find(m => String(m.id) === String(req.params.matchId));
        if (match && match.tournament_id) {
          const tournament = await db.getTournamentById(match.tournament_id);
          if (tournament && match.winner_name) {
            const roundMatches = matches.filter(m => m.round === match.round && m.bracket === match.bracket);
            const maxRound = Math.max(...matches.map(m => m.round));
            const isGF = match.bracket === 'GF';
            const isFinal = isGF || (match.round === maxRound && roundMatches.length === 1);
            const roundLabel = isGF ? 'Grand Final' : match.round === maxRound && roundMatches.length === 1 ? 'Grand Final' : `Round ${match.round}`;
            const loserName = String(match.winner_id) === String(match.p1_id) ? match.p2_name : match.p1_name;

            // Per-match notification
            const matchMsg = loserName
              ? `🏆 **${tournament.name}** — ${roundLabel}: **${match.winner_name}** def. ${loserName}`
              : `🏆 **${tournament.name}** — ${roundLabel}: **${match.winner_name}** advances!`;
            getDiscordBot()._notifyChannel(matchMsg);

            // Tournament completion announcement
            if (tournament.status === 'completed' && isFinal) {
              const { EmbedBuilder } = require('discord.js');
              const finalistName = loserName || 'Runner-up';
              const embed = new EmbedBuilder()
                .setTitle(`🏆 Tournament Complete — ${tournament.name}`)
                .setColor(0xFFD700)
                .setDescription(
                  `**${match.winner_name}** has won the **${tournament.name}** tournament!\n\n` +
                  `🥇 **Champion:** ${match.winner_name}\n` +
                  (loserName ? `🥈 **Runner-up:** ${loserName}\n` : '') +
                  (tournament.season_name ? `\n📅 Season: ${tournament.season_name}` : '')
                )
                .setTimestamp();
              getDiscordBot()._notifyChannel({ embeds: [embed] });
            }
          }
        }
      } catch (notifyErr) {
        console.warn('[Tournament] Discord notify failed:', notifyErr.message);
      }
    } catch (err) {
      console.error('[API] set winner error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to set winner' });
    }
  });

  router.delete('/tournament-matches/:matchId/winner', authMiddleware, async (req, res) => {
    try {
      const matches = await db.clearTournamentMatchWinner(req.params.matchId);
      const tournamentId = matches.length ? matches[0].tournament_id : null;
      const tournament = tournamentId ? await db.getTournamentById(tournamentId) : null;
      res.json({ matches, tournament });
    } catch (err) {
      res.status(500).json({ error: 'Failed to clear winner' });
    }
  });

  router.post('/tournament-matches/:matchId/link', authMiddleware, express.json(), async (req, res) => {
    try {
      const { inhouseMatchId } = req.body;
      const matches = await db.linkTournamentMatch(req.params.matchId, inhouseMatchId || null);
      const tournamentId = matches.length ? matches[0].tournament_id : null;
      const tournament = tournamentId ? await db.getTournamentById(tournamentId) : null;
      res.json({ matches, tournament });
    } catch (err) {
      console.error('[API] link tournament match error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to link match' });
    }
  });

  router.post('/tournaments/:id/reseed', authMiddleware, express.json(), async (req, res) => {
    try {
      const { orderedAccountIds } = req.body;
      if (!Array.isArray(orderedAccountIds) || orderedAccountIds.length === 0) {
        return res.status(400).json({ error: 'orderedAccountIds array required' });
      }
      const participants = await db.reseedTournamentParticipants(req.params.id, orderedAccountIds);
      res.json({ participants });
    } catch (err) {
      console.error('[API] reseed error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to reseed' });
    }
  });

  // ─── Multi-Tier Seasons (1.6) ──────────────────────────────────────────
  // GET /api/seasons/active/tiers — tiers for whichever season is currently active.
  // Used by the leaderboard to show sponsored tier names without a selected season.
  router.get('/seasons/active/tiers', async (req, res) => {
    try {
      const p = db.getPool();
      const activeRes = await p.query(`SELECT id FROM seasons WHERE active = true ORDER BY id DESC LIMIT 1`);
      if (!activeRes.rows[0]) return res.json({ tiers: [] });
      const tiers = await db.getSeasonTiers(activeRes.rows[0].id);
      res.json({ tiers });
    } catch (err) {
      console.error('[API] seasons/active/tiers error:', err.message);
      res.status(500).json({ error: 'Failed to fetch active season tiers' });
    }
  });

  router.get('/seasons/:id/tiers', async (req, res) => {
    try {
      const tiers = await db.getSeasonTiers(req.params.id);
      res.json({ tiers });
    } catch (err) {
      console.error('[API] season tiers error:', err.message);
      res.status(500).json({ error: 'Failed to fetch tiers' });
    }
  });

  router.post('/seasons/:id/tiers/ensure', requireSuperuser, async (req, res) => {
    try {
      const tiers = await db.ensureSeasonTiers(req.params.id);
      res.json({ tiers });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to provision tiers' });
    }
  });

  router.patch('/seasons/:id/tiers/:tierNumber', requireSuperuser, express.json(), async (req, res) => {
    try {
      const updated = await db.updateSeasonTier(req.params.id, req.params.tierNumber, req.body || {});
      if (!updated) return res.status(404).json({ error: 'Tier not found or no fields to update' });
      res.json({ tier: updated });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to update tier' });
    }
  });

  router.post('/seasons/:id/tiers/place-all', requireSuperuser, express.json(), async (req, res) => {
    try {
      const result = await db.placeAllPlayersInSeasonTiers(req.params.id, { force: !!req.body?.force });
      res.json(result);
    } catch (err) {
      console.error('[API] tier place-all error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to place players' });
    }
  });

  router.get('/seasons/:id/tiers/:tierNumber/players', async (req, res) => {
    try {
      const players = await db.getSeasonTierPlayers(req.params.id, req.params.tierNumber);
      res.json({ players });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch tier players' });
    }
  });

  router.post('/seasons/:id/tiers/override', requireSuperuser, express.json(), async (req, res) => {
    try {
      const { accountId, tierNumber } = req.body || {};
      if (!accountId || tierNumber == null) {
        return res.status(400).json({ error: 'accountId and tierNumber required' });
      }
      const placement = await db.overridePlayerTier(
        req.params.id, accountId, tierNumber, req.session?.username || 'admin'
      );
      res.json({ placement });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Failed to override tier' });
    }
  });

  // ─── Tournament Self-Signup (1.7) ──────────────────────────────────────
  // Helper: returns true if `tournament_self_signup` is fully on, OR caller is
  // a superuser. Used by all tournament self-signup-related routes so the
  // feature surface is hidden when the flag is off (returns 404 to avoid
  // disclosing the route's existence).
  function _isSelfSignupSuperuser(req) {
    if (req.session && req.session.isSuperuser) return true;
    return Boolean(
      req.headers['x-superuser-key']
      && req.headers['x-superuser-key'] === process.env.SUPERUSER_PASSWORD
    );
  }
  async function _selfSignupVisible(req) {
    return _flagOn('tournament_self_signup', req);
  }
  // SECURITY: strip payment session ids and other internal identifiers before
  // returning a tournament_entries row to a non-superuser caller. Superusers
  // see the full row so the admin panel can debug Stripe sessions.
  function _publicEntryFields(entry, isSuperuser) {
    if (!entry) return entry;
    if (isSuperuser) return entry;
    const {
      stripe_session_id: _ssid, steam_id: _sid,
      ...safe
    } = entry;
    return safe;
  }

  router.get('/tournaments/:id/entries', async (req, res) => {
    try {
      if (!(await _selfSignupVisible(req))) return res.status(404).json({ error: 'Not found' });
      const isSu = _isSelfSignupSuperuser(req);
      const paidOnly = req.query.paidOnly === '1' || req.query.paidOnly === 'true';
      const entries = await db.getTournamentEntries(req.params.id, { paidOnly });
      // SECURITY: strip stripe_session_id / steam_id from public responses.
      res.json({ entries: (entries || []).map(e => _publicEntryFields(e, isSu)) });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch entries' });
    }
  });

  router.get('/tournaments/:id/eligibility', async (req, res) => {
    try {
      if (!(await _selfSignupVisible(req))) return res.status(404).json({ error: 'Not found' });
      const isSu = _isSelfSignupSuperuser(req);
      // SECURITY: non-superusers can only check their *own* eligibility, to
      // prevent enumerating other players' enrollment / payment status. The
      // querystring accountId (when supplied) must match the session.
      const sessionAccountId = req.session?.accountId;
      const requested = req.query.accountId;
      let accountId;
      if (isSu) {
        accountId = requested || sessionAccountId;
      } else {
        if (!sessionAccountId) return res.status(401).json({ error: 'Sign in with Steam to check eligibility' });
        if (requested && String(requested) !== String(sessionAccountId)) {
          return res.status(403).json({ error: 'You can only check your own eligibility' });
        }
        accountId = sessionAccountId;
      }
      if (!accountId) return res.status(400).json({ error: 'accountId required' });
      const result = await db.isPlayerEligibleForTournament(req.params.id, accountId);
      // Also include any existing entry status so UI can show the right CTA.
      const existing = await db.getTournamentEntry(req.params.id, accountId);
      res.json({ ...result, existingEntry: _publicEntryFields(existing, isSu) || null });
    } catch (err) {
      res.status(500).json({ error: 'Failed to check eligibility' });
    }
  });

  router.post('/tournaments/:id/checkout', express.json(), async (req, res) => {
    try {
      // Gate the entire self-signup flow on the `tournament_self_signup` flag.
      // When the flag is off the route returns 404 so it doesn't leak that the
      // feature exists; superusers always bypass the gate.
      if (!(await _selfSignupVisible(req))) return res.status(404).json({ error: 'Not found' });
      const isSuperuser = (req.session && req.session.isSuperuser) || Boolean(
        req.headers['x-superuser-key'] && req.headers['x-superuser-key'] === process.env.SUPERUSER_PASSWORD
      );
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({ error: 'Payments not configured' });
      }
      const tournamentId = parseInt(req.params.id);
      const { accountId, displayName } = req.body || {};
      // SECURITY: bind the entry to the *authenticated* Steam session. We only
      // accept a body-supplied accountId if it matches the session's accountId
      // (or the caller is a superuser acting on behalf of a player). Without
      // this check any caller could create a checkout entry charged to another
      // player's account_id (IDOR on payment path).
      const sessionAccountId = req.session?.accountId;
      let finalAccountId = sessionAccountId;
      if (accountId && String(accountId) !== String(sessionAccountId || '')) {
        if (!isSuperuser) {
          return res.status(403).json({ error: 'You can only sign yourself up. Sign in with Steam first.' });
        }
        finalAccountId = accountId;
      }
      if (!finalAccountId) return res.status(401).json({ error: 'Sign in with Steam to enter this tournament.' });

      const t = await db.getTournamentById(tournamentId);
      if (!t) return res.status(404).json({ error: 'Tournament not found' });
      if (!t.entry_fee_cents || t.entry_fee_cents <= 0) {
        return res.status(400).json({ error: 'This tournament is free — no checkout needed' });
      }

      // Signup window check (open if no window set or now within window).
      const now = new Date();
      if (t.signup_open_at && now < new Date(t.signup_open_at)) {
        return res.status(400).json({ error: 'Signup not open yet' });
      }
      if (t.signup_close_at && now > new Date(t.signup_close_at)) {
        return res.status(400).json({ error: 'Signup is closed' });
      }

      const elig = await db.isPlayerEligibleForTournament(tournamentId, finalAccountId);
      if (!elig.eligible) return res.status(403).json({ error: elig.reason || 'Not eligible' });

      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const baseUrl = process.env.SITE_URL || `http://170.64.182.110:5000`;
      const session = await stripe.checkout.sessions.create({
        automatic_payment_methods: { enabled: true },
        line_items: [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: `${t.name} — Entry Fee`,
              description: t.tier_number ? `Tier ${t.tier_number} entry` : 'Tournament entry',
            },
            unit_amount: t.entry_fee_cents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/tournaments/${tournamentId}?signup=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/tournaments/${tournamentId}?signup=cancelled`,
        metadata: {
          purpose: 'tournament_entry',
          tournament_id: String(tournamentId),
          account_id: String(finalAccountId),
          display_name: (displayName || '').slice(0, 80),
        },
      });
      await db.createTournamentEntry({
        tournamentId,
        accountId: finalAccountId,
        steamId: req.session?.steamId || null,
        stripeSessionId: session.id,
        amountCents: t.entry_fee_cents,
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error('[API] tournament checkout error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create checkout' });
    }
  });

  // 1.7 — Free-event direct entry (no Stripe). Mirrors the auth/eligibility/flag
  // checks of /checkout but writes a `paid` entry immediately.
  router.post('/tournaments/:id/free-signup', express.json(), async (req, res) => {
    try {
      if (!(await _selfSignupVisible(req))) return res.status(404).json({ error: 'Not found' });
      const isSuperuser = (req.session && req.session.isSuperuser) || Boolean(
        req.headers['x-superuser-key'] && req.headers['x-superuser-key'] === process.env.SUPERUSER_PASSWORD
      );
      const tournamentId = parseInt(req.params.id);
      const { accountId } = req.body || {};
      const sessionAccountId = req.session?.accountId;
      let finalAccountId = sessionAccountId;
      if (accountId && String(accountId) !== String(sessionAccountId || '')) {
        if (!isSuperuser) return res.status(403).json({ error: 'You can only sign yourself up. Sign in with Steam first.' });
        finalAccountId = accountId;
      }
      if (!finalAccountId) return res.status(401).json({ error: 'Sign in with Steam to enter this tournament.' });

      const t = await db.getTournamentById(tournamentId);
      if (!t) return res.status(404).json({ error: 'Tournament not found' });
      if (t.entry_fee_cents && t.entry_fee_cents > 0) {
        return res.status(400).json({ error: 'This tournament has an entry fee — use checkout instead.' });
      }
      const now = new Date();
      if (t.signup_open_at  && now < new Date(t.signup_open_at))  return res.status(400).json({ error: 'Signup not open yet' });
      if (t.signup_close_at && now > new Date(t.signup_close_at)) return res.status(400).json({ error: 'Signup is closed' });

      const elig = await db.isPlayerEligibleForTournament(tournamentId, finalAccountId);
      if (!elig.eligible) return res.status(403).json({ error: elig.reason || 'Not eligible' });

      // Use a synthetic stripe_session_id so the unique-on-stripe-session-id
      // index (if any) doesn't collide and the row is clearly identifiable.
      const synthetic = `free_${tournamentId}_${finalAccountId}_${Date.now()}`;
      const entry = await db.createTournamentEntry({
        tournamentId, accountId: finalAccountId,
        steamId: req.session?.steamId || null,
        stripeSessionId: synthetic, amountCents: 0,
      });
      // Promote to paid immediately for free events. Errors here are
      // payment-critical (entry without participant mirror), so let them
      // bubble up to the outer 500 handler instead of swallowing them.
      await db.markTournamentEntryPaid(synthetic);
      await db.recomputeTournamentPrizePool(tournamentId);
      res.json({ ok: true, entry });
    } catch (err) {
      console.error('[API] tournament free signup error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to sign up' });
    }
  });

  router.get('/tournaments/:id/entry/confirm', async (req, res) => {
    try {
      // Gate the same way as the rest of the self-signup surface.
      if (!(await _selfSignupVisible(req))) return res.status(404).json({ error: 'Not found' });
      const isSu = _isSelfSignupSuperuser(req);
      const { session_id } = req.query;
      if (!session_id) return res.status(400).json({ error: 'session_id required' });
      if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments not configured' });
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.payment_status !== 'paid') {
        return res.status(402).json({ error: 'Payment not completed', status: session.payment_status });
      }
      const entry = await db.markTournamentEntryPaid(session_id, session.payment_intent || null);
      if (entry) await db.recomputeTournamentPrizePool(entry.tournament_id).catch(() => {});
      // SECURITY: scrub stripe_session_id / steam_id from the public response.
      res.json({ entry: _publicEntryFields(entry, isSu), ok: !!entry });
    } catch (err) {
      console.error('[API] tournament entry confirm error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to confirm entry' });
    }
  });

  // v5.92 — Unified `/register` endpoint. Dispatches to Stripe checkout for paid
  // tournaments or a synthetic `paid` entry for free events. Returns either
  // { url } (redirect to Stripe) or { ok: true, entry } (free signup done).
  router.post('/tournaments/:id/register', express.json(), async (req, res) => {
    try {
      if (!(await _selfSignupVisible(req))) return res.status(404).json({ error: 'Not found' });
      const t = await db.getTournamentById(req.params.id);
      if (!t) return res.status(404).json({ error: 'Tournament not found' });
      // Internally rewrite to /checkout or /free-signup so we keep one set of
      // auth/eligibility/window/capacity checks rather than duplicating them.
      const target = (t.entry_fee_cents && t.entry_fee_cents > 0) ? 'checkout' : 'free-signup';
      req.url = `/tournaments/${req.params.id}/${target}`;
      return router.handle(req, res);
    } catch (err) {
      console.error('[API] tournament register error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to register' });
    }
  });

  // v5.92 — Withdraw + refund. Players may withdraw before the tournament
  // starts (status === 'upcoming'); paid entries get a Stripe refund against
  // the stored PaymentIntent. Bound to the authenticated Steam session.
  router.post('/tournaments/:id/withdraw', express.json(), async (req, res) => {
    try {
      if (!(await _selfSignupVisible(req))) return res.status(404).json({ error: 'Not found' });
      const isSu = _isSelfSignupSuperuser(req);
      const tournamentId = parseInt(req.params.id);
      const { accountId } = req.body || {};
      const sessionAccountId = req.session?.accountId;
      let finalAccountId = sessionAccountId;
      if (accountId && String(accountId) !== String(sessionAccountId || '')) {
        if (!isSu) return res.status(403).json({ error: 'You can only withdraw yourself.' });
        finalAccountId = accountId;
      }
      if (!finalAccountId) return res.status(401).json({ error: 'Sign in with Steam to withdraw.' });

      const t = await db.getTournamentById(tournamentId);
      if (!t) return res.status(404).json({ error: 'Tournament not found' });
      if (t.status !== 'upcoming') {
        return res.status(400).json({ error: 'Withdrawals are closed once the tournament has started.' });
      }
      const entry = await db.getTournamentEntry(tournamentId, finalAccountId);
      if (!entry) return res.status(404).json({ error: 'No entry found to withdraw.' });
      if (entry.status === 'refunded') return res.status(400).json({ error: 'Entry already refunded.' });

      // Issue Stripe refund first; only flip DB state if Stripe accepts it so
      // we don't end up with a refunded entry the player was never refunded for.
      if (entry.status === 'paid' && entry.amount_cents > 0) {
        if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments not configured' });
        const pi = entry.stripe_payment_intent_id;
        if (!pi) return res.status(409).json({ error: 'No payment record on file — contact an admin to refund manually.' });
        try {
          const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
          await stripe.refunds.create({ payment_intent: pi });
        } catch (e) {
          console.error('[API] tournament withdraw refund failed:', e.message);
          return res.status(502).json({ error: `Refund failed: ${e.message}` });
        }
      }

      const updated = await db.markTournamentEntryRefunded(tournamentId, finalAccountId);
      await db.recomputeTournamentPrizePool(tournamentId).catch(() => {});
      res.json({ ok: true, entry: _publicEntryFields(updated, isSu) });
    } catch (err) {
      console.error('[API] tournament withdraw error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to withdraw' });
    }
  });

  // ─── Weekend / Special Event Tournaments ───────────────────────────────
  // Auto-transition weekend tournament status based on dates.
  // Returns the updated tournament object (may be same if no change needed).
  async function _autoTransitionWeekendTournament(tournament) {
    const now = new Date();
    const start = new Date(tournament.start_date);
    const end = new Date(tournament.end_date);
    const cur = tournament.status;

    let newStatus = cur;
    if (now >= end && cur !== 'completed') newStatus = 'completed';
    else if (now >= start && now < end && cur === 'upcoming') newStatus = 'active';

    if (newStatus === cur) return tournament;

    // Persist the new status
    const updated = await db.updateWeekendTournament(tournament.id, { status: newStatus });

    // Announce winner to Discord when auto-completing
    if (newStatus === 'completed' && !tournament.discord_announced) {
      try {
        const { config } = require('../config');
        const bot = getDiscordBot();
        const channelId = config.discord.announceChannelId;
        if (bot && channelId) {
          const channel = await bot.client.channels.fetch(channelId).catch(() => null);
          if (channel) {
            const leaderboard = await db.getWeekendTournamentScores(
              tournament.start_date, tournament.end_date, tournament.games_to_count
            );
            const { EmbedBuilder } = require('discord.js');
            const winner = leaderboard[0];
            const embed = new EmbedBuilder()
              .setTitle(`🏆 ${tournament.name} — Final Results`)
              .setColor(0xf59e0b)
              .setDescription(
                winner
                  ? `The weekend tournament has concluded!\n\n🥇 **${winner.display_name}** wins with **${winner.total_score} pts**${tournament.prize_pool > 0 ? ` and takes home **$${tournament.prize_pool}**!` : '!'}`
                  : 'The weekend tournament has concluded!'
              );
            if (leaderboard.length > 1) {
              const rows = leaderboard.slice(0, 5)
                .map((p, i) => `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} **${p.display_name}** — ${p.total_score} pts (${p.game_count} game${p.game_count !== 1 ? 's' : ''})`)
                .join('\n');
              embed.addFields({ name: 'Top Players', value: rows, inline: false });
            }
            embed.setFooter({ text: 'Full leaderboard at dota.stats.corvidaeinc.com/weekend-tournament/' + tournament.id });
            await channel.send({ embeds: [embed] });
            await db.updateWeekendTournament(tournament.id, { discord_announced: true });
          }
        }
      } catch (announceErr) {
        console.error('[WeekendTournament] Auto-announce winner error:', announceErr.message);
      }
    }

    return updated;
  }

  router.get('/weekend-tournaments', async (req, res) => {
    try {
      const tournaments = await db.getWeekendTournaments();
      // Auto-transition any tournaments whose status doesn't match their dates
      const transitioned = await Promise.all(tournaments.map(t => _autoTransitionWeekendTournament(t).catch(() => t)));
      res.set('Cache-Control', 'no-store, must-revalidate');
      res.json({ tournaments: transitioned });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/weekend-tournaments/:id', async (req, res) => {
    try {
      let tournament = await db.getWeekendTournamentById(req.params.id);
      if (!tournament) {
        // Reverse cross-table fallback: id may belong to a bracket tournament.
        // Mirror the /tournaments/:id behaviour so users hitting either URL
        // can be transparently redirected to the correct one.
        try {
          const bracket = await db.getTournamentById(req.params.id);
          if (bracket) {
            return res.status(404).json({
              error: 'Weekend tournament not found',
              redirect: `/tournaments/${req.params.id}`,
              kind: 'bracket',
            });
          }
        } catch (_) { /* fall through to plain 404 */ }
        console.warn(`[API] weekend tournament not found id=${req.params.id}`);
        return res.status(404).json({ error: 'Not found' });
      }
      tournament = await _autoTransitionWeekendTournament(tournament).catch(() => tournament);
      const leaderboard = await db.getWeekendTournamentScores(
        tournament.start_date, tournament.end_date, tournament.games_to_count
      );
      res.json({ tournament, leaderboard });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/weekend-tournaments', requireSuperuser, async (req, res) => {
    try {
      const { name, description, startDate, endDate, gamesToCount, prizePool, buyIn } = req.body;
      if (!name || !startDate || !endDate) return res.status(400).json({ error: 'name, startDate, endDate required' });
      const safeNum = v => (v === '' || v === null || v === undefined) ? null : Number(v);
      const tournament = await db.createWeekendTournament({ name, description, startDate, endDate, gamesToCount: safeNum(gamesToCount) || 3, prizePool: safeNum(prizePool), buyIn: safeNum(buyIn) });
      res.json({ tournament });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/weekend-tournaments/:id', requireSuperuser, async (req, res) => {
    try {
      const fields = {};
      const safeNum = v => (v === '' || v === null || v === undefined) ? null : Number(v);
      const numericCols = new Set(['games_to_count', 'prize_pool', 'buy_in']);
      const map = { name: 'name', description: 'description', startDate: 'start_date', endDate: 'end_date', gamesToCount: 'games_to_count', prizePool: 'prize_pool', buyIn: 'buy_in', status: 'status' };
      for (const [k, col] of Object.entries(map)) {
        if (req.body[k] !== undefined) fields[col] = numericCols.has(col) ? safeNum(req.body[k]) : req.body[k];
      }
      const tournament = await db.updateWeekendTournament(req.params.id, fields);
      res.json({ tournament });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/weekend-tournaments/:id/announce', requireSuperuser, async (req, res) => {
    try {
      const tournament = await db.getWeekendTournamentById(req.params.id);
      if (!tournament) return res.status(404).json({ error: 'Not found' });
      const bot = getDiscordBot();
      const { config } = require('../config');
      const channelId = config.discord.announceChannelId;
      if (!channelId) return res.status(400).json({ error: 'No announce channel configured (ANNOUNCE_CHANNEL_ID)' });
      const channel = await bot.client.channels.fetch(channelId).catch(() => null);
      if (!channel) return res.status(400).json({ error: 'Could not find announce channel' });

      const { EmbedBuilder } = require('discord.js');
      const start = new Date(tournament.start_date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
      const end = new Date(tournament.end_date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
      const embed = new EmbedBuilder()
        .setTitle(`🏆 ${tournament.name}`)
        .setColor(0xf59e0b)
        .setDescription(tournament.description || 'A special weekend points tournament — play as many games as you want, your top scores count!')
        .addFields(
          { name: '📅 Dates', value: `${start} → ${end}`, inline: true },
          { name: '🎮 Games Counted', value: `Top ${tournament.games_to_count} games per player`, inline: true },
          { name: '💰 Prize Pool', value: tournament.prize_pool > 0 ? `$${tournament.prize_pool}` : 'TBD', inline: true },
          { name: '📊 Scoring', value: 'Kills +4 · Assists +2.5 · Deaths -3 · GPM ×0.25 · XPM ×0.22\nObs Wards +6 · Sentry +8 · Dewarded +10 · Camps Stacked +7\nHero Dmg /2000 · Tower Dmg /1000 · Healing /1500 · **Win +25**', inline: false },
          { name: '📈 How it works', value: `Play any inhouse games during the weekend. All your games count — only your highest ${tournament.games_to_count} scores are added to your total. No sign-up needed.`, inline: false }
        )
        .setFooter({ text: 'Check the leaderboard at dota.stats.corvidaeinc.com/weekend-tournament' });
      await channel.send({ embeds: [embed] });
      await db.updateWeekendTournament(req.params.id, { discord_announced: true });
      res.json({ success: true });
    } catch (err) {
      console.error('[WeekendTournament] Announce error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Site settings (admin) ─────────────────────────────────────────────
  router.get('/admin/settings', requireSuperuser, async (req, res) => {
    try {
      const settings = await db.getAllSettings();
      res.json({ settings });
    } catch (err) {
      console.error('[API] admin/settings GET error:', err.message);
      res.status(500).json({ error: 'Failed to load settings' });
    }
  });

  // Allowlist of settings keys writable via this endpoint — prevents the
  // generic key/value store from being abused as a free-form admin scratchpad.
  const ALLOWED_SETTING_KEYS = new Set(['engagement_milestone_thresholds', 'engagement_referral_xp', 'welcome_modal', 'broadcast_ticker', 'home_banner']);

  // ── Feature flags ─────────────────────────────────────────────────────
  // Public endpoint — returns the resolved { key: bool } map for the caller.
  // Optional x-superuser-key header lets a superuser see preview-state flags
  // as enabled. Non-superusers only see flags whose state is 'on'.
  // Public — welcome modal CMS payload (rendered by web/src/components/WelcomeModal.jsx)
  router.get('/settings/welcome-modal', async (req, res) => {
    try {
      const value = await db.getSetting('welcome_modal').catch(() => null);
      res.json({ value: value || null });
    } catch (err) {
      console.error('[API] settings/welcome-modal GET error:', err.message);
      res.status(500).json({ error: 'Failed to fetch welcome modal' });
    }
  });

  // Public — broadcast ticker CMS payload (rendered by App.jsx <BroadcastTicker/>)
  router.get('/settings/broadcast-ticker', async (req, res) => {
    try {
      const value = await db.getSetting('broadcast_ticker').catch(() => null);
      res.json({ value: value || null });
    } catch (err) {
      console.error('[API] settings/broadcast-ticker GET error:', err.message);
      res.status(500).json({ error: 'Failed to fetch broadcast ticker' });
    }
  });

  // Public — home banner CMS payload (rendered by Home.jsx <HomeBanner/>).
  // Dismissable per-version on the client via localStorage `home_banner_dismissed_v<version>`.
  router.get('/settings/home-banner', async (req, res) => {
    try {
      const value = await db.getSetting('home_banner').catch(() => null);
      res.json({ value: value || null });
    } catch (err) {
      console.error('[API] settings/home-banner GET error:', err.message);
      res.status(500).json({ error: 'Failed to fetch home banner' });
    }
  });

  router.get('/feature-flags', async (req, res) => {
    try {
      // Session-based check first; header fallback accepts only SUPERUSER_PASSWORD
      // (not UPLOAD_KEY — the upload/admin role does not have superuser preview access).
      const isSuperuser = (req.session && req.session.isSuperuser) || Boolean(
        req.headers['x-superuser-key']
        && process.env.SUPERUSER_PASSWORD
        && req.headers['x-superuser-key'] === process.env.SUPERUSER_PASSWORD
      );
      const flags = await db.getResolvedFeatureFlags({ isSuperuser });
      res.json({ flags });
    } catch (err) {
      console.error('[API] feature-flags GET error:', err.message);
      res.status(500).json({ error: 'Failed to load feature flags' });
    }
  });

  // Superuser-only — Discord guild auto-join health (Task #127).
  // Surfaces the in-memory ring buffer maintained by DiscordBot so the admin
  // Site Settings tab can render a green/amber/red status without anyone
  // having to tail the Discord alert channel. Read-only, never throws.
  router.get('/admin/discord-autojoin-status', requireSuperuser, async (req, res) => {
    try {
      const bot = getDiscordBot();
      const stats = typeof bot.getGuildAutoJoinStats === 'function'
        ? await bot.getGuildAutoJoinStats()
        : { window_ms: 24 * 60 * 60 * 1000, recent_count: 0, total_recorded: 0, counts: {}, last_failure: null };
      res.json({
        ...stats,
        guild_configured: Boolean(process.env.DISCORD_GUILD_ID),
        bot_token_configured: Boolean(process.env.DISCORD_TOKEN),
        league_role_configured: Boolean(process.env.DISCORD_LEAGUE_MEMBER_ROLE_ID),
        admin_log_channel_configured: Boolean(process.env.DISCORD_ADMIN_LOG_CHANNEL_ID),
      });
    } catch (err) {
      console.error('[API] admin/discord-autojoin-status error:', err.message);
      res.status(500).json({ error: 'Failed to read Discord auto-join status' });
    }
  });

  // Superuser-only — 7-day history of Discord auto-join outcomes (Task #142).
  // Returns per-day success/failure buckets for the sparkline plus a paginated
  // slice of failure rows so admins can drill into "we lost ~5% of signups
  // for three days last week"-style slow-burn issues that the existing 24h
  // rollup hides. Read-only; never throws.
  router.get('/admin/discord-autojoin-history', requireSuperuser, async (req, res) => {
    try {
      const days = Math.max(1, Math.min(30, parseInt(req.query.days, 10) || 7));
      const limit = Math.max(1, Math.min(200, parseInt(req.query.failures_limit, 10) || 20));
      const offset = Math.max(0, parseInt(req.query.failures_offset, 10) || 0);
      const [buckets, page] = await Promise.all([
        db.getDiscordAutoJoinDailyBuckets(days),
        db.getDiscordAutoJoinFailuresPage({ days, limit, offset }),
      ]);
      res.json({
        days,
        buckets,
        failures: page.failures,
        failures_total: page.total,
        failures_limit: limit,
        failures_offset: offset,
      });
    } catch (err) {
      console.error('[API] admin/discord-autojoin-history error:', err.message);
      res.status(500).json({ error: 'Failed to read Discord auto-join history' });
    }
  });

  // Superuser-only — list every pending Discord auto-join failure (Task #138).
  // Joined with the player nickname so admins can tell at a glance who is
  // currently stuck waiting to retry the join after a perms fix. Read-only.
  router.get('/admin/discord-autojoin-failures', requireSuperuser, async (req, res) => {
    try {
      // Task #143 — also surface the auto-prune threshold and the last-prune
      // timestamp so admins can see the queue is being maintained even when
      // it's currently empty. The threshold mirrors the env-overridable
      // default the bot uses on its hourly throttle.
      const pruneDays = Math.max(
        1,
        Math.min(365, parseInt(process.env.DISCORD_AUTOJOIN_FAILURE_PRUNE_DAYS, 10) || 30)
      );
      const [failures, pruneInfo] = await Promise.all([
        db.listAllDiscordAutoJoinFailures(200),
        db.getDiscordAutoJoinFailuresPruneInfo(),
      ]);
      res.json({
        failures,
        prune_threshold_days: pruneDays,
        prune_last_run_ts: pruneInfo?.ts || null,
        prune_last_removed: pruneInfo?.removed ?? null,
      });
    } catch (err) {
      console.error('[API] admin/discord-autojoin-failures GET error:', err.message);
      res.status(500).json({ error: 'Failed to load Discord auto-join failures' });
    }
  });

  // Superuser-only — clear one pending failure row (Task #138). Idempotent:
  // returns { cleared: false } if the row was already gone (e.g. the player
  // re-linked successfully between the admin loading the panel and clicking
  // Clear). Identifies the row by discord_id and/or account_id so the same
  // route works whether the operator is clearing by discord ID or account.
  router.post('/admin/discord-autojoin-failures/clear', express.json(), requireSuperuser, async (req, res) => {
    try {
      const { discord_id, account_id } = req.body || {};
      if (!discord_id && !account_id) {
        return res.status(400).json({ error: 'discord_id or account_id required' });
      }
      const cleared = await db.clearDiscordAutoJoinFailure(
        discord_id ? String(discord_id) : null,
        account_id ? String(account_id) : null,
      );
      res.json({ cleared });
    } catch (err) {
      console.error('[API] admin/discord-autojoin-failures/clear error:', err.message);
      res.status(500).json({ error: 'Failed to clear Discord auto-join failure' });
    }
  });

  // Superuser-only — Stripe configuration status (Task #113).
  // Returns whether STRIPE_SECRET_KEY is set so the admin panel can warn the
  // operator when payments are silently disabled, instead of waiting for a
  // user report of "Payments are not configured."
  router.get('/admin/stripe-status', requireSuperuser, async (req, res) => {
    try {
      let coachingFlagState = 'off';
      try {
        const flag = await db.getFeatureFlag('coaching_marketplace');
        coachingFlagState = flag?.state || 'off';
      } catch (_) { /* table may be missing — treat as off */ }
      res.json({
        configured: Boolean(process.env.STRIPE_SECRET_KEY),
        webhook_configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
        coaching_marketplace_state: coachingFlagState,
      });
    } catch (err) {
      console.error('[API] admin/stripe-status error:', err.message);
      res.status(500).json({ error: 'Failed to read Stripe status' });
    }
  });

  // Superuser-only — full state for the admin panel.
  router.get('/admin/feature-flags', requireSuperuser, async (req, res) => {
    try {
      const flags = await db.getAllFeatureFlags();
      res.json({ flags });
    } catch (err) {
      console.error('[API] admin/feature-flags GET error:', err.message);
      res.status(500).json({ error: 'Failed to load feature flags' });
    }
  });

  // Superuser-only — upsert a single flag (state and/or description).
  router.post('/admin/feature-flags', express.json(), requireSuperuser, async (req, res) => {
    try {
      const { key, state, description } = req.body || {};
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ error: 'key required' });
      }
      const flag = await db.setFeatureFlag(key, { state, description });
      res.json({ flag });
    } catch (err) {
      console.error('[API] admin/feature-flags POST error:', err.message);
      res.status(400).json({ error: err.message || 'Failed to update feature flag' });
    }
  });

  // Superuser-only — manual "Launch Season 10 Now" button. Performs the same
  // DB work the launch cron used to do (flips all preview flags to on, stamps
  // the launch timestamp, forces the home banner on) and asks the bot to post
  // the announcement if it's wired up.
  //
  // Defence in depth: the AdminPanel client requires a typed-phrase
  // confirmation before calling this endpoint. We mirror that on the server
  // by requiring `{ confirmation: 'LAUNCH SEASON 10' }` in the request body
  // so a direct curl/POST with just the superuser key cannot trigger the
  // launch by accident or by stolen key alone.
  router.post('/admin/launch-season-10', requireSuperuser, express.json(), async (req, res) => {
    try {
      const REQUIRED_PHRASE = 'LAUNCH SEASON 10';
      const provided = (req.body && req.body.confirmation != null)
        ? String(req.body.confirmation)
        : '';
      if (provided !== REQUIRED_PHRASE) {
        return res.status(400).json({
          error: `Missing or incorrect confirmation. Send { confirmation: "${REQUIRED_PHRASE}" } in the request body.`,
        });
      }
      const result = await db.executeSeason10Launch();
      let discordPosted = false;
      if (!result.alreadyLaunched) {
        try {
          const bot = getDiscordBot();
          if (bot && typeof bot.announceSeason10Launch === 'function') {
            await bot.announceSeason10Launch({ flippedKeys: result.flippedKeys });
            discordPosted = true;
          } else {
            console.warn('[API] launch-season-10: Discord bot unavailable — skipped announcement.');
          }
        } catch (err) {
          console.error('[API] launch-season-10 Discord post failed:', err.message);
        }
      }
      res.json({ ...result, discordPosted });
    } catch (err) {
      console.error('[API] launch-season-10 error:', err.message);
      res.status(500).json({ error: err.message || 'Failed to launch Season 10' });
    }
  });

  router.post('/admin/settings', requireSuperuser, async (req, res) => {
    try {
      const { key, value } = req.body || {};
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ error: 'key required' });
      }
      if (!ALLOWED_SETTING_KEYS.has(key)) {
        return res.status(400).json({ error: `setting key "${key}" is not writable` });
      }
      if (key === 'engagement_milestone_thresholds') {
        const nums = String(value || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
        if (nums.length === 0) {
          return res.status(400).json({ error: 'engagement_milestone_thresholds must be a comma-separated list of positive integers' });
        }
      }
      if (key === 'engagement_referral_xp') {
        const xp = parseInt(value, 10);
        if (isNaN(xp) || xp < 0) {
          return res.status(400).json({ error: 'engagement_referral_xp must be a non-negative integer' });
        }
      }
      if (key === 'welcome_modal') {
        try {
          const obj = typeof value === 'string' ? JSON.parse(value) : value;
          if (!obj || typeof obj !== 'object') throw new Error('not an object');
          if (!obj.title || typeof obj.title !== 'string') {
            return res.status(400).json({ error: 'welcome_modal.title is required' });
          }
          obj.enabled = !!obj.enabled;
          obj.version = parseInt(obj.version, 10) || 1;
          // Re-serialise canonical form
          req.body.value = JSON.stringify({
            enabled: obj.enabled,
            version: obj.version,
            eyebrow: String(obj.eyebrow || ''),
            title: String(obj.title),
            body: String(obj.body || ''),
            ctaText: String(obj.ctaText || ''),
            ctaHref: String(obj.ctaHref || ''),
          });
        } catch {
          return res.status(400).json({ error: 'welcome_modal must be a JSON object with at least { title }' });
        }
      }
      if (key === 'broadcast_ticker') {
        try {
          const obj = typeof value === 'string' ? JSON.parse(value) : value;
          if (!obj || typeof obj !== 'object') throw new Error('not an object');
          const items = Array.isArray(obj.items)
            ? obj.items.map(s => String(s || '').trim()).filter(Boolean)
            : [];
          if (items.length === 0) {
            return res.status(400).json({ error: 'broadcast_ticker.items must be a non-empty array of strings' });
          }
          req.body.value = JSON.stringify({
            enabled: !!obj.enabled,
            items,
          });
        } catch {
          return res.status(400).json({ error: 'broadcast_ticker must be a JSON object with { enabled, items[] }' });
        }
      }
      if (key === 'home_banner') {
        try {
          const obj = typeof value === 'string' ? JSON.parse(value) : value;
          if (!obj || typeof obj !== 'object') throw new Error('not an object');
          const title = String(obj.title || '').trim();
          if (!title) {
            return res.status(400).json({ error: 'home_banner.title is required' });
          }
          req.body.value = JSON.stringify({
            enabled: !!obj.enabled,
            version: parseInt(obj.version, 10) || 1,
            eyebrow: String(obj.eyebrow || '').trim(),
            title,
            body: String(obj.body || '').trim(),
            ctaText: String(obj.ctaText || '').trim(),
            ctaHref: String(obj.ctaHref || '').trim(),
          });
        } catch {
          return res.status(400).json({ error: 'home_banner must be a JSON object with at least { title }' });
        }
      }
      const stored = await db.setSetting(key, (key === 'welcome_modal' || key === 'broadcast_ticker' || key === 'home_banner') ? req.body.value : value);
      res.json({ setting: stored });
    } catch (err) {
      console.error('[API] admin/settings POST error:', err.message);
      res.status(500).json({ error: 'Failed to update setting' });
    }
  });

  router.get('/admin/duplicate-matches', authMiddleware, async (req, res) => {
    try {
      const duplicates = await db.findDuplicateMatches();
      res.json(duplicates);
    } catch (err) {
      res.status(500).json({ error: 'Failed to scan for duplicates' });
    }
  });

  router.get('/admin/unregistered-players', requireSuperuser, async (req, res) => {
    try {
      const players = await db.getUnregisteredPlayers();
      res.json(players);
    } catch (err) {
      console.error('[API] /admin/unregistered-players error:', err.message);
      res.status(500).json({ error: 'Failed to fetch unregistered players' });
    }
  });

  // Temporary test endpoint — trigger Discord notification for the latest match
  router.post('/admin/test-discord-notify', requireSuperuser, async (req, res) => {
    try {
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const latest = await pool.query(
        `SELECT m.match_id, m.radiant_win, m.duration
         FROM matches m ORDER BY m.date DESC LIMIT 1`
      );
      if (!latest.rows.length) return res.status(404).json({ error: 'No matches found' });

      const row = latest.rows[0];
      const matchId = row.match_id;

      const players = await pool.query(
        `SELECT ps.*, COALESCE(n.nickname, ps.persona_name) AS display_name
         FROM player_stats ps
         LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
         WHERE ps.match_id = $1`, [matchId]
      );
      await pool.end();

      const matchStats = {
        matchId,
        radiantWin: row.radiant_win,
        duration: row.duration,
        players: players.rows.map(p => ({
          team: p.team,
          accountId: p.account_id,
          personaname: p.display_name || p.persona_name || `Player ${p.slot}`,
          heroName: p.hero_name,
          heroId: p.hero_id,
          kills: p.kills || 0,
          deaths: p.deaths || 0,
          assists: p.assists || 0,
          goldPerMin: p.gpm || 0,
          heroDamage: p.hero_damage || 0,
          towerDamage: p.tower_damage || 0,
          heroHealing: p.hero_healing || 0,
          supportGoldSpent: p.support_gold_spent || 0,
          level: p.level || 0,
        })),
      };

      getDiscordBot().notifyWebUpload(matchStats).catch(err =>
        console.error('[TestNotify] Error:', err.message)
      );
      res.json({ ok: true, matchId, players: matchStats.players.length });
    } catch (err) {
      console.error('[TestNotify]', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/test-dm', requireSuperuser, express.json(), async (req, res) => {
    try {
      const { discordId } = req.body;
      if (!discordId) return res.status(400).json({ error: 'discordId is required' });
      const result = await getDiscordBot().sendTestDm(discordId);
      res.json({ ok: true, username: result.username, id: result.id });
    } catch (err) {
      console.error('[TestDM]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/test-rsvp-dm', requireSuperuser, express.json(), async (req, res) => {
    try {
      const { discordId } = req.body;
      if (!discordId) return res.status(400).json({ error: 'discordId is required' });
      const bot = getDiscordBot();
      const user = await bot.client.users.fetch(discordId).catch(() => null);
      if (!user) return res.status(404).json({ error: `User ${discordId} not found or bot cannot see them` });
      // Clear any existing pending registration so we force-send
      bot.pendingRegistrations.delete(user.id);
      const upcomingGames = await db.getUpcomingGames().catch(() => []);
      const fakeGame = upcomingGames[0] || {
        id: 0,
        scheduled_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        description: 'Test Inhouse',
      };
      const when = new Date(fakeGame.scheduled_at).toLocaleString('en-AU', {
        timeZone: 'Australia/Sydney', weekday: 'short', month: 'short',
        day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
      });
      bot.pendingRegistrations.set(user.id, { gameId: fakeGame.id, step: 'awaiting_steam_id' });
      await user.send(
        `👋 Hey **${user.username}**! You signed up for the inhouse on **${when}** AEST — nice one!\n\n` +
        `It looks like you haven't linked your Steam account yet. To show up properly on the leaderboard and stats, reply here with your **Steam64 ID** (17 digits).\n\n` +
        `📌 Find yours at: https://steamid.io\n` +
        `_(It looks like \`76561198012345678\`)_\n\n` +
        `Reply with just the number, or type \`skip\` to ignore this.\n\n` +
        `_[This is a test DM — the reply handler is fully live]_`
      );
      res.json({ ok: true, username: user.username, id: user.id });
    } catch (err) {
      console.error('[TestRsvpDM]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/matches/:matchId/trigger-dms', requireSuperuser, async (req, res) => {
    try {
      const missingOnly = req.body?.missingOnly !== false;
      const result = await getDiscordBot().triggerMatchDMs(req.params.matchId, missingOnly);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[TriggerDMs]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Patch notes
  router.get('/patch-notes', async (req, res) => {
    try {
      const notes = await db.getPatchNotes();
      res.json({ patchNotes: notes });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch patch notes' });
    }
  });

  router.get('/patch-notes/:id', async (req, res) => {
    try {
      const note = await db.getPatchNote(parseInt(req.params.id));
      if (!note) return res.status(404).json({ error: 'Patch note not found' });
      res.json(note);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch patch note' });
    }
  });

  router.post('/patch-notes', requireSuperuser, express.json(), async (req, res) => {
    try {
      const { version, title, content, author } = req.body;
      if (!version || !title || !content) {
        return res.status(400).json({ error: 'version, title, and content are required' });
      }
      const note = await db.createPatchNote({ version, title, content, author });
      res.status(201).json(note);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create patch note' });
    }
  });

  router.put('/patch-notes/:id', requireSuperuser, express.json(), async (req, res) => {
    try {
      const { version, title, content, author } = req.body;
      if (!version || !title || !content) {
        return res.status(400).json({ error: 'version, title, and content are required' });
      }
      const note = await db.updatePatchNote(parseInt(req.params.id), { version, title, content, author });
      if (!note) return res.status(404).json({ error: 'Patch note not found' });
      res.json(note);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update patch note' });
    }
  });

  // AI Chat — disabled (cost control)
  /* DISABLED: AI Chat removed to prevent API cost abuse.
  let _chatContextCache = null;
  let _chatContextExpiry = 0;
  async function getServerContext() {
    const now = Date.now();
    if (_chatContextCache && now < _chatContextExpiry) return _chatContextCache;
    try {
      const [leaderboard, heroStatsResult, overallStats, playerHeroProfiles, playerPosProfiles, recentMatches, matchCount] = await Promise.all([
        db.getComputedLeaderboard(null).catch(() => []),
        db.getHeroStats(null).catch(() => ({ heroes: [] })),
        db.getOverallStats(null).catch(() => []),
        db.getPlayerHeroProfiles(null).catch(() => []),
        db.getPlayerPositionProfiles(null).catch(() => []),
        db.getMatchHistory(15).catch(() => []),
        db.getMatchCount(null).catch(() => 0),
      ]);

      const heroStats = Array.isArray(heroStatsResult) ? heroStatsResult : (heroStatsResult?.heroes || []);
      const overallPlayers = Array.isArray(overallStats) ? overallStats : [];

      // Build lookups keyed by player_key / persona_name
      const overallLookup = {};
      for (const p of overallPlayers) {
        const k = p.nickname || p.persona_name || p.player_key;
        if (k) overallLookup[k] = p;
      }
      const heroProfileLookup = {};
      for (const p of playerHeroProfiles) {
        const k = p.nickname || p.persona_name || p.player_key;
        if (k) heroProfileLookup[k] = p;
      }
      const posProfileLookup = {};
      for (const p of playerPosProfiles) {
        const k = p.nickname || p.persona_name || p.player_key;
        if (k) posProfileLookup[k] = p;
      }

      const posLabel = { 1: 'Carry', 2: 'Mid', 3: 'Offlane', 4: 'Soft Sup', 5: 'Hard Sup' };

      // === LEADERBOARD ===
      const leaderboardLines = leaderboard.map((p, i) =>
        `${i + 1}. ${p.nickname || p.display_name || p.player_id} — ${p.mmr} MMR, ${p.wins}W ${p.losses}L (${p.wins + p.losses}g)`
      ).join('\n');

      // === PER-PLAYER FULL PROFILES ===
      const playerProfileLines = leaderboard.map(lp => {
        const name = lp.nickname || lp.display_name || lp.player_id;
        const ov = overallLookup[name] || overallLookup[lp.display_name] || overallLookup[lp.player_id] || {};
        const hp = heroProfileLookup[name] || heroProfileLookup[lp.display_name] || heroProfileLookup[lp.player_id] || {};
        const pp = posProfileLookup[name] || posProfileLookup[lp.display_name] || posProfileLookup[lp.player_id] || {};

        const games = lp.wins + lp.losses;
        const wr = games > 0 ? Math.round((lp.wins / games) * 100) : 0;

        // Core stats line
        const kda = ov.avg_kills != null ? `KDA ${ov.avg_kills}/${ov.avg_deaths}/${ov.avg_assists}` : '';
        const gpm = ov.avg_gpm ? `${ov.avg_gpm} GPM` : '';
        const dmg = ov.avg_hero_damage > 0 ? `${Math.round(ov.avg_hero_damage / 1000)}k dmg` : '';
        const heal = ov.avg_hero_healing > 200 ? `${Math.round(ov.avg_hero_healing / 1000)}k heal` : '';
        const statParts = [kda, gpm, dmg, heal].filter(Boolean).join(', ');

        // Position breakdown
        const positions = (pp.positions || [])
          .sort((a, b) => b.games - a.games)
          .slice(0, 3)
          .map(pos => `Pos${pos.position}(${posLabel[pos.position] || '?'}) ${pos.games}g ${Math.round((pos.wins / pos.games) * 100)}%WR`)
          .join(', ');

        // Hero breakdown — most played first, then sort top 5 by games
        const heroes = (hp.heroes || [])
          .sort((a, b) => b.games - a.games)
          .slice(0, 5)
          .map(h => {
            const hwr = h.games > 0 ? Math.round((h.wins / h.games) * 100) : 0;
            const hkda = `${h.avg_kills}/${h.avg_deaths}/${h.avg_assists}`;
            return `${h.hero_name} ${h.games}g ${hwr}%WR (${hkda} KDA)`;
          })
          .join(', ');

        // Best heroes by win rate (min 2 games)
        const bestHeroes = (hp.heroes || [])
          .filter(h => h.games >= 2)
          .sort((a, b) => (b.wins / b.games) - (a.wins / a.games))
          .slice(0, 3)
          .map(h => `${h.hero_name} ${Math.round((h.wins / h.games) * 100)}%WR`)
          .join(', ');

        const lines = [
          `[${name}] ${lp.mmr} MMR | ${lp.wins}W ${lp.losses}L (${wr}%WR)${statParts ? ' | ' + statParts : ''}`,
          positions ? `  Positions: ${positions}` : '',
          heroes ? `  Most picked: ${heroes}` : '',
          bestHeroes ? `  Best WR heroes: ${bestHeroes}` : '',
        ].filter(Boolean);
        return lines.join('\n');
      }).join('\n');

      // === SERVER-WIDE HERO STATS ===
      const heroLines = heroStats.map(h =>
        `${h.hero_name}: ${h.games}g ${h.win_rate}%WR`
      ).join(', ');

      // === RECENT MATCHES ===
      const recentMatchLines = recentMatches.map(m => {
        const date = new Date(m.date).toLocaleDateString('en-AU');
        const dur = m.duration ? `${Math.round(m.duration / 60)}min` : '';
        return `${date}: ${m.radiantWin ? 'Radiant' : 'Dire'} win${dur ? ' (' + dur + ')' : ''}${m.lobbyName ? ' | ' + m.lobbyName : ''}`;
      }).join('\n');

      _chatContextCache = [
        `OCE Dota 2 Inhouse Stats Site | Total matches (current season): ${matchCount} | Registered players: ${leaderboard.length}`,
        '',
        leaderboard.length > 0 ? `=== LEADERBOARD (TrueSkill MMR) ===\n${leaderboardLines}` : 'No matches recorded yet.',
        leaderboard.length > 0 ? `\n=== FULL PLAYER PROFILES ===\n${playerProfileLines}` : '',
        heroLines ? `\n=== SERVER HERO STATS ===\n${heroLines}` : '',
        recentMatchLines ? `\n=== RECENT MATCHES ===\n${recentMatchLines}` : '',
      ].filter(Boolean).join('\n');

      _chatContextExpiry = now + 5 * 60 * 1000;
    } catch (err) {
      console.error('[Chat] getServerContext error:', err.message);
      _chatContextCache = 'Stats unavailable.';
      _chatContextExpiry = now + 60 * 1000;
    }
    return _chatContextCache;
  }

  const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

  router.post('/chat', chatLimiter, express.json(), async (req, res) => {
    try {
      const { message, history } = req.body || {};
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message is required.' });
      }
      if (message.length > 500) {
        return res.status(400).json({ error: 'Message too long (max 500 chars).' });
      }
      const serverContext = await getServerContext();
      const reply = await generateChatResponse({
        message: message.trim(),
        history: Array.isArray(history) ? history : [],
        serverContext,
      });
      res.json({ reply });
    } catch (err) {
      console.error('[Chat API] Error:', err.message);
      res.status(500).json({ error: 'Chat service unavailable.' });
    }
  });
  */ // END DISABLED AI Chat

  router.get('/patch-notes', async (req, res) => {
    try {
      const notes = await db.getPatchNotes();
      res.json({ patchNotes: notes });
    } catch (err) {
      console.error('[API] GET /patch-notes error:', err.message);
      res.status(500).json({ error: 'Failed to fetch patch notes' });
    }
  });

  router.post('/patch-notes', authMiddleware, express.json(), async (req, res) => {
    try {
      const { version, title, content, author } = req.body || {};
      if (!version || !title || !content) {
        return res.status(400).json({ error: 'version, title, and content are required.' });
      }
      const note = await db.createPatchNote({ version, title, content, author });
      res.json(note);
    } catch (err) {
      console.error('[API] POST /patch-notes error:', err.message);
      res.status(500).json({ error: 'Failed to create patch note' });
    }
  });

  router.put('/patch-notes/:id', authMiddleware, express.json(), async (req, res) => {
    try {
      const { version, title, content, author } = req.body || {};
      if (!version || !title || !content) {
        return res.status(400).json({ error: 'version, title, and content are required.' });
      }
      const note = await db.updatePatchNote(parseInt(req.params.id), { version, title, content, author });
      if (!note) return res.status(404).json({ error: 'Patch note not found' });
      res.json(note);
    } catch (err) {
      console.error('[API] PUT /patch-notes error:', err.message);
      res.status(500).json({ error: 'Failed to update patch note' });
    }
  });

  router.delete('/patch-notes/:id', requireSuperuser, async (req, res) => {
    try {
      await db.deletePatchNote(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete patch note' });
    }
  });

  // ─── Dota Rank Endpoints ────────────────────────────────────────────────────

  router.get('/ranks', async (req, res) => {
    try {
      const rows = await db.getAllPlayerRanks();
      // v5.90 — strip out the dummy bot accounts (9_000_001..9_000_010) used
      // by the Inhouse draft sandbox. They get mass-registered with names
      // like "Bot AM" / "Bot CM" and were polluting the rank-management table.
      const filtered = (rows || []).filter(r => {
        const id = Number(r.account_id);
        return !(id >= 9000001 && id <= 9000010);
      });
      res.json(filtered);
    } catch (err) {
      console.error('[API] GET /ranks error:', err.message);
      res.status(500).json({ error: 'Failed to fetch ranks' });
    }
  });

  // Track whether a sync is in progress so we don't double-trigger
  let rankSyncInProgress = false;

  router.post('/ranks/sync', requireSuperuser, async (req, res) => {
    if (rankSyncInProgress) {
      return res.json({ ok: false, message: 'Sync already running' });
    }
    rankSyncInProgress = true;
    res.json({ ok: true, message: 'Rank sync started in background' });

    try {
      const { syncAllRanks } = require('../services/rankSyncService');
      let gcClient = null;
      try {
        const { getLobbyManager } = require('../lobby/lobbyManager');
        const lm = getLobbyManager();
        if (lm && lm.client && lm.client.gcClient) gcClient = lm.client.gcClient;
      } catch {}
      await syncAllRanks(gcClient, (cur, total, acct, src) => {
        console.log(`[RankSync] ${cur}/${total} account=${acct} source=${src}`);
      });
    } catch (err) {
      console.error('[API] Rank sync error:', err.message);
    } finally {
      rankSyncInProgress = false;
    }
  });

  router.post('/ranks/manual', requireSuperuser, async (req, res) => {
    try {
      const { accountId, rankTier, leaderboardRank } = req.body;
      if (!accountId) return res.status(400).json({ error: 'accountId required' });
      const { setManualRank } = require('../services/rankSyncService');
      await setManualRank(parseInt(accountId), rankTier ? parseInt(rankTier) : null, leaderboardRank ? parseInt(leaderboardRank) : null);
      res.json({ ok: true });
    } catch (err) {
      console.error('[API] POST /ranks/manual error:', err.message);
      res.status(500).json({ error: 'Failed to set rank' });
    }
  });

  router.delete('/ranks/:accountId', requireSuperuser, async (req, res) => {
    try {
      const { setManualRank } = require('../services/rankSyncService');
      await setManualRank(parseInt(req.params.accountId), null, null);
      await db.getPool().query(
        `UPDATE nicknames SET dota_rank_source = NULL WHERE account_id = $1`,
        [parseInt(req.params.accountId)]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to clear rank' });
    }
  });

  router.get('/player/:id/invite-link', async (req, res) => {
    try {
      const accountId = req.params.id;
      if (!accountId || !/^\d+$/.test(accountId)) {
        return res.status(400).json({ error: 'Invalid account ID' });
      }
      const origin = process.env.SITE_URL
        || `${req.protocol}://${req.get('host')}`;
      const inviteUrl = `${origin}/join?ref=${accountId}`;
      const storedReferralXp = await db.getSetting('engagement_referral_xp').catch(() => null);
      const referralXp = parseInt(storedReferralXp || process.env.REFERRAL_XP || '50', 10);
      res.json({ inviteUrl, accountId, referralXp });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/player/:id/referrals', async (req, res) => {
    try {
      const accountId = req.params.id;
      if (!accountId || !/^\d+$/.test(accountId)) {
        return res.status(400).json({ error: 'Invalid account ID' });
      }
      const data = await db.getPlayerReferrals(accountId);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/join', publicWriteLimiter, express.json(), async (req, res) => {
    try {
      const { discordUsername, steamUrl, preferredName, preferredPositions, message, mmr, referral } = req.body;
      if (!discordUsername || !discordUsername.trim()) {
        return res.status(400).json({ error: 'Discord ID is required' });
      }
      if (!steamUrl || !steamUrl.trim()) {
        return res.status(400).json({ error: 'Steam Profile URL is required' });
      }
      if (!mmr || !mmr.trim()) {
        return res.status(400).json({ error: 'Peak MMR / Rank is required' });
      }
      const row = await db.createSignupRequest({
        discordUsername: discordUsername.trim(),
        steamUrl: steamUrl.trim(),
        preferredName: preferredName ? preferredName.trim() : null,
        preferredPositions: Array.isArray(preferredPositions) ? preferredPositions.map(Number) : [],
        message: message ? message.trim() : null,
        mmr: mmr.trim(),
        referral: referral ? referral.trim() : null,
      });
      res.json({ success: true, id: row.id });
    } catch (err) {
      console.error('[API] Error creating signup request:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/admin/signups', requireSuperuser, async (req, res) => {
    try {
      const status = req.query.status || null;
      const rows = await db.getSignupRequests(status);
      res.json({ requests: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/admin/signups/:id', requireSuperuser, express.json(), async (req, res) => {
    try {
      const { status, adminNotes } = req.body;
      if (!status) return res.status(400).json({ error: 'status is required' });
      await db.updateSignupRequest(req.params.id, { status, adminNotes, reviewedBy: 'admin' });

      // Fetch full request for DM + auto-registration
      const requests = await db.getSignupRequests(null);
      const signup = requests.find(r => r.id === parseInt(req.params.id));
      const sideEffects = { dmSent: false, registered: false, registerError: null };

      if (signup) {
        const discordId = signup.discord_username?.trim();
        const displayName = signup.preferred_name || discordId;
        const { config } = require('../config');

        // --- Auto-register on approval ---
        if (status === 'approved' && discordId) {
          try {
            const steamId64 = await resolveSteamId64FromUrl(signup.steam_url || '');
            if (steamId64) {
              await db.registerPlayer(discordId, displayName, steamId64);
              sideEffects.registered = true;

              const referralStr = (signup.referral || '').trim();
              if (referralStr && /^\d+$/.test(referralStr)) {
                try {
                  const activeSeason = await db.getActiveSeason().catch(() => null);
                  const newAccountId32 = (BigInt(steamId64) - 76561197960265728n).toString();
                  if (activeSeason) {
                    const referralRecorded = await db.setPlayerReferredBy(newAccountId32, referralStr);
                    if (referralRecorded) {
                      const storedXp = await db.getSetting('engagement_referral_xp').catch(() => null);
                      const referralXpAmount = parseInt(storedXp || process.env.REFERRAL_XP || '50', 10);
                      const granted = await db.grantReferralXp(referralStr, newAccountId32, activeSeason.id, referralXpAmount);
                      if (granted) {
                        console.log(`[Referral] Granted ${referralXpAmount} XP to account ${referralStr} for referring ${newAccountId32}`);
                        // Check referral achievements for the referrer (best-effort)
                        const referrerId = parseInt(referralStr) || 0;
                        if (referrerId) {
                          db.checkAndGrantAchievements([referrerId], null).then(newOnes => {
                            if (newOnes.length) {
                              const grants = [{ player: { accountId: referrerId, personaname: '' }, newOnes }];
                              try {
                                getDiscordBot()._notifyAchievementsUnlocked(grants).catch(() => {});
                              } catch (_) {}
                              // Task #217 — voice-pack achievement-unlock event for the referrer.
                              try { voiceEventQueue.pushAchievementVoiceEvents(grants); } catch (_) {}
                            }
                          }).catch(() => {});
                        }
                      }
                    }
                  }
                } catch (refErr) {
                  console.error('[Referral] XP grant failed:', refErr.message);
                }
              }
            } else {
              sideEffects.registerError = 'Could not resolve a Steam64 ID from the provided URL — register manually.';
            }
          } catch (regErr) {
            sideEffects.registerError = regErr.message;
            console.error('[Signups] Auto-register failed:', regErr.message);
          }
        }

        // --- Discord DM ---
        if (discordId && /^\d+$/.test(discordId)) {
          try {
            const bot = getDiscordBot();
            const user = await bot.client.users.fetch(discordId).catch(() => null);
            if (user) {
              let dmText;
              if (status === 'approved') {
                const inviteClause = config.discord.serverInvite
                  ? `\n\n🔗 **Join the server here:** ${config.discord.serverInvite}`
                  : '';
                const regClause = sideEffects.registered
                  ? '\n\n✅ Your account has been automatically registered — you\'ll appear on the leaderboard after your first game.'
                  : sideEffects.registerError
                    ? `\n\n⚠️ Please ask an admin to register your Steam account manually (${sideEffects.registerError}).`
                    : '';
                dmText = `🎉 **Welcome to the OCE Inhouse League, ${displayName}!**\n\nYour application has been **approved**.${inviteClause}${regClause}` +
                  (adminNotes ? `\n\n📝 Note from admin: *${adminNotes}*` : '');
              } else {
                dmText = `Hi **${displayName}**, thanks for your interest in the OCE Inhouse League.\n\nUnfortunately your application was **not approved** at this time.` +
                  (adminNotes ? `\n\n📝 Note from admin: *${adminNotes}*` : '');
              }
              await user.send(dmText);
              sideEffects.dmSent = true;
            }
          } catch (dmErr) {
            console.error('[Signups] DM failed:', dmErr.message);
          }
        }
      }

      res.json({ success: true, ...sideEffects });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // Inhouse Sessions API (FACEIT-style match accept + draft)
  // ============================================================

  router.get('/inhouse/active', async (req, res) => {
    try {
      const session = await db.getActiveInhouseSession();
      if (!session) return res.json({ session: null });
      const players = await db.getInhouseSessionPlayers(session.id);
      res.json({ session, players });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/inhouse', async (req, res) => {
    try {
      const sessions = await db.listInhouseSessions({ status: req.query.status || null, limit: parseInt(req.query.limit || '20', 10) });
      res.json({ sessions });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/inhouse/:id', async (req, res) => {
    try {
      const session = await db.getInhouseSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const players = await db.getInhouseSessionPlayers(session.id);
      res.json({ session, players });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Task #190 — captain auto-pick rate over the last N completed sessions in
  // which this account was a captain. Public read; the underlying inhouse
  // session/player rows are already public.
  router.get('/inhouse/captain-stats/:accountId', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '5', 10);
      const stats = await db.getCaptainAutoPickStats(req.params.accountId, limit);
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Helper: derive caller account from authenticated Steam session, with admin override.
  // Admins (superuser session or valid x-superuser-key) may pass an explicit accountId in the body.
  function _resolveInhouseActor(req, requireAuth = true) {
    const adminKey = process.env.SUPERUSER_PASSWORD;
    const isAdmin = !!(req.session && req.session.isSuperuser) ||
      !!(adminKey && req.headers['x-superuser-key'] === adminKey);
    let accountId = null;
    if (req.session && req.session.accountId) accountId = req.session.accountId;
    if (isAdmin && req.body?.accountId) accountId = req.body.accountId;
    if (requireAuth && !accountId) {
      return { error: 'Sign in with Steam first.', status: 401 };
    }
    return { accountId, isAdmin };
  }

  // Task #136 — hard gate. Every player joining the inhouse lobby must (a)
  // have a Discord account linked to their Steam account, and (b) currently
  // be a member of the OCE Inhouse Discord server. Admins bypass both
  // checks (so the demo / seed-bots flow is unaffected). Returns null when
  // the caller is allowed; otherwise returns { status, body } the route
  // should respond with directly. The bot helper returns inGuild=null when
  // it cannot answer (bot starting up, guild not configured, can't reach
  // the guild) — we treat that as a soft pass so a bot-side outage doesn't
  // lock everyone out of joining.
  async function _enforceDiscordGuildGate(actor) {
    if (!actor || actor.isAdmin) return null;
    let discordId = null;
    try {
      discordId = await db.getDiscordIdByAccountId(actor.accountId);
    } catch (err) {
      console.warn('[inhouse-gate] discord lookup failed:', err.message);
      return { status: 503, body: { error: 'Could not verify your Discord link right now. Try again in a moment.', code: 'discord_check_failed' } };
    }
    if (!discordId) {
      return {
        status: 403,
        body: {
          error: 'Link your Discord account before joining the inhouse lobby.',
          code: 'discord_required',
        },
      };
    }
    try {
      const bot = getDiscordBot();
      const r = await bot.isInLeagueGuild(discordId);
      if (r.inGuild === false) {
        return {
          status: 403,
          body: {
            error: 'Join the OCE Inhouse Discord server before queueing — you currently aren\'t a member.',
            code: 'discord_not_in_guild',
            invite_url: config.discord.serverInvite || null,
          },
        };
      }
      // r.inGuild === true (allow) or null (unknown — soft-allow with a log).
      if (r.inGuild === null) {
        console.warn(`[inhouse-gate] guild membership unknown for account ${actor.accountId} — soft-allowing join.`);
      }
    } catch (err) {
      console.warn('[inhouse-gate] guild check threw:', err.message);
    }
    return null;
  }

  // v6.03 — auto-running lobby entrypoint. Any signed-in player can join
  // without an admin pre-creating a session: if no joinable session exists
  // we create one with default settings (60s accept window / 10 min players /
  // 30s grace). Idempotent — concurrent first-joiners share the session via
  // an advisory lock inside getOrCreateOpenInhouseSession().
  router.post('/inhouse/join', express.json(), async (req, res) => {
    try {
      const actor = _resolveInhouseActor(req);
      if (actor.error) return res.status(actor.status).json({ error: actor.error });
      // Task #136 — Discord-link + guild-membership hard gate.
      const gate = await _enforceDiscordGuildGate(actor);
      if (gate) return res.status(gate.status).json(gate.body);
      const { session, created } = await db.getOrCreateOpenInhouseSession({
        createdBy: 'auto:' + actor.accountId,
      });
      if (!['open','accepting'].includes(session.status)) {
        return res.status(409).json({
          error: `Lobby is in ${session.status} phase — cannot join right now.`,
          session,
        });
      }
      const player = await db.joinInhouseSession(
        session.id, actor.accountId, req.body?.preferredPositions || null
      );
      // Task #136 — capture the express-session id so the sweep tick can
      // drop this seat the moment the underlying Steam session goes away
      // (logout, cookie expiry, store eviction).
      try { await db.touchInhousePlayerHeartbeat(actor.accountId, req.sessionID || null); } catch {}
      res.json({ session, player, created });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // v6.03 — captain-mode poll. Signed-in players that have joined the
  // session can cast / change their vote until the accept phase begins.
  // The winning mode is materialised onto inhouse_sessions.captain_mode
  // by autoStartTicker at status-flip time.
  router.post('/inhouse/:id/captain-vote', express.json(), async (req, res) => {
    try {
      const actor = _resolveInhouseActor(req);
      if (actor.error) return res.status(actor.status).json({ error: actor.error });
      const session = await db.getInhouseSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.status !== 'open') {
        return res.status(400).json({ error: 'Voting is closed once the accept phase has started.' });
      }
      const players = await db.getInhouseSessionPlayers(session.id);
      const inLobby = players.some(p => Number(p.account_id) === Number(actor.accountId));
      if (!inLobby && !actor.isAdmin) {
        return res.status(403).json({ error: 'Join the lobby first, then vote.' });
      }
      const mode = String(req.body?.mode || '');
      let votes;
      if (req.body?.clear) {
        votes = await db.clearCaptainModeVote(session.id, actor.accountId);
      } else {
        try {
          votes = await db.setCaptainModeVote(session.id, actor.accountId, mode);
        } catch (e) {
          if (e.code === 'invalid_mode') return res.status(400).json({ error: 'Invalid captain mode.' });
          throw e;
        }
      }
      // v6.03 — only count votes from players that are *currently* in the
      // lobby, so a vote-then-leave can't poison the tally / winner.
      const memberSet = new Set(players.map(p => String(p.account_id)));
      const tally = db.tallyCaptainModeVotes(votes, memberSet);
      res.json({
        ok: true,
        myVote: memberSet.has(String(actor.accountId)) ? (votes[String(actor.accountId)] || null) : null,
        tally,
        winning: db.resolveWinningCaptainMode(votes, memberSet),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Task #119 — captain volunteer signups for the 'volunteer' captain mode.
  // Players that have *accepted* the match can opt in/out as a captain
  // volunteer until /select-captains runs. The select route then picks the
  // two captains from the volunteer pool (falling back to Highest Rank if 0
  // or 1 volunteers, random pick if more than 2).
  router.post('/inhouse/:id/captain-volunteer', express.json(), async (req, res) => {
    try {
      const actor = _resolveInhouseActor(req);
      if (actor.error) return res.status(actor.status).json({ error: actor.error });
      const session = await db.getInhouseSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      // Volunteer signup is only meaningful while the lobby is filling or in
      // accept phase — once we're drafting/in_progress the captains are set.
      if (!['open','accepting'].includes(session.status)) {
        return res.status(400).json({ error: 'Volunteer signup is closed for this session.' });
      }
      const players = await db.getInhouseSessionPlayers(session.id);
      const me = players.find(p => Number(p.account_id) === Number(actor.accountId));
      if (!me && !actor.isAdmin) {
        return res.status(403).json({ error: 'Join the lobby first.' });
      }
      const wantVolunteer = !!req.body?.volunteer;
      // Only accepted players can volunteer. (An admin can toggle their own
      // signup at any time so demo/seed flows still work.)
      if (wantVolunteer && me && me.status !== 'accepted' && !actor.isAdmin) {
        return res.status(400).json({ error: 'Accept the match before volunteering as captain.' });
      }
      const volunteers = await db.setCaptainVolunteer(session.id, actor.accountId, wantVolunteer);
      const memberSet = new Set(players.map(p => String(p.account_id)));
      const list = db.listVolunteerAccountIds(volunteers, memberSet);
      res.json({
        ok: true,
        myVolunteer: list.includes(String(actor.accountId)),
        count: list.length,
        volunteers: list.map(Number),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/inhouse/:id/captain-volunteers', async (req, res) => {
    try {
      const session = await db.getInhouseSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const [volunteers, players] = await Promise.all([
        db.getCaptainVolunteers(session.id),
        db.getInhouseSessionPlayers(session.id),
      ]);
      const memberSet = new Set(players.map(p => String(p.account_id)));
      const list = db.listVolunteerAccountIds(volunteers, memberSet);
      const myAccountId = req.session?.accountId ? Number(req.session.accountId) : null;
      res.json({
        volunteers: list.map(Number),
        count: list.length,
        myVolunteer: myAccountId ? list.includes(String(myAccountId)) : false,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/inhouse/:id/captain-vote-tally', async (req, res) => {
    try {
      const session = await db.getInhouseSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const [votes, players] = await Promise.all([
        db.getCaptainModeVotes(session.id),
        db.getInhouseSessionPlayers(session.id),
      ]);
      // v6.03 — filter to current members so the public tally never shows
      // ghost votes from players that have left the lobby.
      const memberSet = new Set(players.map(p => String(p.account_id)));
      const filtered = db.filterVotesToMembers(votes, memberSet);
      const myAccountId = req.session?.accountId ? Number(req.session.accountId) : null;
      res.json({
        tally: db.tallyCaptainModeVotes(votes, memberSet),
        winning: db.resolveWinningCaptainMode(votes, memberSet),
        myVote: myAccountId ? (filtered[String(myAccountId)] || null) : null,
        totalVotes: Object.keys(filtered).length,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // v6.03 — admin live-config update for an in-flight session. Lets a
  // superuser tweak captain mode / accept timer / min players / lobby fill
  // grace from the collapsed admin-overrides panel on /inhouse without
  // having to open psql or cancel-and-recreate the session. Whitelist of
  // fields is narrow on purpose; status / payment / replay / captain
  // assignments stay on their dedicated routes.
  router.patch('/inhouse/:id/config', requireSuperuser, express.json(), async (req, res) => {
    try {
      const session = await db.getInhouseSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const allowed = ['captain_mode','accept_phase_seconds','min_players','lobby_fill_seconds','draft_pick_seconds'];
      const fields = {};
      for (const k of allowed) {
        if (req.body && Object.prototype.hasOwnProperty.call(req.body, k)) fields[k] = req.body[k];
      }
      // Validate captain_mode against the same set used in the poll/select route.
      if (fields.captain_mode && !['highest_rank','random','highest_roll','auto_balance','volunteer'].includes(fields.captain_mode)) {
        return res.status(400).json({ error: 'Invalid captain mode' });
      }
      for (const numKey of ['accept_phase_seconds','min_players','lobby_fill_seconds','draft_pick_seconds']) {
        if (fields[numKey] != null) {
          const n = Number(fields[numKey]);
          // Task #172 — align server bounds for draft_pick_seconds with the
          // UI controls (5..300). The other three fields keep the existing
          // 0..600 envelope they shipped with.
          const min = numKey === 'draft_pick_seconds' ? 5 : 0;
          const max = numKey === 'draft_pick_seconds' ? 300 : 600;
          if (!Number.isFinite(n) || n < min || n > max) return res.status(400).json({ error: `Invalid ${numKey}` });
          fields[numKey] = Math.floor(n);
        }
      }
      if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No editable fields supplied' });
      const updated = await db.updateInhouseSession(req.params.id, fields);
      res.json({ session: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/inhouse', requireSuperuser, express.json(), async (req, res) => {
    try {
      const { captainMode, acceptPhaseSeconds, notes, minPlayers, lobbyFillSeconds, draftPickSeconds } = req.body || {};
      const session = await db.createInhouseSession({
        captainMode: captainMode || 'highest_rank',
        acceptPhaseSeconds: parseInt(acceptPhaseSeconds || '60', 10),
        minPlayers: parseInt(minPlayers || '10', 10),
        lobbyFillSeconds: parseInt(lobbyFillSeconds || '30', 10),
        draftPickSeconds: parseInt(draftPickSeconds || '30', 10),
        notes: notes || null,
        createdBy: req.session?.displayName || 'admin',
      });
      res.json({ session });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/inhouse/:id/join', express.json(), async (req, res) => {
    try {
      const actor = _resolveInhouseActor(req);
      if (actor.error) return res.status(actor.status).json({ error: actor.error });
      // Task #136 — Discord-link + guild-membership hard gate.
      const gate = await _enforceDiscordGuildGate(actor);
      if (gate) return res.status(gate.status).json(gate.body);
      const session = await db.getInhouseSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (!['open','accepting'].includes(session.status)) return res.status(400).json({ error: 'Session not joinable in current phase' });
      const player = await db.joinInhouseSession(session.id, actor.accountId, req.body?.preferredPositions || null);
      try { await db.touchInhousePlayerHeartbeat(actor.accountId, req.sessionID || null); } catch {}
      res.json({ player });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Task #136 — liveness heartbeat. Frontend pings this every ~15s while
  // the inhouse page is mounted (and via navigator.sendBeacon on tab hide /
  // unload). Updates last_seen_at across every joinable session the caller
  // is in, so the autoStartTicker sweep can drop stale players (closed tab
  // / asleep browser) and free their lobby slot quickly. Cheap by design —
  // returns the count of rows touched so the client can detect "you've been
  // dropped" without reloading.
  router.post('/inhouse/heartbeat', express.json(), async (req, res) => {
    try {
      const actor = _resolveInhouseActor(req);
      if (actor.error) return res.status(actor.status).json({ error: actor.error });
      const touched = await db.touchInhousePlayerHeartbeat(actor.accountId, req.sessionID || null);
      res.json({ ok: true, touched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/inhouse/:id/leave', express.json(), async (req, res) => {
    try {
      const actor = _resolveInhouseActor(req);
      if (actor.error) return res.status(actor.status).json({ error: actor.error });
      const session = await db.getInhouseSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (!['open','accepting'].includes(session.status)) return res.status(400).json({ error: 'Cannot leave once drafting/in-progress' });
      await db.leaveInhouseSession(req.params.id, actor.accountId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/inhouse/:id/accept', express.json(), async (req, res) => {
    try {
      const actor = _resolveInhouseActor(req);
      if (actor.error) return res.status(actor.status).json({ error: actor.error });
      const session = await db.getInhouseSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.status !== 'accepting') return res.status(400).json({ error: 'Not in accept phase' });
      const player = await db.setInhousePlayerAccepted(req.params.id, actor.accountId);
      if (!player) return res.status(404).json({ error: 'You are not registered for this session' });
      res.json({ player });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/inhouse/:id/decline', express.json(), async (req, res) => {
    try {
      const actor = _resolveInhouseActor(req);
      if (actor.error) return res.status(actor.status).json({ error: actor.error });
      const session = await db.getInhouseSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.status !== 'accepting') return res.status(400).json({ error: 'Not in accept phase' });
      const player = await db.setInhousePlayerDeclined(req.params.id, actor.accountId);
      if (!player) return res.status(404).json({ error: 'You are not registered for this session' });
      res.json({ player });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/inhouse/:id/start-accept-phase', requireSuperuser, express.json(), async (req, res) => {
    try {
      const seconds = parseInt(req.body?.seconds || '60', 10);
      const cur = await db.getInhouseSession(req.params.id);
      if (!cur) return res.status(404).json({ error: 'Session not found' });
      if (cur.status !== 'open') return res.status(400).json({ error: `Cannot start accept phase from status ${cur.status}` });
      const session = await db.updateInhouseSession(req.params.id, {
        status: 'accepting',
        accept_phase_starts_at: new Date(),
        accept_phase_seconds: seconds,
      });
      res.json({ session });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/inhouse/:id/select-captains', requireSuperuser, express.json(), async (req, res) => {
    try {
      // Task #136 — pre-flight Discord guild re-verification. We do this
      // BEFORE the atomic flip to 'drafting' so that any player who has left
      // the OCE Inhouse Discord server between joining and the accept-phase
      // expiry gets dropped from the lobby (they're skipping voice). Bot
      // accounts (the demo seed range 9_000_001..9_000_010) are excluded.
      // Players whose discord_id can't be looked up or whose membership the
      // bot can't currently answer for are NOT dropped — soft-pass to avoid
      // killing the lobby on a bot-side outage.
      const pool = db.getPool();
      try {
        const preflightPlayers = await db.getInhouseSessionPlayers(req.params.id);
        const acceptedPre = preflightPlayers.filter(p => p.status === 'accepted');
        const dropped = [];
        if (acceptedPre.length > 0) {
          const bot = getDiscordBot();
          for (const p of acceptedPre) {
            const aid = Number(p.account_id);
            if (aid >= 9_000_001 && aid <= 9_000_010) continue; // demo bots
            let discordId = null;
            try { discordId = await db.getDiscordIdByAccountId(aid); } catch {}
            if (!discordId) {
              await db.leaveInhouseSession(req.params.id, aid).catch(() => {});
              dropped.push({ account_id: aid, reason: 'discord_required' });
              continue;
            }
            let inGuild;
            try {
              const r = await bot.isInLeagueGuild(discordId);
              inGuild = r.inGuild;
            } catch { inGuild = null; }
            if (inGuild === false) {
              await db.leaveInhouseSession(req.params.id, aid).catch(() => {});
              dropped.push({ account_id: aid, reason: 'discord_not_in_guild' });
            }
          }
        }
        if (dropped.length) {
          console.warn(`[select-captains] preflight dropped ${dropped.length} player(s) from session ${req.params.id}:`,
            dropped.map(d => `${d.account_id}(${d.reason})`).join(', '));
        }
      } catch (e) {
        console.warn('[select-captains] preflight guild check failed (soft-pass):', e.message);
      }

      // Atomic phase-guarded transition: only proceed if still in 'accepting'
      const guardRes = await pool.query(
        `UPDATE inhouse_sessions SET status = 'drafting' WHERE id = $1 AND status = 'accepting' RETURNING *`,
        [req.params.id]
      );
      if (guardRes.rowCount === 0) {
        const cur = await db.getInhouseSession(req.params.id);
        if (!cur) return res.status(404).json({ error: 'Session not found' });
        return res.status(409).json({ error: `Captains already selected (status=${cur.status})` });
      }
      const session = guardRes.rows[0];
      const players = await db.getInhouseSessionPlayers(session.id);
      const accepted = players.filter(p => p.status === 'accepted');
      // Task #136 — re-honour the session's min_players after the guild
      // pre-flight may have trimmed the accepted roster. If we've dropped
      // below the floor, abort the flip and return the lobby to 'open' so
      // it can refill cleanly (mirrors the autoStartTicker shortfall path).
      const minRequired = Math.max(2, Number(session.min_players) || 2);
      if (accepted.length < minRequired) {
        await pool.query(
          `UPDATE inhouse_sessions
              SET status = 'open',
                  accept_phase_starts_at = NULL,
                  auto_start_at = NULL
            WHERE id = $1`,
          [session.id]
        );
        await pool.query(
          `UPDATE inhouse_session_players SET status = 'registered', accepted_at = NULL
             WHERE session_id = $1 AND status IN ('accepted','declined')`,
          [session.id]
        );
        return res.status(409).json({
          error: `Only ${accepted.length}/${minRequired} accepted players remain after Discord guild re-check — returning lobby to open.`,
          code: 'preflight_shortfall',
          accepted: accepted.length,
          required: minRequired,
        });
      }
      if (accepted.length < 2) {
        // Roll back phase guard
        await db.updateInhouseSession(session.id, { status: 'accepting' });
        return res.status(400).json({ error: 'Need at least 2 accepted players to choose captains' });
      }

      const mode = req.body?.mode || session.captain_mode || 'highest_rank';
      let cap1, cap2;

      if (mode === 'highest_rank') {
        // v5.75 hybrid: prefer in-house TrueSkill MMR for players with ≥20
        // recorded games (real signal of skill in this lobby), otherwise fall
        // back to their Dota MMR / leaderboard rank so newcomers aren't ranked
        // off a near-default TS rating. Leaderboard rank (where present) trumps
        // rank tier; rank tier is normalised onto a coarse MMR scale so it
        // sorts comparably against TrueSkill.
        const RANK_TIER_TO_MMR = {
          11: 200, 12: 400, 13: 600, 14: 800, 15: 1000,
          21: 1200, 22: 1400, 23: 1600, 24: 1800, 25: 2000,
          31: 2200, 32: 2400, 33: 2600, 34: 2800, 35: 3000,
          41: 3200, 42: 3400, 43: 3600, 44: 3800, 45: 4000,
          51: 4200, 52: 4400, 53: 4600, 54: 4800, 55: 5000,
          61: 5300, 62: 5600, 63: 5900, 64: 6200, 65: 6500,
          71: 6800, 72: 7200, 73: 7600, 74: 8000, 75: 8500,
          80: 9500,
        };
        function effectiveRank(p) {
          const games = Number(p.games_played) || 0;
          if (games >= 20) {
            // TS MMR is in the ~5–50 range; scale it up so it's comparable.
            return { score: Number(p.trueskill_mmr || 0) * 100, basis: 'inhouse' };
          }
          if (p.dota_leaderboard_rank && Number(p.dota_leaderboard_rank) > 0) {
            // Top 1 = best; map rank 1 → 12000, rank 1000 → 9500ish.
            return { score: 12000 - Math.min(2500, Math.log2(Number(p.dota_leaderboard_rank)) * 250), basis: 'dota_lb' };
          }
          if (p.dota_rank_tier && RANK_TIER_TO_MMR[p.dota_rank_tier]) {
            return { score: RANK_TIER_TO_MMR[p.dota_rank_tier], basis: 'dota_rank' };
          }
          // No Dota signal — fall back to TS even with few games, but penalised.
          return { score: Number(p.trueskill_mmr || 0) * 100 - 1000, basis: 'fallback' };
        }
        const scored = accepted.map(p => ({ p, ...effectiveRank(p) }));
        scored.sort((a, b) => b.score - a.score);
        cap1 = scored[0].p;
        cap2 = scored[1].p;
      } else if (mode === 'random') {
        const shuffled = [...accepted].sort(() => Math.random() - 0.5);
        cap1 = shuffled[0];
        cap2 = shuffled[1];
      } else if (mode === 'highest_roll') {
        for (const p of accepted) {
          const roll = Math.floor(Math.random() * 100) + 1;
          await db.setInhousePlayerRoll(session.id, p.account_id, roll);
          p.roll = roll;
        }
        const sorted = [...accepted].sort((a, b) => (b.roll || 0) - (a.roll || 0));
        cap1 = sorted[0];
        cap2 = sorted[1];
      } else if (mode === 'auto_balance') {
        // v6.04 — real skill-based balancing. We score each accepted player
        // using the same hybrid TS/Dota signal as Highest Rank, then:
        //   * If exactly 10 accepted, enumerate all 5-vs-5 partitions (252)
        //     and pick the split with the smallest projected skill delta.
        //     Captains = top scorer on each team. The remaining 8 players
        //     are auto-assigned to their teams (drafted) so the captain
        //     draft is effectively skipped — the lobby goes straight from
        //     "captains chosen" to a fully populated, balanced match.
        //   * Otherwise, pair captains as the two accepted players whose
        //     scores are closest (so the resulting captain draft starts
        //     from an already-balanced top of the pool). Any leftover
        //     players still go through the normal draft.
        const RANK_TIER_TO_MMR = {
          11: 200, 12: 400, 13: 600, 14: 800, 15: 1000,
          21: 1200, 22: 1400, 23: 1600, 24: 1800, 25: 2000,
          31: 2200, 32: 2400, 33: 2600, 34: 2800, 35: 3000,
          41: 3200, 42: 3400, 43: 3600, 44: 3800, 45: 4000,
          51: 4200, 52: 4400, 53: 4600, 54: 4800, 55: 5000,
          61: 5300, 62: 5600, 63: 5900, 64: 6200, 65: 6500,
          71: 6800, 72: 7200, 73: 7600, 74: 8000, 75: 8500,
          80: 9500,
        };
        const score = (p) => {
          const games = Number(p.games_played) || 0;
          if (games >= 20) return Number(p.trueskill_mmr || 0) * 100;
          if (p.dota_leaderboard_rank && Number(p.dota_leaderboard_rank) > 0) {
            return 12000 - Math.min(2500, Math.log2(Number(p.dota_leaderboard_rank)) * 250);
          }
          if (p.dota_rank_tier && RANK_TIER_TO_MMR[p.dota_rank_tier]) return RANK_TIER_TO_MMR[p.dota_rank_tier];
          return Number(p.trueskill_mmr || 0) * 100 - 1000;
        };
        const scored = accepted.map(p => ({ p, s: score(p) }));
        // Task #130 — capture projected balance metadata so the inhouse page
        // can show players how balanced the auto-picked teams actually are.
        var _autoBalanceMeta = null;

        if (scored.length === 10) {
          // Enumerate all C(10,5) = 252 partitions. Track best by |delta|;
          // break ties randomly so repeated calls don't always produce the
          // same arrangement when several splits are equally balanced.
          const n = scored.length;
          let best = null; // { team1: [idx...], team2: [idx...], delta }
          const idx = [0,1,2,3,4,5,6,7,8,9];
          for (let a=0; a<n-4; a++)
          for (let b=a+1; b<n-3; b++)
          for (let c=b+1; c<n-2; c++)
          for (let d=c+1; d<n-1; d++)
          for (let e=d+1; e<n; e++) {
            const t1 = [a,b,c,d,e];
            const t1set = new Set(t1);
            const t2 = idx.filter(i => !t1set.has(i));
            const sum1 = t1.reduce((acc,i)=>acc+scored[i].s, 0);
            const sum2 = t2.reduce((acc,i)=>acc+scored[i].s, 0);
            const delta = Math.abs(sum1 - sum2);
            if (!best || delta < best.delta || (delta === best.delta && Math.random() < 0.5)) {
              best = { team1: t1, team2: t2, delta };
            }
          }
          // Captain on each side = highest scorer. Sort each team's indices
          // by descending score so position 0 is the captain (pickOrder=0)
          // and the rest get sequential pickOrders 1..4 in score order.
          const t1Sorted = best.team1.slice().sort((i, j) => scored[j].s - scored[i].s);
          const t2Sorted = best.team2.slice().sort((i, j) => scored[j].s - scored[i].s);
          cap1 = scored[t1Sorted[0]].p;
          cap2 = scored[t2Sorted[0]].p;
          // Stash the full team assignment so we can apply it after picking
          // captains (avoids changing the captain-selection contract).
          var _autoBalanceAssignments = [
            ...t1Sorted.map((i, k) => ({
              accountId: scored[i].p.account_id,
              team: 1,
              pickOrder: k, // k=0 is the captain by construction
            })),
            ...t2Sorted.map((i, k) => ({
              accountId: scored[i].p.account_id,
              team: 2,
              pickOrder: k,
            })),
          ];
          // Task #130 — record the projected balance for the chosen split.
          // sum1/sum2 are recomputed from the canonical scored[] so they
          // exactly match what the search optimised. winProbTeam1 uses an
          // Elo-style logistic on the score delta (treating a score unit as
          // ~1 MMR point, since score() multiplies trueskill mu by 100).
          const sum1 = best.team1.reduce((acc, i) => acc + scored[i].s, 0);
          const sum2 = best.team2.reduce((acc, i) => acc + scored[i].s, 0);
          const scoresMap = {};
          for (const { p, s } of scored) scoresMap[String(p.account_id)] = Math.round(s);
          const winProbTeam1 = 1 / (1 + Math.pow(10, (sum2 - sum1) / 4000));
          _autoBalanceMeta = {
            team1Sum: Math.round(sum1),
            team2Sum: Math.round(sum2),
            delta: Math.round(best.delta),
            winProbTeam1: Number(winProbTeam1.toFixed(4)),
            scores: scoresMap,
            playerCount: scored.length,
            computedAt: new Date().toISOString(),
          };
        } else {
          // Fewer (or more) than 10 accepted — just pair captains by closest
          // score so the resulting draft starts from a balanced top.
          const sorted = scored.slice().sort((a, b) => b.s - a.s);
          let bestPair = [sorted[0], sorted[1]];
          let bestDelta = Math.abs(sorted[0].s - sorted[1].s);
          for (let i = 0; i < sorted.length - 1; i++) {
            const d = Math.abs(sorted[i].s - sorted[i+1].s);
            if (d < bestDelta) { bestDelta = d; bestPair = [sorted[i], sorted[i+1]]; }
          }
          // Higher-scored player → team 1 to keep deterministic team labels.
          cap1 = bestPair[0].s >= bestPair[1].s ? bestPair[0].p : bestPair[1].p;
          cap2 = bestPair[0].s >= bestPair[1].s ? bestPair[1].p : bestPair[0].p;
        }
      } else if (mode === 'volunteer') {
        // Task #119 — Volunteer mode. Players self-nominate via
        // /inhouse/:id/captain-volunteer during the accept phase. Filter the
        // saved volunteer pool down to currently-accepted players, then:
        //   * 0 or 1 volunteers → fall back to Highest Rank (hybrid skill)
        //     so the lobby still progresses if nobody opts in.
        //   * exactly 2 volunteers → those two are the captains.
        //   * more than 2 volunteers → pick two at random.
        const RANK_TIER_TO_MMR = {
          11: 200, 12: 400, 13: 600, 14: 800, 15: 1000,
          21: 1200, 22: 1400, 23: 1600, 24: 1800, 25: 2000,
          31: 2200, 32: 2400, 33: 2600, 34: 2800, 35: 3000,
          41: 3200, 42: 3400, 43: 3600, 44: 3800, 45: 4000,
          51: 4200, 52: 4400, 53: 4600, 54: 4800, 55: 5000,
          61: 5300, 62: 5600, 63: 5900, 64: 6200, 65: 6500,
          71: 6800, 72: 7200, 73: 7600, 74: 8000, 75: 8500,
          80: 9500,
        };
        const score = (p) => {
          const games = Number(p.games_played) || 0;
          if (games >= 20) return Number(p.trueskill_mmr || 0) * 100;
          if (p.dota_leaderboard_rank && Number(p.dota_leaderboard_rank) > 0) {
            return 12000 - Math.min(2500, Math.log2(Number(p.dota_leaderboard_rank)) * 250);
          }
          if (p.dota_rank_tier && RANK_TIER_TO_MMR[p.dota_rank_tier]) return RANK_TIER_TO_MMR[p.dota_rank_tier];
          return Number(p.trueskill_mmr || 0) * 100 - 1000;
        };

        const volunteersObj = await db.getCaptainVolunteers(session.id);
        const acceptedSet = new Set(accepted.map(p => String(p.account_id)));
        const volunteerIds = db.listVolunteerAccountIds(volunteersObj, acceptedSet);
        const volunteers = accepted.filter(p => volunteerIds.includes(String(p.account_id)));

        if (volunteers.length >= 2) {
          if (volunteers.length === 2) {
            // Higher-scored volunteer → team 1 to keep team labels
            // deterministic when there are exactly two volunteers.
            const sorted = [...volunteers].sort((a, b) => score(b) - score(a));
            cap1 = sorted[0];
            cap2 = sorted[1];
          } else {
            const shuffled = [...volunteers].sort(() => Math.random() - 0.5);
            cap1 = shuffled[0];
            cap2 = shuffled[1];
          }
        } else {
          // 0 or 1 volunteers — fall back to Highest Rank so the lobby
          // still progresses. Note: we keep `mode === 'volunteer'` on the
          // session so the UI/audit still reflects the lobby's intent.
          const sorted = [...accepted].sort((a, b) => score(b) - score(a));
          cap1 = sorted[0];
          cap2 = sorted[1];
        }
      } else {
        await db.updateInhouseSession(session.id, { status: 'accepting' });
        return res.status(400).json({ error: 'Unknown captain mode' });
      }

      // Task #172 — start the per-pick countdown the moment captains are
      // chosen. Skipped for the auto_balance 10-player path because that
      // mode pre-assigns every team and the draft is already complete; the
      // post-assignment block below clears the deadline for that case.
      const _initialPickDeadline = (typeof _autoBalanceAssignments !== 'undefined' && _autoBalanceAssignments)
        ? null
        : new Date(Date.now() + (Number(session.draft_pick_seconds) || 30) * 1000);
      const updated = await db.updateInhouseSession(session.id, {
        captain1_account_id: cap1.account_id,
        captain2_account_id: cap2.account_id,
        captain_mode: mode,
        // Task #130 — persist the projected balance for auto_balance so the
        // frontend can render the "Projected balance" card. Cleared for any
        // other mode so a re-run doesn't surface stale numbers.
        auto_balance_meta: (typeof _autoBalanceMeta !== 'undefined' ? _autoBalanceMeta : null),
        draft_pick_deadline_at: _initialPickDeadline,
      });
      if (typeof _autoBalanceAssignments !== 'undefined' && _autoBalanceAssignments) {
        // Auto-balance produced a complete 5v5 split — assign every player
        // to their team and mark the 8 non-captains as drafted so the
        // captain-draft UI shows a fully populated, balanced match.
        await db.assignInhouseTeams(session.id, _autoBalanceAssignments);
        const cap1Id = Number(cap1.account_id);
        const cap2Id = Number(cap2.account_id);
        const nonCaptainIds = _autoBalanceAssignments
          .map(a => Number(a.accountId))
          .filter(id => id !== cap1Id && id !== cap2Id);
        if (nonCaptainIds.length) {
          await pool.query(
            `UPDATE inhouse_session_players
                SET status = 'drafted'
              WHERE session_id = $1
                AND account_id = ANY($2::bigint[])
                AND status <> 'declined'`,
            [session.id, nonCaptainIds]
          );
        }
      } else {
        await db.assignInhouseTeams(session.id, [
          { accountId: cap1.account_id, team: 1, pickOrder: 0 },
          { accountId: cap2.account_id, team: 2, pickOrder: 0 },
        ]);
      }
      const playersAfter = await db.getInhouseSessionPlayers(session.id);
      res.json({ session: updated, players: playersAfter });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Snake-draft pick sequence + "whose turn is it?" helpers. Single source
  // of truth lives in src/inhouse/draftSequence.js (Task #192 for the
  // sequence, Task #211 for the picker-team helpers — previously this
  // file had its own _currentPickerTeam clone of the same math the
  // autoStartTicker deadline sweep used).
  const {
    DRAFT_PICK_SEQUENCE,
    countDraftedNonCaptains: _countDraftedNonCaptains,
    currentPickerTeam: _currentPickerTeam,
    teamForPickIndex: _teamForPickIndex,
  } = require('../inhouse/draftSequence');

  router.post('/inhouse/:id/draft-pick', express.json(), async (req, res) => {
    try {
      const { accountId, team, pickOrder, pickSource } = req.body || {};
      if (!accountId || ![1,2].includes(team)) return res.status(400).json({ error: 'accountId and team (1|2) required' });
      // Task #179 — record whether this pick was made by a captain or by the
      // autoStartTicker deadline sweep. Only the deadline sweep is allowed to
      // claim 'auto_deadline'; any other caller silently maps to 'captain'.
      const _isAdminForSource = !!(req.session && req.session.isSuperuser) ||
        !!(process.env.SUPERUSER_PASSWORD && req.headers['x-superuser-key'] === process.env.SUPERUSER_PASSWORD);
      const _pickSource = (_isAdminForSource && pickSource === 'auto_deadline') ? 'auto_deadline' : 'captain';
      const cur = await db.getInhouseSession(req.params.id);
      if (!cur) return res.status(404).json({ error: 'Session not found' });
      if (cur.status !== 'drafting') return res.status(400).json({ error: 'Not in drafting phase' });

      // v5.75: captains can pick directly (no admin required), but only the
      // captain whose turn it is, and only for their own team. Admins can
      // override at any time.
      const adminKey = process.env.SUPERUSER_PASSWORD;
      const isAdmin = !!(req.session && req.session.isSuperuser) ||
        !!(adminKey && req.headers['x-superuser-key'] === adminKey);
      const myAccountId = req.session?.accountId ? Number(req.session.accountId) : null;

      if (!isAdmin) {
        if (!myAccountId) return res.status(401).json({ error: 'Sign in with Steam to pick.' });
        const cap1 = Number(cur.captain1_account_id);
        const cap2 = Number(cur.captain2_account_id);
        const myTeam = myAccountId === cap1 ? 1 : myAccountId === cap2 ? 2 : null;
        if (!myTeam) return res.status(403).json({ error: 'Only the captains can pick.' });
        if (myTeam !== team) return res.status(403).json({ error: 'You can only pick onto your own team.' });
        const allPlayers = await db.getInhouseSessionPlayers(cur.id);
        const turn = _currentPickerTeam(allPlayers, cur);
        if (turn === null) return res.status(400).json({ error: 'Draft is complete.' });
        if (turn !== myTeam) return res.status(409).json({ error: "It's not your turn to pick." });
      }

      // Atomic conditional pick: only succeeds if player is still unpicked AND not declined
      const pool = db.getPool();
      const guard = await pool.query(
        `UPDATE inhouse_session_players
            SET team = $1, pick_order = $2, status = 'drafted', pick_source = $5
          WHERE session_id = $3 AND account_id = $4 AND team = 0 AND status <> 'declined'
       RETURNING *`,
        [team, pickOrder ?? null, req.params.id, accountId, _pickSource]
      );
      if (guard.rowCount === 0) {
        return res.status(409).json({ error: 'Player already picked or no longer eligible' });
      }
      res.json({ player: guard.rows[0] });

      // Task #172 — reset the per-pick countdown. If the draft is now
      // complete clear the deadline; otherwise restart the budget for the
      // next captain on the clock. Best-effort — failures here don't fail
      // the pick (the response has already been sent).
      let _allPlayers = null;
      let _draftComplete = false;
      try {
        _allPlayers = await db.getInhouseSessionPlayers(req.params.id);
        const { isDraftComplete } = require('../inhouse/serverProvisioner');
        _draftComplete = isDraftComplete(cur, _allPlayers);
        const next = _draftComplete
          ? null
          : new Date(Date.now() + (Number(cur.draft_pick_seconds) || 30) * 1000);
        await db.updateInhouseSession(req.params.id, { draft_pick_deadline_at: next });
      } catch (e) {
        console.warn('[Inhouse] draft-pick deadline update failed:', e.message);
      }

      // Task #168 — fire-and-forget auto-provision the dedicated server the
      // moment the 8th non-captain pick lands. No admin click required. The
      // helper has its own per-session single-flight lock, so a concurrent
      // tick from autoStartTicker won't double-provision.
      try {
        const allPlayers = _allPlayers || await db.getInhouseSessionPlayers(req.params.id);
        const { provisionInhouseServer, isDraftComplete } = require('../inhouse/serverProvisioner');
        if (_draftComplete || isDraftComplete(cur, allPlayers)) {
          provisionInhouseServer(req.params.id, { trigger: 'auto_draft_complete' })
            .then(r => {
              if (r && r.ok) console.log(`[Inhouse] Auto-provisioned session #${req.params.id} after draft completion`);
              else if (r && !r.skipped) console.warn(`[Inhouse] Auto-provision after draft failed for session #${req.params.id}:`, r.error);
            })
            .catch(e => console.warn('[Inhouse] Auto-provision threw:', e.message));
        }
      } catch (e) {
        console.warn('[Inhouse] Auto-provision wiring error:', e.message);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Lightweight read endpoint so the frontend can show whose turn it is
  // without having to import the pick-sequence constant.
  router.get('/inhouse/:id/draft-status', async (req, res) => {
    try {
      const cur = await db.getInhouseSession(req.params.id);
      if (!cur) return res.status(404).json({ error: 'Session not found' });
      const players = await db.getInhouseSessionPlayers(cur.id);
      const drafted = _countDraftedNonCaptains(players, cur);
      const seq = DRAFT_PICK_SEQUENCE;
      // Task #211 — go through the shared helper instead of indexing
      // into the sequence directly so /draft-status uses the same
      // team-lookup semantics as /draft-pick and the ticker.
      res.json({
        sequence: seq,
        pickIdx: drafted,
        currentPickerTeam: _teamForPickIndex(drafted),
        complete: drafted >= seq.length,
        // Task #172 — per-pick countdown payload. `pickDeadlineAt` is the
        // ISO timestamp at which the autoStartTicker will auto-pick for the
        // captain on the clock; `pickSeconds` is the configured budget
        // (default 30s) that the frontend uses to render the progress bar.
        pickDeadlineAt: cur.draft_pick_deadline_at || null,
        pickSeconds: Number(cur.draft_pick_seconds) || 30,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Task #168 — captain-callable retry. After a `server_failed` transition,
  // the captains see a Retry button on /inhouse; this is the route it hits.
  // Authorization: either captain of the session, OR a superuser. Same
  // single-flight lock as the manual route — concurrent retries collapse.
  router.post('/inhouse/:id/server/retry', express.json(), async (req, res) => {
    try {
      const actor = _resolveInhouseActor(req, false);
      const session = await db.getInhouseSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const cap1 = Number(session.captain1_account_id);
      const cap2 = Number(session.captain2_account_id);
      const callerId = Number(actor.accountId);
      const isCaptain = callerId && (callerId === cap1 || callerId === cap2);
      if (!actor.isAdmin && !isCaptain) {
        return res.status(403).json({ error: 'Only the captains or an admin can retry server provisioning.' });
      }
      if (session.status !== 'server_failed' && session.status !== 'drafting') {
        return res.status(400).json({ error: `Cannot retry from status ${session.status}` });
      }
      const { provisionInhouseServer } = require('../inhouse/serverProvisioner');
      const result = await provisionInhouseServer(req.params.id, {
        trigger: actor.isAdmin ? 'manual' : 'captain_retry',
      });
      if (!result.ok) {
        if (result.skipped === 'in_flight') return res.status(409).json({ error: 'Provisioning already in progress' });
        if (result.skipped === 'wrong_status') return res.status(400).json({ error: result.error });
        if (result.failed) return res.status(502).json({ error: result.error, session: result.session, rcon: result.rcon });
        return res.status(500).json({ error: result.error || 'Provisioning failed' });
      }
      res.json({ session: result.session, rcon: result.rcon, skipped: result.skipped });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/inhouse/:id/server', requireSuperuser, express.json(), async (req, res) => {
    try {
      // Task #168 — delegated to the shared helper so the manual admin
      // override and the auto-trigger from /draft-pick (and the recovery
      // sweep in autoStartTicker) all run identical code, with the same
      // single-flight lock and Discord announcement.
      const { provisionInhouseServer } = require('../inhouse/serverProvisioner');
      const result = await provisionInhouseServer(req.params.id, {
        password: req.body?.password,
        ip: req.body?.ip,
        port: req.body?.port,
        trigger: 'manual',
      });
      if (!result.ok) {
        if (result.skipped === 'in_flight') return res.status(409).json({ error: 'Provisioning already in progress' });
        if (result.skipped === 'wrong_status') return res.status(400).json({ error: result.error });
        if (result.error === 'Session not found') return res.status(404).json({ error: result.error });
        if (result.error === 'Invalid server IP') return res.status(400).json({ error: result.error });
        return res.status(500).json({ error: result.error || 'Provisioning failed' });
      }
      res.json({ session: result.session, rcon: result.rcon, skipped: result.skipped });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // v5.89 — admin demo lobby helpers
  //
  // Lets a superuser fill an open/accepting session with bot players so
  // they can walk through the full sign-in → accept → captains → draft
  // → ready flow end-to-end without recruiting 9 friends. Bots use a
  // dedicated account_id range (9_000_001..9_000_010) and get a temporary
  // nickname so they render nicely in the roster. Auto-draft fills the
  // remaining 8 non-captain slots following DRAFT_PICK_SEQUENCE — works
  // whether the captains are bots or real players.
  // ──────────────────────────────────────────────────────────────────────
  const BOT_NAMES = ['Bot Lina','Bot Pudge','Bot CM','Bot Sven','Bot Mirana','Bot SK','Bot Lion','Bot Tide','Bot AM','Bot Invoker'];
  const BOT_ID_BASE = 9000001;
  const BOT_ID_MAX  = 9000010;

  router.post('/admin/inhouse/:id/seed-bots', requireSuperuser, express.json(), async (req, res) => {
    try {
      const session = await db.getInhouseSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (!['open','accepting'].includes(session.status)) {
        return res.status(400).json({ error: `Cannot seed bots while status=${session.status}` });
      }
      const minPlayers = session.min_players || 10;
      const existing = await db.getInhouseSessionPlayers(session.id);
      const existingAccts = new Set(existing.map(p => Number(p.account_id)));
      const need = Math.max(0, minPlayers - existing.length);
      const pool = db.getPool();
      let added = 0;
      for (let i = 0; i < BOT_NAMES.length && added < need; i++) {
        const acc = BOT_ID_BASE + i;
        if (acc > BOT_ID_MAX) break;
        if (existingAccts.has(acc)) continue;
        // Ensure a nickname row exists so the bot renders with a friendly name.
        // We only fill an empty nickname so a re-seed doesn't clobber any
        // human-edited nickname row that happens to share the same id.
        await pool.query(
          `INSERT INTO nicknames (account_id, nickname, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (account_id) DO UPDATE
             SET nickname = EXCLUDED.nickname, updated_at = NOW()
             WHERE COALESCE(nicknames.nickname, '') = ''`,
          [acc, BOT_NAMES[i]]
        );
        // Random preferred positions (1-2 picks)
        const positions = Array.from(new Set([
          1 + Math.floor(Math.random() * 5),
          1 + Math.floor(Math.random() * 5),
        ])).sort();
        await db.joinInhouseSession(session.id, acc, positions);
        // Pre-accept so admin can skip directly to captain selection.
        await db.setInhousePlayerAccepted(session.id, acc);
        added++;
      }
      res.json({ added, total: existing.length + added });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/inhouse/:id/clear-bots', requireSuperuser, async (req, res) => {
    try {
      const session = await db.getInhouseSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (!['open','accepting','drafting'].includes(session.status)) {
        return res.status(400).json({ error: 'Cannot clear bots once match is in progress' });
      }
      const pool = db.getPool();
      const r = await pool.query(
        `DELETE FROM inhouse_session_players
           WHERE session_id = $1 AND account_id BETWEEN $2 AND $3`,
        [session.id, BOT_ID_BASE, BOT_ID_MAX]
      );
      res.json({ removed: r.rowCount });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/inhouse/:id/auto-draft', requireSuperuser, async (req, res) => {
    try {
      const session = await db.getInhouseSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.status !== 'drafting') {
        return res.status(400).json({ error: 'Auto-draft only works in drafting phase' });
      }
      const cap1 = Number(session.captain1_account_id);
      const cap2 = Number(session.captain2_account_id);
      const players = await db.getInhouseSessionPlayers(session.id);
      const isCap = (p) => Number(p.account_id) === cap1 || Number(p.account_id) === cap2;
      let pickIdx = players.filter(p => p.team !== 0 && !isCap(p)).length;
      const undrafted = players
        .filter(p => (p.team === 0 || p.team == null) && !isCap(p))
        .sort(() => Math.random() - 0.5);
      let picked = 0;
      for (const p of undrafted) {
        if (pickIdx >= DRAFT_PICK_SEQUENCE.length) break;
        const team = DRAFT_PICK_SEQUENCE[pickIdx];
        await db.assignInhouseTeams(session.id, [{ accountId: p.account_id, team, pickOrder: pickIdx + 1 }]);
        pickIdx++;
        picked++;
      }
      const updated = await db.getInhouseSessionPlayers(session.id);
      res.json({ picked, players: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // v5.89 — community → full nickname/discord/rank sync (admin trigger).
  // Reads COMMUNITY_DATABASE_URL from the server env (must be added as a
  // secret on prod). Conservative: only fills empty target columns unless
  // the admin opts in to overwrite. Returns the per-row log so the admin
  // can review what changed without shelling into the host.
  // ──────────────────────────────────────────────────────────────────────
  router.post('/admin/sync-community-nicknames', requireSuperuser, express.json(), async (req, res) => {
    const sourceUrl = process.env.COMMUNITY_DATABASE_URL;
    if (!sourceUrl) {
      return res.status(400).json({
        error: 'COMMUNITY_DATABASE_URL is not set on the server. Add it as a secret pointing at the community-edition Postgres, then retry.'
      });
    }
    if (sourceUrl === process.env.DATABASE_URL) {
      return res.status(400).json({ error: 'COMMUNITY_DATABASE_URL is identical to DATABASE_URL — refusing to run.' });
    }
    const overwrite = !!req.body?.overwrite;
    const dryRun = !!req.body?.dryRun;
    try {
      const { runSync } = require('../../scripts/sync-community-nicknames');
      const lines = [];
      const result = await runSync({
        sourceUrl,
        destPool: db.getPool(),
        overwrite,
        dryRun,
        log: (m) => lines.push(m),
      });
      res.json({ ...result, log: lines.join('\n') });
    } catch (err) {
      res.status(500).json({ error: err.message, stack: err.stack });
    }
  });

  router.post('/inhouse/:id/cancel', requireSuperuser, async (req, res) => {
    try {
      const session = await db.updateInhouseSession(req.params.id, {
        status: 'cancelled',
        completed_at: new Date(),
      });
      res.json({ session });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/inhouse/:id/complete', requireSuperuser, express.json(), async (req, res) => {
    try {
      const matchId = req.body?.matchId || null;
      const session = await db.updateInhouseSession(req.params.id, {
        status: 'completed',
        match_id: matchId,
        completed_at: new Date(),
      });

      // v5.75: re-queue any players who were in the lobby but not picked /
      // not in the active match (team = 0 OR declined). They get auto-rolled
      // into the next open session so they don't lose their spot when the
      // captains skipped them.
      try {
        const players = await db.getInhouseSessionPlayers(req.params.id);
        const leftovers = players.filter(p =>
          p.team === 0 || p.status === 'declined'
        );
        if (leftovers.length > 0) {
          let next = await db.getActiveInhouseSession();
          if (!next || next.id === Number(req.params.id) || ['drafting','in_progress'].includes(next.status)) {
            next = await db.createInhouseSession({
              captainMode: session.captain_mode || 'highest_rank',
              acceptPhaseSeconds: session.accept_phase_seconds || 60,
              minPlayers: session.min_players || 10,
              lobbyFillSeconds: session.lobby_fill_seconds || 30,
              notes: 'Auto-created from leftover players',
              createdBy: 'system',
            });
          }
          for (const p of leftovers) {
            await db.joinInhouseSession(next.id, p.account_id, p.preferred_positions).catch(() => {});
          }
          console.log(`[Inhouse] Re-queued ${leftovers.length} leftover players into session #${next.id}`);
        }
      } catch (e) {
        console.warn('[Inhouse] Re-queue failed (non-fatal):', e.message);
      }

      // v5.76: move every player from the completed session back into the
      // configured lobby voice channel so the next draft starts in one room.
      try {
        const players = await db.getInhouseSessionPlayers(req.params.id);
        const accountIds = players.map(p => p.account_id).filter(Boolean);
        const { getDiscordBot } = require('../discord/bot');
        const bot = getDiscordBot();
        if (bot && typeof bot._movePlayersToLobbyChannel === 'function' && accountIds.length > 0) {
          bot._movePlayersToLobbyChannel(accountIds).catch(e =>
            console.warn('[Inhouse] Lobby voice move failed:', e.message)
          );
        }
      } catch (e) {
        console.warn('[Inhouse] Lobby voice move setup failed (non-fatal):', e.message);
      }

      res.json({ session });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dedicated server health: RCON + SSH ping (admin only — leaks infra detail otherwise)
  router.get('/dedicated-server/status', requireSuperuser, async (req, res) => {
    try {
      const { pingServer } = require('../services/rconClient');
      const { testConnection } = require('../services/serverReplayFetcher');
      const cfg = require('../config').config;
      const [rcon, ssh] = await Promise.all([
        pingServer().catch(e => ({ ok: false, error: e.message })),
        testConnection().catch(e => ({ ok: false, error: e.message })),
      ]);
      res.json({
        ip: cfg.dota?.dedicatedServer?.ip || null,
        port: cfg.dota?.dedicatedServer?.port || 27015,
        rcon,
        ssh,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pull latest replay from dedicated server, parse, and (optionally) record
  router.post('/dedicated-server/fetch-replay', requireSuperuser, express.json(), async (req, res) => {
    try {
      const { fetchLatestReplay } = require('../services/serverReplayFetcher');
      const result = await fetchLatestReplay();
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // =====================================================================
  // Wave 2 / 3 endpoints — preview-flag-gated. Helpers used by all of these:
  //   _isSu(req)        — superuser key header check (matches existing pattern)
  //   _flagOn(key, req) — flag is 'on', or ('preview' && superuser)
  // =====================================================================
  function _isSu(req) {
    if (req.session && req.session.isSuperuser) return true;
    return Boolean(req.headers['x-superuser-key'] && req.headers['x-superuser-key'] === process.env.SUPERUSER_PASSWORD);
  }
  async function _flagOn(key, req) {
    try {
      const flag = await db.getFeatureFlag(key);
      if (!flag || flag.state === 'off') return false;
      if (flag.state === 'on') return true;
      if (flag.state === 'preview') return _isSu(req);
      return false;
    } catch (err) {
      console.error(`[FeatureFlag] DB read error for key="${key}":`, err.message);
      return false;
    }
  }

  // ---------- Pro Tier gating ----------
  function requirePro(featureKey) {
    return async function _requirePro(req, res, next) {
      try {
        const gateOn = await _flagOn('pro_tier', req);
        if (!gateOn) return next();
        if (_isSu(req)) return next();
        const accountId = req.session?.accountId;
        if (await _isProAccount(accountId)) return next();
        return res.status(402).json({
          error: 'This feature requires Pro membership.',
          paywall: true,
          feature: featureKey,
          signed_in: Boolean(accountId),
        });
      } catch (err) {
        console.error('[requirePro] error:', err.message);
        return res.status(503).json({
          error: 'Entitlement check temporarily unavailable. Please try again in a moment.',
          paywall: true,
          feature: featureKey,
          signed_in: Boolean(req.session?.accountId),
          retryable: true,
        });
      }
    };
  }

  // ---------- F1: Hero Meta V2 ----------
  router.get('/heroes/meta-v2', requirePro('hero_meta_v2'), async (req, res) => {
    try {
      if (!(await _flagOn('hero_meta_v2', req))) return res.status(404).json({ error: 'Not found' });
      const tier = req.query.tier ? parseInt(req.query.tier) : null;
      const season = req.query.season || null;
      const data = await db.getHeroMetaV2({ tier, season });
      res.json({ heroes: data });
    } catch (err) {
      console.error('[API] heroes/meta-v2:', err.message);
      res.status(500).json({ error: 'Failed to fetch hero meta' });
    }
  });

  // ---------- F2: Draft Assistant V2 ----------
  router.post('/draft/suggestions', express.json(), async (req, res) => {
    try {
      if (!(await _flagOn('draft_assistant_v2', req))) return res.status(404).json({ error: 'Not found' });
      const allies = (req.body?.allies || []).map(Number).filter(Boolean);
      const enemies = (req.body?.enemies || []).map(Number).filter(Boolean);
      const banned = (req.body?.banned || []).map(Number).filter(Boolean);
      const side = req.body?.side || null;
      const season = req.body?.season || null;
      const suggestions = await db.getDraftSuggestionsV2({ allies, enemies, banned, side, season });
      res.json({ suggestions });
    } catch (err) {
      console.error('[API] draft/suggestions:', err.message);
      res.status(500).json({ error: 'Failed to fetch draft suggestions' });
    }
  });

  // ---------- F3: Season Pass ----------
  router.get('/player/:id/season-pass', async (req, res) => {
    try {
      const season = req.query.season ? parseInt(req.query.season) : null;
      const progress = await db.getSeasonPassProgress(req.params.id, season);
      if (!progress) return res.status(404).json({ error: 'No active season' });
      const hasActivation = await db.hasSeasonPassActivation(req.params.id, progress.season_number).catch(() => false);
      res.json({ ...progress, has_season_pass: hasActivation });
    } catch (err) {
      console.error('[API] season-pass:', err.message);
      res.status(500).json({ error: 'Failed to fetch season pass progress' });
    }
  });

  router.get('/season-pass/leaderboard', async (req, res) => {
    try {
      const season = req.query.season ? parseInt(req.query.season) : null;
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const rows = await db.getSeasonPassLeaderboard(season, limit);
      res.json({ leaderboard: rows });
    } catch (err) {
      console.error('[API] season-pass/leaderboard:', err.message);
      res.status(500).json({ error: 'Failed to fetch season pass leaderboard' });
    }
  });

  router.post('/admin/season-pass/recompute', requireSuperuser, express.json(), async (req, res) => {
    try {
      const season = req.body?.season ? parseInt(req.body.season) : null;
      const result = await db.recomputeSeasonPassFromHistory(season);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[API] season-pass/recompute:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- F4: Notification preferences ----------
  router.get('/me/notifications', async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const prefs = await db.getNotificationPrefs(accountId);
      res.json({ categories: prefs });
    } catch (err) {
      console.error('[API] me/notifications GET:', err.message);
      res.status(500).json({ error: 'Failed to fetch notification preferences' });
    }
  });

  router.post('/me/notifications', express.json(), async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const updates = req.body?.updates;
      if (!Array.isArray(updates)) return res.status(400).json({ error: 'updates must be an array of {category, enabled, value?}' });
      for (const u of updates) {
        if (!u || typeof u.category !== 'string' || typeof u.enabled !== 'boolean') {
          return res.status(400).json({ error: 'each update must be {category: string, enabled: boolean, value?: number}' });
        }
        // Task #189 — optional `value` for tunable categories (e.g. the
        // inhouse_pick_warning lead-time). Validation happens inside
        // db.setNotificationPref() against the category's value_options.
        try {
          await db.setNotificationPref(accountId, u.category, u.enabled, u.value);
        } catch (e) {
          // Task #189 — only client-input errors come back as 400; let
          // unexpected DB/internal failures bubble to the outer 500.
          if (e instanceof db.NotificationPrefValidationError) {
            return res.status(400).json({ error: e.message });
          }
          throw e;
        }
      }
      const prefs = await db.getNotificationPrefs(accountId);
      res.json({ ok: true, categories: prefs });
    } catch (err) {
      console.error('[API] me/notifications POST:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Task #217 — drain pending voice-pack lifecycle events for the
  // signed-in user. The frontend's useVoicePackEvents hook polls this
  // every few seconds and plays the matching <pack>/<event>.mp3 (with
  // the same 404 → church-bell fallback as useInhouseAlerts).
  router.get('/me/voice-events', async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const events = await voiceEventQueue.drainVoiceEvents(accountId);
      res.json({ events });
    } catch (err) {
      console.error('[API] me/voice-events GET:', err.message);
      res.status(500).json({ error: 'Failed to fetch voice events' });
    }
  });

  // ---------- F5: Tournament live ----------
  router.get('/tournaments/:id/live', async (req, res) => {
    try {
      const data = await db.getTournamentLive(req.params.id);
      if (!data) return res.status(404).json({ error: 'Tournament not found' });
      res.json(data);
    } catch (err) {
      console.error('[API] tournaments/:id/live:', err.message);
      res.status(500).json({ error: 'Failed to fetch tournament live data' });
    }
  });

  router.post('/tournaments/:id/prize-split', requireSuperuser, express.json(), async (req, res) => {
    try {
      const split = req.body?.prize_split;
      const cleaned = await db.setTournamentPrizeSplit(req.params.id, split);
      res.json({ ok: true, prize_split: cleaned });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ---------- F6: MVP / attitude analytics ----------
  router.get('/player/:id/mvp-attitude-trends', async (req, res) => {
    try {
      if (!(await _flagOn('mvp_attitude_analytics', req))) return res.status(404).json({ error: 'Not found' });
      const win = Math.max(3, Math.min(parseInt(req.query.window) || 10, 50));
      const data = await db.getMvpAttitudeTrends(req.params.id, win);
      res.json(data);
    } catch (err) {
      console.error('[API] mvp-attitude-trends:', err.message);
      res.status(500).json({ error: 'Failed to fetch MVP/attitude trends' });
    }
  });

  // ---------- F7: Web push ----------
  router.get('/web-push/public-key', async (req, res) => {
    if (!(await _flagOn('web_push', req))) return res.status(404).json({ error: 'Not found' });
    if (!process.env.VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Web push not configured' });
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
  });

  router.post('/me/push/subscribe', express.json(), async (req, res) => {
    try {
      if (!(await _flagOn('web_push', req))) return res.status(404).json({ error: 'Not found' });
      if (!_webPushReady()) return res.status(503).json({ error: 'Web push not configured' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const sub = req.body?.subscription;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return res.status(400).json({ error: 'Invalid PushSubscription payload' });
      }
      await db.addPushSubscription({
        accountId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: req.headers['user-agent'] || null,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[API] push/subscribe:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/me/push/test', express.json(), async (req, res) => {
    try {
      if (!(await _flagOn('web_push', req))) return res.status(404).json({ error: 'Not found' });
      if (!_webPushReady()) return res.status(503).json({ error: 'Web push not configured' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const subs = await db.getPushSubscriptionsForAccount(accountId);
      if (!subs.length) return res.status(404).json({ error: 'No push subscriptions for this account' });
      const payload = JSON.stringify({
        title: 'Dota 2 Inhouse — Test push',
        body: 'Push notifications are working. You can manage these in /settings/notifications.',
        url: '/',
      });
      let sent = 0;
      for (const s of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          );
          await db.touchPushSubscription(s.endpoint);
          sent++;
        } catch (err) {
          // 410 / 404 = subscription expired → drop it.
          if (err && (err.statusCode === 404 || err.statusCode === 410)) {
            await db.removePushSubscriptionByEndpoint(s.endpoint).catch(() => {});
          }
        }
      }
      res.json({ ok: true, sent });
    } catch (err) {
      console.error('[API] push/test:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- Vanity slugs + Profile Spotlight (Task #208 / v6.64) ----------
  // Reserved-path deny-list for `/p/<slug>`. Anything that collides with a
  // current top-level route (App.jsx Routes) or a near-miss must NOT be
  // claimable — otherwise `/p/admin` could be confused for `/admin`. Keep
  // this in sync with the App.jsx `<Route path>` list.
  const RESERVED_VANITY_SLUGS = new Set([
    'api', 'admin', 'p', 'player', 'players', 'match', 'matches', 'heroes',
    'leaderboard', 'stats', 'positions', 'synergy', 'upload', 'seasons',
    'predictions', 'patch-notes', 'pickem', 'sponsorships', 'multikills',
    'ward-map', 'records', 'pudge-stats', 'schedule', 'inhouse', 'social',
    'player-network', 'benchmarks', 'insights', 'tournaments',
    'weekend-tournament', 'hall-of-fame', 'join', 'settings', 'pro',
    'coaches', 'shop', 'cosmetics', 'my-bookings', 'buyin-success',
    'player-tools', 'head-to-head', 'compare', 'draft', 'draft-assistant',
    'draft-stats', 'hero-breakdown', 'hero-position-meta',
    'position-player-profiles', 'season-summary', 'embed', 'static',
    'auth', 'login', 'logout', 'signin', 'signout', 'register', 'about',
    'help', 'support', 'terms', 'privacy', 'contact', 'faq', 'news',
    'blog', 'home', 'dashboard', 'search', 'notifications', 'billing',
    'me', 'us', 'spotlight', 'featured', 'undefined', 'null', 'true',
    'false', 'root', 'system',
  ]);

  function _vanitySlugIsReserved(slug) {
    return RESERVED_VANITY_SLUGS.has(String(slug || '').toLowerCase());
  }

  // Public availability probe for the Settings/Cosmetics picker. Always
  // 200; the body says whether the slug is claimable + why not.
  router.get('/vanity-slug/availability', async (req, res) => {
    try {
      const slug = req.query.slug || '';
      if (!db.isWellFormedVanitySlug(slug)) {
        return res.json({
          slug: String(slug || '').toLowerCase(),
          available: false,
          reason: 'invalid',
        });
      }
      if (_vanitySlugIsReserved(slug)) {
        return res.json({
          slug: String(slug).toLowerCase(),
          available: false,
          reason: 'reserved',
        });
      }
      const accountId = req.session?.accountId || null;
      const r = await db.isVanitySlugAvailable(slug, accountId);
      res.json({ slug: String(slug).toLowerCase(), ...r });
    } catch (err) {
      console.error('[API] vanity-slug/availability:', err.message);
      res.status(500).json({ error: 'availability check failed' });
    }
  });

  // Task #221 — Public read of any player's currently-claimed vanity slug,
  // so the profile page's Share button can copy the short `/p/<slug>` URL
  // when one exists. Returns `{ slug: null }` for unclaimed accounts so
  // the client can fall back to the canonical `/player/<id>` URL without
  // a 404. No auth required — slugs are already public via `/p/<slug>`.
  router.get('/player/:id/vanity-slug', async (req, res) => {
    try {
      const cur = await db.getVanitySlugByAccount(req.params.id).catch(() => null);
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ slug: cur?.slug || null });
    } catch (err) {
      console.error('[API] player/:id/vanity-slug:', err.message);
      res.status(500).json({ error: 'Failed to load vanity slug' });
    }
  });

  router.get('/me/vanity-slug', async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const cur = await db.getVanitySlugByAccount(accountId);
      const isPro = await _isProAccount(accountId);
      // Grandfathering: a non-Pro account that *currently* owns a slug keeps
      // it (read-only — they cannot change to a different slug or re-claim
      // after release without Pro). Surface that state to the UI.
      const can_claim = isPro;
      const grandfathered = !!(!isPro && cur && cur.slug);
      res.json({
        slug: cur?.slug || null,
        released_at: cur?.released_at || null,
        is_pro: isPro,
        can_claim,
        grandfathered,
        cooldown_days: 30,
      });
    } catch (err) {
      console.error('[API] me/vanity-slug GET:', err.message);
      res.status(500).json({ error: 'Failed to load vanity slug' });
    }
  });

  router.post('/me/vanity-slug', express.json(), async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const isPro = await _isProAccount(accountId);
      if (!isPro) return res.status(403).json({ error: 'Vanity slugs require Pro' });
      const slug = String(req.body?.slug || '').trim().toLowerCase();
      if (!db.isWellFormedVanitySlug(slug)) {
        return res.status(400).json({ error: 'Invalid slug. 3–24 chars, lowercase a–z, 0–9, hyphen.' });
      }
      if (_vanitySlugIsReserved(slug)) {
        return res.status(409).json({ error: 'That slug is reserved.' });
      }
      try {
        const r = await db.claimVanitySlug(accountId, slug);
        return res.json({ slug: r.slug, ok: true });
      } catch (err) {
        if (err.code === 'SLUG_TAKEN') return res.status(409).json({ error: 'That slug is taken.' });
        if (err.code === 'SLUG_COOLDOWN') return res.status(409).json({ error: 'That slug was recently released. Cooldown is active.' });
        throw err;
      }
    } catch (err) {
      console.error('[API] me/vanity-slug POST:', err.message);
      res.status(500).json({ error: 'Failed to claim slug' });
    }
  });

  router.delete('/me/vanity-slug', async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      // Grandfathered non-Pro accounts are read-only on their slug — they
      // keep what they have but cannot release it (releasing would let
      // them re-claim only after Pro, and an accidental click would lose
      // them the slug forever once a stranger claims it post-cooldown).
      const isPro = await _isProAccount(accountId);
      if (!isPro) return res.status(403).json({ error: 'Releasing a vanity slug requires Pro' });
      const r = await db.releaseVanitySlug(accountId);
      res.json({ ok: true, ...r });
    } catch (err) {
      console.error('[API] me/vanity-slug DELETE:', err.message);
      res.status(500).json({ error: 'Failed to release slug' });
    }
  });

  // ----- Profile Spotlight -----
  // Public read, cached 60s in-memory so a hot home page doesn't hammer PG.
  let _spotlightCache = { value: undefined, expiresAt: 0 };
  function _invalidateSpotlightCache() { _spotlightCache = { value: undefined, expiresAt: 0 }; }

  router.get('/spotlight/current', async (req, res) => {
    try {
      const now = Date.now();
      if (_spotlightCache.value !== undefined && _spotlightCache.expiresAt > now) {
        res.set('Cache-Control', 'public, max-age=60');
        return res.json(_spotlightCache.value);
      }
      const row = await db.getCurrentSpotlight();
      const payload = row ? {
        spotlight: {
          id: row.id,
          account_id: String(row.account_id),
          headline: row.headline,
          blurb: row.blurb,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          display_name: row.display_name || null,
          // v6.76 / Task #222 — surface 'admin' vs 'auto' so the home page
          // card can show an "Auto-selected" pill instead of "spotlight".
          source: row.source || 'admin',
        },
      } : { spotlight: null };
      _spotlightCache = { value: payload, expiresAt: now + 60_000 };
      res.set('Cache-Control', 'public, max-age=60');
      res.json(payload);
    } catch (err) {
      console.error('[API] spotlight/current:', err.message);
      res.status(500).json({ error: 'Failed to load spotlight' });
    }
  });

  router.get('/admin/spotlight', requireSuperuser, async (req, res) => {
    try {
      const rows = await db.listSpotlights(100);
      res.set('Cache-Control', 'no-store');
      res.json({ spotlights: rows });
    } catch (err) {
      console.error('[API] admin/spotlight GET:', err.message);
      res.status(500).json({ error: 'Failed to list spotlights' });
    }
  });

  router.post('/admin/spotlight', requireSuperuser, express.json(), async (req, res) => {
    try {
      const body = req.body || {};
      const accountId = body.account_id;
      const headline = (body.headline || '').toString().trim();
      const blurb = body.blurb ? String(body.blurb).trim() : null;
      const startsAt = body.starts_at || null;
      const endsAt = body.ends_at || null;
      if (!accountId) return res.status(400).json({ error: 'account_id required' });
      if (!headline) return res.status(400).json({ error: 'headline required' });
      const row = await db.createSpotlight({
        accountId,
        headline,
        blurb,
        startsAt,
        endsAt,
        createdBy: req.session?.accountId ? `account:${req.session.accountId}` : 'superuser',
      });
      _invalidateSpotlightCache();
      res.json({ ok: true, spotlight: row });
    } catch (err) {
      // Overlap guard returns 409 so the admin UI can surface the
      // conflicting entry inline instead of a generic 500.
      if (err.code === 'SPOTLIGHT_OVERLAP') {
        return res.status(409).json({ error: err.message });
      }
      console.error('[API] admin/spotlight POST:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create spotlight' });
    }
  });

  // PATCH /admin/spotlight/:id — edit a queued or active (not-yet-ended)
  // spotlight: headline, blurb, starts_at, ends_at. Same overlap guard
  // (excluding the row itself) applies.
  router.patch('/admin/spotlight/:id', requireSuperuser, express.json(), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
      const body = req.body || {};
      const row = await db.updateSpotlight(id, {
        headline: body.headline,
        blurb: body.blurb,
        startsAt: body.starts_at,
        endsAt: body.ends_at,
      });
      _invalidateSpotlightCache();
      res.json({ ok: true, spotlight: row });
    } catch (err) {
      if (err.code === 'SPOTLIGHT_OVERLAP') {
        return res.status(409).json({ error: err.message });
      }
      console.error('[API] admin/spotlight PATCH:', err.message);
      res.status(400).json({ error: err.message || 'Failed to update spotlight' });
    }
  });

  router.delete('/admin/spotlight/:id', requireSuperuser, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
      const ok = await db.deleteSpotlight(id);
      _invalidateSpotlightCache();
      res.json({ ok, deleted: ok });
    } catch (err) {
      console.error('[API] admin/spotlight DELETE:', err.message);
      res.status(500).json({ error: 'Failed to delete spotlight' });
    }
  });

  // ---------- Profile customization ----------
  // Pro-tier check (cached 60s; invalidated on Stripe webhook + checkout).
  async function _isProAccount(accountId) {
    if (!accountId) return false;
    const key = String(accountId);
    const now = Date.now();
    const cached = _proCache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;
    const value = await db.isProMember(accountId).catch(() => false);
    _proCache.set(key, { value, expiresAt: now + 60_000 });
    return value;
  }

  // Task #205 — public live presence chip for /players/:id v3 cover.
  // Always returns 200 with a `{ status, ... }` payload so the cover never
  // breaks. Defaults to `offline` on any error, missing data, or visibility
  // opt-out. Polled client-side every 30s while the tab is visible.
  router.get('/players/:id/presence', async (req, res) => {
    try {
      const { getPlayerPresence } = require('../services/presenceService');
      const data = await getPlayerPresence(req.params.id);
      res.set('Cache-Control', 'no-store');
      res.json(data || { status: 'offline', updated_at: null });
    } catch (err) {
      res.json({ status: 'offline', updated_at: null });
    }
  });

  // Task #213 — bulk live-presence rollup powering the /players "Live now"
  // tab. One call returns every visible account whose presence is in_game,
  // in_lobby, in_queue, or in_voice — so the page renders without fanning
  // out N profile pings. Plain Discord-online is intentionally excluded
  // (the rollup is scoped to actively-doing-something statuses). Same
  // no-store + soft-fail semantics as the per-profile chip endpoint above.
  router.get('/presence/live', async (req, res) => {
    try {
      const { getAllLivePresences } = require('../services/presenceService');
      const rows = await getAllLivePresences();
      res.set('Cache-Control', 'no-store');
      res.json({ players: Array.isArray(rows) ? rows : [] });
    } catch (err) {
      res.json({ players: [] });
    }
  });

  // Task #227 — count-only fast path used by the global nav badge. Same
  // soft-fail semantics as /presence/live; the badge polls this every 30s
  // gated on document.visibilityState, so it must stay cheap and never
  // throw on the public path.
  router.get('/presence/live/count', async (req, res) => {
    try {
      const { getAllLivePresences } = require('../services/presenceService');
      const rows = await getAllLivePresences();
      res.set('Cache-Control', 'no-store');
      res.json({ count: Array.isArray(rows) ? rows.length : 0 });
    } catch (err) {
      res.json({ count: 0 });
    }
  });

  // Task #205 — visibility toggle for the live presence chip. Stored on
  // player_profiles.presence_visible (default TRUE). Same auth shape as
  // the other /me/* notification endpoints.
  router.get('/me/presence-visibility', async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const pool = db.getPool();
      const r = await pool.query(
        `SELECT presence_visible FROM player_profiles WHERE account_id = $1`,
        [String(accountId)]
      );
      const visible = r.rows.length === 0 ? true : r.rows[0].presence_visible !== false;
      res.json({ presence_visible: visible });
    } catch (err) {
      console.error('[API] presence-visibility GET:', err.message);
      res.status(500).json({ error: 'Failed to fetch presence visibility' });
    }
  });
  router.post('/me/presence-visibility', express.json(), async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const visible = req.body?.presence_visible !== false;
      const pool = db.getPool();
      await pool.query(
        `INSERT INTO player_profiles (account_id, presence_visible)
           VALUES ($1, $2)
         ON CONFLICT (account_id) DO UPDATE SET presence_visible = EXCLUDED.presence_visible, updated_at = NOW()`,
        [String(accountId), visible]
      );
      res.json({ presence_visible: visible });
    } catch (err) {
      console.error('[API] presence-visibility POST:', err.message);
      res.status(500).json({ error: 'Failed to update presence visibility' });
    }
  });

  router.get('/me/profile', async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const customization = await db.getPlayerProfileCustomization(accountId);
      const isPro = await _isProAccount(accountId);
      // v6.63 / Task #207 — surface owned one-time entitlements (founders ring etc.)
      const owned_entitlements = await db.getOwnedEntitlements(accountId).catch(() => []);
      res.json({ customization: customization || null, is_pro: isPro, owned_entitlements });
    } catch (err) {
      console.error('[API] me/profile GET:', err.message);
      res.status(500).json({ error: 'Failed to fetch profile customization' });
    }
  });

  router.post('/me/profile', express.json(), async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });

      const cosm = require('../profileCosmetics');
      const body = req.body || {};

      // Normalize empty strings to null so they clear the field.
      const norm = (v) => (v == null || v === '') ? null : v;
      const bio = norm(body.bio);
      const customTitle = norm(body.custom_title);
      const themeAccent = norm(body.theme_accent);
      const pinnedHeroIdRaw = body.pinned_hero_id;
      const pinnedHeroCaption = norm(body.pinned_hero_caption);
      const pinnedMatchIdRaw = body.pinned_match_id;

      // Validate bio length.
      if (bio != null && (typeof bio !== 'string' || bio.length > cosm.BIO_MAX)) {
        return res.status(400).json({ error: `Bio must be a string of ≤${cosm.BIO_MAX} chars` });
      }
      if (pinnedHeroCaption != null && (typeof pinnedHeroCaption !== 'string' || pinnedHeroCaption.length > cosm.PINNED_HERO_CAPTION_MAX)) {
        return res.status(400).json({ error: `Pinned hero caption must be ≤${cosm.PINNED_HERO_CAPTION_MAX} chars` });
      }

      // Validate title + theme against the catalogue (free + premium values).
      if (!cosm.isValidTitle(customTitle)) {
        return res.status(400).json({ error: 'Unknown custom title' });
      }
      if (!cosm.isValidTheme(themeAccent)) {
        return res.status(400).json({ error: 'Unknown theme accent' });
      }

      // Premium gating — reject premium values if the player isn't Pro.
      const isPro = await _isProAccount(accountId);
      if (!isPro && cosm.isPremiumTitle(customTitle)) {
        return res.status(403).json({ error: 'That title is reserved for Pro members' });
      }
      if (!isPro && cosm.isPremiumTheme(themeAccent)) {
        return res.status(403).json({ error: 'That theme is reserved for Pro members' });
      }

      // Coerce numeric ids; null when blank/invalid.
      const pinnedHeroId = pinnedHeroIdRaw == null || pinnedHeroIdRaw === ''
        ? null
        : (Number.isFinite(parseInt(pinnedHeroIdRaw, 10)) ? parseInt(pinnedHeroIdRaw, 10) : null);
      const pinnedMatchId = pinnedMatchIdRaw == null || pinnedMatchIdRaw === ''
        ? null
        : (Number.isFinite(parseInt(pinnedMatchIdRaw, 10)) ? parseInt(pinnedMatchIdRaw, 10) : null);

      // If a pinned match was supplied, confirm it belongs to this player.
      if (pinnedMatchId != null) {
        const owned = await db.getPool().query(
          `SELECT 1 FROM player_stats WHERE match_id = $1 AND account_id = $2 LIMIT 1`,
          [pinnedMatchId, accountId]
        );
        if (!owned.rows.length) {
          return res.status(400).json({ error: 'Pinned match must be one you played in' });
        }
      }

      // Profile frame
      const profileFrameRaw = norm(body.profile_frame);
      if (!cosm.isValidFrame(profileFrameRaw)) {
        return res.status(400).json({ error: 'Unknown profile frame' });
      }
      if (cosm.isPremiumFrame(profileFrameRaw)) {
        // Gold frame is Pro-bundled; other premium frames are individually purchasable.
        // All premium frames require either Pro (gold) or a completed frame purchase.
        const frameOwned = await db.hasFrameUnlocked(accountId, profileFrameRaw, isPro);
        if (!frameOwned) {
          return res.status(403).json({ error: 'You have not unlocked this frame. Purchase it or upgrade to Pro.', unpurchased: true });
        }
      }

      // v6.52 / Task #195 — Magazine v3 layout theme. Court & Pitch is free;
      // the other five are Pro-only cosmetics. Empty/null is treated as the
      // default. Validate against the catalogue, then Pro-gate.
      const profileLayoutThemeRaw = norm(body.profile_layout_theme);
      if (!cosm.isValidLayoutTheme(profileLayoutThemeRaw)) {
        return res.status(400).json({ error: 'Unknown profile layout theme' });
      }
      if (!isPro && cosm.isPremiumLayoutTheme(profileLayoutThemeRaw)) {
        return res.status(403).json({ error: 'That profile theme is reserved for Pro members' });
      }

      // v6.62 / Task #206 — Voice Packs Pro SKU. All packs are Pro-only paid
      // cosmetics; null/empty selects the default church-bell chime.
      const selectedVoicePackRaw = norm(body.selected_voice_pack);
      if (!cosm.isValidVoicePack(selectedVoicePackRaw)) {
        return res.status(400).json({ error: 'Unknown voice pack' });
      }
      if (!isPro && cosm.isPremiumVoicePack(selectedVoicePackRaw)) {
        return res.status(403).json({ error: 'Voice packs are reserved for Pro members' });
      }

      // v5.81 — extras (8 mockup-graduated knobs). Validated + Pro-gated.
      const extrasResult = cosm.validateExtras(body.extras);
      if (!extrasResult.ok) return res.status(400).json({ error: extrasResult.error });
      const extras = extrasResult.extras;
      // Pro-gating on the premium extras
      if (!isPro && extras.frame_animated) {
        return res.status(403).json({ error: 'Animated frame is reserved for Pro members' });
      }
      if (!isPro && extras.bg_pattern) {
        return res.status(403).json({ error: 'Heraldic background is reserved for Pro members' });
      }
      // If override is off, drop the override string FIRST so an expired Pro
      // user with a stale premium flair can still save bio/etc edits without
      // hitting the Pro-gate below. Only enforce Pro on values they're
      // actively trying to keep using.
      if (!extras.flair_unlocked) extras.flair_override = null;
      if (!isPro && extras.flair_unlocked) {
        return res.status(403).json({ error: 'Custom flair override is reserved for Pro members' });
      }
      if (!isPro && cosm.isPremiumFlair(extras.flair_override)) {
        return res.status(403).json({ error: 'That flair is reserved for Pro members' });
      }

      // Task #204 / v6.60 — pinned-achievement ribbon. Free tier pins 1,
      // Pro pins up to 3. Each id must match an achievement the player has
      // actually earned (and is not secret), so a malicious client can't
      // ribbon a hidden / unearned badge. Omitting the field leaves the
      // existing array untouched (preserved server-side via fallback).
      let pinnedAchievements = null;
      if (Array.isArray(body.pinned_achievements)) {
        const raw = body.pinned_achievements
          .filter(v => v != null && v !== '')
          .map(v => String(v).slice(0, 64));
        const cap = isPro ? 3 : 1;
        if (raw.length > cap) {
          return res.status(400).json({
            error: isPro
              ? 'You can pin at most 3 achievements'
              : 'Free accounts can pin 1 achievement — upgrade to Pro for 3 slots',
          });
        }
        // De-duplicate while preserving order.
        const seen = new Set();
        const unique = [];
        for (const id of raw) { if (!seen.has(id)) { seen.add(id); unique.push(id); } }
        if (unique.length > 0) {
          const mergedIds = await db.getMergedAccountIds(accountId);
          const earned = await db.getPlayerAchievements(mergedIds);
          const earnedKeys = new Set(
            (earned || [])
              .filter(a => a.earned && !a.secret)
              .map(a => String(a.key || a.id))
          );
          const bad = unique.find(id => !earnedKeys.has(id));
          if (bad) {
            return res.status(400).json({ error: `You haven't earned that achievement: ${bad}` });
          }
        }
        pinnedAchievements = unique;
      } else {
        // No field supplied → preserve whatever is currently stored so a
        // pre-#204 settings save (which doesn't send the field) doesn't
        // silently wipe the ribbon.
        const current = await db.getPlayerProfileCustomization(accountId);
        pinnedAchievements = Array.isArray(current?.pinned_achievements)
          ? current.pinned_achievements
          : [];
      }

      // v6.63 / Task #207 — cover FX (Pro-only). Each effect is opt-in;
      // omitting the field preserves whatever the player previously had so a
      // pre-#207 client save doesn't silently wipe the selection. Empty
      // array clears all effects. Validation allow-lists ids and caps to 6.
      let coverFx = null;
      if (Array.isArray(body.cover_fx)) {
        coverFx = cosm.validateCoverFx(body.cover_fx);
        if (!isPro && coverFx.length > 0) {
          return res.status(403).json({ error: 'Cover effects are reserved for Pro members' });
        }
      } else {
        const current = await db.getPlayerProfileCustomization(accountId);
        coverFx = Array.isArray(current?.cover_fx) ? current.cover_fx : [];
        if (!isPro) coverFx = [];
      }

      const saved = await db.setPlayerProfileCustomization(accountId, {
        bio,
        custom_title: customTitle,
        theme_accent: themeAccent,
        pinned_hero_id: pinnedHeroId,
        pinned_hero_caption: pinnedHeroCaption,
        pinned_match_id: pinnedMatchId,
        profile_frame: profileFrameRaw,
        profile_layout_theme: profileLayoutThemeRaw,
        selected_voice_pack: selectedVoicePackRaw,
        extras,
        pinned_achievements: pinnedAchievements,
        cover_fx: coverFx,
      });
      res.json({ ok: true, customization: saved, is_pro: isPro });
    } catch (err) {
      console.error('[API] me/profile POST:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- Personalised home + onboarding ----------
  router.get('/me/home', async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const [homeData, onboardingComplete] = await Promise.all([
        db.getPlayerHomeData(accountId),
        db.getOnboardingStatus(accountId),
      ]);
      res.json({ ...homeData, onboarding_complete: onboardingComplete });
    } catch (err) {
      console.error('[API] me/home GET:', err.message);
      res.status(500).json({ error: 'Failed to fetch home data' });
    }
  });

  router.get('/me/mmr-history', async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const history = await db.getPlayerRecentRatingHistory(accountId, 20);
      res.json({ history });
    } catch (err) {
      console.error('[API] me/mmr-history GET:', err.message);
      res.status(500).json({ error: 'Failed to fetch MMR history' });
    }
  });

  router.post('/me/onboarding/complete', async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      await db.setOnboardingComplete(accountId, true);
      res.json({ ok: true });
    } catch (err) {
      console.error('[API] me/onboarding/complete POST:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/me/onboarding/reset', async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      await db.setOnboardingComplete(accountId, false);
      res.json({ ok: true });
    } catch (err) {
      console.error('[API] me/onboarding/reset POST:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/player/:id/profile-card', async (req, res) => {
    try {
      const card = await db.getPlayerProfileCard(req.params.id);
      res.json({ customization: card });
    } catch (err) {
      console.error('[API] player/:id/profile-card:', err.message);
      res.status(500).json({ error: 'Failed to fetch profile card' });
    }
  });

  // ---------- Pro Tier endpoints ----------
  function _proPriceCents() {
    const n = parseInt(process.env.PRO_LIFETIME_PRICE_CENTS || '2000', 10);
    return Number.isFinite(n) && n > 0 ? n : 2000;
  }

  router.get('/pro/status', async (req, res) => {
    try {
      const accountId = req.session?.accountId || null;
      const isPro = accountId ? await _isProAccount(accountId) : false;
      const sub = (accountId && isPro) ? await db.getProSubscription(accountId).catch(() => null) : null;
      res.json({
        signed_in: Boolean(accountId),
        is_pro: isPro,
        gate_on: true,
        flag_state: 'on',
        subscription: sub
          ? {
              plan_type: sub.plan_type,
              status: sub.status,
              amount_cents: sub.amount_cents,
              currency: sub.currency,
              purchased_at: sub.purchased_at,
            }
          : null,
      });
    } catch (err) {
      console.error('[API] pro/status:', err.message);
      res.status(500).json({ error: 'Failed to fetch Pro status' });
    }
  });

  // Public list of Pro account_ids (no names, no payment data) so the frontend
  // can render the ProBadge next to leaderboard rows + player headers in one
  // round-trip. Returns empty list when the `pro_tier` flag is OFF, so badges
  // simply don't appear pre-launch.
  router.get('/pro/members', async (req, res) => {
    try {
      if (!(await _flagOn('pro_tier', req))) return res.json({ member_ids: [] });
      const rows = await db.listProMembers().catch(() => []);
      res.json({ member_ids: rows.map(r => String(r.account_id)) });
    } catch (err) {
      console.error('[API] pro/members:', err.message);
      res.json({ member_ids: [] });
    }
  });

  router.get('/pro/pricing', async (req, res) => {
    try {
      if (!(await _flagOn('pro_tier', req))) return res.status(404).json({ error: 'Not found' });
      res.json({
        plan_type: 'lifetime',
        price_cents: _proPriceCents(),
        currency: 'aud',
      });
    } catch (err) {
      console.error('[API] pro/pricing:', err.message);
      res.status(500).json({ error: 'Failed to fetch pricing' });
    }
  });

  // ── Profile frame purchases ──────────────────────────────────────────────
  // GET /api/me/frames — list frames the current user has unlocked
  router.get('/me/frames', async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const isPro = await _isProAccount(accountId);
      const owned = await db.getOwnedFrames(accountId, isPro);
      res.json({ owned_frames: owned });
    } catch (err) {
      console.error('[API] me/frames GET:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/me/gifts — sent and received gift history for the current user
  router.get('/me/gifts', async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const history = await db.getGiftHistory(accountId);
      res.json(history);
    } catch (err) {
      console.error('[API] me/gifts GET:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/gifts — audit list of all gift purchases (admin only)
  router.get('/admin/gifts', requireSuperuser, async (req, res) => {
    try {
      const p = db.getPool();
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);
      const r = await p.query(
        `SELECT gp.*, ng.nickname AS gifter_name, nr.nickname AS recipient_name
           FROM gift_purchases gp
           LEFT JOIN nicknames ng ON ng.account_id = gp.gifter_account_id
           LEFT JOIN nicknames nr ON nr.account_id = gp.recipient_account_id
          ORDER BY gp.created_at DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      res.json({ gifts: r.rows, limit, offset });
    } catch (err) {
      console.error('[API] admin/gifts GET:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/frames/:frameId/checkout — create a Stripe checkout for a premium frame
  router.post('/frames/:frameId/checkout', express.json(), async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam to purchase a frame.' });
      const isPro = await _isProAccount(accountId);
      const { frameId } = req.params;
      // 'gold' is bundled with Pro — it cannot be purchased separately.
      // All other premium frames are standalone one-off purchases (no Pro required).
      const purchasablePremiumFrames = ['neon-blue', 'cosmic', 'fire'];
      if (!purchasablePremiumFrames.includes(frameId)) {
        return res.status(400).json({ error: 'Unknown premium frame.' });
      }
      if (await db.hasFrameUnlocked(accountId, frameId, isPro)) {
        return res.status(409).json({ error: 'You already own this frame.', already_owned: true });
      }
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({ error: 'Payments are not configured.' });
      }
      const FRAME_PRICES = { gold: 299, 'neon-blue': 299, cosmic: 399, fire: 399 };
      const priceCents = FRAME_PRICES[frameId] || 299;
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const baseUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 5000}`;
      const frameLabelMap = { gold: 'Gold', 'neon-blue': 'Neon Blue', cosmic: 'Cosmic', fire: 'Fire' };
      const session = await stripe.checkout.sessions.create({
        automatic_payment_methods: { enabled: true },
        line_items: [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: `Inhouse Stats — ${frameLabelMap[frameId] || frameId} Profile Frame`,
              description: `One-off purchase: unlocks the ${frameLabelMap[frameId] || frameId} CSS border frame for your profile.`,
            },
            unit_amount: priceCents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/settings/profile?frame_purchased=${frameId}`,
        cancel_url: `${baseUrl}/settings/profile`,
        metadata: {
          purpose: 'frame_purchase',
          account_id: String(accountId),
          frame_id: frameId,
        },
      });
      await db.createFrameCheckout({
        accountId,
        frameId,
        stripeSessionId: session.id,
        amountCents: priceCents,
        currency: 'aud',
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error('[API] frames/checkout:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create frame checkout' });
    }
  });

  // ── Founders Pass ring (v6.63 / Task #207) ──────────────────────────────
  // Limited-edition one-time entitlement. Cap is configurable via
  // FOUNDERS_RING_CAP env (default 200). The cap is checked here at
  // checkout-init time AND re-checked under a transaction in the webhook
  // (grantEntitlementWithCap), so concurrent buys can't exceed it.
  function _foundersRingCap() {
    const n = parseInt(process.env.FOUNDERS_RING_CAP || '200', 10);
    return Number.isFinite(n) && n > 0 ? n : 200;
  }
  function _foundersRingPriceCents() {
    const n = parseInt(process.env.FOUNDERS_RING_PRICE_CENTS || '999', 10);
    return Number.isFinite(n) && n > 0 ? n : 999;
  }

  // GET /api/shop/founders-ring/status — public read for the shop card.
  router.get('/shop/founders-ring/status', async (req, res) => {
    try {
      const cosm = require('../profileCosmetics');
      const cap = _foundersRingCap();
      const sold = await db.countEntitlementHolders(cosm.FOUNDERS_RING_SKU);
      const remaining = Math.max(cap - sold, 0);
      const accountId = req.session?.accountId || null;
      const owned = accountId ? await db.hasEntitlement(accountId, cosm.FOUNDERS_RING_SKU) : false;
      res.json({
        sku: cosm.FOUNDERS_RING_SKU,
        cap, sold, remaining,
        sold_out: remaining <= 0,
        price_cents: _foundersRingPriceCents(),
        currency: 'aud',
        owned,
        signed_in: Boolean(accountId),
      });
    } catch (err) {
      console.error('[API] shop/founders-ring/status:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/shop/founders-ring/checkout — Stripe checkout init.
  router.post('/shop/founders-ring/checkout', express.json(), async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam to purchase the Founders Pass.' });
      const cosm = require('../profileCosmetics');
      if (await db.hasEntitlement(accountId, cosm.FOUNDERS_RING_SKU)) {
        return res.status(409).json({ error: 'You already own the Founders Pass ring.', already_owned: true });
      }
      const cap = _foundersRingCap();
      const sold = await db.countEntitlementHolders(cosm.FOUNDERS_RING_SKU);
      if (sold >= cap) {
        return res.status(409).json({ error: 'The Founders Pass has sold out.', sold_out: true });
      }
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({ error: 'Payments are not configured.' });
      }
      const priceCents = _foundersRingPriceCents();
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const baseUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 5000}`;
      const session = await stripe.checkout.sessions.create({
        automatic_payment_methods: { enabled: true },
        line_items: [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: 'OCE Inhouse — Founders Pass (Limited)',
              description: `Limited to ${cap} owners — adds a decorative ring around your Magazine v3 cover, in perpetuity.`,
            },
            unit_amount: priceCents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/shop?founders_ring=success`,
        cancel_url: `${baseUrl}/shop?founders_ring=cancelled`,
        metadata: {
          purpose: 'founders_ring',
          account_id: String(accountId),
          sku: cosm.FOUNDERS_RING_SKU,
        },
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error('[API] shop/founders-ring/checkout:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create checkout' });
    }
  });

  // GET /api/admin/founders-ring — list holders + cap status (superuser).
  router.get('/admin/founders-ring', requireSuperuser, async (req, res) => {
    try {
      const cosm = require('../profileCosmetics');
      const cap = _foundersRingCap();
      const holders = await db.listEntitlementHolders(cosm.FOUNDERS_RING_SKU, 1000);
      res.json({ sku: cosm.FOUNDERS_RING_SKU, cap, sold: holders.length, holders });
    } catch (err) {
      console.error('[API] admin/founders-ring GET:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/founders-ring — manually grant (superuser, e.g. comp).
  router.post('/admin/founders-ring', express.json(), requireSuperuser, async (req, res) => {
    try {
      const cosm = require('../profileCosmetics');
      const accountId = req.body?.account_id;
      if (!accountId) return res.status(400).json({ error: 'account_id required' });
      const result = await db.grantEntitlementWithCap({
        accountId,
        sku: cosm.FOUNDERS_RING_SKU,
        cap: _foundersRingCap(),
        grantedBy: 'superuser',
        metadata: { reason: req.body?.reason || 'admin_grant' },
      });
      if (!result.ok) return res.status(409).json(result);
      res.json(result);
    } catch (err) {
      console.error('[API] admin/founders-ring POST:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/admin/founders-ring/:accountId — revoke (superuser).
  router.delete('/admin/founders-ring/:accountId', requireSuperuser, async (req, res) => {
    try {
      const cosm = require('../profileCosmetics');
      const removed = await db.revokeEntitlement(req.params.accountId, cosm.FOUNDERS_RING_SKU);
      res.json({ ok: true, removed });
    } catch (err) {
      console.error('[API] admin/founders-ring DELETE:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Gift purchasing ──────────────────────────────────────────────────────
  // POST /api/gift/pro — create a Stripe checkout to gift Pro to another player
  router.post('/gift/pro', express.json(), async (req, res) => {
    try {
      if (!(await _flagOn('pro_tier', req))) return res.status(404).json({ error: 'Not found' });
      const gifterAccountId = req.session?.accountId;
      if (!gifterAccountId) return res.status(401).json({ error: 'Sign in with Steam to send a gift.' });
      const { recipientAccountId } = req.body || {};
      if (!recipientAccountId) return res.status(400).json({ error: 'recipientAccountId is required' });
      if (String(recipientAccountId) === String(gifterAccountId)) {
        return res.status(400).json({ error: 'You cannot gift yourself.' });
      }
      if (await _isProAccount(recipientAccountId)) {
        return res.status(409).json({ error: 'That player already has Pro.', already_pro: true });
      }
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({ error: 'Payments are not configured.' });
      }
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const baseUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 5000}`;
      const priceCents = _proPriceCents();
      const session = await stripe.checkout.sessions.create({
        automatic_payment_methods: { enabled: true },
        line_items: [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: 'Inhouse Stats — Gift: Pro Tier (Lifetime)',
              description: `Gift a lifetime Pro membership to another player.`,
            },
            unit_amount: priceCents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pro?checkout=cancelled`,
        metadata: {
          purpose: 'gift_pro',
          account_id: String(gifterAccountId),
          recipient_account_id: String(recipientAccountId),
        },
      });
      await db.createGiftCheckout({
        gifterAccountId,
        recipientAccountId,
        giftType: 'pro',
        stripeSessionId: session.id,
        amountCents: priceCents,
        currency: 'aud',
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error('[API] gift/pro:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create gift checkout' });
    }
  });

  // POST /api/gift/season-pass — create a Stripe checkout to gift a Season Pass activation
  router.post('/gift/season-pass', express.json(), async (req, res) => {
    try {
      const gifterAccountId = req.session?.accountId;
      if (!gifterAccountId) return res.status(401).json({ error: 'Sign in with Steam to send a gift.' });
      const { recipientAccountId } = req.body || {};
      if (!recipientAccountId) return res.status(400).json({ error: 'recipientAccountId is required' });
      if (String(recipientAccountId) === String(gifterAccountId)) {
        return res.status(400).json({ error: 'You cannot gift yourself.' });
      }
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({ error: 'Payments are not configured.' });
      }
      const p = db.getPool();
      const seasonRes = await p.query(`SELECT id FROM seasons WHERE active = true ORDER BY id DESC LIMIT 1`);
      const activeSeason = seasonRes.rows[0];
      if (!activeSeason) {
        return res.status(409).json({ error: 'There is no active season to gift a Season Pass for. Try again when a season is running.' });
      }
      // Check recipient has not already received this season's pass.
      const alreadyHas = await db.hasSeasonPassActivation(recipientAccountId, activeSeason.id).catch(() => false);
      if (alreadyHas) {
        return res.status(409).json({ error: 'This player already has the Season Pass for the current season.', already_active: true });
      }
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const baseUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 5000}`;
      const SEASON_PASS_GIFT_CENTS = 799;
      const session = await stripe.checkout.sessions.create({
        automatic_payment_methods: { enabled: true },
        line_items: [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: 'Inhouse Stats — Gift: Season Pass',
              description: `Gift a Season Pass to another player — activates premium progression for the current season plus a 500 XP welcome bonus.`,
            },
            unit_amount: SEASON_PASS_GIFT_CENTS,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pro?checkout=cancelled`,
        metadata: {
          purpose: 'gift_season_pass',
          account_id: String(gifterAccountId),
          recipient_account_id: String(recipientAccountId),
          season_id: activeSeason ? String(activeSeason.id) : '',
        },
      });
      await db.createGiftCheckout({
        gifterAccountId,
        recipientAccountId,
        giftType: 'season_pass',
        stripeSessionId: session.id,
        amountCents: SEASON_PASS_GIFT_CENTS,
        currency: 'aud',
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error('[API] gift/season-pass:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create gift checkout' });
    }
  });

  // ── AI Scouting Report (Pro-gated, Grok-powered) ─────────────────────────
  router.get('/player/:id/scouting-report', async (req, res) => {
    try {
      const viewerAccountId = req.session?.accountId;
      // v5.86 — superusers bypass the Pro paywall so the owner can preview/QA
      // the AI Scouting Report without holding a Pro subscription.
      const isSuperuser = (req.session && req.session.isSuperuser) || Boolean(
        process.env.SUPERUSER_PASSWORD
        && req.headers['x-superuser-key']
        && req.headers['x-superuser-key'] === process.env.SUPERUSER_PASSWORD
      );
      if (!viewerAccountId && !isSuperuser) return res.status(401).json({ error: 'Sign in with Steam.' });
      if (!isSuperuser && !(await _isProAccount(viewerAccountId))) {
        return res.status(402).json({ error: 'AI Scouting Reports are a Pro feature.', paywall: true });
      }
      const subjectAccountId = req.params.id;

      // Serve cached report if < 24h old
      const cached = await db.getCachedScoutingReport(subjectAccountId).catch((err) => {
        console.warn('[API] scouting-report cache read failed:', err.message);
        return null;
      });
      if (cached) return res.json(cached);
      const p = db.getPool();
      const [statsRes, posRes, heroRes, streakRes] = await Promise.all([
        p.query(
          `SELECT ps.kills, ps.deaths, ps.assists, ps.hero_id,
                  m.radiant_win, ps.team,
                  COALESCE(n.nickname, ps.persona_name) AS name
             FROM player_stats ps
             JOIN matches m ON m.match_id = ps.match_id
             LEFT JOIN nicknames n ON n.account_id = ps.account_id
            WHERE ps.account_id = $1
            ORDER BY m.date DESC LIMIT 30`,
          [subjectAccountId]
        ),
        p.query(
          `SELECT ps2.position, COUNT(*) AS games,
                  ROUND(AVG(ps2.kills)::numeric, 1) AS avg_kills,
                  ROUND(AVG(ps2.deaths)::numeric, 1) AS avg_deaths,
                  ROUND(AVG(ps2.assists)::numeric, 1) AS avg_assists,
                  SUM(CASE WHEN (ps2.team = 'radiant') = m2.radiant_win THEN 1 ELSE 0 END) AS wins
             FROM player_stats ps2
             JOIN matches m2 ON m2.match_id = ps2.match_id
            WHERE ps2.account_id = $1 AND ps2.position IS NOT NULL
            GROUP BY ps2.position
            ORDER BY games DESC`,
          [subjectAccountId]
        ),
        p.query(
          `SELECT ps3.hero_id, COUNT(*) AS games,
                  SUM(CASE WHEN (ps3.team = 'radiant') = m3.radiant_win THEN 1 ELSE 0 END) AS wins
             FROM player_stats ps3
             JOIN matches m3 ON m3.match_id = ps3.match_id
            WHERE ps3.account_id = $1
            GROUP BY ps3.hero_id
            ORDER BY games DESC LIMIT 5`,
          [subjectAccountId]
        ),
        db.getPlayerCurrentStreak([subjectAccountId]).catch(() => 0),
      ]);
      if (!statsRes.rows.length) {
        return res.status(404).json({ error: 'No match data found for this player.' });
      }
      const playerName = statsRes.rows[0]?.name || `Player ${subjectAccountId}`;
      const recentGames = statsRes.rows.length;
      const wins = statsRes.rows.filter(r => (r.team === 'radiant') === r.radiant_win).length;
      const avgKills   = (statsRes.rows.reduce((s, r) => s + (r.kills || 0), 0) / recentGames).toFixed(1);
      const avgDeaths  = (statsRes.rows.reduce((s, r) => s + (r.deaths || 0), 0) / recentGames).toFixed(1);
      const avgAssists = (statsRes.rows.reduce((s, r) => s + (r.assists || 0), 0) / recentGames).toFixed(1);
      const positionSummary = posRes.rows.map(r =>
        `Pos ${r.position}: ${r.games} games, ${r.avg_kills}/${r.avg_deaths}/${r.avg_assists} KDA, ${r.wins}W`
      ).join('; ');
      const topHeroes = heroRes.rows.map(r =>
        `hero_id ${r.hero_id} (${r.games} games, ${r.wins}W)`
      ).join(', ');
      const topHeroNames = heroRes.rows.map(r => `hero_id ${r.hero_id} (${r.games}g ${r.wins}W)`);
      const strongestPos = posRes.rows[0];
      const prompt = `You are a professional Dota 2 scout. Respond ONLY with a valid JSON object — no markdown, no prose, no code fences.

Player stats:
- Name: ${playerName}
- Recent form: ${wins}W ${recentGames - wins}L (${Math.round(wins / recentGames * 100)}% WR, last ${recentGames} games)
- Average KDA: ${avgKills}/${avgDeaths}/${avgAssists}
- Streak: ${streakRes > 0 ? `+${streakRes} win streak` : streakRes < 0 ? `${streakRes} loss streak` : 'no streak'}
- Positions: ${positionSummary || 'no data'}
- Top heroes: ${topHeroes || 'no data'}

Return exactly this JSON shape (all fields required, arrays of strings):
{
  "summary": "One sentence that captures this player in a nutshell",
  "overview": "2-3 sentence summary of this player's playstyle and recent form",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvements": ["improvement 1", "improvement 2"],
  "draft_recommendation": "1-2 sentences on how to pick around or against this player",
  "hero_pool": ["hero_id X (Ng NW)", "..."],
  "strongest_position": "Pos N — description",
  "counters": ["counter suggestion 1", "counter suggestion 2", "counter suggestion 3"]
}`;

      const raw = await generateChatResponse({ message: prompt });
      if (!raw || raw.startsWith('AI chat is not configured')) {
        return res.status(503).json({ error: 'AI scouting is not available (API key not configured).' });
      }
      // v5.90 — Grok occasionally wraps the JSON in ```json fences, returns
      // a leading "Here's the report:" preamble, or trails extra prose. Strip
      // fences first, then extract the first {...} block as a fallback before
      // declaring the response unparseable. Log the raw payload server-side so
      // the owner can diagnose recurring failures from the error log.
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      let structured;
      try {
        structured = JSON.parse(cleaned);
      } catch (_) {
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (m) {
          try { structured = JSON.parse(m[0]); } catch (_2) { /* fall through */ }
        }
        if (!structured) {
          console.warn('[API] scouting-report unparseable response:', raw.slice(0, 500));
          return res.status(503).json({ error: 'Scout temporarily unavailable, try again in a minute.' });
        }
      }
      const report = {
        player_name: playerName,
        account_id: subjectAccountId,
        stats: { wins, losses: recentGames - wins, avg_kills: avgKills, avg_deaths: avgDeaths, avg_assists: avgAssists },
        summary: structured.summary || '',
        overview: structured.overview || '',
        strengths: Array.isArray(structured.strengths) ? structured.strengths : [],
        improvements: Array.isArray(structured.improvements) ? structured.improvements : [],
        draft_recommendation: structured.draft_recommendation || '',
        hero_pool: Array.isArray(structured.hero_pool) ? structured.hero_pool : topHeroNames,
        strongest_position: structured.strongest_position || (strongestPos ? `Pos ${strongestPos.position}` : ''),
        counters: Array.isArray(structured.counters) ? structured.counters : [],
        generated_at: new Date().toISOString(),
      };
      const upsertErr = await db.upsertScoutingReport(subjectAccountId, report).then(() => null).catch(e => e);
      if (upsertErr) console.warn('[API] scouting-report cache write failed (share link may 404):', upsertErr.message);
      res.json({ ...report, share_link_ready: !upsertErr });
    } catch (err) {
      console.error('[API] scouting-report:', err.message);
      res.status(500).json({ error: err.message || 'Failed to generate scouting report' });
    }
  });

  router.post('/pro/checkout', express.json(), async (req, res) => {
    try {
      if (!(await _flagOn('pro_tier', req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam to upgrade.' });
      if (await _isProAccount(accountId)) {
        return res.status(409).json({ error: 'You are already a Pro member.', is_pro: true });
      }
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({ error: 'Payments are not configured. Please try again later.' });
      }
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const baseUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 5000}`;
      const priceCents = _proPriceCents();
      const session = await stripe.checkout.sessions.create({
        automatic_payment_methods: { enabled: true },
        line_items: [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: 'Inhouse Stats — Pro Tier (Lifetime)',
              description: 'One-time purchase. Unlocks all Pro analytics + premium profile cosmetics.',
            },
            unit_amount: priceCents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pro?checkout=cancelled`,
        metadata: {
          purpose: 'pro_lifetime',
          account_id: String(accountId),
        },
      });
      await db.createProCheckout({
        accountId,
        stripeSessionId: session.id,
        planType: 'lifetime',
        amountCents: priceCents,
        currency: 'aud',
      });
      try { _proCache.delete(String(accountId)); } catch (_) {}
      res.json({ url: session.url });
    } catch (err) {
      console.error('[API] pro/checkout:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create checkout' });
    }
  });

  router.get('/players/:id/matches/export.csv', requirePro('csv_export'), async (req, res) => {
    try {
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const requestedId = req.params.id;
      if (String(requestedId) !== String(accountId) && !_isSu(req)) {
        return res.status(403).json({ error: 'You can only export your own match history.' });
      }
      const seasonId = req.query.season_id || null;
      const matches = await db.getMatchHistory(requestedId, seasonId).catch(() => []);
      const cols = [
        'match_id', 'date', 'duration_seconds', 'won', 'hero', 'kills', 'deaths', 'assists',
        'gpm', 'xpm', 'last_hits', 'denies', 'hero_damage', 'tower_damage', 'hero_healing',
        'net_worth', 'level',
      ];
      const escape = (v) => {
        if (v == null) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [cols.join(',')];
      for (const m of (matches || [])) {
        // getMatchHistory rows: match_id, date, duration, radiant_win, player_slot,
        // hero, kills, deaths, assists, gpm, xpm, last_hits, denies, hero_damage,
        // tower_damage, hero_healing, net_worth, level — defensive on shape.
        const isRadiant = m.player_slot != null ? m.player_slot < 128 : null;
        const won = (isRadiant != null && m.radiant_win != null) ? (isRadiant === m.radiant_win) : '';
        lines.push([
          m.match_id, m.date, m.duration, won, m.hero,
          m.kills, m.deaths, m.assists, m.gpm, m.xpm,
          m.last_hits, m.denies, m.hero_damage, m.tower_damage,
          m.hero_healing, m.net_worth, m.level,
        ].map(escape).join(','));
      }
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="matches_${requestedId}.csv"`);
      res.send(lines.join('\n'));
    } catch (err) {
      console.error('[API] matches/export.csv:', err.message);
      res.status(500).json({ error: 'Failed to export matches' });
    }
  });

  router.delete('/me/push/subscriptions', express.json(), async (req, res) => {
    try {
      if (!(await _flagOn('web_push', req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const endpoint = req.body?.endpoint || req.query?.endpoint;
      if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
      const subs = await db.getPushSubscriptionsForAccount(accountId);
      if (!subs.find(s => s.endpoint === endpoint)) {
        return res.status(403).json({ error: 'You can only unsubscribe your own endpoints' });
      }
      await db.removePushSubscriptionByEndpoint(endpoint);
      res.json({ ok: true });
    } catch (err) {
      console.error('[API] push/unsubscribe:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // =====================================================================
  // Coaching Marketplace (`coaching_marketplace`)
  // 10% platform fee, Stripe Connect Express. Eligibility = top-5
  // leaderboard OR Immortal+ (rank tier 80+). Whole feature gated behind
  // the flag — every endpoint 404s when off (preview lets superusers in).
  // =====================================================================
  const COACHING_TAKE_RATE = 0.10;

  async function _coachingOn(req) { return _flagOn('coaching_marketplace', req); }

  function _stripe() {
    if (!process.env.STRIPE_SECRET_KEY) return null;
    return require('stripe')(process.env.STRIPE_SECRET_KEY);
  }

  // Eligibility for the viewer's own account. Superusers always pass so we
  // can manually onboard test coaches. Used by the "Apply to coach" CTA on
  // the player's own profile.
  router.get('/coaching/eligibility/me', async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.json({ signed_in: false, eligible: false });
      if (_isSu(req)) return res.json({ signed_in: true, eligible: true, reason: 'superuser' });
      const eligible = await db.isCoachEligible(accountId);
      const existing = await db.getCoach(accountId);
      res.json({ signed_in: true, eligible, has_coach_row: Boolean(existing), coach_status: existing?.status || null });
    } catch (err) {
      console.error('[API] coaching/eligibility/me:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Begin (or resume) Stripe Connect Express onboarding. Idempotent: if a
  // Stripe account already exists for this coach, we reuse it and just
  // generate a fresh AccountLink.
  router.post('/coach/onboard', express.json(), async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const eligible = _isSu(req) || await db.isCoachEligible(accountId);
      if (!eligible) {
        return res.status(403).json({
          error: 'Coaching is invite-only — you must be top-5 on the leaderboard or Immortal+ rank.',
        });
      }
      const stripe = _stripe();
      if (!stripe) return res.status(503).json({ error: 'Payments are not configured. Please try again later.' });

      const country = ['AU', 'NZ'].includes(String(req.body?.country || '').toUpperCase())
        ? String(req.body.country).toUpperCase() : 'AU';

      let coach = await db.getCoach(accountId);
      let stripeAccountId = coach?.stripe_account_id || null;
      if (!stripeAccountId) {
        const acct = await stripe.accounts.create({
          type: 'express',
          country,
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true },
          },
          business_type: 'individual',
          metadata: { purpose: 'coaching', account_id: String(accountId) },
        });
        stripeAccountId = acct.id;
      }
      coach = await db.createCoachRow({ accountId, stripeAccountId, country });

      const baseUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 5000}`;
      const link = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${baseUrl}/coach/onboarding?refresh=1`,
        return_url: `${baseUrl}/coach/edit?onboarded=1`,
        type: 'account_onboarding',
      });
      res.json({ url: link.url, status: coach.status });
    } catch (err) {
      console.error('[API] coach/onboard:', err.message);
      res.status(500).json({ error: err.message || 'Failed to start onboarding' });
    }
  });

  // Polls Stripe for the live KYC state — useful for the editor page so we
  // can show "Stripe still needs more info" without waiting for the webhook.
  router.get('/coach/onboarding-status', async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const coach = await db.getCoach(accountId);
      if (!coach) return res.json({ has_coach_row: false });
      const out = {
        has_coach_row: true,
        status: coach.status,
        stripe_account_id: coach.stripe_account_id,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        requirements_due: [],
      };
      const stripe = _stripe();
      if (stripe && coach.stripe_account_id) {
        try {
          const acct = await stripe.accounts.retrieve(coach.stripe_account_id);
          out.charges_enabled = Boolean(acct.charges_enabled);
          out.payouts_enabled = Boolean(acct.payouts_enabled);
          out.details_submitted = Boolean(acct.details_submitted);
          out.requirements_due = acct.requirements?.currently_due || [];
          // Self-heal: same dual-condition check as the webhook so a coach
          // who has charges_enabled but no payouts_enabled (bank not yet
          // verified) doesn't get prematurely promoted. We hold back until
          // Stripe can actually pay them out.
          if (acct.charges_enabled && acct.payouts_enabled && coach.status === 'kyc_pending') {
            await db.setCoachKycActive(coach.stripe_account_id);
            out.status = 'active';
          }
        } catch (e) {
          console.warn('[coach/onboarding-status] stripe lookup failed:', e.message);
        }
      }
      res.json(out);
    } catch (err) {
      console.error('[API] coach/onboarding-status:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Own-coach profile (editor data + bookings + earnings).
  router.get('/coach/me', async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const coach = await db.getCoach(accountId);
      if (!coach) return res.status(404).json({ error: 'No coach profile yet' });
      const [availability, bookings, agg] = await Promise.all([
        db.getCoachAvailability(accountId),
        db.listCoachBookings(accountId),
        db.getCoachAggregateRating(accountId),
      ]);
      res.json({ coach, availability, bookings, rating: agg });
    } catch (err) {
      console.error('[API] coach/me GET:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/coach/me', express.json(), async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const existing = await db.getCoach(accountId);
      if (!existing) return res.status(404).json({ error: 'Onboard first' });
      // Note on access: we deliberately allow `kyc_pending` coaches to edit
      // their profile/availability — the public listing
      // (`listActiveCoaches` / `GET /api/coaches`) and the booking route
      // (`POST /api/coaches/:id/book`) both gate strictly on
      // `status='active'`, so a kyc_pending coach can prepare their bio,
      // rate, languages, taught roles/heroes and weekly availability while
      // Stripe finishes verifying their bank details — the moment Stripe
      // fires `account.updated` with charges_enabled + payouts_enabled,
      // `setCoachKycActive` flips status to active and the coach goes
      // live with a fully-populated profile. Gating edit to `active`
      // would create a chicken-and-egg problem (no published profile
      // until Stripe verifies, no incentive to verify until you can
      // publish).
      // Suspended/delisted statuses are still rejected here:
      if (existing.status === 'suspended' || existing.status === 'delisted') {
        return res.status(403).json({ error: `Editing disabled for ${existing.status} coaches. Contact admin.` });
      }
      const body = req.body || {};
      // Coerce + clamp the rate; everything else passes through the whitelist.
      let patch = { ...body };
      if (patch.hourly_rate_cents != null) {
        const n = parseInt(patch.hourly_rate_cents, 10);
        if (!Number.isFinite(n) || n < 1000 || n > 50_000) {
          return res.status(400).json({ error: 'Hourly rate must be $10–$500 AUD (in cents).' });
        }
        patch.hourly_rate_cents = n;
      }
      // Truncate string fields defensively.
      for (const f of ['bio', 'languages', 'taught_roles', 'taught_heroes', 'intro_video_url', 'sample_replays']) {
        if (typeof patch[f] === 'string') patch[f] = patch[f].slice(0, 2000);
      }
      const updated = await db.updateCoach(accountId, patch);
      res.json({ ok: true, coach: updated });
    } catch (err) {
      console.error('[API] coach/me POST:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/coach/me/availability', express.json(), async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const existing = await db.getCoach(accountId);
      if (!existing) return res.status(404).json({ error: 'Onboard first' });
      const slots = Array.isArray(req.body?.slots) ? req.body.slots : [];
      if (slots.length > 50) return res.status(400).json({ error: 'Too many slots (max 50).' });
      const out = await db.setCoachAvailability(accountId, slots);
      res.json({ ok: true, availability: out });
    } catch (err) {
      console.error('[API] coach/me/availability:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Public browse — only active coaches; payouts may still be pending but
  // they can already accept bookings (funds sit in escrow until completion).
  router.get('/coaches', async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const language = req.query.language || null;
      const role = req.query.role || null;
      const hero = req.query.hero || null;
      const maxPriceCents = req.query.max_price_cents ? parseInt(req.query.max_price_cents) : null;
      const coaches = await db.listActiveCoaches({ language, role, hero, maxPriceCents });
      res.json({ coaches });
    } catch (err) {
      console.error('[API] coaches:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Alias for the singular `/coach/:id` form — the original session plan
  // referenced this path, and shared links from older builds may also
  // hit it. Both routes resolve to the same handler so we don't 404
  // links that have already been shared in Discord etc.
  router.get(['/coaches/:id', '/coach/:id'], async (req, res) => {
    return _coachDetail(req, res);
  });

  async function _coachDetail(req, res) {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const coach = await db.getCoachById(parseInt(req.params.id));
      if (!coach) return res.status(404).json({ error: 'Coach not found' });
      // Hide non-active coaches from public detail (admins still get them via admin panel).
      if (coach.status !== 'active' && !_isSu(req)) {
        return res.status(404).json({ error: 'Coach not found' });
      }
      const [availability, reviews, agg, credibility, nick] = await Promise.all([
        db.getCoachAvailability(coach.account_id),
        db.getCoachReviews(coach.account_id, 25),
        db.getCoachAggregateRating(coach.account_id),
        db.getCoachCredibilityStats(coach.account_id).catch(() => null),
        db.getNickname?.(coach.account_id).catch(() => null),
      ]);
      const display_name = (typeof nick === 'string' ? nick : nick?.nickname) || String(coach.account_id);
      res.json({ coach: { ...coach, display_name }, availability, reviews, rating: agg, credibility });
    } catch (err) {
      console.error('[API] coaches/:id:', err.message);
      res.status(500).json({ error: err.message });
    }
  }

  // Book a session. Creates Stripe Checkout Session in 'payment' mode with
  // application_fee_amount + transfer_data.destination (Connect direct
  // charge via destination charges pattern). Booking row sits in 'pending'
  // until the webhook confirms.
  router.post('/coaches/:id/book', express.json(), async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const studentAccountId = req.session?.accountId;
      if (!studentAccountId) return res.status(401).json({ error: 'Sign in with Steam to book' });

      const coach = await db.getCoachById(parseInt(req.params.id));
      if (!coach) return res.status(404).json({ error: 'Coach not found' });
      if (coach.status !== 'active') return res.status(400).json({ error: 'Coach not currently accepting bookings' });
      if (!coach.stripe_account_id) return res.status(400).json({ error: 'Coach has no payout account' });
      if (String(coach.account_id) === String(studentAccountId)) {
        return res.status(400).json({ error: "You can't book yourself." });
      }

      const slotStartIso = req.body?.slot_start_at;
      const duration = Math.min(Math.max(parseInt(req.body?.duration_minutes) || 60, 30), 180);
      if (!slotStartIso) return res.status(400).json({ error: 'slot_start_at required (ISO 8601)' });
      const slotStart = new Date(slotStartIso);
      if (isNaN(slotStart.getTime())) return res.status(400).json({ error: 'invalid slot_start_at' });
      if (slotStart.getTime() < Date.now() + 30 * 60_000) {
        return res.status(400).json({ error: 'Slot must start at least 30 minutes from now.' });
      }

      // Slot validation — must fall inside one of the coach's published
      // weekly availability windows AND must not overlap any existing live
      // booking. Without this, the API would happily accept arbitrary
      // timestamps and let students double-book a coach.
      const slotCheck = await db.validateBookingSlot(coach.account_id, slotStart.toISOString(), duration);
      if (!slotCheck.ok) return res.status(400).json({ error: slotCheck.reason });

      const stripe = _stripe();
      if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });

      const amountCents = Math.round((coach.hourly_rate_cents * duration) / 60);
      const platformFeeCents = Math.round(amountCents * COACHING_TAKE_RATE);
      const currency = (coach.currency || 'aud').toLowerCase();
      const baseUrl = process.env.SITE_URL || `http://localhost:${process.env.PORT || 5000}`;

      const checkout = await stripe.checkout.sessions.create({
        // Card-only here (NOT automatic_payment_methods) because the
        // payment_intent_data.capture_method below is 'manual' (escrow).
        // BECS Direct Debit and most wallet methods don't support manual
        // capture, so Stripe would reject the session if we let them
        // through. Every other checkout site uses automatic_payment_methods.
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{
          price_data: {
            currency,
            product_data: {
              name: `Coaching session — ${coach.account_id}`,
              description: `${duration}-minute 1:1 Dota 2 coaching session.`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        payment_intent_data: {
          // Manual capture = true escrow. Funds are authorized at checkout
          // and held by Stripe (the card issuer guarantees them) but the
          // money does NOT move to the coach's Connect account until we
          // call paymentIntents.capture() on completion / auto-release. If
          // the booking is cancelled or refunded before capture we call
          // paymentIntents.cancel() which releases the auth without ever
          // moving real money — no clawback risk for the coach.
          capture_method: 'manual',
          application_fee_amount: platformFeeCents,
          transfer_data: { destination: coach.stripe_account_id },
          metadata: {
            purpose: 'coaching_booking',
            coach_account_id: String(coach.account_id),
            student_account_id: String(studentAccountId),
          },
        },
        success_url: `${baseUrl}/me/bookings?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/coaches/${coach.id}?checkout=cancelled`,
        // Force the checkout session to expire after 30 minutes (Stripe's
        // minimum). When the student abandons the tab Stripe fires
        // `checkout.session.expired` and our webhook flips the matching
        // pending booking to 'cancelled' — releasing the held slot for
        // other students. Without this, abandoned sessions would leave
        // orphan 'pending' rows that block the time forever (default
        // session lifetime is 24h).
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        metadata: {
          purpose: 'coaching_booking',
          coach_account_id: String(coach.account_id),
          student_account_id: String(studentAccountId),
        },
      });

      const booking = await db.createBooking({
        coachAccountId: coach.account_id,
        studentAccountId,
        slotStartAt: slotStart.toISOString(),
        durationMinutes: duration,
        amountCents,
        platformFeeCents,
        currency,
        stripeSessionId: checkout.id,
      });

      res.json({ url: checkout.url, booking_id: booking.id });
    } catch (err) {
      console.error('[API] coaches/:id/book:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create booking' });
    }
  });

  // Booking detail — accessible by either party or admin.
  router.get('/bookings/:id', async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const booking = await db.getBooking(parseInt(req.params.id));
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      const isParty = String(booking.coach_account_id) === String(accountId)
                   || String(booking.student_account_id) === String(accountId);
      if (!isParty && !_isSu(req)) return res.status(403).json({ error: 'Forbidden' });
      res.json({ booking });
    } catch (err) {
      console.error('[API] bookings/:id:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/me/coaching/bookings', async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const [asStudent, asCoach] = await Promise.all([
        db.listStudentBookings(accountId),
        db.listCoachBookings(accountId),
      ]);
      res.json({ as_student: asStudent, as_coach: asCoach });
    } catch (err) {
      console.error('[API] me/coaching/bookings:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Either side confirms completion. When both are stamped the row
  // transitions to 'completed' and Stripe automatically settles the funds
  // (the destination charge already routed funds into the coach's pending
  // balance; the application_fee stays with the platform).
  router.post('/bookings/:id/confirm-completion', express.json(), async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const booking = await db.getBooking(parseInt(req.params.id));
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      let side = null;
      if (String(booking.coach_account_id) === String(accountId)) side = 'coach';
      else if (String(booking.student_account_id) === String(accountId)) side = 'student';
      else return res.status(403).json({ error: 'Not your booking' });
      if (!['paid', 'disputed'].includes(booking.status)) {
        return res.status(400).json({ error: `Cannot confirm a ${booking.status} booking` });
      }
      // Step 1: stamp the side timestamp without flipping financial status.
      const stamped = await db.confirmBookingSide(booking.id, side);
      if (!stamped) return res.status(400).json({ error: 'Could not stamp confirmation' });
      let finalRow = stamped;
      // Step 2: if both sides have now confirmed AND we're still in 'paid'
      // (i.e. funds authorized & uncaptured), capture the funds via Stripe
      // FIRST, then promote the row. We never flip the DB ahead of money:
      // a Stripe capture failure must leave the row in 'paid' so the user
      // can retry.
      if (stamped.both_confirmed) {
        const stripe = _stripe();
        if (!stripe || !booking.stripe_payment_intent) {
          return res.status(400).json({ error: 'Cannot capture: missing Stripe payment intent on booking' });
        }
        try {
          await stripe.paymentIntents.capture(booking.stripe_payment_intent);
        } catch (e) {
          console.error('[confirm-completion] stripe capture failed:', e.message);
          return res.status(502).json({ error: `Stripe capture failed: ${e.message}` });
        }
        const completed = await db.markBookingCompletedById(booking.id);
        if (completed) finalRow = completed;
        // Review-prompt DM only fires when we actually transition to
        // 'completed' here (i.e. the student was the side that closed it
        // out, since a coach can't unilaterally complete without student
        // confirmation already in place).
        if (side === 'student') {
          try {
            const bot = getDiscordBot();
            if (bot && typeof bot.notifyCoachingReviewPrompt === 'function') {
              bot.notifyCoachingReviewPrompt(finalRow).catch(() => {});
            }
          } catch (_) { /* best-effort */ }
        }
      }
      res.json({ ok: true, booking: finalRow });
    } catch (err) {
      console.error('[API] bookings/:id/confirm-completion:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Student raises a dispute — must be within 48h of slot end. Freezes the
  // booking; admin resolves later via /api/admin/coaching/dispute/:id/resolve.
  router.post('/bookings/:id/dispute', express.json(), async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const booking = await db.getBooking(parseInt(req.params.id));
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (String(booking.student_account_id) !== String(accountId)) {
        return res.status(403).json({ error: 'Only the student can raise a dispute' });
      }
      // Only `paid` (= held / authorized but not captured) bookings can be
      // disputed. Once the booking is `completed` the funds have already
      // been captured to the coach via Stripe; admin re-capture would fail
      // and the dispute would enter an irrecoverable state. After capture,
      // the student's recourse is Stripe's chargeback flow, not our admin
      // panel. Db-layer also enforces this in raiseBookingDispute.
      if (booking.status !== 'paid') {
        return res.status(400).json({ error: `Cannot dispute a ${booking.status} booking. Disputes are only valid while funds are still held in escrow.` });
      }
      const slotEndMs = new Date(booking.slot_start_at).getTime() + (booking.duration_minutes * 60_000);
      if (Date.now() > slotEndMs + 48 * 3600_000) {
        return res.status(400).json({ error: 'Dispute window (48h after session end) has passed.' });
      }
      const updated = await db.raiseBookingDispute(booking.id, req.body?.reason || '');
      res.json({ ok: true, booking: updated });
    } catch (err) {
      console.error('[API] bookings/:id/dispute:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // No-show refund — student-initiated, valid the moment the slot start
  // time has passed without the coach stamping `coach_confirmed_at`. The
  // student should not have to wait 30 minutes past start to recover their
  // own money; if the coach hasn't shown up by slot start they're a
  // no-show by definition. Because we use manual capture the funds are
  // still uncaptured at this point, so we cancel the PI (auth release) —
  // no money ever moved, no clawback risk.
  router.post('/bookings/:id/no-show-refund', async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const booking = await db.getBooking(parseInt(req.params.id));
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (String(booking.student_account_id) !== String(accountId)) {
        return res.status(403).json({ error: 'Only the student can request a no-show refund' });
      }
      if (booking.status !== 'paid') return res.status(400).json({ error: `Cannot refund a ${booking.status} booking` });
      const slotStartMs = new Date(booking.slot_start_at).getTime();
      // 10-minute grace after slot start: gives the coach a window to click
      // "Mark arrived" if they've shown up but the student is itching to
      // refund. Without this grace, a student could one-click refund the
      // instant the slot ticks over even if the coach is in voice ready to
      // go. Combined with the `coach_arrived_at` lockout below, this stops
      // the gameable auto-refund pattern flagged in code review.
      const NO_SHOW_GRACE_MIN = 10;
      const earliestRefundMs = slotStartMs + NO_SHOW_GRACE_MIN * 60_000;
      if (Date.now() < earliestRefundMs) {
        const minsLeft = Math.ceil((earliestRefundMs - Date.now()) / 60_000);
        return res.status(400).json({ error: `No-show refund is available ${NO_SHOW_GRACE_MIN} minutes after the slot start (${minsLeft} min to go). Give the coach a chance to mark arrival.` });
      }
      // Hard block: if the coach has stamped arrival OR confirmed completion,
      // they have asserted attendance. The student must use the dispute flow
      // (admin-mediated) instead of unilateral refund.
      if (booking.coach_arrived_at) {
        return res.status(400).json({ error: 'Coach has marked themselves as arrived — raise a dispute instead if there is a problem.' });
      }
      if (booking.coach_confirmed_at) {
        return res.status(400).json({ error: 'Coach has confirmed attendance — raise a dispute instead.' });
      }
      const stripe = _stripe();
      // Refund integrity: only flip the DB row to 'refunded' if Stripe
      // actually released the auth. A failed cancel here means the auth is
      // still sitting at Stripe — surface 502 so the student can retry (or
      // contact admin) rather than losing track of the booking.
      if (!stripe || !booking.stripe_payment_intent) {
        return res.status(400).json({ error: 'Cannot refund: missing Stripe payment intent on booking' });
      }
      try {
        // Cancel releases the uncaptured auth (no funds ever moved). If the
        // PI was somehow already captured (race with auto-release / admin
        // release), `cancel` errors and we fall back to a real refund.
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent);
      } catch (cancelErr) {
        // Fall back to a real refund only if Stripe says the PI is no longer
        // cancellable (i.e. already captured) — any other error surfaces as 502.
        const code = cancelErr?.code || cancelErr?.raw?.code;
        if (code !== 'payment_intent_unexpected_state') {
          console.error('[no-show-refund] stripe cancel failed:', cancelErr.message);
          return res.status(502).json({ error: `Stripe cancel failed: ${cancelErr.message}` });
        }
        try {
          await stripe.refunds.create({
            payment_intent: booking.stripe_payment_intent,
            refund_application_fee: true,
            reverse_transfer: true,
            metadata: { reason: 'coach_no_show', booking_id: String(booking.id) },
          });
        } catch (e) {
          console.error('[no-show-refund] stripe refund fallback failed:', e.message);
          return res.status(502).json({ error: `Stripe refund failed: ${e.message}` });
        }
      }
      const updated = await db.markBookingRefunded(booking.id);
      res.json({ ok: true, booking: updated });
    } catch (err) {
      console.error('[API] bookings/:id/no-show-refund:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Coach-side arrival signal — locks out the student's unilateral no-show
  // refund button. Without this, a student could one-click refund the
  // moment the slot ticks over even if the coach is in voice ready to
  // teach (since `coach_confirmed_at` is only set at session END via the
  // Mark-completed flow). Allowed window: from 30 min BEFORE slot start
  // up to slot END — outside that window the coach should use the regular
  // confirm-completion flow instead. Idempotent: stamps coach_arrived_at
  // only on first call, returns the same row on repeat.
  router.post('/bookings/:id/coach-arrived', async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const booking = await db.getBooking(parseInt(req.params.id));
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (String(booking.coach_account_id) !== String(accountId)) {
        return res.status(403).json({ error: 'Only the coach can mark themselves as arrived' });
      }
      if (booking.status !== 'paid') {
        return res.status(400).json({ error: `Cannot mark arrival on a ${booking.status} booking` });
      }
      const slotStartMs = new Date(booking.slot_start_at).getTime();
      const slotEndMs = slotStartMs + booking.duration_minutes * 60_000;
      const now = Date.now();
      if (now < slotStartMs - 30 * 60_000) {
        return res.status(400).json({ error: 'Mark-arrived opens 30 minutes before the slot start.' });
      }
      if (now > slotEndMs) {
        return res.status(400).json({ error: 'Slot has already ended — use Mark-completed instead.' });
      }
      const updated = await db.markCoachArrived(booking.id, booking.coach_account_id);
      if (!updated) return res.status(409).json({ error: 'Could not mark arrival (booking may have changed status).' });
      res.json({ ok: true, booking: updated });
    } catch (err) {
      console.error('[API] bookings/:id/coach-arrived:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Reviews — gated server-side to bookings the student owns AND that are
  // already 'completed'. UNIQUE constraint on booking_id stops duplicates.
  router.post('/coaches/:id/reviews', express.json(), async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const coach = await db.getCoachById(parseInt(req.params.id));
      if (!coach) return res.status(404).json({ error: 'Coach not found' });
      const bookingId = parseInt(req.body?.booking_id);
      if (!bookingId) return res.status(400).json({ error: 'booking_id required' });
      const booking = await db.getBooking(bookingId);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (String(booking.student_account_id) !== String(accountId)) {
        return res.status(403).json({ error: 'You can only review your own sessions' });
      }
      if (String(booking.coach_account_id) !== String(coach.account_id)) {
        return res.status(400).json({ error: 'Booking does not belong to this coach' });
      }
      if (booking.status !== 'completed') {
        return res.status(400).json({ error: 'You can only review completed sessions' });
      }
      const created = await db.createCoachingReview({
        bookingId,
        studentAccountId: accountId,
        coachAccountId: coach.account_id,
        rating: req.body?.rating,
        writtenReview: req.body?.written_review,
      });
      if (!created) return res.status(409).json({ error: 'You have already reviewed this session' });
      res.json({ ok: true, review: created });
    } catch (err) {
      console.error('[API] coaches/:id/reviews:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Booking-keyed review endpoint — preferred over /coaches/:id/reviews from
  // the student's "My bookings" page because the coach may have been
  // suspended / delisted between session and review and would no longer be
  // resolvable via the public coach directory. Reviews must remain possible
  // for any historically-completed booking, regardless of the coach's
  // current status, so we resolve the coach via the booking row rather than
  // the active-coach list. Same authorization rules as /coaches/:id/reviews.
  router.post('/bookings/:id/review', express.json(), async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const accountId = req.session?.accountId;
      if (!accountId) return res.status(401).json({ error: 'Sign in with Steam' });
      const bookingId = parseInt(req.params.id);
      if (!bookingId) return res.status(400).json({ error: 'booking id required' });
      const booking = await db.getBooking(bookingId);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (String(booking.student_account_id) !== String(accountId)) {
        return res.status(403).json({ error: 'You can only review your own sessions' });
      }
      if (booking.status !== 'completed') {
        return res.status(400).json({ error: 'You can only review completed sessions' });
      }
      const created = await db.createCoachingReview({
        bookingId,
        studentAccountId: accountId,
        coachAccountId: booking.coach_account_id,
        rating: req.body?.rating,
        writtenReview: req.body?.written_review,
      });
      if (!created) return res.status(409).json({ error: 'You have already reviewed this session' });
      res.json({ ok: true, review: created });
    } catch (err) {
      console.error('[API] bookings/:id/review:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- Coaching admin ----------
  // Flag-gated alongside the public coaching endpoints — when the marketplace
  // is off the entire feature is invisible, including for superusers, so the
  // admin tab silently disappears instead of showing an empty/broken panel.
  router.get('/admin/coaching/dashboard', requireSuperuser, async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const pool = db.getPool();
      const [allCoaches, disputes, revenue, sanctions, last30] = await Promise.all([
        db.listAllCoaches(),
        db.listOpenDisputes(),
        db.getCoachingPlatformRevenue(),
        db.listCoachSanctions(null),
        // 30-day rolling window for the dashboard stat cards. Counts paid /
        // completed / disputed bookings (anything that actually saw money
        // move) — refunded ones are excluded so the fee total reflects net.
        pool.query(
          `SELECT COUNT(*)::int AS bookings_30d,
                  COALESCE(SUM(platform_fee_cents), 0)::bigint AS platform_fees_30d_cents
             FROM coaching_bookings
            WHERE created_at >= NOW() - INTERVAL '30 days'
              AND status IN ('paid', 'completed', 'disputed')`,
        ),
      ]);
      const pendingKyc = allCoaches.filter(c => c.status === 'kyc_pending');
      const last30Row = last30.rows[0] || { bookings_30d: 0, platform_fees_30d_cents: 0 };
      res.json({
        // Both the flat lists (for the dispute / KYC tables) and a derived
        // `stats` object (for the top-of-page summary cards) so the frontend
        // can render the dashboard without a second round-trip.
        coaches: allCoaches,
        pending_kyc: pendingKyc,
        open_disputes: disputes,
        revenue,
        recent_sanctions: sanctions,
        stats: {
          active_coaches: allCoaches.filter(c => c.status === 'active').length,
          pending_kyc: pendingKyc.length,
          open_disputes: disputes.length,
          bookings_30d: Number(last30Row.bookings_30d) || 0,
          platform_fees_30d_cents: Number(last30Row.platform_fees_30d_cents) || 0,
        },
      });
    } catch (err) {
      console.error('[API] admin/coaching/dashboard:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/coaching/sanction', requireSuperuser, express.json(), async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const coachAccountId = req.body?.coach_account_id;
      const severity = req.body?.severity;
      const reason = req.body?.reason;
      if (!coachAccountId || !severity || !reason) {
        return res.status(400).json({ error: 'coach_account_id, severity, reason required' });
      }
      const sanction = await db.applyCoachSanction({
        coachAccountId,
        severity,
        reason,
        adminId: req.session?.accountId || null,
      });
      res.json({ ok: true, sanction });
    } catch (err) {
      console.error('[API] admin/coaching/sanction:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Resolve a disputed booking. resolution:
  //   'release' — funds stay with the coach, mark completed.
  //   'refund'  — full refund to student (reverses transfer + app fee).
  router.post('/admin/coaching/dispute/:id/resolve', requireSuperuser, express.json(), async (req, res) => {
    try {
      if (!(await _coachingOn(req))) return res.status(404).json({ error: 'Not found' });
      const booking = await db.getBooking(parseInt(req.params.id));
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (booking.status !== 'disputed') {
        return res.status(400).json({ error: `Cannot resolve a ${booking.status} booking` });
      }
      const resolution = req.body?.resolution;
      if (!['release', 'refund'].includes(resolution)) {
        return res.status(400).json({ error: "resolution must be 'release' or 'refund'" });
      }
      const stripe = _stripe();
      if (!stripe || !booking.stripe_payment_intent) {
        return res.status(400).json({ error: 'Cannot resolve: missing Stripe payment intent on booking' });
      }
      if (resolution === 'refund') {
        // Funds are still uncaptured (booking is 'disputed' = frozen at
        // 'paid'/auth-only). Cancel the PI to release the auth — no money
        // ever moved, nothing to refund. Fall back to a true refund only
        // if the PI was already captured (race vs auto-release).
        try {
          await stripe.paymentIntents.cancel(booking.stripe_payment_intent);
        } catch (cancelErr) {
          const code = cancelErr?.code || cancelErr?.raw?.code;
          if (code !== 'payment_intent_unexpected_state') {
            console.error('[admin dispute resolve] stripe cancel failed:', cancelErr.message);
            return res.status(502).json({ error: `Stripe cancel failed: ${cancelErr.message}` });
          }
          try {
            await stripe.refunds.create({
              payment_intent: booking.stripe_payment_intent,
              refund_application_fee: true,
              reverse_transfer: true,
              metadata: { reason: 'admin_dispute_refund', booking_id: String(booking.id) },
            });
          } catch (e) {
            console.error('[admin dispute resolve] stripe refund fallback failed:', e.message);
            return res.status(502).json({ error: `Stripe refund failed: ${e.message}` });
          }
        }
        const updated = await db.markBookingRefunded(booking.id);
        return res.json({ ok: true, booking: updated, resolution });
      }
      // 'release' — capture the held funds first (which moves money to the
      // coach's Connect balance via the original transfer_data). Only on a
      // successful capture do we flip the row to 'completed' so we never
      // mark the row settled when the money is still sitting at the issuer.
      //
      // Idempotency / race safety: `payment_intent_unexpected_state` is
      // returned by Stripe for *several* reasons (already captured, already
      // canceled, requires_action, etc) — treating it blindly as success
      // would let a `canceled`/refunded PI flip our row to `completed` and
      // double-pay the coach. So on that error code we EXPLICITLY retrieve
      // the PI and only treat status='succeeded' as already-captured. Any
      // other status (canceled, requires_action, requires_payment_method)
      // returns 409 and we DON'T mutate the DB.
      try {
        await stripe.paymentIntents.capture(booking.stripe_payment_intent);
      } catch (e) {
        const code = e?.code || e?.raw?.code;
        if (code !== 'payment_intent_unexpected_state') {
          console.error('[admin dispute resolve] stripe capture failed:', e.message);
          return res.status(502).json({ error: `Stripe capture failed: ${e.message}` });
        }
        try {
          const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent);
          if (pi?.status !== 'succeeded') {
            console.warn(`[admin dispute resolve] PI ${booking.stripe_payment_intent} in unexpected state '${pi?.status}' — refusing to flip booking to completed.`);
            return res.status(409).json({
              error: `Cannot release: PaymentIntent is in state '${pi?.status}' (expected 'succeeded' for already-captured). The booking may have been refunded or canceled by another process — refresh and re-check.`,
            });
          }
          console.warn(`[admin dispute resolve] PI ${booking.stripe_payment_intent} already captured (succeeded) — treating as success.`);
        } catch (retrieveErr) {
          console.error('[admin dispute resolve] PI retrieve failed:', retrieveErr.message);
          return res.status(502).json({ error: `Could not verify PI state after capture conflict: ${retrieveErr.message}` });
        }
      }
      // Transition-guarded UPDATE — only flip to 'completed' if the row is
      // still 'disputed'. Stops a stale/concurrent admin click (or a webhook
      // race) from overwriting a later 'refunded' state. If the row has
      // already moved on, we return 409 so the admin re-fetches before
      // acting again.
      const p = db.getPool();
      const r = await p.query(
        `UPDATE coaching_bookings
            SET status = 'completed', completed_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND status = 'disputed'
          RETURNING *`,
        [booking.id]
      );
      if (!r.rows.length) {
        return res.status(409).json({
          error: 'Booking is no longer in disputed state — another admin action may have resolved it. Refresh the dashboard to see the current status.',
        });
      }
      res.json({ ok: true, booking: r.rows[0], resolution });
    } catch (err) {
      console.error('[API] admin/coaching/dispute/:id/resolve:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Task #157 — Magazine v3 monetization features. All routes are mounted
  // here so the existing `requirePro` / `_isProAccount` / `_isSu` helpers can
  // be passed in by closure. The module also adds an app-level
  // `/embed/:accountId` route via the `app` reference.
  try {
    const { mountMagazineV3Routes } = require('../monetization/magazineV3');
    mountMagazineV3Routes({
      router,
      app: _app,
      express,
      deps: {
        db,
        magV3: db.magV3,
        isProAccount: _isProAccount,
        isSuperuser: _isSu,
        requirePro,
        getStripe: () => process.env.STRIPE_SECRET_KEY
          ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null,
        getSiteUrl: () => process.env.SITE_URL
          || `http://localhost:${process.env.PORT || 5000}`,
        getGroq: () => {
          try { return require('../services/groqService'); }
          catch (_) { return null; }
        },
      },
    });
  } catch (e) {
    // Round-9 review comment: silent route-mount failure means an entire
    // monetization batch (replay quota, weekly report, coach pairing,
    // sponsorships, embed, pickem, verified badges, one-off perks) would
    // boot disabled in production with no obvious indicator. Fail fast in
    // production to surface the misconfiguration; allow opt-out for
    // dev/CI hosts via MAGV3_ROUTES_OPTIONAL=1 (mirrors the
    // MAGV3_SCHEMA_OPTIONAL escape hatch on the schema side).
    console.error('[mag-v3] route mount failed:', e && e.stack || e && e.message || e);
    if (process.env.NODE_ENV === 'production'
        && process.env.MAGV3_ROUTES_OPTIONAL !== '1') {
      throw e;
    }
  }

  return router;
}

/**
 * Resolve a Steam profile URL to a Steam64 ID.
 * Handles /profiles/STEAM64 directly, and resolves /id/vanity URLs
 * via the Steam community XML endpoint (no API key required).
 */
async function resolveSteamId64FromUrl(url) {
  if (!url) return null;
  const fetch = require('node-fetch');

  // Direct /profiles/ URL — extract the 17-digit ID
  const profilesMatch = url.match(/\/profiles\/(\d{17})/);
  if (profilesMatch) return profilesMatch[1];

  // Normalize to a usable base URL
  let normalized = url.trim();
  if (!normalized.startsWith('http')) normalized = 'https://' + normalized;
  // Strip trailing slash
  normalized = normalized.replace(/\/$/, '');

  // Try the Steam community XML profile endpoint
  try {
    const xmlUrl = normalized + '?xml=1';
    const resp = await fetch(xmlUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    });
    if (resp.ok) {
      const text = await resp.text();
      const idMatch = text.match(/<steamID64>(\d{17})<\/steamID64>/);
      if (idMatch) return idMatch[1];
    }
  } catch (e) {
    console.warn('[SteamResolve] XML fetch failed:', e.message);
  }

  return null;
}

const parseQueue = [];
let parseRunning = false;

function enqueueParse(jobId, filePath, ip) {
  const job = uploadJobs.get(jobId);
  parseQueue.push({ jobId, filePath, ip, patch: job ? job.patch : null });
  updateJobStep(jobId, 'Queued for parsing...');
  drainParseQueue();
}

async function drainParseQueue() {
  if (parseRunning) return;
  parseRunning = true;
  while (parseQueue.length > 0) {
    const { jobId, filePath, ip, patch } = parseQueue.shift();
    const pos = parseQueue.length;
    if (pos > 0) {
      for (let i = 0; i < parseQueue.length; i++) {
        updateJobStep(parseQueue[i].jobId, `Queued for parsing (${i + 1} in line)...`);
      }
    }
    try {
      await processReplayJob(jobId, filePath, ip, patch);
    } catch (err) {
      console.error(`[API] Job ${jobId} unhandled error:`, err);
    }
  }
  parseRunning = false;
}

async function processReplayJob(jobId, filePath, ip, patch = null, opts = {}) {
  try {
    updateJobStep(jobId, 'Computing file hash...');

    const replayParser = getReplayParser();
    const fileHash = replayParser.computeFileHash(filePath);

    const existingHashMatch = await db.isFileHashRecorded(fileHash);
    let replaceReason = null;
    if (existingHashMatch) {
      console.log(`[API] Duplicate file hash detected for match ${existingHashMatch}, deleting old match and re-recording.`);
      try {
        await db.deleteMatch(existingHashMatch, `re-upload:${ip}`, 'Replaced by re-upload of same replay file');
        replaceReason = 'sameFile';
      } catch (delErr) {
        console.error(`[API] Failed to delete old match ${existingHashMatch} for re-upload:`, delErr.message);
        cleanupFile(filePath);
        setJobTerminal(jobId, {
          status: 'error',
          error: `This replay file has already been uploaded (match ${existingHashMatch}). Failed to auto-replace: ${delErr.message}`,
        });
        return;
      }
    }

    updateJobStep(jobId, 'Parsing replay file...');

    const matchStats = await replayParser.parseReplayFull(filePath);

    if (!matchStats || !matchStats.players || matchStats.players.length === 0) {
      cleanupFile(filePath);
      setJobTerminal(jobId, { status: 'error', error: 'Failed to parse replay - no player data found' });
      return;
    }

    // Fix date: if replay has no embedded timestamp, fall back to file mtime rather than now()
    if (!matchStats.gameStartTime) {
      try {
        const fileStat = fs.statSync(filePath);
        matchStats.gameStartTime = Math.floor(fileStat.mtimeMs / 1000);
        console.log(`[API] No gameStartTime in replay — using file mtime: ${new Date(matchStats.gameStartTime * 1000).toISOString()}`);
      } catch (_) {}
    }

    updateJobStep(jobId, 'Checking for duplicates...');

    const existing = await db.isMatchRecorded(matchStats.matchId);
    if (existing) {
      console.log(`[API] Match ${matchStats.matchId} already exists, deleting for re-record.`);
      try {
        await db.deleteMatch(matchStats.matchId, `re-upload:${ip}`, 'Replaced by re-upload');
        if (!replaceReason) replaceReason = 'sameMatchId';
      } catch (delErr) {
        cleanupFile(filePath);
        setJobTerminal(jobId, { status: 'error', error: `Match ${matchStats.matchId} already recorded. Auto-replace failed: ${delErr.message}` });
        return;
      }
    }

    updateJobStep(jobId, 'Recording match data...');

    const activeSeason = await db.getActiveSeason();
    const seasonId = activeSeason ? activeSeason.id : null;
    const recordResult = await db.recordMatch(matchStats, '', `web:${ip}`, fileHash, patch, seasonId);

    // Data quality check + RCON server reset — same pipeline as bot._recordMatchData
    try {
      getDiscordBot()._checkMatchQuality(matchStats).catch(e => console.error('[QualityCheck] Replay job error:', e.message));
      getDiscordBot()._rconResetServer().catch(e => console.log('[RCON] Post-replay reset skipped:', e.message));
    } catch (_) {}

    // Drift closure (Task #157 round-3): auto-resolve any open pickem picks
    // for this match using the recorded radiant_win flag. Best-effort — the
    // helper itself swallows errors so it can't break the upload pipeline.
    try {
      if (db.magV3?.autoResolvePickemForMatch && matchStats?.matchId != null) {
        // Round-8: pass the side-bet actuals derived from the parsed
        // replay so first-blood / total-kills / duration-tier picks are
        // auto-resolved alongside the winner pick. Each field is wrapped
        // in its own try because the parser doesn't always populate
        // every field — autoResolvePickemForMatch tolerates nulls.
        let totalKills = null;
        try {
          totalKills = (matchStats.players || []).reduce(
            (s, p) => s + (Number(p.kills) || 0), 0
          );
        } catch (_) {}
        let firstBloodTeam = null;
        try {
          // Replays expose firstblood_claimed as the slot of the killer.
          // Slots 0-4 = radiant, 5-9 = dire (Dota's convention).
          const fbClaimer = (matchStats.players || []).find(p =>
            p.firstblood_claimed === 1 || p.firstblood_claimed === true
          );
          if (fbClaimer) {
            firstBloodTeam = (fbClaimer.team === 'radiant'
              || (typeof fbClaimer.player_slot === 'number' && fbClaimer.player_slot < 128))
              ? 'radiant' : 'dire';
          }
        } catch (_) {}
        db.magV3.autoResolvePickemForMatch(
          matchStats.matchId,
          Boolean(matchStats.radiantWin),
          {
            durationSeconds: Number(matchStats.duration) || null,
            totalKills: Number.isFinite(totalKills) ? totalKills : null,
            firstBloodTeam,
          },
        ).catch(() => {});
      }
    } catch (_) {}

    // Notify Discord about achievements granted inside recordMatch()
    if (recordResult && recordResult.achievementGrants && recordResult.achievementGrants.length > 0) {
      try {
        getDiscordBot()._notifyAchievementsUnlocked(recordResult.achievementGrants).catch(e =>
          console.error('[Achievements] Web upload notify error:', e.message)
        );
      } catch (_) {}
      // Task #217 — voice-pack achievement-unlock event for each granted player.
      try { voiceEventQueue.pushAchievementVoiceEvents(recordResult.achievementGrants); } catch (_) {}
    }

    // Task #217 — voice-pack win/loss + first-blood for every player in
    // the freshly recorded match. Mirrors the post-match DM trigger
    // pattern; the browser drains via GET /api/me/voice-events.
    try { voiceEventQueue.pushMatchVoiceEvents(matchStats); } catch (_) {}

    updateJobStep(jobId, 'Updating ratings...');

    const statsService = getStatsService();
    const radiantPlayers = matchStats.players.filter(p => p.team === 'radiant');
    const direPlayers = matchStats.players.filter(p => p.team === 'dire');

    const radiant = radiantPlayers.map(p => ({
      id: p.accountId ? p.accountId.toString() : `anon_${p.personaname}`,
      mu: 25,
      sigma: 8.333,
    }));
    const dire = direPlayers.map(p => ({
      id: p.accountId ? p.accountId.toString() : `anon_${p.personaname}`,
      mu: 25,
      sigma: 8.333,
    }));

    for (const p of [...radiant, ...dire]) {
      if (p.id === '0') continue;
      const existingRating = await db.getPlayerRating(p.id);
      if (existingRating) {
        p.mu = existingRating.mu;
        p.sigma = existingRating.sigma;
      }
    }

    const validRadiant = radiant.filter(p => p.id !== '0');
    const validDire = dire.filter(p => p.id !== '0');

    if (validRadiant.length > 0 && validDire.length > 0) {
      const newRatings = statsService.calculateNewRatings(validRadiant, validDire, matchStats.radiantWin);
      for (const r of newRatings) {
        const isRadiant = validRadiant.some(p => p.id === r.id);
        const won = isRadiant ? matchStats.radiantWin : !matchStats.radiantWin;
        const player = matchStats.players.find(p =>
          (p.accountId ? p.accountId.toString() : `anon_${p.personaname}`) === r.id
        );
        await db.updateRating(r.id, '', player?.personaname || r.id, r.mu, r.sigma, r.mmr, won, matchStats.matchId);
      }
    }

    // After ratings are updated, check season end conditions so the web upload
    // path triggers automatic closure just like the Discord bot path does.
    try {
      const bot = getDiscordBot();
      if (bot && typeof bot._checkSeasonEndCondition === 'function') {
        bot._checkSeasonEndCondition().catch(e => console.error('[Season] Web upload end-check error:', e.message));
      }
    } catch (_) {}

    // Archive the replay file so superusers can download it later.
    try {
      const safeMatchId = matchStats.matchId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const storedName = `${safeMatchId}.dem`;
      const storedPath = path.join(REPLAY_STORE_DIR, storedName);
      fs.copyFileSync(filePath, storedPath);
      const expiresAt = REPLAY_STORE_DAYS > 0
        ? new Date(Date.now() + REPLAY_STORE_DAYS * 86400 * 1000)
        : null;
      await db.setReplayFilePath(matchStats.matchId, storedPath, expiresAt);
      console.log(`[API] Replay archived: ${storedPath}${expiresAt ? ` (expires ${expiresAt.toISOString()})` : ' (no expiry)'}`);
    } catch (archErr) {
      console.warn(`[API] Could not archive replay for match ${matchStats.matchId}:`, archErr.message);
    }

    // If a remote path was provided (dedicated-server replay), archive it on the
    // server under a permanent match-ID filename and store the path in the DB.
    if (opts.remotePath && matchStats.matchId) {
      try {
        const { archiveMatchReplay } = require('../services/serverReplayFetcher');
        const archivePath = await archiveMatchReplay(matchStats.matchId, opts.remotePath);
        await db.setReplayPath(matchStats.matchId, archivePath);
        console.log(`[API] Remote replay archived: ${archivePath}`);
      } catch (remoteArchErr) {
        console.warn(`[API] Could not archive remote replay for match ${matchStats.matchId}:`, remoteArchErr.message);
      }
    }

    cleanupFile(filePath);
    setJobTerminal(jobId, {
      status: 'complete',
      matchId: matchStats.matchId,
      duration: matchStats.duration,
      radiantWin: matchStats.radiantWin,
      players: matchStats.players.length,
      parseMethod: matchStats.parseMethod,
      isNew: replaceReason === null,
      replaceReason,
    });
    console.log(`[API] Upload job ${jobId} complete: match ${matchStats.matchId}`);

    // Notify Discord async — non-blocking so upload response isn't held up
    getDiscordBot().notifyWebUpload(matchStats).catch(err =>
      console.error('[Discord] Web upload notification failed:', err.message)
    );
  } catch (err) {
    console.error(`[API] Upload job ${jobId} error:`, err);
    cleanupFile(filePath);
    setJobTerminal(jobId, {
      status: 'error',
      error: err.message,
    });
    db.logServerError('error', 'replay-upload', err.message, { jobId, stack: err.stack?.slice(0, 1000) }).catch(() => {});
  }
}

function updateJobStep(jobId, step) {
  const job = uploadJobs.get(jobId);
  if (job) {
    job.step = step;
    uploadJobs.set(jobId, job);
  }
}

function setJobTerminal(jobId, data) {
  uploadJobs.set(jobId, { ...data, completedAt: Date.now() });
  setTimeout(() => uploadJobs.delete(jobId), 30 * 60 * 1000);
}

function processReplayInternal(filePath, source, opts = {}) {
  const jobId = crypto.randomBytes(8).toString('hex');
  let fileSize = 0;
  try { fileSize = fs.statSync(filePath).size; } catch (_) {}
  uploadJobs.set(jobId, {
    status: 'uploading',
    fileName: path.basename(filePath),
    fileSize,
    totalChunks: 1,
    chunksReceived: new Set([0]),
    startedAt: Date.now(),
    patch: null,
    filePath,
  });
  return new Promise((resolve, reject) => {
    processReplayJob(jobId, filePath, source, null, opts).then(() => {
      const result = uploadJobs.get(jobId);
      if (result && result.status === 'error') {
        reject(new Error(result.error || 'Parse failed'));
      } else {
        resolve(result);
      }
    }).catch(reject);
  });
}

module.exports = { createServer, processReplayInternal, createApiRouter };
