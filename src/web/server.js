const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const db = require('../db');
const { getReplayParser } = require('../replay/replayParser');
const { getStatsService } = require('../stats/statsService');

const upload = multer({
  dest: '/tmp/replay-uploads/',
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.dem') || file.originalname.endsWith('.dem.bz2')) {
      cb(null, true);
    } else {
      cb(new Error('Only .dem replay files are accepted'));
    }
  },
});

function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api', createApiRouter());

  const staticPath = path.join(__dirname, '../../web/dist');
  if (fs.existsSync(staticPath)) {
    app.use(express.static(staticPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  }

  return app;
}

function createApiRouter() {
  const router = express.Router();

  router.get('/matches', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const offset = parseInt(req.query.offset) || 0;
      const matches = await db.getMatches(limit, offset);
      const total = await db.getMatchCount();
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
      res.json(match);
    } catch (err) {
      console.error('[API] Error fetching match:', err.message);
      res.status(500).json({ error: 'Failed to fetch match' });
    }
  });

  router.get('/leaderboard', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const leaderboard = await db.getLeaderboard(limit);
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

  router.post('/upload', upload.single('replay'), async (req, res) => {
    const uploadKey = process.env.UPLOAD_KEY;
    if (!uploadKey) {
      return res.status(503).json({ error: 'Upload not configured. Set UPLOAD_KEY secret.' });
    }

    const providedKey = req.headers['x-upload-key'] || req.body?.uploadKey;
    if (providedKey !== uploadKey) {
      return res.status(403).json({ error: 'Invalid upload key' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No replay file provided' });
    }

    const filePath = req.file.path;
    try {
      const replayParser = getReplayParser();
      const matchStats = await replayParser.parseReplay(filePath);

      if (!matchStats || !matchStats.players || matchStats.players.length === 0) {
        replayParser.cleanup(filePath);
        return res.status(422).json({ error: 'Failed to parse replay - no player data found' });
      }

      const existing = await db.isMatchRecorded(matchStats.matchId);
      if (existing) {
        replayParser.cleanup(filePath);
        return res.status(409).json({ error: `Match ${matchStats.matchId} already recorded` });
      }

      await db.recordMatch(matchStats, '', `web:${req.ip}`);

      const statsService = getStatsService();
      const radiantPlayers = matchStats.players.filter(p => p.team === 'radiant');
      const direPlayers = matchStats.players.filter(p => p.team === 'dire');

      for (const player of matchStats.players) {
        const won = (player.team === 'radiant' && matchStats.radiantWin) ||
                    (player.team === 'dire' && !matchStats.radiantWin);
        const playerId = player.accountId ? player.accountId.toString() : `anon_${player.personaname}`;

        const teamPlayers = player.team === 'radiant' ? radiantPlayers : direPlayers;
        const opponentPlayers = player.team === 'radiant' ? direPlayers : radiantPlayers;

        const result = statsService.updateRating(
          playerId,
          teamPlayers.map(p => p.accountId ? p.accountId.toString() : `anon_${p.personaname}`),
          opponentPlayers.map(p => p.accountId ? p.accountId.toString() : `anon_${p.personaname}`),
          won
        );

        await db.updateRating(
          playerId,
          player.discordId || '',
          player.personaname,
          result.mu,
          result.sigma,
          result.mmr,
          won
        );
      }

      replayParser.cleanup(filePath);
      res.json({
        matchId: matchStats.matchId,
        duration: matchStats.duration,
        radiantWin: matchStats.radiantWin,
        players: matchStats.players.length,
        parseMethod: matchStats.parseMethod,
      });
    } catch (err) {
      console.error('[API] Upload error:', err);
      try { getReplayParser().cleanup(filePath); } catch {}
      res.status(500).json({ error: 'Failed to process replay: ' + err.message });
    }
  });

  router.get('/stats', async (req, res) => {
    try {
      const matchCount = await db.getMatchCount();
      const leaderboard = await db.getLeaderboard(1);
      res.json({
        totalMatches: matchCount,
        totalPlayers: leaderboard.length > 0 ? (await db.getLeaderboard(1000)).length : 0,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  return router;
}

module.exports = { createServer };
