// Task #664 — Collection / locker (full edition only, oceinhouse.gg).
//
// Shows every collectible cosmetic in the catalog grouped by kind, with an
// owned / equipped / retired flag and an X-of-Y completion count overall and
// per group. Owned cosmetics can be equipped/unequipped here; the equipped
// state drives what renders on the profile header (avatar rings, banners,
// nameplate effects) and recap cards.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSteamAuth } from '../context/SteamAuthContext';
import { RARITY_COLORS } from '../profileCosmetics';
import CosmeticPreview from '../components/CosmeticPreview';
import { getLootboxCollection, equipCosmetic } from '../api';

const KIND_META = {
  avatar_ring:    { label: 'Avatar Rings' },
  profile_banner: { label: 'Profile Banners' },
  nameplate_fx:   { label: 'Nameplate Effects' },
  recap_skin:     { label: 'Recap Skins' },
};

function rarityColor(r) {
  return RARITY_COLORS[r] || 'var(--brass, #c5a975)';
}


export default function Collection() {
  const { steamUser } = useSteamAuth();
  const accountId = steamUser?.accountId;
  const signedIn = !!accountId;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const d = await getLootboxCollection();
      setData(d);
    } catch (e) {
      setError(e.message || 'Failed to load collection');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (signedIn) load(); else setLoading(false); /* eslint-disable-next-line */ }, [accountId]);

  async function toggleEquip(item) {
    if (busy) return;
    setBusy(item.sku);
    setNotice(null);
    try {
      const next = item.equipped ? '' : item.value;
      await equipCosmetic(item.kind, next);
      await load();
      setNotice({ kind: 'ok', text: item.equipped ? `Unequipped ${item.label}.` : `Equipped ${item.label}.` });
    } catch (e) {
      setNotice({ kind: 'error', text: e.message || 'Could not update equip' });
    } finally {
      setBusy(null);
    }
  }

  if (!signedIn) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-serif, inherit)' }}>My Collection</h1>
        <p style={{ color: 'var(--text-muted)' }}>Sign in with Steam to view and equip your cosmetics.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <h1 style={{ fontFamily: 'var(--font-serif, inherit)', fontSize: '2.4rem', margin: 0 }}>My Collection</h1>
          {data && (
            <span className="pb-num" style={{ fontSize: 20, color: 'var(--gold, #f59e0b)' }}>
              {data.collected} / {data.total} collected
            </span>
          )}
        </div>
        <p style={{ color: 'var(--text-muted)' }}>
          Equip a cosmetic to show it on your <Link to={accountId ? `/player/${accountId}` : '/'} style={{ color: 'var(--accent)' }}>profile</Link>.
          Earn more from <Link to="/lootbox" style={{ color: 'var(--accent)' }}>lootboxes</Link>.
        </p>
      </header>

      {notice && (
        <div role="status" style={{
          margin: '8px 0 16px', padding: '10px 14px', borderRadius: 8,
          border: `1px solid ${notice.kind === 'error' ? '#ef4444' : '#22c55e'}`,
          color: notice.kind === 'error' ? '#fca5a5' : '#86efac',
          background: 'rgba(0,0,0,0.2)',
        }}>{notice.text}</div>
      )}

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading collection…</p>}
      {error && <p style={{ color: '#fca5a5' }}>{error}</p>}

      {!loading && !error && data?.groups?.map((group) => (
        <section key={group.kind} style={{ marginBottom: 32 }}>
          <h2 style={{ fontFamily: 'var(--font-serif, inherit)', fontSize: '1.5rem', display: 'flex', gap: 10, alignItems: 'baseline' }}>
            {KIND_META[group.kind]?.label || group.kind}
            <span className="pb-num" style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              {group.collected} / {group.total}
            </span>
          </h2>
          <div style={{
            display: 'grid', gap: 12,
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          }}>
            {group.items.map((item) => {
              const locked = !item.owned;
              return (
                <div key={item.sku} style={{
                  background: 'var(--bg-card)', borderRadius: 12, padding: 14,
                  border: `1px solid ${item.equipped ? rarityColor(item.rarity) : 'var(--border)'}`,
                  opacity: locked ? 0.55 : 1,
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {item.owned ? <div style={{ width: '100%' }}><CosmeticPreview kind={item.kind} value={item.value} label={item.label} size="md" /></div>
                      : <span aria-hidden="true" style={{ fontSize: 28, opacity: 0.6 }}>🔒</span>}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: rarityColor(item.rarity), textTransform: 'capitalize' }}>
                      {item.rarity}
                      {item.boxExclusive ? ' · box-exclusive' : ''}
                      {item.retired ? ' · retired' : ''}
                    </div>
                  </div>
                  {item.owned ? (
                    <button
                      type="button"
                      onClick={() => toggleEquip(item)}
                      disabled={busy === item.sku}
                      aria-pressed={item.equipped}
                      style={{
                        marginTop: 'auto',
                        background: item.equipped ? 'transparent' : 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                        color: item.equipped ? 'var(--text-primary)' : '#1a1a1a',
                        border: item.equipped ? '1px solid var(--border)' : 'none',
                        fontWeight: 700, borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
                      }}
                      aria-label={item.equipped ? `Unequip ${item.label}` : `Equip ${item.label}`}
                    >
                      {busy === item.sku ? '…' : item.equipped ? 'Equipped ✓' : 'Equip'}
                    </button>
                  ) : (
                    <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                      {item.retired ? 'Retired — no longer drops' : 'Not yet unlocked'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
