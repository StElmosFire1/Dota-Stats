const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const fetch = require('node-fetch');

const AUTO_DOWNLOAD_DIR = '/tmp/replay-auto';

function buildReplayUrl(cluster, matchId, replaySalt) {
  return `http://replay${cluster}.valve.net/570/${matchId}_${replaySalt}.dem.bz2`;
}

async function downloadFile(url, destPath) {
  const res = await fetch(url, { timeout: 120000 });
  if (!res.ok) throw new Error(`Valve CDN returned HTTP ${res.status}`);
  const buffer = await res.buffer();
  fs.writeFileSync(destPath, buffer);
  console.log(`[ReplayDL] Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB to ${destPath}`);
}

async function decompressBz2(bz2Path) {
  return new Promise((resolve, reject) => {
    const demPath = bz2Path.replace(/\.bz2$/, '');
    execFile('bunzip2', ['-f', bz2Path], (err) => {
      if (err) return reject(new Error(`bunzip2 failed: ${err.message}`));
      if (!fs.existsSync(demPath)) return reject(new Error('Decompressed .dem not found after bunzip2'));
      resolve(demPath);
    });
  });
}

async function requestMatchDetailsWithRetry(gcClient, matchId, maxAttempts, retryDelayMs) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[ReplayDL] GC match details request for ${matchId} (attempt ${attempt}/${maxAttempts})...`);
      const data = await gcClient.requestMatchDetails(matchId);
      const match = data?.match || data;
      const cluster = match?.cluster;
      const replaySalt = match?.replaySalt ?? match?.replay_salt;
      if (!cluster || !replaySalt || Number(replaySalt) === 0) {
        throw new Error(`Replay not stored (cluster=${cluster}, salt=${replaySalt})`);
      }
      return { cluster: Number(cluster), replaySalt: Number(replaySalt) };
    } catch (err) {
      lastError = err;
      console.warn(`[ReplayDL] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < maxAttempts) {
        console.log(`[ReplayDL] Retrying in ${retryDelayMs / 60000} min...`);
        await new Promise(r => setTimeout(r, retryDelayMs));
      }
    }
  }
  throw lastError;
}

async function autoDownloadAndProcessReplay(gcClient, matchId, processReplayFn, notifyFn) {
  if (!matchId) {
    console.warn('[ReplayDL] No match ID — cannot auto-download replay.');
    return;
  }

  if (!fs.existsSync(AUTO_DOWNLOAD_DIR)) {
    fs.mkdirSync(AUTO_DOWNLOAD_DIR, { recursive: true });
  }

  const INITIAL_WAIT_MS = 5 * 60 * 1000;
  const RETRY_DELAY_MS = 2 * 60 * 1000;
  const MAX_ATTEMPTS = 4;

  console.log(`[ReplayDL] Scheduling auto-replay download for match ${matchId} in 5 min...`);
  notifyFn(
    `Replay download scheduled for match **${matchId}**.\n` +
    `Waiting 5 minutes for Valve to process the replay...`
  );

  await new Promise(r => setTimeout(r, INITIAL_WAIT_MS));

  let cluster, replaySalt;
  try {
    ({ cluster, replaySalt } = await requestMatchDetailsWithRetry(
      gcClient, matchId, MAX_ATTEMPTS, RETRY_DELAY_MS
    ));
    console.log(`[ReplayDL] Got replay info: cluster=${cluster}, salt=${replaySalt}`);
  } catch (err) {
    console.warn(`[ReplayDL] Could not get replay info for ${matchId}: ${err.message}`);
    notifyFn(
      `Could not auto-download replay for match **${matchId}**.\n` +
      `Valve did not return replay data — the practice lobby replay may not have been saved.\n` +
      `Please upload the replay file manually via the dashboard.`
    );
    return;
  }

  const replayUrl = buildReplayUrl(cluster, matchId, replaySalt);
  const bz2Path = path.join(AUTO_DOWNLOAD_DIR, `${matchId}.dem.bz2`);
  const demPath = path.join(AUTO_DOWNLOAD_DIR, `${matchId}.dem`);

  try { if (fs.existsSync(bz2Path)) fs.unlinkSync(bz2Path); } catch (_) {}
  try { if (fs.existsSync(demPath)) fs.unlinkSync(demPath); } catch (_) {}

  notifyFn(`Downloading replay for match **${matchId}** from Valve servers...`);
  console.log(`[ReplayDL] Fetching: ${replayUrl}`);

  try {
    await downloadFile(replayUrl, bz2Path);
    await decompressBz2(bz2Path);
  } catch (err) {
    console.error(`[ReplayDL] Download/decompress failed for match ${matchId}: ${err.message}`);
    notifyFn(
      `Failed to download/decompress replay for match **${matchId}**: ${err.message}\n` +
      `Please upload the replay file manually.`
    );
    try { if (fs.existsSync(bz2Path)) fs.unlinkSync(bz2Path); } catch (_) {}
    return;
  }

  notifyFn(`Replay downloaded! Parsing match **${matchId}** — detailed stats will appear shortly...`);

  try {
    await processReplayFn(demPath, `auto-gc:${matchId}`);
    console.log(`[ReplayDL] Auto-parse pipeline triggered for match ${matchId}`);
  } catch (err) {
    console.error(`[ReplayDL] Parse pipeline error for match ${matchId}: ${err.message}`);
    notifyFn(
      `Replay downloaded but parsing failed for match **${matchId}**: ${err.message}\n` +
      `Try re-parsing from the admin panel.`
    );
  } finally {
    try { if (fs.existsSync(demPath)) fs.unlinkSync(demPath); } catch (_) {}
  }
}

module.exports = { autoDownloadAndProcessReplay };
