#!/usr/bin/env node
/**
 * One-off cleanup for the community Discord patch-notes channel.
 *
 * Background (May 2026): the production PM2 process for the community edition
 * was accidentally registered against /root/Dota-Stats/src/index.js (the FULL
 * edition's entrypoint) instead of community-edition/src/index.js. While it
 * ran in that misconfigured state, the full-edition Discord bot pointed at the
 * community DB seeded ~263 full-edition patch notes (v0.8 through v7.x) into
 * the community patch_notes table and then announced them in the community
 * Discord channel as "Bot Update — vX.Y | ...".
 *
 * The DB pollution has been cleaned (see SQL in replit.md); this script cleans
 * the Discord side. It connects with the community DISCORD_TOKEN, walks the
 * configured PATCH_CHANNEL_IDS / ANNOUNCE_CHANNEL_ID, and deletes any of the
 * bot's own patch-note embed posts whose version is NOT in the legitimate
 * community keep-list ('0.1'..'0.7', '1.1', '1.2', '1.3', ...).
 *
 * Run with:
 *   cd ~/Dota-Stats && set -a && source .env && set +a
 *   node community-edition/scripts/purge-leaked-patch-posts.js --dry-run
 *   # then, if the dry-run output looks right:
 *   node community-edition/scripts/purge-leaked-patch-posts.js
 *
 * Flags:
 *   --dry-run   list what would be deleted without touching Discord.
 *   --keep=X.Y  comma-separated extra versions to keep beyond the defaults.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { Client, GatewayIntentBits, Partials } = require('discord.js');

const DEFAULT_KEEP = new Set([
  '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7',
  '1.1', '1.2', '1.3',
]);

const DRY_RUN = process.argv.includes('--dry-run');
const extraKeep = process.argv
  .find(a => a.startsWith('--keep='))
  ?.slice('--keep='.length)
  .split(',')
  .map(v => v.trim())
  .filter(Boolean) || [];
const KEEP = new Set([...DEFAULT_KEEP, ...extraKeep]);

// Title format from community-edition/src/discord/bot.js _announceNewPatchNotes:
//   "📋 Bot Update — v${note.version} | ${note.title}"
// (📋 = U+1F4CB, — = U+2014)
const TITLE_REGEX = /^\uD83D\uDCCB\s+Bot Update\s+\u2014\s+v(\d+(?:\.\d+)+)\s+\|/;

function getPatchChannelIds() {
  const ids = [];
  const patch = process.env.PATCH_CHANNEL_IDS;
  if (patch) ids.push(...patch.split(',').map(s => s.trim()).filter(Boolean));
  const announce = process.env.ANNOUNCE_CHANNEL_ID;
  if (announce && !ids.includes(announce)) ids.push(announce);
  return ids;
}

async function purgeChannel(channel, botUserId) {
  console.log(`\n=== Channel #${channel.name} (${channel.id}) ===`);
  let cursor;
  let scanned = 0;
  const toDelete = [];

  // Fetch in pages of 100 going backwards until we run out.
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(cursor ? { before: cursor } : {}) });
    if (batch.size === 0) break;
    cursor = batch.last().id;
    scanned += batch.size;

    for (const msg of batch.values()) {
      if (msg.author.id !== botUserId) continue;
      const embed = msg.embeds?.[0];
      const title = embed?.title || embed?.data?.title;
      if (!title) continue;
      const m = title.match(TITLE_REGEX);
      if (!m) continue;
      const version = m[1];
      if (KEEP.has(version)) {
        console.log(`  KEEP  v${version}  — ${msg.id} (${title.slice(0, 80)})`);
      } else {
        console.log(`  DEL   v${version}  — ${msg.id} (${title.slice(0, 80)})`);
        toDelete.push(msg);
      }
    }

    if (batch.size < 100) break;
  }

  console.log(`Scanned ${scanned} message(s). ${toDelete.length} marked for deletion.`);
  if (DRY_RUN || toDelete.length === 0) return { scanned, deleted: 0, marked: toDelete.length };

  // Split: < 14 days → bulkDelete in chunks of 100; >= 14 days → single delete.
  const fortnightAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const fresh = toDelete.filter(m => m.createdTimestamp >= fortnightAgo);
  const stale = toDelete.filter(m => m.createdTimestamp < fortnightAgo);

  let deleted = 0;
  for (let i = 0; i < fresh.length; i += 100) {
    const chunk = fresh.slice(i, i + 100);
    try {
      const res = await channel.bulkDelete(chunk, true);
      deleted += res.size;
      console.log(`  bulkDelete: removed ${res.size}/${chunk.length}`);
    } catch (err) {
      console.error(`  bulkDelete failed:`, err.message);
    }
  }
  for (const msg of stale) {
    try {
      await msg.delete();
      deleted++;
    } catch (err) {
      console.error(`  delete ${msg.id} failed:`, err.message);
    }
  }
  console.log(`Deleted ${deleted} message(s) from #${channel.name}.`);
  return { scanned, deleted, marked: toDelete.length };
}

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('DISCORD_TOKEN not set. Run with: set -a && source .env && set +a && node ...');
    process.exit(1);
  }
  const channelIds = getPatchChannelIds();
  if (channelIds.length === 0) {
    console.error('No patch channels configured (PATCH_CHANNEL_IDS / ANNOUNCE_CHANNEL_ID both empty).');
    process.exit(1);
  }
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (nothing will be deleted)' : 'LIVE (will delete)'}`);
  console.log(`Keep-list (versions to KEEP): ${[...KEEP].sort().join(', ')}`);
  console.log(`Channels to scan: ${channelIds.join(', ')}`);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    partials: [Partials.Message, Partials.Channel],
  });

  await client.login(token);
  await new Promise(resolve => client.once('clientReady', resolve));
  console.log(`Logged in as ${client.user.tag} (id ${client.user.id})`);

  const totals = { scanned: 0, deleted: 0, marked: 0 };
  for (const id of channelIds) {
    let channel;
    try { channel = await client.channels.fetch(id); }
    catch (err) { console.error(`Could not fetch channel ${id}: ${err.message}`); continue; }
    if (!channel?.isTextBased?.()) { console.error(`Channel ${id} is not text-based, skipping.`); continue; }
    const r = await purgeChannel(channel, client.user.id);
    totals.scanned += r.scanned; totals.deleted += r.deleted; totals.marked += r.marked;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Channels processed: ${channelIds.length}`);
  console.log(`Total messages scanned: ${totals.scanned}`);
  console.log(`Total marked: ${totals.marked}`);
  console.log(`Total deleted: ${totals.deleted}`);
  if (DRY_RUN) console.log('Dry run — re-run without --dry-run to actually delete.');

  await client.destroy();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
