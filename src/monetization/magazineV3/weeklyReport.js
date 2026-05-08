/**
 * Feature 2 — Weekly AI report (Pro-gated, Groq, 7-day cache).
 *
 * Bundles:
 *   - source data + cached report DB helpers (`weekly_ai_reports`)
 *   - email opt-in helpers (`magv3_user_emails`) used for delivery
 *   - JSON schema validator + renderers
 *   - the nightly worker (`startWeeklyReportWorker`)
 *   - the on-demand /me/weekly-report and /me/email routes
 */

const { WEEKLY_REPORT_CACHE_HOURS } = require('./constants');

// =============================================================================
// WEEKLY REPORT — JSON SCHEMA + VALIDATION (review fix)
// The Groq-generated structured output must conform to this shape; otherwise
// we fall back to deterministic stat summary.
// =============================================================================
const WEEKLY_REPORT_SCHEMA = {
  required: ['summary', 'insights', 'top_heroes', 'deltas'],
  insightsMin: 1, insightsMax: 8,
};
function validateWeeklyReportJson(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'not-object' };
  for (const k of WEEKLY_REPORT_SCHEMA.required) {
    if (!(k in obj)) return { ok: false, error: `missing:${k}` };
  }
  if (typeof obj.summary !== 'string' || obj.summary.length < 10) {
    return { ok: false, error: 'summary-too-short' };
  }
  if (!Array.isArray(obj.insights)
      || obj.insights.length < WEEKLY_REPORT_SCHEMA.insightsMin
      || obj.insights.length > WEEKLY_REPORT_SCHEMA.insightsMax) {
    return { ok: false, error: 'insights-bounds' };
  }
  if (!obj.insights.every(s => typeof s === 'string' && s.length > 5)) {
    return { ok: false, error: 'insights-bad-strings' };
  }
  if (!Array.isArray(obj.top_heroes)) return { ok: false, error: 'top_heroes-not-array' };
  if (typeof obj.deltas !== 'object' || obj.deltas == null) {
    return { ok: false, error: 'deltas-not-object' };
  }
  return { ok: true };
}

function _safeParseJsonObject(raw) {
  if (!raw || typeof raw !== 'string') return null;
  // Strip markdown fences if present.
  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  // Find first { … last } so wrapping prose is tolerated.
  const i = s.indexOf('{'); const j = s.lastIndexOf('}');
  if (i === -1 || j === -1 || j < i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; }
}

function _weeklyPrompt(stats) {
  return `You are a Dota 2 performance analyst. Given the JSON stats below, ` +
    `respond with STRICT JSON matching this shape exactly: ` +
    `{"summary": string, "insights": string[1..8], "top_heroes": ` +
    `[{"hero_id":number,"games":number,"winrate":number}], ` +
    `"deltas": {"perf_avg":number,"winrate":number,"kda":number}}. ` +
    `Stats: ${JSON.stringify(stats).slice(0, 6000)}`;
}
function _renderWeeklyMd(j) {
  const lines = [`### Weekly Report`, ``, j.summary, ``, `**Key insights**`];
  for (const ins of j.insights) lines.push(`- ${ins}`);
  if (Array.isArray(j.top_heroes) && j.top_heroes.length) {
    lines.push(``, `**Top heroes**`);
    for (const h of j.top_heroes.slice(0, 5)) {
      lines.push(`- Hero ${h.hero_id}: ${h.games} games, ${Math.round(h.winrate * 100)}% WR`);
    }
  }
  return lines.join('\n');
}
function _renderWeeklyDeterministic(stats) {
  const m = stats.matches || [];
  const wins = m.filter(x => x.win).length;
  const wr = m.length ? Math.round((wins / m.length) * 100) : 0;
  const avgPerf = m.length ? (m.reduce((s, x) => s + (x.perf || 0), 0) / m.length).toFixed(2) : '0.00';
  return `### Weekly Report\n\nLast 7 days: **${m.length} matches**, **${wr}% WR**, average PERF **${avgPerf}**.\n\n` +
    `_(Generated from your match history; AI commentary unavailable.)_`;
}

function createDb({ getPool }) {
  function _weekStart(d = new Date()) {
    const dt = new Date(d);
    dt.setUTCHours(0, 0, 0, 0);
    const dow = dt.getUTCDay(); // 0..6, Sun..Sat
    const offset = (dow + 6) % 7; // back to Mon
    dt.setUTCDate(dt.getUTCDate() - offset);
    return dt.toISOString().slice(0, 10);
  }

  async function getCachedWeeklyReport(accountId, weekStart = null) {
    if (!accountId) return null;
    const ws = weekStart || _weekStart();
    const p = getPool();
    const r = await p.query(
      `SELECT * FROM weekly_ai_reports
        WHERE account_id = $1 AND week_start = $2
          AND generated_at > NOW() - INTERVAL '${WEEKLY_REPORT_CACHE_HOURS} hours'
        LIMIT 1`,
      [accountId, ws]
    );
    return r.rows[0] || null;
  }

  async function saveWeeklyReport(accountId, weekStart, contentMd, stats) {
    const p = getPool();
    const r = await p.query(
      `INSERT INTO weekly_ai_reports (account_id, week_start, content_md, stats)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (account_id, week_start) DO UPDATE
         SET content_md = EXCLUDED.content_md,
             stats = EXCLUDED.stats,
             generated_at = NOW()
       RETURNING *`,
      [accountId, weekStart, contentMd, stats ? JSON.stringify(stats) : null]
    );
    return r.rows[0];
  }

  async function getWeeklyReportSourceData(accountId) {
    const p = getPool();
    const r = await p.query(
      `SELECT m.match_id, m.date, m.duration, m.radiant_win,
              ps.team, ps.hero_id, ps.kills, ps.deaths, ps.assists,
              ps.gpm, ps.xpm, ps.hero_damage, ps.hero_healing,
              ps.tower_damage, ps.last_hits, ps.position, ps.perf, ps.perf_breakdown
         FROM player_stats ps
         JOIN matches m ON m.match_id = ps.match_id
        WHERE ps.account_id = $1
          AND m.date > NOW() - INTERVAL '7 days'
        ORDER BY m.date DESC
        LIMIT 50`,
      [accountId]
    );
    const games = r.rows;
    const wins = games.filter(g =>
      (g.team === 0 && g.radiant_win) || (g.team === 1 && !g.radiant_win)).length;
    const losses = games.length - wins;
    const avg = (k) => {
      if (!games.length) return 0;
      const vals = games.map(g => Number(g[k]) || 0);
      return Math.round((vals.reduce((a, b) => a + b, 0) / games.length) * 10) / 10;
    };
    const perfVals = games.map(g => Number(g.perf)).filter(v => Number.isFinite(v));
    const avgPerf = perfVals.length
      ? Math.round((perfVals.reduce((a, b) => a + b, 0) / perfVals.length) * 100) / 100
      : null;
    // Per-match shape used by the nightly worker (it consumes `matches[]`
    // for win/perf rollups and the deterministic-fallback renderer).
    const matches = games.map(g => ({
      match_id: g.match_id,
      hero_id: g.hero_id,
      win: (g.team === 0 && g.radiant_win) || (g.team === 1 && !g.radiant_win),
      perf: Number(g.perf) || 0,
      kda: { k: g.kills, d: g.deaths, a: g.assists },
      gpm: g.gpm, xpm: g.xpm, position: g.position,
    }));
    return {
      games_count: games.length,
      matches,
      wins, losses,
      win_rate: games.length ? Math.round((wins / games.length) * 1000) / 10 : 0,
      avg_kills: avg('kills'),
      avg_deaths: avg('deaths'),
      avg_assists: avg('assists'),
      avg_gpm: avg('gpm'),
      avg_xpm: avg('xpm'),
      avg_perf: avgPerf,
      best_match: games.slice().sort((a, b) =>
        (Number(b.perf) || 0) - (Number(a.perf) || 0))[0] || null,
    };
  }

  async function setUserEmail(accountId, email) {
    if (typeof email !== 'string' || email.length > 254) throw new Error('Bad email');
    // Conservative RFC-ish check: one @, dot in domain, no spaces.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Bad email');
    const p = getPool();
    const r = await p.query(
      `INSERT INTO magv3_user_emails (account_id, email)
       VALUES ($1, $2)
       ON CONFLICT (account_id) DO UPDATE
         SET email = EXCLUDED.email, updated_at = NOW()
       RETURNING *`,
      [accountId, email.toLowerCase()]
    );
    return r.rows[0];
  }

  async function getUserEmail(accountId) {
    const p = getPool();
    const r = await p.query(
      `SELECT email FROM magv3_user_emails WHERE account_id = $1`,
      [accountId]
    );
    return r.rows[0]?.email || null;
  }

  return {
    _weekStart,
    getCachedWeeklyReport, saveWeeklyReport, getWeeklyReportSourceData,
    setUserEmail, getUserEmail,
  };
}

// =============================================================================
// WEEKLY REPORT NIGHTLY WORKER (review fix)
// Runs every WEEKLY_WORKER_INTERVAL_MS (default: 1h). On the configured weekday
// (default Monday) it:
//   - finds Pro accounts active in the last 7 days
//   - generates / refreshes their weekly report
//   - delivers via Discord DM (best-effort) using deps.notifyWeeklyReport
// Idempotent thanks to the (account_id, week_start) UNIQUE constraint.
// =============================================================================
function startWeeklyReportWorker(deps) {
  const { db, magV3, getGroq, log = console, intervalMs = 60 * 60 * 1000,
          deliveryWeekday = 1 /* Mon */, getProAccountIds,
          notifyWeeklyReport,
          // Round-4 review: email is the spec'd primary delivery channel.
          // `sendEmail({ accountId, email, subject, markdown })` may be wired
          // to Resend/Mailgun/etc. by the caller. Worker falls back to
          // notifyWeeklyReport (Discord DM) only when the caller did not
          // configure email AND the user has weekly_recap notifications on.
          sendEmail,
          isNotificationEnabled } = deps;
  let timer = null;
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      // Expire stale verified badges as part of the same nightly tick.
      try {
        const expired = await magV3.expireStaleVerifiedBadges();
        if (expired.length) log.log('[mag-v3:weekly] expired verified badges:', expired.length);
      } catch (e) { log.warn('[mag-v3:weekly] expire-verified failed:', e.message); }

      const now = new Date();
      if (now.getUTCDay() !== deliveryWeekday) return;
      // Only run once per day-of-week tick window.
      if (now.getUTCHours() !== 9) return; // 09:00 UTC

      const accounts = (await (getProAccountIds ? getProAccountIds() : Promise.resolve([]))) || [];
      if (!accounts.length) return;
      log.log('[mag-v3:weekly] running for', accounts.length, 'pro accounts');
      let delivered = 0, skipped = 0, optedOut = 0, noEmail = 0;
      for (const accountId of accounts) {
        try {
          // Round-4 review: gate generation on the user's notification opt-in.
          // The existing `weekly_recap` notification category is reused so
          // the existing settings page just works — no new UI required.
          if (typeof isNotificationEnabled === 'function') {
            const enabled = await isNotificationEnabled(accountId, 'weekly_recap');
            if (!enabled) { optedOut++; continue; }
          }
          const stats = await magV3.getWeeklyReportSourceData(accountId);
          if (!stats || !stats.matches || stats.matches.length === 0) { skipped++; continue; }
          let content = null;
          let parsedJson = null;
          const groq = getGroq && getGroq();
          if (groq && typeof groq.generateChatResponse === 'function') {
            try {
              const prompt = _weeklyPrompt(stats) +
                '\n\nReply with ONLY a single JSON object — no surrounding prose, no markdown fences.';
              const raw = await groq.generateChatResponse({ message: prompt });
              const out = _safeParseJsonObject(raw);
              const v = out ? validateWeeklyReportJson(out) : { ok: false, error: 'no-parse' };
              if (v.ok) { parsedJson = out; content = _renderWeeklyMd(out); }
              else { log.warn('[mag-v3:weekly] schema reject:', v.error); }
            } catch (e) { log.warn('[mag-v3:weekly] groq failed:', e.message); }
          }
          if (!content) content = _renderWeeklyDeterministic(stats);
          await magV3.saveWeeklyReport(accountId, magV3._weekStart(), content, { ...stats, ai: parsedJson });
          // Round-4 delivery preference: email > Discord DM. Both are gated
          // on the same `weekly_recap` opt-in (already checked above).
          let sent = false;
          const email = await magV3.getUserEmail(accountId).catch(() => null);
          if (email && typeof sendEmail === 'function') {
            try {
              await sendEmail({
                accountId, email,
                subject: 'Your weekly Dota report is ready',
                markdown: content,
              });
              sent = true;
            } catch (e) { log.warn('[mag-v3:weekly] email failed:', e.message); }
          } else if (!email) {
            noEmail++;
          }
          if (!sent && notifyWeeklyReport) {
            try { await notifyWeeklyReport(accountId, content); sent = true; }
            catch (e) { log.warn('[mag-v3:weekly] dm failed:', e.message); }
          }
          if (sent) delivered++;
        } catch (e) { log.warn('[mag-v3:weekly] account', accountId, 'failed:', e.message); }
      }
      log.log('[mag-v3:weekly] delivered:', delivered,
              'opted-out:', optedOut, 'no-email:', noEmail, 'skipped:', skipped);
    } finally { running = false; }
  }
  timer = setInterval(() => { tick().catch(e => log.warn('[mag-v3:weekly] tick:', e.message)); }, intervalMs);
  // Run once shortly after boot so verified-badge expiry is processed.
  setTimeout(() => { tick().catch(() => {}); }, 30 * 1000);
  return { stop() { if (timer) clearInterval(timer); }, _tick: tick };
}

function mountRoutes({ router, express, deps, requireAuth }) {
  const { magV3, isProAccount, isSuperuser, getGroq } = deps;

  // ---------------------------------------------------------------
  // 2 — Weekly AI report (Pro-gated)
  // ---------------------------------------------------------------
  router.get('/me/weekly-report', requireAuth, async (req, res) => {
    try {
      const accountId = req.session.accountId;
      if (!isSuperuser(req) && !(await isProAccount(accountId))) {
        return res.status(402).json({
          error: 'Weekly AI report requires Pro membership.',
          paywall: true, feature: 'weekly_ai_report', signed_in: true,
        });
      }
      const cached = await magV3.getCachedWeeklyReport(accountId);
      if (cached) {
        return res.json({
          report: cached.content_md,
          stats: cached.stats,
          week_start: cached.week_start,
          generated_at: cached.generated_at,
          cached: true,
        });
      }
      const stats = await magV3.getWeeklyReportSourceData(accountId);
      let content;
      let aiJson = null;
      if (!stats.games_count) {
        content = "_No games played in the last 7 days. Get back in the lobby and we'll have something to write about next week._";
      } else {
        // Review fix: align on-demand handler with the worker — both must
        // request strict JSON output and validate it against
        // WEEKLY_REPORT_SCHEMA before showing the user any AI text. Any
        // schema failure (or missing AI provider) falls back to the
        // deterministic stat summary so the user never sees hallucinations.
        const groq = getGroq();
        try {
          if (groq && typeof groq.generateChatResponse === 'function') {
            const prompt = _weeklyPrompt(stats) +
              '\n\nReply with ONLY a single JSON object — no surrounding prose, no markdown fences.';
            const raw = await groq.generateChatResponse({ message: prompt });
            const parsed = _safeParseJsonObject(raw);
            const v = parsed ? validateWeeklyReportJson(parsed) : { ok: false, error: 'no-parse' };
            if (v.ok) { aiJson = parsed; content = _renderWeeklyMd(parsed); }
            else { console.warn('[mag-v3] weekly-report schema reject:', v.error); }
          }
        } catch (e) {
          console.warn('[mag-v3] weekly-report groq failed:', e.message);
        }
        if (!content || typeof content !== 'string' || content.length < 30) {
          // Graceful deterministic fallback so the user always gets a useful
          // report even if the AI is unavailable or returns malformed JSON.
          const wr = stats.win_rate.toFixed(1);
          const k = stats.avg_kills, d = stats.avg_deaths, a = stats.avg_assists;
          content = [
            `**Last 7 days — ${stats.games_count} games, ${stats.wins}–${stats.losses} (${wr}% WR).**`,
            `Average line: ${k}/${d}/${a} · ${stats.avg_gpm} GPM · ${stats.avg_xpm} XPM` +
              (stats.avg_perf != null ? ` · PERF ${stats.avg_perf}` : '') + '.',
            stats.win_rate >= 55
              ? "You're trending up — keep the lineup that's working."
              : (stats.win_rate >= 45
                  ? "Roughly break-even — the swing stat to watch is your KDA balance."
                  : "Rough week. Focus on staying alive — your deaths line is dragging the rest down."),
          ].join(' ');
        }
      }
      stats.ai = aiJson;
      const saved = await magV3.saveWeeklyReport(
        accountId, magV3._weekStart(), content, stats
      );
      res.json({
        report: saved.content_md, stats: saved.stats,
        week_start: saved.week_start, generated_at: saved.generated_at,
        cached: false,
      });
    } catch (err) {
      console.error('[API] me/weekly-report:', err.message);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  // ---------------------------------------------------------------
  // Round-4 — Weekly report opt-in & email setter.
  // ---------------------------------------------------------------
  router.get('/me/email', requireAuth, async (req, res) => {
    try {
      const email = await magV3.getUserEmail(req.session.accountId);
      res.json({ email });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.post('/me/email', express.json(), requireAuth, async (req, res) => {
    try {
      const row = await magV3.setUserEmail(req.session.accountId, req.body?.email);
      res.json({ ok: true, email: row.email });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Bad email' });
    }
  });
}

module.exports = {
  createDb,
  mountRoutes,
  startWeeklyReportWorker,
  validateWeeklyReportJson,
  WEEKLY_REPORT_SCHEMA,
  _weeklyPrompt,
  _renderWeeklyMd,
  _renderWeeklyDeterministic,
  _safeParseJsonObject,
};
