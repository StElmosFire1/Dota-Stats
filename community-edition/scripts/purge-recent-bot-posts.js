#!/usr/bin/env node
/**
 * One-off: delete every message the bot itself posted in a single channel
 * over the past N hours. Broader than purge-leaked-patch-posts.js — no
 * title / embed filter, just "anything the bot wrote in this window".
 *
 * Usage:
 *   cd ~/Dota-Stats && set -a && source .env && set +a
 *   node community-edition/scripts/purge-recent-bot-posts.js \
 *     --channel=1380084621676646453 --hours=2 --dry-run
 *   # then for real:
 *   node community-edition/scripts/purge-recent-bot-posts.js \
 *     --channel=1380084621676646453 --hours=2
 *
 * Flags:
 *   --channel=<id>   (required) Discord channel ID to clean.
 *   --hours=<n>      (default 2) age window — messages younger than this
 *                    posted by the bot are eligible for deletion.
 *   --dry-run        list what would be deleted, but don't touch Discord.
 *
 * Discord's bulkDelete only works on messages younger than 14 days, so
 * --hours up to ~330h is fine via bulkDelete; anything older falls back
 * to single-delete (slower, but rare for a "past 2 hours" sweep).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { Client, GatewayIntentBits, Partials } = require('discord.js');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const channelId = argv.find(a => a.startsWith('--channel='))?.slice('--channel='.length);
const hoursArg = argv.find(a => a.startsWith('--hours='))?.slice('--hours='.length);
const HOURS = hoursArg ? Number(hoursArg) : 2;

if (!channelId) {
  console.error('Missing --channel=<id>. Example: --channel=1380084621676646453');
  process.exit(1);
}
if (!Number.isFinite(HOURS) || HOURS <= 0) {
  console.error('--hours must be a positive number.');
  process.exit(1);
}

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('DISCORD_TOKEN not set. Run with: set -a && source .env && set +a && node ...');
    process.exit(1);
  }

  const cutoffMs = Date.now() - HOURS * 60 * 60 * 1000;
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (nothing will be deleted)' : 'LIVE (will delete)'}`);
  console.log(`Channel: ${channelId}`);
  console.log(`Window: messages from the last ${HOURS} hour(s) (since ${new Date(cutoffMs).toISOString()})`);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    partials: [Partials.Message, Partials.Channel],
  });

  await client.login(token);
  await new Promise(resolve => client.once('clientReady', resolve));
  console.log(`Logged in as ${client.user.tag} (id ${client.user.id})`);

  let channel;
  try { channel = await client.channels.fetch(channelId); }
  catch (err) {
    console.error(`Could not fetch channel ${channelId}: ${err.message}`);
    await client.destroy();
    process.exit(1);
  }
  if (!channel?.isTextBased?.()) {
    console.error(`Channel ${channelId} is not text-based, aborting.`);
    await client.destroy();
    process.exit(1);
  }

  // Walk backwards in pages of 100 until we cross the cutoff or run out.
  let cursor;
  let scanned = 0;
  let stopped = false;
  const toDelete = [];

  while (!stopped) {
    const batch = await channel.messages.fetch({ limit: 100, ...(cursor ? { before: cursor } : {}) });
    if (batch.size === 0) break;
    cursor = batch.last().id;
    scanned += batch.size;

    for (const msg of batch.values()) {
      if (msg.createdTimestamp < cutoffMs) { stopped = true; continue; }
      if (msg.author.id !== client.user.id) continue;
      toDelete.push(msg);
      const preview = (msg.content || msg.embeds?.[0]?.title || msg.embeds?.[0]?.data?.title || '<no text>')
        .toString().replace(/\s+/g, ' ').slice(0, 100);
      console.log(`  DEL  ${msg.id}  ${new Date(msg.createdTimestamp).toISOString()}  ${preview}`);
    }
    if (batch.size < 100) break;
  }

  console.log(`\nScanned ${scanned} message(s) in #${channel.name}. ${toDelete.length} authored by the bot within the window.`);

  if (DRY_RUN || toDelete.length === 0) {
    if (DRY_RUN) console.log('Dry run — re-run without --dry-run to actually delete.');
    await client.destroy();
    process.exit(0);
  }

  // bulkDelete works for messages < 14 days old; everything in a 2h window
  // qualifies, but keep the fallback in case --hours is bumped.
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
    try { await msg.delete(); deleted++; }
    catch (err) { console.error(`  delete ${msg.id} failed:`, err.message); }
  }

  console.log(`\nDeleted ${deleted} message(s) from #${channel.name}.`);
  await client.destroy();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
