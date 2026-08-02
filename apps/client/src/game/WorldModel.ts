import type {
  PlayerMovementMessage,
  PlayerSnapshot,
  WorldDelta,
  WorldInit,
  WorldMetadata
} from '@jinshi-territory/shared';
import { BufferedPlayer } from './BufferedPlayer.js';

export class WorldModel {
  readonly players = new Map<string, BufferedPlayer>();
  selfId = '';
  arenaRadius = 0;
  gridSize = 0;
  cellSize = 0;
  territoryRevision = 0;
  territory = new Uint16Array();
  colors = new Map<number, number>();
  metadata: WorldMetadata = { leaderboard: [], humanCount: 0, botCount: 0, claimableCells: 1 };
  private clockOffset = 0;
  private clockReady = false;

  initialize(message: WorldInit, receivedAt = Date.now()): void {
    this.selfId = message.selfId;
    this.arenaRadius = message.arenaRadius;
    this.gridSize = message.gridSize;
    this.cellSize = message.cellSize;
    this.metadata = message;
    this.players.clear();
    for (const player of message.players)
      this.players.set(player.id, new BufferedPlayer(player, message.serverTime));
    this.rebuildColors(message.players);
    this.setTerritory(message.territoryRevision, message.territoryData);
    this.updateClock(message.serverTime, receivedAt);
  }

  apply(message: WorldDelta, receivedAt = Date.now()): void {
    this.updateClock(message.serverTime, receivedAt);
    const ids = new Set(message.players.map((player) => player.id));
    for (const player of message.players) {
      const existing = this.players.get(player.id);
      if (existing) existing.ingest(player, message.serverTime, player.id === this.selfId);
      else this.players.set(player.id, new BufferedPlayer(player, message.serverTime));
    }
    for (const id of this.players.keys()) if (!ids.has(id)) this.players.delete(id);
    this.metadata = message;
    this.rebuildColors(message.players);
    if (message.territoryData) this.setTerritory(message.territoryRevision, message.territoryData);
  }

  movement(sequence: number, targetAngle: number, clientTime = Date.now()): PlayerMovementMessage {
    return { sequence, angle: targetAngle, clientTime };
  }

  render(deltaSeconds: number, targetAngle?: number): PlayerSnapshot[] {
    const serverNow = Date.now() - this.clockOffset;
    return [...this.players.entries()].map(([id, player]) =>
      player.render(serverNow, deltaSeconds, id === this.selfId, targetAngle)
    );
  }

  private setTerritory(revision: number, encoded: string): void {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    this.territory = new Uint16Array(bytes.buffer);
    this.territoryRevision = revision;
  }

  private rebuildColors(players: PlayerSnapshot[]): void {
    this.colors = new Map(players.map((player) => [player.territoryKey, player.color]));
  }

  private updateClock(serverTime: number, receivedAt: number): void {
    const sample = receivedAt - serverTime;
    if (!this.clockReady) {
      this.clockOffset = sample;
      this.clockReady = true;
      return;
    }
    this.clockOffset = Math.min(this.clockOffset, sample) + (sample - this.clockOffset) * 0.01;
  }
}
