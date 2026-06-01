---
name: Post-merge GitHub divergence handling
description: How post-merge.sh auto-reconciles platform re-commit forks, and the only remaining case that defers.
---

# Post-merge GitHub mirror divergence

`scripts/post-merge.sh` pushes the merged commit to GitHub `origin/main` as a mirror.
The platform routinely re-commits each merge under a *different* SHA on `origin`, so
`origin/main` diverging from local is the **normal mode of operation**, not an error.

The self-heal force-with-lease pushes local HEAD **whenever it can prove no real remote
work would be lost**, handling four cases in order:
1. remote is an ancestor of HEAD (strictly ahead) → safe.
2. `diff(remote..HEAD)` touches only allowed paths
   (`artifacts/mockup-sandbox/src/.generated/`, `attached_assets/`) → safe.
3. **remote tip is a re-commit of a recent local ancestor** → safe. This is the case
   that used to require a manual reconciliation task on every queued batch of merges.
4. anything else (genuine remote-only work) → **defer** (warn + `exit 0`, non-fatal).

**The case-3 trap (was the recurring manual-push pain):** when local has advanced many
commits past the point the platform re-committed, remote is no longer an ancestor AND
`diff(remote..HEAD)` shows ALL your newer work — so a naive "do trees differ in real
source?" check wrongly concludes genuine divergence and defers. The correct question is
"does `remote_sha`'s tree match ANY recent local ancestor's tree (modulo allowed paths)?"
If yes, every byte on remote is already contained in local history → lossless force-push.
The hook walks `git rev-list --max-count=120 HEAD` and compares each ancestor's tree to
`remote_sha` via the `only_allowed_paths` helper.

**Why case 4 still defers:** a force-with-lease there could clobber real remote work, and
lossless reconciliation needs a merge commit + conflict resolution (e.g.
`src/data/patchNotes.js`, which both sides edit) that a non-interactive hook must not
attempt. Failing the hook would make every subsequent merge report `SETUP_FAILED` even
though deps/migrations/builds succeeded, so it's downgraded to a deferred warning.

**Who reconciles case 4:** the main agent CANNOT — `git commit`/`merge`/`rebase`/`reset`/
`fetch`/force-push are hard-blocked in its bash sandbox (even fetch-by-SHA trips the
maintenance.lock interceptor). It's owned by the dedicated "push outstanding commits to
GitHub" background task, which runs with git privileges.

**Two distinct push-blocking causes (don't conflate):** (a) patch-note `version`
collisions — fixed separately by `scripts/dedupe-patch-notes.js` auto-bumping + committing
in post-merge; (b) this fork divergence. Fixing one does not fix the other.

**How to apply:** A post-merge GitHub push that "defers" is only expected now when
`remote_sha` is genuinely NOT a re-commit of any recent local ancestor. If you see it
deferring for a normal queued-merge batch, suspect the ancestor-match window
(`--max-count=120`) is too small or the allowed-paths list drifted. Do NOT broaden the
allow-list to cover arbitrary source divergence — case 4's refusal is the guardrail
against clobbering real remote commits.
