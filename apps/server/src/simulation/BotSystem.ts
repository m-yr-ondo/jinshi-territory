import {
  GAME,
  normalizeAngle,
  type PlayerEntity,
  type Vec2
} from '@jinshi-territory/shared';
import type { Random } from './Random.js';
import type { TerritoryGrid } from './TerritoryGrid.js';

type BotRole = 'cutter' | 'expander' | 'survivor' | 'opportunist';
type BotState = 'setup' | 'expand' | 'return' | 'hunt' | 'evade' | 'recover';
type PlanKind = 'expand' | 'return';

interface BotProfile {
  role: BotRole;
  aggression: number;
  expansionGreed: number;
  caution: number;
  persistence: number;
  reactionMs: number;
  planningQuality: number;
  aimError: number;
  safetyMarginSeconds: number;
  huntRadius: number;
  loopDepth: readonly [number, number];
  loopWidth: readonly [number, number];
  trailRisk: readonly [number, number];
}

interface BotPlan {
  kind: PlanKind;
  waypoints: Vec2[];
  waypointIndex: number;
  returnPoint: Vec2;
  createdAt: number;
  aimBias: number;
}

interface HuntTarget {
  playerId: string;
  point: Vec2;
  expiresAt: number;
}

interface TrailThreat {
  enemy: PlayerEntity;
  point: Vec2;
  distance: number;
}

interface BotMemory {
  profile: BotProfile;
  state: BotState;
  stateEnteredAt: number;
  nextThinkAt: number;
  commitmentUntil: number;
  riskCells: number;
  plan: BotPlan | null;
  hunt: HuntTarget | null;
  returnPoint: Vec2 | null;
  evadeUntil: number;
  evadeAngle: number;
  lastWaypointDistance: number;
  lastSpawnedAt: number;
  failedPlans: number;
  boundaryRevision: number;
  boundaryPoints: Vec2[];
  territoryCentroid: Vec2;
  pendingThreatId: string | null;
  pendingThreatSince: number;
  wasDrawing: boolean;
}

interface ExpansionCandidate {
  score: number;
  waypoints: Vec2[];
  returnPoint: Vec2;
}

const CUTTERS = new Set(['Atlas', 'Vector', 'Indigo', 'Contour']);
const EXPANDERS = new Set(['Canvas', 'Mosaic', 'Inkwell', 'Stencil']);
const SURVIVORS = new Set(['Patch', 'Doodle']);

const MAP_LINEAR_SCALE = GAME.arenaRadius / 1600;
const mapDistance = (value: number): number => value * MAP_LINEAR_SCALE;
const mapCells = (value: number): number => Math.max(1, Math.round(value * MAP_LINEAR_SCALE));

const PROFILES: Record<BotRole, BotProfile> = {
  cutter: {
    role: 'cutter',
    aggression: 0.92,
    expansionGreed: 0.58,
    caution: 0.42,
    persistence: 0.78,
    reactionMs: 85,
    planningQuality: 0.84,
    aimError: 0.035,
    safetyMarginSeconds: 0.22,
    huntRadius: 570,
    loopDepth: [mapDistance(170), mapDistance(330)],
    loopWidth: [mapDistance(150), mapDistance(310)],
    trailRisk: [mapCells(20), mapCells(43)]
  },
  expander: {
    role: 'expander',
    aggression: 0.24,
    expansionGreed: 0.96,
    caution: 0.48,
    persistence: 0.84,
    reactionMs: 115,
    planningQuality: 0.9,
    aimError: 0.026,
    safetyMarginSeconds: 0.48,
    huntRadius: 390,
    loopDepth: [mapDistance(250), mapDistance(470)],
    loopWidth: [mapDistance(230), mapDistance(450)],
    trailRisk: [mapCells(30), mapCells(59)]
  },
  survivor: {
    role: 'survivor',
    aggression: 0.08,
    expansionGreed: 0.38,
    caution: 0.94,
    persistence: 0.52,
    reactionMs: 70,
    planningQuality: 0.8,
    aimError: 0.045,
    safetyMarginSeconds: 0.78,
    huntRadius: 300,
    loopDepth: [mapDistance(120), mapDistance(235)],
    loopWidth: [mapDistance(115), mapDistance(225)],
    trailRisk: [mapCells(14), mapCells(29)]
  },
  opportunist: {
    role: 'opportunist',
    aggression: 0.62,
    expansionGreed: 0.72,
    caution: 0.58,
    persistence: 0.68,
    reactionMs: 100,
    planningQuality: 0.82,
    aimError: 0.04,
    safetyMarginSeconds: 0.4,
    huntRadius: 500,
    loopDepth: [mapDistance(190), mapDistance(380)],
    loopWidth: [mapDistance(175), mapDistance(360)],
    trailRisk: [mapCells(22), mapCells(49)]
  }
};

const WAYPOINT_REACHED_DISTANCE = 46;
const WAYPOINT_LOOKAHEAD_DISTANCE = 105;
const RETURN_CANDIDATE_LIMIT = 96;
const EXPANSION_CANDIDATES = 12;
const OWN_TRAIL_SKIP_SEGMENTS = 7;
const IMMEDIATE_LOOKAHEAD_SECONDS = 0.38;
const BOUNDARY_LOOKAHEAD_SECONDS = 0.55;
const BOUNDARY_RECOVERY_MARGIN = mapDistance(115);
const BOUNDARY_PLAN_MARGIN = mapDistance(230);
const BOUNDARY_PRESSURE_MARGIN = mapDistance(250);
const BOUNDARY_PRESSURE_DIVISOR = mapDistance(180);
const RECOVERY_PROJECTION_DISTANCE = mapDistance(175);
const EXPANSION_RETURN_SEPARATION = mapDistance(92);
const EXPANSION_SETUP_DISTANCE = mapDistance(72);
const EXPANSION_PLAN_MAX_AGE_MS = Math.round(11_000 * MAP_LINEAR_SCALE);
const MINIMUM_ROUTE_MARGIN = GAME.playerRadius + GAME.trailWidth / 2 + 12;

export class BotSystem {
  private readonly memory = new Map<string, BotMemory>();

  constructor(private readonly random: Random) {}

  update(
    bot: PlayerEntity,
    players: Iterable<PlayerEntity>,
    grid: TerritoryGrid,
    now: number
  ): void {
    const playerList = [...players];
    const memory = this.memoryFor(bot, now);

    if (memory.lastSpawnedAt !== bot.spawnedAt) this.resetAfterRespawn(bot, memory, now);

    const reconnected = memory.wasDrawing && !bot.drawing;
    memory.wasDrawing = bot.drawing;
    if (reconnected) {
      memory.plan = null;
      memory.hunt = null;
      memory.returnPoint = null;
      memory.lastWaypointDistance = Number.POSITIVE_INFINITY;
      this.transition(memory, 'setup', now, 180);
    }

    this.refreshBoundaryCache(bot, grid, memory);

    if (this.applyImmediateSafety(bot, playerList, grid, memory, now)) return;

    if (memory.state === 'evade' && now < memory.evadeUntil) {
      bot.targetAngle = memory.evadeAngle;
      return;
    }

    if (now < memory.nextThinkAt) return;
    memory.nextThinkAt =
      now +
      GAME.botThinkIntervalMs +
      this.random.range(-38, 62) +
      (1 - memory.profile.planningQuality) * 55;

    if (memory.state === 'evade') {
      if (bot.drawing) this.beginReturn(bot, playerList, grid, memory, now);
      else this.transition(memory, 'recover', now, 180);
    }

    if (bot.drawing) {
      this.updateOutsideTerritory(bot, playerList, grid, memory, now);
      return;
    }

    this.updateInsideTerritory(bot, playerList, grid, memory, now);
  }

  clear(): void {
    this.memory.clear();
  }

  private updateOutsideTerritory(
    bot: PlayerEntity,
    players: readonly PlayerEntity[],
    grid: TerritoryGrid,
    memory: BotMemory,
    now: number
  ): void {
    if (memory.state === 'setup') this.transition(memory, 'expand', now, 260);

    const returnPressure = this.returnPressure(bot, players, grid, memory);
    if (returnPressure >= 1 || bot.trailCells.size >= memory.riskCells) {
      this.beginReturn(bot, players, grid, memory, now);
      return;
    }

    if (memory.state === 'hunt') {
      if (this.continueHunt(bot, players, grid, memory, now)) return;
      this.beginReturn(bot, players, grid, memory, now);
      return;
    }

    if (memory.state === 'return') {
      this.continueReturn(bot, players, grid, memory, now);
      return;
    }

    if (memory.state === 'recover') {
      const safeReturn = this.chooseSafeReturnPoint(bot, players, grid, memory);
      if (safeReturn) {
        this.setReturnPlan(memory, safeReturn, now);
        this.followPlan(bot, grid, memory, now);
      } else {
        bot.targetAngle = this.recoveryAngle(bot, players, grid, memory);
      }
      return;
    }

    if (memory.plan?.kind === 'expand') {
      if (this.expansionPlanStillValid(bot, grid, memory.plan, now)) {
        this.followPlan(bot, grid, memory, now);
        return;
      }
      memory.failedPlans += 1;
    }

    this.beginReturn(bot, players, grid, memory, now);
  }

  private updateInsideTerritory(
    bot: PlayerEntity,
    players: readonly PlayerEntity[],
    grid: TerritoryGrid,
    memory: BotMemory,
    now: number
  ): void {
    memory.returnPoint = null;
    memory.pendingThreatId = null;
    memory.pendingThreatSince = 0;

    if (
      memory.state === 'return' ||
      memory.state === 'evade' ||
      memory.state === 'recover' ||
      (memory.plan && memory.plan.kind === 'return')
    ) {
      memory.plan = null;
      memory.hunt = null;
      memory.lastWaypointDistance = Number.POSITIVE_INFINITY;
      this.transition(memory, 'setup', now, 160);
    }

    if (memory.state === 'hunt') {
      if (this.continueHunt(bot, players, grid, memory, now)) return;
      memory.hunt = null;
      this.transition(memory, 'setup', now, 100);
    }

    if (now >= memory.commitmentUntil && this.shouldConsiderHunt(bot, players, memory)) {
      const target = this.findBestHuntTarget(bot, players, grid, memory, now);
      if (target) {
        memory.hunt = target;
        memory.plan = null;
        this.transition(memory, 'hunt', now, 430);
        this.steerToward(bot, target.point, memory.profile.aimError * 0.45);
        return;
      }
    }

    if (!memory.plan || memory.plan.kind !== 'expand' || !this.expansionPlanStillValid(bot, grid, memory.plan, now)) {
      memory.plan = this.createExpansionPlan(bot, players, grid, memory, now);
      memory.lastWaypointDistance = Number.POSITIVE_INFINITY;
      memory.riskCells = this.chooseTrailRisk(bot, players, memory);

      if (!memory.plan) {
        memory.failedPlans += 1;
        this.transition(memory, 'recover', now, 180);
        bot.targetAngle = this.recoveryAngle(bot, players, grid, memory);
        return;
      }

      this.transition(memory, 'setup', now, 320);
    }

    this.followPlan(bot, grid, memory, now);
  }

  /**
   * This runs every simulation tick. It only handles imminent danger; expensive
   * route generation remains on the slower strategic think cadence.
   */
  private applyImmediateSafety(
    bot: PlayerEntity,
    players: readonly PlayerEntity[],
    grid: TerritoryGrid,
    memory: BotMemory,
    now: number
  ): boolean {
    if (memory.state === 'evade' && now < memory.evadeUntil) {
      bot.targetAngle = memory.evadeAngle;
      return true;
    }

    const projectedBoundary = project(bot, bot.angle, GAME.playerSpeed * BOUNDARY_LOOKAHEAD_SECONDS);
    const radius = Math.hypot(bot.x, bot.y);
    const projectedRadius = Math.hypot(projectedBoundary.x, projectedBoundary.y);
    if (
      radius > GAME.arenaRadius - BOUNDARY_RECOVERY_MARGIN ||
      projectedRadius > GAME.arenaRadius - GAME.playerRadius - 42
    ) {
      this.transition(memory, 'recover', now, 260);
      memory.plan = null;
      memory.hunt = null;
      memory.evadeAngle = this.recoveryAngle(bot, players, grid, memory);
      bot.targetAngle = memory.evadeAngle;
      return true;
    }

    if (bot.drawing && bot.trail.length > OWN_TRAIL_SKIP_SEGMENTS + 2) {
      const projected = project(bot, bot.angle, GAME.playerSpeed * IMMEDIATE_LOOKAHEAD_SECONDS);
      if (this.pathCrossesOwnTrail(bot, bot, projected, MINIMUM_ROUTE_MARGIN)) {
        this.transition(memory, 'recover', now, 300);
        memory.plan = null;
        memory.hunt = null;
        memory.evadeAngle = this.recoveryAngle(bot, players, grid, memory);
        bot.targetAngle = memory.evadeAngle;
        return true;
      }
    }

    if (!bot.drawing || bot.trail.length < 2) {
      memory.pendingThreatId = null;
      memory.pendingThreatSince = 0;
      return false;
    }

    const threat = this.nearestThreatToOwnTrail(bot, players);
    if (!threat) {
      memory.pendingThreatId = null;
      memory.pendingThreatSince = 0;
      return false;
    }

    const currentReturn =
      memory.returnPoint ?? memory.plan?.returnPoint ?? this.chooseSafeReturnPoint(bot, players, grid, memory);
    if (!currentReturn) return false;

    const botReturnEta = this.travelTime(bot, currentReturn);
    const enemyCutEta = Math.max(0, threat.distance - MINIMUM_ROUTE_MARGIN) / GAME.playerSpeed;
    const danger = enemyCutEta < botReturnEta + memory.profile.safetyMarginSeconds;

    if (!danger) {
      memory.pendingThreatId = null;
      memory.pendingThreatSince = 0;
      return false;
    }

    if (memory.pendingThreatId !== threat.enemy.id) {
      memory.pendingThreatId = threat.enemy.id;
      memory.pendingThreatSince = now;
      return false;
    }

    if (now - memory.pendingThreatSince < memory.profile.reactionMs) return false;

    const safeReturn = this.chooseSafeReturnPoint(bot, players, grid, memory, threat.enemy) ?? currentReturn;
    memory.returnPoint = safeReturn;
    memory.plan = null;
    memory.hunt = null;
    memory.evadeUntil = now + this.random.range(150, 260);
    memory.evadeAngle = this.angleToward(bot, safeReturn);
    this.transition(memory, 'evade', now, 0);
    bot.targetAngle = memory.evadeAngle;
    return true;
  }

  private continueReturn(
    bot: PlayerEntity,
    players: readonly PlayerEntity[],
    grid: TerritoryGrid,
    memory: BotMemory,
    now: number
  ): void {
    const current = memory.returnPoint ?? memory.plan?.returnPoint;
    if (
      current &&
      this.returnRouteIsSafe(bot, current, players, memory.profile.safetyMarginSeconds)
    ) {
      if (!memory.plan || memory.plan.kind !== 'return') this.setReturnPlan(memory, current, now);
      this.followPlan(bot, grid, memory, now);
      return;
    }

    const replacement = this.chooseSafeReturnPoint(bot, players, grid, memory);
    if (replacement) {
      this.setReturnPlan(memory, replacement, now);
      this.followPlan(bot, grid, memory, now);
      return;
    }

    this.transition(memory, 'recover', now, 260);
    memory.plan = null;
    bot.targetAngle = this.recoveryAngle(bot, players, grid, memory);
  }

  private beginReturn(
    bot: PlayerEntity,
    players: readonly PlayerEntity[],
    grid: TerritoryGrid,
    memory: BotMemory,
    now: number
  ): void {
    const returnPoint = this.chooseSafeReturnPoint(bot, players, grid, memory);
    memory.hunt = null;

    if (!returnPoint) {
      memory.plan = null;
      memory.returnPoint = null;
      this.transition(memory, 'recover', now, 260);
      bot.targetAngle = this.recoveryAngle(bot, players, grid, memory);
      return;
    }

    this.setReturnPlan(memory, returnPoint, now);
    this.followPlan(bot, grid, memory, now);
  }

  private setReturnPlan(memory: BotMemory, point: Vec2, now: number): void {
    memory.returnPoint = point;
    memory.plan = {
      kind: 'return',
      waypoints: [point],
      waypointIndex: 0,
      returnPoint: point,
      createdAt: now,
      aimBias: this.random.range(-memory.profile.aimError, memory.profile.aimError)
    };
    memory.lastWaypointDistance = Number.POSITIVE_INFINITY;
    this.transition(memory, 'return', now, 260);
  }

  private followPlan(bot: PlayerEntity, grid: TerritoryGrid, memory: BotMemory, now: number): void {
    const plan = memory.plan;
    if (!plan) return;

    while (plan.waypointIndex < plan.waypoints.length) {
      const current = plan.waypoints[plan.waypointIndex];
      if (!current) break;

      if (
        bot.drawing &&
        plan.kind === 'expand' &&
        grid.owner(grid.worldToIndex(current.x, current.y)) === bot.territoryKey
      ) {
        plan.waypointIndex += 1;
        memory.lastWaypointDistance = Number.POSITIVE_INFINITY;
        continue;
      }

      const distance = Math.sqrt(distanceSquared(bot, current));
      const overshot =
        memory.lastWaypointDistance < 72 && distance > memory.lastWaypointDistance + 9;
      if (distance <= WAYPOINT_REACHED_DISTANCE || overshot) {
        plan.waypointIndex += 1;
        memory.lastWaypointDistance = Number.POSITIVE_INFINITY;
        continue;
      }

      memory.lastWaypointDistance = distance;
      break;
    }

    if (plan.waypointIndex >= plan.waypoints.length) {
      if (bot.drawing && plan.kind === 'expand') {
        memory.returnPoint = plan.returnPoint;
        this.setReturnPlan(memory, plan.returnPoint, now);
        const target = memory.plan?.waypoints[0];
        if (target) this.steerToward(bot, target, memory.plan?.aimBias ?? 0);
      }
      return;
    }

    const waypoint = plan.waypoints[plan.waypointIndex];
    if (!waypoint) return;

    let steeringPoint = waypoint;
    const distance = Math.sqrt(distanceSquared(bot, waypoint));
    const next = plan.waypoints[plan.waypointIndex + 1];
    if (next && distance < WAYPOINT_LOOKAHEAD_DISTANCE) {
      const blend = 1 - distance / WAYPOINT_LOOKAHEAD_DISTANCE;
      steeringPoint = {
        x: waypoint.x + (next.x - waypoint.x) * blend * 0.55,
        y: waypoint.y + (next.y - waypoint.y) * blend * 0.55
      };
    }

    if (plan.kind === 'expand') {
      this.transition(memory, bot.drawing ? 'expand' : 'setup', now, 0);
    } else {
      this.transition(memory, 'return', now, 0);
    }

    this.steerToward(bot, steeringPoint, plan.aimBias);
  }

  private createExpansionPlan(
    bot: PlayerEntity,
    players: readonly PlayerEntity[],
    grid: TerritoryGrid,
    memory: BotMemory,
    now: number
  ): BotPlan | null {
    const boundary = memory.boundaryPoints;
    if (boundary.length < 4) return null;

    const candidates: ExpansionCandidate[] = [];
    const leaderCells = this.leaderTerritory(players);
    const behindFactor = leaderCells > 0 ? clamp01(1 - bot.territoryCells / leaderCells) : 0;
    const greedBoost = 1 + behindFactor * 0.22 * memory.profile.expansionGreed;

    for (let attempt = 0; attempt < EXPANSION_CANDIDATES; attempt += 1) {
      const exit = boundary[this.random.integer(0, boundary.length)];
      if (!exit) continue;

      const outward = this.boundaryOutward(
        bot,
        grid,
        exit,
        memory.territoryCentroid
      );
      if (outward.x === 0 && outward.y === 0) continue;

      const tangentSign = this.random.next() < 0.5 ? -1 : 1;
      const tangent = { x: -outward.y * tangentSign, y: outward.x * tangentSign };
      const depth =
        this.random.range(memory.profile.loopDepth[0], memory.profile.loopDepth[1]) * greedBoost;
      const width =
        this.random.range(memory.profile.loopWidth[0], memory.profile.loopWidth[1]) * greedBoost;
      const desiredReturn = {
        x: exit.x + tangent.x * width,
        y: exit.y + tangent.y * width
      };
      const returnPoint = this.closestBoundaryPoint(
        boundary,
        desiredReturn,
        exit,
        EXPANSION_RETURN_SEPARATION,
        outward,
        memory.territoryCentroid
      );
      if (!returnPoint) continue;

      const setup = this.findOwnedSetupPoint(bot, grid, exit, memory.territoryCentroid);
      const exitBeyond = {
        x: exit.x + outward.x * 54,
        y: exit.y + outward.y * 54
      };
      const outer1 = {
        x: exit.x + outward.x * depth + tangent.x * width * 0.12,
        y: exit.y + outward.y * depth + tangent.y * width * 0.12
      };
      const outer2 = {
        x: returnPoint.x + outward.x * depth * this.random.range(0.74, 1.02),
        y: returnPoint.y + outward.y * depth * this.random.range(0.74, 1.02)
      };
      const waypoints = [setup, exitBeyond, outer1, outer2, returnPoint];

      const score = this.scoreExpansionCandidate(bot, players, grid, memory, waypoints, depth, width);
      if (!Number.isFinite(score)) continue;
      candidates.push({ score, waypoints, returnPoint });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);

    const choiceRange = Math.min(
      candidates.length,
      memory.profile.planningQuality > 0.88 ? 2 : memory.profile.planningQuality > 0.75 ? 3 : 4
    );
    const imperfectChoice =
      this.random.next() > memory.profile.planningQuality
        ? this.random.integer(0, choiceRange)
        : 0;
    const selected = candidates[imperfectChoice] ?? candidates[0];
    if (!selected) return null;

    return {
      kind: 'expand',
      waypoints: selected.waypoints,
      waypointIndex: 0,
      returnPoint: selected.returnPoint,
      createdAt: now,
      aimBias: this.random.range(-memory.profile.aimError, memory.profile.aimError)
    };
  }

  private scoreExpansionCandidate(
    bot: PlayerEntity,
    players: readonly PlayerEntity[],
    grid: TerritoryGrid,
    memory: BotMemory,
    waypoints: readonly Vec2[],
    depth: number,
    width: number
  ): number {
    for (const point of waypoints) {
      if (Math.hypot(point.x, point.y) > GAME.arenaRadius - GAME.playerRadius - 58)
        return Number.NEGATIVE_INFINITY;
    }

    for (let index = 1; index < waypoints.length; index += 1) {
      const before = waypoints[index - 1];
      const after = waypoints[index];
      if (!before || !after || distanceSquared(before, after) < 68 * 68)
        return Number.NEGATIVE_INFINITY;
    }

    const outer1 = waypoints[2];
    const outer2 = waypoints[3];
    if (!outer1 || !outer2) return Number.NEGATIVE_INFINITY;

    const outer1Owned = grid.owner(grid.worldToIndex(outer1.x, outer1.y)) === bot.territoryKey;
    const outer2Owned = grid.owner(grid.worldToIndex(outer2.x, outer2.y)) === bot.territoryKey;
    if (outer1Owned && outer2Owned) return Number.NEGATIVE_INFINITY;

    let routeLength = 0;
    let enemyPenalty = 0;
    let boundaryPenalty = 0;
    let ownTerritoryOverlap = 0;

    for (let index = 1; index < waypoints.length; index += 1) {
      const start = waypoints[index - 1];
      const end = waypoints[index];
      if (!start || !end) continue;
      routeLength += Math.sqrt(distanceSquared(start, end));

      for (const rival of players) {
        if (!rival.alive || rival.id === bot.id) continue;
        const distance = Math.sqrt(pointSegmentDistanceSquared(rival, start, end));
        if (distance < 260) enemyPenalty += (260 - distance) * (0.8 + memory.profile.caution);
      }

      for (let sample = 1; sample <= 5; sample += 1) {
        const ratio = sample / 6;
        const point = {
          x: start.x + (end.x - start.x) * ratio,
          y: start.y + (end.y - start.y) * ratio
        };
        const margin = GAME.arenaRadius - Math.hypot(point.x, point.y);
        if (margin < BOUNDARY_PLAN_MARGIN)
          boundaryPenalty += (BOUNDARY_PLAN_MARGIN - margin) * 1.8;
        if (
          index >= 2 &&
          index <= 3 &&
          grid.owner(grid.worldToIndex(point.x, point.y)) === bot.territoryKey
        )
          ownTerritoryOverlap += 75;
      }
    }

    const first = waypoints[0];
    const second = waypoints[1];
    const third = waypoints[2];
    if (!first || !second || !third) return Number.NEGATIVE_INFINITY;
    const initialTurn = Math.abs(normalizeAngle(this.angleToward(bot, first) - bot.angle));
    const cornerTurn = Math.abs(
      normalizeAngle(Math.atan2(third.y - second.y, third.x - second.x) - Math.atan2(second.y - first.y, second.x - first.x))
    );
    const areaReward = depth * width * (0.011 + memory.profile.expansionGreed * 0.012);

    return (
      areaReward -
      routeLength * (0.23 + memory.profile.caution * 0.16) -
      initialTurn * 70 -
      Math.max(0, cornerTurn - 2.45) * 180 -
      enemyPenalty -
      boundaryPenalty -
      ownTerritoryOverlap -
      Math.sqrt(distanceSquared(bot, first)) * 0.25
    );
  }

  private expansionPlanStillValid(
    bot: PlayerEntity,
    grid: TerritoryGrid,
    plan: BotPlan,
    now: number
  ): boolean {
    if (plan.kind !== 'expand' || now - plan.createdAt > EXPANSION_PLAN_MAX_AGE_MS)
      return false;
    const waypoint = plan.waypoints[plan.waypointIndex];
    if (!waypoint) return false;
    if (Math.hypot(waypoint.x, waypoint.y) > GAME.arenaRadius - GAME.playerRadius - 35)
      return false;
    if (bot.drawing && this.pathCrossesOwnTrail(bot, bot, waypoint, MINIMUM_ROUTE_MARGIN))
      return false;
    return grid.worldToIndex(plan.returnPoint.x, plan.returnPoint.y) >= 0;
  }

  private shouldConsiderHunt(
    bot: PlayerEntity,
    players: readonly PlayerEntity[],
    memory: BotMemory
  ): boolean {
    if (memory.profile.role === 'survivor') return false;
    if (!players.some((player) => player.alive && player.id !== bot.id && player.drawing)) return false;

    const leader = this.leaderTerritory(players);
    const relative = leader > 0 ? bot.territoryCells / leader : 1;
    let desire = memory.profile.aggression;

    if (memory.profile.role === 'opportunist') {
      desire += relative < 0.65 ? 0.24 : relative > 0.95 ? -0.24 : 0;
    } else if (memory.profile.role === 'cutter') {
      desire += relative < 0.8 ? 0.08 : 0;
    } else if (memory.profile.role === 'expander') {
      desire -= relative < 0.8 ? 0.08 : 0;
    }

    return this.random.next() < clamp01(desire);
  }

  private findBestHuntTarget(
    bot: PlayerEntity,
    players: readonly PlayerEntity[],
    grid: TerritoryGrid,
    memory: BotMemory,
    now: number,
    onlyPlayerId?: string
  ): HuntTarget | null {
    let best: HuntTarget | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const rival of players) {
      if (
        !rival.alive ||
        rival.id === bot.id ||
        !rival.drawing ||
        rival.trail.length < 2 ||
        (onlyPlayerId !== undefined && rival.id !== onlyPlayerId)
      )
        continue;

      const targetPoint = this.closestReachableTrailPoint(bot, rival, memory.profile.huntRadius);
      if (!targetPoint) continue;
      if (this.pathCrossesOwnTrail(bot, bot, targetPoint, MINIMUM_ROUTE_MARGIN)) continue;

      const hunterEta = this.travelTime(bot, targetPoint);
      const victimHome = grid.nearestOwnedCell(rival.territoryKey, rival);
      if (!victimHome) continue;
      const victimEta = this.travelTime(rival, victimHome);
      const margin = memory.profile.safetyMarginSeconds * (memory.profile.role === 'cutter' ? 0.75 : 1.15);
      if (hunterEta + margin >= victimEta) continue;

      if (bot.drawing) {
        const ownHome = memory.returnPoint ?? this.chooseSafeReturnPoint(bot, players, grid, memory);
        if (!ownHome) continue;
        const ownReturnEta = this.travelTime(bot, ownHome);
        if (hunterEta > ownReturnEta * 0.72 || bot.trailCells.size > memory.riskCells * 0.45)
          continue;
      }

      const distance = Math.sqrt(distanceSquared(bot, targetPoint));
      const score =
        (victimEta - hunterEta) * 220 +
        rival.territoryCells * 0.08 -
        distance * 0.18 +
        memory.profile.aggression * 80;
      if (score <= bestScore) continue;

      bestScore = score;
      best = {
        playerId: rival.id,
        point: targetPoint,
        expiresAt: now + 720
      };
    }

    return best;
  }

  private continueHunt(
    bot: PlayerEntity,
    players: readonly PlayerEntity[],
    grid: TerritoryGrid,
    memory: BotMemory,
    now: number
  ): boolean {
    const current = memory.hunt;
    if (!current) return false;

    if (now > current.expiresAt) {
      memory.hunt = null;
      return false;
    }

    const refreshed = this.findBestHuntTarget(
      bot,
      players,
      grid,
      memory,
      now,
      current.playerId
    );
    if (!refreshed) {
      memory.hunt = null;
      return false;
    }

    refreshed.expiresAt = now + 720;
    memory.hunt = refreshed;
    this.transition(memory, 'hunt', now, 0);
    this.steerToward(bot, refreshed.point, memory.profile.aimError * 0.4);
    return true;
  }

  private closestReachableTrailPoint(
    bot: PlayerEntity,
    rival: PlayerEntity,
    maximumDistance: number
  ): Vec2 | null {
    let nearest: Vec2 | null = null;
    let nearestSquared = maximumDistance * maximumDistance;
    const path = [...rival.trail, { x: rival.x, y: rival.y }];

    for (let index = 0; index < path.length - 1; index += 2) {
      const start = path[index];
      const end = path[Math.min(index + 2, path.length - 1)];
      if (!start || !end) continue;
      const point = closestPointOnSegment(bot, start, end);
      const distance = distanceSquared(bot, point);
      if (distance >= nearestSquared) continue;
      nearestSquared = distance;
      nearest = point;
    }

    return nearest;
  }

  private chooseSafeReturnPoint(
    bot: PlayerEntity,
    players: readonly PlayerEntity[],
    grid: TerritoryGrid,
    memory: BotMemory,
    urgentEnemy?: PlayerEntity
  ): Vec2 | null {
    const boundary = memory.boundaryPoints;
    if (boundary.length === 0) {
      return grid.nearestOwnedCell(bot.territoryKey, bot) ?? null;
    }

    let best: Vec2 | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const step = Math.max(1, Math.floor(boundary.length / RETURN_CANDIDATE_LIMIT));

    for (let index = 0; index < boundary.length; index += step) {
      const candidate = boundary[index];
      if (!candidate) continue;
      if (this.pathCrossesOwnTrail(bot, bot, candidate, MINIMUM_ROUTE_MARGIN)) continue;
      if (!this.segmentInsideArena(bot, candidate, 42)) continue;

      const distance = Math.sqrt(distanceSquared(bot, candidate));
      if (distance < 12) return candidate;

      const desiredAngle = this.angleToward(bot, candidate);
      const turn = Math.abs(normalizeAngle(desiredAngle - bot.angle));
      const botEta = this.travelTime(bot, candidate);
      let dangerPenalty = 0;

      for (const rival of players) {
        if (!rival.alive || rival.id === bot.id) continue;
        const distanceToRoute = Math.sqrt(pointSegmentDistanceSquared(rival, bot, candidate));
        const enemyEta = Math.max(0, distanceToRoute - MINIMUM_ROUTE_MARGIN) / GAME.playerSpeed;
        if (enemyEta < botEta + memory.profile.safetyMarginSeconds) {
          dangerPenalty +=
            (botEta + memory.profile.safetyMarginSeconds - enemyEta) *
            430 *
            (urgentEnemy?.id === rival.id ? 1.55 : 1);
        }
        if (distanceToRoute < 150) dangerPenalty += (150 - distanceToRoute) * 1.7;
      }

      const forwardPenalty = turn > Math.PI * 0.72 ? 145 : turn * 54;
      const score = distance + forwardPenalty + dangerPenalty;
      if (score >= bestScore) continue;
      bestScore = score;
      best = candidate;
    }

    return best;
  }

  private returnRouteIsSafe(
    bot: PlayerEntity,
    target: Vec2,
    players: readonly PlayerEntity[],
    safetyMarginSeconds: number
  ): boolean {
    if (this.pathCrossesOwnTrail(bot, bot, target, MINIMUM_ROUTE_MARGIN)) return false;
    if (!this.segmentInsideArena(bot, target, 36)) return false;

    const botEta = this.travelTime(bot, target);
    for (const rival of players) {
      if (!rival.alive || rival.id === bot.id) continue;
      const distanceToRoute = Math.sqrt(pointSegmentDistanceSquared(rival, bot, target));
      const enemyEta = Math.max(0, distanceToRoute - MINIMUM_ROUTE_MARGIN) / GAME.playerSpeed;
      if (enemyEta < botEta + safetyMarginSeconds * 0.62) return false;
    }
    return true;
  }

  private returnPressure(
    bot: PlayerEntity,
    players: readonly PlayerEntity[],
    grid: TerritoryGrid,
    memory: BotMemory
  ): number {
    let pressure = bot.trailCells.size / Math.max(1, memory.riskCells);
    const returnPoint =
      memory.returnPoint ?? memory.plan?.returnPoint ?? this.chooseSafeReturnPoint(bot, players, grid, memory);
    if (!returnPoint) return Math.max(pressure, 1.2);

    memory.returnPoint = returnPoint;
    const returnEta = this.travelTime(bot, returnPoint);
    const threat = this.nearestThreatToOwnTrail(bot, players);
    if (threat) {
      const cutEta = Math.max(0, threat.distance - MINIMUM_ROUTE_MARGIN) / GAME.playerSpeed;
      if (cutEta < returnEta + memory.profile.safetyMarginSeconds) {
        pressure = Math.max(
          pressure,
          1 + (returnEta + memory.profile.safetyMarginSeconds - cutEta) * 0.65
        );
      }
    }

    const boundaryMargin = GAME.arenaRadius - Math.hypot(bot.x, bot.y);
    if (boundaryMargin < BOUNDARY_PRESSURE_MARGIN)
      pressure += (BOUNDARY_PRESSURE_MARGIN - boundaryMargin) / BOUNDARY_PRESSURE_DIVISOR;
    return pressure;
  }

  private nearestThreatToOwnTrail(
    bot: PlayerEntity,
    players: readonly PlayerEntity[]
  ): TrailThreat | null {
    if (bot.trail.length < 2) return null;

    const ownPath = [...bot.trail, { x: bot.x, y: bot.y }];
    let nearest: TrailThreat | null = null;
    let nearestSquared = Number.POSITIVE_INFINITY;

    for (const enemy of players) {
      if (!enemy.alive || enemy.id === bot.id) continue;
      const predictedEnemy = project(enemy, enemy.angle, GAME.playerSpeed * 0.22);

      for (let index = 0; index < ownPath.length - 1; index += 3) {
        const start = ownPath[index];
        const end = ownPath[Math.min(index + 3, ownPath.length - 1)];
        if (!start || !end) continue;
        const point = closestPointOnSegment(predictedEnemy, start, end);
        const distance = distanceSquared(predictedEnemy, point);
        if (distance >= nearestSquared) continue;
        nearestSquared = distance;
        nearest = { enemy, point, distance: Math.sqrt(distance) };
      }
    }

    return nearest;
  }

  private recoveryAngle(
    bot: PlayerEntity,
    players: readonly PlayerEntity[],
    grid: TerritoryGrid,
    memory: BotMemory
  ): number {
    const centerAngle = Math.atan2(-bot.y, -bot.x);
    const home =
      memory.returnPoint ??
      (bot.drawing ? this.chooseSafeReturnPoint(bot, players, grid, memory) : null);
    const preferred = home ? this.angleToward(bot, home) : centerAngle;
    let bestAngle = preferred;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = -6; index <= 6; index += 1) {
      const angle = normalizeAngle(preferred + index * 0.24);
      const projected = project(bot, angle, RECOVERY_PROJECTION_DISTANCE);
      const radiusMargin = GAME.arenaRadius - Math.hypot(projected.x, projected.y);
      if (radiusMargin < GAME.playerRadius + 24) continue;

      let score = radiusMargin * 0.42;
      score -= Math.abs(normalizeAngle(angle - bot.angle)) * 34;
      score += grid.owner(grid.worldToIndex(projected.x, projected.y)) === bot.territoryKey ? 165 : 0;
      score += Math.sqrt(this.distanceToOwnTrailSquared(bot, projected)) * 0.18;

      for (const rival of players) {
        if (!rival.alive || rival.id === bot.id) continue;
        const distance = Math.sqrt(distanceSquared(projected, rival));
        score += Math.min(distance, 260) * 0.12;
      }

      if (score <= bestScore) continue;
      bestScore = score;
      bestAngle = angle;
    }

    return normalizeAngle(bestAngle + this.random.range(-0.035, 0.035));
  }

  private pathCrossesOwnTrail(
    bot: PlayerEntity,
    start: Vec2,
    end: Vec2,
    margin: number
  ): boolean {
    if (bot.trail.length <= OWN_TRAIL_SKIP_SEGMENTS + 1) return false;
    const maximumIndex = bot.trail.length - OWN_TRAIL_SKIP_SEGMENTS;
    const marginSquared = margin * margin;

    for (let index = 0; index < maximumIndex - 1; index += 1) {
      const before = bot.trail[index];
      const after = bot.trail[index + 1];
      if (!before || !after) continue;
      if (segmentDistanceSquared(start, end, before, after) <= marginSquared) return true;
    }
    return false;
  }

  private distanceToOwnTrailSquared(bot: PlayerEntity, point: Vec2): number {
    if (bot.trail.length < 2) return 300 * 300;
    let nearest = Number.POSITIVE_INFINITY;
    const maximumIndex = Math.max(1, bot.trail.length - OWN_TRAIL_SKIP_SEGMENTS);
    for (let index = 0; index < maximumIndex - 1; index += 2) {
      const start = bot.trail[index];
      const end = bot.trail[Math.min(index + 2, maximumIndex - 1)];
      if (!start || !end) continue;
      nearest = Math.min(nearest, pointSegmentDistanceSquared(point, start, end));
    }
    return nearest;
  }

  private segmentInsideArena(start: Vec2, end: Vec2, margin: number): boolean {
    for (let sample = 0; sample <= 6; sample += 1) {
      const ratio = sample / 6;
      const x = start.x + (end.x - start.x) * ratio;
      const y = start.y + (end.y - start.y) * ratio;
      if (Math.hypot(x, y) >= GAME.arenaRadius - GAME.playerRadius - margin) return false;
    }
    return true;
  }

  private refreshBoundaryCache(
    bot: PlayerEntity,
    grid: TerritoryGrid,
    memory: BotMemory
  ): void {
    if (memory.boundaryRevision === grid.revision && memory.boundaryPoints.length > 0) return;

    const points: Vec2[] = [];
    let sumX = 0;
    let sumY = 0;
    let owned = 0;

    for (let index = 0; index < grid.size * grid.size; index += 1) {
      if (grid.owner(index) !== bot.territoryKey) continue;
      const point = grid.center(index);
      sumX += point.x;
      sumY += point.y;
      owned += 1;

      const column = index % grid.size;
      const row = Math.floor(index / grid.size);
      const neighbors: number[] = [];
      if (row > 0) neighbors.push(index - grid.size);
      if (row < grid.size - 1) neighbors.push(index + grid.size);
      if (column > 0) neighbors.push(index - 1);
      if (column < grid.size - 1) neighbors.push(index + 1);
      if (neighbors.some((neighbor) => grid.owner(neighbor) !== bot.territoryKey)) points.push(point);
    }

    memory.boundaryRevision = grid.revision;
    memory.boundaryPoints = points;
    memory.territoryCentroid =
      owned > 0 ? { x: sumX / owned, y: sumY / owned } : { x: bot.x, y: bot.y };
  }

  private boundaryOutward(
    bot: PlayerEntity,
    grid: TerritoryGrid,
    point: Vec2,
    centroid: Vec2
  ): Vec2 {
    const index = grid.worldToIndex(point.x, point.y);
    if (index < 0) {
      return normalized({ x: point.x - centroid.x, y: point.y - centroid.y });
    }

    const column = index % grid.size;
    const row = Math.floor(index / grid.size);
    let x = 0;
    let y = 0;

    if (column === 0 || grid.owner(index - 1) !== bot.territoryKey) x -= 1;
    if (column === grid.size - 1 || grid.owner(index + 1) !== bot.territoryKey) x += 1;
    if (row === 0 || grid.owner(index - grid.size) !== bot.territoryKey) y -= 1;
    if (row === grid.size - 1 || grid.owner(index + grid.size) !== bot.territoryKey) y += 1;

    const local = normalized({ x, y });
    if (local.x !== 0 || local.y !== 0) return local;
    return normalized({ x: point.x - centroid.x, y: point.y - centroid.y });
  }

  private findOwnedSetupPoint(
    bot: PlayerEntity,
    grid: TerritoryGrid,
    exit: Vec2,
    centroid: Vec2
  ): Vec2 {
    const inward = normalized({ x: centroid.x - exit.x, y: centroid.y - exit.y });
    for (let distance = EXPANSION_SETUP_DISTANCE; distance >= 16; distance -= 8) {
      const point = {
        x: exit.x + inward.x * distance,
        y: exit.y + inward.y * distance
      };
      if (grid.owner(grid.worldToIndex(point.x, point.y)) === bot.territoryKey) return point;
    }
    return exit;
  }

  private closestBoundaryPoint(
    boundary: readonly Vec2[],
    desired: Vec2,
    origin: Vec2,
    minimumDistance: number,
    outward?: Vec2,
    centroid?: Vec2
  ): Vec2 | null {
    let best: Vec2 | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const minimumSquared = minimumDistance * minimumDistance;

    for (const point of boundary) {
      if (distanceSquared(point, origin) < minimumSquared) continue;
      if (outward && centroid) {
        const candidateOutward = normalized({
          x: point.x - centroid.x,
          y: point.y - centroid.y
        });
        if (candidateOutward.x * outward.x + candidateOutward.y * outward.y < 0.18) continue;
      }
      const distance = distanceSquared(point, desired);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = point;
    }
    return best;
  }

  private chooseTrailRisk(
    bot: PlayerEntity,
    players: readonly PlayerEntity[],
    memory: BotMemory
  ): number {
    const [minimum, maximum] = memory.profile.trailRisk;
    const leader = this.leaderTerritory(players);
    const behind = leader > 0 ? clamp01(1 - bot.territoryCells / leader) : 0;
    const greedAdjustment = behind * memory.profile.expansionGreed * mapCells(8);
    const leadingReduction =
      leader > 0 && bot.territoryCells >= leader * 0.96
        ? memory.profile.caution * mapCells(5)
        : 0;
    return Math.max(
      mapCells(12),
      Math.round(this.random.range(minimum, maximum) + greedAdjustment - leadingReduction)
    );
  }

  private leaderTerritory(players: readonly PlayerEntity[]): number {
    let leader = 0;
    for (const player of players) if (player.alive) leader = Math.max(leader, player.territoryCells);
    return leader;
  }

  private travelTime(player: PlayerEntity, point: Vec2): number {
    const distance = Math.sqrt(distanceSquared(player, point));
    const turn = Math.abs(normalizeAngle(this.angleToward(player, point) - player.angle));
    return distance / GAME.playerSpeed + turn / GAME.maximumTurnRate;
  }

  private steerToward(bot: PlayerEntity, point: Vec2, bias = 0): void {
    bot.targetAngle = normalizeAngle(this.angleToward(bot, point) + bias);
  }

  private angleToward(origin: Vec2, target: Vec2): number {
    return Math.atan2(target.y - origin.y, target.x - origin.x);
  }

  private transition(
    memory: BotMemory,
    state: BotState,
    now: number,
    commitmentMs: number
  ): void {
    if (memory.state !== state) {
      memory.state = state;
      memory.stateEnteredAt = now;
    }
    memory.commitmentUntil = Math.max(memory.commitmentUntil, now + commitmentMs);
  }

  private memoryFor(bot: PlayerEntity, now: number): BotMemory {
    const existing = this.memory.get(bot.id);
    if (existing) return existing;

    const profile = PROFILES[this.roleFor(bot)];
    const created: BotMemory = {
      profile,
      state: 'setup',
      stateEnteredAt: now,
      nextThinkAt: 0,
      commitmentUntil: 0,
      riskCells: this.random.integer(profile.trailRisk[0], profile.trailRisk[1] + 1),
      plan: null,
      hunt: null,
      returnPoint: null,
      evadeUntil: 0,
      evadeAngle: bot.angle,
      lastWaypointDistance: Number.POSITIVE_INFINITY,
      lastSpawnedAt: bot.spawnedAt,
      failedPlans: 0,
      boundaryRevision: -1,
      boundaryPoints: [],
      territoryCentroid: { x: bot.x, y: bot.y },
      pendingThreatId: null,
      pendingThreatSince: 0,
      wasDrawing: bot.drawing
    };
    this.memory.set(bot.id, created);
    return created;
  }

  private resetAfterRespawn(bot: PlayerEntity, memory: BotMemory, now: number): void {
    memory.state = 'setup';
    memory.stateEnteredAt = now;
    memory.nextThinkAt = now;
    memory.commitmentUntil = now + 180;
    memory.plan = null;
    memory.hunt = null;
    memory.returnPoint = null;
    memory.evadeUntil = 0;
    memory.evadeAngle = bot.angle;
    memory.lastWaypointDistance = Number.POSITIVE_INFINITY;
    memory.lastSpawnedAt = bot.spawnedAt;
    memory.failedPlans = 0;
    memory.boundaryRevision = -1;
    memory.boundaryPoints = [];
    memory.territoryCentroid = { x: bot.x, y: bot.y };
    memory.pendingThreatId = null;
    memory.pendingThreatSince = 0;
    memory.wasDrawing = bot.drawing;
  }

  private roleFor(bot: PlayerEntity): BotRole {
    if (CUTTERS.has(bot.name)) return 'cutter';
    if (EXPANDERS.has(bot.name)) return 'expander';
    if (SURVIVORS.has(bot.name)) return 'survivor';
    return 'opportunist';
  }
}

function project(origin: Vec2, angle: number, distance: number): Vec2 {
  return {
    x: origin.x + Math.cos(angle) * distance,
    y: origin.y + Math.sin(angle) * distance
  };
}

function normalized(vector: Vec2): Vec2 {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= 0.0001) return { x: 0, y: 0 };
  return { x: vector.x / length, y: vector.y / length };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function closestPointOnSegment(point: Vec2, start: Vec2, end: Vec2): Vec2 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.0001) return start;
  const ratio = clamp01(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared);
  return { x: start.x + dx * ratio, y: start.y + dy * ratio };
}

function pointSegmentDistanceSquared(point: Vec2, start: Vec2, end: Vec2): number {
  return distanceSquared(point, closestPointOnSegment(point, start, end));
}

function segmentDistanceSquared(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): number {
  if (segmentsIntersect(a0, a1, b0, b1)) return 0;
  return Math.min(
    pointSegmentDistanceSquared(a0, b0, b1),
    pointSegmentDistanceSquared(a1, b0, b1),
    pointSegmentDistanceSquared(b0, a0, a1),
    pointSegmentDistanceSquared(b1, a0, a1)
  );
}

function segmentsIntersect(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): boolean {
  const d1 = direction(b0, b1, a0);
  const d2 = direction(b0, b1, a1);
  const d3 = direction(a0, a1, b0);
  const d4 = direction(a0, a1, b1);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

function direction(start: Vec2, end: Vec2, point: Vec2): number {
  return (point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x);
}
