import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getMatch, deleteMatch, updatePlayerPosition, updateMatchMeta, clearMatchFileHash } from '../api';
import { getHeroName, getHeroImageUrl, getItemImageUrl } from '../heroNames';
import { useSeason } from '../context/SeasonContext';
import { useAdmin } from '../context/AdminContext';
import { useSuperuser } from '../context/SuperuserContext';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';

const POSITION_NAMES = {
  0: '-',
  1: 'Pos 1',
  2: 'Pos 2',
  3: 'Pos 3',
  4: 'Pos 4',
  5: 'Pos 5',
};

function formatDuration(seconds) {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDurationLong(seconds) {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  let str = `${m} minute${m !== 1 ? 's' : ''}`;
  if (s > 0) str += ` ${s} second${s !== 1 ? 's' : ''}`;
  return str;
}

function formatNumber(n) {
  if (n == null) return '-';
  return n.toLocaleString();
}

function getLaneResult(advantage) {
  if (advantage > 2000) return { label: 'Win', short: 'W', color: '#4ade80' };
  if (advantage > 500) return { label: 'Slight Win', short: 'w', color: '#86efac' };
  if (advantage >= -500) return { label: 'Even', short: '~', color: '#94a3b8' };
  if (advantage > -2000) return { label: 'Slight Loss', short: 'l', color: '#fca5a5' };
  return { label: 'Loss', short: 'L', color: '#f87171' };
}

function computeLaneOutcomes(players) {
  const withData = players.filter(p => p.laning_nw != null && p.laning_nw > 0 && p.position > 0);
  if (withData.length < 4) return {};

  const getLane = (p) => {
    if (p.position === 2) return 'mid';
    if (p.position === 1 || p.position === 5) return p.team === 'radiant' ? 'safe' : 'off';
    if (p.position === 3 || p.position === 4) return p.team === 'radiant' ? 'off' : 'safe';
    return null;
  };

  const groups = { safe_radiant: [], safe_dire: [], mid_radiant: [], mid_dire: [], off_radiant: [], off_dire: [] };
  for (const p of withData) {
    const lane = getLane(p);
    if (lane) groups[`${lane}_${p.team}`].push(p);
  }

  const sumNW = (g) => g.reduce((s, p) => s + (p.laning_nw || 0), 0);
  const outcomes = {};

  const applyLane = (radGroup, direGroup) => {
    if (radGroup.length === 0 && direGroup.length === 0) return;
    const adv = sumNW(radGroup) - sumNW(direGroup);
    for (const p of radGroup) outcomes[p.slot] = getLaneResult(adv);
    for (const p of direGroup) outcomes[p.slot] = getLaneResult(-adv);
  };

  applyLane(groups.safe_radiant, groups.off_dire);
  applyLane(groups.off_radiant, groups.safe_dire);
  applyLane(groups.mid_radiant, groups.mid_dire);

  return outcomes;
}

const RADIANT_COLORS = ['#4ade80','#86efac','#34d399','#6ee7b7','#bbf7d0'];
const DIRE_COLORS    = ['#f87171','#fca5a5','#fb923c','#f59e0b','#e879f9'];

function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtLargeNum(v) {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

const METRIC_LABELS = {
  nw: 'Net Worth',
  xp: 'Experience',
  level: 'Level',
  cs: 'Last Hits',
};

function ItemSwimLane({ players, allPlayers, maxTime }) {
  const slotToName = {};
  allPlayers.forEach(p => { slotToName[p.slot] = p.nickname || p.persona_name || `Player ${p.slot}`; });

  const rows = players.map((tp, i) => {
    const isRadiant = tp.team === 'radiant' || tp.slot < 5;
    const teamPlayers = players.filter(p => (p.team === 'radiant' || p.slot < 5) === isRadiant);
    const teamIdx = teamPlayers.indexOf(tp);
    const color = isRadiant ? RADIANT_COLORS[teamIdx % RADIANT_COLORS.length] : DIRE_COLORS[teamIdx % DIRE_COLORS.length];
    const name = slotToName[tp.slot] || tp.name || `Slot ${tp.slot}`;
    const purchases = (tp.purchaseLog || []).filter(pu => pu.time >= 0);
    return { name, color, purchases, slot: tp.slot };
  });

  if (rows.every(r => r.purchases.length === 0)) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
        Item Purchase Timings
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map(({ name, color, purchases, slot }) => (
          <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 90, fontSize: 11, color, textAlign: 'right', flexShrink: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={name}>{name}</div>
            <div style={{ flex: 1, position: 'relative', height: 26, background: '#0f172a', borderRadius: 4, overflow: 'visible' }}>
              {purchases.map((pu, j) => {
                const pct = Math.min(100, (pu.time / (maxTime || 1)) * 100);
                const label = pu.itemName.replace('item_', '').replace(/_/g, ' ');
                const abbr = label.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
                const iconUrl = getItemImageUrl(pu.itemName, null);
                return (
                  <div
                    key={j}
                    title={`${label} @ ${fmtTime(pu.time)}`}
                    style={{
                      position: 'absolute',
                      left: `${pct}%`,
                      top: 3,
                      transform: 'translateX(-50%)',
                      zIndex: j,
                      width: 22,
                      height: 16,
                    }}
                  >
                    <div style={{
                      width: 22, height: 16, borderRadius: 2,
                      background: `${color}22`, border: `1px solid ${color}66`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 7, color, fontWeight: 700, letterSpacing: 0.2,
                      overflow: 'hidden',
                    }}>{abbr}</div>
                    {iconUrl && (
                      <img
                        src={iconUrl}
                        alt={label}
                        style={{
                          position: 'absolute', inset: 0,
                          width: 22, height: 16, borderRadius: 2, display: 'block',
                          border: '1px solid #334155',
                        }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <div style={{ width: 90 }} />
          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569' }}>
            <span>0:00</span>
            <span>{fmtTime(Math.round(maxTime / 2))}</span>
            <span>{fmtTime(maxTime)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineGraph({ timeline, allPlayers }) {
  const [metric, setMetric] = useState('nw');
  const [showItems, setShowItems] = useState(false);
  const [hiddenPlayers, setHiddenPlayers] = useState(new Set());
  const itemsRef = useRef(null);

  const { chartData, playerKeys, maxTime } = useMemo(() => {
    if (!timeline?.players?.length) return { chartData: [], playerKeys: [], maxTime: 0 };

    const slotToName = {};
    allPlayers.forEach(p => { slotToName[p.slot] = p.nickname || p.persona_name || `Player ${p.slot}`; });

    const timeSet = new Set();
    for (const tp of timeline.players) {
      (tp.samples || []).forEach(s => timeSet.add(s.t));
    }
    const times = [...timeSet].sort((a, b) => a - b);
    const maxTime = times.length > 0 ? times[times.length - 1] : 0;

    const playerMap = {};
    for (const tp of timeline.players) {
      playerMap[tp.slot] = {};
      for (const s of (tp.samples || [])) {
        playerMap[tp.slot][s.t] = s;
      }
    }

    const chartData = times.map(t => {
      const row = { t };
      for (const tp of timeline.players) {
        const s = playerMap[tp.slot][t];
        row[`slot_${tp.slot}`] = s ? (s[metric] ?? (metric === 'level' ? (s['lvl'] ?? 0) : 0)) : 0;
      }
      return row;
    });

    const playerKeys = timeline.players.map((tp, i) => {
      const isRadiant = tp.team === 'radiant' || tp.slot < 5;
      const teamPlayers = timeline.players.filter(p => (p.team === 'radiant' || p.slot < 5) === isRadiant);
      const teamIdx = teamPlayers.indexOf(tp);
      const color = isRadiant ? RADIANT_COLORS[teamIdx % RADIANT_COLORS.length] : DIRE_COLORS[teamIdx % DIRE_COLORS.length];
      const name = slotToName[tp.slot] || tp.name || `Slot ${tp.slot}`;
      return { key: `slot_${tp.slot}`, name, color };
    });

    return { chartData, playerKeys, maxTime };
  }, [timeline, metric, allPlayers]);

  const roshanEvents = useMemo(() => {
    if (!timeline?.events) return [];
    return timeline.events.filter(e => e.type === 'roshan');
  }, [timeline]);

  const hasPurchaseLogs = timeline?.players?.some(p => (p.purchaseLog || []).length > 0);

  if (!timeline?.players?.length) return null;

  return (
    <div className="expanded-stats-section" style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ color: '#94a3b8', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
          Game Timeline
        </h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(METRIC_LABELS).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMetric(k)}
              style={{
                padding: '4px 12px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
                border: '1px solid',
                borderColor: metric === k ? '#3b82f6' : '#334155',
                background: metric === k ? '#1d4ed8' : '#1e293b',
                color: metric === k ? '#fff' : '#94a3b8',
              }}
            >
              {label}
            </button>
          ))}
          {hasPurchaseLogs && (
            <button
              onClick={() => {
                const next = !showItems;
                setShowItems(next);
                if (next) {
                  setTimeout(() => itemsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
                }
              }}
              style={{
                padding: '4px 12px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
                border: '1px solid',
                borderColor: showItems ? '#10b981' : '#334155',
                background: showItems ? '#065f46' : '#1e293b',
                color: showItems ? '#6ee7b7' : '#94a3b8',
              }}
            >
              🛒 Items
            </button>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="t"
            tickFormatter={fmtTime}
            stroke="#475569"
            tick={{ fill: '#64748b', fontSize: 11 }}
          />
          <YAxis
            tickFormatter={metric === 'level' ? String : fmtLargeNum}
            stroke="#475569"
            tick={{ fill: '#64748b', fontSize: 11 }}
            width={44}
          />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
            labelFormatter={fmtTime}
            formatter={(value, name) => [
              metric === 'level' ? value : fmtLargeNum(value),
              name,
            ]}
          />
          {roshanEvents.map((e, i) => (
            <ReferenceLine key={i} x={e.t} stroke="#a855f7" strokeDasharray="4 2"
              label={{ value: '🐉', position: 'top', fontSize: 12 }} />
          ))}
          {playerKeys.map(({ key, name, color }) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={name}
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4 }}
              hide={hiddenPlayers.has(key)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {playerKeys.map(({ key, name, color }) => {
          const hidden = hiddenPlayers.has(key);
          return (
            <div
              key={key}
              onClick={() => setHiddenPlayers(prev => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
              })}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                opacity: hidden ? 0.35 : 1,
                fontSize: 11, color: hidden ? '#64748b' : color,
                padding: '2px 8px', borderRadius: 4, border: '1px solid',
                borderColor: hidden ? '#334155' : `${color}55`,
                background: hidden ? 'transparent' : `${color}11`,
                userSelect: 'none', transition: 'all 0.15s',
              }}
            >
              <div style={{ width: 14, height: 2, background: hidden ? '#64748b' : color, borderRadius: 1 }} />
              {name}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
        {[['radiant', '#4ade80'], ['dire', '#f87171']].map(([team, color]) => (
          <div key={team} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
            <div style={{ width: 16, height: 2, background: color, borderRadius: 1 }} />
            {team.charAt(0).toUpperCase() + team.slice(1)}
          </div>
        ))}
        {roshanEvents.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
            <div style={{ width: 1, height: 14, background: '#a855f7', borderRadius: 1 }} />
            Roshan kill
          </div>
        )}
      </div>
      {showItems && hasPurchaseLogs && (
        <div ref={itemsRef} style={{
          marginTop: 12,
          padding: '12px 0',
          borderTop: '1px solid #1e293b',
        }}>
          <ItemSwimLane players={timeline.players} allPlayers={allPlayers} maxTime={maxTime} />
        </div>
      )}
    </div>
  );
}

function DraftDisplay({ draft }) {
  if (!draft || draft.length === 0) return null;
  const hasBans = draft.some(d => !d.is_pick);
  if (!hasBans) return null;

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h3 style={{ color: '#94a3b8', marginBottom: '0.75rem', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Draft Order</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'flex-start' }}>
        {draft.map((entry, i) => {
          const isBan = !entry.is_pick;
          const isRadiant = entry.team === 0;
          const teamColor = isRadiant ? '#4ade80' : '#f87171';
          const teamLabel = isRadiant ? 'Radiant' : 'Dire';
          const heroImg = getHeroImageUrl(entry.hero_id);
          return (
            <div
              key={i}
              title={`#${entry.order_num + 1} — ${teamLabel} ${isBan ? 'Bans' : 'Picks'}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '3px',
                padding: '4px',
                borderRadius: '4px',
                border: `2px solid ${isBan ? '#7f1d1d' : (isRadiant ? '#166534' : '#1e3a5f')}`,
                background: isBan ? 'rgba(127,29,29,0.3)' : (isRadiant ? 'rgba(22,101,52,0.3)' : 'rgba(30,58,95,0.3)'),
                minWidth: '42px',
              }}
            >
              <div style={{ fontSize: '0.6rem', color: teamColor, fontWeight: 'bold', lineHeight: 1 }}>
                {teamLabel.slice(0, 3).toUpperCase()}
              </div>
              {heroImg ? (
                <img
                  src={heroImg}
                  alt=""
                  style={{
                    width: '40px',
                    height: '22px',
                    objectFit: 'cover',
                    borderRadius: '2px',
                    filter: isBan ? 'grayscale(80%) brightness(0.6)' : 'none',
                  }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div style={{ width: '40px', height: '22px', background: '#333', borderRadius: '2px' }} />
              )}
              <div style={{ fontSize: '0.6rem', color: isBan ? '#f87171' : '#93c5fd', lineHeight: 1 }}>
                {isBan ? 'BAN' : 'PICK'}
              </div>
              <div style={{ fontSize: '0.55rem', color: '#555', lineHeight: 1 }}>
                #{entry.order_num + 1}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getDisplayName(player, index) {
  return player.nickname || player.persona_name || `Player ${index + 1}`;
}

function PlayerLink({ player, index }) {
  const name = getDisplayName(player, index);
  if (player.account_id > 0) {
    return <Link to={`/player/${player.account_id}`} className="player-link">{name}</Link>;
  }
  if (player.persona_name) {
    return <Link to={`/player/${encodeURIComponent(player.persona_name)}`} className="player-link">{name}</Link>;
  }
  return <span>{name}</span>;
}

function ItemIcon({ itemName, itemId }) {
  if (!itemName && !itemId) return <div className="item-icon empty" />;
  const url = getItemImageUrl(itemName, itemId);
  if (!url) return <div className="item-icon empty" />;
  return (
    <img
      src={url}
      alt={itemName || ''}
      className="item-icon"
      title={itemName ? itemName.replace('item_', '').replace(/_/g, ' ') : ''}
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

function PositionSelect({ player, matchId, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const { isAdmin, adminKey, setShowModal } = useAdmin();
  const pos = player.position || 0;

  if (!editing) {
    return (
      <span
        className="position-label editable"
        onClick={() => setEditing(true)}
        title="Click to edit position"
      >
        {POSITION_NAMES[pos] || '-'}
      </span>
    );
  }

  return (
    <select
      className="position-select"
      value={pos}
      autoFocus
      onChange={async (e) => {
        const newPos = parseInt(e.target.value);
        if (!isAdmin) {
          setShowModal(true);
          setEditing(false);
          return;
        }
        try {
          await updatePlayerPosition(matchId, player.slot, newPos, adminKey);
          onUpdate(player.slot, newPos);
        } catch (err) {
          alert('Failed: ' + err.message);
        }
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
    >
      {Object.entries(POSITION_NAMES).map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}

function TeamTable({ players, teamName, isWinner, matchId, onPositionUpdate, laneOutcomes }) {
  const hasDetailedStats = players.some(p => p.gpm > 0 || p.hero_damage > 0);
  const hasItems = players.some(p => p.items && p.items.length > 0);
  const hasLane = players.some(p => laneOutcomes && laneOutcomes[p.slot]);

  return (
    <div className={`team-section ${teamName}`}>
      <div className={`team-header ${teamName}`}>
        <span className="team-name">{teamName === 'radiant' ? 'Radiant' : 'Dire'}</span>
        {isWinner && <span className="winner-badge">Winner</span>}
      </div>
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <th className="col-hero-img" style={{ width: '36px' }}></th>
              <th className="col-player" title="Player name">Player</th>
              <th className="col-stat" title="Position (1-5) — click to edit" style={{ minWidth: '50px' }}>Pos</th>
              <th className="col-hero" title="Hero played">Hero</th>
              <th className="col-stat" title="Kills">K</th>
              <th className="col-stat" title="Deaths">D</th>
              <th className="col-stat" title="Assists">A</th>
              {hasDetailedStats && (
                <>
                  <th className="col-stat" title="Last Hits">LH</th>
                  <th className="col-stat" title="Denies">DN</th>
                  <th className="col-stat" title="Gold Per Minute">GPM</th>
                  <th className="col-stat" title="Experience Per Minute">XPM</th>
                  <th className="col-stat" title="Hero Damage">HD</th>
                  <th className="col-stat" title="Tower Damage">TD</th>
                  <th className="col-stat" title="Hero Healing">HH</th>
                  <th className="col-stat" title="Net Worth">NW</th>
                </>
              )}
              {hasLane && (
                <th className="col-stat" title="Lane outcome at ~8 minutes (based on net worth comparison vs lane opponent). W=Win &gt;2k, w=Slight &gt;500, ~=Even, l=Slight Loss, L=Loss">Lane</th>
              )}
              {hasItems && <th className="col-items" style={{ minWidth: '260px' }} title="End-game inventory (6 slots) | Backpack (3 slots) | Aghs status">Items</th>}
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const heroImg = getHeroImageUrl(p.hero_id, p.hero_name);
              return (
                <tr key={i}>
                  <td style={{ width: '36px', padding: '2px' }}>
                    {heroImg && (
                      <img
                        src={heroImg}
                        alt=""
                        style={{ width: '36px', height: '20px', objectFit: 'cover', borderRadius: '2px' }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    )}
                  </td>
                  <td className="col-player">
                    <PlayerLink player={p} index={i} />
                    <span className="player-badges">
                      {p.firstblood_claimed > 0 && <span className="badge fb" title="First Blood">FB</span>}
                      {p.first_death > 0 && <span className="badge fd" title="First Death">FD</span>}
                    </span>
                  </td>
                  <td className="col-stat">
                    <PositionSelect player={p} matchId={matchId} onUpdate={onPositionUpdate} />
                  </td>
                  <td className="col-hero">{getHeroName(p.hero_id, p.hero_name)}</td>
                  <td className="col-stat kills">{p.kills}</td>
                  <td className="col-stat deaths">{p.deaths}</td>
                  <td className="col-stat assists">{p.assists}</td>
                  {hasDetailedStats && (
                    <>
                      <td className="col-stat">{formatNumber(p.last_hits)}</td>
                      <td className="col-stat">{formatNumber(p.denies)}</td>
                      <td className="col-stat gpm">{formatNumber(p.gpm)}</td>
                      <td className="col-stat xpm">{formatNumber(p.xpm)}</td>
                      <td className="col-stat">{formatNumber(p.hero_damage)}</td>
                      <td className="col-stat">{formatNumber(p.tower_damage)}</td>
                      <td className="col-stat">{formatNumber(p.hero_healing)}</td>
                      <td className="col-stat nw">{formatNumber(p.net_worth)}</td>
                    </>
                  )}
                  {hasLane && (() => {
                    const lo = laneOutcomes && laneOutcomes[p.slot];
                    return (
                      <td className="col-stat" style={{ color: lo ? lo.color : '#555', fontWeight: 'bold', fontSize: '0.9rem' }} title={lo ? `${lo.label} (laning NW: ${(p.laning_nw || 0).toLocaleString()})` : 'No laning data'}>
                        {lo ? lo.short : '-'}
                      </td>
                    );
                  })()}
                  {hasItems && (
                    <td className="col-items">
                      <div className="items-row">
                        {Array.from({ length: 6 }, (_, j) => {
                          const item = (p.items || []).find(it => it.item_slot === j);
                          return <ItemIcon key={j} itemName={item?.item_name} itemId={item?.item_id} />;
                        })}
                        <span className="aghs-indicators">
                          <img
                            src="https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/ultimate_scepter.png"
                            alt="Aghanim's Scepter"
                            title="Aghanim's Scepter"
                            className={`aghs-icon ${p.has_scepter ? 'active' : 'inactive'}`}
                          />
                          <img
                            src="https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/aghanims_shard.png"
                            alt="Aghanim's Shard"
                            title="Aghanim's Shard"
                            className={`aghs-icon ${p.has_shard ? 'active' : 'inactive'}`}
                          />
                        </span>
                        <span className="backpack-separator">|</span>
                        {Array.from({ length: 3 }, (_, j) => {
                          const item = (p.items || []).find(it => it.item_slot === (j + 6));
                          return <ItemIcon key={`bp-${j}`} itemName={item?.item_name} itemId={item?.item_id} />;
                        })}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmtAbilityName(name) {
  if (!name) return '';
  if (name.includes('special_bonus')) return 'Talent';
  return name.replace(/^[^_]+_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getAbilityIcon(name) {
  if (!name) return null;
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/${name}.png`;
}

function SkillBuild({ abilities }) {
  if (!abilities || abilities.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'flex-start' }}>
      {abilities.map((a, i) => {
        const isTalent = a.ability_name?.includes('special_bonus');
        const icon = getAbilityIcon(a.ability_name);
        const label = fmtAbilityName(a.ability_name);
        const heroLevel = i + 1;
        const timeFmt = a.time > 0 ? ` @ ${Math.floor(a.time / 60)}:${String(a.time % 60).padStart(2, '0')}` : '';
        return (
          <div
            key={i}
            title={`Hero Level ${heroLevel} → ${label}${timeFmt}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '3px 4px',
              borderRadius: 4,
              background: isTalent ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isTalent ? '#7c3aed' : '#2d3748'}`,
              minWidth: 34,
              cursor: 'default',
            }}
          >
            <div style={{ fontSize: 9, color: '#64748b', lineHeight: 1, fontWeight: 600 }}>
              {heroLevel}
            </div>
            {isTalent ? (
              <div style={{
                width: 24, height: 24, background: '#7c3aed', borderRadius: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: '#e9d5ff',
              }}>T</div>
            ) : icon ? (
              <img
                src={icon}
                alt={label}
                style={{ width: 24, height: 24, borderRadius: 3, objectFit: 'cover' }}
                onError={e => {
                  e.target.style.display = 'none';
                  e.target.nextSibling && (e.target.nextSibling.style.display = 'flex');
                }}
              />
            ) : null}
            <div style={{
              fontSize: 8, color: '#475569', lineHeight: 1,
              display: isTalent ? 'none' : 'block',
              textAlign: 'center',
            }}>
              {'●'.repeat(Math.min(a.ability_level || 1, 7))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExpandedStats({ players }) {
  const hasAny = players.some(p =>
    p.buybacks > 0 || p.courier_kills > 0 || p.double_kills > 0 || p.rampages > 0 ||
    p.smoke_kills > 0 || p.kill_streak > 0 || p.rune_pickups > 0 || p.stun_duration > 0 ||
    p.obs_placed > 0 || p.wards_killed > 0
  );
  if (!hasAny) return null;

  return (
    <div className="expanded-stats-section">
      <h3>Detailed Stats</h3>
      <div className="scoreboard-wrapper">
        <table className="scoreboard compact">
          <thead>
            <tr>
              <th className="col-player" title="Player name">Player</th>
              <th className="col-stat" title="Observer Wards placed">OBS</th>
              <th className="col-stat" title="Sentry Wards placed">SEN</th>
              <th className="col-stat" title="Enemy wards dewarded (destroyed)">DEW</th>
              <th className="col-stat" title="Camps stacked">STK</th>
              <th className="col-stat" title="Rune pickups">RUN</th>
              <th className="col-stat" title="Total stun duration dealt (seconds)">STUN</th>
              <th className="col-stat" title="Total damage taken from enemy heroes">DT</th>
              <th className="col-stat" title="Number of buybacks used">BB</th>
              <th className="col-stat" title="Enemy couriers killed">CK</th>
              <th className="col-stat" title="Longest kill streak">KS</th>
              <th className="col-stat" title="Multi-kills (double, triple, ultra, rampage)">MK</th>
              <th className="col-stat" title="Creep score (last hits) at 10 minutes">CS@10</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const mkParts = [];
              if (p.double_kills > 0) mkParts.push(`${p.double_kills}x2`);
              if (p.triple_kills > 0) mkParts.push(`${p.triple_kills}x3`);
              if (p.ultra_kills > 0) mkParts.push(`${p.ultra_kills}x4`);
              if (p.rampages > 0) mkParts.push(`${p.rampages}R`);
              return (
                <tr key={i}>
                  <td className="col-player">
                    <PlayerLink player={p} index={i} />
                  </td>
                  <td className="col-stat">{p.obs_placed || 0}</td>
                  <td className="col-stat">{p.sen_placed || 0}</td>
                  <td className="col-stat">{p.wards_killed || 0}</td>
                  <td className="col-stat">{p.camps_stacked || 0}</td>
                  <td className="col-stat">{p.rune_pickups || 0}</td>
                  <td className="col-stat">{p.stun_duration ? p.stun_duration.toFixed(1) : '0'}</td>
                  <td className="col-stat">{formatNumber(p.damage_taken)}</td>
                  <td className="col-stat">{p.buybacks || 0}</td>
                  <td className="col-stat">{p.courier_kills || 0}</td>
                  <td className="col-stat">{p.kill_streak || 0}</td>
                  <td className="col-stat">{mkParts.join(' ') || '-'}</td>
                  <td className="col-stat">{p.lane_cs_10min || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MatchDetail() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { seasons } = useSeason();
  const { isAdmin, adminKey, setShowModal } = useAdmin();
  const { isSuperuser } = useSuperuser();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [metaPatch, setMetaPatch] = useState('');
  const [metaSeason, setMetaSeason] = useState('');
  const [metaDate, setMetaDate] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [clearingHash, setClearingHash] = useState(false);

  useEffect(() => {
    setLoading(true);
    getMatch(matchId)
      .then(m => {
        setMatch(m);
        setMetaPatch(m.patch || '');
        setMetaSeason(m.season_id ? String(m.season_id) : '');
        setMetaDate(m.date ? new Date(m.date).toISOString().slice(0, 16) : '');
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [matchId]);

  const handleSaveMeta = async () => {
    if (!isAdmin) { setShowModal(true); return; }
    setSavingMeta(true);
    try {
      await updateMatchMeta(matchId, { patch: metaPatch || null, seasonId: metaSeason ? parseInt(metaSeason) : null, date: metaDate || null }, adminKey);
      setMatch(prev => ({ ...prev, patch: metaPatch || null, season_id: metaSeason ? parseInt(metaSeason) : null, date: metaDate || prev.date }));
      setShowMeta(false);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSavingMeta(false);
    }
  };

  const handlePositionUpdate = (slot, newPosition) => {
    setMatch(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.slot === slot ? { ...p, position: newPosition } : p
      ),
    }));
  };

  const handleDelete = async () => {
    if (!isAdmin) {
      setShowModal(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteMatch(matchId, adminKey, deleteReason);
      navigate('/matches');
    } catch (err) {
      alert('Delete failed: ' + err.message);
      setDeleting(false);
    }
  };

  const handleClearHash = async () => {
    if (!isAdmin) { setShowModal(true); return; }
    if (!confirm('This allows the same replay file to be re-uploaded (e.g. to capture draft data). Continue?')) return;
    setClearingHash(true);
    try {
      await clearMatchFileHash(matchId, adminKey);
      alert('File hash cleared. You can now re-upload the replay for this match.');
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setClearingHash(false);
    }
  };

  if (loading) return <div className="loading">Loading match...</div>;
  if (error) return <div className="error-state">Error: {error}</div>;
  if (!match) return <div className="error-state">Match not found</div>;

  const radiant = (match.players || []).filter(p => p.team === 'radiant');
  const dire = (match.players || []).filter(p => p.team === 'dire');
  const allPlayers = [...radiant, ...dire];
  const laneOutcomes = computeLaneOutcomes(allPlayers);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
        <Link to="/matches" className="back-link">&larr; Back to matches</Link>
        {isSuperuser && (
          <Link
            to={`/match/${matchId}/edit`}
            style={{
              background: '#7b3f00', color: '#ff9800', border: '1px solid #ff9800',
              padding: '3px 12px', borderRadius: 4, fontSize: '0.8rem', textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            &#128081; Edit Stats
          </Link>
        )}
      </div>

      <div className="match-detail-header">
        <h1>Match #{match.match_id}</h1>
        <div className="match-meta">
          <span className={`match-result ${match.radiant_win ? 'radiant' : 'dire'}`}>
            {match.radiant_win ? 'Radiant' : 'Dire'} Victory
          </span>
          <span title={formatDuration(match.duration)}>Duration: {formatDurationLong(match.duration)}</span>
          <span>
            {new Date(match.date).toLocaleDateString('en-AU', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
              timeZone: 'Australia/Sydney',
            })}
          </span>
          {match.parse_method && <span className="parse-badge">{match.parse_method}</span>}
          {match.patch && <span className="patch-badge">Patch {match.patch}</span>}
          {match.season_id && (() => {
            const s = seasons.find(x => x.id === match.season_id);
            return <span className="season-badge">{s ? s.name : `Season ${match.season_id}`}</span>;
          })()}
          {match.is_upset && (
            <span
              title={`Underdog win! ${match.underdog_team === 'radiant' ? 'Radiant' : 'Dire'} had ${match.mmr_diff} lower avg MMR`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(255,165,0,0.15)', border: '1px solid rgba(255,165,0,0.5)',
                color: '#ffb347', borderRadius: 8, padding: '2px 10px', fontSize: 12, fontWeight: 700,
              }}
            >
              ⚡ Upset Win ({match.mmr_diff} MMR diff)
            </span>
          )}
          {!match.is_upset && match.mmr_diff && match.mmr_diff >= 50 && (
            <span
              title={`Favoured team won — ${match.mmr_diff} MMR advantage`}
              style={{ color: 'var(--text-muted)', fontSize: 11 }}
            >
              {match.mmr_diff} MMR gap
            </span>
          )}
        </div>
      </div>

      <DraftDisplay draft={match.draft} />

      <TeamTable players={radiant} teamName="radiant" isWinner={match.radiant_win === true} matchId={matchId} onPositionUpdate={handlePositionUpdate} laneOutcomes={laneOutcomes} />
      <TeamTable players={dire} teamName="dire" isWinner={match.radiant_win === false} matchId={matchId} onPositionUpdate={handlePositionUpdate} laneOutcomes={laneOutcomes} />

      <ExpandedStats players={allPlayers} />

      <TimelineGraph timeline={match.game_timeline} allPlayers={allPlayers} />

      {allPlayers.some(p => p.abilities && p.abilities.length > 0) && (
        <div className="expanded-stats-section">
          <h3>Skill Builds <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— hover each cell for ability name & timing</span></h3>
          <div className="scoreboard-wrapper">
            <table className="scoreboard compact">
              <thead>
                <tr>
                  <th className="col-player" title="Player name">Player</th>
                  <th title="Ability levelled at each hero level (1–25). Hover for details. Purple = Talent.">Ability per Hero Level →</th>
                </tr>
              </thead>
              <tbody>
                {allPlayers.filter(p => p.abilities && p.abilities.length > 0).map((p, i) => (
                  <tr key={i}>
                    <td className="col-player">
                      <PlayerLink player={p} index={i} />
                    </td>
                    <td>
                      <SkillBuild abilities={p.abilities} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: '2rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: showMeta ? '0.75rem' : 0, flexWrap: 'wrap' }}>
          {!showMeta && (
            <button
              onClick={() => setShowMeta(true)}
              style={{
                background: 'transparent', color: '#666', border: '1px solid #444',
                padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              Edit Patch / Season
            </button>
          )}
          <button
            onClick={handleClearHash}
            disabled={clearingHash}
            title="Clears the duplicate-prevention fingerprint so this replay can be re-uploaded (useful to pick up draft data)"
            style={{
              background: 'transparent', color: '#666', border: '1px solid #444',
              padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            {clearingHash ? 'Clearing...' : 'Allow Re-upload'}
          </button>
        </div>

        {showMeta && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem', padding: '0.75rem', background: '#1a1a2e', borderRadius: '6px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ color: '#888', fontSize: '0.75rem' }}>Patch</label>
              <input
                type="text"
                placeholder="e.g. 7.38"
                value={metaPatch}
                onChange={e => setMetaPatch(e.target.value)}
                style={{
                  background: '#0d1117', color: '#e0e0e0', border: '1px solid #444',
                  padding: '0.4rem 0.6rem', borderRadius: '4px', fontSize: '0.85rem', width: '100px',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ color: '#888', fontSize: '0.75rem' }}>Season</label>
              <select
                value={metaSeason}
                onChange={e => setMetaSeason(e.target.value)}
                style={{
                  background: '#0d1117', color: '#e0e0e0', border: '1px solid #444',
                  padding: '0.4rem 0.6rem', borderRadius: '4px', fontSize: '0.85rem',
                }}
              >
                <option value="">None</option>
                {seasons.map(s => (
                  <option key={s.id} value={String(s.id)}>{s.name}{s.is_active ? ' ★' : ''}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ color: '#888', fontSize: '0.75rem' }}>Date Played</label>
              <input
                type="datetime-local"
                value={metaDate}
                onChange={e => setMetaDate(e.target.value)}
                style={{
                  background: '#0d1117', color: '#e0e0e0', border: '1px solid #444',
                  padding: '0.4rem 0.6rem', borderRadius: '4px', fontSize: '0.85rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-end' }}>
              <button
                onClick={handleSaveMeta}
                disabled={savingMeta}
                style={{
                  background: '#2563eb', color: 'white', border: 'none',
                  padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
                }}
              >
                {savingMeta ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => { setShowMeta(false); setMetaPatch(match.patch || ''); setMetaSeason(match.season_id ? String(match.season_id) : ''); setMetaDate(match.date ? new Date(match.date).toISOString().slice(0, 16) : ''); }}
                style={{
                  background: 'transparent', color: '#888', border: '1px solid #444',
                  padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            style={{
              background: 'transparent', color: '#666', border: '1px solid #444',
              padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            Delete Match
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Reason (optional)"
              value={deleteReason}
              onChange={e => setDeleteReason(e.target.value)}
              style={{
                background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #444',
                padding: '0.4rem 0.6rem', borderRadius: '4px', fontSize: '0.85rem', flex: '1', minWidth: '150px',
              }}
            />
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                background: '#c0392b', color: 'white', border: 'none',
                padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              {deleting ? 'Deleting...' : 'Confirm Delete'}
            </button>
            <button
              onClick={() => setShowDelete(false)}
              style={{
                background: 'transparent', color: '#888', border: '1px solid #444',
                padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
