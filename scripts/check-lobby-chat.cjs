// Browser-only fixtures; never joins or sends chat to a real lobby.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let joined = false;
      let roles;
      let messages = [{ id: 1, account_id: 43, display_name: 'Other captain', body: 'Who prefers mid?', created_at: new Date().toISOString() }];
      const session = { id: 17, status: 'open', captain_mode: 'highest_rank', min_players: 10 };
      const players = () => [
        { account_id: 43, nickname: 'Other captain', status: 'registered', preferred_positions: '1,2' },
        ...(joined ? [{ account_id: 42, nickname: 'Fixture player', status: 'registered', preferred_positions: '2' }] : []),
      ];
      await page.route('**/api/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        let data = {};
        if (path === '/api/auth/me') data = { accountId: 42, displayName: 'Fixture player', discord_id: 'fixture', discord_guild_member: true, onboarding_complete: true };
        else if (path === '/api/admin/session-status') data = { isAdmin: false, isSuperuser: false, role: null };
        else if (path === '/api/inhouse/active') data = { session, players: players() };
        else if (path === '/api/inhouse/17/join') {
          roles = JSON.parse(request.postData()).preferredPositions;
          assert.ok(roles.length);
          joined = true;
          data = { player: players().at(-1) };
        } else if (path === '/api/inhouse/17/chat' && request.method() === 'POST') {
          const message = { id: messages.length + 1, account_id: 42, display_name: 'Fixture player', body: JSON.parse(request.postData()).body, created_at: new Date().toISOString() };
          messages.push(message);
          data = { message };
        } else if (path === '/api/inhouse/17/chat') data = { messages, canSend: true, canModerate: false };
        else if (path === '/api/inhouse') data = { sessions: [] };
        else if (path === '/api/inhouse/automation') data = { enabled: false };
        else if (path.endsWith('/captain-vote-tally')) data = { tally: {}, totalVotes: 0, winning: 'highest_rank' };
        else if (path.includes('feature-flags')) data = { flags: {} };
        else if (path === '/api/seasons') data = { seasons: [] };
        else if (path.includes('onboarding')) data = { complete: true, onboarding_complete: true };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      await page.goto(`https://${process.env.REPLIT_DEV_DOMAIN}/how-it-works`, { waitUntil: 'domcontentloaded' });
      const dismiss = page.getByRole('button', { name: /dismiss/i });
      if (await dismiss.count()) await dismiss.first().click();
      const hub = page.getByRole('complementary', { name: 'OCE Inhouse lobby' });
      await hub.getByRole('button', { name: 'Quick join' }).click();
      const dialog = page.getByRole('dialog', { name: 'Where do you play?' });
      assert.equal(await dialog.getByRole('button', { name: 'Join queue' }).isDisabled(), true);
      await dialog.getByRole('button', { name: /P2 Mid/ }).click();
      await dialog.getByRole('button', { name: 'Join queue' }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.deepEqual(roles, [2]);
      await hub.getByRole('button', { name: 'Expand lobby panel' }).click();
      await hub.getByText('Who prefers mid?').waitFor();
      await hub.getByLabel('Message', { exact: true }).fill('<b>Mid ready</b>');
      await hub.getByRole('button', { name: 'Send', exact: true }).click();
      await hub.getByText('<b>Mid ready</b>', { exact: true }).waitFor();
      assert.equal(await hub.locator('.lh-message p b').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `/tmp/lobby-hub-${width}.jpg` });
      await hub.getByRole('link', { name: /Open lobby/ }).click();
      await page.locator('.pb-inhouse .lh-chat').waitFor();
      assert.equal(await page.getByRole('region', { name: 'Lobby chat' }).count(), 1);
      const widgetPosition = await hub.evaluate(node => getComputedStyle(node).position);
      assert.equal(widgetPosition, 'fixed');
      await page.screenshot({ path: `/tmp/lobby-chat-page-${width}.jpg`, fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: mandatory roles, quick join, chat, literal text, cross-page panel and no duplicate transcript`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
