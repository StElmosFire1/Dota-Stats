import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSteamAuth } from '../context/SteamAuthContext';
import {
  getNotificationFeed,
  getNotificationUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../api';

// Task #613 — in-website notification center.
// Bell icon + unread badge in the top nav (signed-in only). Clicking opens a
// dropdown feed of the user's notifications, newest first, with per-item and
// "mark all read" actions and links to the related page. Polling/refresh-on-
// open only (no websocket push) per the v1 scope.

const POLL_MS = 60000;

function timeAgo(ts) {
  if (!ts) return '';
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function NotificationBell() {
  const { steamUser } = useSteamAuth() || {};
  const accountId = steamUser?.accountId;
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const wrapRef = useRef(null);

  // Lightweight unread-count poll while signed in.
  const pollUnread = useCallback(async () => {
    if (!accountId) return;
    try {
      const d = await getNotificationUnreadCount();
      if (!d.unauthenticated) setUnread(d.count || 0);
    } catch (_) { /* keep last known count */ }
  }, [accountId]);

  useEffect(() => {
    if (!accountId) { setUnread(0); setItems([]); return; }
    pollUnread();
    const t = setInterval(pollUnread, POLL_MS);
    return () => clearInterval(t);
  }, [accountId, pollUnread]);

  // Full feed load — on open and after actions.
  const loadFeed = useCallback(async () => {
    if (!accountId) return;
    setLoading(true); setError(null);
    try {
      const d = await getNotificationFeed({ limit: 30 });
      if (d.unauthenticated) { setItems([]); setUnread(0); }
      else { setItems(d.items || []); setUnread(d.unreadCount || 0); }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [accountId]);

  // Close on route change.
  useEffect(() => { setOpen(false); }, [location]);

  // Outside click / Escape to close.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleOpen = () => {
    setOpen(o => {
      const next = !o;
      if (next) loadFeed();
      return next;
    });
  };

  const onItemActivate = async (n) => {
    if (!n.read_at) {
      setItems(prev => prev.map(x => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread(u => Math.max(0, u - 1));
      try { const d = await markNotificationRead(n.id); if (typeof d.unreadCount === 'number') setUnread(d.unreadCount); }
      catch (_) { /* optimistic */ }
    }
    if (n.link) {
      setOpen(false);
      if (/^https?:\/\//i.test(n.link)) window.location.href = n.link;
      else navigate(n.link);
    }
  };

  const onMarkAll = async () => {
    setItems(prev => prev.map(x => (x.read_at ? x : { ...x, read_at: new Date().toISOString() })));
    setUnread(0);
    try { const d = await markAllNotificationsRead(); if (typeof d.unreadCount === 'number') setUnread(d.unreadCount); }
    catch (_) { /* optimistic */ }
  };

  if (!accountId) return null;

  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', marginLeft: 4 }}>
      <button
        type="button"
        className="btn btn-small"
        onClick={toggleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        title="Notifications"
        style={{ position: 'relative', opacity: 0.9 }}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: -6, right: -6,
              minWidth: 16, height: 16, padding: '0 4px',
              borderRadius: 9, background: 'var(--amber, #f59e0b)',
              color: '#1a1a1a', fontSize: 10, fontWeight: 700,
              lineHeight: '16px', textAlign: 'center',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
            }}
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 8, width: 340, maxWidth: '90vw', zIndex: 1000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px', borderBottom: '1px solid var(--border)',
          }}>
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            <button
              type="button"
              className="btn btn-small"
              onClick={onMarkAll}
              disabled={unread === 0}
              style={{ fontSize: 11, opacity: unread === 0 ? 0.5 : 1 }}
            >
              Mark all read
            </button>
          </div>

          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loading && <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
            {error && <div style={{ padding: 16, fontSize: 13, color: 'crimson' }}>{error}</div>}
            {!loading && !error && items.length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>You&apos;re all caught up.</div>
            )}
            {!loading && !error && items.map(n => {
              const clickable = !!n.link;
              const unreadRow = !n.read_at;
              const commonStyle = {
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 12px', border: 'none',
                borderBottom: '1px solid var(--border)',
                background: unreadRow ? 'var(--bg-hover, rgba(245,158,11,0.06))' : 'transparent',
                cursor: clickable ? 'pointer' : 'default',
                color: 'var(--text-primary)',
              };
              const content = (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    {unreadRow && (
                      <span aria-hidden="true" style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: 'var(--amber, #f59e0b)', flex: '0 0 auto', marginTop: 5,
                      }} />
                    )}
                    <span style={{ fontWeight: unreadRow ? 700 : 500, fontSize: 13, flex: 1 }}>{n.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: '0 0 auto' }}>{timeAgo(n.created_at)}</span>
                  </div>
                  {n.body && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, marginLeft: unreadRow ? 15 : 0 }}>
                      {n.body}
                    </div>
                  )}
                </>
              );
              if (clickable) {
                return (
                  <button
                    key={n.id}
                    type="button"
                    role="menuitem"
                    onClick={() => onItemActivate(n)}
                    style={commonStyle}
                  >
                    {content}
                  </button>
                );
              }
              return (
                <div key={n.id} role="menuitem" style={commonStyle}>
                  {content}
                  {unreadRow && (
                    <div style={{ marginTop: 6, marginLeft: 15 }}>
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => onItemActivate(n)}
                        style={{ fontSize: 11 }}
                      >
                        Mark read
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </span>
  );
}
