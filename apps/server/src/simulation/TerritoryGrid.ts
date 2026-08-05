import { GAME, type Vec2 } from '@jinshi-territory/shared';

const OUTSIDE = -1;

interface StartingCellCandidate {
  index: number;
  distanceSquared: number;
}

export class TerritoryGrid {
  readonly size = GAME.gridSize;
  readonly cellSize = GAME.cellSize;
  readonly cells = new Int16Array(this.size * this.size);
  readonly claimableCells: number;
  revision = 1;

  constructor() {
    let claimable = 0;
    const half = this.size / 2;
    const radiusCells = GAME.arenaRadius / this.cellSize;
    for (let row = 0; row < this.size; row += 1) {
      for (let column = 0; column < this.size; column += 1) {
        const dx = column + 0.5 - half;
        const dy = row + 0.5 - half;
        const index = row * this.size + column;
        if (dx * dx + dy * dy <= radiusCells * radiusCells) {
          this.cells[index] = 0;
          claimable += 1;
        } else {
          this.cells[index] = OUTSIDE;
        }
      }
    }
    this.claimableCells = claimable;
  }

  worldToIndex(x: number, y: number): number {
    const column = Math.floor(x / this.cellSize + this.size / 2);
    const row = Math.floor(y / this.cellSize + this.size / 2);
    if (column < 0 || row < 0 || column >= this.size || row >= this.size) return -1;
    const index = row * this.size + column;
    return this.cells[index] === OUTSIDE ? -1 : index;
  }

  center(index: number): Vec2 {
    const column = index % this.size;
    const row = Math.floor(index / this.size);
    return {
      x: (column + 0.5 - this.size / 2) * this.cellSize,
      y: (row + 0.5 - this.size / 2) * this.cellSize
    };
  }

  owner(index: number): number {
    return index < 0 || index >= this.cells.length ? OUTSIDE : (this.cells[index] ?? OUTSIDE);
  }

  canCreateStartingTerritory(
    position: Vec2,
    targetCells: number = GAME.startingTerritoryCells
  ): boolean {
    const footprint = this.startingTerritoryFootprint(position, targetCells);
    return (
      footprint.length === Math.max(1, Math.floor(targetCells)) &&
      footprint.every((index) => this.cells[index] === 0)
    );
  }

  createStartingTerritory(
    key: number,
    position: Vec2,
    targetCells: number = GAME.startingTerritoryCells
  ): number {
    const footprint = this.startingTerritoryFootprint(position, targetCells);
    let claimed = 0;

    for (const index of footprint) {
      if (this.cells[index] !== 0 && this.cells[index] !== key) continue;
      if (this.cells[index] === key) continue;
      this.cells[index] = key;
      claimed += 1;
    }

    if (claimed > 0) this.revision += 1;
    return claimed;
  }

  clearOwner(key: number): boolean {
    let changed = false;
    for (let index = 0; index < this.cells.length; index += 1) {
      if (this.cells[index] !== key) continue;
      this.cells[index] = 0;
      changed = true;
    }
    if (changed) this.revision += 1;
    return changed;
  }

  closeLoop(key: number, trail: Set<number>): number {
    if (trail.size < 2) return 0;
    const visited = new Uint8Array(this.cells.length);
    const queue = new Int32Array(this.cells.length);
    let read = 0;
    let write = 0;

    for (let index = 0; index < this.cells.length; index += 1) {
      if (this.cells[index] === OUTSIDE || this.cells[index] === key || trail.has(index)) continue;
      const column = index % this.size;
      const row = Math.floor(index / this.size);
      if (
        row === 0 ||
        column === 0 ||
        row === this.size - 1 ||
        column === this.size - 1 ||
        this.neighborIsOutside(index)
      ) {
        visited[index] = 1;
        queue[write++] = index;
      }
    }

    while (read < write) {
      const index = queue[read++] ?? -1;
      const column = index % this.size;
      const neighbors = [index - this.size, index + this.size];
      if (column > 0) neighbors.push(index - 1);
      if (column < this.size - 1) neighbors.push(index + 1);
      for (const next of neighbors) {
        if (
          next < 0 ||
          next >= this.cells.length ||
          visited[next] ||
          this.cells[next] === OUTSIDE ||
          this.cells[next] === key ||
          trail.has(next)
        )
          continue;
        visited[next] = 1;
        queue[write++] = next;
      }
    }

    let captured = 0;
    for (let index = 0; index < this.cells.length; index += 1) {
      if (this.cells[index] === OUTSIDE || this.cells[index] === key) continue;
      if (trail.has(index) || visited[index] === 0) {
        this.cells[index] = key;
        captured += 1;
      }
    }
    if (captured > 0) this.revision += 1;
    return captured;
  }

  countOwner(key: number): number {
    let count = 0;
    for (const owner of this.cells) if (owner === key) count += 1;
    return count;
  }

  nearestOwnedCell(key: number, position: Vec2): Vec2 | undefined {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.cells.length; index += 1) {
      if (this.cells[index] !== key) continue;
      const point = this.center(index);
      const dx = point.x - position.x;
      const dy = point.y - position.y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return bestIndex >= 0 ? this.center(bestIndex) : undefined;
  }

  encode(): string {
    const encoded = new Uint16Array(this.cells.length);
    for (let index = 0; index < this.cells.length; index += 1)
      encoded[index] = this.cells[index] === OUTSIDE ? 65_535 : (this.cells[index] ?? 0);
    return Buffer.from(encoded.buffer).toString('base64');
  }

  private startingTerritoryFootprint(position: Vec2, targetCells: number): number[] {
    const center = this.worldToIndex(position.x, position.y);
    if (center < 0) return [];

    const requested = Math.max(1, Math.floor(targetCells));
    const centerColumn = center % this.size;
    const centerRow = Math.floor(center / this.size);
    const searchRadius = Math.ceil(Math.sqrt(requested / Math.PI)) + 3;
    const candidates: StartingCellCandidate[] = [];

    for (let row = centerRow - searchRadius; row <= centerRow + searchRadius; row += 1) {
      for (
        let column = centerColumn - searchRadius;
        column <= centerColumn + searchRadius;
        column += 1
      ) {
        if (row < 0 || column < 0 || row >= this.size || column >= this.size) continue;
        const index = row * this.size + column;
        if (this.cells[index] === OUTSIDE) continue;
        const dx = column - centerColumn;
        const dy = row - centerRow;
        candidates.push({ index, distanceSquared: dx * dx + dy * dy });
      }
    }

    candidates.sort(
      (first, second) =>
        first.distanceSquared - second.distanceSquared || first.index - second.index
    );
    return candidates.slice(0, requested).map((candidate) => candidate.index);
  }

  private neighborIsOutside(index: number): boolean {
    const column = index % this.size;
    const row = Math.floor(index / this.size);
    return (
      (row > 0 && this.cells[index - this.size] === OUTSIDE) ||
      (row < this.size - 1 && this.cells[index + this.size] === OUTSIDE) ||
      (column > 0 && this.cells[index - 1] === OUTSIDE) ||
      (column < this.size - 1 && this.cells[index + 1] === OUTSIDE)
    );
  }
}
