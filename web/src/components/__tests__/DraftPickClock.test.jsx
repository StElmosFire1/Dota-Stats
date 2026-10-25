import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DraftPickClock from '../DraftPickClock';
import { normalizePreferredRoles } from '../../utils/preferredRoles';

afterEach(() => { cleanup(); vi.useRealTimers(); });
it('holds the pick clock for ten seconds but explicitly allows picks during the lead-in', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
  const start = '2026-10-25T00:00:10Z', deadline = '2026-10-25T00:00:40Z';
  render(<DraftPickClock startsAt={start} deadlineAt={deadline} seconds={30} isMyTurn />);
  expect(screen.getByText('Timer starts in 10s')).toBeTruthy();
  expect(screen.getByText(/you can pick now/)).toBeTruthy();
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.getByText('30s')).toBeTruthy();
  act(() => vi.advanceTimersByTime(30000));
  expect(screen.getByText('Auto-pick pending')).toBeTruthy();
});
it('advances immediately when a pick is made during grace and keeps a complete clock footprint', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
  const view = render(<DraftPickClock startsAt="2026-10-25T00:00:10Z" deadlineAt="2026-10-25T00:00:40Z" />);
  act(() => vi.advanceTimersByTime(3000));
  view.rerender(<DraftPickClock startsAt="2026-10-25T00:00:13Z" deadlineAt="2026-10-25T00:00:43Z" />);
  expect(screen.getByText('Timer starts in 10s')).toBeTruthy();
  view.rerender(<DraftPickClock complete />);
  expect(screen.getByText('All picks recorded')).toBeTruthy();
  expect(document.querySelector('.pb-draft-clock-track')).toBeTruthy();
});
it('starts later turns immediately even when they arrive between clock ticks', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
  const view = render(<DraftPickClock startsAt="2026-10-25T00:00:10Z" deadlineAt="2026-10-25T00:00:40Z" seconds={30} />);
  vi.setSystemTime(new Date('2026-10-25T00:00:00.035Z'));
  view.rerender(<DraftPickClock startsAt="2026-10-25T00:00:00.035Z" deadlineAt="2026-10-25T00:00:30.035Z" seconds={30} />);
  expect(screen.queryByText(/Timer starts in/)).toBeNull();
  expect(screen.getByText('30s')).toBeTruthy();
});
it('normalizes real role storage formats, including PostgreSQL bot array text', () => {
  for (const value of ['2,3', '["2","3"]', '{"2","3"}', [2, 3], ['2', '3']]) {
    expect(normalizePreferredRoles(value)).toEqual(['Mid', 'Offlane']);
  }
  expect(normalizePreferredRoles(null)).toEqual([]);
  expect(normalizePreferredRoles('1,1,5')).toEqual(['Carry', 'Hard support']);
});
