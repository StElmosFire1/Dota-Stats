---
name: Safe site guide captures
description: Read-only capture constraints for the live full edition and its automation role.
---

An automation superuser session does not provide a Steam player/coach identity.
Keep personal and coaching gaps explicit rather than treating staff access as
permission to impersonate a player.

**Why:** The signed-in UI checks a player identity independently of elevated
authorization. A forbidden staff API can also trigger the shared reauthentication
modal and obscure subsequent tabs even when automation login succeeded.

**How to apply:** Obtain explicit owner authorization for privileged captures,
isolate tab visits, and use only supported machine authentication for read-only
same-origin requests. Never distribute browser session storage. Wait for primary
loading indicators with a bounded deadline before calling a screenshot rendered.
Generate packages only after capture finishes: pruning unused assets during a
capture can delete newer evidence that has not yet entered the final manifest.

Generated guide files may not accompany a task merge even when asset metadata
does. Metadata entries alone do not prove the owner can access the downloads.

**Why:** The owner could see older assets in Library but not the merged guide;
the main workspace had the capture scripts and asset records, not the files.

**How to apply:** Verify files exist in the delivering workspace and present the
actual ZIPs in the current chat. Never direct the owner to Library based solely
on asset metadata. A fresh privileged capture requires explicit authorization.
