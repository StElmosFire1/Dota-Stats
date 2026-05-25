#!/usr/bin/env node
/**
 * Task #377 — back-fill the three timeline-derivable derived metrics:
 *   first_blood_chain, snowball_score, comeback_factor
 * onto every match that has a game_timeline blob but is missing these columns.
 *
 * The two replay-only metrics (throne_dpm, player_stats.item_first_times) are
 * NOT back-fillable from the timeline alone — they need a full replay re-parse
 * via the existing superuser `Re-aggregate from stored replay` button on
 * /match/:id (POST /api/admin/reparse-replay/:matchId). This script logs how
 * many matches are eligible for re-parse so we can target them.
 *
 * Usage:
 *   node scripts/backfill-derived-metrics.js [--limit=N] [--dry-run]
 */

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

async function main() {
  const db = require('../src/db');
  await db.connect();
  const pool = db.getPool();

  const sql = `
    SELECT m.match_id, m.duration, m.radiant_win, m.game_timeline,
           m.first_blood_chain IS NULL AS need_fb,
           m.snowball_score IS NULL    AS need_sb,
           m.comeback_factor IS NULL   AS need_cf,
           m.has_replay
      FROM matches m
     WHERE m.game_timeline IS NOT NULL
       AND m.is_legacy = false
       AND (m.first_blood_chain IS NULL OR m.snowball_score IS NULL OR m.comeback_factor IS NULL)
     ORDER BY m.date DESC
     ${limit ? `LIMIT ${limit}` : ''}
  `;
  const { rows } = await pool.query(sql);
  console.log(`[backfill] ${rows.length} match(es) to inspect (dry-run=${dryRun})`);

  let updated = 0;
  let skippedNoData = 0;
  let needReparse = 0;

  for (const row of rows) {
    const tl = row.game_timeline;
    if (!tl) { skippedNoData++; continue; }

    // ── First-blood chain + snowball score (from timeline.events kills) ──
    let fbChain = null;
    let snowball = null;
    const events = Array.isArray(tl.events) ? tl.events : [];
    const kills = events.filter(e => e.type === 'kill').sort((a, b) => a.t - b.t);
    if (kills.length > 0) {
      const fb = kills[0];
      const fbTeam = (fb.killerSlot != null && fb.killerSlot >= 0)
        ? (fb.killerSlot < 5 ? 'radiant' : 'dire')
        : null;
      fbChain = {
        fbTeam,
        kills: kills.slice(0, 4).map(k => ({
          t: k.t,
          killerSlot: k.killerSlot,
          killerTeam: (k.killerSlot != null && k.killerSlot >= 0) ? (k.killerSlot < 5 ? 'radiant' : 'dire') : null,
          victimSlot: k.victimSlot,
          victimTeam: (k.victimSlot != null && k.victimSlot >= 0) ? (k.victimSlot < 5 ? 'radiant' : 'dire') : null,
          bounty: k.killBounty || 0,
        })),
      };
      if (fbTeam) {
        const windowEnd = fb.t + 300;
        const windowKills = kills.filter(k => k.t >= fb.t && k.t <= windowEnd && k.killerSlot >= 0);
        if (windowKills.length > 0) {
          const teamKills = windowKills.filter(k => (k.killerSlot < 5 ? 'radiant' : 'dire') === fbTeam).length;
          snowball = Math.round((teamKills / windowKills.length) * 100);
        }
      }
    }

    // ── Comeback factor (from timeline.players[].samples) ──
    // Mirrors the parser's timestamp-union approach (`replayParser._aggregateStats`
    // walks `timelineSamples[slot][i].t` and unions tick keys) so backfill values
    // line up with values written by `recordMatch`/reparse. In practice all 10
    // slots sample on the same tick so index-alignment and timestamp-union are
    // equivalent — using timestamp-union here removes the drift concern raised
    // in code review and keeps the helper future-proof if sampling ever diverges.
    let cf = null;
    if (row.radiant_win !== null && Array.isArray(tl.players)) {
      const radiantPlayers = tl.players.filter(pl => pl.team === 'radiant');
      const direPlayers = tl.players.filter(pl => pl.team === 'dire');
      if (radiantPlayers.length && direPlayers.length) {
        const tickKeys = new Set();
        for (const pl of tl.players) for (const s of (pl.samples || [])) tickKeys.add(s.t);
        if (tickKeys.size >= 5) {
          // Per-player {t -> nw} maps so we can sum at each tick the same way
          // the parser does.
          const slotMaps = new Map();
          for (const pl of tl.players) {
            const m = {};
            for (const s of (pl.samples || [])) m[s.t] = s.nw || 0;
            slotMaps.set(pl, m);
          }
          let maxDeficit = 0;
          for (const t of tickKeys) {
            let radNw = 0, direNw = 0;
            for (const pl of radiantPlayers) radNw += slotMaps.get(pl)[t] || 0;
            for (const pl of direPlayers)    direNw += slotMaps.get(pl)[t] || 0;
            const winnerNw = row.radiant_win ? radNw : direNw;
            const loserNw  = row.radiant_win ? direNw : radNw;
            const deficit = loserNw - winnerNw;
            if (deficit > maxDeficit) maxDeficit = deficit;
          }
          cf = maxDeficit < 2000 ? 0 : Math.min(100, Math.round((maxDeficit / 20000) * 100));
        }
      }
    }

    // Only persist the fields that were NULL in this row.
    const set = [];
    const params = [];
    let i = 1;
    if (row.need_fb && fbChain) { set.push(`first_blood_chain = $${i++}`); params.push(JSON.stringify(fbChain)); }
    if (row.need_sb && snowball != null) { set.push(`snowball_score = $${i++}`); params.push(snowball); }
    if (row.need_cf && cf != null) { set.push(`comeback_factor = $${i++}`); params.push(cf); }
    if (set.length === 0) { skippedNoData++; continue; }

    params.push(row.match_id);
    if (dryRun) {
      console.log(`[backfill] would update ${row.match_id}: fb=${!!(row.need_fb && fbChain)} sb=${row.need_sb && snowball != null ? snowball : '—'} cf=${row.need_cf && cf != null ? cf : '—'}`);
    } else {
      await pool.query(`UPDATE matches SET ${set.join(', ')} WHERE match_id = $${i}`, params);
    }
    updated++;
    if (row.has_replay) needReparse++;
  }

  console.log(`[backfill] done. updated=${updated} skipped(no-data)=${skippedNoData}`);
  console.log(`[backfill] ${needReparse} of those have a stored replay and are eligible for full re-parse (gets throne_dpm + item_first_times via the superuser "Re-aggregate from stored replay" button).`);

  await pool.end();
}

main().catch(err => {
  console.error('[backfill] FAILED:', err);
  process.exit(1);
});
