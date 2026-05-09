# Voice Packs (Task #206 — v6.62, audio recorded in Task #216)

Pro-only audio cosmetics. Each pack is a directory `voice-packs/<pack-id>/` containing
one MP3 per event slot:

- match-start.mp3
- first-blood.mp3
- win.mp3
- loss.mp3
- level-up.mp3
- achievement-unlock.mp3

The shipping audio is real spoken voice lines — no longer church-bell placeholders.
Each pack uses a distinct voice profile / pace / pitch so the upsell sounds
different from the free chime and from the other Pro packs:

- **captain** — authoritative team-caller barks (en-us male, firm pace, low pitch).
- **hype** — high-energy esports caster (en-us male, fast pace, higher pitch).
- **calm** — measured strategic coach (en-us male, slow pace, smooth low pitch).
- **roast** — friendly smack-talk one-liners (en-us male, mid pace, mocking).
- **cinematic** — movie-trailer voice-over (en-gb male, very slow, very deep).

The lines are synthesised by `scripts/generate-voice-packs.sh` (espeak-ng → ffmpeg
mp3 96 kbps mono 44.1 kHz). Re-run that script to regenerate every slot if the
script copy changes; replace any individual file by hand if a higher-quality
human-recorded take becomes available. The hook (`useInhouseAlerts`) falls back
to the church bell if a file 404s, so missing slots remain safe.

The canonical pack list lives in `web/src/profileCosmetics.js`
(`PREMIUM_VOICE_PACKS` / `VOICE_PACK_EVENTS` / `VOICE_PACK_META`) and is mirrored
in `src/profileCosmetics.js` (server CJS).
