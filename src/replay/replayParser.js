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
    const MAP_CENTER = 16384;
    const MID_BAND = 3000;
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
    let epilogueData = null;
    const maxTime = {};
    const laningData = {};

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
            console.log('[Replay] Epilogue dota keys:', Object.keys(dota));

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

            const endTime = dota.endTime || dota.endTime_ || dota.end_time || dota.end_time_ || 0;
            const preGame = dota.preGameDuration || dota.preGameDuration_ || dota.pre_game_duration || dota.pre_game_duration_ || 0;
            if (endTime) {
              duration = endTime - preGame;
            }

            console.log(`[Replay] Epilogue extracted: matchId=${matchId}, gameMode=${gameMode}, radiantWin=${radiantWin}, duration=${duration}`);
          } else {
            console.warn('[Replay] Could not find gameInfo.dota in epilogue. Keys:', JSON.stringify(Object.keys(epilogueData)).substring(0, 200));
          }
        } catch (err) {
          console.error('[Replay] Epilogue parse error:', err.message);
        }
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
        }

        if (currentTime <= 660 && e.x != null && e.y != null) {
          if (!laningData[e.slot]) laningData[e.slot] = [];
          laningData[e.slot].push({ time: currentTime, x: e.x, y: e.y, lh: e.lh || 0 });
        }
      }
    }

    const finalDuration = Object.values(maxTime).length > 0
      ? Math.max(...Object.values(maxTime), duration)
      : duration;
    if (finalDuration > 0) duration = finalDuration;

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

    for (const e of events) {
      if (e.type === 'DOTA_COMBATLOG_DAMAGE') {
        let attackerSlot = e.slot;
        if (attackerSlot == null && e.attackername) {
          attackerSlot = npcNameToSlot[e.attackername];
        }
        if (attackerSlot != null && attackerSlot >= 0 && attackerSlot < 10) {
          if (e.targethero && !e.targetillusion) {
            heroDamage[attackerSlot] = (heroDamage[attackerSlot] || 0) + (e.value || 0);
          }
          if (e.targetname && e.targetname.includes('tower')) {
            towerDamage[attackerSlot] = (towerDamage[attackerSlot] || 0) + (e.value || 0);
          }
        }
        if (e.targethero && !e.targetillusion && e.targetname) {
          const targetSlot = npcNameToSlot[e.targetname];
          if (targetSlot != null && targetSlot >= 0 && targetSlot < 10) {
            damageTaken[targetSlot] = (damageTaken[targetSlot] || 0) + (e.value || 0);
          }
        }
      }
      if (e.type === 'DOTA_COMBATLOG_HEAL') {
        let slot = e.slot;
        if (slot == null && e.attackername) {
          slot = npcNameToSlot[e.attackername];
        }
        if (slot != null && slot >= 0 && slot < 10) {
          if (e.targethero && !e.targetillusion) {
            heroHealing[slot] = (heroHealing[slot] || 0) + (e.value || 0);
          }
        }
      }
    }

    console.log('[Replay] Hero damage by slot:', JSON.stringify(heroDamage));
    console.log('[Replay] Tower damage by slot:', JSON.stringify(towerDamage));
    console.log('[Replay] Hero healing by slot:', JSON.stringify(heroHealing));
    console.log('[Replay] Damage taken by slot:', JSON.stringify(damageTaken));

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

        const playerName = pi.playerName || pi.playerName_ || pi.player_name || pi.player_name_ || pi.heroName || pi.heroName_;
        if (playerName) players[i].personaname = playerName;

        const heroName = pi.heroName || pi.heroName_ || pi.hero_name || pi.hero_name_;
        if (heroName) players[i].heroName = heroName;

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
      });
    }

    if (radiantWin === null && playerList.length > 0) {
      const radiantKills = playerList.filter(p => p.team === 'radiant').reduce((s, p) => s + p.kills, 0);
      const direKills = playerList.filter(p => p.team === 'dire').reduce((s, p) => s + p.kills, 0);
      radiantWin = radiantKills > direKills;
    }

    console.log(`[Replay] Final stats: matchId=${matchId}, duration=${duration}s, radiantWin=${radiantWin}, players=${playerList.length}`);
    for (const p of playerList) {
      console.log(`[Replay]   ${p.team} pos${p.position} ${p.isCaptain ? '(C)' : ''}: ${p.personaname} (hero=${p.heroId}, acct=${p.accountId}) K/D/A=${p.kills}/${p.deaths}/${p.assists} HD=${p.heroDamage} TD=${p.towerDamage} HH=${p.heroHealing} DT=${p.damageTaken} OBS=${p.obsPlaced} SEN=${p.senPlaced} STK=${p.campsStacked}`);
    }

    return {
      matchId,
      duration,
      radiantWin,
      gameMode,
      players: playerList,
      parseMethod: 'odota-parser',
    };
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
