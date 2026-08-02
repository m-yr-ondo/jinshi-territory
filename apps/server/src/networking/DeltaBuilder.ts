import { GAME, type WorldDelta, type WorldInit } from '@jinshi-territory/shared';
import type { ArenaSimulation } from '../simulation/ArenaSimulation.js';

interface ClientViewState {
  territoryRevision: number;
}

export type ClientWorldMessage =
  { kind: 'init'; payload: WorldInit } | { kind: 'delta'; payload: WorldDelta };

export class DeltaBuilder {
  private readonly clients = new Map<string, ClientViewState>();

  constructor(private readonly simulation: ArenaSimulation) {}

  forClient(playerId: string, now = Date.now()): ClientWorldMessage {
    const previous = this.clients.get(playerId);
    const common = {
      serverTime: now,
      tick: this.simulation.tick,
      players: this.simulation.playerSnapshots(now),
      territoryRevision: this.simulation.territory.revision,
      leaderboard: this.simulation.leaderboard(),
      humanCount: this.simulation.humanCount,
      botCount: this.simulation.botCount,
      claimableCells: this.simulation.territory.claimableCells
    };
    this.clients.set(playerId, { territoryRevision: this.simulation.territory.revision });

    if (!previous) {
      return {
        kind: 'init',
        payload: {
          ...common,
          selfId: playerId,
          arenaRadius: GAME.arenaRadius,
          gridSize: GAME.gridSize,
          cellSize: GAME.cellSize,
          territoryData: this.simulation.territory.encode()
        }
      };
    }

    const changed = previous.territoryRevision !== this.simulation.territory.revision;
    return {
      kind: 'delta',
      payload: {
        ...common,
        ...(changed ? { territoryData: this.simulation.territory.encode() } : {})
      }
    };
  }

  forgetClient(playerId: string): void {
    this.clients.delete(playerId);
  }

  clear(): void {
    this.clients.clear();
  }
}
