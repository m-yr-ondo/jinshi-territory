import { GAME, type PlayerSnapshot } from '@jinshi-territory/shared';
import { describe, expect, it } from 'vitest';
import { BufferedPlayer } from '../src/game/BufferedPlayer.js';

function player(x = 0): PlayerSnapshot {
  return {
    id: 'player',
    name: 'Player',
    kind: 'human',
    skinId: 'neon-cyan',
    color: 0x55d7ff,
    territoryKey: 1,
    x,
    y: 0,
    angle: 0,
    kills: 0,
    deaths: 0,
    alive: true,
    moving: true,
    protected: false,
    respawnAt: 0,
    acknowledgedMovement: 0,
    territoryCells: 50,
    drawing: false,
    trail: []
  };
}

describe('buffered player rendering', () => {
  it('interpolates remote movement', () => {
    const buffered = new BufferedPlayer(player(0), 1000);
    buffered.ingest(player(100), 1100, false);
    const rendered = buffered.render(1050 + GAME.interpolationDelayMs, 0, false);
    expect(rendered.x).toBeCloseTo(50);
  });

  it('predicts local movement immediately', () => {
    const buffered = new BufferedPlayer(player(0), 1000);
    const rendered = buffered.render(1000, 0.1, true, 0);
    expect(rendered.x).toBeCloseTo(GAME.playerSpeed * 0.05);
  });

  it('does not predict movement before the server enables a fresh spawn', () => {
    const buffered = new BufferedPlayer({ ...player(0), moving: false }, 1000);
    const rendered = buffered.render(1000, 0.1, true, 0);
    expect(rendered.x).toBe(0);
    buffered.markDead(3000);
    expect(buffered.render(1100, 0.1, true, 0).alive).toBe(false);
  });
});
