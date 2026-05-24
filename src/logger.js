// Task #313 — Structured logging shim.
//
// Tries to load `pino` (an optional dep) and falls back to a console-shaped
// no-op object if it isn't installed. Centralising this lets future PRs
// replace `console.log` call-sites incrementally without touching every file
// at once. The shim's surface is `pino`-compatible:
//   logger.info(obj, msg) / logger.info(msg)
//   logger.warn(obj, msg) / logger.warn(msg)
//   logger.error(obj, msg) / logger.error(msg)
//   logger.debug(obj, msg) / logger.debug(msg)
//   logger.child(bindings) -> new logger with bound context
//
// Env vars:
//   LOG_LEVEL — defaults to 'info' ('debug' | 'info' | 'warn' | 'error')
//   LOG_PRETTY=1 — only honoured when `pino-pretty` is also installed
//
// Production deploys can `npm install pino` (and optionally `pino-pretty`)
// without any further code changes. The shim is intentionally tiny — for
// non-trivial requirements (transports, redaction policies, hooks) wire
// pino directly in the entrypoint.

let pino = null;
try {
  // eslint-disable-next-line global-require
  pino = require('pino');
} catch (_) { /* optional */ }

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function _shouldLog(configured, requested) {
  const c = LEVELS[configured] != null ? LEVELS[configured] : LEVELS.info;
  const r = LEVELS[requested] != null ? LEVELS[requested] : LEVELS.info;
  return r >= c;
}

function _consoleShim(bindings = {}) {
  const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
  const emit = (lvl, consoleFn, ...args) => {
    if (!_shouldLog(level, lvl)) return;
    if (args.length === 1 && typeof args[0] === 'string') {
      consoleFn(`[${lvl}]`, bindings, args[0]);
      return;
    }
    if (args.length >= 2 && typeof args[args.length - 1] === 'string' && typeof args[0] === 'object') {
      const [obj, ...rest] = args;
      consoleFn(`[${lvl}]`, { ...bindings, ...obj }, rest.join(' '));
      return;
    }
    consoleFn(`[${lvl}]`, bindings, ...args);
  };
  return {
    level,
    debug: (...args) => emit('debug', console.log, ...args),
    info: (...args) => emit('info', console.log, ...args),
    warn: (...args) => emit('warn', console.warn, ...args),
    error: (...args) => emit('error', console.error, ...args),
    child: (extra) => _consoleShim({ ...bindings, ...(extra || {}) }),
  };
}

function createLogger(bindings = {}) {
  if (!pino) return _consoleShim(bindings);
  const opts = { level: (process.env.LOG_LEVEL || 'info').toLowerCase(), base: bindings };
  if (process.env.LOG_PRETTY === '1') {
    try {
      require.resolve('pino-pretty');
      opts.transport = { target: 'pino-pretty', options: { colorize: true } };
    } catch (_) { /* fall through to JSON */ }
  }
  return pino(opts);
}

const rootLogger = createLogger({ app: 'dota2-inhouse-bot' });

module.exports = {
  createLogger,
  logger: rootLogger,
  hasPino: () => Boolean(pino),
};
