// Task #492 — Single source of truth for AI scraper + app-builder agent
// user-agents. Consumed by:
//   - scripts/build-robots-txt.js (generates web/public/robots.txt +
//     community-edition/web/public/robots.txt)
//   - src/security/agentClassifier.js (runtime detection middleware)
//
// Each entry records:
//   family      — short, stable bucket key. Used as the rate-limit sub-key,
//                 the ring-buffer label, and the owner-DM dedupe key.
//   kind        — 'ai-crawler' (training/search corpus) or 'app-builder'
//                 (AI agents that clone sites on demand).
//   robotsAgent — the literal "User-agent:" string we put in robots.txt.
//                 Several entries share a family; robots.txt lists each
//                 robotsAgent on its own line.
//   pattern     — RegExp matched against the request User-Agent header.
//                 `i` flag is applied automatically in the classifier.
//   source      — where the identifier comes from (docs URL / forum
//                 reference / observed in the wild). Future-me will thank
//                 past-me when these strings drift.

'use strict';

const AI_CRAWLERS = [
  { family: 'gptbot',         robotsAgent: 'GPTBot',            pattern: /GPTBot/,            source: 'https://platform.openai.com/docs/gptbot' },
  { family: 'chatgpt-user',   robotsAgent: 'ChatGPT-User',      pattern: /ChatGPT-User/,      source: 'https://platform.openai.com/docs/plugins/bot — on-demand browsing UA' },
  { family: 'oai-searchbot',  robotsAgent: 'OAI-SearchBot',     pattern: /OAI-SearchBot/,     source: 'OpenAI SearchGPT crawler (2024)' },
  { family: 'claudebot',      robotsAgent: 'ClaudeBot',         pattern: /ClaudeBot/,         source: 'https://www.anthropic.com/news/crawlers' },
  { family: 'claude-web',     robotsAgent: 'Claude-Web',        pattern: /Claude-Web/,        source: 'Anthropic claude.ai browsing UA' },
  { family: 'anthropic-ai',   robotsAgent: 'anthropic-ai',      pattern: /anthropic-ai/,      source: 'Anthropic training crawler (deprecated header, still observed)' },
  { family: 'google-extended',robotsAgent: 'Google-Extended',   pattern: /Google-Extended/,   source: 'https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers — opt-out token, not a UA but listed for parity' },
  { family: 'ccbot',          robotsAgent: 'CCBot',             pattern: /CCBot/,             source: 'https://commoncrawl.org/faq — Common Crawl, primary AI training corpus' },
  { family: 'perplexitybot',  robotsAgent: 'PerplexityBot',     pattern: /PerplexityBot/,     source: 'https://docs.perplexity.ai/docs/perplexitybot' },
  { family: 'perplexity-user',robotsAgent: 'Perplexity-User',   pattern: /Perplexity-User/,   source: 'Perplexity on-demand fetch UA' },
  { family: 'cohere-ai',      robotsAgent: 'cohere-ai',         pattern: /cohere-ai/,         source: 'Cohere training crawler' },
  { family: 'bytespider',     robotsAgent: 'Bytespider',        pattern: /Bytespider/,        source: 'ByteDance / TikTok crawler — aggressive, frequently AI training' },
  { family: 'amazonbot',      robotsAgent: 'Amazonbot',         pattern: /Amazonbot/,         source: 'https://developer.amazon.com/amazonbot — Alexa/AI training' },
  { family: 'diffbot',        robotsAgent: 'Diffbot',           pattern: /Diffbot/,           source: 'https://www.diffbot.com/dev/docs/ — structured-data scraping for AI' },
  { family: 'facebookbot',    robotsAgent: 'FacebookBot',       pattern: /FacebookBot/,       source: 'https://developers.facebook.com/docs/sharing/bot — Meta AI training crawler' },
  { family: 'meta-externalagent', robotsAgent: 'meta-externalagent', pattern: /meta-externalagent/, source: 'Meta on-demand AI agent UA (2024)' },
  { family: 'omgilibot',      robotsAgent: 'Omgilibot',         pattern: /Omgilibot/,         source: 'Webz.io crawler, resold to AI vendors' },
  { family: 'applebot-extended', robotsAgent: 'Applebot-Extended', pattern: /Applebot-Extended/, source: 'https://support.apple.com/en-us/119829 — Apple AI training opt-out token' },
  { family: 'youbot',         robotsAgent: 'YouBot',            pattern: /YouBot/,            source: 'You.com search/AI crawler' },
  { family: 'ai2bot',         robotsAgent: 'AI2Bot',            pattern: /AI2Bot/,            source: 'Allen Institute for AI crawler' },
  { family: 'imagesiftbot',   robotsAgent: 'ImagesiftBot',      pattern: /ImagesiftBot/,      source: 'TheHive.ai image training crawler' },
];

// App-builder agents — IDEs / "build me a clone of <url>" tools. Most of
// these don't publish official UA strings (they often impersonate a real
// browser), so this list is best-effort and intentionally documented as
// "observed in the wild" rather than "officially declared".
const APP_BUILDERS = [
  { family: 'replit-agent',   robotsAgent: 'Replit-Agent',      pattern: /Replit[-_ ]?Agent|ReplitBot/i, source: 'Observed UA from Replit agent web_fetch calls' },
  { family: 'lovable',        robotsAgent: 'Lovable',           pattern: /Lovable(?:\.dev)?/i,           source: 'lovable.dev clone-from-URL agent' },
  { family: 'v0',             robotsAgent: 'v0',                pattern: /\bv0(?:-bot)?\/[\d.]+/i,       source: 'Vercel v0 clone agent — version-suffixed UA' },
  { family: 'cursor-agent',   robotsAgent: 'Cursor-Agent',      pattern: /Cursor[-_ ]?(Agent|Bot)/i,     source: 'Cursor IDE web-browse agent' },
  { family: 'emergent',       robotsAgent: 'Emergent',          pattern: /Emergent(?:[-_ ]?Agent)?/i,    source: 'emergent.sh clone agent' },
  { family: 'devin',          robotsAgent: 'Devin',             pattern: /Devin(?:[-_ ]?AI)?/i,          source: 'Cognition Devin agent' },
  { family: 'bolt-new',       robotsAgent: 'Bolt',              pattern: /Bolt\.new|StackBlitz[-_ ]?Bot/i, source: 'bolt.new / StackBlitz clone agent' },
];

const ALL_AGENTS = [...AI_CRAWLERS, ...APP_BUILDERS];

// Pre-compile case-insensitive regexes so the classifier hot-path doesn't
// build one per request.
const COMPILED = ALL_AGENTS.map(a => ({
  family: a.family,
  kind: AI_CRAWLERS.includes(a) ? 'ai-crawler' : 'app-builder',
  re: a.pattern.flags.includes('i') ? a.pattern : new RegExp(a.pattern.source, a.pattern.flags + 'i'),
}));

// Heuristic catch-all for unknown bots (cheap, low-priority). Anything that
// matches this but not a known family above is recorded with kind
// `unknown-bot` and is NOT rate-limit-tightened or DM'd — observability
// only, so we can spot new patterns. Order matters: tested AFTER the
// known list.
const UNKNOWN_BOT_RE = /\b(bot|crawler|spider|scrape|fetcher|httpclient|python-requests|curl|wget|libwww-perl|node-fetch|go-http-client|java-http-client)\b/i;

function classifyUa(ua) {
  if (!ua || typeof ua !== 'string') return { class: 'human', family: null, kind: null };
  for (const c of COMPILED) {
    if (c.re.test(ua)) return { class: c.kind, family: c.family, kind: c.kind };
  }
  if (UNKNOWN_BOT_RE.test(ua)) return { class: 'unknown-bot', family: 'unknown-bot', kind: 'unknown-bot' };
  return { class: 'human', family: null, kind: null };
}

module.exports = {
  AI_CRAWLERS,
  APP_BUILDERS,
  ALL_AGENTS,
  classifyUa,
};
