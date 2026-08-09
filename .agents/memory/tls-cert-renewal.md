---
name: TLS cert renewal on prod host
description: Why oceinhouse.gg's Let's Encrypt cert expired and how it's renewed/monitored now
---
- oceinhouse.gg's original cert was issued with certbot's **manual** plugin, which cannot auto-renew — `certbot renew` fails with "manual plugin is not working / --manual-auth-hook required" while other certs on the host (community edition, nginx plugin) renew fine.
- **Fixed 2026-08-09:** reissued via `certbot certonly --nginx --cert-name oceinhouse.gg -d oceinhouse.gg -d www.oceinhouse.gg`, keeping the same cert-name so nginx's `/etc/letsencrypt/live/oceinhouse.gg/` paths stay valid. Renewal conf is now nginx-based; certbot.timer handles future renewals.
- **How to apply:** if any cert on the host fails renewal with a manual-plugin error, reissue with `--nginx` and the same `--cert-name`. Nginx owns port 80 on the bot host.
- **Monitoring decision:** never trust the renewal machinery alone — the bot watches the LIVE served certificate daily and DMs the owner near expiry or when the check fails. When inspecting a possibly-expired cert programmatically you must disable TLS verification, or the handshake aborts before the dates are readable.
