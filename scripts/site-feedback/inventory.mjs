import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const OUT = 'generated-artifacts/site-feedback';
export const source = fs.readFileSync('web/src/App.jsx', 'utf8');
export const slug = s => s.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const aliases = { ProReplaysGuard: 'ProReplayBrowser', H2HMeRedirectLazy: 'H2H' };
const restricted = /^(Admin|StatsEditor|DraftSandbox|ProfileSandbox|ProfileDemo|RecordMatch|Settings|CoachEdit|CoachOnboarding|CoachEarnings|CoachGroupSessionsManage|MyBookings|MyGroupSessions|MyVodReviews|VodReviewDetail|VodReviewRequest|SponsorshipInbox|MeNotifications)/;
export const entries = [];
for (const m of source.matchAll(/<Route path="([^"]+)" element=\{<(\w+)([^]*?)\/>\}/g)) {
  let route = m[1];
  if (route === '/*') continue;
  if (!route.startsWith('/')) route = `/settings/${route}`;
  const component = aliases[m[2]] || m[2];
  let entry = entries.find(e => e.component === component);
  if (!entry) {
    const file = `web/src/pages/${component}.jsx`;
    if (!fs.existsSync(file)) throw Error(`Missing source ${file}`);
    const text = fs.readFileSync(file, 'utf8');
    entry = { id: `page-${slug(component)}`, component, title: component.replace(/([a-z])([A-Z])/g, '$1 $2'), routes: [], source: file,
      private: restricted.test(component), tabs: [], sections: [], flags: [...text.matchAll(/useFeatureFlag\(['"]([^'"]+)['"]/g)].map(m => m[1]),
      status: 'pending', sourceRevision: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() };
    for (const block of text.matchAll(/const\s+\w*[Tt][Aa][Bb][Ss]\s*=\s*\[([^]*?)\];/g)) {
      for (const tab of block[1].matchAll(/\{\s*(?:key|id):\s*['"]([^'"]+)['"],\s*label:\s*['"]([^'"]+)['"]/g))
        entry.tabs.push({ id: `${entry.id}-tab-${slug(tab[1])}`, key: tab[1], label: tab[2], status: 'source-only' });
    }
    for (const section of text.matchAll(/<h[234][^>]*>([^<{}]+)<\/h[234]>/g)) {
      const label = section[1].trim().replace(/&amp;/g, '&');
      if (label && !entry.sections.some(s => s.label === label)) entry.sections.push({ id: `${entry.id}-section-${slug(label)}`, label, status: 'source-only' });
    }
    for (const tab of text.matchAll(/onClick=\{\(\)\s*=>\s*set(?:Active)?Tab\(['"]([^'"]+)['"]\)\}[^>]*>([^<{}]+)</g)) {
      if (!entry.tabs.some(t => t.key === tab[1]))
        entry.tabs.push({ id: `${entry.id}-tab-${slug(tab[1])}`, key: tab[1], label: tab[2].trim(), status: 'source-only' });
    }
    if (component === 'AdminPanel') {
      const block = text.match(/const TAB_META = \{([^]*?)\n\};/)[1];
      entry.tabs = [...block.matchAll(/(\w+):\s*\{[^}]*label:\s*'([^']+)',\s*desc:\s*'([^']+)'/g)]
        .map(t => ({ id: `${entry.id}-tab-${t[1]}`, key: t[1], label: t[2], description: t[3], status: 'source-only' }));
    }
    entries.push(entry);
  }
  entry.routes.push({ path: route, props: m[3].trim(), canonical: entry.routes.length === 0 });
}

const additionalTabs = {
  Players: [['all', 'All Players'], ['live', 'Live']],
  PositionStats: [['stats', 'Position Rankings'], ['profiles', 'Player Profiles']],
  PlayerInsights: [['network', 'Network'], ['benchmarks', 'Benchmarks'], ['duos','Top Duos'], ['connections','Player Connections']],
  Draft: [['assistant','Draft Assistant'], ['stats','Pick & Ban Stats']],
  H2H: [['heroes','Hero matchups'], ['lanes','Lane matchups'], ['sides','Side breakdown'], ['timeline','Timeline']],
  StatsEditor: [['player','Player Stats'], ['core','Core'], ['combat','Combat'], ['vision','Vision & Misc'], ['flags','Flags'], ['draft','Draft / Picks & Bans']],
  GamePlay: [['daily','Daily puzzle (each game)'], ['endless','Endless practice (each game)']],
};
for (const [component, tabs] of Object.entries(additionalTabs)) {
  const e = entries.find(e => e.component === component);
  for (const [key, label] of tabs) if (!e.tabs.some(t => t.key === key))
    e.tabs.push({ id: `${e.id}-tab-${key}`, key, label, status: 'source-only' });
}
for (const [component, title, route, isPrivate] of [
  ['ScoutingReport','Printable scouting report','/scouting/:accountId',false],
  ['PlayerEmbed','Embeddable player card','/embed/player/:accountId',false],
]) entries.push({
  id:`page-${slug(component)}`, component, title, routes:[{path:route,props:'Server-rendered HTML',canonical:true}],
  source:'src/web/server.js', private:isPrivate, tabs:[], sections:[], flags:[], status:'pending',
  sourceRevision:entries[0].sourceRevision,
});
const intelligence = fs.readFileSync('web/src/components/replay-intelligence/ReplayIntelligenceOverview.jsx', 'utf8');
entries.find(e => e.component === 'MatchDetail').sections.push(
  ...[...intelligence.match(/const LABELS = \{([^]*?)\};/)[1].matchAll(/(\w+): '([^']+)'/g)].map(m => ({
    id: `page-match-detail-intelligence-${slug(m[1])}`, label: `Replay intelligence: ${m[2]}`,
    status: 'source-only', source: 'web/src/components/replay-intelligence/ReplayIntelligenceOverview.jsx',
  })),
);

// Interaction surfaces that have no distinct React Router route.
export const surfaces = [
  ['welcome', 'Welcome announcement', 'WelcomeModal', '/', 'anonymous', 'Dismiss the announcement to reveal the page; this affects only this browser.'],
  ['trust', 'Steam sign-in explanation', 'SteamTrustModal', '/', 'anonymous', 'Open the question-mark link beside Steam sign-in; credentials are entered with Valve, not here.'],
  ['search', 'Global search / command palette', 'CommandPalette', '/', 'anonymous', 'Open search and type a player, match or page name; select a result to navigate.'],
  ['navigation', 'Navigation dropdowns and mobile menu', 'App', '/', 'anonymous', 'Open a navigation group and choose a destination.'],
  ['season-selector', 'Season selector', 'SeasonSelector', '/', 'anonymous', 'Choose a season to change the reporting context on supported pages.'],
  ['onboarding', 'Signed-in onboarding and tour', 'OnboardingWizard', '/', 'player', 'Complete the supported account setup steps; not executed without a consented player identity.'],
  ['notifications', 'Notification bell and detail', 'NotificationBell', '/', 'player', 'Open notifications and follow a notification to its related page; reading can change read status, so not demonstrated.'],
  ['discord-link', 'Discord linking and retry banner', 'DiscordLinkModal', '/settings/account', 'player', 'Use the supported Discord authorization flow; linking changes account data and was not executed.'],
  ['account-menu', 'Signed-in account menu', 'App', '/', 'player', 'Open the account pill to reach profile, settings, notifications and staff navigation.'],
  ['live-draft', 'Lobby registration, teams and captain draft', 'Inhouse', '/inhouse', 'player', 'Join an eligible lobby, wait for drafting, then pick in turn. No queue joins or draft submissions were executed.'],
  ['paywall', 'Pro feature gates', 'PaywallBlur', '/player-tools', 'anonymous', 'Review the entitlement explanation; do not start checkout during review.'],
  ['checkout', 'Checkout and payment return states', 'BuyinSuccess', '/buyin-success', 'player', 'A real checkout returns a payment identifier; an unparameterized return page is not proof of a completed payment.'],
  ['unsubscribe', 'Notification unsubscribe confirmation', 'server', '/unsubscribe', 'player', 'A valid signed link changes notification preferences even though it uses GET. Intentionally not visited; no token or private link is included.'],
  ['auth-callbacks', 'Steam and Discord authorization callbacks', 'server', '/auth/*', 'player', 'These complete external identity-provider flows; they are not ordinary content pages. No identity callback or account linking was executed.'],
  ['share-cards', 'Generated share cards and crawler previews', 'server', '/og/* and /*.png', 'anonymous', 'Image endpoints support social sharing and crawler previews for matches, players, comparisons and recaps. They map to their canonical page families, not additional interactive pages.'],
  ['lockdown', 'Owner-only private preview gate', 'server', '/', 'player', 'The gate was observed earlier; the owner later disabled it. No access flag was changed by the capture process.'],
];

export function writeInventory() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'inventory.json'), JSON.stringify({ entries, surfaces }, null, 2));
}
if (process.argv[1]?.endsWith('inventory.mjs')) {
  writeInventory();
  console.log(`${entries.length} canonical families; ${entries.reduce((n, e) => n + e.routes.length, 0)} route patterns; ${entries.reduce((n,e)=>n+e.tabs.length,0)} declared tabs.`);
}
