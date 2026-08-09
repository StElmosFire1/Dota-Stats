---
name: GitHub push path
description: How to push this repo to GitHub when the built-in git push callback fails
---
The sandbox `gitPush` callback fails here with `CLI_ERROR: BRANCH_ALREADY_EXISTS`, and plain `git push origin main` fails auth (stored https creds invalid).

**How to apply:** push with the PAT secret inline, masking it in output:
`git push "https://x-access-token:${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/StElmosFire1/Dota-Stats.git" main` (pipe stderr through sed to strip the token). Verify with a token-authed fetch + `git log FETCH_HEAD..HEAD`.
Note: `git remote -v` lists hundreds of subrepl remotes; grep for `^origin` to find the real GitHub remote.
**Why:** two push paths silently/confusingly fail; this avoids re-diagnosing each session.
