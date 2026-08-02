import { describe, expect, it } from 'vitest';
import { GAME } from '@jinshi-territory/shared';
import { TerritoryGrid } from '../src/simulation/TerritoryGrid.js';

describe('territory grid', () => {
  it('captures the region enclosed by a trail returning to owned land', () => {
    const grid = new TerritoryGrid();
    const key = 7;
    grid.createStartingTerritory(key, { x: 0, y: 0 });
    const center = GAME.gridSize / 2;
    const trail = new Set<number>();
    for (let column = center + 5; column <= center + 10; column += 1)
      trail.add(center * GAME.gridSize + column);
    for (let row = center + 1; row <= center + 4; row += 1)
      trail.add(row * GAME.gridSize + center + 10);
    for (let column = center + 9; column >= center + 1; column -= 1)
      trail.add((center + 4) * GAME.gridSize + column);

    const before = grid.countOwner(key);
    const captured = grid.closeLoop(key, trail);
    expect(captured).toBeGreaterThan(trail.size);
    expect(grid.countOwner(key)).toBeGreaterThan(before + trail.size);
  });

  it('encodes the complete ownership map for clients', () => {
    const grid = new TerritoryGrid();
    grid.createStartingTerritory(3, { x: 0, y: 0 });
    const decoded = Buffer.from(grid.encode(), 'base64');
    expect(decoded.byteLength).toBe(GAME.gridSize * GAME.gridSize * 2);
  });
});
