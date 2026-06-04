---
name: Dota dedicated server topology (prod ops)
description: How the live OCE Inhouse dedicated Dota 2 server is wired to the bot host; prod infra, not in the repo.
---

# Dedicated server is a SEPARATE host from the bot

The Dota 2 dedicated game server runs on its OWN DigitalOcean droplet (Sydney syd1), NOT on the bot/website host. This is the single biggest gotcha — the deploy table in replit.md ("prod host with ~/Dota-Stats-Full + pm2") describes the BOT host, which is a different machine from the game server.

- **Game server droplet**: public IP `134.199.166.223` (`ubuntu-s-4vcpu-8gb-amd-syd1`). Has ONLY the game server — no node, no pm2, no checkout, no `.env`.
  - systemd unit `dota-server.service` → `/opt/dota2/start_server.sh` → dota2 `-dedicated -ip 0.0.0.0 -usercon +sv_hibernate_when_empty 0 +rcon_password "…" +map dota`. `-ip 0.0.0.0` is required so RCON's TCP listener binds publicly; `+sv_hibernate_when_empty 0` stops the empty-server self-quit.
  - Replays at `/opt/dota2/game/dota/replays`. Updated via SteamCMD app `1628350`.
- **Bot host**: public IP `170.64.182.110` (`root@Dota-Stats`, checkout `~/Dota-Stats-Full`, pm2 `oi-bot`, node 20, the live `.env`). All `DEDICATED_SERVER_*` env vars + `pm2 restart oi-bot` belong HERE.

**Why:** the Admin Panel "Test: Provision & Connect" diagnostic + serverReplayFetcher run from the bot host and reach the droplet over the public internet, so `DEDICATED_SERVER_IP` / `_SSH_HOST` must be the droplet's PUBLIC IP, and the droplet's RCON (TCP 27015) + SSH (22) must be reachable from the bot host.

**SSH replay-fetch key**: keypair generated on the bot host at `~/.ssh/oi_replay` (private), its `.pub` appended to the droplet's `/root/.ssh/authorized_keys`. The private key is stored in the bot-host `.env` as `DEDICATED_SERVER_SSH_PRIVATE_KEY="…"` (multiline; dotenv ^17 handles it; ssh2 gets it raw).

**Recurring gotcha**: log line `Version out of date (GC wants NNNN, we are MMMM)` means the droplet build is behind; fix with a SteamCMD `app_update 1628350` (server stopped, or restart after). The watchdog (serverHealthMonitor) with `DEDICATED_SERVER_ALLOW_SSH_RESTART=1` will SSH-restart `dota-server.service` on RCON health failure — it can catch the server mid-restart and momentarily show `ECONNREFUSED` in the diagnostic even though the server is fine seconds later (compare the panel's "checked" time vs the journal's startup time before debugging further).
