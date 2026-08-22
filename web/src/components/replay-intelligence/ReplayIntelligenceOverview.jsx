import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const LABELS = {
  draft: 'Draft',
  laneOutcomes: 'Lane phase',
  fights: 'Team fights',
  objectiveLog: 'Objectives',
  visionSummary: 'Vision',
  runeSummary: 'Runes',
  teamAbilities: 'Team abilities',
  buybacking: 'Buybacks',
  coaching: 'Coaching',
};
const asArray = (value) => Array.isArray(value) ? value : [];
const timeOf = (item) => item?.t_seconds ?? item?.seconds ?? item?.time ?? item?.t ?? item?.start_s ?? item?.start_time ?? item?.start;
const fmt = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const s = Math.max(0, Math.round(n));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function EvidenceLink({ matchId, item, children }) {
  const time = fmt(timeOf(item));
  if (!time) return <span>{children}</span>;
  return <Link to={`/replay/${encodeURIComponent(matchId)}?t=${Math.round(Number(timeOf(item)))}`} title={`Open replay at ${time}`}>{children} <span className="ri-evidence-time">{time}</span></Link>;
}

function summarize(key, value) {
  const list = itemsFor(key, value);
  if (list.length) return `${list.length} recorded`;
  if (value && typeof value === 'object') {
    if (key === 'visionSummary') {
      const total = Number(value.totalWardsPlaced ?? value.total_wards_placed);
      if (Number.isFinite(total)) return `${total} wards placed`;
    }
    if (key === 'buybacking') {
      const total = Number(value.totalBuybacks ?? value.total_buybacks);
      if (Number.isFinite(total)) return `${total} buybacks`;
    }
    if (key === 'coaching' && Array.isArray(value.playerMetrics)) {
      return `${value.playerMetrics.length} player reviews`;
    }
    const count = value.count ?? value.total ?? value.events;
    if (Number.isFinite(Number(count))) return `${count} recorded`;
    return 'Available';
  }
  return value ? 'Available' : 'No data';
}

function itemsFor(key, value) {
  if (Array.isArray(value)) return value;
  if (key === 'draft') return asArray(value?.sequence);
  if (key === 'coaching') return asArray(value?.playerMetrics);
  if (key === 'buybacking') return asArray(value?.events);
  return [];
}

export default function ReplayIntelligenceOverview({ matchId, intelligence, publicContext = true }) {
  const [open, setOpen] = useState(false);
  const sections = useMemo(() => Object.keys(LABELS)
    .filter((key) => intelligence?.[key] != null && (key !== 'coaching' || !publicContext))
    .map((key) => ({ key, label: LABELS[key], value: intelligence[key] })), [intelligence, publicContext]);
  if (!intelligence || sections.length === 0) return null;
  const highlights = sections.filter((s) => s.key !== 'coaching').slice(0, 4);
  const evidence = highlights.flatMap((section) => itemsFor(section.key, section.value).slice(0, 2).map((item) => ({ section, item }))).slice(0, 4);
  return (
    <section className="ri-overview ri-panel" aria-label="Replay intelligence overview">
      <div className="ri-overview-head">
        <div><div className="ri-kicker">Replay intelligence</div><h2>What shaped this match</h2></div>
        <button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'Collapse' : 'Inspect evidence'}</button>
      </div>
      <p className="ri-overview-copy">A fast read of the parsed match record. Open an evidence marker to continue at the exact replay moment.</p>
      <div className="ri-overview-grid">
        {highlights.map(({ key, label, value }) => <div className="ri-overview-stat" key={key}><span>{label}</span><strong>{summarize(key, value)}</strong></div>)}
      </div>
      {open && <div className="ri-overview-detail">
        {evidence.length > 0 ? evidence.map(({ section, item }, index) => (
          <EvidenceLink key={`${section.key}-${index}`} matchId={matchId} item={item}>
            <span className="ri-evidence-label">{section.label}</span>{item?.summary || item?.label || item?.description || item?.type || 'Recorded event'}
          </EvidenceLink>
        )) : <span className="ri-private">This record has no timestamped evidence.</span>}
        {!publicContext && sections.some(s => s.key === 'coaching') && <div className="ri-private">Coaching context is visible only in its authorized review surface.</div>}
      </div>}
    </section>
  );
}