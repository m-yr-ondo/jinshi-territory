import { describe, expect, it } from 'vitest';
import { DeltaBuilder } from '../src/networking/DeltaBuilder.js';
import { ArenaSimulation } from '../src/simulation/ArenaSimulation.js';

describe('territory networking', () => {
  it('sends territory on initialization and only after its revision changes', () => {
    const simulation = new ArenaSimulation({ seed: 71 });
    simulation.start(1000);
    simulation.addHuman('human', { playerId: 'human_001', displayName: 'Human' }, 1000);
    const builder = new DeltaBuilder(simulation);
    const first = builder.forClient('human', 1100);
    expect(first.kind).toBe('init');
    if (first.kind !== 'init') return;
    expect(first.payload.territoryData.length).toBeGreaterThan(100);
    expect(first.payload.players.length).toBeGreaterThan(1);

    const second = builder.forClient('human', 1200);
    expect(second.kind).toBe('delta');
    if (second.kind !== 'delta') return;
    expect(second.payload.territoryData).toBeUndefined();

    const player = simulation.players.get('human')!;
    simulation.territory.createStartingTerritory(player.territoryKey, { x: 0, y: 0 });
    const third = builder.forClient('human', 1300);
    expect(third.kind).toBe('delta');
    if (third.kind === 'delta') expect(third.payload.territoryData).toBeTruthy();
  });
});
