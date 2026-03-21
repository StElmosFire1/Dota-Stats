require('dotenv').config();
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const HERO_NAMES = {
  1:'Anti-Mage',2:'Axe',3:'Bane',4:'Bloodseeker',5:'Crystal Maiden',
  6:'Drow Ranger',7:'Earthshaker',8:'Juggernaut',9:'Mirana',10:'Morphling',
  11:'Shadow Fiend',12:'Phantom Lancer',13:'Puck',14:'Pudge',15:'Razor',
  16:'Sand King',17:'Storm Spirit',18:'Sven',19:'Tiny',20:'Vengeful Spirit',
  21:'Windranger',22:'Zeus',23:'Kunkka',25:'Lina',26:'Lion',
  27:'Shadow Shaman',28:'Slardar',29:'Tidehunter',30:'Witch Doctor',
  31:'Lich',32:'Riki',33:'Enigma',34:'Tinker',35:'Sniper',
  36:'Necrophos',37:'Warlock',38:'Beastmaster',39:'Queen of Pain',
  40:'Venomancer',41:'Faceless Void',42:'Wraith King',43:'Death Prophet',
  44:'Phantom Assassin',45:'Pugna',46:'Templar Assassin',47:'Viper',
  48:'Luna',49:'Dragon Knight',50:'Dazzle',51:'Clockwerk',52:'Leshrac',
  53:"Nature's Prophet",54:'Lifestealer',55:'Dark Seer',56:'Clinkz',
  57:'Omniknight',58:'Enchantress',59:'Huskar',60:'Night Stalker',
  61:'Broodmother',62:'Bounty Hunter',63:'Weaver',64:'Jakiro',
  65:'Batrider',66:'Chen',67:'Spectre',68:'Ancient Apparition',
  69:'Doom',70:'Ursa',71:'Spirit Breaker',72:'Gyrocopter',
  73:'Alchemist',74:'Invoker',75:'Silencer',76:'Outworld Destroyer',
  77:'Lycan',78:'Brewmaster',79:'Shadow Demon',80:'Lone Druid',
  81:'Chaos Knight',82:'Meepo',83:'Treant Protector',84:'Ogre Magi',
  85:'Undying',86:'Rubick',87:'Disruptor',88:'Nyx Assassin',
  89:'Naga Siren',90:'Keeper of the Light',91:'Io',92:'Visage',
  93:'Slark',94:'Medusa',95:'Troll Warlord',96:'Centaur Warrunner',
  97:'Magnus',98:'Timbersaw',99:'Bristleback',100:'Tusk',
  101:'Skywrath Mage',102:'Abaddon',103:'Elder Titan',104:'Legion Commander',
  105:'Techies',106:'Ember Spirit',107:'Earth Spirit',108:'Underlord',
  109:'Terrorblade',110:'Phoenix',111:'Oracle',112:'Winter Wyvern',
  113:'Arc Warden',114:'Monkey King',119:'Dark Willow',120:'Pangolier',
  121:'Grimstroke',123:'Hoodwink',126:'Void Spirit',128:'Snapfire',
  129:'Mars',131:'Ring Master',135:'Dawnbreaker',136:'Marci',
  137:'Primal Beast',138:'Muerta',145:'Kez',155:'Largo',
};

const HERO_ID_BY_NAME = {};
for (const [id, name] of Object.entries(HERO_NAMES)) {
  HERO_ID_BY_NAME[name.toLowerCase()] = parseInt(id);
}
HERO_ID_BY_NAME['outworld devourer'] = 76;
HERO_ID_BY_NAME['outworld destroyer'] = 76;
HERO_ID_BY_NAME['ringmaster'] = 131;
HERO_ID_BY_NAME['treant'] = 83;
HERO_ID_BY_NAME['kotl'] = 90;
HERO_ID_BY_NAME['willow'] = 119;
HERO_ID_BY_NAME['dark willow'] = 119;
HERO_ID_BY_NAME['gyrocoptercopter'] = 72;
HERO_ID_BY_NAME['nature\u2019s prophet'] = 53;

function nameHash(name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h + name.charCodeAt(i)) >>> 0;
  }
  return 900000000 + (h % 99000000);
}

function sanitizeMatchId(gameId, season) {
  const sNum = season.replace(/[^0-9]/g, '');
  const gPart = gameId.toLowerCase().replace(/ game /g, '_g').replace(/\s+/g, '_');
  return `legacy_s${sNum}_${gPart}`.substring(0, 50);
}

function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      fields.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

async function getOrCreateSeason(client, seasonName) {
  const existing = await client.query(`SELECT id FROM seasons WHERE name = $1`, [seasonName]);
  if (existing.rows.length > 0) {
    await client.query(`UPDATE seasons SET is_legacy = true WHERE id = $1`, [existing.rows[0].id]);
    return existing.rows[0].id;
  }
  const res = await client.query(
    `INSERT INTO seasons (name, is_legacy, active) VALUES ($1, true, false) RETURNING id`,
    [seasonName]
  );
  return res.rows[0].id;
}

async function run() {
  const csvPath = path.join(__dirname, '../../attached_assets/Old_Stats_-_MasterGames_1774072326994.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found at:', csvPath);
    process.exit(1);
  }

  const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
  const header = parseCSVLine(lines[0]);
  console.log('Columns:', header);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseCSVLine(line);
    if (fields.length < header.length - 2) continue;
    const row = {};
    header.forEach((col, idx) => { row[col] = (fields[idx] || '').trim(); });
    rows.push(row);
  }
  console.log(`Parsed ${rows.length} player rows`);

  const byMatch = new Map();
  for (const row of rows) {
    const key = `${row['Season']}||${row['Game ID']}`;
    if (!byMatch.has(key)) byMatch.set(key, []);
    byMatch.get(key).push(row);
  }
  console.log(`Found ${byMatch.size} unique matches`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const seasonCache = new Map();
    let matchesInserted = 0;
    let matchesSkipped = 0;
    let playersInserted = 0;
    const unknownHeroes = new Set();

    for (const [key, players] of byMatch.entries()) {
      const [season, gameId] = key.split('||');
      const matchId = sanitizeMatchId(gameId, season);

      const existing = await client.query(`SELECT match_id FROM matches WHERE match_id = $1`, [matchId]);
      if (existing.rows.length > 0) {
        matchesSkipped++;
        continue;
      }

      if (!seasonCache.has(season)) {
        const sid = await getOrCreateSeason(client, season);
        seasonCache.set(season, sid);
      }
      const seasonId = seasonCache.get(season);

      const radiantPlayers = players.filter(p => p['Team'] === 'Radiant');
      const direPlayers = players.filter(p => p['Team'] === 'Dire');
      const radiantWon = radiantPlayers.length > 0 && parseInt(radiantPlayers[0]['Wins'] || '0') === 1;

      await client.query(
        `INSERT INTO matches (match_id, date, duration, radiant_win, lobby_name, parse_method, is_legacy, season_id)
         VALUES ($1, NOW(), 0, $2, $3, 'legacy_csv', true, $4)`,
        [matchId, radiantWon, gameId, seasonId]
      );
      matchesInserted++;

      for (const p of players) {
        const playerName = p['Player'] || '';
        if (!playerName) continue;

        const accountId = nameHash(playerName);
        const team = p['Team'] === 'Dire' ? 'dire' : 'radiant';
        const heroName = (p['Hero Name'] || '').trim();
        const heroId = HERO_ID_BY_NAME[heroName.toLowerCase()] || 0;
        if (heroName && !heroId) unknownHeroes.add(heroName);

        const captainField = p['Captain'] || '';
        const isCaptain = captainField.split('|').map(s => s.trim()).includes(playerName);

        const kills = parseInt(p['Kills']) || 0;
        const deaths = parseInt(p['Deaths']) || 0;
        const assists = parseInt(p['Assists']) || 0;
        const gpm = parseInt(p['GPM']) || 0;
        const xpm = parseInt(p['XPM']) || 0;
        const heroDmg = parseInt(p['Hero Damage']) || 0;
        const dmgTaken = parseInt(p['Damage Taken']) || 0;
        const campsStacked = parseInt(p['Camps Stacked']) || 0;
        const supportGold = parseInt(p['Support Gold']) || 0;
        const position = parseInt(p['Position']) || 0;

        await client.query(
          `INSERT INTO player_stats
            (match_id, account_id, persona_name, team, hero_id, hero_name, kills, deaths, assists,
             gpm, xpm, hero_damage, damage_taken, camps_stacked, net_worth, position, is_captain)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [matchId, accountId, playerName, team, heroId, heroName,
           kills, deaths, assists, gpm, xpm, heroDmg, dmgTaken,
           campsStacked, supportGold, position, isCaptain]
        );
        playersInserted++;
      }
    }

    await client.query('COMMIT');
    console.log(`\nDone!`);
    console.log(`  Matches inserted: ${matchesInserted}`);
    console.log(`  Matches skipped (already exist): ${matchesSkipped}`);
    console.log(`  Player stats inserted: ${playersInserted}`);
    if (unknownHeroes.size > 0) {
      console.log(`  Unknown hero names (stored with id=0): ${[...unknownHeroes].join(', ')}`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
