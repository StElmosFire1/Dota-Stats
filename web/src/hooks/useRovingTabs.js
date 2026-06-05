import { useRef, useCallback } from 'react';

export default function useRovingTabs(tabs, onSelect) {
  const refs = useRef([]);

  const setRef = useCallback((i) => (el) => { refs.current[i] = el; }, []);

  const onKeyDown = useCallback((e, i) => {
    const last = tabs.length - 1;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = i === last ? 0 : i + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = i === 0 ? last : i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    onSelect(tabs[next].id, next);
    refs.current[next]?.focus();
  }, [tabs, onSelect]);

  return { setRef, onKeyDown };
}
