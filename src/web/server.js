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
const { getReplayParser } = require('../replay/replayParser');
const { getStatsService } = require('../stats/statsService');
const { generateChatResponse } = require('../services/groqService');

const CHUNK_DIR = '/tmp/replay-chunks';
const UPLOAD_DIR = '/tmp/replay-uploads';
const uploadJobs = new Map();
const STALE_JOB_TTL = 30 * 60 * 1000;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(CHUNK_DIR);
ensureDir(UPLOAD_DIR);

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

function authMiddleware(req, res, next) {
  const uploadKey = process.env.UPLOAD_KEY;
  if (!uploadKey) {
    return res.status(503).json({ error: 'Upload not configured. Set UPLOAD_KEY secret.' });
  }
  const providedKey = req.headers['x-upload-key'];
  if (providedKey !== uploadKey) {
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

function createServer(startupStatus = {}) {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors());

  const sessionSecret = process.env.SESSION_SECRET || (() => {
    console.warn('[Session] SESSION_SECRET not set — using insecure default. Add it as an environment secret.');
    return 'dota2-inhouse-default-secret-please-change';
  })();

  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));

  // Steam OpenID authentication
  const fetch = require('node-fetch');
  const STEAM_OPEN_ID = 'https://steamcommunity.com/openid/login';
  const STEAM_ID_REGEX = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;

  app.get('/auth/steam', authLimiter, (req, res) => {
    const baseUrl = process.env.SITE_URL || 'http://170.64.182.110:5000';
    const returnUrl = `${baseUrl}/auth/steam/return`;
    const params = new URLSearchParams({
      'openid.mode': 'checkid_setup',
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.return_to': returnUrl,
      'openid.realm': baseUrl,
    });
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

      const verifyParams = new URLSearchParams(req.query);
      verifyParams.set('openid.mode', 'check_authentication');
      const verifyRes = await fetch(STEAM_OPEN_ID, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: verifyParams.toString(),
      });
      const text = await verifyRes.text();
      if (!text.includes('is_valid:true')) {
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
         ORDER BY ps.date DESC LIMIT 1`,
        [accountId]
      );

      req.session.steamId64 = steamId64;
      req.session.accountId = accountId;
      req.session.displayName = lookup.rows[0]?.display_name || null;

      res.redirect('/?auth=success');
    } catch (err) {
      console.error('[Steam Auth] Error:', err.message);
      res.redirect('/?auth=error');
    }
  });

  // Stripe webhook MUST be registered before express.json() to receive raw body
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!process.env.STRIPE_SECRET_KEY) return res.status(503).send('Stripe not configured');
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      let event;
      if (webhookSecret) {
        const sig = req.headers['stripe-signature'];
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        event = JSON.parse(req.body.toString());
      }
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        await db.confirmBuyin(session.id);
        console.log('[Stripe] Confirmed buyin for session', session.id);
      }
      res.json({ received: true });
    } catch (err) {
      console.error('[Stripe] Webhook error:', err.message);
      res.status(400).send(`Webhook error: ${err.message}`);
    }
  });

  app.use(express.json());

  app.use('/api', createApiRouter(startupStatus));

  // Convert any middleware errors (body-parser etc) to JSON instead of HTML
  app.use((err, req, res, next) => {
    console.error('[Server] Middleware error:', err.message, 'on', req.method, req.path);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });


  const staticPath = path.join(__dirname, '../../web/dist');
  if (fs.existsSync(staticPath)) {
    app.use(express.static(staticPath));
    app.get('/{*splat}', (req, res) => {
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  }

  return app;
}

function createApiRouter(startupStatus = {}) {
  const router = express.Router();

  router.get('/health', async (req, res) => {
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

  router.get('/auth/me', (req, res) => {
    if (req.session && req.session.accountId) {
      res.json({
        accountId: req.session.accountId,
        steamId64: req.session.steamId64,
        displayName: req.session.displayName || null,
      });
    } else {
      res.json(null);
    }
  });

  router.post('/auth/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
  });

  router.post('/admin/login', authLimiter, express.json(), (req, res) => {
    const uploadKey = process.env.UPLOAD_KEY;
    if (!uploadKey) return res.status(503).json({ error: 'Admin not configured' });
    const { password } = req.body || {};
    if (password === uploadKey) return res.json({ success: true });
    return res.status(401).json({ error: 'Invalid password' });
  });

  router.post('/admin/superuser-login', authLimiter, express.json(), (req, res) => {
    const key = process.env.SUPERUSER_PASSWORD;
    if (!key) return res.status(503).json({ error: 'Superuser not configured. Set SUPERUSER_PASSWORD.' });
    const { password } = req.body || {};
    if (password === key) return res.json({ success: true });
    return res.status(401).json({ error: 'Invalid password' });
  });

  function requireSuperuser(req, res, next) {
    const key = process.env.SUPERUSER_PASSWORD;
    if (!key) return res.status(503).json({ error: 'Superuser not configured. Set SUPERUSER_PASSWORD.' });
    if (req.headers['x-superuser-key'] !== key) return res.status(403).json({ error: 'Invalid superuser key' });
    next();
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
      const [leaderboard, streaks] = await Promise.all([
        db.getComputedLeaderboard(seasonId),
        db.getPlayerStreaks(seasonId),
      ]);
      for (const p of leaderboard) {
        p.streak = streaks[p.player_id?.toString()] || 0;
      }
      res.json({ leaderboard });
    } catch (err) {
      console.error('[API] Error fetching leaderboard:', err.message);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  });

  router.get('/players/:accountId', async (req, res) => {
    try {
      const stats = await db.getPlayerStats(req.params.accountId);
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

  router.post('/nicknames/:accountId', authMiddleware, async (req, res) => {
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
      const players = await db.getHeroPlayers(parseInt(req.params.heroId));
      res.json({ players });
    } catch (err) {
      console.error('[API] Error fetching hero players:', err.message);
      res.status(500).json({ error: 'Failed to fetch hero players' });
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

  router.get('/synergy', async (req, res) => {
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
        payment_method_types: ['card'],
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
      const { category_type, label, amount_cents, notes } = req.body;
      if (!category_type || !label || typeof amount_cents !== 'number') {
        return res.status(400).json({ error: 'category_type, label, and amount_cents are required' });
      }
      const payout = await db.addSeasonPayout(seasonId, category_type, label, amount_cents, notes);
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

  router.put('/matches/:matchId/meta', authMiddleware, async (req, res) => {
    try {
      const { patch, seasonId, date } = req.body;
      await db.updateMatchMeta(req.params.matchId, { patch, seasonId, date });
      res.json({ success: true });
    } catch (err) {
      console.error('[API] Error updating match meta:', err.message);
      res.status(500).json({ error: 'Failed to update match' });
    }
  });

  router.get('/synergy/heatmap', async (req, res) => {
    try {
      const seasonId = req.query.season_id || null;
      const data = await db.getSynergyHeatmap(seasonId);
      res.json(data);
    } catch (err) {
      console.error('[API] Error fetching synergy heatmap:', err.message);
      res.status(500).json({ error: 'Failed to fetch synergy heatmap' });
    }
  });

  router.get('/enemy-synergy/heatmap', async (req, res) => {
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

  router.post('/admin/recalculate-ratings', authMiddleware, async (req, res) => {
    try {
      console.log('[API] Recalculating all TrueSkill ratings...');
      await db.recalculateAllRatings();
      res.json({ success: true, message: 'Ratings recalculated from all match history.' });
    } catch (err) {
      console.error('[API] Error recalculating ratings:', err.message);
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
      const positions = await db.getPlayerPositions(req.params.accountId);
      res.json({ positions });
    } catch (err) {
      console.error('[API] Error fetching player positions:', err.message);
      res.status(500).json({ error: 'Failed to fetch player positions' });
    }
  });

  router.post('/upload/init', authMiddleware, (req, res) => {
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

  router.get('/players/:accountId/achievements', async (req, res) => {
    try {
      const achievements = await db.getPlayerAchievements(req.params.accountId);
      res.json({ achievements });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch achievements' });
    }
  });

  router.get('/head-to-head', async (req, res) => {
    try {
      const { a, b, season_id } = req.query;
      if (!a || !b) return res.status(400).json({ error: 'Provide ?a=accountId&b=accountId' });
      const data = await db.getHeadToHead(a, b, season_id || null);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch head-to-head' });
    }
  });

  router.get('/compare', async (req, res) => {
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
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save prediction' });
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

  router.get('/admin/duplicate-matches', authMiddleware, async (req, res) => {
    try {
      const duplicates = await db.findDuplicateMatches();
      res.json(duplicates);
    } catch (err) {
      res.status(500).json({ error: 'Failed to scan for duplicates' });
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

  router.post('/patch-notes', authMiddleware, express.json(), async (req, res) => {
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

  router.put('/patch-notes/:id', authMiddleware, express.json(), async (req, res) => {
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

  // AI Chat — Grok-powered, Dota-only assistant
  // Cache server context for 5 minutes to avoid hammering the DB on every message
  let _chatContextCache = null;
  let _chatContextExpiry = 0;
  async function getServerContext() {
    const now = Date.now();
    if (_chatContextCache && now < _chatContextExpiry) return _chatContextCache;
    try {
      const [leaderboard, heroStatsResult] = await Promise.all([
        db.getComputedLeaderboard(null).catch(() => []),
        db.getHeroStats(null).catch(() => ({ heroes: [] })),
      ]);
      const heroStats = Array.isArray(heroStatsResult) ? heroStatsResult : (heroStatsResult?.heroes || []);
      const top5 = leaderboard.slice(0, 5).map((p, i) =>
        `${i + 1}. ${p.nickname || p.display_name || p.player_id} — ${p.mmr} MMR, ${p.wins}W ${p.losses}L`
      ).join('\n');
      const topHeroes = heroStats.slice(0, 8).map(h =>
        `${h.hero_name}: ${h.games} games, ${h.win_rate}% WR`
      ).join(', ');
      _chatContextCache = [
        `Total players on leaderboard: ${leaderboard.length}`,
        leaderboard.length > 0 ? `Top 5 players:\n${top5}` : '',
        topHeroes ? `Most picked heroes: ${topHeroes}` : '',
      ].filter(Boolean).join('\n');
      _chatContextExpiry = now + 5 * 60 * 1000;
    } catch {
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

  router.delete('/patch-notes/:id', authMiddleware, async (req, res) => {
    try {
      await db.deletePatchNote(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete patch note' });
    }
  });

  return router;
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

async function processReplayJob(jobId, filePath, ip, patch = null) {
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
    await db.recordMatch(matchStats, '', `web:${ip}`, fileHash, patch, seasonId);

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
  } catch (err) {
    console.error(`[API] Upload job ${jobId} error:`, err);
    cleanupFile(filePath);
    setJobTerminal(jobId, {
      status: 'error',
      error: err.message,
    });
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

module.exports = { createServer };
