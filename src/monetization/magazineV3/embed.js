/**
 * Feature 5 — Pro embed widget at /embed/:accountId.
 *
 * Mounted on the top-level Express `app` (NOT the API router) because
 * embeds must serve raw HTML at a friendly URL with X-Frame-Options
 * removed. Pro-gated for the embedded user; supports vanity slugs,
 * theme accents, referral attribution, and three layout variants.
 */

const { _esc } = require('./urlSafety');

function mountRoutes({ app, deps }) {
  const { db, isProAccount, getSiteUrl } = deps;

  // Drift closure (Task #157 round-3): vanity slug + theme accent + referral
  // attribution. Resolves either a numeric account_id OR a nickname slug, lets
  // a `?theme=#hex` query override the embed accent (validated on the server),
  // and best-effort logs `?ref=...` to embed_referral_log so the embedded user
  // can see where their views came from.
  async function _resolveEmbedTarget(idOrSlug) {
    const pool = db.getPool();
    if (/^\d+$/.test(idOrSlug)) return parseInt(idOrSlug, 10);
    const slug = String(idOrSlug).toLowerCase().slice(0, 64);
    const r = await pool.query(
      `SELECT account_id FROM nicknames
        WHERE LOWER(nickname) = $1 OR LOWER(REGEXP_REPLACE(nickname,'[^a-z0-9]','','gi')) = $1
        LIMIT 1`,
      [slug],
    ).catch(() => ({ rows: [] }));
    return r.rows[0]?.account_id || null;
  }
  app.get('/embed/:accountId', async (req, res) => {
    try {
      const accountId = await _resolveEmbedTarget(req.params.accountId);
      if (!accountId) return res.status(400).send('Bad account id');
      // Embed is itself a Pro perk for the *embedded user* — only Pro accounts
      // can be embedded externally.
      const isPro = await isProAccount(accountId);
      if (!isPro) {
        res.removeHeader('X-Frame-Options');
        return res
          .status(404)
          .type('html')
          .send('<!doctype html><meta charset="utf-8"><title>Embed unavailable</title>' +
                '<body style="font-family:system-ui;padding:1rem;color:#666;background:#fff">' +
                'This profile does not have an embeddable widget enabled.</body>');
      }
      const pool = db.getPool();
      const profile = await pool.query(
        `SELECT COALESCE(n.nickname, ps.persona_name) AS name,
                MAX(ps.id) AS pid
           FROM player_stats ps
           LEFT JOIN nicknames n ON n.account_id = ps.account_id
          WHERE ps.account_id = $1
          GROUP BY n.nickname, ps.persona_name
          LIMIT 1`,
        [accountId]
      );
      const ratingRow = await pool.query(
        `SELECT MAX(mmr)::int AS mmr,
                COALESCE(SUM(wins), 0)::int AS wins,
                COALESCE(SUM(losses), 0)::int AS losses
           FROM ratings WHERE player_id::text = $1::text`,
        [String(accountId)]
      );
      const name = profile.rows[0]?.name || ('Player ' + accountId);
      const mmr = ratingRow.rows[0]?.mmr || null;
      const wins = ratingRow.rows[0]?.wins || 0;
      const losses = ratingRow.rows[0]?.losses || 0;
      const total = wins + losses;
      const wr = total ? Math.round((wins / total) * 1000) / 10 : 0;
      const baseUrl = getSiteUrl();

      // Theme accent: query param wins, then per-account customization, then
      // brass default. Strict #rrggbb validation prevents CSS injection.
      let accent = '#c5a975';
      const safeHex = (s) => (typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s)) ? s : null;
      const themeQ = safeHex(req.query.theme);
      if (themeQ) accent = themeQ;
      else {
        try {
          const cust = await pool.query(
            `SELECT theme_accent FROM profile_customization WHERE account_id = $1`, [accountId],
          );
          const custAccent = safeHex(cust.rows[0]?.theme_accent);
          if (custAccent) accent = custAccent;
        } catch {}
      }
      // Referral attribution — fire-and-forget log row, gracefully degrade if
      // the optional log table is missing.
      const ref = String(req.query.ref || '').slice(0, 64);
      if (ref) {
        pool.query(
          `INSERT INTO embed_referral_log (account_id, ref, ts) VALUES ($1, $2, NOW())`,
          [accountId, ref],
        ).catch(() => {});
      }
      // Round-8: support spec'd embed format variants. `?format=` selects:
      //   card     — default compact 420×~96 horizontal card
      //   portrait — 400×600 vertical "trading card" with full stats stack
      //   banner   — 800×120 horizontal banner suitable for forum sigs
      // Themed accent colour applies to all three layouts.
      const fmt = ['card', 'portrait', 'banner'].includes(req.query.format)
        ? req.query.format : 'card';
      const playerLink = `${_esc(baseUrl)}/player/${accountId}`;
      const statsBlock =
        `${mmr != null ? `<div class="stat"><strong>${mmr}</strong>MMR</div>` : ''}` +
        `<div class="stat"><strong>${wr}%</strong>WR</div>` +
        `<div class="stat"><strong>${total}</strong>Games</div>` +
        `<div class="stat"><strong>${wins}-${losses}</strong>W-L</div>`;
      let html;
      if (fmt === 'portrait') {
        html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${_esc(name)} — OCE Inhouse</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body{margin:0;padding:0;background:transparent;font-family:Inter,system-ui,sans-serif}
  .card{width:400px;height:600px;box-sizing:border-box;background:#0d1424;color:#f5efe2;
        border:2px solid ${accent};border-radius:14px;padding:28px 24px;
        display:flex;flex-direction:column;justify-content:space-between}
  .head{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px}
  .name{font-weight:700;font-size:24px;margin:0;color:#f5efe2;font-family:Oswald,sans-serif;letter-spacing:.5px}
  .sub{font-size:13px;color:${accent};margin:0;text-transform:uppercase;letter-spacing:2px}
  .stats{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px}
  .stat{background:#11192a;border:1px solid ${accent}33;border-radius:8px;padding:14px;text-align:center}
  .stat strong{display:block;font-size:28px;color:${accent};font-family:Oswald,sans-serif;margin-bottom:4px}
  .stat span{font-size:11px;color:#a8a8a8;text-transform:uppercase;letter-spacing:1.5px}
  .foot{text-align:center;font-size:11px;color:#888;border-top:1px solid ${accent}22;padding-top:14px}
  a{color:inherit;text-decoration:none}
</style></head><body><a href="${playerLink}" target="_blank"><div class="card">
  <div class="head"><p class="sub">OCE Inhouse · Pro</p><p class="name">${_esc(name)}</p></div>
  <div class="stats">
    ${mmr != null ? `<div class="stat"><strong>${mmr}</strong><span>MMR</span></div>` : ''}
    <div class="stat"><strong>${wr}%</strong><span>Win Rate</span></div>
    <div class="stat"><strong>${total}</strong><span>Games</span></div>
    <div class="stat"><strong>${wins}-${losses}</strong><span>W-L</span></div>
  </div>
  <div class="foot">View full profile →</div>
</div></a></body></html>`;
      } else if (fmt === 'banner') {
        html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${_esc(name)} — OCE Inhouse</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body{margin:0;padding:0;background:transparent;font-family:Inter,system-ui,sans-serif}
  .banner{width:800px;height:120px;box-sizing:border-box;background:#0d1424;color:#f5efe2;
          border:1px solid ${accent};border-radius:6px;padding:16px 24px;
          display:flex;align-items:center;gap:32px}
  .who{flex:0 0 auto}
  .name{font-weight:700;font-size:20px;margin:0;color:#f5efe2;font-family:Oswald,sans-serif}
  .sub{font-size:11px;color:${accent};margin:2px 0 0;text-transform:uppercase;letter-spacing:1.5px}
  .stats{display:flex;gap:28px;margin-left:auto}
  .stat{text-align:center}
  .stat strong{display:block;font-size:22px;color:${accent};font-family:Oswald,sans-serif}
  .stat span{font-size:10px;color:#a8a8a8;text-transform:uppercase;letter-spacing:1.2px}
  a{color:inherit;text-decoration:none}
</style></head><body><a href="${playerLink}" target="_blank"><div class="banner">
  <div class="who"><p class="name">${_esc(name)}</p><p class="sub">OCE Inhouse · Pro</p></div>
  <div class="stats">
    ${mmr != null ? `<div class="stat"><strong>${mmr}</strong><span>MMR</span></div>` : ''}
    <div class="stat"><strong>${wr}%</strong><span>WR</span></div>
    <div class="stat"><strong>${total}</strong><span>Games</span></div>
    <div class="stat"><strong>${wins}-${losses}</strong><span>W-L</span></div>
  </div>
</div></a></body></html>`;
      } else {
        html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${_esc(name)} — OCE Inhouse</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;padding:0;background:transparent;font-family:Inter,system-ui,sans-serif}
  .card{background:#0d1424;color:#f5efe2;border:1px solid ${accent};border-radius:8px;
        padding:14px 16px;display:flex;align-items:center;gap:14px;max-width:420px}
  .name{font-weight:600;font-size:15px;margin:0 0 2px;color:#f5efe2}
  .sub{font-size:12px;color:${accent};margin:0}
  .stats{display:flex;gap:12px;margin-left:auto;font-size:12px}
  .stat strong{display:block;font-size:16px;color:${accent};font-family:Oswald,sans-serif}
  a{color:inherit;text-decoration:none}
</style></head>
<body><div class="card">
  <div>
    <p class="name"><a href="${playerLink}" target="_blank">${_esc(name)}</a></p>
    <p class="sub">OCE Inhouse · Pro</p>
  </div>
  <div class="stats">${statsBlock}</div>
</div></body></html>`;
      }
      res.removeHeader('X-Frame-Options');
      res.setHeader('Content-Security-Policy', "frame-ancestors *");
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.type('html').send(html);
    } catch (err) {
      console.error('[mag-v3] embed:', err.message);
      res.status(500).send('Embed error');
    }
  });
}

module.exports = { mountRoutes };
