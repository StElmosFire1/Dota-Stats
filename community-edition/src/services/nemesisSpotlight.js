// Task #314 — Nemesis spotlight for the post-match screen.
//
// Surfaces a single notable rivalry moment for the logged-in player at most
// once per match, only when *something interesting* happened:
//
//   • In-match nemesis killed them 3+ times (always notable)
//   • Career streak of 3+ losses to this nemesis
//   • The streak just broke (they won this match after losing 3+ in a row)
//   • Milestone encounter count (5th, 10th, 25th, 50th, 100th)
//
// Returns null when nothing notable happened — the UI should hide the panel.
// Never sends push/DM notifications: this module is read-only.
//
// "Nemesis" = the opposing-team player whose hero killed the viewer the most
// in this match (using the in-match `nemesis_hero_name` + `nemesis_kills`
// columns populated by the replay parser). If we can identify their
// account_id (matching by hero on the opposite team), we widen the lookup to
// the players' full encounter history.

async function getNemesisSpotlight(getPool, matchId, accountId) {
  if (!accountId || String(accountId) === '0') return null;
  const pool = getPool();
  const acct = parseInt(accountId);
  if (!Number.isFinite(acct) || acct <= 0) return null;

  // Pull the viewer's row + the opposing team's rows from this match.
  const playersRes = await pool.query(
    `SELECT account_id, team, hero, hero_id, hero_name, persona_name,
            nemesis_hero_name, nemesis_kills, kills, deaths
       FROM player_stats
      WHERE match_id = $1`,
    [matchId]
  ).catch(() => ({ rows: [] }));
  const players = playersRes.rows || [];
  const viewer = players.find(p => String(p.account_id) === String(accountId));
  if (!viewer) return null;

  const oppTeam = viewer.team === 'radiant' ? 'dire' : 'radiant';
  const opponents = players.filter(p => p.team === oppTeam);

  // Match-level nemesis: opponent hero who killed the viewer most.
  const nemesisHero = viewer.nemesis_hero_name || null;
  const inMatchKills = parseInt(viewer.nemesis_kills) || 0;

  // Try to attach an account to that hero so we can compute career history.
  let nemesisOpp = null;
  if (nemesisHero) {
    nemesisOpp = opponents.find(p =>
      (p.hero_name && p.hero_name === nemesisHero) ||
      (p.hero && p.hero === nemesisHero)
    ) || null;
  }

  // If we have no nemesis hero at all and no opp identified, bail. (Match
  // simply didn't have a clear repeated-killer.)
  if (!nemesisHero && !nemesisOpp) return null;

  // Career encounter history: every prior match where viewer + this opp were
  // on opposite teams, ordered most-recent-first.
  let history = [];
  if (nemesisOpp?.account_id && parseInt(nemesisOpp.account_id) > 0) {
    const oppAcct = parseInt(nemesisOpp.account_id);
    const hres = await pool.query(
      `SELECT m.match_id, m.date, m.radiant_win,
              vp.team AS viewer_team,
              op.team AS opp_team
         FROM matches m
         JOIN player_stats vp ON vp.match_id = m.match_id AND vp.account_id = $1
         JOIN player_stats op ON op.match_id = m.match_id AND op.account_id = $2
        WHERE vp.team != op.team
        ORDER BY m.date ASC`,
      [acct, oppAcct]
    ).catch(() => ({ rows: [] }));
    history = hres.rows || [];
  }

  // Tally career numbers (inclusive of this match — history already includes it
  // because the matches table will have been written by the time the post-match
  // page is viewed).
  const encounterCount = history.length;
  let viewerWins = 0;
  let viewerLosses = 0;
  for (const row of history) {
    const viewerWon = (row.viewer_team === 'radiant' && row.radiant_win)
                   || (row.viewer_team === 'dire' && !row.radiant_win);
    if (viewerWon) viewerWins++; else viewerLosses++;
  }

  // Compute the current loss-streak ending at this match. We walk backward
  // from the most recent encounter — but only when the most recent is THIS
  // match (so we're describing the streak as of right now).
  let currentLossStreak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const row = history[i];
    const viewerWon = (row.viewer_team === 'radiant' && row.radiant_win)
                   || (row.viewer_team === 'dire' && !row.radiant_win);
    if (viewerWon) break;
    currentLossStreak++;
  }
  // Streak break: viewer just won this match after losing 3+ in a row prior.
  const viewerWonThisMatch = (viewer.team === 'radiant' && playersRes.rows.find(r => r.match_id))
    ? null
    : null;
  // Determine win/loss for *this* match using viewer team + match radiant_win.
  const thisMatchRes = await pool.query('SELECT radiant_win FROM matches WHERE match_id = $1', [matchId])
    .catch(() => ({ rows: [] }));
  const radiantWin = thisMatchRes.rows[0]?.radiant_win;
  const viewerWonNow = (viewer.team === 'radiant' && radiantWin === true)
                    || (viewer.team === 'dire' && radiantWin === false);

  // Streak break: previous (pre-this-match) loss streak ≥3 and viewer won now.
  let priorLossStreak = 0;
  // Find this match's index in history — if it's not last, history may not yet
  // include it (data race). Compute streak from rows strictly before this match.
  const beforeThis = history.filter(r => String(r.match_id) !== String(matchId));
  for (let i = beforeThis.length - 1; i >= 0; i--) {
    const row = beforeThis[i];
    const viewerWon = (row.viewer_team === 'radiant' && row.radiant_win)
                   || (row.viewer_team === 'dire' && !row.radiant_win);
    if (viewerWon) break;
    priorLossStreak++;
  }

  // Decide whether anything notable happened. Order matters — first match wins.
  let kind = null;
  let headline = null;
  let detail = null;

  const oppName = nemesisOpp?.persona_name || (nemesisHero ? _prettyHero(nemesisHero) : 'them');
  const heroLabel = _prettyHero(nemesisHero || nemesisOpp?.hero_name || nemesisOpp?.hero || '') || 'their hero';

  if (inMatchKills >= 3) {
    kind = 'in_match_dominance';
    headline = `${oppName} owned you this game`;
    detail = `${heroLabel} killed you ×${inMatchKills} in this match alone.`;
  } else if (viewerWonNow && priorLossStreak >= 3) {
    kind = 'streak_broken';
    headline = `Revenge served — streak broken`;
    detail = `You'd lost ${priorLossStreak} in a row to ${oppName}. Tonight, you finally beat them.`;
  } else if (!viewerWonNow && currentLossStreak >= 3) {
    kind = 'loss_streak';
    headline = `${oppName} is your nemesis`;
    detail = `That's ${currentLossStreak} losses in a row to them. The rivalry deepens.`;
  } else if ([5, 10, 25, 50, 100].includes(encounterCount)) {
    kind = 'milestone';
    headline = `${encounterCount}th encounter with ${oppName}`;
    detail = `Career head-to-head: ${viewerWins}W–${viewerLosses}L against ${oppName}.`;
  }

  if (!kind) return null;

  return {
    kind,
    headline,
    detail,
    opponent: {
      account_id: nemesisOpp?.account_id ? String(nemesisOpp.account_id) : null,
      name: oppName,
      hero_id: nemesisOpp?.hero_id ? parseInt(nemesisOpp.hero_id) : null,
      hero_name: nemesisOpp?.hero_name || nemesisHero || null,
    },
    inMatchKills,
    careerEncounters: encounterCount,
    careerRecord: { wins: viewerWins, losses: viewerLosses },
    currentLossStreak,
    priorLossStreak,
    viewerWonThisMatch: viewerWonNow,
  };
}

function _prettyHero(internal) {
  if (!internal) return null;
  return String(internal)
    .replace(/^npc_dota_hero_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

module.exports = { getNemesisSpotlight };
