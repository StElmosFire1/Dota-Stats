import { describe, it, expect } from 'vitest';
import { deriveKillSeries } from '../killSeries';

const kill = (t, victimSlot) => ({ t, type: 'kill', victimSlot, killerSlot: 0, assistSlots: [] });

describe('deriveKillSeries', () => {
  it('returns null when there is no timeline or no events array', () => {
    expect(deriveKillSeries(null, 100)).toBeNull();
    expect(deriveKillSeries({}, 100)).toBeNull();
    expect(deriveKillSeries({ events: 'nope' }, 100)).toBeNull();
  });

  it('returns null when there are zero valid kill events', () => {
    expect(deriveKillSeries({ events: [] }, 100)).toBeNull();
    expect(deriveKillSeries({ events: [{ t: 5, type: 'roshan' }] }, 100)).toBeNull();
    // kill events with missing/invalid t or victimSlot are skipped
    expect(deriveKillSeries({ events: [kill('x', 3), kill(10, -1), kill(10, 12)] }, 100)).toBeNull();
  });

  it('renders a series for a single valid kill (short/abandoned matches)', () => {
    const s = deriveKillSeries({ events: [kill(30, 7)] }, 120);
    expect(s).not.toBeNull();
    // zero baseline, one change, final hold to duration
    expect(s.points).toEqual([{ t: 0, d: 0 }, { t: 30, d: 1 }, { t: 120, d: 1 }]);
    expect(s.endT).toBe(120);
  });

  it('victimSlot boundary: slot 4 is a Radiant death (-1), slot 5 a Dire death (+1)', () => {
    const s = deriveKillSeries({ events: [kill(10, 4), kill(20, 5)] }, 60);
    expect(s.points).toEqual([
      { t: 0, d: 0 }, { t: 10, d: -1 }, { t: 20, d: 0 }, { t: 60, d: 0 },
    ]);
  });

  it('accumulates a comeback series, skips invalid events, and tracks maxAbs', () => {
    const events = [
      kill(10, 1), kill(20, 2), kill(30, 3),        // Dire ahead by 3
      { t: 35, type: 'tower' },                     // ignored
      kill('bad', 5),                               // ignored
      kill(40, 6), kill(50, 7), kill(60, 8), kill(70, 9), // Radiant back +1
    ];
    const s = deriveKillSeries({ events }, 100);
    expect(s.maxAbs).toBe(3);
    expect(s.points[s.points.length - 1]).toEqual({ t: 100, d: 1 });
    expect(s.points).toHaveLength(1 + 7 + 1);
  });

  it('extends endT past duration when the last kill is later, and clamps negative t', () => {
    const s = deriveKillSeries({ events: [kill(-5, 5), kill(200, 6)] }, 100);
    expect(s.endT).toBe(200);
    expect(s.points[1].t).toBe(0); // clamped
  });
});
