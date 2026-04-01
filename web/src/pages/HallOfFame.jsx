import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getHallOfFame } from '../api';
import { useSeason } from '../context/SeasonContext';
import HeroIcon from '../components/HeroIcon';

function formatHero(name) {
  if (!name) return '—';
  return name.replace('npc_dota_hero_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function RecordCard({ title, emoji, record }) {
  if (!record) return null;
  const val = typeof record.value === 'number' && record.value > 1000
    ? record.value.toLocaleString()
    : record.value;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 20px', minWidth: 200, flex: '1 1 200px',
    }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{emoji}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--gold)', lineHeight: 1 }}>{val}</div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <HeroIcon heroName={record.hero_name} size="sm" />
        <div>
          <Link to={`/player/${record.account_id}`} style={{ fontWeight: 600, color: 'var(--accent)', fontSize: 14 }}>
            {record.persona_name}
          </Link>
          {record.match_id && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              <Link to={`/match/${record.match_id}`} style={{ color: 'var(--text-muted)' }}>Match #{record.match_id}</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const RECORD_META = [
  { key: 'kills', emoji: '⚔️', title: 'Most Kills (Single Match)' },
  { key: 'deaths', emoji: '💀', title: 'Most Deaths (Single Match)' },
  { key: 'assists', emoji: '🤝', title: 'Most Assists (Single Match)' },
  { key: 'gpm', emoji: '💰', title: 'Highest GPM' },
  { key: 'xpm', emoji: '⚡', title: 'Highest XPM' },
  { key: 'hero_damage', emoji: '🔥', title: 'Most Hero Damage' },
  { key: 'hero_healing', emoji: '💚', title: 'Most Healing' },
  { key: 'tower_damage', emoji: '🏯', title: 'Most Tower Damage' },
  { key: 'net_worth', emoji: '💎', title: 'Highest Net Worth' },
  { key: 'last_hits', emoji: '🎯', title: 'Most Last Hits' },
];

export default function HallOfFame() {
  const { seasonId } = useSeason();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('records');

  useEffect(() => {
    setLoading(true);
    getHallOfFame(seasonId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [seasonId]);

  if (loading) return <div className="loading">Loading Hall of Fame…</div>;
  if (!data) return <div className="error-state">Failed to load Hall of Fame data.</div>;

  const { records, career } = data;
  const tabs = [
    { id: 'records', label: '🏅 Match Records' },
    { id: 'career', label: '📊 Career Rankings' },
  ];

  return (
    <div>
      <h1 className="page-title">🏆 Hall of Fame</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
        All-time single-match records and career achievements for the OCE Inhouse community.
      </p>

      <div className="tabs" style={{ marginBottom: 24 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'records' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {RECORD_META.map(m => (
            <RecordCard key={m.key} title={m.title} emoji={m.emoji} record={records[m.key]} />
          ))}
        </div>
      )}

      {tab === 'career' && (
        <div>
          <div style={{ overflowX: 'auto' }}>
            <table className="scoreboard" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th style={{ textAlign: 'left' }}>Player</th>
                  <th>Games</th>
                  <th>Wins</th>
                  <th>Losses</th>
                  <th>Win%</th>
                  <th>Avg KDA</th>
                  <th>Avg GPM</th>
                  <th>Total Kills</th>
                </tr>
              </thead>
              <tbody>
                {career.map((p, i) => {
                  const wr = p.games > 0 ? ((p.wins / p.games) * 100).toFixed(0) : 0;
                  const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
                  return (
                    <tr key={p.account_id}>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{medal}</td>
                      <td>
                        <Link to={`/player/${p.account_id}`} style={{ fontWeight: 600 }}>
                          {p.display_name}
                        </Link>
                      </td>
                      <td className="col-stat">{p.games}</td>
                      <td className="col-stat" style={{ color: 'var(--radiant-color)' }}>{p.wins}</td>
                      <td className="col-stat" style={{ color: 'var(--dire-color)' }}>{p.losses}</td>
                      <td className="col-stat" style={{
                        color: wr >= 60 ? 'var(--radiant-color)' : wr >= 45 ? 'var(--text-primary)' : 'var(--dire-color)',
                        fontWeight: 600,
                      }}>{wr}%</td>
                      <td className="col-stat">{parseFloat(p.avg_kda).toFixed(2)}</td>
                      <td className="col-stat">{p.avg_gpm}</td>
                      <td className="col-stat">{parseInt(p.total_kills).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
