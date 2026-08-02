import {
  GAME,
  advancePlayer,
  interpolateAngle,
  type PlayerSnapshot
} from '@jinshi-territory/shared';

interface TimedSnapshot {
  snapshot: PlayerSnapshot;
  time: number;
}

export class BufferedPlayer {
  private previous: TimedSnapshot;
  private current: TimedSnapshot;
  private predicted: PlayerSnapshot;

  constructor(snapshot: PlayerSnapshot, serverTime: number) {
    this.previous = { snapshot, time: serverTime };
    this.current = { snapshot, time: serverTime };
    this.predicted = clone(snapshot);
  }

  ingest(snapshot: PlayerSnapshot, serverTime: number, local: boolean): void {
    this.previous = this.current;
    this.current = { snapshot, time: serverTime };
    if (!local || !snapshot.alive || snapshot.deaths !== this.predicted.deaths) {
      this.predicted = clone(snapshot);
      return;
    }
    this.predicted = {
      ...snapshot,
      x: this.predicted.x + (snapshot.x - this.predicted.x) * 0.18,
      y: this.predicted.y + (snapshot.y - this.predicted.y) * 0.18,
      angle: interpolateAngle(this.predicted.angle, snapshot.angle, 0.12)
    };
  }

  render(
    serverNow: number,
    deltaSeconds: number,
    local: boolean,
    targetAngle?: number
  ): PlayerSnapshot {
    if (local) {
      if (!this.current.snapshot.alive) return clone(this.current.snapshot);
      const moved = advancePlayer(
        this.predicted,
        targetAngle ?? this.predicted.angle,
        Math.min(deltaSeconds, 0.05)
      );
      this.predicted = { ...this.predicted, ...moved };
      return clone(this.predicted);
    }
    const targetTime = serverNow - GAME.interpolationDelayMs;
    const span = Math.max(1, this.current.time - this.previous.time);
    const ratio = Math.max(0, Math.min(1, (targetTime - this.previous.time) / span));
    const before = this.previous.snapshot;
    const after = this.current.snapshot;
    return {
      ...clone(after),
      x: before.x + (after.x - before.x) * ratio,
      y: before.y + (after.y - before.y) * ratio,
      angle: interpolateAngle(before.angle, after.angle, ratio)
    };
  }
}

function clone(snapshot: PlayerSnapshot): PlayerSnapshot {
  return { ...snapshot, trail: snapshot.trail.map((point) => ({ ...point })) };
}
