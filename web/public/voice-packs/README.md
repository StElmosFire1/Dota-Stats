# Voice Packs (Task #206 — v6.62)

Pro-only audio cosmetics. Each pack is a directory `voice-packs/<pack-id>/` containing
one MP3 per event slot:

- match-start.mp3
- first-blood.mp3
- win.mp3
- loss.mp3
- level-up.mp3
- achievement-unlock.mp3

The shipping files are placeholder copies of `sounds/church-bell-v603.mp3` so the
plumbing (`useInhouseAlerts`, settings picker, server validation, DB column) can
be exercised end-to-end. Replace each MP3 with the real voice line for that pack/
event when the audio assets land. The hook falls back to the church bell if a
file 404s, so missing slots are safe.

The canonical pack list lives in `web/src/profileCosmetics.js`
(`PREMIUM_VOICE_PACKS` / `VOICE_PACK_EVENTS` / `VOICE_PACK_META`) and is mirrored
in `src/profileCosmetics.js` (server CJS).
