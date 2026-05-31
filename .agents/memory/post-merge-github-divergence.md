---
name: Post-merge GitHub divergence handling
description: Why post-merge.sh treats genuine origin/main divergence as non-fatal, and who can actually reconcile it.
---

# Post-merge GitHub mirror divergence

`scripts/post-merge.sh` pushes the merged commit to GitHub `origin/main` as a mirror.
When local and remote have **genuinely forked** — `origin/main` carries a unique
commit local lacks (remote is NOT an ancestor of HEAD) AND the trees differ in real
source files (outside `artifacts/mockup-sandbox/src/.generated/` + `attached_assets/`)
— the self-heal **refuses to force-push** and now exits **0 (non-fatal)** instead of
failing setup.

**Why:** A force-with-lease in that state could clobber real remote work. Reconciling
losslessly needs a merge commit + conflict resolution (e.g. `src/data/patchNotes.js`,
which both sides routinely edit), which a non-interactive hook must never attempt. But
failing the hook makes EVERY subsequent merge report `SETUP_FAILED`, even though the
hook's real job (deps install, migrations, frontend builds) already succeeded. So the
divergence is downgraded to a warning; only the GitHub mirror sync is deferred.

**Who reconciles it:** The main agent CANNOT — `git commit`/`merge`/`rebase`/`reset`/
force-push are all hard-blocked in its bash sandbox. The divergence resolution (merge
both sides, then fast-forward push) is owned by the dedicated "push outstanding commits
to GitHub" background task, which runs with the privileges to do it.

**How to apply:** If you see a post-merge `SETUP_FAILED` whose only failing step is the
GitHub push with "refusing — local and remote trees differ ... AND remote is not an
ancestor", that is the expected non-fatal path now — don't try to force-push from the
main agent. Investigate divergence read-only (`git log --oneline <merge-base>..<remote>`
and `..HEAD`) to confirm local is the authoritative superset, then leave the actual push
to the reconciliation task. Do NOT broaden the script's force-push allow-list to cover
source divergence — that gate exists specifically to prevent clobbering remote commits.
