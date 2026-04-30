import { useState, useEffect, useCallback } from 'react';
import { getProStatus } from '../api';

let cached = null;
let cacheAt = 0;
const TTL_MS = 30_000;
const subscribers = new Set();

function notifyAll() {
  for (const fn of subscribers) {
    try { fn(cached); } catch (_) {}
  }
}

async function refresh() {
  try {
    const data = await getProStatus();
    cached = data;
    cacheAt = Date.now();
    notifyAll();
    return data;
  } catch (_) {
    cached = { signed_in: false, is_pro: false, gate_on: false, flag_state: 'off', subscription: null };
    cacheAt = Date.now();
    notifyAll();
    return cached;
  }
}

export function invalidateProStatus() {
  cached = null;
  cacheAt = 0;
}

export default function useProStatus() {
  const [status, setStatus] = useState(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    subscribers.add(setStatus);
    const fresh = !cached || (Date.now() - cacheAt) > TTL_MS;
    if (fresh) {
      setLoading(true);
      refresh().finally(() => setLoading(false));
    }
    return () => subscribers.delete(setStatus);
  }, []);

  const reload = useCallback(() => {
    invalidateProStatus();
    setLoading(true);
    return refresh().finally(() => setLoading(false));
  }, []);

  return { status, loading, reload };
}
