// Task #451 — puzzle generators + guess checking for the daily mini-games.
//
// Design notes:
//  - The *answer* never leaves the server in a daily/endless payload. For the
//    three hero games we ship the full hero roster as guess `choices` plus a
//    leak-free clue; the hero id is only revealed once the player finishes.
//  - Daily puzzles are deterministic from the AEST date so everyone gets the
//    same one, and they're cached in `game_daily_puzzles` (statline in
//    particular depends on the DB snapshot at generation time).
//  - Endless puzzles are stateless: the answer rides along inside an opaque
//    HMAC-signed token so the guess endpoint can verify without DB state.

const seed = require('./seed');
const heroData = require('./heroData');
const itemData = require('./itemData');
const voiceData = require('./voiceData');

const GAMES = ['heroguessr', 'item-zoom', 'statline', 'talent', 'voiceline', 'mystery-player'];

const GAME_META = {
  heroguessr: { title: 'Heroguessr', kind: 'hero', maxGuesses: 6, emoji: '🦸', available: true,
    blurb: 'Crack the mystery hero Dotadle-style — each guess reveals how its attributes compare.' },
  'item-zoom': { title: 'Item-zoom', kind: 'item', maxGuesses: 6, emoji: '🔍', available: true,
    blurb: 'Identify the item from an 800%-zoomed icon.' },
  statline: { title: 'Statline', kind: 'hero', maxGuesses: 6, emoji: '📊', available: true,
    blurb: 'Guess the hero from a real inhouse scoreboard line.' },
  talent: { title: 'Talent guesser', kind: 'hero', maxGuesses: 6, emoji: '🌳', available: true,
    blurb: 'Name the hero from its level-25 talent tree.' },
  voiceline: { title: 'Voiceline daily', kind: 'hero', maxGuesses: 6, emoji: '🔊', available: true,
    blurb: 'Hear a short voice line and guess the hero.' },
  'mystery-player': { title: 'Mystery Player', kind: 'player', maxGuesses: 6, emoji: '🕵️', available: true,
    blurb: 'A real inhouse scoreboard line — hero, items and stats all laid bare. Guess which inhouse player it was.' },
};

function isGame(g) {
  return Object.prototype.hasOwnProperty.call(GAME_META, g);
}

function heroChoices() {
  return heroData.rosterHeroes().map(h => ({ id: h.id, name: h.name }));
}
function itemChoices() {
  return itemData.shortlist().map(i => ({ id: i.id, name: i.name }));
}

// ── Daily answer selection (deterministic) ──────────────────────────────────
// Returns { answer, clue } for non-statline games. statline needs the DB so it
// is handled in generateStatline().
function selectDailyAnswer(game, dateStr) {
  const rng = seed.dailyRng(game, dateStr);
  if (game === 'item-zoom') {
    const item = seed.pick(itemData.shortlist(), rng);
    return { answer: { itemId: item.id, slug: item.slug, name: item.name } };
  }
  // hero games — talent guesser restricts to heroes whose talents all resolve
  // to display names so no daily puzzle shows a "Hidden talent" placeholder.
  // voiceline restricts to heroes that actually have a hosted clip on disk.
  let ids;
  if (game === 'talent') ids = heroData.talentReadyHeroIds();
  else if (game === 'voiceline') ids = voiceData.voiceReadyHeroIds();
  else ids = heroData.heroIds();
  const id = seed.pick(ids, rng);
  return { answer: { heroId: id, name: heroData.heroName(id) } };
}

// Builds the client-facing clue for a hero/item answer, given a game key.
// `tokenFor` returns an opaque image token for a CDN slug (so answer slugs
// never appear in client-readable form).
function buildClue(game, answer, tokenFor) {
  if (game === 'heroguessr') {
    // Dotadle-style: no upfront clue. The player deduces the hero purely from
    // the per-guess attribute comparison the guess endpoint returns.
    return {};
  }
  if (game === 'talent') {
    return { talents: heroData.heroTalents(answer.heroId) };
  }
  if (game === 'item-zoom') {
    return { imageToken: tokenFor('item', answer.slug), zoom: 8 };
  }
  if (game === 'voiceline') {
    const slug = voiceData.slugForHero(answer.heroId);
    return { audioToken: slug ? tokenFor('voice', slug) : null };
  }
  return {};
}

// ── Statline (needs DB) ─────────────────────────────────────────────────────
// Picks a deterministic "informative" scoreboard line for the day and scrubs
// the hero. `lines` is an array of curated candidate rows from the DB.
function generateStatline(dateStr, lines) {
  if (!Array.isArray(lines) || !lines.length) return null;
  const rng = seed.dailyRng('statline', dateStr);
  const row = seed.pick(lines, rng);
  if (!row) return null;
  return {
    answer: { heroId: row.hero_id, name: heroData.heroName(row.hero_id) },
    clue: {
      statline: {
        kills: row.kills, deaths: row.deaths, assists: row.assists,
        gpm: row.gpm, xpm: row.xpm, lastHits: row.last_hits, denies: row.denies,
        netWorth: row.net_worth, level: row.level, heroDamage: row.hero_damage,
        towerDamage: row.tower_damage, heroHealing: row.hero_healing,
        durationSec: row.duration, win: row.win,
        items: Array.isArray(row.items) ? row.items.slice(0, 6) : [],
      },
    },
  };
}

// ── Mystery Player (needs DB) ───────────────────────────────────────────────
// The inverse of Statline: the hero, item build and full scoreboard line are
// all REVEALED in the clue; the hidden answer is the inhouse *player*. `row`
// is a single candidate from db.getPlayerStatlineCandidates() with its 6-slot
// item build already attached as `row.items` (an array of {item_name,item_id}).
function buildPlayerLine(row) {
  if (!row) return null;
  return {
    answer: { accountId: Number(row.account_id), name: row.player_name },
    clue: {
      playerLine: {
        heroId: row.hero_id,
        heroName: heroData.heroName(row.hero_id),
        items: Array.isArray(row.items) ? row.items.slice(0, 6) : [],
        kills: row.kills, deaths: row.deaths, assists: row.assists,
        gpm: row.gpm, xpm: row.xpm, lastHits: row.last_hits, denies: row.denies,
        netWorth: row.net_worth, level: row.level, heroDamage: row.hero_damage,
        towerDamage: row.tower_damage, heroHealing: row.hero_healing,
        durationSec: row.duration, win: row.win,
      },
    },
  };
}

// Deterministically picks the day's Mystery Player line from a curated set of
// candidate rows (each with `items` attached). Used by the daily route.
function generatePlayerLine(dateStr, lines) {
  if (!Array.isArray(lines) || !lines.length) return null;
  const row = seed.pick(lines, seed.dailyRng('mystery-player', dateStr));
  return buildPlayerLine(row);
}

// ── Endless puzzles (stateless, token-carried answer) ───────────────────────
function generateEndless(game, tokenFor) {
  const s = (Math.random() * 1e9) | 0;
  const rng = seed.mulberry32(s);
  if (game === 'item-zoom') {
    const item = seed.pick(itemData.shortlist(), rng);
    const answer = { itemId: item.id };
    return {
      number: null,
      maxGuesses: GAME_META[game].maxGuesses,
      choices: itemChoices(),
      clue: { imageToken: tokenFor('item', item.slug), zoom: 8 },
      answerToken: seed.signToken({ g: game, m: 'endless', a: answer }),
    };
  }
  // hero games (heroguessr / talent / voiceline). statline endless needs DB and
  // is handled separately by the route.
  let pool;
  if (game === 'talent') pool = heroData.talentReadyHeroIds();
  else if (game === 'voiceline') pool = voiceData.voiceReadyHeroIds();
  else pool = heroData.heroIds();
  const id = seed.pick(pool, rng);
  const answer = { heroId: id };
  let clue;
  if (game === 'talent') {
    clue = { talents: heroData.heroTalents(id) };
  } else if (game === 'voiceline') {
    const slug = voiceData.slugForHero(id);
    clue = { audioToken: slug ? tokenFor('voice', slug) : null };
  } else {
    // heroguessr — Dotadle-style, no upfront clue.
    clue = {};
  }
  return {
    number: null,
    maxGuesses: GAME_META[game].maxGuesses,
    choices: heroChoices(),
    clue,
    answerToken: seed.signToken({ g: game, m: 'endless', a: answer }),
  };
}

// ── Guess checking ──────────────────────────────────────────────────────────
function answerKey(game) {
  const kind = GAME_META[game].kind;
  if (kind === 'item') return 'itemId';
  if (kind === 'player') return 'accountId';
  return 'heroId';
}

function isCorrect(game, answer, guessId) {
  const key = answerKey(game);
  return Number(answer[key]) === Number(guessId);
}

// Dotadle-style per-guess feedback for Heroguessr: how the guessed hero's
// attributes compare to the (hidden) answer. Returns null for other games.
function compareGuess(game, answer, guessId) {
  if (game !== 'heroguessr') return null;
  return heroData.compareHero(Number(guessId), Number(answer.heroId));
}

// Resolves the display info for a finished puzzle's answer (for the reveal).
function revealAnswer(game, answer) {
  if (GAME_META[game].kind === 'item') {
    const it = itemData.getItemById(answer.itemId);
    return { itemId: answer.itemId, name: it ? it.name : `Item #${answer.itemId}`,
      slug: it ? it.slug : null };
  }
  if (GAME_META[game].kind === 'player') {
    return { accountId: answer.accountId, name: answer.name };
  }
  return { heroId: answer.heroId, name: heroData.heroName(answer.heroId) };
}

// ── Share string ────────────────────────────────────────────────────────────
// e.g. "OCE Heroguessr #042: 🟥🟥🟩⬛⬛⬛ — 3/6"
function shareString(game, { number, guesses, won, maxGuesses }) {
  const title = GAME_META[game].title;
  const n = number != null ? ` #${String(number).padStart(3, '0')}` : '';
  const squares = [];
  for (let i = 0; i < maxGuesses; i++) {
    if (i < guesses - 1) squares.push('🟥');
    else if (i === guesses - 1 && won) squares.push('🟩');
    else if (i === guesses - 1 && !won) squares.push('🟥');
    else squares.push('⬛');
  }
  const score = won ? `${guesses}/${maxGuesses}` : `X/${maxGuesses}`;
  return `OCE ${title}${n}: ${squares.join('')} — ${score}`;
}

module.exports = {
  GAMES,
  GAME_META,
  isGame,
  heroChoices,
  itemChoices,
  selectDailyAnswer,
  buildClue,
  generateStatline,
  buildPlayerLine,
  generatePlayerLine,
  generateEndless,
  isCorrect,
  compareGuess,
  answerKey,
  revealAnswer,
  shareString,
};
