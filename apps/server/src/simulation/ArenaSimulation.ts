import {
  BOT_NAMES,
  GAME,
  PLAYER_SKINS,
  advancePlayer,
  finiteMovement,
  normalizeAngle,
  playerSkin,
  type DeathMessage,
  type JoinOptions,
  type LeaderboardEntry,
  type PlayerEntity,
  type PlayerMovementMessage,
  type PlayerSkinDefinition,
  type PlayerSnapshot,
  type Vec2
} from '@jinshi-territory/shared';
import { BotSystem } from './BotSystem.js';
import { Random } from './Random.js';
import { TerritoryGrid } from './TerritoryGrid.js';

interface SimulationOptions {
  seed?: number;
  botTarget?: number;
  onDeath?: (playerId: string, message: DeathMessage) => void;
}

const ESTABLISHED_BOT_STARTING_CELLS: Readonly<Record<string, number>> = {
  Atlas: GAME.startingTerritoryCells * 2,
  Canvas: GAME.startingTerritoryCells * 3,
  Mosaic: GAME.startingTerritoryCells * 4,
  Pixel: GAME.startingTerritoryCells * 5
};

export class ArenaSimulation {
  readonly players = new Map<string, PlayerEntity>();
  readonly territory = new TerritoryGrid();
  readonly random: Random;
  readonly botSystem: BotSystem;
  readonly trailOwners = new Int16Array(GAME.gridSize * GAME.gridSize);
  running = false;
  tick = 0;
  private readonly botTarget: number;
  private readonly onDeath: ((playerId: string, message: DeathMessage) => void) | undefined;
  private nextTerritoryKey = 1;

  constructor(options: SimulationOptions = {}) {
    this.random = new Random(options.seed);
    this.botSystem = new BotSystem(this.random);
    this.botTarget = options.botTarget ?? GAME.botTarget;
    this.onDeath = options.onDeath;
  }

  start(now = Date.now()): void {
    if (this.running) return;
    this.running = true;
    this.ensureBotCount(this.botTarget, now);
  }

  stop(): void {
    this.running = false;
  }

  clear(): void {
    this.stop();
    this.players.clear();
    this.trailOwners.fill(0);
    this.botSystem.clear();
    this.tick = 0;
  }

  addHuman(id: string, options: JoinOptions, now = Date.now()): PlayerEntity {
    const existing = this.players.get(id);
    if (existing) return existing;
    const skin = this.chooseSkin();
    const player = this.createPlayer(
      id,
      options.playerId,
      options.displayName,
      'human',
      skin.id,
      now
    );
    this.players.set(id, player);
    return player;
  }

  removeHuman(id: string): void {
    const player = this.players.get(id);
    if (!player) return;
    this.clearTrail(player);
    this.territory.clearOwner(player.territoryKey);
    this.players.delete(id);
    this.refreshTerritoryCounts();
  }

  applyMovement(id: string, movement: PlayerMovementMessage, now = Date.now()): boolean {
    const player = this.players.get(id);
    if (!player || player.kind !== 'human' || !player.alive) return false;
    if (
      !finiteMovement(movement) ||
      movement.sequence <= player.lastMovementSequence ||
      !Number.isFinite(movement.clientTime)
    )
      return false;
    if (now - player.lastMovementAt < 1000 / GAME.movementRateLimit) return false;
    player.lastMovementSequence = movement.sequence;
    player.lastMovementAt = now;
    player.targetAngle = normalizeAngle(movement.angle);
    player.moving = true;
    return true;
  }

  step(deltaSeconds = 1 / GAME.tickRate, now = Date.now()): void {
    if (!this.running) return;
    this.tick += 1;
    this.ensureBotCount(this.botTarget, now);

    for (const player of this.players.values()) {
      if (!player.alive && now >= player.respawnAt) this.respawn(player, now);
    }

    for (const player of this.players.values()) {
      if (!player.alive) continue;
      if (player.kind === 'bot')
        this.botSystem.update(player, this.players.values(), this.territory, now);
      this.movePlayer(player, deltaSeconds, now);
    }
  }

  ensureBotCount(target = this.botTarget, now = Date.now()): void {
    const bots = [...this.players.values()].filter((player) => player.kind === 'bot');
    while (bots.length < target) {
      const index = bots.length;
      const id = `bot-${index}-${Math.floor(this.random.next() * 1_000_000)}`;
      const skin = this.chooseSkin();
      const player = this.createPlayer(
        id,
        id,
        BOT_NAMES[index % BOT_NAMES.length] ?? `Bot ${index + 1}`,
        'bot',
        skin.id,
        now
      );
      this.players.set(id, player);
      bots.push(player);
    }
    while (bots.length > target) {
      const player = bots.pop();
      if (player) {
        this.clearTrail(player);
        this.territory.clearOwner(player.territoryKey);
        this.players.delete(player.id);
      }
    }
    this.refreshTerritoryCounts();
  }

  get humanCount(): number {
    return [...this.players.values()].filter((player) => player.kind === 'human').length;
  }

  get botCount(): number {
    return [...this.players.values()].filter((player) => player.kind === 'bot' && player.alive)
      .length;
  }

  leaderboard(): LeaderboardEntry[] {
    return [...this.players.values()]
      .filter((player) => player.alive)
      .map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        percentage: this.percentage(player.territoryCells),
        kills: player.kills,
        kind: player.kind
      }))
      .sort((a, b) => b.percentage - a.percentage || b.kills - a.kills)
      .slice(0, GAME.leaderboardSize);
  }

  playerSnapshots(now = Date.now()): PlayerSnapshot[] {
    return [...this.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      kind: player.kind,
      skinId: player.skinId,
      color: player.color,
      territoryKey: player.territoryKey,
      x: round(player.x),
      y: round(player.y),
      angle: round(player.angle),
      kills: player.kills,
      deaths: player.deaths,
      alive: player.alive,
      moving: player.moving && now >= player.movementLockedUntil,
      protected: now < player.protectedUntil,
      respawnAt: player.respawnAt,
      acknowledgedMovement: player.lastMovementSequence,
      territoryCells: player.territoryCells,
      drawing: player.drawing,
      trail: player.trail.map((point) => ({ x: round(point.x), y: round(point.y) }))
    }));
  }

  percentage(cells: number): number {
    return Math.round((cells / this.territory.claimableCells) * 10_000) / 100;
  }

  private createPlayer(
    id: string,
    playerId: string,
    name: string,
    kind: 'human' | 'bot',
    skinId: string,
    now: number
  ): PlayerEntity {
    const skin = playerSkin(skinId);
    const startingTerritoryCells = this.initialStartingTerritoryCells(name, kind);
    const spawn = this.findSpawn(startingTerritoryCells);
    const territoryKey = this.allocateTerritoryKey();
    const angle = this.random.range(-Math.PI, Math.PI);
    const player: PlayerEntity = {
      id,
      playerId,
      name,
      kind,
      skinId: skin.id,
      color: skin.color,
      territoryKey,
      x: spawn.x,
      y: spawn.y,
      angle,
      targetAngle: angle,
      kills: 0,
      deaths: 0,
      alive: true,
      moving: kind === 'bot',
      movementLockedUntil: now + GAME.spawnMovementDelayMs,
      protectedUntil: now + GAME.spawnProtectionMs,
      spawnedAt: now,
      respawnAt: 0,
      lastMovementSequence: 0,
      lastMovementAt: 0,
      territoryCells: 0,
      drawing: false,
      trail: [],
      trailCells: new Set<number>(),
      lastTrailCell: this.territory.worldToIndex(spawn.x, spawn.y)
    };
    player.territoryCells = this.territory.createStartingTerritory(
      territoryKey,
      spawn,
      startingTerritoryCells
    );
    return player;
  }

  private chooseSkin(): PlayerSkinDefinition {
    const used = new Set([...this.players.values()].map((player) => player.skinId));
    const unused = PLAYER_SKINS.filter((skin) => !used.has(skin.id));
    const choices = unused.length > 0 ? unused : PLAYER_SKINS;
    return choices[this.random.integer(0, choices.length)] ?? PLAYER_SKINS[0];
  }

  private respawn(player: PlayerEntity, now: number): void {
    this.clearTrail(player);
    this.territory.clearOwner(player.territoryKey);
    const spawn = this.findSpawn(GAME.startingTerritoryCells);
    const angle = this.random.range(-Math.PI, Math.PI);
    player.x = spawn.x;
    player.y = spawn.y;
    player.angle = angle;
    player.targetAngle = angle;
    player.alive = true;
    player.moving = player.kind === 'bot';
    player.movementLockedUntil = now + GAME.spawnMovementDelayMs;
    player.drawing = false;
    player.protectedUntil = now + GAME.spawnProtectionMs;
    player.spawnedAt = now;
    player.respawnAt = 0;
    player.lastTrailCell = this.territory.worldToIndex(spawn.x, spawn.y);
    player.territoryCells = this.territory.createStartingTerritory(
      player.territoryKey,
      spawn,
      GAME.startingTerritoryCells
    );
    this.refreshTerritoryCounts();
  }

  private movePlayer(player: PlayerEntity, deltaSeconds: number, now: number): void {
    if (!player.moving || now < player.movementLockedUntil) return;
    const previousPosition = { x: player.x, y: player.y };
    const previousIndex = this.territory.worldToIndex(player.x, player.y);
    const next = advancePlayer(player, player.targetAngle, deltaSeconds);
    player.x = next.x;
    player.y = next.y;
    player.angle = next.angle;

    const currentIndex = this.territory.worldToIndex(player.x, player.y);
    if (
      currentIndex < 0 ||
      Math.hypot(player.x, player.y) >= GAME.arenaRadius - GAME.playerRadius
    ) {
      this.killPlayer(player, { reason: 'boundary' }, now);
      return;
    }

    if (!this.resolveTrailCuts(player, previousPosition, next, now)) return;

    const ownsCurrent = this.territory.owner(currentIndex) === player.territoryKey;
    if (!player.drawing && !ownsCurrent) {
      player.drawing = true;
      player.trail = [{ x: player.x, y: player.y }];
      player.lastTrailCell = previousIndex >= 0 ? previousIndex : currentIndex;
    }

    if (player.drawing) {
      const cells = rasterLine(player.lastTrailCell, currentIndex, GAME.gridSize);
      for (const index of cells) {
        if (this.territory.owner(index) === player.territoryKey) continue;
        const trailOwnerKey = this.trailOwners[index] ?? 0;
        if (trailOwnerKey !== 0 && trailOwnerKey !== player.territoryKey) {
          const victim = this.playerByTerritoryKey(trailOwnerKey);
          if (victim?.alive) this.killPlayer(victim, { reason: 'trail', killerId: player.id }, now);
        }
        this.trailOwners[index] = player.territoryKey;
        player.trailCells.add(index);
      }
      player.lastTrailCell = currentIndex;
      this.recordTrailPoint(player);
    }

    if (player.drawing && ownsCurrent && player.trailCells.size > 0) {
      this.territory.closeLoop(player.territoryKey, player.trailCells);
      this.clearTrail(player);
      player.drawing = false;
      this.refreshTerritoryCounts();
    } else if (!player.drawing) {
      player.lastTrailCell = currentIndex;
    }
  }

  /**
   * Tests the complete swept head path against visible trail segments. The grid
   * remains the ownership source of truth, while this geometric pass prevents
   * fast or diagonal cuts from slipping between adjacent cells.
   */
  private resolveTrailCuts(attacker: PlayerEntity, from: Vec2, to: Vec2, now: number): boolean {
    const hitDistance = GAME.playerRadius + GAME.trailWidth / 2;
    const hitDistanceSquared = hitDistance * hitDistance;

    for (const victim of this.players.values()) {
      if (!victim.alive || !victim.drawing || victim.trail.length === 0) continue;
      const path = [...victim.trail, { x: victim.x, y: victim.y }];
      for (let index = 0; index < path.length - 1; index += 1) {
        // The newest portion of a player's own trail is attached to its head;
        // ignoring it avoids treating ordinary forward motion as self-contact.
        if (victim.id === attacker.id && index >= path.length - 5) continue;
        const start = path[index];
        const end = path[index + 1];
        if (!start || !end) continue;
        if (segmentDistanceSquared(from, to, start, end) > hitDistanceSquared) continue;

        if (victim.id === attacker.id) {
          this.killPlayer(attacker, { reason: 'trail' }, now);
          return false;
        }
        this.killPlayer(victim, { reason: 'trail', killerId: attacker.id }, now);
        break;
      }
    }
    return attacker.alive;
  }

  private recordTrailPoint(player: PlayerEntity): void {
    const last = player.trail.at(-1);
    if (last && (player.x - last.x) ** 2 + (player.y - last.y) ** 2 < GAME.trailPointSpacing ** 2)
      return;
    player.trail.push({ x: player.x, y: player.y });
    if (player.trail.length > GAME.maximumTrailPoints)
      player.trail.splice(0, player.trail.length - GAME.maximumTrailPoints);
  }

  private killPlayer(
    player: PlayerEntity,
    death: { reason: DeathMessage['reason']; killerId?: string },
    now: number
  ): void {
    if (!player.alive) return;
    player.alive = false;
    player.moving = false;
    player.deaths += 1;
    player.respawnAt = now + GAME.respawnDelayMs;
    this.clearTrail(player);
    this.territory.clearOwner(player.territoryKey);
    player.territoryCells = 0;

    const killer = death.killerId ? this.players.get(death.killerId) : undefined;
    if (killer && killer.id !== player.id) killer.kills += 1;
    if (player.kind === 'human') {
      this.onDeath?.(player.id, {
        reason: death.reason,
        ...(killer ? { killerName: killer.name } : {}),
        respawnAt: player.respawnAt
      });
    }
    this.refreshTerritoryCounts();
  }

  private clearTrail(player: PlayerEntity): void {
    for (const index of player.trailCells) {
      if (this.trailOwners[index] === player.territoryKey) this.trailOwners[index] = 0;
    }
    player.trailCells.clear();
    player.trail.length = 0;
  }

  private refreshTerritoryCounts(): void {
    for (const player of this.players.values())
      player.territoryCells = this.territory.countOwner(player.territoryKey);
  }

  private playerByTerritoryKey(key: number): PlayerEntity | undefined {
    for (const player of this.players.values()) if (player.territoryKey === key) return player;
    return undefined;
  }

  private initialStartingTerritoryCells(name: string, kind: 'human' | 'bot'): number {
    if (kind !== 'bot') return GAME.startingTerritoryCells;
    return ESTABLISHED_BOT_STARTING_CELLS[name] ?? GAME.startingTerritoryCells;
  }

  private findSpawn(startingTerritoryCells: number = GAME.startingTerritoryCells): Vec2 {
    const centerIndex = this.territory.worldToIndex(0, 0);
    let best = centerIndex >= 0 ? this.territory.center(centerIndex) : { x: 0, y: 0 };
    let bestClearance = Number.NEGATIVE_INFINITY;
    const requestedRadius = startingTerritoryWorldRadius(startingTerritoryCells);
    const maximumSpawnRadius = Math.max(
      0,
      GAME.arenaRadius - requestedRadius - GAME.spawnTerritoryBuffer
    );

    for (let attempt = 0; attempt < 128; attempt += 1) {
      const angle = this.random.range(-Math.PI, Math.PI);
      const radius = Math.sqrt(this.random.next()) * maximumSpawnRadius;
      const unsnapped = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      const index = this.territory.worldToIndex(unsnapped.x, unsnapped.y);
      if (index < 0 || this.territory.owner(index) !== 0) continue;
      const candidate = this.territory.center(index);
      if (!this.territory.canCreateStartingTerritory(candidate, startingTerritoryCells)) continue;

      let clearance = Number.POSITIVE_INFINITY;
      for (const player of this.players.values()) {
        if (!player.alive) continue;
        const existingRadius = startingTerritoryWorldRadius(
          Math.min(
            GAME.startingTerritoryCells * 5,
            Math.max(GAME.startingTerritoryCells, player.territoryCells)
          )
        );
        const requiredDistance =
          requestedRadius + existingRadius + GAME.spawnTerritoryBuffer;
        const actualDistance = Math.hypot(player.x - candidate.x, player.y - candidate.y);
        clearance = Math.min(clearance, actualDistance - requiredDistance);
      }

      if (clearance > bestClearance) {
        bestClearance = clearance;
        best = candidate;
      }
      if (clearance >= 0) return candidate;
    }

    return best;
  }

  private allocateTerritoryKey(): number {
    const key = this.nextTerritoryKey;
    this.nextTerritoryKey += 1;
    if (this.nextTerritoryKey >= 32_000) this.nextTerritoryKey = 1;
    return key;
  }
}

function startingTerritoryWorldRadius(cells: number): number {
  return (Math.ceil(Math.sqrt(Math.max(1, cells) / Math.PI)) + 1) * GAME.cellSize;
}

function rasterLine(start: number, end: number, size: number): number[] {
  if (start < 0) return end >= 0 ? [end] : [];
  let x0 = start % size;
  let y0 = Math.floor(start / size);
  const x1 = end % size;
  const y1 = Math.floor(end / size);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  const result: number[] = [];
  while (true) {
    result.push(y0 * size + x0);
    if (x0 === x1 && y0 === y1) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x0 += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y0 += sy;
    }
  }
  return result;
}

function segmentDistanceSquared(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistanceSquared(a, c, d),
    pointSegmentDistanceSquared(b, c, d),
    pointSegmentDistanceSquared(c, a, b),
    pointSegmentDistanceSquared(d, a, b)
  );
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const cdX = d.x - c.x;
  const cdY = d.y - c.y;
  const denominator = abX * cdY - abY * cdX;
  if (Math.abs(denominator) < 1e-8) return false;
  const acX = c.x - a.x;
  const acY = c.y - a.y;
  const first = (acX * cdY - acY * cdX) / denominator;
  const second = (acX * abY - acY * abX) / denominator;
  return first >= 0 && first <= 1 && second >= 0 && second <= 1;
}

function pointSegmentDistanceSquared(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );
  const nearestX = start.x + dx * ratio;
  const nearestY = start.y + dy * ratio;
  return (point.x - nearestX) ** 2 + (point.y - nearestY) ** 2;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
