import React from 'react';
import { Link } from 'react-router-dom';
import { formatHeroName } from './heroes';

// Shared rendering for the weekly recap's "Fun highlights" — used on both the
// full /this-week page and the Home page recap card. The recap is saved with
// raw stat objects per highlight key (see db.getFunRecapStats); this turns each
// known key into a human sentence instead of dumping the JSON object.

function HighlightPlayer({ val }) {
  const name = (val?.name && String(val.name).trim()) || 'A player';
  if (val?.account_id) {
    return (
      <Link to={`/player/${val.account_id}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>
        {name}
      </Link>
    );
  }
  return <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{name}</span>;
}

function fmtDur(secs) {
  const s = Number(secs);
  if (!Number.isFinite(s) || s <= 0) return '—';
  return `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Each formatter returns { label, body } where body is JSX, or null to skip.
const FORMATTERS = {
  bestKI: (v) => ({
    label: 'Everywhere',
    body: (
      <>
        <HighlightPlayer val={v} /> was in on {num(v.ki_pct)}% of the team's kills
        {v.hero_name ? <> on {formatHeroName(v.hero_name)}</> : null}.
      </>
    ),
  }),
  highKDA: (v) => ({
    label: 'Best KDA',
    body: (
      <>
        <HighlightPlayer val={v} /> posted a {num(v.kills)}/{num(v.deaths)}/{num(v.assists)}
        {v.kda != null ? <> ({Number(v.kda)} KDA)</> : null} game.
      </>
    ),
  }),
  mostKills: (v) => ({
    label: 'Slayer',
    body: (
      <>
        <HighlightPlayer val={v} /> racked up {num(v.kills)} kills
        {v.hero_name ? <> on {formatHeroName(v.hero_name)}</> : null}.
      </>
    ),
  }),
  mostDeaths: (v) => ({
    label: 'Sacrificial Lamb',
    body: (
      <>
        <HighlightPlayer val={v} /> died {num(v.deaths)} times
        {v.hero_name ? <> on {formatHeroName(v.hero_name)}</> : null}.
      </>
    ),
  }),
  highestGPM: (v) => ({
    label: 'Gold Machine',
    body: (
      <>
        <HighlightPlayer val={v} /> farmed {num(v.gpm)} GPM
        {v.hero_name ? <> on {formatHeroName(v.hero_name)}</> : null}.
      </>
    ),
  }),
  mostStuns: (v) => ({
    label: 'Perma-Stunner',
    body: (
      <>
        <HighlightPlayer val={v} /> landed {Math.round(Number(v.stun_duration) || 0)}s of stuns
        {v.hero_name ? <> on {formatHeroName(v.hero_name)}</> : null}.
      </>
    ),
  }),
  mostWards: (v) => ({
    label: 'Vision King',
    body: (
      <>
        <HighlightPlayer val={v} /> planted {num(v.obs_placed)} observer and {num(v.sen_placed)} sentry wards.
      </>
    ),
  }),
  mostWardKills: (v) => ({
    label: 'Ward Hunter',
    body: (
      <>
        <HighlightPlayer val={v} /> destroyed {num(v.wards_killed)} enemy wards.
      </>
    ),
  }),
  mostHealing: (v) => ({
    label: 'Lifesaver',
    body: (
      <>
        <HighlightPlayer val={v} /> healed {Number(v.hero_healing || 0).toLocaleString()} HP
        {v.hero_name ? <> on {formatHeroName(v.hero_name)}</> : null}.
      </>
    ),
  }),
  mostTowerDmg: (v) => ({
    label: 'Tower Terror',
    body: (
      <>
        <HighlightPlayer val={v} /> dealt {Number(v.tower_damage || 0).toLocaleString()} tower damage
        {v.hero_name ? <> on {formatHeroName(v.hero_name)}</> : null}.
      </>
    ),
  }),
  mostStacks: (v) => ({
    label: 'Stack God',
    body: (
      <>
        <HighlightPlayer val={v} /> stacked {num(v.camps_stacked)} camps.
      </>
    ),
  }),
  rampage: (v) => ({
    label: 'Rampage',
    body: (
      <>
        <HighlightPlayer val={v} /> smashed a RAMPAGE
        {v.hero_name ? <> on {formatHeroName(v.hero_name)}</> : null}!
      </>
    ),
  }),
  deathless: (v) => ({
    label: 'Untouchable',
    body: (
      <>
        <HighlightPlayer val={v} /> went deathless — {num(v.kills)}/{num(v.deaths)}/{num(v.assists)}
        {v.hero_name ? <> on {formatHeroName(v.hero_name)}</> : null}.
      </>
    ),
  }),
  bloodbath: (v) => ({
    label: 'Bloodbath',
    body: (
      <>
        The bloodiest game had {num(v.total_kills)} combined kills
        {v.match_id ? <> (<Link to={`/match/${v.match_id}`} style={{ color: 'var(--accent)' }}>#{v.match_id}</Link>)</> : null}.
      </>
    ),
  }),
  fastGame: (v) => ({
    label: 'Speed Run',
    body: (
      <>
        The fastest game ended in {fmtDur(v.duration)}
        {v.match_id ? <> (<Link to={`/match/${v.match_id}`} style={{ color: 'var(--accent)' }}>#{v.match_id}</Link>)</> : null}.
      </>
    ),
  }),
  slowGame: (v) => ({
    label: 'Marathon',
    body: (
      <>
        The longest game dragged on for {fmtDur(v.duration)}
        {v.match_id ? <> (<Link to={`/match/${v.match_id}`} style={{ color: 'var(--accent)' }}>#{v.match_id}</Link>)</> : null}.
      </>
    ),
  }),
};

// Returns { key, label, body } for a renderable highlight, or null to skip.
export function formatHighlight(key, val) {
  if (!val || typeof val !== 'object') return null;
  const fmt = FORMATTERS[key];
  if (!fmt) return null;
  try {
    const out = fmt(val);
    return out ? { key, ...out } : null;
  } catch {
    return null;
  }
}

// Turn a saved fun_highlights object into an ordered list of renderable items.
export function buildHighlightItems(highlights, limit = null) {
  if (!highlights || typeof highlights !== 'object') return [];
  const items = [];
  for (const [key, val] of Object.entries(highlights)) {
    const item = formatHighlight(key, val);
    if (item) items.push(item);
  }
  return limit != null ? items.slice(0, limit) : items;
}

// Prefer the nickname the server resolved into player_name; fall back to the
// other persona fields, then a generic label. Never renders "Player #<id>"
// when a real name exists.
export function recapPerformerName(p) {
  if (!p) return 'Unknown';
  const candidates = [p.player_name, p.nickname, p.persona_name, p.display_name];
  for (const c of candidates) {
    if (c && String(c).trim()) return String(c).trim();
  }
  return p.account_id ? `Player #${p.account_id}` : 'Unknown';
}
