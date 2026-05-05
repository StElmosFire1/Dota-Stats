#!/usr/bin/env node
/**
 * sync-community-nicknames.js
 *
 * One-off (or repeatable) data migration. Pulls every nickname + Discord ID
 * link from the **community-edition** database into the **full-edition**
 * database, upserting on `account_id`.
 *
 * Conservative by default: existing rows in the full DB are NOT overwritten.
 * The script only fills columns that are NULL/empty on the destination side.
 * Pass `--overwrite` to force-update even where the target already has a value.
 *
 * Usage on the prod host:
 *   COMMUNITY_DATABASE_URL=postgres://… \
 *   FULL_DATABASE_URL=postgres://… \
 *   node scripts/sync-community-nicknames.js [--overwrite] [--dry-run]
 *
 * What gets copied:
 *   - `nicknames.account_id` → `nicknames.account_id`
 *   - `nicknames.nickname`   → `nicknames.nickname`
 *   - `nicknames.discord_id` → `nicknames.discord_id` (if column exists on both sides)
 *   - `nicknames.dota_rank_tier`, `dota_leaderboard_rank`,
 *     `dota_rank_source`, `dota_rank_updated_at` (when present on both)
 *   - For every imported account_id with a discord_id, also upsert into
 *     `players(discord_id, discord_name, steam_id_64, account_id_32)` so the
 *     bot's Discord-side lookups (!register, role mapping, etc.) work too.
 *
 * The script writes a one-line summary per account to stdout and a final
 * tally. Safe to re-run.
 */
'use strict';

const { Pool } = require('pg');

const ARGS = new Set(process.argv.slice(2));
const OVERWRITE = ARGS.has('--overwrite');
const DRY = ARGS.has('--dry-run');

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

const src = new Pool({ connectionString: COMMUNITY_URL, max: 4 });
const dst = new Pool({ connectionString: FULL_URL, max: 4 });

async function columnExists(pool, table, column) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column]
  );
  return r.rowCount > 0;
}

(async () => {
  try {
    console.log(`[sync] mode: ${OVERWRITE ? 'OVERWRITE existing values' : 'fill-empty only'}${DRY ? ' (DRY RUN)' : ''}`);

    // Sanity-check that nicknames table exists on both sides.
    for (const [label, pool] of [['community', src], ['full', dst]]) {
      const r = await pool.query(`SELECT to_regclass('public.nicknames') AS t`);
      if (!r.rows[0].t) {
        console.error(`FATAL: ${label} DB has no public.nicknames table.`);
        process.exit(3);
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

    console.log(`[sync] columns being mirrored: ${cols.join(', ')}`);
    console.log(`[sync] also upserting to players table on full DB: ${dstHasPlayers ? 'yes' : 'no (table missing)'}`);

    const { rows: communityRows } = await src.query(
      `SELECT ${cols.join(', ')} FROM nicknames ORDER BY account_id ASC`
    );
    console.log(`[sync] community has ${communityRows.length} nickname rows.`);

    let inserted = 0, updated = 0, skipped = 0, playerLinked = 0;

    for (const row of communityRows) {
      const acct = String(row.account_id);
      const existing = await dst.query(
        `SELECT ${cols.join(', ')} FROM nicknames WHERE account_id = $1`,
        [acct]
      );
      const have = existing.rows[0] || null;

      // Build the column → value map we want to apply.
      const apply = {};
      for (const c of cols) {
        if (c === 'account_id') continue;
        const srcVal = row[c];
        if (srcVal === null || srcVal === undefined || srcVal === '') continue;
        if (!have) { apply[c] = srcVal; continue; }
        const dstVal = have[c];
        const dstEmpty = dstVal === null || dstVal === undefined || dstVal === '';
        if (OVERWRITE || dstEmpty) apply[c] = srcVal;
      }

      const action = !have ? 'INSERT' : (Object.keys(apply).length ? 'UPDATE' : 'SKIP');
      const summary = action === 'SKIP'
        ? `${acct.padEnd(12)} SKIP   (no changes)`
        : `${acct.padEnd(12)} ${action.padEnd(6)} → ${Object.entries(apply).map(([k,v]) => `${k}=${String(v).slice(0,40)}`).join(', ')}`;
      console.log('  ' + summary);

      if (DRY) {
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

      // Also upsert into the players table if the source row has a discord_id
      // and the destination has a players table — otherwise the bot's
      // Discord-side lookups won't find this user.
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

    console.log(`\n[sync] done. inserted=${inserted}  updated=${updated}  skipped=${skipped}  players-linked=${playerLinked}${DRY ? '  (DRY RUN — nothing was written)' : ''}`);
  } catch (err) {
    console.error('[sync] FATAL:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await src.end().catch(() => {});
    await dst.end().catch(() => {});
  }
})();
