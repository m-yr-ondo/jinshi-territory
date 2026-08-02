import { GAME, type JoinOptions } from '@jinshi-territory/shared';
import { ArenaSimulation } from '../simulation/ArenaSimulation.js';

export class ArenaLifecycle {
  simulation: ArenaSimulation | undefined;
  readonly humans = new Set<string>();

  constructor(private readonly factory: () => ArenaSimulation = () => new ArenaSimulation()) {}

  join(id: string, options: JoinOptions, now = Date.now()): ArenaSimulation {
    if (!this.simulation) {
      this.simulation = this.factory();
      this.simulation.start(now);
    }
    this.humans.add(id);
    this.simulation.addHuman(id, options, now);
    this.simulation.ensureBotCount(GAME.botTarget, now);
    return this.simulation;
  }

  leave(id: string): void {
    this.humans.delete(id);
    this.simulation?.removeHuman(id);
    if (this.humans.size === 0) this.shutdown();
  }

  shutdown(): void {
    this.simulation?.stop();
    this.simulation?.clear();
    this.simulation = undefined;
    this.humans.clear();
  }
}
