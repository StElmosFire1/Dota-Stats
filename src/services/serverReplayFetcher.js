const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { config } = require('../config');

function getSshOpts() {
  const ssh = config.dota?.dedicatedServer?.ssh || {};
  if (!ssh.host) throw new Error('SSH host not configured');
  if (!ssh.privateKey) throw new Error('SSH private key not configured (set DEDICATED_SERVER_SSH_PRIVATE_KEY)');
  return {
    host: ssh.host,
    port: ssh.port || 22,
    username: ssh.user || 'root',
    privateKey: ssh.privateKey,
    readyTimeout: 10000,
  };
}

function withConnection(fn) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    const finish = (err, val) => { if (settled) return; settled = true; try { conn.end(); } catch (_) {} if (err) reject(err); else resolve(val); };
    conn.on('ready', async () => {
      try { const v = await fn(conn); finish(null, v); } catch (e) { finish(e); }
    });
    conn.on('error', finish);
    try { conn.connect(getSshOpts()); } catch (e) { finish(e); }
  });
}

function execCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = ''; let stderr = '';
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
      stream.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`Command exited ${code}: ${stderr || stdout}`));
      });
    });
  });
}

function downloadFile(conn, remotePath, localPath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastGet(remotePath, localPath, (err2) => {
        if (err2) return reject(err2);
        resolve(localPath);
      });
    });
  });
}

async function listReplays() {
  const ssh = config.dota?.dedicatedServer?.ssh || {};
  const dir = ssh.replayDir || '/opt/dota2/game/dota/replays';
  return withConnection(async (conn) => {
    const out = await execCommand(conn, `ls -1t "${dir}"/*.dem 2>/dev/null | head -20`);
    return out.split('\n').map(s => s.trim()).filter(Boolean);
  });
}

async function fetchLatestReplay(localDir = '/tmp/dedicated-replays') {
  const ssh = config.dota?.dedicatedServer?.ssh || {};
  const dir = ssh.replayDir || '/opt/dota2/game/dota/replays';
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
  return withConnection(async (conn) => {
    const out = await execCommand(conn, `ls -1t "${dir}"/*.dem 2>/dev/null | head -1`);
    const remotePath = out.trim();
    if (!remotePath) throw new Error('No .dem files found on dedicated server');
    const filename = path.basename(remotePath);
    const localPath = path.join(localDir, filename);
    await downloadFile(conn, remotePath, localPath);
    return { remotePath, localPath, filename };
  });
}

async function fetchReplayByName(filename, localDir = '/tmp/dedicated-replays') {
  const ssh = config.dota?.dedicatedServer?.ssh || {};
  const dir = ssh.replayDir || '/opt/dota2/game/dota/replays';
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
  const remotePath = `${dir}/${filename}`;
  const localPath = path.join(localDir, filename);
  return withConnection(async (conn) => {
    await downloadFile(conn, remotePath, localPath);
    return { remotePath, localPath, filename };
  });
}

async function testConnection() {
  try {
    const out = await withConnection((conn) => execCommand(conn, 'echo connected && uname -a'));
    return { ok: true, info: out.trim() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function archiveMatchReplay(matchId, remotePath) {
  const ssh = config.dota?.dedicatedServer?.ssh || {};
  const archiveDir = process.env.REPLAY_ARCHIVE_DIR || ssh.replayArchiveDir || '/opt/dota2/game/dota/replays/archive';
  const safeMatchId = String(matchId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const archiveFilename = `match_${safeMatchId}.dem`;
  const archivePath = `${archiveDir}/${archiveFilename}`;
  // Use SFTP mkdir+rename instead of shell commands to avoid injection risks
  // from user-influenced path values.
  return withConnection(async (conn) => {
    await new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        // Recursive mkdir-p over SFTP: walk each path segment and create if missing.
        const mkdirp = (dir, cb) => {
          sftp.mkdir(dir, (mkErr) => {
            if (!mkErr || mkErr.code === 4 /* SSH_FX_FAILURE = already exists */) return cb(null);
            // If mkdir failed because the parent doesn't exist, create the parent first.
            const parent = require('path').posix.dirname(dir);
            if (parent === dir) return cb(mkErr); // reached root
            mkdirp(parent, (parentErr) => {
              if (parentErr) return cb(parentErr);
              sftp.mkdir(dir, (retryErr) => {
                if (!retryErr || retryErr.code === 4) return cb(null);
                cb(retryErr);
              });
            });
          });
        };
        mkdirp(archiveDir, (mkdirpErr) => {
          if (mkdirpErr) return reject(mkdirpErr);
          sftp.rename(remotePath, archivePath, (renErr) => {
            if (renErr) return reject(renErr);
            resolve();
          });
        });
      });
    });
    console.log(`[ReplayArchive] Archived ${remotePath} -> ${archivePath}`);
    return archivePath;
  });
}

function streamReplayFromArchive(remotePath, res) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch (_) {}
      if (err) reject(err);
      else resolve();
    };
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) return finish(err);
        const remoteStream = sftp.createReadStream(remotePath);
        remoteStream.on('error', finish);
        remoteStream.on('end', () => finish(null));
        remoteStream.pipe(res, { end: false });
        remoteStream.on('close', () => {
          res.end();
          finish(null);
        });
      });
    });
    conn.on('error', finish);
    try { conn.connect(getSshOpts()); } catch (e) { finish(e); }
  });
}

module.exports = { listReplays, fetchLatestReplay, fetchReplayByName, testConnection, archiveMatchReplay, streamReplayFromArchive };
