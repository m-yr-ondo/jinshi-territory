import { describe, expect, it, vi } from 'vitest';
import { FixedStepClock } from '../src/simulation/FixedStepClock.js';

describe('fixed simulation clock', () => {
  it('uses equal 30 Hz steps and schedules 30 Hz snapshots', () => {
    const step = vi.fn();
    const clock = new FixedStepClock(30, 30, 1000);
    const result = clock.advance(100, step);
    expect(result.steps).toBe(3);
    expect(result.snapshotDue).toBe(true);
    expect(step).toHaveBeenCalledTimes(3);
    for (const [delta] of step.mock.calls) expect(delta).toBeCloseTo(1 / 30);
  });

  it('caps catch-up work after a long host stall', () => {
    const step = vi.fn();
    const clock = new FixedStepClock(30, 30, 1000, 5);
    const result = clock.advance(1000, step);
    expect(result.steps).toBe(5);
    expect(result.discardedMs).toBeGreaterThan(800);
  });
});
