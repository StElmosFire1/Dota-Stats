'use strict';

/**
 * Tiny pg pool stub used by the per-feature Magazine v3 unit tests.
 *
 * `handlers` is an array of { match, respond } pairs. `match` is either a
 * string (substring matched against the normalised SQL) or a RegExp tested
 * against the same. `respond(params, query)` returns the rows-shaped
 * `{ rows, rowCount? }` result the helper expects (or just `{ rows }`).
 *
 * The pool also captures every call as `pool.calls = [{ sql, params }]` so
 * tests can assert on argument-passing without mocking individual statements.
 *
 * Falls through to `{ rows: [] }` (with an optional console warn when
 * `strict: true` is passed) so unrelated bookkeeping queries don't blow up.
 */
function makePool(handlers, { strict = false } = {}) {
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      const norm = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: norm, params });
      for (const h of handlers) {
        const matched = typeof h.match === 'string'
          ? norm.includes(h.match)
          : h.match.test(norm);
        if (matched) {
          const out = await h.respond(params, norm);
          if (out && Array.isArray(out.rows)) return out;
          return { rows: out || [], rowCount: (out || []).length };
        }
      }
      if (strict) {
        throw new Error('unexpected query: ' + norm.slice(0, 120));
      }
      return { rows: [], rowCount: 0 };
    },
  };
  pool.calls = calls;
  return pool;
}

module.exports = { makePool };
