---
name: Hero icon rendering
description: How to resolve Dota hero CDN icons reliably; the hero_name column format is inconsistent.
---

# Resolving hero portrait icons

Render hero icons from **`hero_id`** via the id→slug map in `heroNames.js`
(`getHeroImageUrl`), not from a naive display-name slug.

**Why:** Dota's CDN slugs use legacy internal codenames that differ from display
names — e.g. Nature's Prophet → `furion`, Windranger → `windrunner`, Zeus →
`zuus`, Wraith King → `skeleton_king`, Outworld Destroyer → `obsidian_destroyer`.
Lowercasing + spaces→underscores on the display name 404s for ~20 heroes.

**Also:** `player_stats.hero_name` is **not** a single consistent format — some
rows store the display name ("Dark Seer"), others the npc machine name
("npc_dota_hero_death_prophet"). `hero_id` is the only reliably-populated,
format-stable key. Always prefer it; treat `hero_name` as a label/fallback.

**How to apply:** When a query feeds hero icons to the frontend, include the hero
id alongside whatever name field the consumer expects, and pass the id to the
icon component so the id→slug map (which knows the legacy codenames) wins.
