#!/usr/bin/env node
/**
 * sync-community-nicknames.js
 *
 * Pulls every nickname + Discord ID link (and Dota rank columns when present)
 * from the **community-edition** database into the **full-edition** database,
 * upserting on `account_id`.
 *
 * Conservative by default: existing rows in the full DB are NOT overwritten
 * unless `overwrite` is passed. Pass `dryRun` to preview without writing.
 *
 * Two ways to run it:
 *
 * 1. CLI on the prod host:
 *    COMMUNITY_DATABASE_URL=postgres://… \
 *    FULL_DATABASE_URL=postgres://…       \
 *    node scripts/sync-community-nicknames.js [--overwrite] [--dry-run]
 *
 * 2. From the running app (admin endpoint or unit test):
 *    const { runSync } = require('./scripts/sync-community-nicknames');
 *    await runSync({ sourceUrl, destPool, overwrite, dryRun, log });
 *
 * What gets copied:
 *   - nicknames.account_id, nickname, discord_id (if column exists on both)
 *   - nicknames.dota_rank_tier, dota_leaderboard_rank,
 *     dota_rank_source, dota_rank_updated_at (when present on both)
 *   - For every imported account_id with a discord_id, also upsert into
 *     `players(discord_id, discord_name, steam_id_64, account_id_32)` so the
 *     bot's Discord-side lookups (!register, role mapping, etc.) work too.
 *
 * Safe to re-run.
 */
'use strict';

const { Pool } = require('pg');

async function columnExists(pool, table, column) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column]
  );
  return r.rowCount > 0;
}

/**
 * Run the sync. Either pass `sourceUrl` (a Pool will be constructed and
 * disposed) or pass `sourcePool` directly. Same for destination via
 * `destUrl` / `destPool`. Returns a tally object.
 */
async function runSync({
  sourceUrl,
  sourcePool,
  destUrl,
  destPool,
  overwrite = false,
  dryRun = false,
  log = () => {},
} = {}) {
  let ownSrc = false;
  let ownDst = false;
  let src = sourcePool;
  let dst = destPool;
  if (!src) {
    if (!sourceUrl) throw new Error('runSync: sourceUrl or sourcePool is required');
    src = new Pool({ connectionString: sourceUrl, max: 4 });
    ownSrc = true;
  }
  if (!dst) {
    if (!destUrl) throw new Error('runSync: destUrl or destPool is required');
    dst = new Pool({ connectionString: destUrl, max: 4 });
    ownDst = true;
  }

  try {
    log(`[sync] mode: ${overwrite ? 'OVERWRITE existing values' : 'fill-empty only'}${dryRun ? ' (DRY RUN)' : ''}`);

    for (const [label, pool] of [['community', src], ['full', dst]]) {
      const r = await pool.query(`SELECT to_regclass('public.nicknames') AS t`);
      if (!r.rows[0].t) {
        throw new Error(`${label} DB has no public.nicknames table`);
      }
    }

    const srcHasDiscord = await columnExists(src, 'nicknames', 'discord_id');
    const dstHasDiscord = await columnExists(dst, 'nicknames', 'discord_id');
    const copyDiscord = srcHasDiscord && dstHasDiscord;

    const srcHasRank = await columnExists(src, 'nicknames', 'dota_rank_tier');
    const dstHasRank = await columnExists(dst, 'nicknames', 'dota_rank_tier');
    const copyRank = srcHasRank && dstHasRank;

    const dstHasPlayers = (await dst.query(`SELECT to_regclass('public.players') AS t`)).rows[0].t;

    const cols = ['account_id', 'nickname'];
    if (copyDiscord) cols.push('discord_id');
    if (copyRank) cols.push('dota_rank_tier', 'dota_leaderboard_rank', 'dota_rank_source', 'dota_rank_updated_at');

    log(`[sync] columns being mirrored: ${cols.join(', ')}`);
    log(`[sync] also upserting to players table on full DB: ${dstHasPlayers ? 'yes' : 'no (table missing)'}`);

    const { rows: communityRows } = await src.query(
      `SELECT ${cols.join(', ')} FROM nicknames ORDER BY account_id ASC`
    );
    log(`[sync] community has ${communityRows.length} nickname rows.`);

    let inserted = 0, updated = 0, skipped = 0, playerLinked = 0;

    for (const row of communityRows) {
      const acct = String(row.account_id);
      const existing = await dst.query(
        `SELECT ${cols.join(', ')} FROM nicknames WHERE account_id = $1`,
        [acct]
      );
      const have = existing.rows[0] || null;

      const apply = {};
      for (const c of cols) {
        if (c === 'account_id') continue;
        const srcVal = row[c];
        if (srcVal === null || srcVal === undefined || srcVal === '') continue;
        if (!have) { apply[c] = srcVal; continue; }
        const dstVal = have[c];
        const dstEmpty = dstVal === null || dstVal === undefined || dstVal === '';
        if (overwrite || dstEmpty) apply[c] = srcVal;
      }

      const action = !have ? 'INSERT' : (Object.keys(apply).length ? 'UPDATE' : 'SKIP');
      const summary = action === 'SKIP'
        ? `${acct.padEnd(12)} SKIP   (no changes)`
        : `${acct.padEnd(12)} ${action.padEnd(6)} → ${Object.entries(apply).map(([k,v]) => `${k}=${String(v).slice(0,40)}`).join(', ')}`;
      log('  ' + summary);

      if (dryRun) {
        if (action === 'INSERT') inserted++;
        else if (action === 'UPDATE') updated++;
        else skipped++;
        continue;
      }

      if (action === 'INSERT') {
        const insertCols = ['account_id', ...Object.keys(apply)];
        const vals = [acct, ...Object.values(apply)];
        const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(', ');
        await dst.query(
          `INSERT INTO nicknames (${insertCols.join(', ')}, updated_at) VALUES (${placeholders}, NOW())`,
          vals
        );
        inserted++;
      } else if (action === 'UPDATE') {
        const setClause = Object.keys(apply).map((k, i) => `${k} = $${i + 2}`).join(', ');
        await dst.query(
          `UPDATE nicknames SET ${setClause}, updated_at = NOW() WHERE account_id = $1`,
          [acct, ...Object.values(apply)]
        );
        updated++;
      } else {
        skipped++;
      }

      if (dstHasPlayers && copyDiscord && row.discord_id) {
        const steamId64 = (BigInt(acct) + 76561197960265728n).toString();
        const r = await dst.query(`SELECT 1 FROM players WHERE discord_id = $1 LIMIT 1`, [row.discord_id]);
        if (r.rowCount === 0) {
          await dst.query(
            `INSERT INTO players (discord_id, discord_name, steam_id_64, account_id_32, registered_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [row.discord_id, row.nickname || '', steamId64, acct]
          );
          playerLinked++;
        }
      }
    }

    const summary = { inserted, updated, skipped, playerLinked, total: communityRows.length, dryRun };
    log(`\n[sync] done. inserted=${inserted}  updated=${updated}  skipped=${skipped}  players-linked=${playerLinked}${dryRun ? '  (DRY RUN — nothing was written)' : ''}`);
    return summary;
  } finally {
    if (ownSrc) await src.end().catch(() => {});
    if (ownDst) await dst.end().catch(() => {});
  }
}

module.exports = { runSync };

// CLI entry — only when run directly, not when require()'d.
if (require.main === module) {
  const ARGS = new Set(process.argv.slice(2));
  const COMMUNITY_URL = process.env.COMMUNITY_DATABASE_URL;
  const FULL_URL = process.env.FULL_DATABASE_URL;
  if (!COMMUNITY_URL || !FULL_URL) {
    console.error('FATAL: both COMMUNITY_DATABASE_URL and FULL_DATABASE_URL must be set.');
    console.error('       Example: COMMUNITY_DATABASE_URL=postgres://… FULL_DATABASE_URL=postgres://… \\');
    console.error('                node scripts/sync-community-nicknames.js');
    process.exit(2);
  }
  if (COMMUNITY_URL === FULL_URL) {
    console.error('FATAL: COMMUNITY_DATABASE_URL and FULL_DATABASE_URL are identical. Refusing to run.');
    process.exit(2);
  }
  runSync({
    sourceUrl: COMMUNITY_URL,
    destUrl: FULL_URL,
    overwrite: ARGS.has('--overwrite'),
    dryRun: ARGS.has('--dry-run'),
    log: (m) => console.log(m),
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[sync] FATAL:', err.message);
      console.error(err.stack);
      process.exit(1);
    });
}
