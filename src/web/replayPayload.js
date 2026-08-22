'use strict';

const MAX_LIST_KILLS = 256;
const MAX_CHAT_EVENTS = 500;

function asTimeline(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

/**
 * Build the only timeline data the match list needs. Each tuple is
 * [seconds, radiantKillDelta], where +1 means a Dire hero died and -1 means a
 * Radiant hero died. The list is capped defensively even though normal Dota
 * matches never approach the limit.
 */
function buildCompactKillTimeline(value, maxKills = MAX_LIST_KILLS) {
  const timeline = asTimeline(value);
  if (!timeline || !Array.isArray(timeline.events)) return [];

  return timeline.events
    .filter((event) => event && event.type === 'kill')
    .map((event) => {
      const t = Number(event.t);
      const victimSlot = Number(event.victimSlot);
      if (!Number.isFinite(t) || victimSlot < 0 || victimSlot >= 10) return null;
      return [Math.max(0, Math.round(t)), victimSlot >= 5 ? 1 : -1];
    })
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0])
    .slice(0, Math.max(1, Math.min(MAX_LIST_KILLS, Number(maxKills) || MAX_LIST_KILLS)));
}

/**
 * Produce a browser-safe match-list row. Large replay timelines and private
 * replay/chat fields never leave the server on the public list endpoint.
 */
function compactMatchListRow(match) {
  if (!match || typeof match !== 'object') return match;
  const compact = { ...match };
  const killTimeline = buildCompactKillTimeline(compact.game_timeline);
  if (killTimeline.length > 0) compact.kill_timeline = killTimeline;

  delete compact.game_timeline;
  delete compact.chat_log;
  delete compact.replay_path;
  delete compact.replay_file_path;
  return compact;
}

function isMatchParticipant(match, accountId) {
  if (accountId == null || accountId === '') return false;
  const wanted = String(accountId);
  return Array.isArray(match?.players)
    && match.players.some((player) => String(player?.account_id || '') === wanted);
}

function resolveReplayIntelligenceContext(match, { accountId = null, isStaff = false } = {}) {
  if (isStaff) return 'admin';
  return isMatchParticipant(match, accountId) ? 'participant' : 'public';
}

function stripExactMovement(timeline) {
  if (!timeline || typeof timeline !== 'object') return timeline;
  const safe = { ...timeline };
  if (Array.isArray(safe.players)) {
    safe.players = safe.players.map((player) => {
      if (!player || typeof player !== 'object') return player;
      const publicPlayer = { ...player };
      delete publicPlayer.positions;
      delete publicPlayer.positionTrail;
      delete publicPlayer.position_trail;
      delete publicPlayer.movementPath;
      delete publicPlayer.movement_path;
      return publicPlayer;
    });
  }
  delete safe.positions;
  delete safe.positionTrails;
  delete safe.position_trails;
  delete safe.movementPaths;
  delete safe.movement_paths;
  return safe;
}

/**
 * Apply the public match-detail privacy boundary.
 *
 * Exact movement traces are served only by the separately authenticated,
 * entitlement-gated replay-timeline endpoint. Free-text chat is staff-only.
 * When the feature flag is fully on, participants may see bounded non-text
 * communication events such as chat-wheel and system/pause markers.
 */
function sanitizeMatchDetail(match, {
  accountId = null,
  isStaff = false,
  chatFlagState = 'off',
} = {}) {
  if (!match || typeof match !== 'object') return match;

  const safe = { ...match };
  delete safe.replay_path;
  delete safe.replay_file_path;

  const timeline = asTimeline(safe.game_timeline);
  if (timeline) safe.game_timeline = stripExactMovement(timeline);

  const participant = isMatchParticipant(safe, accountId);
  const validFlag = ['off', 'preview', 'on'].includes(chatFlagState) ? chatFlagState : 'off';
  const staffCanSee = isStaff && validFlag !== 'off';
  const participantCanSeeSystem = participant && validFlag === 'on';

  if (staffCanSee && Array.isArray(safe.chat_log)) {
    safe.chat_log = safe.chat_log.slice(0, MAX_CHAT_EVENTS);
    safe.chat_log_state = validFlag;
  } else if (participantCanSeeSystem && Array.isArray(safe.chat_log)) {
    const nonTextEvents = safe.chat_log
      .filter((event) => event && event.type !== 'chat')
      .slice(0, MAX_CHAT_EVENTS);
    if (nonTextEvents.length > 0) {
      safe.chat_log = nonTextEvents;
      safe.chat_log_state = 'participant';
    } else {
      delete safe.chat_log;
      delete safe.chat_log_state;
    }
  } else {
    delete safe.chat_log;
    delete safe.chat_log_state;
  }

  safe.replay_detail_level = isStaff ? 'staff' : (participant ? 'participant' : 'public');
  return safe;
}

module.exports = {
  MAX_LIST_KILLS,
  asTimeline,
  buildCompactKillTimeline,
  compactMatchListRow,
  isMatchParticipant,
  resolveReplayIntelligenceContext,
  sanitizeMatchDetail,
  stripExactMovement,
};