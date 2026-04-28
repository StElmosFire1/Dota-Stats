const { config } = require('../config');

function buildConnectLink(opts = {}) {
  const ds = config.dota?.dedicatedServer || {};
  const ip = opts.ip || ds.ip;
  const port = opts.port || ds.port || 27015;
  const password = opts.password || '';
  if (!ip) return null;
  const addr = `${ip}:${port}`;
  return password
    ? `steam://connect/${addr}/${encodeURIComponent(password)}`
    : `steam://connect/${addr}`;
}

function buildConnectConsoleCommand(opts = {}) {
  const ds = config.dota?.dedicatedServer || {};
  const ip = opts.ip || ds.ip;
  const port = opts.port || ds.port || 27015;
  const password = opts.password || '';
  const addr = `${ip}:${port}`;
  return password ? `connect ${addr}; password ${password}` : `connect ${addr}`;
}

function generateMatchPassword(length = 8) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

module.exports = { buildConnectLink, buildConnectConsoleCommand, generateMatchPassword };
