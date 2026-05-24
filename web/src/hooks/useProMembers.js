import { useState, useEffect } from 'react';
import { getProMembers } from '../api';

// Task #318 — hook now also tracks founder_ids so callers can pick the brass
// Founder ProBadge variant. Returns a Set augmented with `.isFounder(id)`
// so existing `proMembers.has(id)` callsites keep working unchanged.
let cached = null;
let cacheAt = 0;
const TTL_MS = 60_000;

function buildSet(memberIds, founderIds) {
  const founderSet = new Set((founderIds || []).map(String));
  const set = new Set((memberIds || []).map(String));
  set.isFounder = (id) => founderSet.has(String(id));
  return set;
}

export default function useProMembers() {
  const [memberSet, setMemberSet] = useState(cached || buildSet([], []));

  useEffect(() => {
    if (cached && Date.now() - cacheAt < TTL_MS) return;
    let cancelled = false;
    getProMembers()
      .then(d => {
        if (cancelled) return;
        const set = buildSet(d?.member_ids, d?.founder_ids);
        cached = set;
        cacheAt = Date.now();
        setMemberSet(set);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return memberSet;
}
