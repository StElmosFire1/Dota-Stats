# Dedicated Server Runbook — OCE Inhouse (Sydney SYD1)

**Target:** DigitalOcean Droplet — 4 vCPU / 8 GB RAM / 160 GB SSD, Ubuntu 24.04, Sydney (SYD1)  
**App edition:** Full edition only (`oceinhouse.gg`). Community edition is untouched.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| **[DROPLET]** | Run this on the DigitalOcean droplet (SSH as root) |
| **[APP]** | Set this in the app's Replit secrets / prod environment |
| **[ONCE]** | One-time setup step |
| **[RECURRING]** | Must repeat on rebuild / upgrade |

---

## 1. Droplet initial setup [ONCE]

```bash
# [DROPLET] Update base system
apt update && apt upgrade -y

# [DROPLET] Install runtime dependencies
apt install -y lib32gcc-s1 libsdl2-2.0-0 lib32stdc++6 curl wget tar
```

---

## 2. SteamCMD install [ONCE]

```bash
# [DROPLET] Create a dedicated user to run the Dota 2 server
useradd -m -s /bin/bash steam

# [DROPLET] Install SteamCMD into /opt/steamcmd
mkdir -p /opt/steamcmd
curl -sqL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" \
  | tar -C /opt/steamcmd -xz
chown -R steam:steam /opt/steamcmd
```

---

## 3. Dota 2 Dedicated Server install [ONCE] [RECURRING on major updates]

```bash
# [DROPLET] Run as the steam user
su - steam
/opt/steamcmd/steamcmd.sh \
  +force_install_dir /opt/dota2 \
  +login anonymous \
  +app_update 570 validate \
  +quit
```

> **App ID 570** is the Dota 2 Dedicated Server depot. The install puts the game at `/opt/dota2/`.  
> Re-run this command to update. Expect ~15–20 GB download on first install.

---

## 4. Server config [ONCE]

```bash
# [DROPLET] Create the config directory if it doesn't exist
mkdir -p /opt/dota2/game/dota/cfg
```

Create `/opt/dota2/game/dota/cfg/server.cfg` with the content below.  
Replace `<RCON_PASSWORD>` and `<SV_PASSWORD>` with your real values.

```
// /opt/dota2/game/dota/cfg/server.cfg
hostname "OCE Inhouse"
sv_password ""               // cleared on start; the app pushes it via RCON per match
rcon_password "<RCON_PASSWORD>"
sv_lan 0
tv_enable 0
sv_cheats 0
// Keep alive between matches so the RCON port stays open
sv_hibernate_when_empty 0
```

> `sv_password` is intentionally blank here — the app pushes a fresh per-match password via  
> RCON each time the draft completes. `rcon_password` must match `DEDICATED_SERVER_RCON_PASSWORD`  
> exactly (case-sensitive).

---

## 5. Firewall / UFW ports [ONCE]

```bash
# [DROPLET]
ufw allow 22/tcp comment 'SSH'
ufw allow 27015/tcp comment 'Dota2 RCON + server browser'
ufw allow 27015/udp comment 'Dota2 game traffic'
ufw allow 27020/udp comment 'SourceTV (optional, can skip)'
ufw enable
ufw status verbose
```

Also open the same ports in the **DigitalOcean Cloud Firewall** attached to the droplet  
(Networking → Firewalls → Inbound rules):

| Type | Protocol | Port(s) | Source |
|------|----------|---------|--------|
| Custom | TCP | 27015 | All IPv4, All IPv6 |
| Custom | UDP | 27015 | All IPv4, All IPv6 |
| SSH | TCP | 22 | Your management IP |

---

## 6. Replay directory [ONCE]

The app fetches replays over SFTP from this directory after each match:

```bash
# [DROPLET]
mkdir -p /opt/dota2/game/dota/replays
chown steam:steam /opt/dota2/game/dota/replays
```

`DEDICATED_SERVER_REPLAY_DIR` in the app config defaults to `/opt/dota2/game/dota/replays`.  
Override if you use a different path.

---

## 7. systemd service [ONCE]

Create `/etc/systemd/system/dota2.service`:

```ini
[Unit]
Description=Dota 2 Dedicated Server
After=network.target

[Service]
User=steam
Group=steam
WorkingDirectory=/opt/dota2
ExecStart=/opt/dota2/game/srcds_run \
  -game dota \
  -dedicated \
  +map dota \
  +sv_lan 0 \
  +maxplayers 16 \
  -port 27015 \
  +exec server.cfg
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# [DROPLET] Enable and start
systemctl daemon-reload
systemctl enable dota2
systemctl start dota2
systemctl status dota2
```

> Check the logs: `journalctl -u dota2 -f`  
> Expected: you should see `Host activate: Loading map "dota"` and a line confirming  
> the RCON password is set.

---

## 8. SSH key for replay retrieval [ONCE]

The app connects to the droplet via SSH/SFTP to pull `.dem` files after each match.

```bash
# [LOCAL] Generate a dedicated keypair (no passphrase — the app reads it as a string)
ssh-keygen -t ed25519 -C "oi-replay-fetch" -f ~/.ssh/oi_replay_ed25519 -N ""

# Copy the public key to the droplet
# [DROPLET]
mkdir -p /root/.ssh && chmod 700 /root/.ssh
# Paste the contents of ~/.ssh/oi_replay_ed25519.pub into:
echo "ssh-ed25519 AAAA... oi-replay-fetch" >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
```

Then set the private key in the app (see §9 below — `DEDICATED_SERVER_SSH_PRIVATE_KEY`).  
Newlines in the key must be preserved; see the secrets table for the correct format.

---

## 9. App secrets [APP]

Set these in **Replit Secrets** (or the prod environment `.env`):

| Secret | Example value | Notes |
|--------|--------------|-------|
| `DEDICATED_SERVER_IP` | `165.x.x.x` | Droplet public IPv4 |
| `DEDICATED_SERVER_PORT` | `27015` | Default; omit to use default |
| `DEDICATED_SERVER_RCON_PASSWORD` | `s3cr3t-rcon` | Must match `rcon_password` in `server.cfg` |
| `DEDICATED_SERVER_SSH_HOST` | `165.x.x.x` | Defaults to `DEDICATED_SERVER_IP` if omitted |
| `DEDICATED_SERVER_SSH_PORT` | `22` | Default; omit to use default |
| `DEDICATED_SERVER_SSH_USER` | `root` | Or whichever user owns the replay dir |
| `DEDICATED_SERVER_SSH_PRIVATE_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----\n...` | Full PEM, newlines as `\n` in the secret value |
| `DEDICATED_SERVER_REPLAY_DIR` | `/opt/dota2/game/dota/replays` | Default; omit to use default |
| `DEDICATED_SERVER_STEAM_ID` | `90xxxxxx` (64-bit) | Optional — GC server assignment hint |

> **SSH private key format:** store the entire key including `-----BEGIN` / `-----END` lines.  
> In Replit Secrets the value is stored verbatim; the app reads it as `process.env.DEDICATED_SERVER_SSH_PRIVATE_KEY`.

---

## 10. Verify with the Admin Panel [APP]

1. Open Admin Panel → **Bot** tab → **🔌 Test: Provision & Connect**.
2. Click **↺ Refresh** — RCON, SSH, and Replay dir dots should all be green.
3. Click **🚀 Run Diagnostic Provision** — you should get a steam:// link and a live status readout.
4. Click **🎮 Connect to Server** in Dota 2 — you should load into the `dota` map.
5. Hit **↺ Refresh** again — player count in the status output should show 1.
6. Click **🧹 Cleanup** when done.

See the collapsible **Host → Join verification checklist** inside the admin card for the full pass/fail expectations and common failure causes.

---

## 11. Updating the server [RECURRING]

```bash
# [DROPLET] Update Dota 2 server binaries
systemctl stop dota2
su - steam -c "/opt/steamcmd/steamcmd.sh \
  +force_install_dir /opt/dota2 \
  +login anonymous \
  +app_update 570 validate \
  +quit"
systemctl start dota2
```

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| RCON: `connection refused` | Server not running | `systemctl start dota2` |
| RCON: `timeout` | Port 27015 TCP blocked | Check UFW + DO firewall |
| RCON: `auth failed (wrong password)` | Password mismatch | Compare `DEDICATED_SERVER_RCON_PASSWORD` with `rcon_password` in `server.cfg` |
| SSH: `authentication failed` | Wrong key or user | Check `DEDICATED_SERVER_SSH_USER`, re-copy public key to `authorized_keys` |
| Replay dir: `No such file or directory` | Dir not created | Run `mkdir -p /opt/dota2/game/dota/replays` on droplet |
| Dota client can't connect | UDP 27015 blocked | Add UDP 27015 rule in DO firewall and UFW |
| `server_failed` banner in `/inhouse` | RCON push failed at draft complete | Use **Retry** on lobby page, or re-run from admin panel; check server is running |
