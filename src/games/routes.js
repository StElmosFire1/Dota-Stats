// Task #451 — Daily Dota mini-games suite API routes (full edition only).
//
// Mounted from createApiRouter() via mountGamesRoutes({ router, express, db }).
// Everything that could reveal a daily answer (CDN image slugs, hidden hero/item
// ids) is either proxied behind an HMAC token or kept server-side until the
// player finishes. Daily puzzles are cached in `game_daily_puzzles`; endless
// puzzles are stateless (answer rides inside a signed token).

const seed = require('./seed');
const puzzles = require('./puzzles');
const heroData = require('./heroData');
const itemData = require('./itemData');

// Best-effort XP hookup to the quests system (Task #440). That task isn't
// merged yet, so this stays a no-op unless the helper appears later.
async function awardGameXp(db, accountId, game, won) {
  try {
    if (db && typeof db.awardQuestXp === 'function') {
      await db.awardQuestXp(accountId, `game:${game}`, won ? 25 : 5);
    }
  } catch (_) { /* quests optional — never block a result */ }
}

// Resolves a "tokenFor(kind, slug)" closure that mints opaque image tokens so
// the client never sees the answer's CDN slug.
function makeTokenFor() {
  return (kind, slug) => seed.signToken({ k: kind, s: slug });
}

// Builds (or reads from cache) the full daily puzzle row for a game + date.
async function ensureDailyPuzzle(db, game, dateStr) {
  let row = await db.getDailyPuzzleRow(game, dateStr);
  if (row) return row;

  const tokenFor = makeTokenFor();
  const number = seed.puzzleNumber(dateStr);
  let answer;
  let clue;

  if (game === 'statline') {
    let candidates = [];
    try { candidates = await db.getStatlineCandidates(400); } catch (_) { candidates = []; }
    const gen = puzzles.generateStatline(dateStr, candidates);
    if (!gen) return null; // no inhouse data yet — caller handles gracefully
    answer = gen.answer;
    clue = gen.clue;
  } else {
    const sel = puzzles.selectDailyAnswer(game, dateStr);
    answer = sel.answer;
    clue = puzzles.buildClue(game, answer, tokenFor);
  }

  const choices = puzzles.GAME_META[game].kind === 'item'
    ? puzzles.itemChoices()
    : puzzles.heroChoices();

  const payload = {
    number,
    maxGuesses: puzzles.GAME_META[game].maxGuesses,
    clue,
    choices,
  };
  row = await db.upsertDailyPuzzle(game, dateStr, number, payload, answer);
  return row;
}

function mountGamesRoutes({ router, express, db }) {
  const jsonParser = express.json();

  function accountId(req) {
    return req.session && req.session.accountId ? String(req.session.accountId) : null;
  }

  // ── Hub: list games + per-player status/streaks ─────────────────────────
  router.get('/games', async (req, res) => {
    try {
      const today = seed.sydneyDateStr();
      const acct = accountId(req);
      let statsByGame = {};
      let streakByGame = {};
      if (acct) {
        try {
          const stats = await db.getGameStats(acct);
          for (const s of stats) statsByGame[s.game] = s;
          for (const g of puzzles.GAMES) {
            if (!puzzles.GAME_META[g].available) continue;
            try { streakByGame[g] = await db.getGameStreak(acct, g); } catch (_) {}
          }
        } catch (_) {}
      }
      const games = puzzles.GAMES.map(g => {
        const meta = puzzles.GAME_META[g];
        const st = statsByGame[g] || null;
        return {
          key: g,
          title: meta.title,
          emoji: meta.emoji,
          blurb: meta.blurb,
          available: meta.available,
          maxGuesses: meta.maxGuesses,
          streak: streakByGame[g] || { current: 0, best: 0 },
          dailyPlayed: st ? st.daily_played : 0,
          dailyWon: st ? st.daily_won : 0,
          avgGuesses: st ? st.avg_guesses : null,
        };
      });
      res.json({ date: today, signedIn: !!acct, games });
    } catch (e) {
      console.error('[games] hub:', e.message);
      res.status(500).json({ error: 'Failed to load games hub' });
    }
  });

  // ── Image proxy (HMAC-token) ────────────────────────────────────────────
  // Streams a Steam CDN icon for a token minted server-side. Keeps answer
  // slugs out of client-readable URLs for item-zoom + heroguessr abilities.
  const _imgCache = new Map();
  router.get('/games/image', async (req, res) => {
    try {
      const data = seed.verifyToken(String(req.query.t || ''));
      if (!data || !data.k || !data.s) return res.status(400).send('Bad token');
      let url;
      if (data.k === 'item') url = itemData.itemImgUrl(data.s);
      else if (data.k === 'ability') url = heroData.abilityImgUrl(data.s);
      else if (data.k === 'hero') url = heroData.heroImgUrl(data.s);
      else return res.status(400).send('Bad kind');

      const cacheKey = `${data.k}:${data.s}`;
      if (_imgCache.has(cacheKey)) {
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'private, max-age=3600');
        return res.send(_imgCache.get(cacheKey));
      }
      const fetch = require('node-fetch');
      const r = await fetch(url, { timeout: 8000 });
      if (!r.ok) return res.status(404).send('Image unavailable');
      const buf = await r.buffer();
      if (_imgCache.size < 500) _imgCache.set(cacheKey, buf);
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'private, max-age=3600');
      res.send(buf);
    } catch (e) {
      res.status(404).send('Image unavailable');
    }
  });

  // ── Daily puzzle ────────────────────────────────────────────────────────
  router.get('/games/:game/daily', async (req, res) => {
    const game = req.params.game;
    if (!puzzles.isGame(game)) return res.status(404).json({ error: 'Unknown game' });
    const meta = puzzles.GAME_META[game];
    if (!meta.available) {
      return res.json({ game, available: false, title: meta.title, blurb: meta.blurb });
    }
    try {
      const date = seed.sydneyDateStr();
      const row = await ensureDailyPuzzle(db, game, date);
      if (!row) {
        return res.json({ game, available: true, notReady: true,
          message: 'No puzzle available yet — check back soon.' });
      }
      const acct = accountId(req);
      let result = null;
      if (acct) {
        try { result = await db.getGameDailyResult(acct, game, date); } catch (_) {}
      }
      const payload = row.payload || {};
      const out = {
        game,
        available: true,
        mode: 'daily',
        date,
        number: row.number,
        maxGuesses: payload.maxGuesses,
        clue: payload.clue,
        choices: payload.choices,
      };
      // If the player already finished today, reveal the answer + their result.
      if (result) {
        out.finished = true;
        out.won = result.won;
        out.guesses = result.guesses;
        out.answer = puzzles.revealAnswer(game, row.answer);
        out.share = puzzles.shareString(game, {
          number: row.number, guesses: result.guesses, won: result.won,
          maxGuesses: payload.maxGuesses,
        });
      }
      res.json(out);
    } catch (e) {
      console.error('[games] daily:', e.message);
      res.status(500).json({ error: 'Failed to load daily puzzle' });
    }
  });

  // ── Endless puzzle (stateless) ──────────────────────────────────────────
  router.get('/games/:game/endless', async (req, res) => {
    const game = req.params.game;
    if (!puzzles.isGame(game)) return res.status(404).json({ error: 'Unknown game' });
    const meta = puzzles.GAME_META[game];
    if (!meta.available) return res.status(400).json({ error: 'Game not available' });
    try {
      const tokenFor = makeTokenFor();
      if (game === 'statline') {
        // Endless statline reuses the candidate pool with a random pick.
        let candidates = [];
        try { candidates = await db.getStatlineCandidates(400); } catch (_) {}
        if (!candidates.length) return res.json({ notReady: true, message: 'No inhouse data yet.' });
        const row = candidates[Math.floor(Math.random() * candidates.length)];
        const answer = { heroId: row.hero_id };
        const gen = puzzles.generateStatline(seed.sydneyDateStr(), [row]);
        return res.json({
          game, mode: 'endless', number: null, maxGuesses: meta.maxGuesses,
          choices: puzzles.heroChoices(), clue: gen.clue,
          answerToken: seed.signToken({ g: game, m: 'endless', a: answer }),
        });
      }
      const out = puzzles.generateEndless(game, tokenFor);
      res.json({ game, mode: 'endless', ...out });
    } catch (e) {
      console.error('[games] endless:', e.message);
      res.status(500).json({ error: 'Failed to load endless puzzle' });
    }
  });

  // ── Guess submission ────────────────────────────────────────────────────
  // Body: { mode, guessId, guesses, finished, won, answerToken? }
  // Daily mode verifies against the cached answer and records the result on the
  // terminal guess. Endless verifies against the signed answerToken (no record
  // except optional stats). The response includes correctness + (on finish) the
  // revealed answer + share string.
  router.post('/games/:game/guess', jsonParser, async (req, res) => {
    const game = req.params.game;
    if (!puzzles.isGame(game)) return res.status(404).json({ error: 'Unknown game' });
    const meta = puzzles.GAME_META[game];
    if (!meta.available) return res.status(400).json({ error: 'Game not available' });
    try {
      const { mode = 'daily', guessId, guesses, finished, won, answerToken } = req.body || {};
      const gid = Number(guessId);
      if (!Number.isFinite(gid)) return res.status(400).json({ error: 'guessId required' });

      let answer;
      let number = null;
      let maxGuesses = meta.maxGuesses;
      const date = seed.sydneyDateStr();

      if (mode === 'endless') {
        const tok = seed.verifyToken(String(answerToken || ''));
        if (!tok || tok.g !== game || tok.m !== 'endless') {
          return res.status(400).json({ error: 'Invalid puzzle token' });
        }
        answer = tok.a;
      } else {
        const row = await ensureDailyPuzzle(db, game, date);
        if (!row) return res.status(400).json({ error: 'Puzzle not ready' });
        answer = row.answer;
        number = row.number;
        maxGuesses = (row.payload && row.payload.maxGuesses) || meta.maxGuesses;
      }

      const correct = puzzles.isCorrect(game, answer, gid);
      const out = { correct };

      if (finished) {
        const finalGuesses = Math.max(1, Math.min(maxGuesses, Number(guesses) || 1));
        const didWin = !!won;
        out.answer = puzzles.revealAnswer(game, answer);
        out.share = puzzles.shareString(game, {
          number, guesses: finalGuesses, won: didWin, maxGuesses,
        });
        const acct = accountId(req);
        if (acct) {
          try {
            const recorded = await db.recordGameResult({
              accountId: acct, game, mode,
              dateStr: mode === 'daily' ? date : null,
              guesses: finalGuesses, won: didWin,
            });
            out.recorded = recorded;
            if (recorded) await awardGameXp(db, acct, game, didWin);
          } catch (e) {
            out.recorded = false;
          }
        }
      }
      res.json(out);
    } catch (e) {
      console.error('[games] guess:', e.message);
      res.status(500).json({ error: 'Failed to submit guess' });
    }
  });

  // ── Leaderboard ─────────────────────────────────────────────────────────
  router.get('/games/:game/leaderboard', async (req, res) => {
    const game = req.params.game;
    if (!puzzles.isGame(game)) return res.status(404).json({ error: 'Unknown game' });
    try {
      const date = seed.sydneyDateStr();
      const lb = await db.getGameLeaderboard(game, date, 25);
      res.json({ game, date, ...lb });
    } catch (e) {
      console.error('[games] leaderboard:', e.message);
      res.status(500).json({ error: 'Failed to load leaderboard' });
    }
  });
}

// Pre-generates today's + tomorrow's daily puzzles for all available games.
// Deterministic, so running it repeatedly (hourly cron) is idempotent.
async function pregenerateDailyPuzzles(db) {
  const dates = [seed.sydneyDateStr(), seed.sydneyTomorrowStr()];
  let made = 0;
  for (const date of dates) {
    for (const game of puzzles.GAMES) {
      if (!puzzles.GAME_META[game].available) continue;
      try {
        const existing = await db.getDailyPuzzleRow(game, date);
        if (existing) continue;
        const row = await ensureDailyPuzzle(db, game, date);
        if (row) made += 1;
      } catch (e) {
        console.warn(`[games] pregen ${game} ${date} failed:`, e.message);
      }
    }
  }
  return made;
}

module.exports = { mountGamesRoutes, pregenerateDailyPuzzles, ensureDailyPuzzle };
