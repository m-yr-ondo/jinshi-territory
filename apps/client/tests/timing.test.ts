import { GAME, type WorldInit } from '@jinshi-territory/shared';
import { describe, expect, it } from 'vitest';
import { WorldModel } from '../src/game/WorldModel.js';

describe('world model', () => {
  it('decodes territory bytes and creates movement messages', () => {
    const bytes = new Uint16Array([65_535, 0, 1, 2]);
    const encoded = btoa(String.fromCharCode(...new Uint8Array(bytes.buffer)));
    const initialization: WorldInit = {
      serverTime: 1000,
      tick: 0,
      selfId: 'self',
      arenaRadius: GAME.arenaRadius,
      gridSize: 2,
      cellSize: GAME.cellSize,
      players: [],
      territoryRevision: 1,
      territoryData: encoded,
      leaderboard: [],
      humanCount: 1,
      botCount: GAME.botTarget,
      claimableCells: 3
    };
    const model = new WorldModel();
    model.initialize(initialization, 1000);
    expect([...model.territory]).toEqual([65_535, 0, 1, 2]);
    expect(model.movement(4, Math.PI / 2, 1200)).toEqual({
      sequence: 4,
      angle: Math.PI / 2,
      clientTime: 1200
    });
  });
});
