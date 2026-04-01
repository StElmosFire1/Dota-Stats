let canvas;
try {
  canvas = require('@napi-rs/canvas');
} catch (_) {
  canvas = null;
}

const BG      = '#0f172a';
const CARD    = '#1e293b';
const TEXT    = '#e2e8f0';
const MUTED   = '#64748b';
const GREEN   = '#4ade80';
const RED     = '#f87171';
const GOLD    = '#fbbf24';
const BLUE    = '#60a5fa';
const PURPLE  = '#a78bfa';

const W       = 1000;
const PAD     = 18;
const ROW_H   = 44;
const HEADER_H = 30;
const SECTION_PAD = 12;

function clamp(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function fmtNum(n) {
  if (!n) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function colPositions() {
  return {
    k:    540,
    d:    580,
    a:    620,
    lvl:  662,
    gpm:  710,
    dmg:  768,
    bldg: 828,
    heal: 888,
  };
}

function drawPlayerRow(ctx, p, idx, y, teamColor) {
  const cols = colPositions();
  const isAlt = idx % 2 === 1;

  ctx.fillStyle = isAlt ? 'rgba(255,255,255,0.02)' : 'transparent';
  ctx.fillRect(PAD, y, W - PAD * 2, ROW_H - 2);

  // Slot dot
  ctx.beginPath();
  ctx.arc(PAD + 9, y + ROW_H / 2 - 1, 5, 0, Math.PI * 2);
  ctx.fillStyle = teamColor;
  ctx.fill();

  // Player name
  ctx.fillStyle = TEXT;
  ctx.font = 'bold 13px "Arial"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(clamp(p.personaname || `ID:${p.accountId}`, 16), PAD + 22, y + ROW_H / 2 - 1);

  // Hero name
  ctx.fillStyle = '#93c5fd';
  ctx.font = '12px "Arial"';
  const rawHero = (p.heroName || '').replace(/^npc_dota_hero_/, '').replace(/_/g, ' ');
  const heroDisplay = rawHero ? rawHero.replace(/\b\w/g, c => c.toUpperCase()) : '—';
  ctx.fillText(clamp(heroDisplay, 15), PAD + 175, y + ROW_H / 2 - 1);

  ctx.textAlign = 'center';

  // K
  ctx.fillStyle = GREEN;
  ctx.font = 'bold 13px "Arial"';
  ctx.fillText(String(p.kills || 0), cols.k, y + ROW_H / 2 - 1);

  // D
  ctx.fillStyle = RED;
  ctx.fillText(String(p.deaths || 0), cols.d, y + ROW_H / 2 - 1);

  // A
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(String(p.assists || 0), cols.a, y + ROW_H / 2 - 1);

  // LVL — gold for 25, purple for 20+, muted otherwise
  const lvl = p.level || 0;
  ctx.font = '12px "Arial"';
  ctx.fillStyle = lvl >= 25 ? GOLD : lvl >= 20 ? PURPLE : MUTED;
  ctx.fillText(lvl > 0 ? String(lvl) : '—', cols.lvl, y + ROW_H / 2 - 1);

  // GPM
  ctx.fillStyle = GOLD;
  ctx.fillText(String(p.goldPerMin || 0), cols.gpm, y + ROW_H / 2 - 1);

  // Hero Damage
  ctx.fillStyle = '#f97316';
  ctx.fillText(fmtNum(p.heroDamage || 0), cols.dmg, y + ROW_H / 2 - 1);

  // Building Damage
  ctx.fillStyle = '#fb923c';
  const bldg = p.towerDamage || 0;
  if (bldg > 0) {
    ctx.fillText(fmtNum(bldg), cols.bldg, y + ROW_H / 2 - 1);
  } else {
    ctx.fillStyle = CARD;
    ctx.fillText('—', cols.bldg, y + ROW_H / 2 - 1);
  }

  // Healing
  ctx.fillStyle = '#34d399';
  const heal = p.heroHealing || 0;
  if (heal > 0) {
    ctx.fillText(fmtNum(heal), cols.heal, y + ROW_H / 2 - 1);
  } else {
    ctx.fillStyle = CARD;
    ctx.fillText('—', cols.heal, y + ROW_H / 2 - 1);
  }
}

function drawColumnHeaders(ctx, y) {
  const cols = colPositions();
  ctx.fillStyle = MUTED;
  ctx.font = '10px "Arial"';
  ctx.textAlign = 'center';
  for (const [label, cx] of [
    ['K', cols.k], ['D', cols.d], ['A', cols.a],
    ['LVL', cols.lvl], ['GPM', cols.gpm],
    ['DMG', cols.dmg], ['BLDG', cols.bldg], ['HEAL', cols.heal],
  ]) {
    ctx.fillText(label, cx, y);
  }
  ctx.textAlign = 'left';
  ctx.fillText('PLAYER', PAD + 22, y);
  ctx.fillText('HERO', PAD + 175, y);
}

function drawTeam(ctx, players, teamName, isWinner, kills, yStart) {
  const color = teamName === 'radiant' ? GREEN : RED;
  const label = teamName === 'radiant' ? 'RADIANT' : 'DIRE';

  ctx.fillStyle = teamName === 'radiant' ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)';
  ctx.fillRect(PAD, yStart, W - PAD * 2, HEADER_H);

  ctx.fillStyle = color;
  ctx.font = 'bold 13px "Arial"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`\u2694  ${label}`, PAD + 10, yStart + HEADER_H / 2);

  if (isWinner) {
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 11px "Arial"';
    ctx.fillText('\u2713 WINNER', PAD + 110, yStart + HEADER_H / 2);
  }

  ctx.fillStyle = MUTED;
  ctx.font = '12px "Arial"';
  ctx.textAlign = 'right';
  ctx.fillText(`${kills} kills`, W - PAD - 10, yStart + HEADER_H / 2);

  const cols = colPositions();
  const labelY = yStart + HEADER_H + 12;
  ctx.fillStyle = MUTED;
  ctx.font = '10px "Arial"';
  ctx.textAlign = 'center';
  for (const [lbl, cx] of [
    ['K', cols.k], ['D', cols.d], ['A', cols.a],
    ['LVL', cols.lvl], ['GPM', cols.gpm],
    ['DMG', cols.dmg], ['BLDG', cols.bldg], ['HEAL', cols.heal],
  ]) {
    ctx.fillText(lbl, cx, labelY);
  }
  ctx.textAlign = 'left';
  ctx.fillText('PLAYER', PAD + 22, labelY);
  ctx.fillText('HERO', PAD + 175, labelY);

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const ry = yStart + HEADER_H + 22 + i * ROW_H;
    drawPlayerRow(ctx, p, i, ry, color);
  }

  return yStart + HEADER_H + 22 + players.length * ROW_H;
}

/**
 * Generate a PNG buffer for the match scoreboard.
 * Returns null if canvas is not available.
 */
async function generateScoreboardImage(matchStats) {
  if (!canvas) return null;
  try {
    const { createCanvas } = canvas;

    const radiant = matchStats.players.filter(p => p.team === 'radiant');
    const dire    = matchStats.players.filter(p => p.team === 'dire');
    const all     = matchStats.players;

    const radiantKills = radiant.reduce((s, p) => s + (p.kills || 0), 0);
    const direKills    = dire.reduce((s, p) => s + (p.kills || 0), 0);
    const totalKills   = all.reduce((s, p) => s + (p.kills || 0), 0);
    const winner       = matchStats.radiantWin ? 'RADIANT' : 'DIRE';
    const winColor     = matchStats.radiantWin ? GREEN : RED;
    const durationSecs = matchStats.duration || 0;
    const durationStr  = `${Math.floor(durationSecs / 60)}:${String(durationSecs % 60).padStart(2, '0')}`;

    const mvp = [...all].sort((a, b) => {
      const ka = a.deaths > 0 ? (a.kills + a.assists) / a.deaths : a.kills + a.assists;
      const kb = b.deaths > 0 ? (b.kills + b.assists) / b.deaths : b.kills + b.assists;
      return kb - ka;
    })[0];

    const topDmg   = [...all].sort((a, b) => (b.heroDamage || 0) - (a.heroDamage || 0))[0];
    const topGpm   = [...all].sort((a, b) => (b.goldPerMin || 0) - (a.goldPerMin || 0))[0];
    const topHeal  = [...all].sort((a, b) => (b.heroHealing || 0) - (a.heroHealing || 0))[0];
    const topBldg  = [...all].sort((a, b) => (b.towerDamage || 0) - (a.towerDamage || 0))[0];
    const hasRampage = all.some(p => (p.rampages || 0) > 0);

    const HEADER = 90;
    const TEAM_H = (players) => HEADER_H + 22 + players.length * ROW_H + SECTION_PAD;
    const HIGHLIGHTS_H = 60;
    const FOOTER_H = 34;
    const totalH = HEADER + TEAM_H(radiant) + SECTION_PAD + TEAM_H(dire) + HIGHLIGHTS_H + FOOTER_H + 10;

    const c = createCanvas(W, totalH);
    const ctx = c.getContext('2d');

    // Background
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, totalH);

    // Header gradient
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, matchStats.radiantWin ? 'rgba(74,222,128,0.18)' : 'rgba(248,113,113,0.18)');
    grad.addColorStop(1, 'rgba(15,23,42,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, HEADER);

    // Winner
    ctx.fillStyle = winColor;
    ctx.font = 'bold 28px "Arial"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${winner} VICTORY`, PAD, 32);

    ctx.fillStyle = TEXT;
    ctx.font = '16px "Arial"';
    ctx.fillText(`\u23F1  ${durationStr}`, PAD, 62);

    ctx.fillStyle = MUTED;
    ctx.font = '14px "Arial"';
    ctx.fillText(`${totalKills} total kills  \u00B7  Match #${matchStats.matchId || '\u2014'}`, PAD + 120, 62);

    ctx.textAlign = 'right';
    ctx.fillStyle = MUTED;
    ctx.font = '12px "Arial"';
    ctx.fillText(`Radiant ${radiantKills} \u2014 ${direKills} Dire`, W - PAD, 62);

    // Separator + column headers
    let cursor = HEADER;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(PAD, cursor, W - PAD * 2, 1);
    cursor += 6;
    drawColumnHeaders(ctx, cursor + 8);
    cursor += 18;

    // Radiant
    cursor = drawTeam(ctx, radiant, 'radiant', matchStats.radiantWin, radiantKills, cursor);
    cursor += SECTION_PAD;

    // Separator
    ctx.fillStyle = CARD;
    ctx.fillRect(PAD, cursor, W - PAD * 2, 1);
    cursor += 1 + SECTION_PAD;

    // Dire
    cursor = drawTeam(ctx, dire, 'dire', !matchStats.radiantWin, direKills, cursor);
    cursor += SECTION_PAD;

    // Highlights
    const highlights = [];
    if (mvp) {
      const rawHero = (mvp.heroName || '').replace(/^npc_dota_hero_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      highlights.push({ emoji: '\u{1F451}', label: 'MVP', value: `${mvp.personaname || 'Unknown'} (${rawHero || '?'})` });
    }
    if (topDmg) highlights.push({ emoji: '\u{1F4A5}', label: 'Top Damage', value: `${topDmg.personaname || '?'} \u2014 ${fmtNum(topDmg.heroDamage)}` });
    if (topGpm && topGpm !== mvp) highlights.push({ emoji: '\u{1F4B0}', label: 'Gold King', value: `${topGpm.personaname || '?'} \u2014 ${topGpm.goldPerMin} GPM` });
    if (topBldg && (topBldg.towerDamage || 0) >= 2000) highlights.push({ emoji: '\u{1F3F0}', label: 'Tower Damage', value: `${topBldg.personaname || '?'} \u2014 ${fmtNum(topBldg.towerDamage)}` });
    if (topHeal && (topHeal.heroHealing || 0) >= 2000) highlights.push({ emoji: '\u{1FA7A}', label: 'Healer', value: `${topHeal.personaname || '?'} \u2014 ${fmtNum(topHeal.heroHealing)}` });
    if (hasRampage) highlights.push({ emoji: '\u{1F3C6}', label: 'RAMPAGE', value: all.find(p => p.rampages > 0)?.personaname || '?' });

    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, cursor, W, HIGHLIGHTS_H);

    const chipW = Math.floor((W - PAD * 2 - (highlights.length - 1) * 8) / Math.max(highlights.length, 1));
    for (let i = 0; i < highlights.length; i++) {
      const h = highlights[i];
      const hx = PAD + i * (chipW + 8);
      const hy = cursor + 8;
      ctx.fillStyle = CARD;
      drawRoundRect(ctx, hx, hy, chipW, HIGHLIGHTS_H - 16, 6);
      ctx.fill();

      ctx.fillStyle = TEXT;
      ctx.font = 'bold 11px "Arial"';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${h.emoji} ${h.label}`, hx + 8, hy + 12);

      ctx.fillStyle = '#93c5fd';
      ctx.font = '11px "Arial"';
      ctx.fillText(clamp(h.value, Math.floor(chipW / 7)), hx + 8, hy + 28);
    }

    cursor += HIGHLIGHTS_H + 6;

    // Footer
    ctx.fillStyle = MUTED;
    ctx.font = '11px "Arial"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const parseLabel = matchStats.parseMethod === 'odota-parser' ? 'Full replay stats' : 'Stats from OpenDota';
    ctx.fillText(`${parseLabel}  \u00B7  Generated by Dota Inhouse Bot`, W / 2, cursor + FOOTER_H / 2);

    return c.toBuffer('image/png');
  } catch (err) {
    console.error('[ScoreboardImage] Failed to generate:', err.message);
    return null;
  }
}

module.exports = { generateScoreboardImage };
