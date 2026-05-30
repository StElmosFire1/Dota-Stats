#!/usr/bin/env bash
set -euo pipefail

# Task #575 — generate licensing-clean hero voice-line clips for the Voiceline
# daily game. We do NOT rehost Valve's copyrighted hero VO. Each clip is a short,
# self-generated text-to-speech rendition of a hero's iconic (un-copyrightable)
# catchphrase, written to src/games/voice-lines/<slug>.mp3 and kept in sync with
# the VOICE_LINES table in src/games/voiceData.js.
#
# Idempotent: by default only generates clips that don't already exist on disk so
# the original 25 hand-checked clips are preserved. Pass --force to regenerate all.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/src/games/voice-lines"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT_DIR"

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

ESPEAK="${ESPEAK:-espeak-ng}"
if ! command -v "$ESPEAK" >/dev/null 2>&1; then
  ESPEAK="$(nix-shell -p espeak-ng --run 'command -v espeak-ng')"
fi
FFMPEG="${FFMPEG:-ffmpeg}"

# slug|voice|speed|pitch|amp|text
# Voices rotated only for variety — the synth voice never reveals the hero, the
# player guesses from the line alone.
LINES=(
  "bane|en-us+m2|140|25|190|Sweet dreams."
  "bloodseeker|en-us+m4|160|55|200|Thirst for blood!"
  "drow_ranger|en-us+f3|150|45|190|Silence is golden."
  "mirana|en-us+f4|160|55|190|Starstorm!"
  "morphling|en-us+m3|150|40|190|Adapt, or die."
  "nevermore|en-us+m1|135|20|200|Your soul is mine."
  "phantom_lancer|en-us+m3|155|45|190|Many hands make light work."
  "puck|en-us+f4|175|65|190|Catch me if you can!"
  "razor|en-us+m4|160|55|200|Feel the static!"
  "sand_king|en-us+m3|150|40|200|Sandstorm!"
  "storm_spirit|en-us+m4|170|60|190|Lightning never strikes twice."
  "tiny|en-us+m1|130|18|200|Time to grow!"
  "vengefulspirit|en-us+f3|155|50|200|Vengeance will be mine!"
  "windrunner|en-us+f4|165|55|190|Right on target."
  "kunkka|en-us+m1|140|25|200|Boots on the ground!"
  "shadow_shaman|en-us+m5|165|60|200|Time for a shackle!"
  "slardar|en-us+m1|135|22|200|From the depths!"
  "lich|en-us+m2|140|30|190|Winter has come."
  "riki|en-us+m3|150|40|180|You never saw it coming."
  "enigma|en-us+m1|130|18|190|The void consumes all."
  "necrolyte|en-us+m2|140|28|190|Death is only the beginning."
  "warlock|en-us+m1|135|22|200|Chaos reigns!"
  "beastmaster|en-us+m1|145|28|200|Unleash the beasts!"
  "queenofpain|en-us+f4|160|55|190|Pain is pleasure."
  "venomancer|en-us+m3|150|40|190|Drown in venom!"
  "death_prophet|en-us+f2|145|35|190|The dead shall rise!"
  "pugna|en-us+m4|160|55|190|Decay!"
  "templar_assassin|en-us+f3|150|45|190|The Temple sends its regards."
  "viper|en-us+m3|150|40|190|Slither, and strike."
  "luna|en-us+f4|160|55|190|Lucent beam!"
  "dragon_knight|en-us+m1|140|25|200|Dragon form!"
  "dazzle|en-us+m5|160|55|190|Shadow wave!"
  "rattletrap|en-us+m4|165|55|200|Tick tock!"
  "leshrac|en-us+m3|155|45|190|Embrace the storm!"
  "furion|en-us+m2|145|35|190|Nature calls."
  "dark_seer|en-us+m3|150|40|190|Surge ahead!"
  "clinkz|en-us+m3|150|40|190|Burning arrows!"
  "omniknight|en-us+m1|140|25|200|Faith is my shield."
  "enchantress|en-us+f4|165|60|190|The forest protects me."
  "huskar|en-us+m1|145|30|200|Pain only makes me stronger."
  "night_stalker|en-us+m1|130|18|200|Night falls!"
  "broodmother|en-us+f3|150|45|190|The web tightens."
  "bounty_hunter|en-us+m4|160|50|190|There's a price on your head."
  "weaver|en-us+m3|155|45|190|Weaving through time."
  "jakiro|en-us+m1|140|25|200|Fire and ice!"
  "batrider|en-us+m4|160|55|200|Light them up!"
  "chen|en-us+m2|145|35|190|By the holy light!"
  "spectre|en-us+f2|140|30|180|Haunt."
  "ancient_apparition|en-us+m2|140|28|190|Cold has a sound."
  "ursa|en-us+m1|145|30|200|Feel my fury!"
  "spirit_breaker|en-us+m1|130|18|200|Charge of darkness!"
  "gyrocopter|en-us+m4|160|55|200|Bombs away!"
  "alchemist|en-us+m5|165|60|200|Greed is good!"
  "silencer|en-us+m3|150|40|190|Silence!"
  "obsidian_destroyer|en-us+m2|140|28|190|Sanity's eclipse!"
  "lycan|en-us+m1|135|22|200|The wolves are hungry."
  "brewmaster|en-us+m1|145|30|200|Drink up!"
  "shadow_demon|en-us+m2|140|28|190|Embrace the shadows."
  "lone_druid|en-us+m1|140|25|200|The bear answers."
  "chaos_knight|en-us+m1|135|20|200|Chaos!"
  "treant|en-us+m1|135|22|190|Nature endures."
  "ogre_magi|en-us+m5|160|55|200|Multicast!"
  "undying|en-us+m1|130|18|200|Death cannot save you."
  "rubick|en-us+m3|150|40|190|Magic is mine to command."
  "disruptor|en-us+m3|150|40|190|Static storm!"
  "nyx_assassin|en-us+m3|150|40|180|From the shadows."
  "naga_siren|en-us+f3|155|50|190|Hear my song."
  "keeper_of_the_light|en-us+m2|150|40|190|Let there be light!"
  "wisp|en-us+f4|170|65|190|Together, we are strong."
  "visage|en-us+m1|135|20|190|The grave calls."
  "medusa|en-us+f3|150|45|190|Look into my eyes."
  "troll_warlord|en-us+m5|160|55|200|Time to rampage!"
  "centaur|en-us+m1|135|22|200|Stampede!"
  "magnataur|en-us+m1|140|25|200|Reverse polarity!"
  "shredder|en-us+m4|160|55|200|Timber!"
  "tusk|en-us+m1|145|30|200|Snowball time!"
  "skywrath_mage|en-us+m4|160|55|190|Mystic flare!"
  "abaddon|en-us+m1|140|25|200|Death is my ally."
  "elder_titan|en-us+m1|130|18|200|The earth trembles."
  "ember_spirit|en-us+m4|165|55|190|Burning embers!"
  "earth_spirit|en-us+m3|150|40|190|Roll out!"
  "abyssal_underlord|en-us+m1|130|18|200|From the abyss!"
  "terrorblade|en-us+m2|140|28|190|Reflection!"
  "phoenix|en-us+m4|160|55|190|Rise from the ashes!"
  "oracle|en-us+m3|150|40|190|I see your fate."
  "winter_wyvern|en-us+f3|150|45|190|Winter's curse!"
  "arc_warden|en-us+m3|150|40|190|Double trouble."
  "monkey_king|en-us+m4|165|60|190|Monkey business!"
  "dark_willow|en-us+f4|165|60|190|Into the bramble!"
  "pangolier|en-us+m4|165|55|190|Roll with it!"
  "grimstroke|en-us+m2|140|28|190|Ink swell!"
  "hoodwink|en-us+f4|170|65|190|Bushwhack!"
  "void_spirit|en-us+m3|150|40|190|Step through the void."
  "snapfire|en-us+f2|160|50|200|Hot cookies coming through!"
  "mars|en-us+m1|140|25|200|For the arena!"
  "ringmaster|en-us+m5|165|55|200|Step right up!"
  "dawnbreaker|en-us+f3|155|50|200|Break of dawn!"
  "primal_beast|en-us+m1|130|18|200|Trample!"
  "muerta|en-us+f2|145|35|190|Death calls."
  "kez|en-us+m3|150|40|190|Two blades, one path."
)

synth() {
  local slug="$1" voice="$2" speed="$3" pitch="$4" amp="$5" text="$6"
  local out="$OUT_DIR/$slug.mp3"
  if [[ -f "$out" && "$FORCE" -eq 0 ]]; then
    echo "skip (exists) $out"
    return
  fi
  local wav="$TMP/$slug.wav"
  "$ESPEAK" -v "$voice" -s "$speed" -p "$pitch" -a "$amp" -w "$wav" "$text"
  "$FFMPEG" -y -loglevel error -i "$wav" \
    -ac 1 -ar 44100 -codec:a libmp3lame -b:a 96k \
    -af "aresample=44100,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,dynaudnorm=f=200:g=15" \
    "$out"
  echo "wrote $out"
}

for entry in "${LINES[@]}"; do
  IFS='|' read -r slug voice speed pitch amp text <<< "$entry"
  synth "$slug" "$voice" "$speed" "$pitch" "$amp" "$text"
done

echo "voice-line clips generated -> $OUT_DIR"
