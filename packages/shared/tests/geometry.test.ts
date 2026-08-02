import { describe, expect, it } from 'vitest';
import { advancePlayer, GAME, normalizeAngle, rotateTowards } from '../src/index.js';

describe('shared movement geometry', () => {
  it('normalizes angles and rejects non-finite input', () => {
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(Number.NaN)).toBe(0);
  });

  it('limits turning and moves at the configured speed', () => {
    const next = advancePlayer({ x: 0, y: 0, angle: 0 }, Math.PI / 2, 0.1);
    expect(next.angle).toBeCloseTo(GAME.maximumTurnRate * 0.1);
    expect(Math.hypot(next.x, next.y)).toBeCloseTo(GAME.playerSpeed * 0.1);
    expect(rotateTowards(0, -Math.PI / 2, 0.3)).toBeCloseTo(-0.3);
  });
});
