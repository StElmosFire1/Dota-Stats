const net = require('net');
const { config } = require('../config');

const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_RESPONSE_VALUE = 0;

function buildPacket(id, type, body) {
  const bodyBuf = Buffer.from(body, 'utf8');
  const size = 4 + 4 + bodyBuf.length + 2;
  const buf = Buffer.alloc(4 + size);
  buf.writeInt32LE(size, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  bodyBuf.copy(buf, 12);
  buf.writeInt8(0, 12 + bodyBuf.length);
  buf.writeInt8(0, 12 + bodyBuf.length + 1);
  return buf;
}

function parsePackets(buffer) {
  const packets = [];
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const size = buffer.readInt32LE(offset);
    if (offset + 4 + size > buffer.length) break;
    const id = buffer.readInt32LE(offset + 4);
    const type = buffer.readInt32LE(offset + 8);
    const body = buffer.slice(offset + 12, offset + 4 + size - 2).toString('utf8');
    packets.push({ id, type, body });
    offset += 4 + size;
  }
  return { packets, remaining: buffer.slice(offset) };
}

async function rconExec(command, opts = {}) {
  const ds = config.dota?.dedicatedServer || {};
  const host = opts.host || ds.ip;
  const port = opts.port || ds.port || 27015;
  const password = opts.password || ds.rconPassword;
  const timeoutMs = opts.timeoutMs || 5000;

  if (!host) throw new Error('Dedicated server IP not configured');
  if (!password) throw new Error('RCON password not configured (set DEDICATED_SERVER_RCON_PASSWORD)');

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = Buffer.alloc(0);
    let authenticated = false;
    let responseBody = '';
    let done = false;

    const finish = (err, value) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch (_) {}
      if (err) reject(err); else resolve(value);
    };

    const timer = setTimeout(() => finish(new Error('RCON timeout')), timeoutMs);

    socket.connect(port, host, () => {
      socket.write(buildPacket(1, SERVERDATA_AUTH, password));
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { packets, remaining } = parsePackets(buffer);
      buffer = remaining;
      for (const p of packets) {
        if (!authenticated) {
          if (p.type === SERVERDATA_AUTH_RESPONSE) {
            if (p.id === -1) {
              clearTimeout(timer);
              finish(new Error('RCON auth failed (wrong password)'));
              return;
            }
            authenticated = true;
            socket.write(buildPacket(2, SERVERDATA_EXECCOMMAND, command));
            socket.write(buildPacket(3, SERVERDATA_EXECCOMMAND, ''));
          }
        } else {
          if (p.id === 3 && p.type === SERVERDATA_RESPONSE_VALUE) {
            clearTimeout(timer);
            finish(null, responseBody);
            return;
          }
          responseBody += p.body;
        }
      }
    });

    socket.on('error', (err) => { clearTimeout(timer); finish(err); });
    socket.on('close', () => { if (!done) { clearTimeout(timer); finish(new Error('RCON connection closed unexpectedly')); } });
  });
}

async function setMatchPassword(matchPassword) {
  return rconExec(`sv_password "${matchPassword}"`);
}

async function kickAll() {
  return rconExec('kickall');
}

async function pingServer() {
  try {
    const result = await rconExec('status', { timeoutMs: 3000 });
    return { ok: true, response: result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { rconExec, setMatchPassword, kickAll, pingServer };
