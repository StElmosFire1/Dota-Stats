const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const crypto = require('crypto');

const PARSER_JAR = path.join(process.cwd(), 'odota-parser', 'target', 'stats-0.1.0.jar');
const PARSER_PORT = 5600;

const HERO_ID_TO_NPC = {
  1:'npc_dota_hero_antimage',2:'npc_dota_hero_axe',3:'npc_dota_hero_bane',4:'npc_dota_hero_bloodseeker',
  5:'npc_dota_hero_crystal_maiden',6:'npc_dota_hero_drow_ranger',7:'npc_dota_hero_earthshaker',
  8:'npc_dota_hero_juggernaut',9:'npc_dota_hero_mirana',10:'npc_dota_hero_morphling',
  11:'npc_dota_hero_nevermore',12:'npc_dota_hero_phantom_lancer',13:'npc_dota_hero_puck',
  14:'npc_dota_hero_pudge',15:'npc_dota_hero_razor',16:'npc_dota_hero_sand_king',
  17:'npc_dota_hero_storm_spirit',18:'npc_dota_hero_sven',19:'npc_dota_hero_tiny',
  20:'npc_dota_hero_vengefulspirit',21:'npc_dota_hero_windrunner',22:'npc_dota_hero_zuus',
  23:'npc_dota_hero_kunkka',25:'npc_dota_hero_lina',26:'npc_dota_hero_lion',
  27:'npc_dota_hero_shadow_shaman',28:'npc_dota_hero_slardar',29:'npc_dota_hero_tidehunter',
  30:'npc_dota_hero_witch_doctor',31:'npc_dota_hero_lich',32:'npc_dota_hero_riki',
  33:'npc_dota_hero_enigma',34:'npc_dota_hero_tinker',35:'npc_dota_hero_sniper',
  36:'npc_dota_hero_necrolyte',37:'npc_dota_hero_warlock',38:'npc_dota_hero_beastmaster',
  39:'npc_dota_hero_queenofpain',40:'npc_dota_hero_venomancer',41:'npc_dota_hero_faceless_void',
  42:'npc_dota_hero_skeleton_king',43:'npc_dota_hero_death_prophet',44:'npc_dota_hero_phantom_assassin',
  45:'npc_dota_hero_pugna',46:'npc_dota_hero_templar_assassin',47:'npc_dota_hero_viper',
  48:'npc_dota_hero_luna',49:'npc_dota_hero_dragon_knight',50:'npc_dota_hero_dazzle',
  51:'npc_dota_hero_rattletrap',52:'npc_dota_hero_leshrac',53:'npc_dota_hero_furion',
  54:'npc_dota_hero_life_stealer',55:'npc_dota_hero_dark_seer',56:'npc_dota_hero_clinkz',
  57:'npc_dota_hero_omniknight',58:'npc_dota_hero_enchantress',59:'npc_dota_hero_huskar',
  60:'npc_dota_hero_night_stalker',61:'npc_dota_hero_broodmother',62:'npc_dota_hero_bounty_hunter',
  63:'npc_dota_hero_weaver',64:'npc_dota_hero_jakiro',65:'npc_dota_hero_batrider',
  66:'npc_dota_hero_chen',67:'npc_dota_hero_spectre',68:'npc_dota_hero_ancient_apparition',
  69:'npc_dota_hero_doom_bringer',70:'npc_dota_hero_ursa',71:'npc_dota_hero_spirit_breaker',
  72:'npc_dota_hero_gyrocopter',73:'npc_dota_hero_alchemist',74:'npc_dota_hero_invoker',
  75:'npc_dota_hero_silencer',76:'npc_dota_hero_obsidian_destroyer',77:'npc_dota_hero_lycan',
  78:'npc_dota_hero_brewmaster',79:'npc_dota_hero_shadow_demon',80:'npc_dota_hero_lone_druid',
  81:'npc_dota_hero_chaos_knight',82:'npc_dota_hero_meepo',83:'npc_dota_hero_treant',
  84:'npc_dota_hero_ogre_magi',85:'npc_dota_hero_undying',86:'npc_dota_hero_rubick',
  87:'npc_dota_hero_disruptor',88:'npc_dota_hero_nyx_assassin',89:'npc_dota_hero_naga_siren',
  90:'npc_dota_hero_keeper_of_the_light',91:'npc_dota_hero_wisp',92:'npc_dota_hero_visage',
  93:'npc_dota_hero_slark',94:'npc_dota_hero_medusa',95:'npc_dota_hero_troll_warlord',
  96:'npc_dota_hero_centaur',97:'npc_dota_hero_magnataur',98:'npc_dota_hero_shredder',
  99:'npc_dota_hero_bristleback',100:'npc_dota_hero_tusk',101:'npc_dota_hero_skywrath_mage',
  102:'npc_dota_hero_abaddon',103:'npc_dota_hero_elder_titan',104:'npc_dota_hero_legion_commander',
  105:'npc_dota_hero_techies',106:'npc_dota_hero_ember_spirit',107:'npc_dota_hero_earth_spirit',
  108:'npc_dota_hero_abyssal_underlord',109:'npc_dota_hero_terrorblade',110:'npc_dota_hero_phoenix',
  111:'npc_dota_hero_oracle',112:'npc_dota_hero_winter_wyvern',113:'npc_dota_hero_arc_warden',
  114:'npc_dota_hero_monkey_king',119:'npc_dota_hero_dark_willow',120:'npc_dota_hero_pangolier',
  121:'npc_dota_hero_grimstroke',123:'npc_dota_hero_hoodwink',126:'npc_dota_hero_void_spirit',
  128:'npc_dota_hero_snapfire',129:'npc_dota_hero_mars',131:'npc_dota_hero_ringmaster',
  135:'npc_dota_hero_dawnbreaker',136:'npc_dota_hero_marci',137:'npc_dota_hero_primal_beast',
  138:'npc_dota_hero_muerta',145:'npc_dota_hero_kez',155:'npc_dota_hero_largo',
};

const NPC_TO_HERO_ID = {};
for (const [id, npc] of Object.entries(HERO_ID_TO_NPC)) {
  NPC_TO_HERO_ID[npc] = parseInt(id);
}

const ITEM_ID_TO_NAME = {
  1:'blink',2:'blades_of_attack',3:'broadsword',4:'chainmail',5:'claymore',6:'helm_of_iron_will',
  7:'javelin',8:'mithril_hammer',9:'platemail',10:'quarterstaff',11:'quelling_blade',
  12:'ring_of_protection',13:'gauntlets',14:'slippers',15:'mantle',16:'branches',
  17:'belt_of_strength',18:'boots_of_elves',19:'robe',20:'circlet',21:'ogre_axe',
  22:'blade_of_alacrity',23:'staff_of_wizardry',24:'ultimate_orb',25:'void_stone',
  26:'mystic_staff',27:'energy_booster',28:'point_booster',29:'vitality_booster',
  30:'power_treads',31:'hand_of_midas',32:'oblivion_staff',33:'perseverance',34:'bracer',
  35:'wraith_band',36:'null_talisman',37:'mekansm',38:'vladmir',39:'buckler',
  40:'ring_of_basilius',41:'pipe',42:'urn_of_shadows',43:'headdress',44:'sheepstick',
  46:'orchid',47:'cyclone',48:'force_staff',49:'dagon',50:'necronomicon',
  51:'ultimate_scepter',52:'refresher',53:'assault',54:'heart',55:'black_king_bar',
  56:'aegis',57:'shivas_guard',58:'bloodstone',59:'sphere',60:'vanguard',
  63:'blade_mail',64:'soul_booster',65:'hood_of_defiance',67:'rapier',
  68:'monkey_king_bar',69:'radiance',71:'butterfly',73:'greater_crit',
  74:'armlet',75:'invis_sword',76:'sange_and_yasha',77:'satanic',78:'mjollnir',
  79:'basher',80:'manta',81:'desolator',85:'lesser_crit',86:'ethereal_blade',
  88:'soul_ring',89:'arcane_boots',90:'octarine_core',92:'orb_of_venom',
  93:'stout_shield',94:'drum_of_endurance',96:'crimson_guard',97:'aether_lens',
  98:'abyssal_blade',100:'heavens_halberd',102:'ring_of_aquila',
  104:'tranquil_boots',106:'shadow_amulet',108:'ultimate_scepter',
  109:'smoke_of_deceit',110:'tome_of_knowledge',111:'dust',112:'bottle',
  114:'ward_observer',115:'ward_sentry',116:'tango',117:'clarity',
  119:'mask_of_madness',121:'helm_of_the_dominator',122:'sange',123:'yasha',
  124:'maelstrom',125:'diffusal_blade',127:'dragon_lance',129:'echo_sabre',
  131:'silver_edge',132:'glimmer_cape',133:'solar_crest',
  135:'guardian_greaves',139:'moon_shard',141:'wind_lace',143:'infused_raindrop',
  145:'blight_stone',147:'wind_waker',148:'lotus_orb',149:'meteor_hammer',
  150:'nullifier',151:'spirit_vessel',152:'holy_locket',154:'kaya',
  156:'crown',158:'aeon_disk',160:'kaya_and_sange',162:'yasha_and_kaya',
  164:'phylactery',166:'falcon_blade',168:'witch_blade',170:'blood_grenade',
  172:'parasma',174:'disperser',176:'khanda',178:'harpoon',180:'pavise',
  182:'dagger_of_ristul',184:'cornucopia',186:'tiara_of_selemene',
  188:'ring_of_tarrasque',190:'mage_slayer',
  206:'aghanims_shard',235:'devastator',236:'overwhelming_blink',237:'swift_blink',238:'arcane_blink',
  240:'boots',248:'tpscroll',249:'reaver',250:'eaglesong',251:'sacred_relic',
  252:'recipe_power_treads',253:'recipe_hand_of_midas',254:'recipe_oblivion_staff',
  263:'recipe_vladmir',265:'recipe_mekansm',267:'recipe_pipe',269:'recipe_urn_of_shadows',
  277:'recipe_sheepstick',279:'recipe_orchid',281:'recipe_cyclone',283:'recipe_force_staff',
  285:'recipe_dagon',289:'recipe_refresher',291:'recipe_assault',293:'recipe_heart',
  297:'recipe_shivas_guard',299:'recipe_bloodstone',303:'recipe_vanguard',
  306:'recipe_blade_mail',311:'recipe_rapier',313:'recipe_monkey_king_bar',315:'recipe_radiance',
  317:'recipe_butterfly',319:'recipe_greater_crit',321:'recipe_armlet',
  323:'recipe_invis_sword',325:'recipe_sange_and_yasha',327:'recipe_satanic',329:'recipe_mjollnir',
  331:'recipe_basher',333:'recipe_manta',337:'recipe_lesser_crit',339:'recipe_ethereal_blade',
  349:'recipe_arcane_boots',351:'recipe_octarine_core',355:'recipe_drum_of_endurance',
  357:'recipe_crimson_guard',359:'recipe_aether_lens',361:'recipe_abyssal_blade',
  363:'recipe_heavens_halberd',365:'recipe_ring_of_aquila',367:'recipe_tranquil_boots',
  371:'recipe_mask_of_madness',373:'recipe_helm_of_the_dominator',
  377:'recipe_maelstrom',379:'recipe_diffusal_blade',381:'recipe_dragon_lance',
  383:'recipe_echo_sabre',385:'recipe_silver_edge',387:'recipe_glimmer_cape',
  389:'recipe_solar_crest',391:'recipe_guardian_greaves',393:'recipe_moon_shard',
  397:'recipe_lotus_orb',399:'recipe_meteor_hammer',401:'recipe_nullifier',
  403:'recipe_spirit_vessel',405:'recipe_holy_locket',407:'recipe_kaya',
  409:'recipe_aeon_disk',411:'recipe_kaya_and_sange',413:'recipe_yasha_and_kaya',
  600:'recipe_overwhelming_blink',603:'recipe_swift_blink',604:'recipe_arcane_blink',
  609:'recipe_wind_waker',610:'recipe_witch_blade',
  1021:'bloodthorn',1022:'lotus_orb',1023:'solar_crest',
};


class ReplayParser {
  constructor() {
    this.replayDir = path.join(process.cwd(), 'replays');
    if (!fs.existsSync(this.replayDir)) {
      fs.mkdirSync(this.replayDir, { recursive: true });
    }
    this.parserProcess = null;
    this.parserReady = false;
  }

  async startParserService() {
    if (this.parserReady) return true;

    if (!fs.existsSync(PARSER_JAR)) {
      console.warn('[Replay] Parser JAR not found. Full replay parsing disabled.');
      console.warn('[Replay] Run: cd odota-parser && mvn install -DskipTests');
      return false;
    }

    return new Promise((resolve) => {
      console.log('[Replay] Starting parser service on port', PARSER_PORT);
      this.parserProcess = spawn('java', ['-jar', PARSER_JAR], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      this.parserProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log('[Parser]', msg);
      });

      this.parserProcess.stdout.on('data', () => {});

      this.parserProcess.on('error', (err) => {
        console.error('[Replay] Parser failed to start:', err.message);
        this.parserReady = false;
        resolve(false);
      });

      this.parserProcess.on('exit', (code) => {
        console.log('[Replay] Parser exited with code', code);
        this.parserReady = false;
      });

      const checkHealth = async (retries = 15) => {
        for (let i = 0; i < retries; i++) {
          try {
            const res = await fetch(`http://localhost:${PARSER_PORT}/healthz`, { timeout: 2000 });
            if (res.ok) {
              console.log('[Replay] Parser service is ready.');
              this.parserReady = true;
              resolve(true);
              return;
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 1000));
        }
        console.error('[Replay] Parser service failed to become ready.');
        resolve(false);
      };

      checkHealth();
    });
  }

  async downloadReplay(url, filename) {
    const filePath = path.join(this.replayDir, filename);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const buffer = await response.buffer();
    fs.writeFileSync(filePath, buffer);
    console.log(`[Replay] Downloaded: ${filename} (${buffer.length} bytes)`);
    return filePath;
  }

  computeFileHash(filePath) {
    const hash = crypto.createHash('sha256');
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest('hex');
  }

  async parseReplayFull(filePath) {
    if (!this.parserReady) {
      throw new Error('Parser service is not running. Replay parsing unavailable.');
    }

    const fileSize = fs.statSync(filePath).size;
    const fileMB = (fileSize / (1024 * 1024)).toFixed(1);
    console.log(`[Replay] Sending ${path.basename(filePath)} to parser (${fileMB} MB)...`);

    const rawText = await this._sendToParser(filePath);
    const lines = rawText.trim().split('\n').filter(Boolean);

    if (lines.length === 0) {
      throw new Error('Parser returned no data');
    }

    const events = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {}
    }

    console.log(`[Replay] Parsed ${events.length} events from replay.`);

    const fileHash = this.computeFileHash(filePath);
    const result = this._aggregateStats(events);
    result.fileHash = fileHash;
    return result;
  }

  _sendToParser(filePath) {
    const { execFileSync } = require('child_process');
    return new Promise((resolve, reject) => {
      try {
        const output = execFileSync('curl', [
          '-s', '-S',
          '--max-time', '600',
          '--connect-timeout', '10',
          '-X', 'POST',
          '-H', 'Content-Type: application/octet-stream',
          '--data-binary', `@${filePath}`,
          `http://localhost:${PARSER_PORT}/`,
        ], {
          maxBuffer: 500 * 1024 * 1024,
          timeout: 660000,
        });
        resolve(output.toString());
      } catch (err) {
        reject(new Error(`Parser request failed: ${err.message}`));
      }
    });
  }

  _getNestedField(obj, ...variants) {
    for (const path of variants) {
      let curr = obj;
      const parts = path.split('.');
      let found = true;
      for (const part of parts) {
        if (curr && typeof curr === 'object' && part in curr) {
          curr = curr[part];
        } else {
          found = false;
          break;
        }
      }
      if (found && curr !== undefined) return curr;
    }
    return undefined;
  }

  _classifyLane(x, y) {
    const MAP_CENTER = 128;
    const MID_BAND = 15;
    const nx = x - MAP_CENTER;
    const ny = y - MAP_CENTER;
    const diag = ny - nx;
    if (Math.abs(diag) < MID_BAND) return 'mid';
    return diag > 0 ? 'top' : 'bot';
  }

  _detectPositions(players, laningData, maxTime) {
    const LANING_END = 600;
    const positions = {};

    for (const team of ['radiant', 'dire']) {
      const teamSlots = Object.keys(players).filter(s => {
        const slot = parseInt(s);
        return team === 'radiant' ? slot < 5 : slot >= 5;
      }).map(s => parseInt(s));

      const laneCounts = {};
      for (const slot of teamSlots) {
        laneCounts[slot] = { top: 0, mid: 0, bot: 0 };
        const samples = laningData[slot] || [];
        for (const s of samples) {
          if (s.time > LANING_END) continue;
          const lane = this._classifyLane(s.x, s.y);
          laneCounts[slot][lane]++;
        }
      }

      const laningLH = {};
      for (const slot of teamSlots) {
        const samples = laningData[slot] || [];
        let bestLH = 0;
        for (const s of samples) {
          if (s.time <= LANING_END && s.lh != null && s.lh > bestLH) {
            bestLH = s.lh;
          }
        }
        laningLH[slot] = bestLH;
      }

      const hasLaneData = teamSlots.some(slot => {
        const c = laneCounts[slot];
        return (c.top + c.mid + c.bot) > 0;
      });

      if (!hasLaneData) {
        const ranked = [...teamSlots].sort((a, b) => laningLH[b] - laningLH[a]);
        const fallbackPositions = [1, 2, 3, 4, 5];
        for (let i = 0; i < ranked.length && i < 5; i++) {
          positions[ranked[i]] = fallbackPositions[i];
        }
      } else {
        const primaryLane = {};
        for (const slot of teamSlots) {
          const counts = laneCounts[slot];
          const total = counts.top + counts.mid + counts.bot;
          if (total === 0) {
            primaryLane[slot] = 'jungle';
          } else {
            primaryLane[slot] = counts.top >= counts.mid && counts.top >= counts.bot ? 'top' :
                                counts.mid >= counts.bot ? 'mid' : 'bot';
          }
        }

        const laneGroups = { top: [], mid: [], bot: [], jungle: [] };
        for (const slot of teamSlots) {
          laneGroups[primaryLane[slot]].push(slot);
        }

        const safeLane = team === 'radiant' ? 'bot' : 'top';
        const offLane = team === 'radiant' ? 'top' : 'bot';

        for (const slot of (laneGroups.mid || [])) {
          positions[slot] = 2;
        }

        const safeGroup = (laneGroups[safeLane] || []).sort((a, b) => laningLH[b] - laningLH[a]);
        if (safeGroup.length >= 1) positions[safeGroup[0]] = 1;
        if (safeGroup.length >= 2) positions[safeGroup[1]] = 5;
        for (let i = 2; i < safeGroup.length; i++) positions[safeGroup[i]] = 5;

        const offGroup = (laneGroups[offLane] || []).sort((a, b) => laningLH[b] - laningLH[a]);
        if (offGroup.length >= 1) positions[offGroup[0]] = 3;
        if (offGroup.length >= 2) positions[offGroup[1]] = 4;
        for (let i = 2; i < offGroup.length; i++) positions[offGroup[i]] = 4;

        for (const slot of (laneGroups.jungle || []).sort((a, b) => laningLH[b] - laningLH[a])) {
          if (positions[slot] == null) {
            const taken = new Set(Object.values(positions));
            for (const p of [4, 3, 1, 5, 2]) {
              if (!taken.has(p)) { positions[slot] = p; break; }
            }
          }
        }
      }

      for (const slot of teamSlots) {
        if (positions[slot] == null) positions[slot] = 0;
      }
    }

    return positions;
  }

  _aggregateStats(events) {
    const players = {};
    const playerSlots = {};
    let matchId = null;
    let duration = 0;
    let radiantWin = null;
    let gameMode = 0;
    let gameStartTime = null;
    let epilogueData = null;
    const maxTime = {};
    const laningData = {};
    const laneCs10min = {};
    const laningNwAtEight = {};
    const draftRaw = [];

    const timelineSamples = {};
    const timelineLastSampled = {};
    const laningNwAt10 = {};
    const laningXpAt10 = {};
    const wardPlacements = {};
    const gameEvents = [];
    const laningKillsAt10 = {};
    const allPositions = {};      // slot → [{t, x, y}] sampled every 10s throughout game
    const posLastSampled = {};    // slot → last sample time

    for (const e of events) {
      if (e.type === 'epilogue' && e.key) {
        try {
          epilogueData = JSON.parse(e.key);
          console.log('[Replay] Epilogue top-level keys:', Object.keys(epilogueData));

          const dota = this._getNestedField(epilogueData,
            'gameInfo.dota', 'gameInfo_.dota_', 'gameInfo_.dota',
            'game_info.dota', 'game_info_.dota_'
          );

          if (dota) {
            // Log all dota fields with their values for diagnosis
            const dotaFieldDump = {};
            for (const k of Object.keys(dota)) {
              const v = dota[k];
              if (typeof v !== 'object') dotaFieldDump[k] = v;
            }
            console.log('[Replay] Epilogue dota fields:', JSON.stringify(dotaFieldDump));

            const mid = dota.matchId || dota.matchId_ || dota.match_id || dota.match_id_;
            matchId = mid ? mid.toString() : null;

            gameMode = dota.gameMode || dota.gameMode_ || dota.game_mode || dota.game_mode_ || 0;

            const rw = dota.radiantWin != null ? dota.radiantWin :
                       dota.radiantWin_ != null ? dota.radiantWin_ :
                       dota.radiant_win != null ? dota.radiant_win :
                       dota.radiant_win_ != null ? dota.radiant_win_ :
                       (dota.matchOutcome || dota.matchOutcome_ || dota.match_outcome || dota.match_outcome_);
            if (typeof rw === 'boolean') {
              radiantWin = rw;
            } else if (typeof rw === 'number') {
              radiantWin = rw === 2;
            }

            const endTime = Number(dota.endTime || dota.endTime_ || dota.end_time || dota.end_time_ || 0);
            const preGame = Number(dota.preGameDuration || dota.preGameDuration_ || dota.pre_game_duration || dota.pre_game_duration_ || 0);
            const startTime = Number(dota.startTime || dota.startTime_ || dota.start_time || dota.start_time_ || 0);

            // Unix timestamps for modern games are ~1.6-2.0 billion
            const UNIX_MIN = 1000000000;
            const UNIX_MAX = 2100000000;

            if (startTime > UNIX_MIN && startTime < UNIX_MAX) {
              gameStartTime = startTime;
              if (endTime > startTime) {
                duration = endTime - startTime - preGame;
              }
            } else if (endTime > UNIX_MIN && endTime < UNIX_MAX) {
              gameStartTime = endTime;
              duration = 0;
            } else if (endTime > 0 && endTime <= UNIX_MIN) {
              // endTime is duration in seconds, not a timestamp — scan all fields for a timestamp
              duration = endTime - preGame;
              for (const k of Object.keys(dota)) {
                const v = Number(dota[k]);
                if (v > UNIX_MIN && v < UNIX_MAX) {
                  console.log(`[Replay] Found Unix timestamp in dota.${k} = ${v} → ${new Date(v * 1000).toISOString()}`);
                  if (!gameStartTime) gameStartTime = v;
                }
              }
            }

            if (duration < 0 || duration > 10800) {
              console.warn(`[Replay] Suspicious epilogue duration ${duration}s, resetting to 0`);
              duration = 0;
            }

            console.log(`[Replay] Epilogue extracted: matchId=${matchId}, gameMode=${gameMode}, radiantWin=${radiantWin}, duration=${duration}, gameStartTime=${gameStartTime ? new Date(gameStartTime * 1000).toISOString() : 'null'}`);
          } else {
            console.warn('[Replay] Could not find gameInfo.dota in epilogue. Keys:', JSON.stringify(Object.keys(epilogueData)).substring(0, 200));
          }
        } catch (err) {
          console.error('[Replay] Epilogue parse error:', err.message);
        }
      }

      if (e.type === 'draft_timings' && e.hero_id > 0) {
        draftRaw.push({
          heroId: e.hero_id,
          isPick: e.pick === true,
          order: e.draft_order != null ? e.draft_order : draftRaw.length,
          rawTeam: e.draft_active_team,
        });
      }

      if (e.type === 'player_slot' && e.slot != null && e.key != null) {
        playerSlots[e.slot] = parseInt(e.key);
      }

      if (e.type === 'interval' && e.slot != null && e.slot >= 0 && e.slot < 10) {
        const currentTime = e.time || 0;
        const prevMax = maxTime[e.slot] || -1;

        if (currentTime >= prevMax) {
          maxTime[e.slot] = currentTime;

          if (!players[e.slot]) {
            players[e.slot] = {
              slot: e.slot,
              heroId: 0,
              kills: 0,
              deaths: 0,
              assists: 0,
              lastHits: 0,
              denies: 0,
              gold: 0,
              xp: 0,
              level: 0,
              accountId: 0,
              obsPlaced: 0,
              senPlaced: 0,
              creepsStacked: 0,
              campsStacked: 0,
              networth: 0,
              runePickups: 0,
              stuns: 0,
              towersKilled: 0,
              roshansKilled: 0,
              teamfightParticipation: 0,
              firstbloodClaimed: 0,
              buybacks: 0,
              courierKills: 0,
            };
          }

          const p = players[e.slot];
          if (e.hero_id != null) p.heroId = e.hero_id;
          if (e.kills != null) p.kills = e.kills;
          if (e.deaths != null) p.deaths = e.deaths;
          if (e.assists != null) p.assists = e.assists;
          if (e.lh != null) p.lastHits = e.lh;
          if (e.denies != null) p.denies = e.denies;
          if (e.gold != null) p.gold = e.gold;
          if (e.xp != null) p.xp = e.xp;
          if (e.level != null) p.level = e.level;
          if (e.obs_placed != null) p.obsPlaced = e.obs_placed;
          if (e.sen_placed != null) p.senPlaced = e.sen_placed;
          if (e.creeps_stacked != null) p.creepsStacked = e.creeps_stacked;
          if (e.camps_stacked != null) p.campsStacked = e.camps_stacked;
          if (e.networth != null) p.networth = e.networth;
          if (e.rune_pickups != null) p.runePickups = e.rune_pickups;
          if (e.stuns != null) p.stuns = parseFloat(e.stuns) || 0;
          if (e.towers_killed != null) p.towersKilled = e.towers_killed;
          if (e.roshans_killed != null) p.roshansKilled = e.roshans_killed;
          if (e.teamfight_participation != null) p.teamfightParticipation = parseFloat(e.teamfight_participation) || 0;
          if (e.firstblood_claimed != null) p.firstbloodClaimed = e.firstblood_claimed;
          if (e.buyback_count != null) p.buybacks = e.buyback_count;
        }

        if (currentTime <= 660 && e.x != null && e.y != null) {
          if (!laningData[e.slot]) laningData[e.slot] = [];
          laningData[e.slot].push({ time: currentTime, x: e.x, y: e.y, lh: e.lh || 0 });
        }
        // Full-game position sampling every 10s (used for hook range checks)
        if (e.x != null && e.y != null) {
          const prevPos = posLastSampled[e.slot] || -11;
          if (currentTime - prevPos >= 10) {
            posLastSampled[e.slot] = currentTime;
            if (!allPositions[e.slot]) allPositions[e.slot] = [];
            allPositions[e.slot].push({ t: currentTime, x: e.x, y: e.y });
          }
        }

        if (e.lh != null && currentTime >= 590 && currentTime <= 610) {
          const prev = laneCs10min[e.slot] || 0;
          if (e.lh > prev) laneCs10min[e.slot] = e.lh;
        }

        if (e.networth != null && currentTime >= 480 && currentTime <= 540) {
          if (!laningNwAtEight[e.slot] || currentTime > (laningNwAtEight[e.slot].time || 0)) {
            laningNwAtEight[e.slot] = { nw: e.networth, time: currentTime };
          }
        }

        if (currentTime >= 590 && currentTime <= 615) {
          if (!laningNwAt10[e.slot] || currentTime > (laningNwAt10[e.slot].time || 0)) {
            laningNwAt10[e.slot] = { nw: e.networth || 0, time: currentTime };
          }
          if (!laningXpAt10[e.slot] || currentTime > (laningXpAt10[e.slot].time || 0)) {
            laningXpAt10[e.slot] = { xp: e.xp || 0, time: currentTime };
          }
        }

        const prevSampled = timelineLastSampled[e.slot] || -30;
        if (currentTime - prevSampled >= 30) {
          timelineLastSampled[e.slot] = currentTime;
          if (!timelineSamples[e.slot]) timelineSamples[e.slot] = [];
          timelineSamples[e.slot].push({
            t: currentTime,
            nw: e.networth || 0,
            xp: e.xp || 0,
            level: e.level || 0,
            cs: e.lh || 0,
            hd: e.heroDamage || 0,
          });
        }
      }
    }

    const maxIntervalTime = Object.values(maxTime).length > 0
      ? Math.max(...Object.values(maxTime))
      : 0;
    // Only use maxIntervalTime as a fallback — it can be inflated by post-game interval events
    // that continue for 60–120+ seconds after the game ends. The epilogue duration is preferred.
    if (duration === 0 && maxIntervalTime > 0) {
      duration = maxIntervalTime;
    } else if (duration > 100000) {
      duration = 0;
    }
    console.log(`[Replay] Duration: epilogue=${duration}s, maxIntervalTime=${maxIntervalTime}s`);

    const npcNameToSlot = {};
    for (const [slot, p] of Object.entries(players)) {
      const npcName = HERO_ID_TO_NPC[p.heroId];
      if (npcName) {
        npcNameToSlot[npcName] = parseInt(slot);
      }
    }
    console.log('[Replay] NPC name→slot mapping:', JSON.stringify(npcNameToSlot));

    const heroDamage = {};
    const towerDamage = {};
    const heroHealing = {};
    const damageTaken = {};
    const hdPoints = {};   // slot → [{t, cumHd}] — cumulative hero damage snapshots for timeline back-fill
    const wardKills = {};
    const obsPurchased = {};
    const senPurchased = {};
    const tpScrollsUsed = {};
    const smokeKills = {};
    const multiKills = {};
    const killStreaks = {};
    const combatLogBuybacks = {};
    const firstDeathSlot = { time: Infinity, slot: -1 };
    const itemPurchases = {};
    const abilityLevelups = {};
    const finalItems = {};
    const finalItemsTime = {}; // slot → timestamp of the most recent hero_inventory snapshot
    let _inventoryDebugLogged = false;
    const killedBy = {};       // killedBy[victimSlot][killerSlot] = count
    const supportGoldSpent = {}; // supportGoldSpent[slot] = total gold
    const hookCasts      = [];  // [{time, slot}] — pudge hook cast events (from combatlog)
    const hookUnitOrders = [];  // [{time, slot, normX, normY}] — pudge hook casts from unit-order events (more accurate)
    const hookHits  = [];      // [{time, slot, targetHero, targetName}] — hook damage events

    const SUPPORT_ITEM_COSTS = {
      item_ward_observer: 65, item_ward_sentry: 50, item_ward_dispenser: 115,
      item_smoke_of_deceit: 50, item_dust: 80, item_clarity: 50,
      item_flask: 110, item_tango: 90, item_enchanted_mango: 65,
      item_faerie_fire: 50, item_blood_grenade: 80,
      item_infused_raindrop: 75, item_tome_of_knowledge: 75,
      item_gem: 875, item_vampiric_talisman: 450,
    };

    // ── Second pass: streaming-mode combat log events ──────────────────────────
    // In streaming mode the parser outputs raw Entry objects with type = the enum
    // name (e.g. "DOTA_COMBATLOG_PURCHASE") and raw fields from the protobuf:
    //   attackername = attacker/actor NPC name
    //   targetname   = target/victim NPC name
    //   inflictor    = ability/item name (e.g. for ability-level events)
    //   valuename    = purchased item name WITH "item_" prefix (purchase only)
    //   value        = numeric value (damage, heal amount, multikill count, etc.)
    //   targethero / targetillusion / attackerhero / attackerillusion = booleans
    //   slot         = resolved player slot (0-9) for non-combat-log entries
    //                  (ward events, interval events) but NOT for raw combat log entries
    // ───────────────────────────────────────────────────────────────────────────
    // Debug: tally event types to confirm streaming-mode format
    const eventTypeCounts = {};
    for (const e of events) {
      eventTypeCounts[e.type] = (eventTypeCounts[e.type] || 0) + 1;
    }
    console.log('[Replay] Event type counts:', JSON.stringify(eventTypeCounts));
    // Sample first purchase and first damage event for field inspection
    const samplePurchase = events.find(e => e.type === 'DOTA_COMBATLOG_PURCHASE');
    const sampleDamage   = events.find(e => e.type === 'DOTA_COMBATLOG_DAMAGE');
    if (samplePurchase) console.log('[Replay] Sample purchase event:', JSON.stringify(samplePurchase));
    else console.log('[Replay] No DOTA_COMBATLOG_PURCHASE events found — checking for blob-mode types:', events.filter(e => e.type === 'purchase_log').length, 'purchase_log events');
    if (sampleDamage) console.log('[Replay] Sample damage event:', JSON.stringify(sampleDamage));

    let wardEventDebugLogged = false;
    for (const e of events) {
      // ── Ward placement events (type: "obs" / "sen") ───────────────────────
      // Slot is already resolved by getPlayerSlotFromEntity() in the parser;
      // may be Valve raw format (128-132 for dire) so normalise it.
      if ((e.type === 'obs' || e.type === 'sen') && e.x != null && e.y != null) {
        if (!wardEventDebugLogged) {
          console.log('[Replay] Sample ward event fields:', JSON.stringify(e));
          wardEventDebugLogged = true;
        }
        let slot = e.slot;
        if (slot != null && slot >= 128 && slot <= 132) slot = slot - 128 + 5;
        if (slot != null && slot >= 0 && slot < 10) {
          if (!wardPlacements[slot]) wardPlacements[slot] = [];
          wardPlacements[slot].push({
            type: e.type === 'obs' ? 'obs' : 'sen',
            x: e.x, y: e.y, t: e.time || 0,
          });
        } else {
          console.log('[Replay] Ward event slot unresolved — full event:', JSON.stringify(e));
        }
      }

      // ── Ward killed/expired ───────────────────────────────────────────────
      // Streaming mode: "obs_left" / "sen_left"   Blob mode: "obs_left_log" / "sen_left_log"
      // attackername holds the killer hero NPC name.
      if ((e.type === 'obs_left' || e.type === 'sen_left' ||
           e.type === 'obs_left_log' || e.type === 'sen_left_log') && e.attackername) {
        const killerSlot = npcNameToSlot[e.attackername];
        if (killerSlot != null && killerSlot >= 0 && killerSlot < 10) {
          wardKills[killerSlot] = (wardKills[killerSlot] || 0) + 1;
        }
      }

      // ── Item purchase ─────────────────────────────────────────────────────
      // Streaming: type "DOTA_COMBATLOG_PURCHASE", item in e.valuename (WITH "item_"), buyer in e.targetname
      // Blob:      type "purchase_log",             item in e.key     (WITHOUT "item_"), buyer in e.unit
      {
        let itemName = null, buyerSlot = null;
        if (e.type === 'DOTA_COMBATLOG_PURCHASE' && e.valuename) {
          itemName  = e.valuename; // already has "item_" prefix
          buyerSlot = npcNameToSlot[e.targetname];
        } else if (e.type === 'purchase_log' && e.key) {
          itemName  = 'item_' + e.key;
          let s = e.slot;
          if (s != null && s >= 128 && s <= 132) s = s - 128 + 5;
          buyerSlot = (s != null && s >= 0 && s < 10) ? s : npcNameToSlot[e.unit];
        }
        if (itemName && buyerSlot != null && buyerSlot >= 0 && buyerSlot < 10) {
          const itemKey = itemName.replace(/^item_/, '');
          if (itemKey === 'ward_observer' || itemKey === 'ward_dispenser') obsPurchased[buyerSlot] = (obsPurchased[buyerSlot] || 0) + 1;
          if (itemKey === 'ward_sentry'   || itemKey === 'ward_dispenser') senPurchased[buyerSlot] = (senPurchased[buyerSlot] || 0) + 1;
          if (itemKey === 'tpscroll' || itemKey === 'travel_boots' || itemKey === 'travel_boots_2') tpScrollsUsed[buyerSlot] = (tpScrollsUsed[buyerSlot] || 0) + 1;
          const supportCost = SUPPORT_ITEM_COSTS[itemName];
          if (supportCost) supportGoldSpent[buyerSlot] = (supportGoldSpent[buyerSlot] || 0) + supportCost;
          if (!itemKey.startsWith('recipe_')) {
            if (!itemPurchases[buyerSlot]) itemPurchases[buyerSlot] = [];
            itemPurchases[buyerSlot].push({ itemName, time: e.time || 0 });
          }
        }
      }

      // ── Multi-kill ────────────────────────────────────────────────────────
      // Streaming: type "DOTA_COMBATLOG_MULTIKILL", count in e.value, hero in e.attackername
      // Blob:      type "multi_kills",              count in e.key (string), hero in e.unit
      {
        let mkSlot = null, numkills = 0;
        if (e.type === 'DOTA_COMBATLOG_MULTIKILL') {
          mkSlot   = npcNameToSlot[e.attackername];
          numkills = e.value || 0;
        } else if (e.type === 'multi_kills') {
          let s = e.slot; if (s == null && e.unit) s = npcNameToSlot[e.unit]; mkSlot = s;
          numkills = parseInt(e.key) || 0;
        }
        if (mkSlot != null && mkSlot >= 0 && mkSlot < 10 && numkills >= 2) {
          if (!multiKills[mkSlot]) multiKills[mkSlot] = { double: 0, triple: 0, ultra: 0, rampage: 0 };
          if (numkills === 2) multiKills[mkSlot].double++;
          else if (numkills === 3) multiKills[mkSlot].triple++;
          else if (numkills === 4) multiKills[mkSlot].ultra++;
          else multiKills[mkSlot].rampage++;
        }
      }

      // ── Kill streak ───────────────────────────────────────────────────────
      // Streaming: type "DOTA_COMBATLOG_KILLSTREAK", streak in e.value, hero in e.attackername
      // Blob:      type "kill_streaks",              streak in e.key (string), hero in e.unit
      {
        let ksSlot = null, streak = 0;
        if (e.type === 'DOTA_COMBATLOG_KILLSTREAK') {
          ksSlot = npcNameToSlot[e.attackername]; streak = e.value || 0;
        } else if (e.type === 'kill_streaks') {
          let s = e.slot; if (s == null && e.unit) s = npcNameToSlot[e.unit]; ksSlot = s;
          streak = parseInt(e.key) || 0;
        }
        if (ksSlot != null && ksSlot >= 0 && ksSlot < 10 && streak > 0) {
          if (!killStreaks[ksSlot] || streak > killStreaks[ksSlot]) killStreaks[ksSlot] = streak;
        }
      }

      // ── Hero/building/Roshan/courier death ───────────────────────────────
      // Streaming: single "DOTA_COMBATLOG_DEATH" for all deaths, victim in e.targetname, killer in e.attackername
      // Blob: "kills_log" (hero), "killed" (roshan/courier), "building_kill" (towers)
      {
        let deathVictim = null, deathKiller = null, deathTime = e.time || 0, isHeroDeath = false;
        if (e.type === 'DOTA_COMBATLOG_DEATH' && e.targetname) {
          deathVictim  = e.targetname;
          deathKiller  = e.attackername || '';
          isHeroDeath  = !!(e.targethero && !e.targetillusion);
        } else if (e.type === 'kills_log' && e.key) {           // blob hero death
          deathVictim = e.key; deathKiller = e.unit || ''; isHeroDeath = true;
        } else if (e.type === 'killed' && e.key) {              // blob roshan/courier
          deathVictim = e.key; deathKiller = e.unit || '';
        } else if (e.type === 'building_kill' && e.key) {       // blob building
          deathVictim = e.key; deathKiller = e.unit || '';
        }
        if (deathVictim) {
          const tname = deathVictim, aname = deathKiller;
          // Hero kill
          if (isHeroDeath) {
            const victimSlot = npcNameToSlot[tname];
            if (victimSlot != null && victimSlot >= 0 && victimSlot < 10) {
              if (deathTime > 0 && deathTime < firstDeathSlot.time) { firstDeathSlot.time = deathTime; firstDeathSlot.slot = victimSlot; }
              let killerSlot = e.slot; if (killerSlot == null) killerSlot = npcNameToSlot[aname];
              if (killerSlot != null && killerSlot >= 0 && killerSlot < 10 && killerSlot !== victimSlot) {
                if (!killedBy[victimSlot]) killedBy[victimSlot] = {};
                killedBy[victimSlot][killerSlot] = (killedBy[victimSlot][killerSlot] || 0) + 1;
              }
              gameEvents.push({ t: deathTime, type: 'kill', killerSlot: killerSlot != null ? killerSlot : -1, victimSlot });
              if (deathTime <= 600) {
                if (!laningKillsAt10[victimSlot]) laningKillsAt10[victimSlot] = { k: 0, d: 0, a: 0 };
                laningKillsAt10[victimSlot].d++;
                if (killerSlot != null && killerSlot >= 0 && killerSlot < 10) {
                  if (!laningKillsAt10[killerSlot]) laningKillsAt10[killerSlot] = { k: 0, d: 0, a: 0 };
                  laningKillsAt10[killerSlot].k++;
                }
              }
            }
          }
          // Roshan
          if (tname.includes('roshan')) {
            const ks = npcNameToSlot[aname];
            // If killer slot unknown (aname not in map), derive team from attacker NPC name prefix
            let roshanTeam = 'unknown';
            if (ks != null && ks >= 0 && ks < 10) roshanTeam = ks < 5 ? 'radiant' : 'dire';
            gameEvents.push({ t: deathTime, type: 'roshan', team: roshanTeam, killerSlot: ks != null ? ks : -1 });
            console.log(`[Replay] Roshan killed at ${deathTime}s by ${aname} (slot ${ks}) team=${roshanTeam}`);
          }
          // Tormenter (NPC: npc_dota_neutral_tormentor)
          if (tname.includes('tormentor') || tname.includes('tormenter')) {
            const ks = npcNameToSlot[aname];
            let tormentTeam = 'unknown';
            if (ks != null && ks >= 0 && ks < 10) tormentTeam = ks < 5 ? 'radiant' : 'dire';
            gameEvents.push({ t: deathTime, type: 'tormenter', team: tormentTeam, killerSlot: ks != null ? ks : -1 });
            console.log(`[Replay] Tormenter killed at ${deathTime}s by ${aname} (slot ${ks}) team=${tormentTeam}`);
          }
          // Courier
          if (tname.includes('courier') || tname.includes('donkey')) {
            const ks = npcNameToSlot[aname];
            if (ks != null && ks >= 0 && ks < 10 && players[ks]) players[ks].courierKills = (players[ks].courierKills || 0) + 1;
          }
          // Building
          if (tname.includes('tower') || tname.includes('fort') || tname.includes('barracks') || tname.includes('rax')) {
            const ks = npcNameToSlot[aname];
            gameEvents.push({ t: deathTime, type: 'building', team: (ks != null && ks >= 0 && ks < 5) ? 'radiant' : 'dire', building: tname });
          }
        }
      }

      // ── Buyback ───────────────────────────────────────────────────────────
      // Streaming: type "DOTA_COMBATLOG_BUYBACK", hero in e.attackername or e.targetname
      // Blob:      type "buyback_log", slot in e.slot
      if (e.type === 'DOTA_COMBATLOG_BUYBACK') {
        // The buying hero may appear in either field depending on parser version
        const heroName = e.attackername || e.targetname;
        let slot = heroName ? npcNameToSlot[heroName] : null;
        // Some builds put the slot index directly
        if (slot == null && e.slot != null) {
          slot = e.slot;
          if (slot >= 128 && slot <= 132) slot = slot - 128 + 5;
        }
        if (slot != null && slot >= 0 && slot < 10) combatLogBuybacks[slot] = (combatLogBuybacks[slot] || 0) + 1;
      } else if (e.type === 'buyback_log') {
        let slot = e.slot;
        if (slot != null && slot >= 128 && slot <= 132) slot = slot - 128 + 5;
        if (slot != null && slot >= 0 && slot < 10) combatLogBuybacks[slot] = (combatLogBuybacks[slot] || 0) + 1;
      }

      // ── Ability level-up ──────────────────────────────────────────────────
      // Streaming: type "DOTA_COMBATLOG_ABILITY_LEVEL", ability in e.inflictor, hero in e.attackername, level in e.value
      // Blob:      type "ability_levels",               ability in e.key,       hero via e.slot/e.unit, level in e.level
      {
        let alSlot = null, abilityName = null, abilityLevel = 0;
        if (e.type === 'DOTA_COMBATLOG_ABILITY_LEVEL' && e.inflictor) {
          alSlot = npcNameToSlot[e.attackername]; abilityName = e.inflictor; abilityLevel = e.value || 0;
        } else if (e.type === 'ability_levels' && e.key) {
          let s = e.slot; if (s == null && e.unit) s = npcNameToSlot[e.unit]; alSlot = s;
          abilityName = e.key; abilityLevel = e.level || 0;
        }
        if (alSlot != null && alSlot >= 0 && alSlot < 10 && abilityName) {
          if (!abilityLevelups[alSlot]) abilityLevelups[alSlot] = [];
          abilityLevelups[alSlot].push({
            abilityName,
            abilityLevel: abilityLevel || abilityLevelups[alSlot].length + 1,
            time: e.time || 0,
          });
        }
      }

      // ── Hero damage / tower damage / damage taken ─────────────────────────
      // Streaming: type "DOTA_COMBATLOG_DAMAGE", attacker in e.attackername, victim in e.targetname
      // Blob: type "damage" (attacker-centric, attacker in e.unit, victim in e.key)
      //       type "damage_taken" (victim-centric, victim in e.unit, attacker in e.key)
      if ((e.type === 'DOTA_COMBATLOG_DAMAGE' || e.type === 'damage') && e.value > 0) {
        const attackerName = e.type === 'DOTA_COMBATLOG_DAMAGE' ? e.attackername : e.unit;
        const victimName   = e.type === 'DOTA_COMBATLOG_DAMAGE' ? e.targetname   : e.key;
        let attackerSlot = e.type === 'damage' ? e.slot : null;
        if (attackerSlot == null) attackerSlot = npcNameToSlot[attackerName];
        if (attackerSlot != null && attackerSlot >= 0 && attackerSlot < 10) {
          if (e.targethero && !e.targetillusion) {
            heroDamage[attackerSlot] = (heroDamage[attackerSlot] || 0) + e.value;
            if (!hdPoints[attackerSlot]) hdPoints[attackerSlot] = [];
            hdPoints[attackerSlot].push({ t: e.time || 0, cumHd: heroDamage[attackerSlot] });
          }
          if (victimName && (victimName.includes('tower') || victimName.includes('fort') || victimName.includes('barracks') || victimName.includes('rax'))) {
            towerDamage[attackerSlot] = (towerDamage[attackerSlot] || 0) + e.value;
          }
        }
        // Damage taken (both streaming and blob "damage" event — victim is targetname)
        if (e.targethero && !e.targetillusion && victimName) {
          const victimSlot = npcNameToSlot[victimName];
          if (victimSlot != null && victimSlot >= 0 && victimSlot < 10) {
            damageTaken[victimSlot] = (damageTaken[victimSlot] || 0) + e.value;
          }
        }
      }
      if (e.type === 'damage_taken' && e.value > 0) {          // blob-only victim-centric event
        let targetSlot = e.slot; if (targetSlot == null && e.unit) targetSlot = npcNameToSlot[e.unit];
        if (targetSlot != null && targetSlot >= 0 && targetSlot < 10) damageTaken[targetSlot] = (damageTaken[targetSlot] || 0) + e.value;
      }

      // ── Pudge hook tracking ───────────────────────────────────────────────
      // Cast (unit-order): "actions" event, key="5" (DOTA_UNIT_ORDER_CAST_POSITION), slot = Pudge's slot.
      //   x/y are raw game-world coords from the parser — divide by 128 to get normalised interval coords.
      //   inflictor = CDOTA_Ability_Pudge_MeatHook (when ability entity lookup succeeds).
      // Cast (combatlog): streaming DOTA_COMBATLOG_ABILITY / blob ability_cast|ability_use, inflictor=pudge_meat_hook
      // Hit:             streaming DOTA_COMBATLOG_DAMAGE / blob damage, inflictor=pudge_meat_hook
      {
        // Unit-order cast event (primary, most accurate — provides target position)
        if (e.type === 'actions' && e.key === '5') {
          const slot = e.slot;
          if (slot != null && slot >= 0 && slot < 10) {
            // Only collect if it's the hook ability (if inflictor available), or store all and filter by Pudge slot later
            const isHook = !e.inflictor || e.inflictor.includes('MeatHook') || e.inflictor.includes('meat_hook');
            if (isHook) {
              const normX = e.x != null ? e.x / 128 : null;
              const normY = e.y != null ? e.y / 128 : null;
              hookUnitOrders.push({ time: e.time || 0, slot, normX, normY });
            }
          }
        }

        const inf = e.inflictor || e.key || '';
        if (inf === 'pudge_meat_hook') {
          // Combatlog cast event (fallback)
          if (e.type === 'DOTA_COMBATLOG_ABILITY' || e.type === 'ability_cast' || e.type === 'ability_use') {
            const casterName = e.attackername || e.unit || '';
            let castSlot = e.slot != null ? e.slot : npcNameToSlot[casterName];
            if (castSlot != null && castSlot >= 0 && castSlot < 10) {
              hookCasts.push({ time: e.time || 0, slot: castSlot });
            }
          }
          // Damage event (hook connected with something)
          if ((e.type === 'DOTA_COMBATLOG_DAMAGE' || e.type === 'damage') && e.value > 0 && !e.targetillusion) {
            const attackerName = e.type === 'DOTA_COMBATLOG_DAMAGE' ? e.attackername : e.unit;
            const targetName   = e.type === 'DOTA_COMBATLOG_DAMAGE' ? e.targetname   : e.key;
            let attackerSlot = e.slot != null && e.type !== 'DOTA_COMBATLOG_DAMAGE' ? e.slot : npcNameToSlot[attackerName];
            if (attackerSlot != null && attackerSlot >= 0 && attackerSlot < 10) {
              hookHits.push({
                time: e.time || 0,
                slot: attackerSlot,
                targetHero: !!e.targethero,
                targetName: targetName || '',
              });
            }
          }
        }
      }

      // ── Healing ───────────────────────────────────────────────────────────
      // Streaming: type "DOTA_COMBATLOG_HEAL", healer in e.attackername, target in e.targetname
      // Blob:      type "healing",             healer in e.unit,         target in e.key
      if ((e.type === 'DOTA_COMBATLOG_HEAL' || e.type === 'healing') && e.value > 0) {
        const healerName = e.type === 'DOTA_COMBATLOG_HEAL' ? e.attackername : e.unit;
        const targetName = e.type === 'DOTA_COMBATLOG_HEAL' ? e.targetname   : e.key;
        let slot = e.type === 'healing' ? e.slot : null;
        if (slot == null) slot = npcNameToSlot[healerName];
        if (slot != null && slot >= 0 && slot < 10) {
          const isSelfHeal = !targetName || healerName === targetName;
          if (e.targethero && !e.targetillusion && !isSelfHeal) {
            heroHealing[slot] = (heroHealing[slot] || 0) + e.value;
          }
        }
      }

      if (e.type === 'interval' && e.slot != null && e.slot >= 0 && e.slot < 10) {
        const slot = e.slot;
        const currentTime = e.time || 0;
        if (e.hero_inventory && Array.isArray(e.hero_inventory) && e.hero_inventory.length > 0) {
          if (!_inventoryDebugLogged) {
            console.log(`[Replay] FIRST hero_inventory sample (slot=${slot}, time=${currentTime}): ${JSON.stringify(e.hero_inventory.slice(0, 3))}`);
            _inventoryDebugLogged = true;
          }
          const snapshot = {};
          for (const item of e.hero_inventory) {
            if (item && item.slot != null) {
              const rawId = item.id ?? item.itemid ?? item.item_id ?? null;
              // Numeric 0 means empty slot
              if (rawId === 0 || rawId === null) continue;
              const itemName = typeof rawId === 'string' ? rawId.replace(/^item_/, '') :
                               typeof rawId === 'number' ? (ITEM_ID_TO_NAME[rawId] || `id_${rawId}`) : '';
              if (itemName) {
                snapshot[item.slot] = {
                  itemId: typeof rawId === 'number' ? rawId : 0,
                  itemName,
                  time: currentTime,
                  charges: item.num_charges || 0
                };
              }
            }
          }
          // Always keep the latest snapshot (latest timestamp wins)
          if (Object.keys(snapshot).length > 0) {
            if (!finalItemsTime[slot] || currentTime >= finalItemsTime[slot]) {
              finalItems[slot] = snapshot;
              finalItemsTime[slot] = currentTime;
            }
          }
        }
      }
    }

    // Back-fill timeline sample hd values with cumulative hero damage from hdPoints
    for (const [slotStr, samples] of Object.entries(timelineSamples)) {
      const pts = hdPoints[parseInt(slotStr)] || [];
      if (pts.length === 0) continue;
      let pIdx = 0;
      for (const sample of samples) {
        while (pIdx + 1 < pts.length && pts[pIdx + 1].t <= sample.t) pIdx++;
        sample.hd = pts[pIdx].t <= sample.t ? pts[pIdx].cumHd : 0;
      }
    }

    console.log('[Replay] Hero damage by slot:', JSON.stringify(heroDamage));
    console.log('[Replay] Tower damage by slot:', JSON.stringify(towerDamage));
    console.log('[Replay] Hero healing by slot:', JSON.stringify(heroHealing));
    console.log('[Replay] Damage taken by slot:', JSON.stringify(damageTaken));
    console.log('[Replay] Support gold spent by slot:', JSON.stringify(supportGoldSpent));

    // Summarise inventory snapshots
    const invSummary = {};
    for (let s = 0; s < 10; s++) {
      invSummary[s] = finalItemsTime[s] != null
        ? `t=${finalItemsTime[s]}s items=${Object.keys(finalItems[s]||{}).length}`
        : 'none';
    }
    console.log('[Replay] hero_inventory snapshot summary (duration=' + duration + 's):', JSON.stringify(invSummary));

    // Compute nemesis per slot (killer who killed victim the most, minimum 2 kills)
    const nemesis = {};
    for (let slot = 0; slot < 10; slot++) {
      const byKiller = killedBy[slot];
      if (!byKiller) continue;
      let maxKills = 1, nemesisSlot = -1;
      for (const [kSlot, count] of Object.entries(byKiller)) {
        if (count > maxKills) { maxKills = count; nemesisSlot = parseInt(kSlot); }
      }
      if (nemesisSlot >= 0) nemesis[slot] = { slot: nemesisSlot, count: maxKills };
    }
    let epiloguePlayerInfos = [];
    if (epilogueData) {
      const dota = this._getNestedField(epilogueData,
        'gameInfo.dota', 'gameInfo_.dota_', 'gameInfo_.dota',
        'game_info.dota', 'game_info_.dota_'
      );
      if (dota) {
        epiloguePlayerInfos = dota.playerInfo_ || dota.playerInfo || dota.player_info_ || dota.player_info || [];
      }
    }

    console.log(`[Replay] Epilogue player infos: ${epiloguePlayerInfos.length} entries`);
    if (epiloguePlayerInfos.length > 0) {
      console.log('[Replay] First player info keys:', Object.keys(epiloguePlayerInfos[0]));
    }

    for (let i = 0; i < epiloguePlayerInfos.length && i < 10; i++) {
      const pi = epiloguePlayerInfos[i];
      if (players[i]) {
        const steamId = pi.steamid || pi.steamid_ || pi.steamId || pi.steam_id || pi.steamId_;
        if (steamId) {
          try {
            const steamId64 = BigInt(steamId.toString());
            const accountId = Number(steamId64 - BigInt('76561197960265728'));
            if (accountId > 0) players[i].accountId = accountId;
          } catch {}
        }

        let playerName = pi.playerName || pi.playerName_ || pi.player_name || pi.player_name_ || pi.heroName || pi.heroName_;
        if (playerName) {
          if (typeof playerName === 'object' && playerName.bytes && Array.isArray(playerName.bytes)) {
            try {
              playerName = Buffer.from(playerName.bytes.map(b => b < 0 ? b + 256 : b)).toString('utf8');
            } catch {}
          } else if (typeof playerName !== 'string') {
            playerName = String(playerName);
          }
          players[i].personaname = playerName;
        }

        let heroName = pi.heroName || pi.heroName_ || pi.hero_name || pi.hero_name_;
        if (heroName) {
          if (typeof heroName === 'object' && heroName.bytes && Array.isArray(heroName.bytes)) {
            try {
              heroName = Buffer.from(heroName.bytes.map(b => b < 0 ? b + 256 : b)).toString('utf8');
            } catch {}
          } else if (typeof heroName !== 'string') {
            heroName = String(heroName);
          }
          players[i].heroName = heroName;
        }

        const gameTeam = pi.gameTeam != null ? pi.gameTeam :
                         pi.gameTeam_ != null ? pi.gameTeam_ :
                         pi.game_team != null ? pi.game_team :
                         pi.game_team_ != null ? pi.game_team_ : null;
        if (gameTeam != null) {
          players[i].gameTeam = gameTeam;
        }
      }
    }

    if (!matchId) {
      matchId = 'replay_' + Date.now();
    }

    // ── Pudge hook stat computation ────────────────────────────────────────
    // Interpolate a player's (x,y) position at a given time from sampled positions.
    const interpolatePos = (slot, time) => {
      const samples = allPositions[slot] || [];
      if (samples.length === 0) return null;
      let before = null, after = null;
      for (const s of samples) {
        if (s.t <= time) before = s;
        else if (!after) { after = s; break; }
      }
      if (before && after) {
        const frac = (time - before.t) / (after.t - before.t);
        return { x: before.x + frac * (after.x - before.x), y: before.y + frac * (after.y - before.y) };
      }
      return before || after || null;
    };

    // ── Hook geometry constants ──────────────────────────────────────────────
    // All distances in normalised coords (1 unit = 128 Dota2 units).
    //
    // MAX_HOOK_RANGE: generous cap covering every realistic scenario:
    //   Base range 1300 + Aether Lens 225 + level talent 125 + margin 150 = 1800 Dota2 units
    const MAX_HOOK_RANGE_NORM  = 1800 / 128;         // ≈ 14.06 normalised units
    //
    // HOOK_PATH_RADIUS: how close to the hook's flight path an enemy must be for the
    // cast to count as "aimed at that hero".  400 Dota2 units is wide enough to catch
    // slight mis-predictions and movement dodges without including enemies that are
    // clearly off to the side.
    const HOOK_PATH_RADIUS_NORM = 400 / 128;         // ≈ 3.125 normalised units
    const HOOK_PATH_RADIUS_SQ   = HOOK_PATH_RADIUS_NORM * HOOK_PATH_RADIUS_NORM; // ≈ 9.77
    //
    // FALLBACK_RANGE: used when we only have Pudge's position (no target point) — old behaviour.
    const FALLBACK_RANGE_SQ = (1500 / 128) * (1500 / 128); // ≈ 137

    const hookStats  = {}; // slot → { attempts, hits }
    const pudgeHeroId = 14;

    // ── Genuine-attempt filter ──────────────────────────────────────────────
    // Returns true when an enemy hero is within the hook's collision cylinder along
    // its trajectory from Pudge toward the clicked target point.
    //
    // Handles three edge cases automatically:
    //  1. Player clicked PAST the enemy (hook falls short on range) — the line
    //     segment extends to MAX_HOOK_RANGE so the enemy is still on the path.
    //  2. Items/talents extending range (Aether Lens +225, talent +125) — covered
    //     by the generous MAX_HOOK_RANGE cap.
    //  3. Player aimed NEAR but not exactly at the hero — HOOK_PATH_RADIUS gives
    //     a 400-unit-wide cylinder around the trajectory.
    //
    // Falls back to a simpler radius check when either position is unavailable
    // (e.g. combatlog casts that carry no target coords, or missing interval data).
    const makeGenuineAttemptChecker = (pSlot, enemySlots) => (normX, normY, time) => {
      const pudgePos = interpolatePos(pSlot, time);

      // ── Line-segment path check (used when we have both Pudge pos + target) ──
      if (pudgePos && normX != null && normY != null) {
        const dxPT = normX - pudgePos.x, dyPT = normY - pudgePos.y;
        const distToTarget = Math.sqrt(dxPT * dxPT + dyPT * dyPT);
        if (distToTarget === 0) return false; // degenerate — player somehow clicked on themselves
        // The click defines the DIRECTION only. The hook always flies the full max range,
        // so enemies beyond the click point (player clicked short) are still on the path.
        const hookLen = MAX_HOOK_RANGE_NORM;
        const dirX = dxPT / distToTarget, dirY = dyPT / distToTarget;

        for (const eSlot of enemySlots) {
          const ePos = interpolatePos(eSlot, time);
          if (!ePos) continue;
          // Project enemy onto hook line; clamp to [0, hookLen]
          const ex = ePos.x - pudgePos.x, ey = ePos.y - pudgePos.y;
          const t  = Math.max(0, Math.min(hookLen, ex * dirX + ey * dirY));
          const cx = pudgePos.x + t * dirX, cy = pudgePos.y + t * dirY;
          const px = ePos.x - cx, py = ePos.y - cy;
          if (px * px + py * py <= HOOK_PATH_RADIUS_SQ) return true;
        }
        return false;
      }

      // ── Fallback: radius check from the best available reference point ──
      const refPos = pudgePos || (normX != null ? { x: normX, y: normY } : null);
      if (!refPos) return true; // no position data at all — give benefit of the doubt
      for (const eSlot of enemySlots) {
        const ePos = interpolatePos(eSlot, time);
        if (!ePos) continue;
        const dx = refPos.x - ePos.x, dy = refPos.y - ePos.y;
        if (dx * dx + dy * dy <= FALLBACK_RANGE_SQ) return true;
      }
      return false;
    };

    const pudgeSlots = Object.values(players).filter(p => p.heroId === pudgeHeroId).map(p => p.slot);
    for (const pSlot of pudgeSlots) {
      let attempts = 0, hits = 0;
      const myTeam = pSlot < 5 ? 'radiant' : 'dire';
      const enemySlots = Object.values(players)
        .filter(p => (p.slot < 5 ? 'radiant' : 'dire') !== myTeam)
        .map(p => p.slot);

      const isGenuineAttempt = makeGenuineAttemptChecker(pSlot, enemySlots);

      const myHits          = hookHits.filter(h => h.slot === pSlot);
      const myUnitOrders    = hookUnitOrders.filter(c => c.slot === pSlot);
      const myCombatlogCasts = hookCasts.filter(c => c.slot === pSlot);
      const castsToUse      = myUnitOrders.length > 0 ? myUnitOrders : myCombatlogCasts;
      const useTargetPos    = myUnitOrders.length > 0;

      console.log(`[Replay] Pudge slot ${pSlot}: ${myUnitOrders.length} unit-order casts, ${myCombatlogCasts.length} combatlog casts, ${myHits.length} hits`);

      if (castsToUse.length > 0) {
        for (const cast of castsToUse) {
          const normX = useTargetPos ? cast.normX : null;
          const normY = useTargetPos ? cast.normY : null;
          const hit   = myHits.find(h => h.time >= cast.time && h.time <= cast.time + 2.5);
          if (hit) {
            if (hit.targetHero) {
              // Confirmed hero hit — always a genuine attempt
              attempts++; hits++;
            } else {
              // Hit a creep/non-hero.
              // Farming hook: only excluded when there was NO enemy anywhere along
              // the hook path. If an enemy was in the path but Pudge hit a creep
              // instead (bad timing, creep block), it still counts.
              if (isGenuineAttempt(normX, normY, cast.time)) attempts++;
            }
          } else {
            // Complete miss (hook hit nothing) — always a genuine attempt.
            // If Pudge bothered to cast it and it hit nothing, he was trying.
            attempts++;
          }
        }
      } else {
        // No cast events at all — infer from hit events only
        for (const hit of myHits) {
          if (hit.targetHero) {
            attempts++; hits++;
          } else {
            if (isGenuineAttempt(null, null, hit.time)) attempts++;
          }
        }
      }

      hookStats[pSlot] = { attempts, hits };
      console.log(`[Replay] Pudge slot ${pSlot}: ${hits} hook hits / ${attempts} genuine attempts`);
    }

    const detectedPositions = this._detectPositions(players, laningData, maxTime);
    console.log('[Replay] Detected positions:', JSON.stringify(detectedPositions));

    const durationMin = Math.max(duration / 60, 1);
    const playerList = [];

    for (let slot = 0; slot < 10; slot++) {
      const p = players[slot];
      if (!p) continue;

      const npcName = HERO_ID_TO_NPC[p.heroId] || '';
      if (!p.heroName && npcName) {
        p.heroName = npcName;
      }

      let team;
      if (p.gameTeam != null) {
        team = p.gameTeam === 2 ? 'radiant' : p.gameTeam === 3 ? 'dire' : (slot < 5 ? 'radiant' : 'dire');
      } else if (playerSlots[slot] != null) {
        team = playerSlots[slot] < 128 ? 'radiant' : 'dire';
      } else {
        team = slot < 5 ? 'radiant' : 'dire';
      }

      const isCaptain = (team === 'radiant' && slot === 0) || (team === 'dire' && slot === 5);

      const mk = multiKills[slot] || { double: 0, triple: 0, ultra: 0, rampage: 0 };

      const playerItems = [];
      const purchases = (itemPurchases[slot] || []).slice().reverse();

      // Build a set of all item names this player purchased (normalised, no "item_" prefix)
      const purchasedNames = new Set(
        (itemPurchases[slot] || []).map(p => p.itemName.replace(/^item_/, ''))
      );

      // Validate the hero_inventory snapshot using a TIME CHECK only:
      // The snapshot must be from the final 90 seconds of the game.
      // Snapshots from early/mid-game are stale and unreliable.
      // NOTE: A purchase-log cross-check was previously used here but caused false negatives —
      // assembled items (Lotus Orb, Eul's, etc.) and Roshan drops (Aegis, Cheese) do not appear
      // in the purchase log by their final item name, so the cross-check wrongly rejected valid
      // snapshots and fell back to the purchase log, producing incorrect end-game items.
      let inventoryValid = false;
      if (finalItems[slot]) {
        const snapshotTime = finalItemsTime[slot] || 0;
        const isRecent = duration > 0 ? snapshotTime >= duration - 180 : true;
        inventoryValid = isRecent;
        const snapItems = Object.entries(finalItems[slot]).map(([s, d]) => `${s}:${d.itemName}`).join(',');
        if (!isRecent) {
          console.log(`[Replay] slot ${slot}: STALE snapshot (t=${snapshotTime}s, duration=${duration}s) items=[${snapItems}] — purchase log fallback`);
        } else {
          console.log(`[Replay] slot ${slot}: OK snapshot t=${snapshotTime}s/${duration}s items=[${snapItems}]`);
        }
      } else {
        console.log(`[Replay] slot ${slot}: NO hero_inventory snapshot — purchase log fallback (purchases=${(itemPurchases[slot]||[]).length})`);
      }

      if (finalItems[slot] && inventoryValid) {
        for (const [itemSlot, itemData] of Object.entries(finalItems[slot])) {
          playerItems.push({
            slot: parseInt(itemSlot),
            itemId: itemData.itemId,
            itemName: itemData.itemName || ITEM_ID_TO_NAME[itemData.itemId] || '',
            purchaseTime: 0,
          });
        }
      }
      if (playerItems.length === 0 && purchases.length > 0) {
        const seen = new Set();
        let itemSlot = 0;
        for (const purchase of purchases) {
          if (itemSlot >= 6) break;
          if (purchase.itemName.startsWith('item_recipe_')) continue;
          if (purchase.itemName === 'item_tpscroll' || purchase.itemName === 'item_ward_observer' ||
              purchase.itemName === 'item_ward_sentry' || purchase.itemName === 'item_ward_dispenser' ||
              purchase.itemName === 'item_smoke_of_deceit' || purchase.itemName === 'item_dust' ||
              purchase.itemName === 'item_clarity' || purchase.itemName === 'item_flask' ||
              purchase.itemName === 'item_tango' || purchase.itemName === 'item_enchanted_mango' ||
              purchase.itemName === 'item_faerie_fire' || purchase.itemName === 'item_blood_grenade') continue;
          const key = purchase.itemName;
          if (!seen.has(key)) {
            seen.add(key);
            playerItems.push({
              slot: itemSlot++,
              itemId: 0,
              itemName: purchase.itemName.replace('item_', ''),
              purchaseTime: purchase.time,
            });
          }
        }
      }

      // has_scepter: only true for the CONSUMED Aghanim's Blessing form (ultimate_scepter_2 / id 108).
      // A regular physical Aghanim's Scepter (ultimate_scepter) sits in inventory slots 0–5 and
      // is already shown as an item icon — the dedicated indicator is for the consumed/gifted upgrade only.
      const hasScepter = playerItems.some(i =>
        i.itemName === 'ultimate_scepter_2' || i.itemId === 108);

      // has_shard: true when the shard was purchased AND is no longer in the physical inventory
      // (slots 0–8), meaning it was consumed and the hero has the upgrade.
      // If shard is still physically in inventory it shows as a normal item icon.
      const shardPurchased = (itemPurchases[slot] || []).some(i => i.itemName === 'item_aghanims_shard');
      const shardInPhysicalInv = playerItems.some(i => i.itemName === 'aghanims_shard' && i.slot <= 8);
      const hasShard = shardPurchased && !shardInPhysicalInv;

      playerList.push({
        accountId: p.accountId || 0,
        personaname: p.personaname || `Player ${slot + 1}`,
        heroId: p.heroId,
        heroName: p.heroName || '',
        team,
        slot,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        lastHits: p.lastHits,
        denies: p.denies,
        goldPerMin: Math.round(p.gold / durationMin),
        xpPerMin: Math.round(p.xp / durationMin),
        heroDamage: heroDamage[slot] || 0,
        towerDamage: towerDamage[slot] || 0,
        heroHealing: heroHealing[slot] || 0,
        damageTaken: damageTaken[slot] || 0,
        level: p.level,
        netWorth: p.networth || p.gold,
        obsPlaced: p.obsPlaced,
        senPlaced: p.senPlaced,
        creepsStacked: p.creepsStacked,
        campsStacked: p.campsStacked,
        position: detectedPositions[slot] || 0,
        isCaptain,
        runePickups: p.runePickups || 0,
        stunDuration: Math.round((p.stuns || 0) * 100) / 100,
        towersKilled: p.towersKilled || 0,
        roshansKilled: p.roshansKilled || 0,
        teamfightParticipation: Math.round((p.teamfightParticipation || 0) * 100) / 100,
        firstbloodClaimed: p.firstbloodClaimed ? 1 : 0,
        wardsKilled: wardKills[slot] || 0,
        obsPurchased: obsPurchased[slot] || 0,
        senPurchased: senPurchased[slot] || 0,
        buybacks: combatLogBuybacks[slot] || p.buybacks || 0,
        courierKills: p.courierKills || 0,
        tpScrollsUsed: tpScrollsUsed[slot] || 0,
        doubleKills: mk.double,
        tripleKills: mk.triple,
        ultraKills: mk.ultra,
        rampages: mk.rampage,
        killStreak: killStreaks[slot] || 0,
        smokeKills: smokeKills[slot] || 0,
        firstDeath: firstDeathSlot.slot === slot ? 1 : 0,
        laneCs10min: laneCs10min[slot] || 0,
        laningNw: laningNwAtEight[slot] ? laningNwAtEight[slot].nw : null,
        hasScepter,
        hasShard,
        items: playerItems,
        abilities: abilityLevelups[slot] || [],
        supportGoldSpent: supportGoldSpent[slot] || 0,
        nemesisHeroName: nemesis[slot] != null ? (players[nemesis[slot].slot]?.heroName || '') : '',
        nemesisKills: nemesis[slot] != null ? nemesis[slot].count : 0,
        killedBy: Object.entries(killedBy[slot] || {}).reduce((acc, [kSlot, count]) => {
          const killer = players[parseInt(kSlot)];
          if (killer?.accountId) acc[String(killer.accountId)] = count;
          return acc;
        }, {}),
        hookAttempts: hookStats[slot] ? hookStats[slot].attempts : null,
        hookHits: hookStats[slot] ? hookStats[slot].hits : null,
        wardPlacements: wardPlacements[slot] || [],
        timelineSamples: timelineSamples[slot] || [],
      });
    }

    if (radiantWin === null && playerList.length > 0) {
      const radiantKills = playerList.filter(p => p.team === 'radiant').reduce((s, p) => s + p.kills, 0);
      const direKills = playerList.filter(p => p.team === 'dire').reduce((s, p) => s + p.kills, 0);
      radiantWin = radiantKills > direKills;
    }

    // --- Draft post-processing ---
    // Step 1: deduplicate by hero_id, preferring entries with a non-null rawTeam
    const draftByHero = new Map();
    for (const d of draftRaw) {
      const existing = draftByHero.get(d.heroId);
      if (!existing) {
        draftByHero.set(d.heroId, d);
      } else if (d.rawTeam != null && (existing.rawTeam == null)) {
        draftByHero.set(d.heroId, d);
      }
    }
    const draftDeduped = Array.from(draftByHero.values()).sort((a, b) => a.order - b.order);

    // Step 2: build hero -> team map from actual player data
    const heroTeamMap = {};
    for (const p of playerList) {
      if (p.heroId > 0) heroTeamMap[p.heroId] = p.team; // 'radiant' or 'dire'
    }

    // Step 3: log IDs for diagnostics
    const playerHeroIds = Object.keys(heroTeamMap).map(Number);
    const pickHeroIds = draftDeduped.filter(d => d.isPick).map(d => d.heroId);
    console.log(`[Draft] playerHeroIds: ${playerHeroIds.join(',')}`);
    console.log(`[Draft] pickHeroIds:   ${pickHeroIds.join(',')}`);

    // Step 4: Determine which team went first using pick→player cross-reference.
    // Dota 2 CM draft pattern (0-indexed sequence position, 24 actions total):
    //   Phase 1: 7 bans  A,B,A,B,A,B,A
    //   Phase 1: 2 picks A,B
    //   Phase 2: 3 bans  B,A,B
    //   Phase 2: 6 picks B,A,A,B,B,A  (pairs: BA then AB then BA)
    //   Phase 3: 4 bans  A,B,A,B
    //   Phase 3: 2 picks A,B
    // where A = team that went first (0), B = other team (1)
    // Verified against live match data (order_num 1-24 with known player teams).
    const CM_PATTERN = [
      0,1,0,1,0,1,0,  // bans phase 1 (7): A,B,A,B,A,B,A
      0,1,            // picks phase 1 (2): A,B
      1,0,1,          // bans phase 2 (3): B,A,B
      1,0,0,1,1,0,    // picks phase 2 (6): B,A,A,B,B,A
      0,1,0,1,        // bans phase 3 (4): A,B,A,B
      0,1,            // picks phase 3 (2): A,B
    ];

    // For each pick find its team from player data (hero ID cross-reference)
    // heroTeamMap keys might be string or number, so coerce both sides to Number
    const getPlayerTeam = (heroId) => {
      const id = Number(heroId);
      return heroTeamMap[id] || heroTeamMap[String(id)] || null;
    };

    // Determine radiantFirst: is the first-picking team radiant?
    // The first pick is at CM sequence position 8.
    let radiantFirst = null; // true = radiant goes first, false = dire goes first
    for (let i = 0; i < draftDeduped.length; i++) {
      const d = draftDeduped[i];
      if (!d.isPick) continue;
      const pt = getPlayerTeam(d.heroId);
      if (pt == null) continue;
      // Which CM pattern slot does this pick correspond to?
      // Sequence position = i (since draftDeduped is sorted by order)
      const seqPos = i < CM_PATTERN.length ? i : null;
      if (seqPos == null) continue;
      const isTeamA = CM_PATTERN[seqPos] === 0; // 0 = team A in pattern
      if (pt === 'radiant') {
        radiantFirst = isTeamA; // radiant is team A if this pick is team A's slot
      } else {
        radiantFirst = !isTeamA; // radiant is team B if this pick is team B's slot
      }
      break; // stop after first successfully resolved pick
    }
    console.log(`[Draft] radiantFirst=${radiantFirst} (from hero cross-reference)`);

    // Step 5: assign team to every entry using CM pattern
    const draft = draftDeduped.map((d, i) => {
      let team;
      if (i < CM_PATTERN.length && radiantFirst !== null) {
        // Use CM pattern: CM_PATTERN[i]=0 means team A, 1 means team B
        const isTeamA = CM_PATTERN[i] === 0;
        const isRadiant = radiantFirst ? isTeamA : !isTeamA;
        team = isRadiant ? 0 : 1;
      } else {
        // Fallback: use heroTeamMap directly for picks, rawTeam convention for bans
        const pt = getPlayerTeam(d.heroId);
        if (d.isPick && pt != null) {
          team = pt === 'radiant' ? 0 : 1;
        } else {
          // rawTeam: 2=radiant, 3=dire in Dota protobuf
          team = d.rawTeam === 3 ? 1 : 0;
        }
      }
      return { heroId: d.heroId, isPick: d.isPick, order: d.order, team };
    });
    // --- End draft post-processing ---

    const laneOutcomes = this._computeStratzLaneOutcomes(detectedPositions, players, laningNwAt10, laningXpAt10, laneCs10min, laningKillsAt10);

    console.log(`[Replay] Lane outcomes: ${JSON.stringify(laneOutcomes)}`);
    console.log(`[Replay] Timeline samples: ${Object.keys(timelineSamples).length} slots, ${Object.values(timelineSamples).reduce((s,a)=>s+a.length,0)} total points`);
    const totalWards = Object.values(wardPlacements).reduce((s,a)=>s+a.length,0);
    const wardBreakdown = Object.entries(wardPlacements).map(([sl, arr]) => `slot${sl}:${arr.length}`).join(', ');
    console.log(`[Replay] Ward placements: ${totalWards} total${wardBreakdown ? ` (${wardBreakdown})` : ' — NONE CAPTURED (check slot mapping)'}`);
    const totalPurchaseSlots = Object.keys(itemPurchases).length;
    const purchaseBreakdown = Object.entries(itemPurchases).map(([sl, arr]) => `slot${sl}:${arr.length}`).join(', ');
    console.log(`[Replay] Item purchases: ${totalPurchaseSlots} slots${purchaseBreakdown ? ` (${purchaseBreakdown})` : ' — NONE CAPTURED'}`);

    console.log(`[Replay] Final stats: matchId=${matchId}, duration=${duration}s, radiantWin=${radiantWin}, players=${playerList.length}`);
    for (const p of playerList) {
      console.log(`[Replay]   ${p.team} pos${p.position} ${p.isCaptain ? '(C)' : ''}: ${p.personaname} (hero=${p.heroId}, acct=${p.accountId}) K/D/A=${p.kills}/${p.deaths}/${p.assists} HD=${p.heroDamage} TD=${p.towerDamage} HH=${p.heroHealing} DT=${p.damageTaken} OBS=${p.obsPlaced} SEN=${p.senPlaced} STK=${p.campsStacked}`);
    }

    if (draft.length > 0) {
      console.log(`[Replay] Draft captured: ${draft.filter(d => !d.isPick).length} bans, ${draft.filter(d => d.isPick).length} picks`);
      console.log(`[Draft] First 4 entries: ${draft.slice(0,4).map(d=>`hero=${d.heroId} team=${d.team} pick=${d.isPick}`).join(' | ')}`);
    }

    return {
      matchId,
      duration,
      radiantWin,
      gameMode,
      gameStartTime,
      players: playerList,
      draft,
      parseMethod: 'odota-parser',
      gameTimeline: {
        interval: 30,
        players: playerList.map(p => {
          const slot = p.slot;
          const rawPurchases = itemPurchases[slot] || [];
          const purchaseLog = rawPurchases.filter(pu => {
            const n = pu.itemName;
            if (!n) return false;
            if (n.startsWith('item_recipe_')) return false;
            const skip = ['item_tpscroll','item_ward_observer','item_ward_sentry','item_ward_dispenser',
              'item_smoke_of_deceit','item_dust','item_clarity','item_flask',
              'item_tango','item_enchanted_mango','item_faerie_fire','item_blood_grenade','item_tome_of_knowledge'];
            if (skip.includes(n)) return false;
            return true;
          }).map(pu => ({ itemName: pu.itemName, time: pu.time || 0 }));
          return {
            slot,
            name: p.personaname || '',
            team: p.team,
            samples: p.timelineSamples || [],
            purchaseLog,
            abilityLog: (abilityLevelups[slot] || []).map((a, idx) => ({
              heroLevel: idx + 1,
              abilityName: a.abilityName,
              abilityLevel: a.abilityLevel,
              time: a.time || 0,
            })),
          };
        }),
        events: gameEvents.sort((a, b) => a.t - b.t),
      },
      laneOutcomes,
    };
  }

  _computeStratzLaneOutcomes(detectedPositions, players, laningNwAt10, laningXpAt10, laneCs10min, laningKillsAt10) {
    const MAX_NW_PER_PLAYER = 8000;
    const MAX_XP_PER_PLAYER = 7000;
    const MAX_CS = 153;

    const laneGroups = {
      bottom: { radiant: [], dire: [] },
      mid:    { radiant: [], dire: [] },
      top:    { radiant: [], dire: [] },
    };

    for (const [slotStr, pos] of Object.entries(detectedPositions)) {
      const slot = parseInt(slotStr);
      if (pos === 0) continue;
      const team = slot < 5 ? 'radiant' : 'dire';
      let lane;
      if (pos === 2) {
        lane = 'mid';
      } else if (pos === 1 || pos === 5) {
        lane = team === 'radiant' ? 'bottom' : 'top';
      } else if (pos === 3 || pos === 4) {
        lane = team === 'radiant' ? 'top' : 'bottom';
      } else {
        continue;
      }
      laneGroups[lane][team].push(slot);
    }

    const outcomes = {};
    for (const lane of ['bottom', 'mid', 'top']) {
      const rSlots = laneGroups[lane].radiant;
      const dSlots = laneGroups[lane].dire;
      if (rSlots.length === 0 || dSlots.length === 0) continue;

      const maxPlayers = Math.max(rSlots.length, dSlots.length);
      const maxNW = MAX_NW_PER_PLAYER * maxPlayers;
      const maxXP = MAX_XP_PER_PLAYER * maxPlayers;

      const sumStat = (slots, getter) => slots.reduce((s, slot) => s + (getter(slot) || 0), 0);

      const rNW = sumStat(rSlots, s => laningNwAt10[s]?.nw);
      const dNW = sumStat(dSlots, s => laningNwAt10[s]?.nw);
      const rXP = sumStat(rSlots, s => laningXpAt10[s]?.xp);
      const dXP = sumStat(dSlots, s => laningXpAt10[s]?.xp);
      const rCS = sumStat(rSlots, s => laneCs10min[s]);
      const dCS = sumStat(dSlots, s => laneCs10min[s]);

      const laneKDA = (slots) => slots.reduce((s, slot) => {
        const lk = laningKillsAt10[slot] || { k: 0, d: 0, a: 0 };
        return s + lk.k + lk.a - lk.d;
      }, 0);
      const rKDA = laneKDA(rSlots);
      const dKDA = laneKDA(dSlots);

      const adjNW = maxNW > 0 ? (rNW / maxNW) - (dNW / maxNW) : 0;
      const adjXP = maxXP > 0 ? (rXP / maxXP) - (dXP / maxXP) : 0;
      const adjCS = (rCS / MAX_CS) - (dCS / MAX_CS);
      const clamp6 = v => Math.min(Math.max(v, -6), 6);
      const kdaDiff = (clamp6(rKDA) / 6) - (clamp6(dKDA) / 6);
      const score = adjNW + adjXP + adjCS + (kdaDiff / 2);

      const abs = Math.abs(score);
      const getOutcome = (positive) => {
        if (abs < 0.15) return 'draw';
        if (abs < 0.6) return positive ? 'win' : 'loss';
        return positive ? 'stomp' : 'stomp_loss';
      };

      outcomes[lane] = {
        score: Math.round(score * 1000) / 1000,
        radiant: getOutcome(score > 0),
        dire: getOutcome(score < 0),
        radiantSlots: rSlots,
        direSlots: dSlots,
      };
    }
    return outcomes;
  }

  parseReplayHeader(filePath) {
    const buffer = fs.readFileSync(filePath);
    const result = {
      matchId: null,
      parseMethod: 'header_only',
    };

    try {
      const magic = buffer.toString('ascii', 0, 8);
      if (magic.startsWith('PBDEMS2')) {
        result.parseMethod = 'source2_header';
      }
      const matchIdMatch = buffer.toString('ascii', 0, Math.min(buffer.length, 4096)).match(/match_id[:\s]*(\d+)/);
      if (matchIdMatch) {
        result.matchId = matchIdMatch[1];
      }
    } catch (e) {
      console.warn('[Replay] Header parse warning:', e.message);
    }

    return result;
  }

  cleanup(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[Replay] Cleaned up: ${path.basename(filePath)}`);
      }
    } catch (err) {
      console.warn('[Replay] Cleanup warning:', err.message);
    }
  }

  shutdown() {
    if (this.parserProcess) {
      this.parserProcess.kill();
      this.parserProcess = null;
      this.parserReady = false;
      console.log('[Replay] Parser service stopped.');
    }
  }
}

let instance = null;
function getReplayParser() {
  if (!instance) {
    instance = new ReplayParser();
  }
  return instance;
}

module.exports = { getReplayParser };
