// Task #361 — User-Agent block-list used to skip sponsorship telemetry
// beacons that come from crawlers, scanners, headless browsers, and CLI
// tooling so the impression/click trend charts reflect real humans.
//
// Deliberately conservative: we only filter UAs that are *clearly* not
// interactive users. Real browsers (Chrome, Safari, Firefox, Edge) on
// desktop and mobile are not blocked — even when they're running in a
// privacy mode that mangles the UA, they'll still carry one of those
// browser tokens and look indistinguishable from a human visitor.
//
// Anything you add here should be lowercase — `isBot` lowercases the
// incoming UA before matching.

const BOT_UA_SUBSTRINGS = [
  // Search-engine + SEO crawlers.
  'googlebot', 'google-inspectiontool', 'adsbot-google', 'mediapartners-google',
  'bingbot', 'msnbot', 'yandexbot', 'duckduckbot', 'baiduspider',
  'sogou', 'exabot', 'facebot', 'ia_archiver', 'archive.org_bot',
  'ahrefsbot', 'semrushbot', 'mj12bot', 'dotbot', 'rogerbot',
  'screaming frog', 'seznambot', 'petalbot', 'applebot', 'amazonbot',
  // Social-card unfurlers (we *want* OG cards to render for these, but we
  // don't want their image-fetch passes to count as sponsorship views).
  'facebookexternalhit', 'twitterbot', 'discordbot', 'slackbot',
  'linkedinbot', 'telegrambot', 'whatsapp', 'redditbot', 'embedly',
  'skypeuripreview', 'pinterestbot',
  // Uptime + security scanners.
  'uptimerobot', 'pingdom', 'statuscake', 'newrelic', 'datadog',
  'gtmetrix', 'lighthouse', 'pagespeed', 'chrome-lighthouse',
  // Headless browsers + automation frameworks.
  'headlesschrome', 'headless chrome', 'phantomjs', 'puppeteer',
  'playwright', 'selenium', 'webdriver', 'cypress',
  // Generic HTTP clients + crawlers that have no business inflating
  // impressions.
  'curl/', 'wget/', 'python-requests', 'python-urllib', 'aiohttp',
  'go-http-client', 'okhttp', 'httpclient', 'libwww-perl', 'java/',
  'node-fetch', 'axios/', 'got (',
  // Generic markers a lot of long-tail bots advertise.
  'bot/', ' bot ', 'crawler', 'spider', 'scraper', 'fetcher',
  'monitor', 'preview',
];

/**
 * Returns true when the given User-Agent header value looks like a bot,
 * crawler, headless browser, or scripted client. Empty / missing UAs are
 * treated as bots — every real browser sends one, and a beacon with no
 * UA is overwhelmingly automation. Returns false for anything else (i.e.
 * we fail-open in favour of counting borderline traffic as human).
 *
 * @param {string|undefined|null} ua
 * @returns {boolean}
 */
function isBot(ua) {
  if (ua == null) return true;
  const s = String(ua).trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  for (const needle of BOT_UA_SUBSTRINGS) {
    if (lower.includes(needle)) return true;
  }
  return false;
}

module.exports = { isBot, BOT_UA_SUBSTRINGS };
