import { GAME } from '@jinshi-territory/shared';
import { describe, expect, it } from 'vitest';
import { ArenaLifecycle } from '../src/lifecycle/ArenaLifecycle.js';
import { ArenaSimulation } from '../src/simulation/ArenaSimulation.js';

const identity = (number: number) => ({
  playerId: `player_${number.toString().padStart(3, '0')}`,
  displayName: `Player ${number}`
});

describe('arena lifecycle', () => {
  it('starts on first human and maintains the configured bot population', () => {
    const lifecycle = new ArenaLifecycle(() => new ArenaSimulation({ seed: 1 }));
    const simulation = lifecycle.join('one', identity(1), 1000);
    expect(simulation.running).toBe(true);
    expect(simulation.humanCount).toBe(1);
    expect(simulation.botCount).toBe(GAME.botTarget);
  });

  it('keeps one arena for later humans and disposes after the last leaves', () => {
    const lifecycle = new ArenaLifecycle(() => new ArenaSimulation({ seed: 2 }));
    const original = lifecycle.join('one', identity(1), 1000);
    expect(lifecycle.join('two', identity(2), 1000)).toBe(original);
    lifecycle.leave('one');
    expect(lifecycle.simulation).toBe(original);
    expect(original.humanCount).toBe(1);
    lifecycle.leave('two');
    expect(lifecycle.simulation).toBeUndefined();
    expect(original.running).toBe(false);
    expect(original.players.size).toBe(0);
  });

  it('creates a fresh world after complete shutdown', () => {
    const lifecycle = new ArenaLifecycle(() => new ArenaSimulation({ seed: 3 }));
    const first = lifecycle.join('one', identity(1));
    lifecycle.leave('one');
    const second = lifecycle.join('two', identity(2));
    expect(second).not.toBe(first);
    expect(second.humanCount).toBe(1);
    expect(second.botCount).toBe(GAME.botTarget);
  });
});
