import { Client, Room } from '@colyseus/core';
import {
  GAME,
  MESSAGE,
  type JoinOptions,
  type PlayerMovementMessage
} from '@jinshi-territory/shared';
import { validateLocalIdentity } from '../auth/LocalIdentity.js';
import {
  discordJoinOptions,
  verifyDiscordActivity,
  type AuthenticatedDiscordUser
} from '../auth/DiscordIdentity.js';
import { config } from '../config.js';
import { ArenaLifecycle } from '../lifecycle/ArenaLifecycle.js';
import { arenaMetrics, resetArenaMetrics } from '../lifecycle/ArenaMetrics.js';
import { DeltaBuilder } from '../networking/DeltaBuilder.js';
import { ArenaSimulation } from '../simulation/ArenaSimulation.js';
import { FixedStepClock } from '../simulation/FixedStepClock.js';

export class TerritoryRoom extends Room {
  private readonly readyClients = new Set<string>();
  private readonly lifecycle = new ArenaLifecycle(
    () =>
      new ArenaSimulation({
        ...(config.seed !== undefined ? { seed: config.seed } : {}),
        botTarget: GAME.botTarget,
        onDeath: (playerId, message) =>
          this.clients.find((client) => client.sessionId === playerId)?.send(MESSAGE.death, message)
      })
  );
  private deltaBuilder: DeltaBuilder | undefined;
  private readonly fixedStep = new FixedStepClock(GAME.tickRate, GAME.snapshotRate);
  private lastUpdateAt = performance.now();

  static async onAuth(
    token: string,
    options: Partial<JoinOptions>
  ): Promise<AuthenticatedDiscordUser | true> {
    if (config.nodeEnv !== 'production') return true;
    return verifyDiscordActivity(token, options);
  }

  onCreate(): void {
    this.roomId = 'main';
    this.autoDispose = true;
    this.maxClients = 256;
    this.maxMessagesPerSecond = GAME.movementRateLimit + 10;
    this.setSimulationInterval(() => this.update(), 1000 / GAME.tickRate);
    this.patchRate = null;
    this.onMessage(MESSAGE.movement, (client, message: PlayerMovementMessage) => {
      this.lifecycle.simulation?.applyMovement(client.sessionId, message);
    });
    this.onMessage(MESSAGE.ready, (client) => this.readyClients.add(client.sessionId));
  }

  onJoin(client: Client, rawOptions: unknown, auth: AuthenticatedDiscordUser | true): void {
    if (this.lifecycle.humans.size >= config.maxHumans)
      throw new Error('Arena is at its safety limit');
    const options: JoinOptions =
      auth === true ? validateLocalIdentity(rawOptions) : discordJoinOptions(rawOptions, auth);
    const simulation = this.lifecycle.join(client.sessionId, options);
    arenaMetrics.active = true;
    arenaMetrics.humans = simulation.humanCount;
    arenaMetrics.bots = simulation.botCount;
    this.deltaBuilder ??= new DeltaBuilder(simulation);
  }

  async onDrop(client: Client): Promise<void> {
    if (this.lifecycle.humans.size > 1) {
      try {
        await this.allowReconnection(client, 5);
      } catch {
        // onLeave removes the player after the short grace period.
      }
    }
  }

  onLeave(client: Client): void {
    this.readyClients.delete(client.sessionId);
    this.deltaBuilder?.forgetClient(client.sessionId);
    this.lifecycle.leave(client.sessionId);
    arenaMetrics.humans = this.lifecycle.simulation?.humanCount ?? 0;
    arenaMetrics.bots = this.lifecycle.simulation?.botCount ?? 0;
    arenaMetrics.active = this.lifecycle.simulation !== undefined;
    if (!this.lifecycle.simulation) this.deltaBuilder = undefined;
  }

  onDispose(): void {
    this.readyClients.clear();
    this.deltaBuilder?.clear();
    this.lifecycle.shutdown();
    resetArenaMetrics();
    this.deltaBuilder = undefined;
  }

  private update(): void {
    const simulation = this.lifecycle.simulation;
    if (!simulation) return;
    const updateAt = performance.now();
    const elapsedMs = updateAt - this.lastUpdateAt;
    this.lastUpdateAt = updateAt;
    arenaMetrics.simulationCallbacks += 1;
    const startedAt = performance.now();
    const timing = this.fixedStep.advance(elapsedMs, (deltaSeconds, now) =>
      simulation.step(deltaSeconds, now)
    );
    if (timing.steps === 0) return;
    arenaMetrics.simulationSteps += timing.steps;
    const perStepMs = (performance.now() - startedAt) / timing.steps;
    arenaMetrics.tickAverageMs =
      arenaMetrics.tickAverageMs === 0
        ? perStepMs
        : arenaMetrics.tickAverageMs + (perStepMs - arenaMetrics.tickAverageMs) * 0.05;
    arenaMetrics.tickWorstMs = Math.max(arenaMetrics.tickWorstMs * 0.995, perStepMs);
    arenaMetrics.catchUpSteps = timing.steps;
    arenaMetrics.discardedTimeMs += timing.discardedMs;
    arenaMetrics.humans = simulation.humanCount;
    arenaMetrics.bots = simulation.botCount;
    if (!timing.snapshotDue) return;
    for (const client of this.clients) {
      if (!this.readyClients.has(client.sessionId)) continue;
      const message = this.deltaBuilder?.forClient(client.sessionId, Date.now());
      if (!message) continue;
      client.send(
        message.kind === 'init' ? MESSAGE.worldInit : MESSAGE.worldDelta,
        message.payload
      );
      arenaMetrics.snapshotsSent += 1;
    }
  }
}
