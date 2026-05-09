#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_ROOT="$ROOT/web/public/voice-packs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ESPEAK="${ESPEAK:-espeak-ng}"
if ! command -v "$ESPEAK" >/dev/null 2>&1; then
  ESPEAK="$(nix-shell -p espeak-ng --run 'command -v espeak-ng')"
fi
FFMPEG="${FFMPEG:-ffmpeg}"

synth() {
  local pack="$1" event="$2" voice="$3" speed="$4" pitch="$5" amp="$6" text="$7"
  local wav="$TMP/${pack}-${event}.wav"
  local out="$OUT_ROOT/$pack/$event.mp3"
  "$ESPEAK" -v "$voice" -s "$speed" -p "$pitch" -a "$amp" -w "$wav" "$text"
  "$FFMPEG" -y -loglevel error -i "$wav" \
    -ac 1 -ar 44100 -codec:a libmp3lame -b:a 96k \
    -af "aresample=44100,dynaudnorm=f=200:g=15" \
    "$out"
  echo "wrote $out"
}

# captain — authoritative team caller, male, lower pitch, firm pace
synth captain match-start         en-us+m3 145 30 200 "Lock in. Game on."
synth captain first-blood         en-us+m3 145 30 200 "First blood. Press the advantage."
synth captain win                 en-us+m3 145 30 200 "Victory secured. Well played, team."
synth captain loss                en-us+m3 145 30 200 "Defeat. Regroup and reset."
synth captain level-up            en-us+m3 145 30 200 "Level up. Stay focused."
synth captain achievement-unlock  en-us+m3 145 30 200 "Achievement unlocked. You earned it."

# hype — high-energy esports caster, fast, higher pitch
synth hype match-start         en-us+m4 200 70 200 "Here we go! The match is starting!"
synth hype first-blood         en-us+m4 210 75 200 "First blood! Oh my god, what a play!"
synth hype win                 en-us+m4 205 72 200 "Victory! What an incredible game!"
synth hype loss                en-us+m4 195 65 200 "Tough loss, but what a fight!"
synth hype level-up            en-us+m4 205 72 200 "Level up baby! Power spike incoming!"
synth hype achievement-unlock  en-us+m4 205 75 200 "Achievement unlocked! You absolute legend!"

# calm — measured strategic coach, slower, smooth
synth calm match-start         en-us+m2 130 35 180 "The match begins. Breathe, focus, execute."
synth calm first-blood         en-us+m2 130 35 180 "First blood taken. Maintain composure."
synth calm win                 en-us+m2 130 35 180 "Victory. Reflect on what worked."
synth calm loss                en-us+m2 125 32 180 "A loss. Learn, adjust, and continue."
synth calm level-up            en-us+m2 130 35 180 "Level gained. Use it wisely."
synth calm achievement-unlock  en-us+m2 130 35 180 "Achievement earned. Steady progress."

# roast — friendly smack talk, mid pace, mocking
synth roast match-start         en-us+m5 165 55 200 "Match starting. Try not to feed this time."
synth roast first-blood         en-us+m5 165 58 200 "First blood! Who's the unlucky donor?"
synth roast win                 en-us+m5 165 55 200 "A win? Did they even queue up to play?"
synth roast loss                en-us+m5 160 50 200 "Loss. Wow, that was rough to watch."
synth roast level-up            en-us+m5 165 55 200 "Level up. Took you long enough."
synth roast achievement-unlock  en-us+m5 165 55 200 "Achievement unlocked. Even you got one."

# cinematic — movie-trailer voice over, very slow, very deep, British baritone
synth cinematic match-start         en-gb+m1 110 18 200 "In a world of legends... the battle begins."
synth cinematic first-blood         en-gb+m1 105 15 200 "And so... the first to fall."
synth cinematic win                 en-gb+m1 105 15 200 "Triumph. Etched into eternity."
synth cinematic loss                en-gb+m1 100 12 200 "Defeat... but the saga continues."
synth cinematic level-up            en-gb+m1 110 18 200 "Power ascends. Destiny calls."
synth cinematic achievement-unlock  en-gb+m1 105 15 200 "A legend is born this day."

echo "all voice packs regenerated."
