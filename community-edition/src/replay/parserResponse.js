const fs = require('fs');
const http = require('http');
const { pipeline } = require('stream');

const MESSAGES = {
  REPLAY_DECODE_FAILED: 'Replay could not be decoded. Re-download the replay and try again; if it still fails, ask an admin to update the replay parser.',
  REPLAY_INCOMPLETE: 'The parser returned incomplete replay data. No match was saved. Re-download the replay and try again; ask an admin to update the parser if it persists.',
  PARSER_UNAVAILABLE: 'The replay parser could not be reached or the request timed out. Please try again later; ask an admin to check the parser if it persists.',
  PARSER_RESPONSE_INVALID: 'The replay parser returned an invalid response. No match was saved. Ask an admin to check or update the parser, then try again.',
};

function parserError(code, diagnostics) {
  console.error(`[Replay] ${code}:`, diagnostics);
  const error = new Error(MESSAGES[code]);
  error.code = code;
  return error;
}

async function requestReplay(filePath, url = 'http://localhost:5600/?strict=1') {
  const upload = fs.createReadStream(filePath);
  try {
    const response = await new Promise((resolve, reject) => {
      let incoming;
      const request = http.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(fs.statSync(filePath).size),
        },
      });
      const timer = setTimeout(() => request.destroy(new Error('Parser request timed out')), 600000);
      const connectTimer = setTimeout(() => request.destroy(new Error('Parser connection timed out')), 10000);
      const clearTimers = () => { clearTimeout(timer); clearTimeout(connectTimer); };
      const fail = error => {
        clearTimers();
        incoming?.destroy();
        request.destroy();
        reject(error);
      };
      request.once('socket', socket => {
        if (!socket.connecting) clearTimeout(connectTimer);
        else socket.once('connect', () => clearTimeout(connectTimer));
      });
      request.once('error', fail);
      request.once('response', res => {
        incoming = res;
        const chunks = [];
        let bytes = 0;
        res.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > 500 * 1024 * 1024) return fail(new Error('Parser response exceeded size limit'));
          chunks.push(chunk);
        });
        res.once('aborted', () => fail(new Error('Parser response was truncated')));
        res.once('error', fail);
        res.once('end', () => {
          clearTimers();
          if (!res.complete) return fail(new Error('Parser response was incomplete'));
          resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') });
        });
      });
      pipeline(upload, request, error => { if (error) fail(error); });
    });
    const text = response.text;
    if (response.status !== 200) {
      let failure;
      try { failure = JSON.parse(text); } catch {}
      const code = failure?.ok === false && failure?.error?.code === 'REPLAY_DECODE_FAILED'
        ? 'REPLAY_DECODE_FAILED' : 'PARSER_RESPONSE_INVALID';
      throw parserError(code, { status: response.status, body: text });
    }
    if (response.headers['x-replay-parse-complete'] !== '1') {
      throw parserError('REPLAY_INCOMPLETE', 'Missing completion header; parser may need rebuilding/restarting.');
    }
    return text;
  } catch (error) {
    if (Object.hasOwn(MESSAGES, error.code)) throw error;
    throw parserError('PARSER_UNAVAILABLE', error);
  } finally {
    upload.destroy();
  }
}

function decodeEvents(text) {
  const events = [];
  const lines = text.trim().split('\n').filter(line => line.trim());
  for (const [index, line] of lines.entries()) {
    let event;
    try { event = JSON.parse(line); } catch (error) {
      throw parserError('PARSER_RESPONSE_INVALID', { line: index + 1, error });
    }
    if (!event || typeof event !== 'object' || Array.isArray(event)
        || typeof event.type !== 'string' || event.error || event.ok === false) {
      throw parserError('PARSER_RESPONSE_INVALID', { line: index + 1, event });
    }
    events.push(event);
  }
  // An epilogue is produced only after the demo's end-of-match metadata is read.
  if (!events.length || !events.some(event => event.type === 'epilogue')) {
    throw parserError('REPLAY_INCOMPLETE', `Received ${events.length} events without an epilogue.`);
  }
  return events;
}

module.exports = { requestReplay, decodeEvents, parserError };
