export interface FixedStepResult {
  steps: number;
  snapshotDue: boolean;
  discardedMs: number;
}

/** Keeps movement deterministic when the host event loop arrives early or late. */
export class FixedStepClock {
  private accumulatorMs = 0;
  private snapshotCredit = 0;
  private simulatedNow: number;

  constructor(
    private readonly tickRate: number,
    private readonly snapshotRate: number,
    startTime = Date.now(),
    private readonly maximumCatchUpSteps = 5
  ) {
    this.simulatedNow = startTime;
  }

  advance(elapsedMs: number, step: (deltaSeconds: number, now: number) => void): FixedStepResult {
    const stepMs = 1000 / this.tickRate;
    const safeElapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : stepMs);
    const maximumAccepted = stepMs * this.maximumCatchUpSteps;
    const acceptedMs = Math.min(safeElapsed, maximumAccepted);
    const discardedMs = Math.max(0, safeElapsed - acceptedMs);
    this.simulatedNow += discardedMs;
    this.accumulatorMs += acceptedMs;

    let steps = 0;
    let snapshotDue = false;
    while (this.accumulatorMs + 0.001 >= stepMs && steps < this.maximumCatchUpSteps) {
      this.accumulatorMs -= stepMs;
      this.simulatedNow += stepMs;
      step(1 / this.tickRate, this.simulatedNow);
      steps += 1;
      this.snapshotCredit += this.snapshotRate;
      if (this.snapshotCredit >= this.tickRate) {
        this.snapshotCredit -= this.tickRate;
        snapshotDue = true;
      }
    }

    return { steps, snapshotDue, discardedMs };
  }
}
