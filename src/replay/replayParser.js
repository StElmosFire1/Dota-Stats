const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('node-fetch');

const PARSER_JAR = path.join(process.cwd(), 'odota-parser', 'target', 'stats-0.1.0.jar');
const PARSER_PORT = 5600;

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

  async parseReplayFull(filePath) {
    if (!this.parserReady) {
      throw new Error('Parser service is not running. Replay parsing unavailable.');
    }

    const fileBuffer = fs.readFileSync(filePath);
    console.log(`[Replay] Sending ${path.basename(filePath)} to parser (${fileBuffer.length} bytes)...`);

    const response = await fetch(`http://localhost:${PARSER_PORT}/`, {
      method: 'POST',
      body: fileBuffer,
      headers: { 'Content-Type': 'application/octet-stream' },
      timeout: 300000,
    });

    if (!response.ok) {
      throw new Error(`Parser returned status ${response.status}`);
    }

    const rawText = await response.text();
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
    return this._aggregateStats(events);
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

    for (const e of events) {
      if (e.type === 'epilogue' && e.key) {
        try {
          epilogueData = JSON.parse(e.key);
          if (epilogueData.gameInfo && epilogueData.gameInfo.dota) {
            const dota = epilogueData.gameInfo.dota;
            matchId = dota.matchId ? dota.matchId.toString() : null;
            gameMode = dota.gameMode || 0;
            radiantWin = dota.radiantWin != null ? dota.radiantWin : null;
            if (dota.endTime && dota.preGameDuration != null) {
              duration = dota.endTime - (dota.preGameDuration || 0);
            }
          }
        } catch {}
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
        }
      }
    }

    const finalDuration = Object.values(maxTime).length > 0
      ? Math.max(...Object.values(maxTime), duration)
      : duration;
    if (finalDuration > 0) duration = finalDuration;

    const heroDamage = {};
    const towerDamage = {};
    const heroHealing = {};

    for (const e of events) {
      if (e.type === 'DOTA_COMBATLOG_DAMAGE' && e.slot != null && e.slot >= 0 && e.slot < 10) {
        if (e.targethero && !e.targetillusion) {
          heroDamage[e.slot] = (heroDamage[e.slot] || 0) + (e.value || 0);
        }
        if (e.targetname && e.targetname.includes('tower')) {
          towerDamage[e.slot] = (towerDamage[e.slot] || 0) + (e.value || 0);
        }
      }
      if (e.type === 'DOTA_COMBATLOG_HEAL' && e.slot != null && e.slot >= 0 && e.slot < 10) {
        if (e.targethero && !e.targetillusion) {
          heroHealing[e.slot] = (heroHealing[e.slot] || 0) + (e.value || 0);
        }
      }
    }

    const epiloguePlayerInfos = (epilogueData &&
      epilogueData.gameInfo &&
      epilogueData.gameInfo.dota &&
      epilogueData.gameInfo.dota.playerInfo_) || [];

    for (let i = 0; i < epiloguePlayerInfos.length && i < 10; i++) {
      const pi = epiloguePlayerInfos[i];
      if (players[i]) {
        if (pi.steamid) {
          try {
            const steamId64 = BigInt(pi.steamid);
            const accountId = Number(steamId64 - BigInt('76561197960265728'));
            if (accountId > 0) players[i].accountId = accountId;
          } catch {}
        }
        if (pi.playerName) players[i].personaname = pi.playerName;
        if (pi.heroName) players[i].heroName = pi.heroName;
        if (pi.gameTeam != null) {
          players[i].gameTeam = pi.gameTeam;
        }
      }
    }

    if (!matchId) {
      matchId = 'replay_' + Date.now();
    }

    const durationMin = Math.max(duration / 60, 1);
    const playerList = [];

    for (let slot = 0; slot < 10; slot++) {
      const p = players[slot];
      if (!p) continue;

      let team;
      if (p.gameTeam != null) {
        team = p.gameTeam === 2 ? 'radiant' : p.gameTeam === 3 ? 'dire' : (slot < 5 ? 'radiant' : 'dire');
      } else if (playerSlots[slot] != null) {
        team = playerSlots[slot] < 128 ? 'radiant' : 'dire';
      } else {
        team = slot < 5 ? 'radiant' : 'dire';
      }

      playerList.push({
        accountId: p.accountId || 0,
        personaname: p.personaname || p.heroName || `Player ${slot + 1}`,
        heroId: p.heroId,
        heroName: p.heroName || '',
        team,
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
        level: p.level,
        netWorth: p.gold,
      });
    }

    if (radiantWin === null && playerList.length > 0) {
      const radiantKills = playerList.filter(p => p.team === 'radiant').reduce((s, p) => s + p.kills, 0);
      const direKills = playerList.filter(p => p.team === 'dire').reduce((s, p) => s + p.kills, 0);
      radiantWin = radiantKills > direKills;
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
