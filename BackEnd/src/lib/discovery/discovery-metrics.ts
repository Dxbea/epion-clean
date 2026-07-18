export interface DiscoveryMetricsSnapshot {
  runsStarted: number;
  runsSucceeded: number;
  runsFailed: number;
  candidatesDiscovered: number;
  documentsPersisted: number;
  jobsEnqueued: number;
  jobsDeadLettered: number;
  schedulerLockMisses: number;
  sourceLockMisses: number;
  lastDurationMs: number | null;
}

export class DiscoveryMetrics {
  private values: DiscoveryMetricsSnapshot = {
    runsStarted: 0,
    runsSucceeded: 0,
    runsFailed: 0,
    candidatesDiscovered: 0,
    documentsPersisted: 0,
    jobsEnqueued: 0,
    jobsDeadLettered: 0,
    schedulerLockMisses: 0,
    sourceLockMisses: 0,
    lastDurationMs: null,
  };

  increment(metric: Exclude<keyof DiscoveryMetricsSnapshot, 'lastDurationMs'>, amount = 1): void {
    this.values[metric] += amount;
  }

  recordDuration(durationMs: number): void {
    this.values.lastDurationMs = durationMs;
  }

  snapshot(): DiscoveryMetricsSnapshot {
    return { ...this.values };
  }
}
