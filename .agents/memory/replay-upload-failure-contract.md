---
name: Replay upload failure contract
description: Scope and transport constraints for reliable replay parser errors
---

Replay integration changes are community-only unless the user approves full-edition work. Keep legacy Java success bodies compatible; introduce stricter completeness requirements through an opt-in contract.

**Why:** The user explicitly scoped replay error handling to the community integration and required approval before full-edition changes.

**How to apply:** Shared Java handler safety fixes may be needed, but do not migrate the full-edition Node client as incidental cleanup.

Do not rely solely on node-fetch v2 body-reading timeouts to detect dropped parser responses. A response that closes before its advertised content length can leave the body promise hanging.

**Why:** A local HTTP regression server reproduced this with a partial response; native HTTP aborted/complete handling rejected it immediately.

**How to apply:** Keep an explicit full-request deadline and premature-response-close checks when changing replay transport. Exercise early decoding failure with a large unread upload body as well: replying before draining it can replace the real error with a send failure.
