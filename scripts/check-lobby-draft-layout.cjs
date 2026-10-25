// Read-only browser fixtures: every API call is intercepted; no real lobby is
// joined, drafted or modified. Run against the development frontend.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, admin] of [[1440, false], [1440, true], [1920, true], [390, false]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors = [];
        const writes = [];
        let scoutingCalls = 0;
        let phase = 'drafting';
        page.on('pageerror', e => errors.push(e.message));
        const players = Array.from({ length: 10 }, (_, i) => ({
          account_id: 42 + i, nickname: i < 2 ? `Captain ${i + 1}` : `Available Player ${i}`,
          status: i < 2 ? 'drafted' : 'accepted', team: i === 0 ? 1 : i === 1 ? 2 : 0,
          inhouse_mmr: 5925 + i * 50, trueskill_mmr: 10, games_played: 40,
          wins: 20, losses: 20, preferred_positions: '1,2,3,4,5',
          founder_ring: 'phoenix', profile_frame: 'gold', last_played: '2026-10-24T00:00:00Z',
        }));
        await page.route('**/api/**', async route => {
          const path = new URL(route.request().url()).pathname;
          let data = {};
          if (path === '/api/admin/session-status') data = { isAdmin: admin, isSuperuser: admin, role: admin ? 'superuser' : null };
          else if (path === '/api/auth/me') data = { accountId: 42, displayName: 'Captain 1', discord_id: 'fixture', discord_guild_member: true, onboarding_complete: true };
          else if (path === '/api/inhouse/active') data = { session: { id: 10, status: phase, min_players: 10, captain_mode: 'highest_rank', captain1_account_id: 42, captain2_account_id: 43 }, players };
          else if (path.endsWith('/draft-status')) data = { currentPickerTeam: 1, pickIdx: 0, complete: false, pickDeadlineAt: new Date(Date.now() + 60000).toISOString(), pickSeconds: 60 };
          else if (path.endsWith('/draft-pick') && route.request().method() === 'POST') {
            const body = JSON.parse(route.request().postData());
            writes.push(body);
            const player = players.find(p => Number(p.account_id) === Number(body.accountId));
            Object.assign(player, { team: body.team, status: 'drafted', pick_order: 1 });
            data = { ok: true };
          } else if (path === '/api/inhouse') data = { sessions: [{ id: 1, status: 'completed', created_at: '2026-05-05T00:00:00Z' }] };
          else if (path === '/api/inhouse/automation') data = { enabled: false };
          else if (path.endsWith('/captain-vote-tally')) data = { tally: {}, myVote: null, totalVotes: 0, winning: 'highest_rank' };
          else if (path.endsWith('/scouting')) {
            scoutingCalls++;
            data = { customTitle: 'The Captain', bestHeroes: [{ hero_id: 5, games: 10, winRate: 70 }], comfortHeroes: [{ hero_id: 1, games: 20, winRate: 60 }], preferredHero: 5, preferredHeroCaption: 'Profile favourite', recentRoles: [{ position: 2, games: 10 }], recentSample: 10, recentMatches: [{ match_id: '123', hero_id: 5, position: 2, kills: 12, deaths: 3, assists: 19, gpm: 543, won: true }] };
          } else if (path.includes('feature-flags')) data = { flags: {} };
          else if (path === '/api/seasons') data = { seasons: [] };
          else if (path.includes('onboarding')) data = { complete: true, onboarding_complete: true };
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        });
        await page.goto(`https://${process.env.REPLIT_DEV_DOMAIN}/inhouse`, { waitUntil: 'domcontentloaded' });
        await page.locator('.pb-draft-pool-grid .pb-draft-player').first().waitFor();
        const dismiss = page.getByRole('button', { name: /dismiss/i });
        if (await dismiss.count()) await dismiss.first().click();
        const layout = await page.evaluate(() => {
          const pool = document.querySelector('.pb-draft-pool-grid');
          const box = pool.getBoundingClientRect();
          return { cards: pool.children.length, top: Math.round(box.top), bottom: Math.round(box.bottom), height: Math.round(box.height), columns: getComputedStyle(pool).gridTemplateColumns, overflow: getComputedStyle(pool).overflowY, pageOverflow: document.documentElement.scrollWidth > innerWidth, emblem: document.querySelector('.lobby-player-cosmetics').getBoundingClientRect().width };
        });
        console.log(JSON.stringify({ width, admin, ...layout }));
        assert.equal(layout.cards, 8);
        assert.equal(layout.pageOverflow, false);
        assert.equal(layout.emblem, 48);
        await page.screenshot({ path: `/tmp/lobby-draft-${width}-${admin}.jpg` });
        if (width >= 1440) assert.ok(layout.bottom <= 900, `Pool extends below viewport: ${layout.bottom}`);
        assert.equal(await page.locator('.pb-inhouse-history').count(), 0);
        assert.equal(scoutingCalls, 0);
        const name = page.locator('.pb-draft-pool-grid .lobby-player-name').first();
        await name.hover();
        const tip = page.getByRole('tooltip');
        await tip.getByText('The Captain', { exact: true }).waitFor();
        await tip.hover();
        await page.waitForTimeout(220);
        assert.equal(await tip.count(), 1);
        assert.match(await tip.innerText(), /12\/3\/19/);
        const bounds = await tip.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= 901);
        await tip.screenshot({ path: `/tmp/lobby-scout-${width}-${admin}.jpg` });
        await page.keyboard.press('Escape');
        assert.equal(await tip.count(), 0);
        const pick = page.locator('.pb-draft-pool-grid').getByRole('button', { name: admin ? /Admin: assign .* to Green side/ : /Pick .* onto your side/ }).first();
        await pick.click();
        await page.waitForFunction(() => document.querySelectorAll('.pb-draft-pool-grid .pb-draft-player').length === 7);
        assert.equal(writes[0].team, 1);
        assert.equal(scoutingCalls, 1);
        assert.deepEqual(errors, []);
        phase = 'open';
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('.pb-inhouse-history').waitFor().catch(async error => {
          console.error('Opening-page diagnostics:', errors, (await page.locator('body').innerText()).slice(-1600));
          throw error;
        });
        assert.equal(await page.locator('.pb-inhouse-wide').count(), 0);
        console.log(`PASS ${width}px ${admin ? 'admin' : 'captain'}: draft fit, scouting, pick, cosmetics and opening history`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
