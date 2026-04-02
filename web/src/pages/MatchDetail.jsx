import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getMatch, deleteMatch, updatePlayerPosition, updateMatchMeta, clearMatchFileHash } from '../api';
import { getHeroName, getHeroImageUrl, getItemImageUrl } from '../heroNames';
import { formatHeroName } from '../utils/heroes';
import { useSeason } from '../context/SeasonContext';
import { useAdmin } from '../context/AdminContext';
import { useSuperuser } from '../context/SuperuserContext';
import {
  LineChart, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceArea,
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
  if (advantage > -2000) return { label: 'Slight Loss', short: 'L', color: '#fca5a5' };
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

// Dota 2 in-game player colours, indexed by slot 0-9
const DOTA_PLAYER_COLORS = [
  '#3374FF', // slot 0 – blue
  '#66FFBF', // slot 1 – teal
  '#BF00BF', // slot 2 – purple
  '#F3F00B', // slot 3 – yellow
  '#FF6600', // slot 4 – orange
  '#FE87C4', // slot 5 – pink
  '#C3C3C3', // slot 6 – grey
  '#84D4F9', // slot 7 – light blue
  '#00BF00', // slot 8 – dark green
  '#C57836', // slot 9 – brown
];

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
  hd: 'Hero Damage',
  goldlead: 'Gold Lead',
};

function ItemSwimLane({ players, allPlayers, maxTime }) {
  const slotToName = {};
  allPlayers.forEach(p => { slotToName[p.slot] = p.nickname || p.persona_name || `Player ${p.slot}`; });

  const rows = players.map((tp) => {
    const color = DOTA_PLAYER_COLORS[tp.slot % 10];
    const name = slotToName[tp.slot] || tp.name || `Slot ${tp.slot}`;
    const purchases = (tp.purchaseLog || []);
    return { name, color, purchases, slot: tp.slot };
  });

  if (rows.every(r => r.purchases.length === 0)) {
    return (
      <div style={{ fontSize: 12, color: '#475569', padding: '8px 0', fontStyle: 'italic' }}>
        No item purchase data — re-upload this replay to populate item timings.
      </div>
    );
  }

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
                const pct = Math.min(100, (Math.max(0, pu.time) / (maxTime || 1)) * 100);
                const label = pu.itemName.replace('item_', '').replace(/_/g, ' ');
                const abbr = label.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
                const iconUrl = getItemImageUrl(pu.itemName, null);
                return (
                  <div
                    key={j}
                    title={`${label} @ ${pu.time < 0 ? 'Pre-game' : fmtTime(pu.time)}`}
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

function TimelineTooltip({ active, payload, label, playerKeyMap, metric }) {
  if (!active || !payload?.length) return null;
  const visible = payload
    .filter(e => !e.hide && e.value != null)
    .sort((a, b) => b.value - a.value);
  if (!visible.length) return null;
  return (
    <div style={{
      background: '#0f172a', border: '1px solid #334155', borderRadius: 6,
      padding: '8px 10px', fontSize: 12, maxWidth: 260,
    }}>
      <div style={{ color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>{fmtTime(label)}</div>
      {visible.map(entry => {
        const info = playerKeyMap?.[entry.dataKey];
        const val = metric === 'level' ? entry.value : fmtLargeNum(entry.value);
        return (
          <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            {info?.heroImg ? (
              <img
                src={info.heroImg} alt=""
                style={{ width: 24, height: 14, borderRadius: 2, flexShrink: 0, objectFit: 'cover' }}
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div style={{ width: 14, height: 2, background: info?.color || '#888', borderRadius: 1, flexShrink: 0 }} />
            )}
            <span style={{ color: info?.color || entry.color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {info?.name || entry.name}
            </span>
            <span style={{ color: '#f1f5f9', fontWeight: 700, marginLeft: 6 }}>{val}</span>
          </div>
        );
      })}
    </div>
  );
}

function TimelineGraph({ timeline, allPlayers }) {
  const [metric, setMetric] = useState('nw');
  const [showItems, setShowItems] = useState(false);
  const [hiddenPlayers, setHiddenPlayers] = useState(new Set());
  const [showMarkers, setShowMarkers] = useState({ rosh: false, torm: false, tower: false, rax: false, courier: false });
  const toggleMarker = (key) => setShowMarkers(prev => ({ ...prev, [key]: !prev[key] }));
  const itemsRef = useRef(null);

  const { chartData, playerKeys, playerKeysDesc, maxTime } = useMemo(() => {
    if (!timeline?.players?.length) return { chartData: [], playerKeys: [], playerKeysDesc: [], maxTime: 0 };

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

    // Build a slot->team lookup from allPlayers
    const slotTeam = {};
    allPlayers.forEach(p => { slotTeam[p.slot] = p.team; });

    const chartData = times.map(t => {
      const row = { t };
      if (metric === 'goldlead') {
        let radiantNw = 0, direNw = 0;
        for (const tp of timeline.players) {
          const s = playerMap[tp.slot][t];
          const nw = s ? (s.nw ?? 0) : 0;
          if (slotTeam[tp.slot] === 'radiant') radiantNw += nw;
          else direNw += nw;
        }
        row.goldlead = radiantNw - direNw;
      } else {
        for (const tp of timeline.players) {
          const s = playerMap[tp.slot][t];
          row[`slot_${tp.slot}`] = s ? (s[metric] ?? (metric === 'level' ? (s['lvl'] ?? 0) : 0)) : 0;
        }
      }
      return row;
    });

    let playerKeys, playerKeysDesc;
    if (metric === 'goldlead') {
      playerKeys = [{ key: 'goldlead', name: 'Radiant Gold Lead', color: '#4ade80' }];
      playerKeysDesc = playerKeys;
    } else {
      // Get the final value for each player for the active metric so we can sort
      const finalVal = (tp) => {
        const samples = tp.samples || [];
        if (!samples.length) return 0;
        const last = samples[samples.length - 1];
        return last[metric] ?? (metric === 'level' ? (last['lvl'] ?? 0) : 0);
      };

      playerKeys = timeline.players
        .slice()
        .sort((a, b) => finalVal(a) - finalVal(b)) // ascending so highest is rendered last (on top in SVG)
        .map((tp) => {
          const color = DOTA_PLAYER_COLORS[tp.slot % 10];
          const name = slotToName[tp.slot] || tp.name || `Slot ${tp.slot}`;
          const ap = allPlayers.find(p => p.slot === tp.slot);
          const heroImg = ap ? getHeroImageUrl(ap.hero_id, ap.hero_name) : null;
          const endVal = finalVal(tp);
          return { key: `slot_${tp.slot}`, name, color, heroImg, endVal };
        });

      // Legend order: highest on top — reverse for display purposes
      playerKeysDesc = [...playerKeys].reverse();
    }

    return { chartData, playerKeys, playerKeysDesc, maxTime };
  }, [timeline, metric, allPlayers]);

  const playerKeyMap = useMemo(() => {
    const map = {};
    playerKeys.forEach(({ key, name, color, heroImg }) => { map[key] = { name, color, heroImg }; });
    return map;
  }, [playerKeys]);

  const roshanEvents = useMemo(() => {
    if (!timeline?.events) return [];
    return timeline.events.filter(e => e.type === 'roshan');
  }, [timeline]);

  const tormenterEvents = useMemo(() => {
    if (!timeline?.events) return [];
    return timeline.events.filter(e => e.type === 'tormenter');
  }, [timeline]);

  const towerEvents = useMemo(() => {
    if (!timeline?.events) return [];
    // 'team' is the killer's team — the building belongs to the opposite team
    return timeline.events
      .filter(e => e.type === 'building' && e.building?.includes('tower'))
      .map(e => {
        const b = e.building || '';
        const isRadiantStructure = b.includes('goodguys');
        const tier = b.includes('tower4') ? 4 : b.includes('tower3') ? 3 : b.includes('tower2') ? 2 : 1;
        const lane = b.includes('_top') ? 'T' : b.includes('_bot') ? 'B' : b.includes('_mid') ? 'M' : '';
        return {
          t: e.t,
          label: `T${tier}${lane}`,
          radiantFalls: isRadiantStructure, // green structure = radiant tower destroyed by dire
          tier,
        };
      });
  }, [timeline]);

  const barracksEvents = useMemo(() => {
    if (!timeline?.events) return [];
    return timeline.events
      .filter(e => e.type === 'building' && (e.building?.includes('rax') || e.building?.includes('barracks')))
      .map(e => {
        const b = e.building || '';
        const isRadiantStructure = b.includes('goodguys');
        const btype = b.includes('ranged') ? 'R' : b.includes('melee') ? 'M' : '';
        const lane = b.includes('_top') ? 'T' : b.includes('_bot') ? 'B' : b.includes('_mid') ? 'M' : '';
        return { t: e.t, label: `Rax${lane}${btype}`, radiantFalls: isRadiantStructure };
      });
  }, [timeline]);

  const courierEvents = useMemo(() => {
    if (!timeline?.events) return [];
    return timeline.events.filter(e => e.type === 'courier');
  }, [timeline]);

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
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        {metric === 'goldlead' ? (
          <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <defs>
              <linearGradient id="glGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4ade80" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#4ade80" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="glGradNeg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f87171" stopOpacity={0.02} />
                <stop offset="95%" stopColor="#f87171" stopOpacity={0.25} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtTime} stroke="#475569" tick={{ fill: '#64748b', fontSize: 11 }} />
            <YAxis
              tickFormatter={v => { const abs = Math.abs(v); return `${v >= 0 ? '+' : ''}${fmtLargeNum(v)}`; }}
              stroke="#475569" tick={{ fill: '#64748b', fontSize: 11 }} width={52}
            />
            <Tooltip
              formatter={(v) => [`${v >= 0 ? '+' : ''}${Math.round(v).toLocaleString()}g`, 'Gold Lead']}
              labelFormatter={fmtTime}
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
            />
            <ReferenceLine y={0} stroke="#475569" strokeWidth={1.5} />
            {showMarkers.rosh && roshanEvents.map((e, i) => (
              <ReferenceLine key={`rosh-${i}`} x={e.t} stroke="#a855f7" strokeDasharray="4 2" strokeWidth={2}
                label={{ value: '🐉', position: 'insideTopRight', fontSize: 13, fill: '#a855f7' }} />
            ))}
            {showMarkers.torm && tormenterEvents.map((e, i) => (
              <ReferenceLine key={`torm-${i}`} x={e.t} stroke="#f97316" strokeDasharray="3 3" strokeWidth={2}
                label={{ value: '💀', position: 'insideTopRight', fontSize: 13, fill: '#f97316' }} />
            ))}
            {showMarkers.tower && towerEvents.map((e, i) => (
              <ReferenceLine key={`tw-${i}`} x={e.t}
                stroke={e.radiantFalls ? '#f87171' : '#4ade80'} strokeDasharray="2 3" strokeWidth={1}
                label={{ value: '🗼', position: 'insideTopLeft', fontSize: 10 }} />
            ))}
            {showMarkers.rax && barracksEvents.map((e, i) => (
              <ReferenceLine key={`rax-${i}`} x={e.t}
                stroke={e.radiantFalls ? '#f87171' : '#4ade80'} strokeDasharray="2 3" strokeWidth={1.5}
                label={{ value: '🏛️', position: 'insideTopLeft', fontSize: 10 }} />
            ))}
            {showMarkers.courier && courierEvents.map((e, i) => (
              <ReferenceLine key={`cour-${i}`} x={e.t}
                stroke={e.killedTeam === 'radiant' ? '#f87171' : '#4ade80'}
                strokeDasharray="2 4" strokeWidth={1.5}
                label={{ value: '📦', position: 'insideTopRight', fontSize: 10 }} />
            ))}
            <Area
              type="monotone" dataKey="goldlead" name="Radiant Gold Lead"
              stroke="#4ade80" strokeWidth={2} fill="url(#glGrad)" dot={false} activeDot={{ r: 4 }}
            />
          </AreaChart>
        ) : (
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
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
              content={(props) => <TimelineTooltip {...props} playerKeyMap={playerKeyMap} metric={metric} />}
            />
            {showMarkers.rosh && roshanEvents.map((e, i) => (
              <ReferenceLine key={`rosh-${i}`} x={e.t} stroke="#a855f7" strokeDasharray="4 2" strokeWidth={2}
                label={{ value: '🐉', position: 'insideTopRight', fontSize: 13, fill: '#a855f7' }} />
            ))}
            {showMarkers.torm && tormenterEvents.map((e, i) => (
              <ReferenceLine key={`torm-${i}`} x={e.t} stroke="#f97316" strokeDasharray="3 3" strokeWidth={2}
                label={{ value: '💀', position: 'insideTopRight', fontSize: 13, fill: '#f97316' }} />
            ))}
            {showMarkers.tower && towerEvents.map((e, i) => (
              <ReferenceLine key={`ltw-${i}`} x={e.t}
                stroke={e.radiantFalls ? '#f87171' : '#4ade80'} strokeDasharray="2 3" strokeWidth={1}
                label={{ value: '🗼', position: 'insideTopLeft', fontSize: 10 }} />
            ))}
            {showMarkers.rax && barracksEvents.map((e, i) => (
              <ReferenceLine key={`lrax-${i}`} x={e.t}
                stroke={e.radiantFalls ? '#f87171' : '#4ade80'} strokeDasharray="2 3" strokeWidth={1.5}
                label={{ value: '🏛️', position: 'insideTopLeft', fontSize: 10 }} />
            ))}
            {showMarkers.courier && courierEvents.map((e, i) => (
              <ReferenceLine key={`lcour-${i}`} x={e.t}
                stroke={e.killedTeam === 'radiant' ? '#f87171' : '#4ade80'}
                strokeDasharray="2 4" strokeWidth={1.5}
                label={{ value: '📦', position: 'insideTopRight', fontSize: 10 }} />
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
        )}
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {playerKeysDesc.map(({ key, name, color }) => {
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
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {metric !== 'goldlead' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 4 }}>
            {[['radiant', '#4ade80'], ['dire', '#f87171']].map(([team, color]) => (
              <div key={team} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
                <div style={{ width: 14, height: 2, background: color, borderRadius: 1 }} />
                {team.charAt(0).toUpperCase() + team.slice(1)}
              </div>
            ))}
          </div>
        )}
        {metric === 'goldlead' && (
          <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 12, marginRight: 4 }}>
            <span style={{ color: '#4ade80' }}>▲ Radiant leading</span>
            <span style={{ color: '#f87171' }}>▼ Dire leading</span>
          </div>
        )}
        <div style={{ width: 1, height: 18, background: '#334155', marginRight: 2 }} />
        <span style={{ fontSize: 11, color: '#475569', marginRight: 2 }}>Markers:</span>
        {roshanEvents.length > 0 && (() => {
          const on = showMarkers.rosh;
          return (
            <button onClick={() => toggleMarker('rosh')} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 4, fontSize: 11,
              cursor: 'pointer', border: '1px solid', userSelect: 'none', transition: 'all 0.15s',
              borderColor: on ? '#a855f755' : '#334155',
              background: on ? '#a855f711' : 'transparent',
              color: on ? '#a855f7' : '#475569',
            }}>
              <div style={{ width: 1, height: 12, background: on ? '#a855f7' : '#475569', borderRadius: 1 }} />
              🐉 Rosh ({roshanEvents.length})
            </button>
          );
        })()}
        {tormenterEvents.length > 0 && (() => {
          const on = showMarkers.torm;
          return (
            <button onClick={() => toggleMarker('torm')} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 4, fontSize: 11,
              cursor: 'pointer', border: '1px solid', userSelect: 'none', transition: 'all 0.15s',
              borderColor: on ? '#f9731655' : '#334155',
              background: on ? '#f9731611' : 'transparent',
              color: on ? '#f97316' : '#475569',
            }}>
              <div style={{ width: 1, height: 12, background: on ? '#f97316' : '#475569', borderRadius: 1 }} />
              💀 Torm ({tormenterEvents.length})
            </button>
          );
        })()}
        {towerEvents.length > 0 && (() => {
          const on = showMarkers.tower;
          return (
            <button onClick={() => toggleMarker('tower')} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 4, fontSize: 11,
              cursor: 'pointer', border: '1px solid', userSelect: 'none', transition: 'all 0.15s',
              borderColor: on ? '#94a3b855' : '#334155',
              background: on ? '#94a3b811' : 'transparent',
              color: on ? '#94a3b8' : '#475569',
            }}>
              <div style={{ display: 'flex', gap: 2 }}>
                <div style={{ width: 1, height: 12, background: on ? '#4ade80' : '#475569', borderRadius: 1 }} />
                <div style={{ width: 1, height: 12, background: on ? '#f87171' : '#475569', borderRadius: 1 }} />
              </div>
              🗼 Towers ({towerEvents.length})
            </button>
          );
        })()}
        {barracksEvents.length > 0 && (() => {
          const on = showMarkers.rax;
          return (
            <button onClick={() => toggleMarker('rax')} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 4, fontSize: 11,
              cursor: 'pointer', border: '1px solid', userSelect: 'none', transition: 'all 0.15s',
              borderColor: on ? '#94a3b855' : '#334155',
              background: on ? '#94a3b811' : 'transparent',
              color: on ? '#94a3b8' : '#475569',
            }}>
              <div style={{ display: 'flex', gap: 2 }}>
                <div style={{ width: 1, height: 12, background: on ? '#4ade80' : '#475569', borderRadius: 1 }} />
                <div style={{ width: 1, height: 12, background: on ? '#f87171' : '#475569', borderRadius: 1 }} />
              </div>
              🏛️ Barracks ({barracksEvents.length})
            </button>
          );
        })()}
        {(towerEvents.length > 0 || barracksEvents.length > 0) && (showMarkers.tower || showMarkers.rax) && (
          <span style={{ fontSize: 10, color: '#475569', fontStyle: 'italic' }}>green=dire loses · red=radiant loses</span>
        )}
      </div>
      {showItems && timeline?.players?.length > 0 && (
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
  // Treat Dota's "no item" slot as empty
  if (itemName === 'item_empty') return <div className="item-icon empty" />;
  const url = getItemImageUrl(itemName, itemId);
  if (!url) return <div className="item-icon empty" />;
  return (
    <img
      src={url}
      alt={itemName || ''}
      className="item-icon"
      title={itemName ? itemName.replace('item_', '').replace(/_/g, ' ') : ''}
      onError={e => {
        e.target.style.display = 'none';
        const empty = document.createElement('div');
        empty.className = 'item-icon empty';
        e.target.parentNode?.insertBefore(empty, e.target);
      }}
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
              <th className="col-stat" title="Hero Level">Lvl</th>
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
                <th className="col-stat" title="Lane outcome at ~8 minutes (based on net worth comparison vs lane opponent). W=Win &gt;2k, w=Slight Win &gt;500, ~=Even, L=Loss (lighter = slight, darker = dominant)">Lane</th>
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
                  <td className="col-stat" style={{ color: p.level >= 25 ? '#fbbf24' : p.level >= 20 ? '#a78bfa' : '#94a3b8', fontWeight: p.level >= 25 ? 700 : 400 }}>{p.level || '—'}</td>
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
                        {(() => {
                          const neutralItem = (p.items || []).find(it => it.item_slot === 16);
                          if (!neutralItem) return null;
                          const enh = neutralItem.enhancement_level || 0;
                          return (
                            <>
                              <span className="backpack-separator" title="Neutral Item">⬡</span>
                              <span style={{ position: 'relative', display: 'inline-flex' }}>
                                <ItemIcon itemName={neutralItem.item_name} itemId={neutralItem.item_id} />
                                {enh > 0 && (
                                  <span title={`Sub-enhancement tier ${enh}`} style={{
                                    position: 'absolute', bottom: -2, right: -4,
                                    background: enh >= 3 ? '#a855f7' : enh === 2 ? '#3b82f6' : '#22c55e',
                                    color: '#fff', borderRadius: 4, fontSize: 9, fontWeight: 700,
                                    padding: '0 2px', lineHeight: '13px', pointerEvents: 'none',
                                  }}>+{enh}</span>
                                )}
                              </span>
                            </>
                          );
                        })()}
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

  const radiantKills = players.filter(p => p.team === 'radiant').reduce((s, p) => s + (p.kills || 0), 0);
  const direKills    = players.filter(p => p.team === 'dire').reduce((s, p) => s + (p.kills || 0), 0);

  return (
    <div className="expanded-stats-section">
      <h3>Detailed Stats</h3>
      <div className="scoreboard-wrapper">
        <table className="scoreboard compact">
          <thead>
            <tr>
              <th className="col-player" title="Player name">Player</th>
              <th className="col-stat" title="Kill contribution — (kills + assists) ÷ team total kills">KC%</th>
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
              <th className="col-stat" title="Long-range kills landed by this player">LRK</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const mkParts = [];
              if (p.double_kills > 0) mkParts.push(`${p.double_kills}x2`);
              if (p.triple_kills > 0) mkParts.push(`${p.triple_kills}x3`);
              if (p.ultra_kills > 0) mkParts.push(`${p.ultra_kills}x4`);
              if (p.rampages > 0) mkParts.push(`${p.rampages}R`);
              const teamTotalKills = p.team === 'radiant' ? radiantKills : direKills;
              const kc = teamTotalKills > 0
                ? Math.round(((p.kills || 0) + (p.assists || 0)) / teamTotalKills * 100)
                : 0;
              const kcColor = kc >= 80 ? '#4ade80' : kc >= 60 ? '#facc15' : kc >= 40 ? '#94a3b8' : '#64748b';
              const deadSecs = p.dead_time_seconds;
              const deadFmt = deadSecs != null
                ? `${Math.floor(deadSecs / 60)}:${String(deadSecs % 60).padStart(2, '0')}`
                : '-';
              return (
                <tr key={i}>
                  <td className="col-player">
                    <PlayerLink player={p} index={i} />
                  </td>
                  <td className="col-stat" style={{ color: kcColor, fontWeight: kc >= 70 ? 600 : undefined }}>
                    {kc}%
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
                  <td className="col-stat" style={{ color: p.long_range_kills > 0 ? '#fbbf24' : undefined }}>
                    {p.long_range_kills || 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PudgeHookStats({ players, matchId }) {
  const pudgePlayers = players.filter(p =>
    p.hero_name === 'npc_dota_hero_pudge' && p.hook_attempts != null
  );
  if (pudgePlayers.length === 0) return null;
  const hasDetailedLog = pudgePlayers.some(p => Array.isArray(p.hook_cast_log) && p.hook_cast_log.length > 0);
  return (
    <div className="expanded-stats-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0 }}>🪝 Pudge Hook Stats</h3>
        <a
          href={`/api/matches/${matchId}/hook-report.txt`}
          download={`hook-report-match-${matchId}.txt`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 6, padding: '4px 12px',
            color: hasDetailedLog ? '#60a5fa' : '#475569',
            fontSize: '0.82rem', textDecoration: 'none',
            cursor: hasDetailedLog ? 'pointer' : 'default',
            opacity: hasDetailedLog ? 1 : 0.5,
          }}
          title={hasDetailedLog ? 'Download per-cast accuracy verification report' : 'Re-parse this replay to generate the detailed cast log'}
          onClick={hasDetailedLog ? undefined : e => e.preventDefault()}
        >
          ⬇ Hook Report (.txt)
        </a>
      </div>
      <div className="scoreboard-wrapper">
        <table className="scoreboard compact">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <th className="col-stat" title="Genuine hook attempts (excludes farm hooks with no nearby enemy)">Attempts</th>
              <th className="col-stat" title="Hooks that hit an enemy hero">Hits</th>
              <th className="col-stat" title="Hook hit accuracy (hits / attempts)">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {pudgePlayers.map((p, i) => {
              const acc = p.hook_attempts > 0
                ? ((p.hook_hits / p.hook_attempts) * 100).toFixed(1) + '%'
                : '—';
              return (
                <tr key={i}>
                  <td className="col-player"><PlayerLink player={p} index={i} /></td>
                  <td className="col-stat">{p.hook_attempts}</td>
                  <td className="col-stat">{p.hook_hits}</td>
                  <td className="col-stat">{acc}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Helper: parse building NPC name → readable label ───────────────────────
function parseBuildingName(npcName) {
  if (!npcName) return npcName;
  const n = npcName.replace('npc_dota_', '');
  // goodguys = radiant, badguys = dire
  const teamRaw = n.startsWith('goodguys') ? 'Radiant' : n.startsWith('badguys') ? 'Dire' : '';
  const rest = n.replace(/^(goodguys|badguys)_/, '');
  // tower: tower1_top, tower2_mid, tower3_bot, tower4 (base T4)
  const towerM = rest.match(/^tower(\d)(?:_(\w+))?/);
  if (towerM) {
    const tier = towerM[1];
    const lane = towerM[2] ? towerM[2].replace(/^(top|mid|bot|bottom)$/, s => ({ top: 'Top', mid: 'Mid', bot: 'Bot', bottom: 'Bot' }[s] || s)) : 'Base';
    return `${teamRaw} T${tier} ${lane}`;
  }
  // rax: melee_rax_top, range_rax_mid
  const raxM = rest.match(/^(melee|range)_rax_(\w+)/);
  if (raxM) return `${teamRaw} ${raxM[1] === 'melee' ? 'Melee' : 'Range'} Barracks ${raxM[2].charAt(0).toUpperCase() + raxM[2].slice(1)}`;
  if (rest.includes('fort')) return `${teamRaw} Ancient`;
  if (rest.includes('healer')) return `${teamRaw} Shrine`;
  return npcName;
}

// ── BuildingDeathsPanel ─────────────────────────────────────────────────────
function BuildingDeathsPanel({ timeline }) {
  if (!timeline || !timeline.events) return null;
  const buildingEvents = timeline.events.filter(ev => ev.type === 'building');
  if (buildingEvents.length === 0) return null;

  const sorted = [...buildingEvents].sort((a, b) => a.t - b.t);
  // ev.team is the KILLER's team; the building that died belongs to the opposite team
  const radiantDeaths = sorted.filter(ev => ev.team === 'dire');    // dire killed → radiant lost
  const direDeaths    = sorted.filter(ev => ev.team === 'radiant'); // radiant killed → dire lost

  const BuildingList = ({ events, color }) => (
    <div style={{ flex: 1 }}>
      {events.map((ev, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
          <span style={{ color: '#888', width: 40, flexShrink: 0 }}>{formatDuration(ev.t)}</span>
          <span style={{ color }}>{parseBuildingName(ev.building)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="expanded-stats-section">
      <h3>Building Deaths</h3>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ color: '#4ade80', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.85rem' }}>Radiant Buildings Lost</div>
          {radiantDeaths.length === 0
            ? <div style={{ color: '#555', fontSize: '0.85rem' }}>None</div>
            : <BuildingList events={radiantDeaths} color="#ccc" />}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ color: '#f87171', fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.85rem' }}>Dire Buildings Lost</div>
          {direDeaths.length === 0
            ? <div style={{ color: '#555', fontSize: '0.85rem' }}>None</div>
            : <BuildingList events={direDeaths} color="#ccc" />}
        </div>
      </div>
    </div>
  );
}

// ── TeamAbilitiesPanel ──────────────────────────────────────────────────────
function TeamAbilitiesPanel({ teamAbilities, radiantWin }) {
  if (!teamAbilities) return null;
  const { radiant, dire } = teamAbilities;
  const hasData = (radiant.glyph_count + dire.glyph_count + radiant.scan_count + dire.scan_count + (radiant.smoke_count || 0) + (dire.smoke_count || 0)) > 0;
  if (!hasData) return null;

  const AbilityRow = ({ icon, label, count, times, effective, effectiveLabel }) => {
    if (!count) return null;
    return (
      <div style={{ marginBottom: '0.4rem', fontSize: '0.85rem' }}>
        <span style={{ color: '#aaa' }}>{icon} {label}: </span>
        <span style={{ color: '#fff' }}>{count}× used</span>
        {times && times.length > 0 && (
          <span style={{ color: '#888', marginLeft: 6 }}>
            ({times.map(t => formatDuration(t)).join(', ')})
          </span>
        )}
        {effective != null && (
          <span style={{ color: effective > 0 ? '#4ade80' : '#f87171', marginLeft: 6 }}>
            — {effective}/{count} {effectiveLabel}
          </span>
        )}
      </div>
    );
  };

  const TeamRow = ({ label, data, color }) => (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div style={{ color, fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.85rem' }}>{label}</div>
      <AbilityRow icon="🛡️" label="Glyph" count={data.glyph_count} times={data.glyph_times} effective={data.glyph_effective} effectiveLabel="effective" />
      <AbilityRow icon="🔍" label="Scan" count={data.scan_count} times={data.scan_times} effective={null} />
      <AbilityRow icon="💨" label="Smoke" count={data.smoke_count} times={data.smoke_times} effective={data.smoke_effective} effectiveLabel="got a kill" />
      {!data.glyph_count && !data.scan_count && !data.smoke_count && (
        <div style={{ color: '#555', fontSize: '0.85rem' }}>No abilities used</div>
      )}
    </div>
  );

  return (
    <div className="expanded-stats-section">
      <h3>Glyph, Scan &amp; Smoke</h3>
      <p style={{ color: '#888', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
        Glyph is "effective" if no enemy building died within 30s after it was used. Smoke is "effective" if the team scored a kill within 60s of using it.
      </p>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <TeamRow label="Radiant" data={radiant} color="#4ade80" />
        <TeamRow label="Dire"    data={dire}    color="#f87171" />
      </div>
    </div>
  );
}

// ── PowerSpikesPanel ────────────────────────────────────────────────────────
const MAJOR_ITEMS = new Set([
  'item_blink','item_black_king_bar','item_ultimate_scepter','item_ultimate_scepter_2','item_aghanims_shard',
  'item_radiance','item_battlefury',
  'item_monkey_king_bar','item_crystalys','item_daedalus','item_desolator','item_mjollnir',
  'item_manta','item_butterfly','item_satanic','item_heart','item_assault','item_bloodthorn',
  'item_silver_edge','item_sange_and_yasha','item_heavens_halberd','item_skadi',
  'item_boots_of_travel','item_boots_of_travel_2','item_octarine_core','item_kaya_and_sange',
  'item_bloodstone','item_sheepstick','item_dagon','item_dagon_2','item_dagon_3','item_dagon_4','item_dagon_5',
  'item_refresher','item_shiva','item_linken','item_pipe','item_crimson_guard','item_vanguard',
  'item_blade_mail','item_glimmer_cape','item_solar_crest','item_force_staff','item_eul',
  'item_cyclone','item_aether_lens','item_ghost','item_hurricane_pike','item_witch_blade',
  'item_gungir','item_pavise','item_yasha_and_kaya','item_mage_slayer',
  'item_disperser','item_nullifier','item_overwhelming_blink','item_swift_blink','item_arcane_blink',
  'item_harpoon','item_gleipnir','item_wind_waker','item_fallen_sky','item_kaya',
  'item_sange','item_yasha','item_mekansm','item_guardian_greaves',
]);
const LEVEL_MILESTONES = [6, 12, 18, 25];

function PowerSpikesPanel({ timeline, allPlayers }) {
  if (!timeline || !timeline.players) return null;
  const playersWithData = timeline.players.filter(tp => {
    const hasLevels  = tp.abilityLog && tp.abilityLog.some(a => LEVEL_MILESTONES.includes(a.heroLevel));
    const hasItems   = tp.purchaseLog && tp.purchaseLog.some(pu => MAJOR_ITEMS.has(pu.itemName));
    return hasLevels || hasItems;
  });
  if (playersWithData.length === 0) return null;

  return (
    <div className="expanded-stats-section">
      <h3>Power Spikes <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— level milestones and major items</span></h3>
      <div className="scoreboard-wrapper">
        <table className="scoreboard compact" style={{ tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th className="col-player">Player</th>
              {LEVEL_MILESTONES.map(lv => <th key={lv} className="col-stat" title={`Time player reached level ${lv}`}>L{lv}</th>)}
              <th style={{ textAlign: 'left', paddingLeft: 8 }}>Major Items</th>
            </tr>
          </thead>
          <tbody>
            {timeline.players.map((tp, i) => {
              const playerInfo = allPlayers.find(p => p.slot === tp.slot);
              const displayName = playerInfo?.nickname || playerInfo?.persona_name || tp.name || `Slot ${tp.slot}`;
              const levelTimes = {};
              if (tp.abilityLog) {
                for (const a of tp.abilityLog) {
                  if (LEVEL_MILESTONES.includes(a.heroLevel) && !levelTimes[a.heroLevel]) {
                    levelTimes[a.heroLevel] = a.time;
                  }
                }
              }
              const majorItems = (tp.purchaseLog || []).filter(pu => MAJOR_ITEMS.has(pu.itemName));
              return (
                <tr key={i}>
                  <td className="col-player" style={{ color: tp.team === 'radiant' ? '#4ade80' : '#f87171' }}>
                    {displayName}
                  </td>
                  {LEVEL_MILESTONES.map(lv => (
                    <td key={lv} className="col-stat" style={{ fontSize: '0.8rem' }}>
                      {levelTimes[lv] != null ? formatDuration(levelTimes[lv]) : '—'}
                    </td>
                  ))}
                  <td style={{ paddingLeft: 8, fontSize: '0.8rem', color: '#ccc' }}>
                    {majorItems.length === 0 ? '—' : majorItems.map((pu, j) => (
                      <span key={j} style={{ marginRight: 8 }}>
                        <span style={{ color: '#aaa' }}>{formatDuration(pu.time)}</span>{' '}
                        {pu.itemName.replace('item_', '').replace(/_/g, ' ')}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── DamageBreakdownPanel ─────────────────────────────────────────────────────
function DamageBreakdownPanel({ players }) {
  const playersWithBreakdown = (players || []).filter(p =>
    (p.damage_physical || 0) + (p.damage_magical || 0) + (p.damage_pure || 0) > 0
  );
  if (playersWithBreakdown.length === 0) return null;

  return (
    <div className="expanded-stats-section">
      <h3>Damage Breakdown <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— hero-to-hero damage only</span></h3>
      <div className="scoreboard-wrapper">
        <table className="scoreboard compact">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <th className="col-stat" title="Physical damage dealt to heroes">Physical</th>
              <th className="col-stat" title="Magical damage dealt to heroes">Magical</th>
              <th className="col-stat" title="Pure damage dealt to heroes">Pure</th>
              <th style={{ paddingLeft: 8, textAlign: 'left', color: '#888', fontWeight: 400, fontSize: '0.78rem' }}>Split</th>
            </tr>
          </thead>
          <tbody>
            {playersWithBreakdown.map((p, i) => {
              const phys = p.damage_physical || 0;
              const mag  = p.damage_magical  || 0;
              const pure = p.damage_pure     || 0;
              const total = phys + mag + pure || 1;
              const pPct = Math.round((phys / total) * 100);
              const mPct = Math.round((mag  / total) * 100);
              const uPct = Math.round((pure / total) * 100);
              const color = p.team === 'radiant' ? '#4ade80' : '#f87171';
              const name = p.nickname || p.persona_name || `Slot ${p.slot}`;
              return (
                <tr key={i}>
                  <td className="col-player" style={{ color }}>{name}</td>
                  <td className="col-stat" style={{ color: '#fb923c' }}>{phys.toLocaleString()}</td>
                  <td className="col-stat" style={{ color: '#60a5fa' }}>{mag.toLocaleString()}</td>
                  <td className="col-stat" style={{ color: '#a78bfa' }}>{pure.toLocaleString()}</td>
                  <td style={{ paddingLeft: 8, minWidth: 160 }}>
                    <div style={{ display: 'flex', height: 10, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                      {phys > 0 && <div style={{ flex: pPct, background: '#fb923c' }} title={`Physical ${pPct}%`} />}
                      {mag  > 0 && <div style={{ flex: mPct, background: '#60a5fa' }} title={`Magical ${mPct}%`} />}
                      {pure > 0 && <div style={{ flex: uPct, background: '#a78bfa' }} title={`Pure ${uPct}%`} />}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#666', marginTop: 2 }}>
                      {phys > 0 && <span style={{ color: '#fb923c', marginRight: 6 }}>P {pPct}%</span>}
                      {mag  > 0 && <span style={{ color: '#60a5fa', marginRight: 6 }}>M {mPct}%</span>}
                      {pure > 0 && <span style={{ color: '#a78bfa' }}>Pure {uPct}%</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── AegisEventsPanel ────────────────────────────────────────────────────────
function AegisEventsPanel({ timeline, allPlayers }) {
  if (!timeline || !timeline.events) return null;
  const aegisEvents = timeline.events.filter(ev => ev.type === 'aegis');
  if (aegisEvents.length === 0) return null;

  const slotToName = {};
  allPlayers.forEach(p => { slotToName[p.slot] = p.nickname || p.persona_name || `Slot ${p.slot}`; });
  const slotColor = (slot) => slot < 5 ? '#4ade80' : '#f87171';

  // Group pickups with their outcomes
  const pickups = aegisEvents.filter(e => e.outcome === 'pickup');
  const outcomes = aegisEvents.filter(e => e.outcome === 'used' || e.outcome === 'expired');
  const outcomeMap = {};
  outcomes.forEach(e => { outcomeMap[e.slot] = outcomeMap[e.slot] || []; outcomeMap[e.slot].push(e); });

  return (
    <div className="expanded-stats-section">
      <h3>Aegis of the Immortal</h3>
      <div className="scoreboard-wrapper">
        <table className="scoreboard compact">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <th className="col-stat" title="Time aegis was picked up">Picked Up</th>
              <th className="col-stat" title="What happened to the aegis">Outcome</th>
              <th className="col-stat" title="Time held before use or expiry">Held For</th>
            </tr>
          </thead>
          <tbody>
            {pickups.map((ev, i) => {
              const outcome = (outcomeMap[ev.slot] || []).shift();
              return (
                <tr key={i}>
                  <td className="col-player" style={{ color: slotColor(ev.slot) }}>
                    {slotToName[ev.slot] || `Slot ${ev.slot}`}
                  </td>
                  <td className="col-stat" style={{ fontSize: '0.85rem' }}>{formatDuration(ev.t)}</td>
                  <td className="col-stat" style={{ fontSize: '0.85rem' }}>
                    {outcome ? (
                      <span style={{ color: outcome.outcome === 'used' ? '#facc15' : '#888' }}>
                        {outcome.outcome === 'used' ? '⚔️ Used' : '⏰ Expired'}
                        {' '}<span style={{ color: '#888' }}>@ {formatDuration(outcome.t)}</span>
                      </span>
                    ) : <span style={{ color: '#555' }}>Unknown</span>}
                  </td>
                  <td className="col-stat" style={{ fontSize: '0.85rem', color: '#aaa' }}>
                    {outcome?.heldFor != null ? `${Math.floor(outcome.heldFor / 60)}m ${outcome.heldFor % 60}s` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── SmokePerPlayerPanel ──────────────────────────────────────────────────────
function SmokePerPlayerPanel({ timeline, allPlayers }) {
  if (!timeline || !timeline.players) return null;
  const playersWithSmoke = timeline.players.filter(tp => tp.smokeTimes && tp.smokeTimes.length > 0);
  if (playersWithSmoke.length === 0) return null;

  const slotToInfo = {};
  allPlayers.forEach(p => { slotToInfo[p.slot] = p; });

  return (
    <div className="expanded-stats-section">
      <h3>Smoke Usage — Per Player</h3>
      <div className="scoreboard-wrapper">
        <table className="scoreboard compact">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <th className="col-stat">Smokes Called</th>
              <th style={{ textAlign: 'left', paddingLeft: 8, color: '#888', fontWeight: 400, fontSize: '0.78rem' }}>Activation Times</th>
            </tr>
          </thead>
          <tbody>
            {playersWithSmoke
              .sort((a, b) => b.smokeTimes.length - a.smokeTimes.length)
              .map((tp, i) => {
                const info = slotToInfo[tp.slot];
                const name = info?.nickname || info?.persona_name || `Slot ${tp.slot}`;
                const color = tp.team === 'radiant' ? '#4ade80' : '#f87171';
                return (
                  <tr key={i}>
                    <td className="col-player" style={{ color }}>{name}</td>
                    <td className="col-stat" style={{ fontWeight: 600 }}>{tp.smokeTimes.length}</td>
                    <td style={{ paddingLeft: 8, fontSize: '0.8rem', color: '#aaa' }}>
                      {tp.smokeTimes.map(t => formatDuration(t)).join(', ')}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── NWSwingPanel ─────────────────────────────────────────────────────────────
function NWSwingPanel({ timeline, allPlayers }) {
  if (!timeline || !timeline.players || timeline.players.length === 0) return null;

  // Build team NW per sample time
  const teamNW = {};
  for (const tp of timeline.players) {
    if (!tp.samples) continue;
    const isRadiant = tp.team === 'radiant';
    for (const s of tp.samples) {
      if (!teamNW[s.t]) teamNW[s.t] = { radiant: 0, dire: 0 };
      if (isRadiant) teamNW[s.t].radiant += s.nw || 0;
      else teamNW[s.t].dire += s.nw || 0;
    }
  }

  const times = Object.keys(teamNW).map(Number).sort((a, b) => a - b);
  if (times.length < 2) return null;

  // Compute NW advantage at each time (radiant - dire)
  const advantages = times.map(t => ({ t, adv: teamNW[t].radiant - teamNW[t].dire }));

  // Compute swings: delta in advantage between consecutive samples
  const swings = [];
  for (let i = 1; i < advantages.length; i++) {
    const delta = advantages[i].adv - advantages[i - 1].adv;
    swings.push({ t1: advantages[i - 1].t, t2: advantages[i].t, delta, from: advantages[i - 1].adv, to: advantages[i].adv });
  }
  swings.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const topSwings = swings.slice(0, 6);
  if (topSwings.length === 0) return null;

  return (
    <div className="expanded-stats-section">
      <h3>Net Worth Swings <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— biggest gold advantage shifts</span></h3>
      <div className="scoreboard-wrapper">
        <table className="scoreboard compact">
          <thead>
            <tr>
              <th className="col-stat">Time</th>
              <th className="col-stat">Shift</th>
              <th style={{ textAlign: 'left', paddingLeft: 8, color: '#888', fontWeight: 400, fontSize: '0.78rem' }}>Before → After</th>
            </tr>
          </thead>
          <tbody>
            {topSwings.map((sw, i) => {
              const favor = sw.delta > 0 ? 'Radiant' : 'Dire';
              const color = sw.delta > 0 ? '#4ade80' : '#f87171';
              const absGold = Math.abs(sw.delta).toLocaleString();
              const fmtAdv = (v) => {
                const sign = v > 0 ? 'R +' : v < 0 ? 'D +' : '±';
                return `${sign}${Math.abs(v).toLocaleString()}`;
              };
              return (
                <tr key={i}>
                  <td className="col-stat" style={{ fontSize: '0.85rem', color: '#888' }}>
                    {formatDuration(sw.t1)}–{formatDuration(sw.t2)}
                  </td>
                  <td className="col-stat" style={{ fontWeight: 600, color }}>
                    {favor} +{absGold}g
                  </td>
                  <td style={{ paddingLeft: 8, fontSize: '0.8rem', color: '#888' }}>
                    {fmtAdv(sw.from)} → {fmtAdv(sw.to)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── KillFeedPanel ────────────────────────────────────────────────────────────
function KillFeedPanel({ timeline, allPlayers }) {
  if (!timeline || !timeline.events) return null;
  const killEvents = timeline.events.filter(ev => ev.type === 'kill');
  if (killEvents.length === 0) return null;

  const slotToPlayer = {};
  allPlayers.forEach(p => { slotToPlayer[p.slot] = p; });

  const getName = (slot) => {
    const p = slotToPlayer[slot];
    return p ? (p.nickname || p.persona_name || `Slot ${slot}`) : (slot >= 0 ? `Slot ${slot}` : '?');
  };
  const slotColor = (slot) => slot < 5 ? '#4ade80' : '#f87171';

  return (
    <div className="expanded-stats-section">
      <h3>Kill Feed <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— {killEvents.length} hero kills</span></h3>
      <div className="scoreboard-wrapper" style={{ maxHeight: 380, overflowY: 'auto' }}>
        <table className="scoreboard compact">
          <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#0f172a' }}>
            <tr>
              <th className="col-stat" style={{ width: 52 }}>Time</th>
              <th style={{ textAlign: 'left', paddingLeft: 8 }}>Kill</th>
              <th style={{ textAlign: 'left', paddingLeft: 8 }}>Assisters</th>
              <th className="col-stat" title="Total gold bounty distributed to the killing team from this kill (from replays). Falls back to victim net worth if bounty data unavailable.">Gold</th>
            </tr>
          </thead>
          <tbody>
            {[...killEvents].sort((a, b) => a.t - b.t).map((ev, i) => {
              const assists = Array.isArray(ev.assistSlots) ? ev.assistSlots.filter(s => s !== ev.killerSlot && s !== ev.victimSlot) : [];
              const hasBounty = ev.killBounty > 0;
              const goldDisplay = hasBounty
                ? `${ev.killBounty}g`
                : ev.victimNetworth
                  ? `~${Math.round(ev.victimNetworth / 100) * 100}g`
                  : '—';
              const goldTitle = hasBounty
                ? `Bounty: ${ev.killBounty}g distributed to team`
                : ev.victimNetworth
                  ? `Victim net worth at death: ${ev.victimNetworth}g (bounty data not available for this match)`
                  : '';
              return (
                <tr key={i}>
                  <td className="col-stat" style={{ fontSize: '0.82rem', color: '#888' }}>{formatDuration(ev.t)}</td>
                  <td style={{ paddingLeft: 8, fontSize: '0.88rem' }}>
                    <span style={{ color: slotColor(ev.killerSlot), fontWeight: 600 }}>
                      {getName(ev.killerSlot)}
                    </span>
                    <span style={{ color: '#555', margin: '0 5px' }}>⚔</span>
                    <span style={{ color: slotColor(ev.victimSlot) }}>
                      {getName(ev.victimSlot)}
                    </span>
                  </td>
                  <td style={{ paddingLeft: 8, fontSize: '0.82rem', color: '#aaa' }}>
                    {assists.length > 0
                      ? assists.map(s => <span key={s} style={{ color: slotColor(s), marginRight: 4 }}>{getName(s)}</span>)
                      : <span style={{ color: '#444' }}>—</span>}
                  </td>
                  <td className="col-stat" title={goldTitle} style={{ fontSize: '0.82rem', color: hasBounty ? '#facc15' : '#7a6a30' }}>
                    {goldDisplay}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── KillHeatmapPanel ──────────────────────────────────────────────────────────
// Maps kill locationX/Y (Dota 2 game-world coordinates) to a minimap SVG.
// Game coordinate space: X right, Y up, range roughly 0–16384.
// SVG space: X right, Y down, 500×500 px.
function KillHeatmapPanel({ timeline, allPlayers }) {
  if (!timeline || !timeline.events) return null;
  const killEvents = timeline.events.filter(ev => ev.type === 'kill' && ev.locationX != null && ev.locationY != null);
  if (killEvents.length < 3) return null;   // need enough points to be useful

  const MAP_SIZE = 16384;
  const SVG = 500;
  const toSvg = (gx, gy) => ({
    x: Math.round((gx / MAP_SIZE) * SVG),
    y: Math.round(SVG - (gy / MAP_SIZE) * SVG),
  });

  const slotToPlayer = {};
  allPlayers.forEach(p => { slotToPlayer[p.slot] = p; });

  return (
    <div className="expanded-stats-section">
      <h3>Kill Heatmap <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— {killEvents.length} located kills</span></h3>
      <div style={{ overflowX: 'auto' }}>
        <svg width={SVG} height={SVG} viewBox={`0 0 ${SVG} ${SVG}`} style={{ background: '#111', borderRadius: 6, display: 'block', margin: '0 auto' }}>
          {/* Map background */}
          <rect width={SVG} height={SVG} fill="#0f1a10" rx="4" />
          {/* River — approximate diagonal band across the map */}
          <polygon
            points="195,500 245,500 295,310 265,295 220,295 160,310"
            fill="#1c3a5e" opacity="0.55"
          />
          <polygon
            points="220,295 265,295 300,155 320,0 270,0 240,155"
            fill="#1c3a5e" opacity="0.55"
          />
          {/* Radiant base — bottom-left */}
          <rect x="4" y="410" width="70" height="70" fill="#14532d" rx="3" opacity="0.55" />
          <text x="8" y="494" fill="#4ade80" fontSize="9" fontFamily="monospace">RADIANT</text>
          {/* Dire base — top-right */}
          <rect x="425" y="18" width="70" height="70" fill="#450a0a" rx="3" opacity="0.55" />
          <text x="428" y="101" fill="#f87171" fontSize="9" fontFamily="monospace">DIRE</text>
          {/* Kill dots */}
          {killEvents.map((ev, i) => {
            const pos = toSvg(ev.locationX, ev.locationY);
            const killerTeam = slotToPlayer[ev.killerSlot]?.team;
            const color = killerTeam === 'radiant' ? '#4ade80' : killerTeam === 'dire' ? '#f87171' : '#facc15';
            return (
              <circle
                key={i}
                cx={pos.x} cy={pos.y} r={5}
                fill={color}
                opacity={0.75}
                stroke="#000" strokeWidth={0.8}
              >
                <title>{formatDuration(ev.t)}</title>
              </circle>
            );
          })}
        </svg>
        <p style={{ fontSize: '0.75rem', color: '#555', textAlign: 'center', marginTop: 4 }}>
          Green = Radiant kill · Red = Dire kill · Map is approximate
        </p>
      </div>
    </div>
  );
}

// ── WardMapPanel ──────────────────────────────────────────────────────────────
const WARD_MAP_X_MIN = 64, WARD_MAP_X_MAX = 192, WARD_MAP_Y_MIN = 64, WARD_MAP_Y_MAX = 192;
function wardToCanvasCoords(wx, wy, W, H) {
  return {
    px: ((wx - WARD_MAP_X_MIN) / (WARD_MAP_X_MAX - WARD_MAP_X_MIN)) * W,
    py: (1 - (wy - WARD_MAP_Y_MIN) / (WARD_MAP_Y_MAX - WARD_MAP_Y_MIN)) * H,
  };
}
function drawWardDiamond(ctx, px, py, r) {
  ctx.beginPath();
  ctx.moveTo(px, py - r);
  ctx.lineTo(px + r, py);
  ctx.lineTo(px, py + r);
  ctx.lineTo(px - r, py);
  ctx.closePath();
}
function WardMapPanel({ players }) {
  const canvasRef = useRef(null);
  const mapImg = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [wardFilter, setWardFilter] = useState('both');
  // null = all players; otherwise a Set of hero_name strings that are shown
  const [playerFilter, setPlayerFilter] = useState(null);

  const hasWards = players.some(p => Array.isArray(p.ward_placements) && p.ward_placements.length > 0);
  const radiantColor = '#4ade80';
  const direColor = '#f87171';

  const isPlayerSelected = (heroName) => playerFilter === null || playerFilter.has(heroName);

  const togglePlayer = (heroName) => {
    setPlayerFilter(prev => {
      if (prev === null) {
        // deselect this one, keep all others
        const next = new Set(players.map(p => p.hero_name));
        next.delete(heroName);
        return next.size === 0 ? null : next;
      }
      const next = new Set(prev);
      if (next.has(heroName)) {
        next.delete(heroName);
      } else {
        next.add(heroName);
      }
      // if all selected again, go back to null
      return next.size >= players.length ? null : next.size === 0 ? null : next;
    });
  };

  const filteredPlayers = playerFilter === null
    ? players
    : players.filter(p => playerFilter.has(p.hero_name));

  useEffect(() => {
    if (!hasWards) return;
    const img = new Image();
    img.onload = () => setMapLoaded(true);
    img.onerror = () => setMapLoaded(false);
    img.src = '/minimap.jpg';
    mapImg.current = img;
  }, [hasWards]);

  useEffect(() => {
    if (!hasWards) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (mapLoaded && mapImg.current?.naturalWidth > 0) {
      ctx.drawImage(mapImg.current, 0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#0a1610';
      ctx.fillRect(0, 0, W, H);
    }
    const showObs = wardFilter === 'both' || wardFilter === 'obs';
    const showSen = wardFilter === 'both' || wardFilter === 'sen';
    for (const player of filteredPlayers) {
      const wards = Array.isArray(player.ward_placements) ? player.ward_placements : [];
      const color = player.team === 'radiant' ? radiantColor : direColor;
      for (const ward of wards) {
        if (!ward.x || !ward.y) continue;
        if (ward.type === 'obs' && !showObs) continue;
        if (ward.type === 'sen' && !showSen) continue;
        const { px, py } = wardToCanvasCoords(ward.x, ward.y, W, H);
        ctx.fillStyle = color + 'cc';
        ctx.strokeStyle = '#000000aa';
        ctx.lineWidth = 1;
        if (ward.type === 'obs') {
          ctx.beginPath();
          ctx.arc(px, py, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          drawWardDiamond(ctx, px, py, 6);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }, [filteredPlayers, mapLoaded, wardFilter, hasWards]);

  if (!hasWards) return null;

  const radiantPlayers = players.filter(p => p.team === 'radiant');
  const direPlayers = players.filter(p => p.team === 'dire');

  return (
    <div className="expanded-stats-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Ward Map <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— ward placements this match</span></h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['both', 'Both'], ['obs', 'Observer'], ['sen', 'Sentry']].map(([v, l]) => (
            <button key={v} onClick={() => setWardFilter(v)} style={{
              background: wardFilter === v ? 'var(--accent-blue)' : 'var(--bg-secondary)',
              color: wardFilter === v ? '#fff' : 'var(--text-muted)',
              border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Player chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginRight: 4 }}>PLAYERS:</span>
        <button
          onClick={() => setPlayerFilter(null)}
          style={{
            background: playerFilter === null ? 'var(--accent-blue)' : 'var(--bg-secondary)',
            color: playerFilter === null ? '#fff' : 'var(--text-muted)',
            border: '1px solid var(--border)', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >All</button>
        {/* Radiant players */}
        {radiantPlayers.map(p => {
          const sel = isPlayerSelected(p.hero_name);
          const displayName = p.nickname || p.persona_name || formatHeroName(p.hero_name);
          return (
            <button key={p.hero_name} onClick={() => togglePlayer(p.hero_name)} style={{
              background: sel ? 'rgba(74,222,128,0.18)' : 'var(--bg-secondary)',
              color: sel ? radiantColor : 'var(--text-muted)',
              border: `1px solid ${sel ? radiantColor : 'var(--border)'}`,
              borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              opacity: sel ? 1 : 0.5,
            }}>{displayName}</button>
          );
        })}
        {/* Dire players */}
        {direPlayers.map(p => {
          const sel = isPlayerSelected(p.hero_name);
          const displayName = p.nickname || p.persona_name || formatHeroName(p.hero_name);
          return (
            <button key={p.hero_name} onClick={() => togglePlayer(p.hero_name)} style={{
              background: sel ? 'rgba(248,113,113,0.18)' : 'var(--bg-secondary)',
              color: sel ? direColor : 'var(--text-muted)',
              border: `1px solid ${sel ? direColor : 'var(--border)'}`,
              borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              opacity: sel ? 1 : 0.5,
            }}>{displayName}</button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        <span><span style={{ color: radiantColor }}>●</span> Radiant Obs &nbsp;<span style={{ color: radiantColor }}>◆</span> Radiant Sen</span>
        <span><span style={{ color: direColor }}>●</span> Dire Obs &nbsp;<span style={{ color: direColor }}>◆</span> Dire Sen</span>
      </div>

      <canvas
        ref={canvasRef}
        width={500} height={500}
        style={{ width: '100%', maxWidth: 500, borderRadius: 8, border: '1px solid #334155', display: 'block' }}
      />
    </div>
  );
}

// ── SupportReportPanel ────────────────────────────────────────────────────────
function SupportReportPanel({ players, timeline }) {
  // Only show if at least one player has meaningful support activity
  const hasData = players.some(p =>
    (p.obs_placed > 0) || (p.sen_placed > 0) || (p.camps_stacked > 0) ||
    (p.support_gold_spent > 0) || (p.dusts_used > 0) || (p.pull_count > 0) ||
    (p.heal_saves > 0) || (p.hero_healing > 0)
  );
  if (!hasData) return null;

  // Smoke success rates computed from timeline (no extra DB column required)
  const smokeRates = {};
  if (timeline?.players && timeline?.events) {
    const killEvs = timeline.events.filter(ev => ev.type === 'kill');
    timeline.players.forEach(tp => {
      if (!tp.smokeTimes?.length) return;
      const team = tp.slot < 5 ? 'radiant' : 'dire';
      const successes = tp.smokeSuccesses != null
        ? tp.smokeSuccesses
        : tp.smokeTimes.filter(smokeT =>
            killEvs.some(ev => {
              if (ev.t < smokeT || ev.t > smokeT + 60) return false;
              if (ev.killerSlot >= 0 && (ev.killerSlot < 5 ? 'radiant' : 'dire') === team) return true;
              if (ev.assistSlots?.some(as => (as < 5 ? 'radiant' : 'dire') === team)) return true;
              return false;
            })
          ).length;
      smokeRates[tp.slot] = { total: tp.smokeTimes.length, successes };
    });
  }

  return (
    <div className="expanded-stats-section">
      <h3>Support Report <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— vision, utility &amp; lane support</span></h3>
      <div className="scoreboard-wrapper">
        <table className="scoreboard compact">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <th className="col-stat" title="Observer wards placed">OBS</th>
              <th className="col-stat" title="Sentry wards placed">SEN</th>
              <th className="col-stat" title="Enemy wards dewarded by this player">DEW</th>
              <th className="col-stat" title="Your observer wards killed by enemies">O.DEW</th>
              <th className="col-stat" title="Avg lifespan of your observer wards that were killed (M:SS)">O.LIFE</th>
              <th className="col-stat" title="Your sentry wards killed by enemies">S.DEW</th>
              <th className="col-stat" title="Avg lifespan of your sentry wards that were killed (M:SS)">S.LIFE</th>
              <th className="col-stat" title="Camps stacked">STK</th>
              <th className="col-stat" title="Approximate pulls performed (timing-based heuristic)">PULL~</th>
              <th className="col-stat" title="Dust of Appearance activations">DUST</th>
              <th className="col-stat" title="Smoke of Deceit activations">SMKE</th>
              <th className="col-stat" title="Smoke success rate — % of smokes followed by a same-team kill within 60s">SMKE%</th>
              <th className="col-stat" title="Healing done to allies via spells/items (excludes self-heal and lifesteal)">HEAL</th>
              <th className="col-stat" title="Total stun duration dealt (seconds)">STUN</th>
              <th className="col-stat" title="Gold spent on support items">S.GOLD</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const sr = smokeRates[p.slot];
              const smokePct = sr?.total > 0 ? Math.round(sr.successes / sr.total * 100) : null;
              const smokePctColor = smokePct == null ? undefined : smokePct >= 75 ? '#4ade80' : smokePct >= 50 ? '#facc15' : '#64748b';
              return (
                <tr key={i}>
                  <td className="col-player">
                    <PlayerLink player={p} index={i} />
                  </td>
                  <td className="col-stat">{p.obs_placed || 0}</td>
                  <td className="col-stat">{p.sen_placed || 0}</td>
                  <td className="col-stat">{p.wards_killed || 0}</td>
                  <td className="col-stat" style={{ color: p.obs_dewarded_count > 0 ? '#f87171' : undefined }}>
                    {p.obs_dewarded_count || 0}
                  </td>
                  <td className="col-stat" style={{ color: p.obs_avg_lifespan > 0 ? '#94a3b8' : undefined }}>
                    {p.obs_avg_lifespan > 0
                      ? `${Math.floor(p.obs_avg_lifespan / 60)}:${String(p.obs_avg_lifespan % 60).padStart(2, '0')}`
                      : '—'}
                  </td>
                  <td className="col-stat" style={{ color: p.sen_dewarded_count > 0 ? '#f87171' : undefined }}>
                    {p.sen_dewarded_count || 0}
                  </td>
                  <td className="col-stat" style={{ color: p.sen_avg_lifespan > 0 ? '#94a3b8' : undefined }}>
                    {p.sen_avg_lifespan > 0
                      ? `${Math.floor(p.sen_avg_lifespan / 60)}:${String(p.sen_avg_lifespan % 60).padStart(2, '0')}`
                      : '—'}
                  </td>
                  <td className="col-stat">{p.camps_stacked || 0}</td>
                  <td className="col-stat" style={{ color: p.pull_count > 0 ? '#a78bfa' : undefined }}>
                    {p.pull_count || 0}
                  </td>
                  <td className="col-stat" style={{ color: p.dusts_used > 0 ? '#facc15' : undefined }}>
                    {p.dusts_used || 0}
                  </td>
                  <td className="col-stat">{p.smoke_kills || 0}</td>
                  <td className="col-stat" style={{ color: smokePctColor }}>
                    {smokePct != null ? `${smokePct}%` : '—'}
                  </td>
                  <td className="col-stat">{p.hero_healing ? formatNumber(p.hero_healing) : 0}</td>
                  <td className="col-stat">{p.stun_duration ? p.stun_duration.toFixed(1) : '0'}</td>
                  <td className="col-stat" style={{ color: p.support_gold_spent > 1000 ? '#fbbf24' : undefined }}>
                    {p.support_gold_spent ? formatNumber(p.support_gold_spent) : 0}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── DeathTimingPanel ──────────────────────────────────────────────────────────
function DeathTimingPanel({ timeline, allPlayers, duration }) {
  if (!timeline?.events) return null;
  const killEvents = timeline.events.filter(ev => ev.type === 'kill' && ev.victimSlot >= 0);
  if (killEvents.length === 0) return null;

  const BRACKETS = [
    { label: '<15m',   max: 900  },
    { label: '15-35m', max: 2100 },
    { label: '35-45m', max: 2700 },
    { label: '>45m',   max: Infinity },
  ];
  const BRACKET_COLORS = ['#4ade80', '#facc15', '#f97316', '#f87171'];

  const matchDur = duration || Math.max(...killEvents.map(ev => ev.t), 1200);
  const slotLevel = {};
  allPlayers.forEach(p => { slotLevel[p.slot] = p.level || 25; });

  const deathsBySlot = {};
  const deadSecsBySlot = {};
  allPlayers.forEach(p => {
    deathsBySlot[p.slot] = [0, 0, 0, 0];
    deadSecsBySlot[p.slot] = [0, 0, 0, 0];
  });

  for (const ev of killEvents) {
    if (deathsBySlot[ev.victimSlot] == null) continue;
    const bi = BRACKETS.findIndex(b => ev.t < b.max);
    if (bi < 0) continue;
    deathsBySlot[ev.victimSlot][bi]++;
    // Estimate respawn time for this death
    const finalLevel = slotLevel[ev.victimSlot] || 25;
    const estLevel = Math.max(1, Math.min(25, Math.round(finalLevel * ev.t / matchDur)));
    const respawn = Math.round(10 + (estLevel - 1) * 2.5);
    deadSecsBySlot[ev.victimSlot][bi] += Math.min(respawn, Math.max(0, matchDur - ev.t));
  }

  const fmtSecs = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="expanded-stats-section">
      <h3>Death Timing <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— deaths by game phase</span></h3>
      <div className="scoreboard-wrapper">
        <table className="scoreboard compact">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              {BRACKETS.map((b, i) => (
                <th key={i} className="col-stat" style={{ color: BRACKET_COLORS[i], minWidth: 80 }} title={`Deaths and estimated time spent dead in the ${b.label} window`}>{b.label}</th>
              ))}
              <th className="col-stat" title="Total deaths">TOT</th>
              <th className="col-stat" title="Total time spent dead (mm:ss) — exact if replay uploaded, otherwise estimated">DEAD</th>
              <th className="col-stat" title="Deaths before 15 min as % of total — high = fed laning phase">EARLY%</th>
            </tr>
          </thead>
          <tbody>
            {allPlayers.map((p, i) => {
              const counts = deathsBySlot[p.slot] || [0, 0, 0, 0];
              const deadSecs = deadSecsBySlot[p.slot] || [0, 0, 0, 0];
              const total = counts.reduce((s, c) => s + c, 0);
              const earlyPct = total > 0 ? Math.round(counts[0] / total * 100) : null;
              const earlyColor = earlyPct == null ? undefined : earlyPct >= 60 ? '#f87171' : earlyPct >= 40 ? '#facc15' : '#4ade80';
              const totalDeadFmt = p.dead_time_seconds != null
                ? fmtSecs(p.dead_time_seconds)
                : total > 0 ? fmtSecs(deadSecs.reduce((s, c) => s + c, 0)) : '—';
              return (
                <tr key={i}>
                  <td className="col-player"><PlayerLink player={p} index={i} /></td>
                  {counts.map((c, bi) => (
                    <td key={bi} className="col-stat" style={{ color: c > 0 ? BRACKET_COLORS[bi] : '#334155' }}>
                      {c > 0
                        ? <>{c} <span style={{ color: '#64748b', fontSize: '0.78em' }}>({fmtSecs(deadSecs[bi])})</span></>
                        : 0}
                    </td>
                  ))}
                  <td className="col-stat">{total}</td>
                  <td className="col-stat" style={{ color: '#64748b' }}>{totalDeadFmt}</td>
                  <td className="col-stat" style={{ color: earlyColor }}>{earlyPct != null ? `${earlyPct}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ComebackMetricPanel ───────────────────────────────────────────────────────
function ComebackMetricPanel({ timeline, allPlayers }) {
  if (!timeline?.players?.length) return null;

  const nwAt15 = {}, nwFinal = {};
  for (const tp of timeline.players) {
    const samples = tp.samples || [];
    if (!samples.length) continue;
    const best15 = samples.reduce((b, s) => Math.abs(s.t - 900) < Math.abs(b.t - 900) ? s : b, samples[0]);
    if (Math.abs(best15.t - 900) < 300) nwAt15[tp.slot] = best15.nw || 0;
    nwFinal[tp.slot] = (samples[samples.length - 1].nw) || 0;
  }

  const eligible = allPlayers.filter(p => nwAt15[p.slot] != null && nwFinal[p.slot] != null);
  if (eligible.length < 4) return null;

  const sorted15 = [...eligible].sort((a, b) => nwAt15[b.slot] - nwAt15[a.slot]);
  const sortedFin = [...eligible].sort((a, b) => nwFinal[b.slot] - nwFinal[a.slot]);
  const rank15 = {}, rankFin = {};
  sorted15.forEach((p, i) => { rank15[p.slot] = i + 1; });
  sortedFin.forEach((p, i) => { rankFin[p.slot] = i + 1; });

  const rows = eligible.map(p => ({
    ...p, r15: rank15[p.slot], rFin: rankFin[p.slot],
    delta: rank15[p.slot] - rankFin[p.slot],
    nw15: nwAt15[p.slot], nwEnd: nwFinal[p.slot],
  })).sort((a, b) => b.delta - a.delta);

  if (!rows.some(r => Math.abs(r.delta) >= 2)) return null;

  const fmtK = n => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div className="expanded-stats-section">
      <h3>Comeback Metric <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— NW rank at 15 min vs final (↑ = climbed)</span></h3>
      <div className="scoreboard-wrapper">
        <table className="scoreboard compact">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <th className="col-stat" title="Net worth rank at ~15 min (1 = richest)">Rank@15</th>
              <th className="col-stat" title="Net worth at 15 min">NW@15</th>
              <th className="col-stat" title="Final net worth rank">RankFin</th>
              <th className="col-stat" title="Final net worth">NW.Fin</th>
              <th className="col-stat" title="Rank change — positive means climbed the wealth ladder">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const dColor = p.delta > 0 ? '#4ade80' : p.delta < 0 ? '#f87171' : '#94a3b8';
              return (
                <tr key={i}>
                  <td className="col-player"><PlayerLink player={p} index={i} /></td>
                  <td className="col-stat" style={{ color: '#94a3b8' }}>#{p.r15}</td>
                  <td className="col-stat" style={{ color: '#facc15' }}>{fmtK(p.nw15)}</td>
                  <td className="col-stat" style={{ color: '#94a3b8' }}>#{p.rFin}</td>
                  <td className="col-stat" style={{ color: '#facc15' }}>{fmtK(p.nwEnd)}</td>
                  <td className="col-stat" style={{ color: dColor, fontWeight: Math.abs(p.delta) >= 3 ? 700 : undefined }}>
                    {p.delta > 0 ? `+${p.delta}` : p.delta < 0 ? `${p.delta}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── TeamfightPanel ────────────────────────────────────────────────────────────
function TeamfightPanel({ timeline, allPlayers }) {
  if (!timeline?.events) return null;
  const killEvs = timeline.events
    .filter(ev => ev.type === 'kill' && ev.killerSlot >= 0 && ev.victimSlot >= 0)
    .sort((a, b) => a.t - b.t);
  if (killEvs.length < 2) return null;

  const GAP = 30;
  const clusters = [];
  let cur = [killEvs[0]];
  for (let i = 1; i < killEvs.length; i++) {
    if (killEvs[i].t - killEvs[i - 1].t <= GAP) {
      cur.push(killEvs[i]);
    } else {
      if (cur.length >= 2) clusters.push(cur);
      cur = [killEvs[i]];
    }
  }
  if (cur.length >= 2) clusters.push(cur);
  if (clusters.length === 0) return null;

  const fmtT = s => {
    const m = Math.floor(Math.abs(s) / 60);
    const sec = Math.floor(Math.abs(s) % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };
  const slotMap = {};
  allPlayers.forEach(p => { slotMap[p.slot] = p; });
  const getName = s => { const p = slotMap[s]; return p ? (p.nickname || p.persona_name || `#${s}`) : `#${s}`; };
  const sc = s => s < 5 ? '#4ade80' : '#f87171';

  return (
    <div className="expanded-stats-section">
      <h3>Teamfights <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— kill clusters within 30s · {clusters.length} fights</span></h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {clusters.map((cluster, ci) => {
          const rK = cluster.filter(ev => ev.killerSlot < 5).length;
          const dK = cluster.filter(ev => ev.killerSlot >= 5).length;
          const winner = rK > dK ? 'radiant' : dK > rK ? 'dire' : 'draw';
          const wColor = winner === 'radiant' ? '#4ade80' : winner === 'dire' ? '#f87171' : '#94a3b8';
          return (
            <div key={ci} style={{
              background: '#0f172a', border: `1px solid ${wColor}33`,
              borderRadius: 8, padding: '10px 14px', minWidth: 190, flex: '1 1 190px', maxWidth: 280,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>⚔ {fmtT(cluster[0].t)}</span>
                <span style={{ fontSize: 11, color: wColor, fontWeight: 700, textTransform: 'uppercase' }}>
                  {winner === 'draw' ? 'Draw' : `${winner[0].toUpperCase()}${winner.slice(1)} wins`}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>
                {cluster[cluster.length - 1].t - cluster[0].t}s · <span style={{ color: '#4ade80' }}>R {rK}K</span> vs <span style={{ color: '#f87171' }}>D {dK}K</span>
              </div>
              {cluster.map((ev, ei) => (
                <div key={ei} style={{ fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ color: '#475569', minWidth: 34 }}>{fmtT(ev.t)}</span>
                  <span style={{ color: sc(ev.killerSlot) }}>{getName(ev.killerSlot)}</span>
                  <span style={{ color: '#475569' }}>⚔</span>
                  <span style={{ color: sc(ev.victimSlot) }}>{getName(ev.victimSlot)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchNotes({ matchId, isAdmin, adminKey }) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    fetch(`/api/matches/${matchId}/notes`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setNotes(data); })
      .catch(() => {});
  }, [matchId]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/matches/${matchId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-upload-key': adminKey },
        body: JSON.stringify({ content: newNote.trim(), added_by: 'admin' }),
      });
      if (res.ok) {
        const note = await res.json();
        setNotes(prev => [...prev, note]);
        setNewNote('');
      }
    } catch {} finally { setSaving(false); }
  }

  async function handleDelete(noteId) {
    setDeleting(noteId);
    try {
      await fetch(`/api/notes/${noteId}`, {
        method: 'DELETE',
        headers: { 'x-upload-key': adminKey },
      });
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch {} finally { setDeleting(null); }
  }

  if (notes.length === 0 && !isAdmin) return null;

  return (
    <div className="expanded-stats-section">
      <h3>📝 Match Notes</h3>
      {notes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {notes.map(note => (
            <div key={note.id} style={{
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            }}>
              <div>
                <div style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{note.content}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
                  {note.added_by} · {new Date(note.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => handleDelete(note.id)}
                  disabled={deleting === note.id}
                  title="Delete note"
                  style={{
                    background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer',
                    fontSize: 16, padding: '2px 6px', lineHeight: 1, flexShrink: 0,
                  }}
                >✕</button>
              )}
            </div>
          ))}
        </div>
      )}
      {isAdmin && (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
          <textarea
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Add a match note or highlight (e.g. 'Closest game of the season — insane comeback')…"
            rows={3}
            style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid #334155',
              color: 'var(--text-primary)', borderRadius: 6, padding: '8px 10px',
              fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
            }}
          />
          <div>
            <button
              type="submit"
              disabled={saving || !newNote.trim()}
              style={{
                background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.5)',
                color: '#818cf8', padding: '6px 18px', borderRadius: 6, cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >{saving ? 'Saving…' : 'Add Note'}</button>
          </div>
        </form>
      )}
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
  const [correctingWinner, setCorrectingWinner] = useState(false);

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

  const handleCorrectWinner = async (radiantWin) => {
    const currentWinner = match.radiant_win ? 'Radiant' : 'Dire';
    const newWinner = radiantWin ? 'Radiant' : 'Dire';
    if (!confirm(`Change winner from ${currentWinner} to ${newWinner}?\n\nThis will update the result and automatically recalculate MMR ratings for all players across all matches. May take a few seconds.`)) return;
    setCorrectingWinner(true);
    try {
      const key = sessionStorage.getItem('superuserKey') || '';
      const res = await fetch(`/api/matches/${matchId}/winner`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': key },
        body: JSON.stringify({ radiantWin }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || 'Failed');
      }
      setMatch(prev => ({ ...prev, radiant_win: radiantWin }));
      alert(`Winner updated to ${newWinner}. MMR ratings have been recalculated for all players.`);
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setCorrectingWinner(false);
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
        {isSuperuser && (
          <a
            href={`/api/replays/${matchId}/download`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#1e3a5f', color: '#60a5fa', border: '1px solid #3b82f6',
              padding: '3px 12px', borderRadius: 4, fontSize: '0.8rem', textDecoration: 'none',
              fontWeight: 600,
            }}
            onClick={e => {
              e.preventDefault();
              const key = sessionStorage.getItem('superuserKey') || '';
              const url = `/api/replays/${matchId}/download`;
              fetch(url, { headers: { 'x-superuser-key': key } })
                .then(r => {
                  if (!r.ok) return r.json().then(j => { throw new Error(j.error || 'Not available'); });
                  return r.blob();
                })
                .then(blob => {
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `${matchId}.dem`;
                  a.click();
                })
                .catch(err => alert('Replay download: ' + err.message));
            }}
          >
            &#11015; Download Replay
          </a>
        )}
      </div>

      {isSuperuser && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#0f1923', border: '1px solid #1e3a2e', borderRadius: '6px' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: showMeta ? '0.75rem' : 0 }}>
            {!showMeta && (
              <button
                onClick={() => setShowMeta(true)}
                style={{
                  background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
                  padding: '0.35rem 0.9rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
                }}
              >
                ✏️ Edit Patch / Season
              </button>
            )}
            <button
              onClick={handleClearHash}
              disabled={clearingHash}
              title="Clears the duplicate-prevention fingerprint so this replay can be re-uploaded"
              style={{
                background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
                padding: '0.35rem 0.9rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
              }}
            >
              {clearingHash ? 'Clearing...' : '🔄 Allow Re-upload'}
            </button>
            <button
              onClick={() => handleCorrectWinner(!match.radiant_win)}
              disabled={correctingWinner}
              title={`Current winner: ${match.radiant_win ? 'Radiant' : 'Dire'}. Click to flip to ${match.radiant_win ? 'Dire' : 'Radiant'}.`}
              style={{
                background: 'transparent', color: '#fbbf24', border: '1px solid #78350f',
                padding: '0.35rem 0.9rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
              }}
            >
              {correctingWinner ? 'Saving...' : `⚖️ Flip Winner (now: ${match.radiant_win ? 'Radiant' : 'Dire'})`}
            </button>
            {!showDelete ? (
              <button
                onClick={() => setShowDelete(true)}
                style={{
                  background: 'transparent', color: '#f87171', border: '1px solid #7f1d1d',
                  padding: '0.35rem 0.9rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
                }}
              >
                🗑️ Delete Match
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Reason (optional)"
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  style={{
                    background: '#0d1117', color: '#e0e0e0', border: '1px solid #444',
                    padding: '0.35rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', minWidth: '150px',
                  }}
                />
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    background: '#7f1d1d', color: '#fca5a5', border: '1px solid #ef4444',
                    padding: '0.35rem 0.9rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
                  }}
                >
                  {deleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
                <button
                  onClick={() => setShowDelete(false)}
                  style={{
                    background: 'transparent', color: '#888', border: '1px solid #444',
                    padding: '0.35rem 0.9rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {showMeta && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.75rem', background: '#1a1a2e', borderRadius: '6px', border: '1px solid #334155' }}>
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
        </div>
      )}

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
          {match.has_replay && (
            <a
              href={`/api/replays/${match.match_id}/download`}
              download
              title="Download the .dem replay file for this match"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)',
                color: '#818cf8', borderRadius: 8, padding: '2px 10px',
                fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer',
              }}
            >
              ⬇ Download Replay
            </a>
          )}
        </div>
      </div>

      <DraftDisplay draft={match.draft} />

      <TeamTable players={radiant} teamName="radiant" isWinner={match.radiant_win === true} matchId={matchId} onPositionUpdate={handlePositionUpdate} laneOutcomes={laneOutcomes} />
      <TeamTable players={dire} teamName="dire" isWinner={match.radiant_win === false} matchId={matchId} onPositionUpdate={handlePositionUpdate} laneOutcomes={laneOutcomes} />

      <ExpandedStats players={allPlayers} />
      <PudgeHookStats players={allPlayers} matchId={matchId} />

      <TimelineGraph timeline={match.game_timeline} allPlayers={allPlayers} />

      <BuildingDeathsPanel timeline={match.game_timeline} />
      <DamageBreakdownPanel players={allPlayers} />
      <AegisEventsPanel timeline={match.game_timeline} allPlayers={allPlayers} />
      <TeamAbilitiesPanel teamAbilities={match.team_abilities} radiantWin={match.radiant_win} />
      <SmokePerPlayerPanel timeline={match.game_timeline} allPlayers={allPlayers} />
      <PowerSpikesPanel timeline={match.game_timeline} allPlayers={allPlayers} />
      <NWSwingPanel timeline={match.game_timeline} allPlayers={allPlayers} />

      <KillFeedPanel timeline={match.game_timeline} allPlayers={allPlayers} />
      <KillHeatmapPanel timeline={match.game_timeline} allPlayers={allPlayers} />
      <TeamfightPanel timeline={match.game_timeline} allPlayers={allPlayers} />
      <SupportReportPanel players={allPlayers} timeline={match.game_timeline} />
      <WardMapPanel players={allPlayers} />
      <DeathTimingPanel timeline={match.game_timeline} allPlayers={allPlayers} duration={match.duration} />
      <ComebackMetricPanel timeline={match.game_timeline} allPlayers={allPlayers} />

      <MatchNotes matchId={matchId} isAdmin={isAdmin} adminKey={adminKey} />

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

    </div>
  );
}
