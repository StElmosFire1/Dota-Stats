# OCE Inhouse — Twitch extension companion

Read-only Twitch extension that surfaces an OCE Inhouse player's rank, win/loss
streak, and last 5 matches from inside the Twitch player. Built for Task #380.

## Surfaces

## Manifest

Twitch does not embed a manifest inside the uploaded zip — the canonical
extension metadata lives in the Developer Console form. `manifest.json` at
the root of this directory is the **source-of-truth document** for the
values to enter into that form (asset paths, anchor types, allowlisted
fetch domains, version). Keep it in sync with whatever is submitted so the
next operator can see exactly what was last shipped without logging into
the Twitch dashboard.

## Surfaces

| File | Twitch view | What it does |
|---|---|---|
| `config/index.html`        | Broadcaster config page | Paste your `oceinhouse.gg` account id; saved into Twitch's `configuration` service so the panel + overlay can read it on every viewer load. |
| `panel/index.html`         | Panel (always under the player) | Rank chip, W/L streak, last 5 matches; first row hover-expands to KDA / GPM / XPM. |
| `video_overlay/index.html` | Video overlay (viewer opt-in) | Tiny floating chip — live presence + current rank — pinned to the top-right corner of the player. |
| `test/index.html`          | Local smoke harness | Hosts all three iframes side-by-side and simulates the Twitch helper (`window.Twitch.ext.*`) so you can develop without packaging. |

All four pages are **vanilla JS** (no React, no bundler) so the final `.zip`
uploaded to Twitch is well under the 10 MB ceiling.

## Public API contract

The extension never holds any secret. It hits these unauthenticated, read-only
endpoints on the OCE Inhouse production server:

- `GET https://oceinhouse.gg/api/overlay/ticker/<accountId>` — rank, tier,
  win-rate, current streak, MMR (respects the streamer's privacy toggles).
- `GET https://oceinhouse.gg/api/players/<accountId>/recent-matches?limit=5`
  — last 5 matches (hero, KDA, GPM, XPM, result).
- `GET https://oceinhouse.gg/api/overlay/live/current?for=<accountId>` —
  current inhouse lobby presence (used by the video overlay's "live now" dot).

All three set `Cache-Control: no-store`. The extension polls each one on a
**30 s tick** (Twitch extension policy is one request per ≥2 s; we are well
inside that). The production CORS allowlist accepts any `*.ext-twitch.tv`
origin (added in `src/web/server.js` for Task #380) so the iframes can read
the JSON directly.

## Local development

```bash
# from the repo root — no install needed, the harness is pure static HTML
npx --yes http-server twitch-extension -p 4400
# → open http://localhost:4400/test/index.html
```

The harness stubs `window.Twitch.ext` so the config page can save (to
`localStorage`), and the panel + overlay read that same value back. Switch
accounts by editing the input on the config iframe and clicking *Save* — the
panel/overlay re-poll within 30 s. To force an immediate refresh, click the
*Refresh now* button at the top of the harness.

## Packaging for upload to Twitch

1. From the Twitch Developer Console, create a new extension. Pick **Panel**
   and **Video Overlay** as the supported anchor types. Note the generated
   client id and version (e.g. `0.0.1`).
2. Set the asset paths to:
   - **Config**: `config/index.html`
   - **Panel**: `panel/index.html`
   - **Video Overlay**: `video_overlay/index.html`
3. Add `https://oceinhouse.gg` to the *Allowlist for URL Fetching Domains*
   (Console → Capabilities). Without this Twitch's CSP blocks the `fetch()`
   calls from inside the iframe.
4. Zip the four directories at the root of `twitch-extension/`. **`shared/`
   must be included** — every surface HTML file imports
   `../shared/styles.css` and `../shared/api.js`, so omitting it leaves the
   hosted iframe with no styling and no fetch helpers (panel/config/overlay
   silently fail). The provided `npm run package` script does this for you:

   ```bash
   cd twitch-extension
   npm run package    # → oi-twitch-ext.zip with config/ panel/ video_overlay/ shared/
   ```

   The README, `package.json`, and `test/` directory are intentionally
   excluded from the upload — only the three surface dirs plus `shared/`
   are needed by Twitch's hosted iframe runtime.
5. Upload the zip on the *Files* tab. Move the version to *Hosted Test* →
   then *Released*. Manual review by Twitch staff is the last gate (out of
   scope for this task).

## Out of scope

- Per-viewer personalisation (would need Twitch OAuth).
- Writing to Twitch chat.
- Submitting / shepherding the extension through Twitch review.

## Edition scope

**Full edition only.** Community edition has no overlay endpoints and no
matching settings tile.
