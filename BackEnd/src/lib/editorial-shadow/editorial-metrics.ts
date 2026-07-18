import type { EditorialShadowRunResult } from './editorial-run-service.js';

export interface EditorialShadowMetricsSnapshot {
  jobsStarted: number;
  jobsSucceeded: number;
  jobsFailed: number;
  jobsDeadLettered: number;
  runLockMisses: number;
  documentsConsidered: number;
  topicsCreated: number;
  proposedCandidates: number;
  suppressedCandidates: number;
  quasiDuplicates: number;
  lastDurationMs: number | null;
}

export class EditorialShadowMetrics {
  private values: EditorialShadowMetricsSnapshot = {
    jobsStarted: 0,
    jobsSucceeded: 0,
    jobsFailed: 0,
    jobsDeadLettered: 0,
    runLockMisses: 0,
    documentsConsidered: 0,
    topicsCreated: 0,
    proposedCandidates: 0,
    suppressedCandidates: 0,
    quasiDuplicates: 0,
    lastDurationMs: null,
  };

  increment(
    metric: Exclude<keyof EditorialShadowMetricsSnapshot, 'lastDurationMs'>,
    amount = 1,
  ): void {
    this.values[metric] += amount;
  }

  recordRun(result: EditorialShadowRunResult): void {
    this.values.documentsConsidered += result.documentsConsidered;
    this.values.topicsCreated += result.topicsCreated;
    this.values.proposedCandidates += result.proposedCandidates;
    this.values.suppressedCandidates += result.suppressedCandidates;
    this.values.quasiDuplicates += result.quasiDuplicates;
    this.values.lastDurationMs = result.durationMs;
  }

  snapshot(): EditorialShadowMetricsSnapshot {
    return { ...this.values };
  }
}
