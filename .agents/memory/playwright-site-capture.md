---
name: Headless Playwright capture of oceinhouse.gg
description: How to capture full-page screenshots of the live full-edition site headlessly, and its anon-state quirks.
---

# Headless Playwright capture of the live site

Used for the clone-evidence dossier (`docs/clone-evidence/.../screenshots/ours-<page>.jpg`) via `scripts/capture-ours-clone-evidence.js`.

**Chromium needs system libs on this Nix host.** `npx playwright install chromium` alone is not enough — the binary fails with `libglib-2.0.so.0: cannot open shared object file`. Install via `installSystemDependencies` (Nix attrs, not apt): glib, nss, nspr, at-spi2-atk, at-spi2-core, cups, dbus, libdrm, gtk3, pango, cairo, expat, alsa-lib, mesa, atk, xorg.libX11, xorg.libXcomposite, xorg.libXdamage, xorg.libXext, xorg.libXfixes, xorg.libXrandr, xorg.libxcb, libxkbcommon. (`libgbm` is NOT a valid Nix attr — mesa provides gbm.)

**Capture gotchas:**
- Use `waitUntil:'domcontentloaded'` + a short `networkidle` race + a fixed settle. `networkidle` alone hangs forever (the app polls / holds websockets).
- A first-visit **"Welcome to the new OCE Inhouse" modal** overlays the center of every page until dismissed — click the `Dismiss` button (role=button, name=/dismiss/i) once per context before screenshotting, or it obscures content.
- `fullPage:true` screenshots occasionally hang on heavy pages — give each page a hard `timeout` (e.g. `timeout 60 node ...`) so one bad page can't block a batch run.

**Anon-state quirks observed (live prod, logged-out):**
- `/inhouse` ("Play") renders a completely **empty body** for anonymous visitors (sign-in required) — no content, no CTA.
- `/hall-of-fame` shows **"Failed to load Hall of Fame data"** for anonymous visitors.
