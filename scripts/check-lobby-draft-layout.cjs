// Read-only browser fixtures: every API call is intercepted; no real lobby is
// joined, drafted or modified. Run against the development frontend.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { getDraftReview } = require('../src/inhouse/draftReview');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, admin] of [[1440, false], [1440, true], [1920, true], [390, false], [390, true]].filter(([w, a]) => !process.env.LOBBY_LAYOUT_CASE || process.env.LOBBY_LAYOUT_CASE === `${w}:${a}`)) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const errors = [];
        const writes = [];
        let scoutingCalls = 0;
        let phase = 'drafting';
        let viewerAccountId = 42;
        let reviewState = null;
        const sessionData = () => ({ id: 10, status: phase, min_players: 10, captain_mode: 'highest_rank', captain1_account_id: 42, captain2_account_id: 43, draft_review: reviewState });
        let pickIndex = 0;
        let clockDeadline = Date.now() + 40000;
        const sequence = [1, 2, 2, 1, 1, 2, 2, 1];
        page.on('pageerror', e => errors.push(e.message));
        const players = Array.from({ length: 10 }, (_, i) => ({
          account_id: 42 + i, nickname: i < 2 ? `Captain ${i + 1}` : `Available Player ${i}`,
          status: i < 2 ? 'drafted' : 'accepted', team: i === 0 ? 1 : i === 1 ? 2 : 0,
          inhouse_mmr: 5925 + i * 50, trueskill_mmr: 10, games_played: 40,
          wins: 20, losses: 20, preferred_positions: i < 2 ? '1,2,3,4,5' : '{"2","3"}',
          current_streak: 1, not_in_dota: false, voice_verified: true,
          founder_ring: 'phoenix', profile_frame: 'gold', last_played: '2026-10-24T00:00:00Z',
        }));
        await page.route('**/api/**', async route => {
          const path = new URL(route.request().url()).pathname;
          let data = {};
          if (path === '/api/admin/session-status') data = { isAdmin: admin, isSuperuser: admin, role: admin ? 'superuser' : null };
          else if (path === '/api/auth/me') data = { accountId: viewerAccountId, displayName: viewerAccountId === 42 ? 'Captain 1' : 'Captain 2', discord_id: 'fixture', discord_guild_member: true, onboarding_complete: true };
          else if (path === '/api/inhouse/active') data = { session: sessionData(), players };
          else if (path.endsWith('/draft-status')) data = { currentPickerTeam: sequence[pickIndex] ?? null, pickIdx: pickIndex, complete: pickIndex === 8, pickDeadlineAt: pickIndex === 8 ? null : new Date(clockDeadline).toISOString(), pickStartsAt: pickIndex === 8 ? null : new Date(clockDeadline - 30000).toISOString(), pickSeconds: 30, pickGraceSeconds: pickIndex === 0 ? 10 : 0, review: getDraftReview(sessionData(), players) };
          else if (path.endsWith('/draft-review') && route.request().method() === 'POST') {
            const body = JSON.parse(route.request().postData());
            const state = getDraftReview(sessionData(), players);
            const team = viewerAccountId === 42 ? 1 : 2;
            assert.equal(body.revision, state.revision);
            if (body.action === 'propose') {
              state.pendingTrade = { id: 'fixture-trade', proposedByTeam: team, team1AccountId: body.team1AccountId, team2AccountId: body.team2AccountId };
              state.confirmations = [];
            } else if (body.action === 'accept') {
              assert.notEqual(team, state.pendingTrade.proposedByTeam);
              players.find(p => p.account_id === state.pendingTrade.team1AccountId).team = 2;
              players.find(p => p.account_id === state.pendingTrade.team2AccountId).team = 1;
              state.rosterSignature = getDraftReview({ ...sessionData(), draft_review: null }, players).rosterSignature;
              state.pendingTrade = null;
              state.confirmations = [];
            } else if (body.action === 'confirm') state.confirmations.push(team);
            else throw Error(`Unexpected fixture review action: ${body.action}`);
            state.revision++;
            reviewState = state;
            data = { review: getDraftReview(sessionData(), players) };
          }
          else if (path.endsWith('/draft-pick') && route.request().method() === 'POST') {
            const body = JSON.parse(route.request().postData());
            writes.push(body);
            const player = players.find(p => Number(p.account_id) === Number(body.accountId));
            Object.assign(player, { team: body.team, status: 'drafted', pick_order: 1 });
            pickIndex++;
            clockDeadline = Date.now() + 30000;
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
        await page.evaluate(() => document.fonts.ready);
        const geometry = () => page.evaluate(() => [...document.querySelectorAll('.inhouse-draft-board, .inhouse-draft-board > .pb-card, .pb-draft-timer')].map(e => {
          const b = e.getBoundingClientRect(); return { x: b.x + scrollX, y: b.y + scrollY, width: b.width, height: b.height };
        }));
        const before = await geometry();
        await page.evaluate(() => { window.__captainRing = document.querySelector('.pb-draft-roster-panel .lobby-player-cosmetics'); });
        await page.waitForTimeout(4300);
        assert.ok(await page.evaluate(() => window.__captainRing === document.querySelector('.pb-draft-roster-panel .lobby-player-cosmetics')), 'Captain ring remounted during polling');
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
        await page.waitForFunction(() => document.querySelector('.is-active-captain')?.textContent.includes('Captain 2'));
        assert.equal(await page.getByText(/Timer starts in/).count(), 0, 'Later picks must not receive another lead-in');
        assert.equal(scoutingCalls, 1);
        assert.deepEqual(errors, []);
        if (admin) {
          for (let count = 1; count < 8; count++) {
            const team = sequence[count];
            const button = page.locator('.pb-draft-pool-grid').getByRole('button', { name: new RegExp(`Admin: assign .* to ${team === 1 ? 'Green' : 'Red'} side`) }).first();
            await button.click();
            await page.waitForFunction(expected => document.querySelectorAll('.pb-draft-pool-grid .pb-draft-player').length === expected, 7 - count);
            const after = await geometry();
            assert.equal(after.length, before.length);
            for (let i = 0; i < before.length; i++) {
              for (const field of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(after[i][field] - before[i][field]) < 2, `Layout shifted after pick ${count + 1}: panel ${i} ${field} ${before[i][field]} → ${after[i][field]}`);
            }
          }
          assert.equal(players.filter(p => p.team === 1).length, 5);
          assert.equal(players.filter(p => p.team === 2).length, 5);
          const overflow = await page.evaluate(() => [...document.querySelectorAll('.pb-roster-slot-filled .pb-draft-player')].filter(e => e.scrollHeight > e.clientHeight + 2).length);
          assert.equal(overflow, 0, 'Roster metadata overflows its reserved player slots');
          await page.screenshot({ path: `/tmp/lobby-draft-complete-${width}.jpg` });
          const review = page.locator('.pb-draft-review-in-pool');
          await review.getByRole('button', { name: 'Propose trade', exact: true }).waitFor();
          assert.equal(await page.locator('.is-active-captain').count(), 0);
          const greenId = players.find(p => p.team === 1 && p.account_id !== 42).account_id;
          const redId = players.find(p => p.team === 2 && p.account_id !== 43).account_id;
          await review.getByLabel('Green side player').selectOption(String(greenId));
          await review.getByLabel('Red side player').selectOption(String(redId));
          await review.getByRole('button', { name: 'Propose trade', exact: true }).click();
          await review.getByRole('button', { name: /Withdraw/ }).waitFor();
          viewerAccountId = 43;
          await page.reload({ waitUntil: 'domcontentloaded' });
          await review.getByRole('button', { name: /Accept/ }).click();
          await review.getByRole('button', { name: /Confirm.*team/i }).waitFor();
          assert.equal(players.find(p => p.account_id === greenId).team, 2);
          assert.equal(players.find(p => p.account_id === redId).team, 1);
          await review.getByRole('button', { name: /Confirm.*team/i }).click();
          await review.getByRole('button', { name: /Revoke/ }).waitFor();
          viewerAccountId = 42;
          await page.reload({ waitUntil: 'domcontentloaded' });
          await review.getByRole('button', { name: /Confirm.*team/i }).click();
          await review.locator('.dtr-state.is-locked').waitFor();
          assert.equal(getDraftReview(sessionData(), players).approved, true);
          assert.equal(await review.getByRole('button', { name: /Propose trade|Confirm.*team/i }).count(), 0);
          assert.ok(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), 'Review must not overflow the page horizontally');
          assert.deepEqual(errors, []);
          await page.screenshot({ path: `/tmp/lobby-draft-reviewed-${width}.jpg` });
        }
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
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
