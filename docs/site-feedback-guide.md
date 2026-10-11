# Annotated site feedback guide

This is a documentation/capture project, not a website redesign. No app code,
feature flags or authorization rules are changed.

## Outputs

Generated files are deliberately excluded from Git and deployment:

- `generated-artifacts/site-feedback/OCE-Inhouse-guide.html`: standalone main guide.
- `generated-artifacts/site-feedback/OCE-Inhouse-guide.zip`: portable main guide
  (`index.html`, `media/`, `coverage.json`, opening instructions).
- `generated-artifacts/site-feedback/PRIVATE-appendix.html`: standalone private appendix.
- `generated-artifacts/site-feedback/PRIVATE-appendix.zip`: separately packaged appendix.
- `generated-artifacts/site-feedback/validation.json`: offline validation results.

Share only the main guide with general reviewers. Keep the appendix with the
owner and approved staff. Neither document needs an app server or Replit account.
Extract a ZIP completely before opening `index.html`; do not move it away from
its media folder. Browser Print / Save as PDF uses the print layout.

## Capture and reproduction

Scripts:

- `scripts/site-feedback/inventory.mjs`: reconciles full-edition React routes,
  aliases, nested settings routes, tabs, sections, server-rendered surfaces and
  shared UI surfaces. Source-only states stay explicitly source-only.
- `scripts/site-feedback/notes.mjs`: editorial page explanations.
- `scripts/site-feedback/capture.mjs`: actual read-only Playwright screenshots
  with numbered callouts, separate anonymous/admin contexts and private masking.
- `scripts/site-feedback/build.mjs`: builds independent offline documents.
- `scripts/site-feedback/validate.mjs`: packages and extracts the ZIPs into a
  temporary directory, checks coverage, local images, navigation, callout bounds,
  offline operation, feedback copying, responsive layout and print samples.

Do not rerun privileged captures without the owner's explicit authorization.
The only permitted POST is the existing automation login, before capture.
Credentials come from workspace Secrets and are never written to browser
storage files or capture metadata. The capture target is pinned to the actual
OCE domain; do not forward its credentials to another host.

```sh
# Only after owner authorization; browser prerequisites must already be installed.
GUIDE_AUTHORIZE_ADMIN=1 GUIDE_SURFACES=1 node scripts/site-feedback/capture.mjs
node scripts/site-feedback/build.mjs
node scripts/site-feedback/validate.mjs
```

`GUIDE_ONLY=PlayerProfile,AdminPanel` can refresh selected families while keeping
the existing evidence for other families. This is useful for a slow-loading
record or a separately reviewed tab. Building prunes unreferenced older media
so obsolete screenshots do not accidentally travel in a package.

## Boundaries and evidence

- Browser captures are live production observations. The local reference revision
  is recorded, but must not be claimed as the deployed revision.
- An automation superuser session is not a player/coach Steam identity. Account
  and coaching gates are reported, not bypassed.
- Browser writes are blocked. Analytics and auto-write features can therefore be
  suppressed; do not misreport that as an app defect.
- GET routes known to mutate state, including signed unsubscribe links, are not
  visited. No purchases, submissions, queues, notifications, destructive actions,
  credential creation or payment handling are demonstrated.
- Public records are selected from public index links; no invented player,
  tournament or private review IDs are used to suggest successful coverage.
- Private screenshots mask dynamic values, inputs and record visuals before
  saving. They still require a visual privacy review before distribution.
- The main guide has no private media references, external asset requests, form
  submission endpoint or dependency on app source.
- Redacted screenshots must not be described as showing hidden values. Missing
  role access, empty data, loading deadlines and missing records remain explicit.

## Giving feedback

Use one report per issue:

```text
Page: page-heroes
Callout: page-heroes-default-c1
Issue:
Suggestion:
Priority: low / medium / high
```

The guide distinguishes observed symptoms from neutral review questions and
possible improvements. No feedback is sent anywhere by the offline HTML.
