import { GAME, PLAYER_SKINS } from '@jinshi-territory/shared';
import { describe, expect, it, vi } from 'vitest';
import { ArenaSimulation } from '../src/simulation/ArenaSimulation.js';

function create(seed = 12) {
  const onDeath = vi.fn();
  const simulation = new ArenaSimulation({ seed, onDeath });
  simulation.start(1000);
  simulation.addHuman('human', { playerId: 'human_001', displayName: 'Human' }, 1000);
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

  it('creates normal starting territory and assigns a server-selected color', () => {
    const { simulation } = create(20);
    const player = simulation.players.get('human')!;
    expect(player.territoryCells).toBe(GAME.startingTerritoryCells);
    expect(
      PLAYER_SKINS.some((skin) => skin.id === player.skinId && skin.color === player.color)
    ).toBe(true);
  });

  it('starts four established bots at 2x, 3x, 4x and 5x normal territory', () => {
    const simulation = new ArenaSimulation({ seed: 25 });
    simulation.start(1000);
    const territoryByName = new Map(
      [...simulation.players.values()]
        .filter((player) => player.kind === 'bot')
        .map((player) => [player.name, player.territoryCells])
    );

    expect(territoryByName.get('Atlas')).toBe(GAME.startingTerritoryCells * 2);
    expect(territoryByName.get('Canvas')).toBe(GAME.startingTerritoryCells * 3);
    expect(territoryByName.get('Mosaic')).toBe(GAME.startingTerritoryCells * 4);
    expect(territoryByName.get('Pixel')).toBe(GAME.startingTerritoryCells * 5);

    for (const name of ['Inkwell', 'Patch', 'Doodle', 'Vector', 'Saffron', 'Indigo', 'Stencil', 'Contour'])
      expect(territoryByName.get(name)).toBe(GAME.startingTerritoryCells);
  });

  it('eliminates a player at the circular boundary and respawns them normally', () => {
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
    expect(player.territoryCells).toBe(GAME.startingTerritoryCells);
  });

  it('removes the established advantage after an established bot dies', () => {
    const simulation = new ArenaSimulation({ seed: 35 });
    simulation.start(1000);
    const atlas = [...simulation.players.values()].find((player) => player.name === 'Atlas')!;
    expect(atlas.territoryCells).toBe(GAME.startingTerritoryCells * 2);

    atlas.x = GAME.arenaRadius - 1;
    atlas.y = 0;
    atlas.angle = 0;
    atlas.targetAngle = 0;
    atlas.moving = true;
    simulation.step(1 / GAME.tickRate, 2000);
    expect(atlas.alive).toBe(false);

    simulation.step(1 / GAME.tickRate, 2000 + GAME.respawnDelayMs);
    expect(atlas.alive).toBe(true);
    expect(atlas.territoryCells).toBe(GAME.startingTerritoryCells);
  });

  it('maintains the configured bot population', () => {
    const { simulation } = create(40);
    expect(simulation.botCount).toBe(GAME.botTarget);
    expect(new Set([...simulation.players.values()].map((player) => player.skinId)).size).toBe(
      simulation.players.size
    );
    expect(simulation.leaderboard()).toHaveLength(5);
    expect(simulation.leaderboard().every((entry) => Number.isInteger(entry.color))).toBe(true);
    expect(
      [...simulation.players.values()]
        .filter((player) => player.kind === 'bot')
        .every((player) => PLAYER_SKINS.some((skin) => skin.id === player.skinId))
    ).toBe(true);
  });

  it('holds a respawn still for one second even when input is already queued', () => {
    expect(GAME.spawnMovementDelayMs).toBe(1000);
    const simulation = new ArenaSimulation({ seed: 50, botTarget: 0 });
    simulation.start(1000);
    const player = simulation.addHuman(
      'delayed',
      { playerId: 'delayed_001', displayName: 'Delayed' },
      1000
    );
    player.x = GAME.arenaRadius - 1;
    player.y = 0;
    player.angle = 0;
    player.targetAngle = 0;
    player.moving = true;
    simulation.step(1 / GAME.tickRate, 2000);

    const respawnedAt = 2000 + GAME.respawnDelayMs;
    simulation.step(1 / GAME.tickRate, respawnedAt);
    const spawn = { x: player.x, y: player.y };
    expect(
      simulation.applyMovement(
        player.id,
        { sequence: 1, angle: 0, clientTime: respawnedAt },
        respawnedAt
      )
    ).toBe(true);

    simulation.step(1 / GAME.tickRate, respawnedAt + GAME.spawnMovementDelayMs - 1);
    expect({ x: player.x, y: player.y }).toEqual(spawn);
    expect(simulation.playerSnapshots(respawnedAt + GAME.spawnMovementDelayMs - 1)[0]?.moving).toBe(
      false
    );

    simulation.step(1 / GAME.tickRate, respawnedAt + GAME.spawnMovementDelayMs);
    expect({ x: player.x, y: player.y }).not.toEqual(spawn);
  });

  it('uses a 30% larger arena and keeps humans centered until fresh input', () => {
    expect(GAME.arenaRadius).toBe(1824);
    expect(GAME.gridSize).toBe(236);
    const simulation = new ArenaSimulation({ seed: 60, botTarget: 0 });
    simulation.start(1000);
    expect(simulation.territory.claimableCells).toBe(40_860);

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
