// Task #361 — coverage for the sponsorship-beacon User-Agent block-list.
// Goal: lock down the bot-vs-human classifier so the trend chart stays
// real and we don't have to wonder if a UA tweak broke the filter.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isBot, BOT_UA_SUBSTRINGS } = require('../src/web/botUserAgents');

test('isBot: missing or empty UA is treated as a bot', () => {
  assert.equal(isBot(undefined), true);
  assert.equal(isBot(null), true);
  assert.equal(isBot(''), true);
  assert.equal(isBot('   '), true);
});

test('isBot: known crawlers and unfurlers are blocked', () => {
  const samples = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'TwitterBot/1.0',
    'Discordbot/2.0 (+https://discordapp.com)',
    'Slackbot-LinkExpanding 1.0',
    'WhatsApp/2.21.4.18 A',
  ];
  for (const ua of samples) assert.equal(isBot(ua), true, `expected bot: ${ua}`);
});

test('isBot: headless browsers and automation frameworks are blocked', () => {
  const samples = [
    'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (compatible; PhantomJS/2.0)',
    'Puppeteer/21.0.0',
    'Playwright/1.40.0',
    'Selenium/4.10',
  ];
  for (const ua of samples) assert.equal(isBot(ua), true, `expected bot: ${ua}`);
});

test('isBot: generic HTTP clients are blocked', () => {
  const samples = [
    'curl/8.4.0',
    'Wget/1.21.3',
    'python-requests/2.31.0',
    'Go-http-client/1.1',
    'okhttp/4.10.0',
    'axios/1.6.0',
    'node-fetch/2.6.0',
    'Java/17.0.1',
  ];
  for (const ua of samples) assert.equal(isBot(ua), true, `expected bot: ${ua}`);
});

test('isBot: real browsers (desktop + mobile) are NOT blocked', () => {
  const samples = [
    // Desktop Chrome
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // Desktop Firefox
    'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    // Desktop Safari
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    // iPhone Safari
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    // Android Chrome
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    // Edge
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  ];
  for (const ua of samples) assert.equal(isBot(ua), false, `expected human: ${ua}`);
});

test('isBot: matching is case-insensitive', () => {
  assert.equal(isBot('GOOGLEBOT/2.1'), true);
  assert.equal(isBot('CURL/8.0'), true);
});

test('BOT_UA_SUBSTRINGS: every entry is non-empty and already lowercased', () => {
  assert.ok(Array.isArray(BOT_UA_SUBSTRINGS) && BOT_UA_SUBSTRINGS.length > 0);
  for (const s of BOT_UA_SUBSTRINGS) {
    assert.equal(typeof s, 'string');
    assert.ok(s.length > 0, 'empty needle');
    assert.equal(s, s.toLowerCase(), `needle "${s}" not lowercased`);
  }
});
