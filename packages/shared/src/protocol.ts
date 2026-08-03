import type { LeaderboardEntry, PlayerKind, Vec2 } from './entities.js';

export interface JoinOptions {
  playerId: string;
  displayName: string;
  skinId?: string;
  guildId?: string;
  channelId?: string;
}

export interface PlayerMovementMessage {
  sequence: number;
  angle: number;
  clientTime: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  kind: PlayerKind;
  skinId: string;
  color: number;
  territoryKey: number;
  x: number;
  y: number;
  angle: number;
  kills: number;
  deaths: number;
  alive: boolean;
  moving: boolean;
  protected: boolean;
  respawnAt: number;
  acknowledgedMovement: number;
  territoryCells: number;
  drawing: boolean;
  trail: Vec2[];
}

export interface WorldMetadata {
  leaderboard: LeaderboardEntry[];
  humanCount: number;
  botCount: number;
  claimableCells: number;
}

export interface WorldInit extends WorldMetadata {
  serverTime: number;
  tick: number;
  selfId: string;
  arenaRadius: number;
  gridSize: number;
  cellSize: number;
  players: PlayerSnapshot[];
  territoryRevision: number;
  territoryData: string;
}

export interface WorldDelta extends WorldMetadata {
  serverTime: number;
  tick: number;
  players: PlayerSnapshot[];
  territoryRevision: number;
  territoryData?: string;
}

export interface WelcomeMessage {
  playerId: string;
  arenaRadius: number;
}

export interface DeathMessage {
  reason: 'trail' | 'boundary' | 'invalid-state';
  killerName?: string;
  respawnAt: number;
}

export interface ServerNotice {
  message: string;
  level: 'info' | 'warning' | 'error';
}

export const MESSAGE = {
  ready: 'ready',
  movement: 'movement',
  worldInit: 'world-init',
  worldDelta: 'world-delta',
  welcome: 'welcome',
  death: 'death',
  notice: 'notice'
} as const;
