export const arenaMetrics = {
  active: false,
  humans: 0,
  bots: 0,
  tickAverageMs: 0,
  tickWorstMs: 0,
  catchUpSteps: 0,
  discardedTimeMs: 0,
  simulationCallbacks: 0,
  simulationSteps: 0,
  snapshotsSent: 0
};

export function resetArenaMetrics(): void {
  arenaMetrics.active = false;
  arenaMetrics.humans = 0;
  arenaMetrics.bots = 0;
  arenaMetrics.tickAverageMs = 0;
  arenaMetrics.tickWorstMs = 0;
  arenaMetrics.catchUpSteps = 0;
  arenaMetrics.discardedTimeMs = 0;
  arenaMetrics.simulationCallbacks = 0;
  arenaMetrics.simulationSteps = 0;
  arenaMetrics.snapshotsSent = 0;
}
