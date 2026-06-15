---
name: Mockup/canvas workflow gotchas
description: Non-obvious failure modes when generating mockup-sandbox components via DESIGN subagents and verifying them via screenshots.
---

# Mockup / canvas workflow gotchas

## DESIGN subagents emit over-escaped template literals
DESIGN subagents sometimes write JS template literals into `.tsx` files with the
backticks and `${` **escaped** (`\`` and `\${`), e.g. ``style={{ animationDelay: \`\${i*15}ms\` }}``.
Vite's react-babel plugin then fails the whole route with
`Expecting Unicode escape sequence \\uXXXX` and the canvas shows a full-screen error overlay.

**How to apply:** after subagents finish, grep every generated `.tsx` for `\\\`` / `\\${`
before screenshotting. Fix in bulk: `perl -pi -e 's/\\\`/\`/g; s/\\\$\{/\${/g' <files>`.
Confirm the real served state by curling vite's transformed module
(`/__mockup/src/components/mockups/<group>/<C>.tsx`) — a clean transform returns HTTP 200
with no `Expecting Unicode`/`Transform failed` text; a 500 carries the error.

## external_url screenshots are cached — stale results look like unfixed bugs
The `screenshot` tool's `external_url` mode caches by URL. After fixing a build error you can
get **byte-identical stale** screenshots (old error overlay, or a blank-white mid-reload frame)
even though the code is fixed and logs are clean. Bust it by appending a throwaway query param
(`?cb=2`) to the preview URL. The mockup preview route ignores unknown query params.

Also: `app_preview` screenshots hit the main app port (5000), NOT the mockup server — always
use `external_url` with the full `/__mockup/preview/<group>/<Component>` dev URL for mockups.

## presentArtifact id for the mockup sandbox
`presentArtifact({ artifactId, shapeIds })` — the artifactId is **`artifacts/mockup-sandbox`**
(the full path id from the artifacts list), not the slug `mockup-sandbox`. getCanvasState only
returns shapes near the current viewport; shapes far away (large y) won't appear in
focusedShapes — you still have their deterministic ids from when you created them.
