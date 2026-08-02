export const GAME = {
  tickRate: 30,
  snapshotRate: 20,
  interpolationDelayMs: 90,
  minimumInterpolationDelayMs: 75,
  maximumInterpolationDelayMs: 160,
  maximumExtrapolationMs: 55,
  gridSize: 128,
  cellSize: 16,
  arenaRadius: 1000,
  playerSpeed: 172,
  maximumTurnRate: 4.6,
  playerRadius: 12,
  trailWidth: 13,
  trailPointSpacing: 8,
  maximumTrailPoints: 700,
  startingTerritoryRadius: 4,
  botTarget: 12,
  botThinkIntervalMs: 170,
  respawnDelayMs: 1800,
  spawnProtectionMs: 1300,
  movementRateLimit: 45,
  leaderboardSize: 10
} as const;

export const BOT_NAMES = [
  'Atlas',
  'Inkwell',
  'Patch',
  'Canvas',
  'Doodle',
  'Mosaic',
  'Vector',
  'Saffron',
  'Indigo',
  'Stencil',
  'Pixel',
  'Contour'
] as const;

export const PLAYER_COLORS = [
  0x55d7ff, 0xff5c8a, 0x8aef74, 0xffcf55, 0xa77bff, 0xff835c, 0x4de7b1, 0x5f8cff, 0xf06bd8,
  0xc9ed5b, 0x7868ff, 0x33c8d7, 0xff6f61, 0x64d37d, 0xe59cff
] as const;
