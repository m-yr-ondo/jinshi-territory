import { GAME, normalizeAngle, type PlayerEntity } from '@jinshi-territory/shared';
import type { Random } from './Random.js';
import type { TerritoryGrid } from './TerritoryGrid.js';

interface BotMemory {
  nextThinkAt: number;
  riskCells: number;
  wanderAngle: number;
  aggression: number;
}

export class BotSystem {
  private readonly memory = new Map<string, BotMemory>();

  constructor(private readonly random: Random) {}

  update(
    bot: PlayerEntity,
    players: Iterable<PlayerEntity>,
    grid: TerritoryGrid,
    now: number
  ): void {
    const memory = this.memoryFor(bot);
    if (now < memory.nextThinkAt) return;
    memory.nextThinkAt = now + GAME.botThinkIntervalMs + this.random.range(-45, 70);

    const radius = Math.hypot(bot.x, bot.y);
    if (radius > GAME.arenaRadius - 150) {
      bot.targetAngle = Math.atan2(-bot.y, -bot.x) + this.random.range(-0.18, 0.18);
      return;
    }

    if (memory.aggression > 0.55) {
      const target = this.nearestEnemyTrail(bot, players, 330);
      if (target) {
        bot.targetAngle = Math.atan2(target.y - bot.y, target.x - bot.x);
        return;
      }
    }

    if (bot.drawing) {
      if (bot.trailCells.size >= memory.riskCells) {
        const home = grid.nearestOwnedCell(bot.territoryKey, bot);
        if (home) {
          bot.targetAngle = Math.atan2(home.y - bot.y, home.x - bot.x);
          return;
        }
      }
      bot.targetAngle = normalizeAngle(bot.targetAngle + this.random.range(-0.22, 0.22));
      return;
    }

    memory.riskCells = Math.round(this.random.range(14, 42) * (1 + memory.aggression * 0.5));
    memory.wanderAngle = normalizeAngle(
      bot.angle + this.random.range(-Math.PI * 0.72, Math.PI * 0.72)
    );
    bot.targetAngle = memory.wanderAngle;
  }

  clear(): void {
    this.memory.clear();
  }

  private memoryFor(bot: PlayerEntity): BotMemory {
    const existing = this.memory.get(bot.id);
    if (existing) return existing;
    const created: BotMemory = {
      nextThinkAt: 0,
      riskCells: this.random.integer(14, 38),
      wanderAngle: bot.angle,
      aggression: this.random.next()
    };
    this.memory.set(bot.id, created);
    return created;
  }

  private nearestEnemyTrail(
    bot: PlayerEntity,
    players: Iterable<PlayerEntity>,
    maximumDistance: number
  ): { x: number; y: number } | undefined {
    let nearest: { x: number; y: number } | undefined;
    let nearestSquared = maximumDistance * maximumDistance;
    for (const rival of players) {
      if (!rival.alive || rival.id === bot.id || rival.trail.length === 0) continue;
      for (let index = 0; index < rival.trail.length; index += 4) {
        const point = rival.trail[index];
        if (!point) continue;
        const dx = point.x - bot.x;
        const dy = point.y - bot.y;
        const distance = dx * dx + dy * dy;
        if (distance < nearestSquared) {
          nearestSquared = distance;
          nearest = point;
        }
      }
    }
    return nearest;
  }
}
