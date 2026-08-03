export interface Vec2 {
  x: number;
  y: number;
}

export type PlayerKind = 'human' | 'bot';

export interface PlayerEntity {
  id: string;
  playerId: string;
  name: string;
  kind: PlayerKind;
  skinId: string;
  color: number;
  territoryKey: number;
  x: number;
  y: number;
  angle: number;
  targetAngle: number;
  kills: number;
  deaths: number;
  alive: boolean;
  moving: boolean;
  protectedUntil: number;
  spawnedAt: number;
  respawnAt: number;
  lastMovementSequence: number;
  lastMovementAt: number;
  territoryCells: number;
  drawing: boolean;
  trail: Vec2[];
  trailCells: Set<number>;
  lastTrailCell: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  percentage: number;
  kills: number;
  kind: PlayerKind;
}
