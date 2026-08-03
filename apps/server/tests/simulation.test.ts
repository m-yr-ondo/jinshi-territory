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
    player.moving = true;
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

  it('uses a 60% larger arena and keeps humans centered until fresh input', () => {
    expect(GAME.arenaRadius).toBe(1600);
    expect(GAME.gridSize).toBe(208);
    const simulation = new ArenaSimulation({ seed: 60, botTarget: 0 });
    simulation.start(1000);
    const player = simulation.addHuman(
      'centered',
      { playerId: 'centered_001', displayName: 'Centered' },
      1000
    );
    const spawn = { x: player.x, y: player.y };
    const spawnCell = simulation.territory.worldToIndex(player.x, player.y);
    expect(simulation.territory.center(spawnCell)).toEqual(spawn);
    expect(player.moving).toBe(false);

    for (let tick = 0; tick < 30; tick += 1)
      simulation.step(1 / GAME.tickRate, 1100 + tick * (1000 / GAME.tickRate));
    expect({ x: player.x, y: player.y }).toEqual(spawn);

    expect(
      simulation.applyMovement(player.id, { sequence: 1, angle: 0, clientTime: 2200 }, 2200)
    ).toBe(true);
    simulation.step(1 / GAME.tickRate, 2234);
    expect(player.x).not.toBe(spawn.x);
  });

  it('kills an enemy immediately when their exposed trail is crossed', () => {
    const simulation = new ArenaSimulation({ seed: 70, botTarget: 0 });
    simulation.start(1000);
    const attacker = simulation.addHuman(
      'attacker',
      { playerId: 'attacker_001', displayName: 'Attacker' },
      1000
    );
    const victim = simulation.addHuman(
      'victim',
      { playerId: 'victim_001', displayName: 'Victim' },
      1000
    );
    attacker.x = -3;
    attacker.y = 0;
    attacker.angle = 0;
    attacker.targetAngle = 0;
    attacker.moving = true;
    victim.x = 0;
    victim.y = 30;
    victim.moving = false;
    victim.drawing = true;
    victim.trail = [
      { x: 0, y: -30 },
      { x: 0, y: 30 }
    ];

    simulation.step(1 / GAME.tickRate, 2000);
    expect(victim.alive).toBe(false);
    expect(attacker.alive).toBe(true);
    expect(attacker.kills).toBe(1);
  });

  it('kills a player who crosses an older segment of their own exposed trail', () => {
    const simulation = new ArenaSimulation({ seed: 80, botTarget: 0 });
    simulation.start(1000);
    const player = simulation.addHuman(
      'self-cutter',
      { playerId: 'self_cutter_001', displayName: 'Self Cutter' },
      1000
    );
    player.x = -3;
    player.y = 0;
    player.angle = 0;
    player.targetAngle = 0;
    player.moving = true;
    player.drawing = true;
    player.trail = [
      { x: 0, y: -30 },
      { x: 0, y: 30 },
      { x: 40, y: 30 },
      { x: 40, y: 50 },
      { x: -40, y: 50 },
      { x: -40, y: 0 },
      { x: -3, y: 0 }
    ];

    simulation.step(1 / GAME.tickRate, 2000);
    expect(player.alive).toBe(false);
    expect(player.deaths).toBe(1);
  });
});
