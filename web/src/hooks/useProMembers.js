import { useState, useEffect } from 'react';
import { getProMembers } from '../api';

let cached = null;
let cacheAt = 0;
const TTL_MS = 60_000;

export default function useProMembers() {
  const [memberSet, setMemberSet] = useState(cached || new Set());

  useEffect(() => {
    if (cached && Date.now() - cacheAt < TTL_MS) return;
    let cancelled = false;
    getProMembers()
      .then(d => {
        if (cancelled) return;
        const set = new Set((d?.member_ids || []).map(String));
        cached = set;
        cacheAt = Date.now();
        setMemberSet(set);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return memberSet;
}
