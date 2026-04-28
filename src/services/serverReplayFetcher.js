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

module.exports = { listReplays, fetchLatestReplay, fetchReplayByName, testConnection };
