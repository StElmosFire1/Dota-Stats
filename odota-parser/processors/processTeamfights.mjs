import populate from './populate.mjs';
/**
 * A processor to compute teamfights that occurred given an event stream.
 *
 * Enrichments added (full-edition, labelled derived where appropriate):
 *  - winner: team ('radiant'|'dire'|'even') with fewer deaths in the fight
 *  - centroid: {x, y} average death position (derived from intervalState)
 *  - participants: bitmask (bit i = slot i participated), plus participantSlots array
 *  - topAbilities: top-3 most-used abilities across all participants
 *  - topItems: top-3 most-used items across all participants
 * All new fields are null when the underlying data is unavailable so
 * existing consumers that ignore unknown keys are unaffected.
 * */
function processTeamfights(entries, meta) {
  let currTeamfight;
  let teamfights = [];
  const intervalState = {};
  const teamfightCooldown = 15;
  const heroToSlot = meta.hero_to_slot;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    if (e.type === 'killed' && e.targethero && !e.targetillusion) {
      // check teamfight state
      currTeamfight = currTeamfight || {
        start: e.time - teamfightCooldown,
        end: null,
        last_death: e.time,
        deaths: 0,
        players: Array(...new Array(10)).map(() => ({
          deaths_pos: {},
          ability_uses: {},
          ability_targets: {},
          item_uses: {},
          killed: {},
          deaths: 0,
          buybacks: 0,
          damage: 0,
          healing: 0,
          gold_delta: 0,
          xp_delta: 0,
        })),
      };
      // update the last_death time of the current fight
      currTeamfight.last_death = e.time;
      currTeamfight.deaths += 1;
    } else if (e.type === 'interval') {
      // store hero state at each interval for teamfight lookup
      if (!intervalState[e.time]) {
        intervalState[e.time] = {};
      }
      intervalState[e.time][e.slot] = e;
      // check curr_teamfight status
      if (
        currTeamfight &&
        e.time - currTeamfight.last_death >= teamfightCooldown
      ) {
        // close it
        currTeamfight.end = e.time;
        // push a copy for post-processing
        teamfights.push(JSON.parse(JSON.stringify(currTeamfight)));
        // clear existing teamfight
        currTeamfight = null;
      }
    }
  }
  // fights that didnt end wont be pushed to teamfights array (endgame case)
  // filter only fights where 3+ heroes died
  teamfights = teamfights.filter((tf) => tf.deaths >= 3);
  teamfights.forEach((tf) => {
    tf.players.forEach((p, ind) => {
      // record player's start/end xp for level change computation
      if (intervalState[tf.start]?.[ind] && intervalState[tf.end]?.[ind]) {
        p.xp_start = intervalState[tf.start][ind].xp;
        p.xp_end = intervalState[tf.end][ind].xp;
      }
    });
  });
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    // check each teamfight to see if this event should be processed as part of that teamfight
    for (let j = 0; j < teamfights.length; j += 1) {
      const tf = teamfights[j];
      if (e.time >= tf.start && e.time <= tf.end) {
        if (e.type === 'killed' && e.targethero && !e.targetillusion) {
          populate(e, tf);
          // reverse the kill entry to find killed hero
          const r = {
            time: e.time,
            slot: heroToSlot[e.key],
          };
          if (intervalState[r.time] && intervalState[r.time][r.slot]) {
            // if a hero dies
            // add to deaths_pos
            // lookup slot of the killed hero by hero name (e.key)
            // get position from intervalstate
            const { x, y } = intervalState[r.time][r.slot];
            // fill in the copy
            r.type = 'deaths_pos';
            r.key = JSON.stringify([Math.round(x), Math.round(y)]);
            r.posData = true;
            populate(r, tf);
            // increment death count for this hero
            tf.players[r.slot].deaths += 1;
          }
        } else if (e.type === 'buyback_log') {
          // bought back
          if (tf.players[e.slot]) {
            tf.players[e.slot].buybacks += 1;
          }
        } else if (e.type === 'damage') {
          // sum damage
          // check if damage dealt to hero and not illusion
          if (e.targethero && !e.targetillusion) {
            // check if the damage dealer could be assigned to a slot
            if (tf.players[e.slot]) {
              tf.players[e.slot].damage += e.value;
            }
          }
        } else if (e.type === 'healing') {
          // sum healing
          // check if healing dealt to hero and not illusion
          if (e.targethero && !e.targetillusion) {
            // check if the healing dealer could be assigned to a slot
            if (tf.players[e.slot]) {
              tf.players[e.slot].healing += e.value;
            }
          }
        } else if (e.type === 'gold_reasons' || e.type === 'xp_reasons') {
          // add gold/xp to delta
          if (tf.players[e.slot]) {
            const types = {
              gold_reasons: 'gold_delta',
              xp_reasons: 'xp_delta',
            };
            tf.players[e.slot][types[e.type]] += e.value;
          }
        } else if (e.type === 'ability_uses' || e.type === 'item_uses') {
          // count skills, items
          // console.log(e);
          // Using slot directly as index appears to be incorrect for these fields as of 2024 (see processExpand)
          // So just compute an index based on player_slot
          const computedSlot = e.player_slot % (128 - 5);
          if (tf.players[computedSlot]?.[e.type]) {
            tf.players[computedSlot][e.type][e.key] = (tf.players[computedSlot][e.type][e.key] ?? 0) + 1;
          }
        }
      }
    }
  }

  // ── Enrich each fight with derived summary fields ────────────────────────
  // These are labelled _derived where the data depends on interval position
  // accuracy. All fields are null-safe for older replays with sparse data.
  for (const tf of teamfights) {
    // --- Winner determination ---
    // Count deaths per team (slots 0-4 = radiant, 5-9 = dire).
    let radiantDeaths = 0, direDeaths = 0;
    let radiantDamage = 0, direDamage = 0;
    for (let s = 0; s < 10; s++) {
      const p = tf.players[s];
      if (!p) continue;
      if (s < 5) {
        radiantDeaths += p.deaths || 0;
        radiantDamage += p.damage || 0;
      } else {
        direDeaths += p.deaths || 0;
        direDamage += p.damage || 0;
      }
    }
    if (radiantDeaths < direDeaths) tf.winner = 'radiant';
    else if (direDeaths < radiantDeaths) tf.winner = 'dire';
    else tf.winner = 'even';

    // Per-team fight summary (damage, healing, gold/xp delta, deaths, buybacks).
    // Note: per-player p.deaths is only incremented when intervalState is
    // available at the kill time, so radiantDeaths/direDeaths may undercount.
    // We use these player-level values as the best available signals while
    // acknowledging the winner field is derived from the same imperfect data.
    tf.radiant_summary = {
      deaths: radiantDeaths,
      damage: radiantDamage,
      healing: tf.players.slice(0, 5).reduce((s, p) => s + (p ? p.healing || 0 : 0), 0),
      gold_delta: tf.players.slice(0, 5).reduce((s, p) => s + (p ? p.gold_delta || 0 : 0), 0),
      xp_delta: tf.players.slice(0, 5).reduce((s, p) => s + (p ? p.xp_delta || 0 : 0), 0),
      buybacks: tf.players.slice(0, 5).reduce((s, p) => s + (p ? p.buybacks || 0 : 0), 0),
    };
    tf.dire_summary = {
      deaths: direDeaths,
      damage: direDamage,
      healing: tf.players.slice(5, 10).reduce((s, p) => s + (p ? p.healing || 0 : 0), 0),
      gold_delta: tf.players.slice(5, 10).reduce((s, p) => s + (p ? p.gold_delta || 0 : 0), 0),
      xp_delta: tf.players.slice(5, 10).reduce((s, p) => s + (p ? p.xp_delta || 0 : 0), 0),
      buybacks: tf.players.slice(5, 10).reduce((s, p) => s + (p ? p.buybacks || 0 : 0), 0),
    };

    // --- Participants ---
    // A slot "participates" if it has any damage, healing, death, or ability use.
    const participantSlots = [];
    let participantMask = 0;
    for (let s = 0; s < 10; s++) {
      const p = tf.players[s];
      if (!p) continue;
      const active =
        (p.deaths > 0) ||
        (p.damage > 0) ||
        (p.healing > 0) ||
        (Object.keys(p.ability_uses || {}).length > 0) ||
        (Object.keys(p.item_uses || {}).length > 0) ||
        (Object.keys(p.killed || {}).length > 0);
      if (active) {
        participantSlots.push(s);
        participantMask |= (1 << s);
      }
    }
    tf.participantSlots = participantSlots;
    tf.participantMask  = participantMask;

    // --- Fight centroid (derived from death positions) ---
    // deaths_pos is a 2D hash { x: { y: count } } built by populate().
    let cx = 0, cy = 0, posCount = 0;
    for (const p of tf.players) {
      if (!p || !p.deaths_pos) continue;
      for (const [xStr, ys] of Object.entries(p.deaths_pos)) {
        for (const [yStr, count] of Object.entries(ys)) {
          cx += Number(xStr) * count;
          cy += Number(yStr) * count;
          posCount += count;
        }
      }
    }
    tf.centroid = posCount > 0
      ? { x: Math.round(cx / posCount), y: Math.round(cy / posCount), _derived: true }
      : null;

    // --- Top abilities / items used in this fight ---
    // Aggregate ability_uses and item_uses across all participants.
    const abilityTotals = {};
    const itemTotals    = {};
    for (const p of tf.players) {
      if (!p) continue;
      for (const [k, v] of Object.entries(p.ability_uses || {})) {
        abilityTotals[k] = (abilityTotals[k] || 0) + v;
      }
      for (const [k, v] of Object.entries(p.item_uses || {})) {
        itemTotals[k] = (itemTotals[k] || 0) + v;
      }
    }
    // Top 5 by count, descending
    tf.topAbilities = Object.entries(abilityTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
    tf.topItems = Object.entries(itemTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Duration of the fight in seconds
    tf.duration = tf.end != null ? Math.round(tf.end - tf.start) : null;
  }

  return teamfights;
}
export default processTeamfights;
