'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  normalize,
  joinPaths,
  extractRoutes,
  extractDocPaths,
  IGNORED_PATHS,
} = require('../scripts/check-feature-list');

// -----------------------------------------------------------------------------
// normalize — param names collapse, trailing slash dropped
// -----------------------------------------------------------------------------
test('normalize: collapses :paramName to :p', () => {
  assert.strictEqual(normalize('/match/:matchId'), '/match/:p');
  assert.strictEqual(normalize('/match/:id'), '/match/:p');
  assert.strictEqual(normalize('/h2h/:playerA/:playerB'), '/h2h/:p/:p');
});

test('normalize: strips a trailing slash but keeps root', () => {
  assert.strictEqual(normalize('/settings/'), '/settings');
  assert.strictEqual(normalize('/'), '/');
});

// -----------------------------------------------------------------------------
// joinPaths — nested child resolution
// -----------------------------------------------------------------------------
test('joinPaths: prefixes relative children with the parent path', () => {
  assert.strictEqual(joinPaths('/settings', 'profile'), '/settings/profile');
  assert.strictEqual(joinPaths('', '/settings'), '/settings');
  assert.strictEqual(joinPaths('/settings', '/other'), '/other');
});

// -----------------------------------------------------------------------------
// extractRoutes — leaf vs parent, nesting, self-closing detection
// -----------------------------------------------------------------------------
test('extractRoutes: collects self-closing leaf routes', () => {
  const src = `
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/matches" element={<MatchList />} />
      <Route path="/match/:matchId" element={<MatchDetail />} />
    </Routes>
  `;
  const routes = extractRoutes(src);
  assert.ok(routes.has('/'));
  assert.ok(routes.has('/matches'));
  assert.ok(routes.has('/match/:matchId'));
});

test('extractRoutes: resolves nested children to full paths and records the parent', () => {
  const src = `
    <Route path="/settings" element={<Settings />}>
      <Route path="profile" element={<SettingsProfile />} />
      <Route path="danger-zone" element={<SettingsDangerZone />} />
    </Route>
  `;
  const routes = extractRoutes(src);
  assert.ok(routes.has('/settings'), 'parent route recorded');
  assert.ok(routes.has('/settings/profile'));
  assert.ok(routes.has('/settings/danger-zone'));
});

test('extractRoutes: does not mistake element={<Foo />} for a self-closing tag', () => {
  // The parent line contains "/>" inside <Settings /> but ends with ">",
  // so its children must still be nested under it.
  const src = `
    <Route path="/settings" element={<Settings />}>
      <Route path="api" element={<SettingsApi />} />
    </Route>
    <Route path="/after" element={<After />} />
  `;
  const routes = extractRoutes(src);
  assert.ok(routes.has('/settings/api'));
  // /after must NOT be nested under /settings (stack popped on </Route>)
  assert.ok(routes.has('/after'));
  assert.ok(!routes.has('/settings/after'));
});

// -----------------------------------------------------------------------------
// extractDocPaths — token extraction, grouping, brace expansion
// -----------------------------------------------------------------------------
test('extractDocPaths: pulls comma-separated grouped paths', () => {
  const doc = 'Teams (/teams, /teams/new, /teams/:id) [signed-in] — clans';
  const paths = extractDocPaths(doc);
  assert.ok(paths.has('/teams'));
  assert.ok(paths.has('/teams/new'));
  assert.ok(paths.has('/teams/:id'));
});

test('extractDocPaths: brace-expands and includes the base path', () => {
  const doc = 'Settings (/settings/{profile,notifications,api}) [signed-in]';
  const paths = extractDocPaths(doc);
  assert.ok(paths.has('/settings'), 'base path included');
  assert.ok(paths.has('/settings/profile'));
  assert.ok(paths.has('/settings/notifications'));
  assert.ok(paths.has('/settings/api'));
});

test('extractDocPaths: strips trailing punctuation', () => {
  const doc = 'Home (/) [public] — landing';
  const paths = extractDocPaths(doc);
  assert.ok(paths.has('/'));
});

// -----------------------------------------------------------------------------
// End-to-end coverage against the real files: the gate must currently pass.
// -----------------------------------------------------------------------------
test('every real App.jsx route is documented in website-features.txt', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const appSrc = fs.readFileSync(
    path.join(__dirname, '..', 'web', 'src', 'App.jsx'),
    'utf8'
  );
  const docSrc = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'website-features.txt'),
    'utf8'
  );
  const routes = extractRoutes(appSrc);
  const docPaths = new Set([...extractDocPaths(docSrc)].map(normalize));
  const missing = [...routes]
    .filter((r) => !IGNORED_PATHS.has(r))
    .filter((r) => !docPaths.has(normalize(r)));
  assert.deepStrictEqual(missing, [], `undocumented routes: ${missing.join(', ')}`);
});
