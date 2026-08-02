import { GAME, PLAYER_SKINS } from '@jinshi-territory/shared';
import { describe, expect, it, vi } from 'vitest';
import { ArenaSimulation } from '../src/simulation/ArenaSimulation.js';

function create(seed = 12) {
  const onDeath = vi.fn();
  const simulation = new ArenaSimulation({ seed, onDeath });
  simulation.start(1000);
  simulation.addHuman(
    'human',
    { playerId: 'human_001', displayName: 'Human', skinId: 'coral' },
    1000
  );
  return { simulation, onDeath };
}

describe('territory simulation', () => {
  it('uses server-authoritative movement input and rejects duplicates', () => {
    const { simulation } = create();
    const player = simulation.players.get('human')!;
    expect(
      simulation.applyMovement('human', { sequence: 1, angle: Math.PI / 2, clientTime: 1 }, 1100)
    ).toBe(true);
    expect(player.targetAngle).toBeCloseTo(Math.PI / 2);
    expect(simulation.applyMovement('human', { sequence: 1, angle: 0, clientTime: 2 }, 1200)).toBe(
      false
    );
    expect(
      simulation.applyMovement('human', { sequence: 2, angle: Number.NaN, clientTime: 3 }, 1300)
    ).toBe(false);
  });

  it('creates starting territory and preserves selected color', () => {
    const { simulation } = create(20);
    const player = simulation.players.get('human')!;
    expect(player.territoryCells).toBeGreaterThan(30);
    expect(player.skinId).toBe('coral');
    expect(player.color).toBe(PLAYER_SKINS.find((skin) => skin.id === 'coral')?.color);
  });

  it('eliminates a player at the circular boundary and respawns them', () => {
    const { simulation, onDeath } = create(30);
    const player = simulation.players.get('human')!;
    player.x = GAME.arenaRadius - 1;
    player.y = 0;
    player.angle = 0;
    player.targetAngle = 0;
    simulation.step(1 / GAME.tickRate, 2000);
    expect(player.alive).toBe(false);
    expect(player.territoryCells).toBe(0);
    expect(onDeath).toHaveBeenCalledOnce();
    simulation.step(1 / GAME.tickRate, 2000 + GAME.respawnDelayMs);
    expect(player.alive).toBe(true);
    expect(player.territoryCells).toBeGreaterThan(0);
  });

  it('maintains the configured bot population', () => {
    const { simulation } = create(40);
    expect(simulation.botCount).toBe(GAME.botTarget);
    expect(
      [...simulation.players.values()]
        .filter((player) => player.kind === 'bot')
        .every((player) => PLAYER_SKINS.some((skin) => skin.id === player.skinId))
    ).toBe(true);
  });
});
