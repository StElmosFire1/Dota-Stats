const fs = require('fs');
const path = require('path');

class ReplayParser {
  constructor() {
    this.replayDir = path.join(process.cwd(), 'replays');
    if (!fs.existsSync(this.replayDir)) {
      fs.mkdirSync(this.replayDir, { recursive: true });
    }
  }

  async downloadReplay(url, filename) {
    const fetch = require('node-fetch');
    const filePath = path.join(this.replayDir, filename);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);

    const buffer = await response.buffer();
    fs.writeFileSync(filePath, buffer);
    console.log(`[Replay] Downloaded: ${filename} (${buffer.length} bytes)`);
    return filePath;
  }

  parseReplay(filePath) {
    const buffer = fs.readFileSync(filePath);
    const header = this._readDemoHeader(buffer);
    console.log(`[Replay] Parsed header for: ${path.basename(filePath)}`);
    return header;
  }

  _readDemoHeader(buffer) {
    const result = {
      matchId: null,
      duration: 0,
      radiantWin: null,
      gameMode: 0,
      players: [],
      parseMethod: 'dem_header',
    };

    try {
      const magic = buffer.toString('ascii', 0, 8);
      if (magic.startsWith('PBDEMS2')) {
        result.parseMethod = 'source2_header';
        const demoInfoOffset = buffer.indexOf(Buffer.from('CDemoFileInfo'));
        if (demoInfoOffset >= 0) {
          result.parseMethod = 'source2_demo_info';
        }
      }

      const matchIdMatch = buffer.toString('ascii', 0, Math.min(buffer.length, 4096)).match(/match_id[:\s]*(\d+)/);
      if (matchIdMatch) {
        result.matchId = matchIdMatch[1];
      }
    } catch (e) {
      console.warn('[Replay] Header parse warning:', e.message);
    }

    if (!result.matchId) {
      result.matchId = 'replay_' + Date.now();
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
}

let instance = null;
function getReplayParser() {
  if (!instance) {
    instance = new ReplayParser();
  }
  return instance;
}

module.exports = { getReplayParser };
