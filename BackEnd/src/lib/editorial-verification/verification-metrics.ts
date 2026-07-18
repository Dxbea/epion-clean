import type { EditorialShadowPublicationDecision } from '@prisma/client';
import type { EditorialVerificationResult } from './types.js';

export interface EditorialVerificationMetricsSnapshot {
  jobsStarted: number;
  jobsSucceeded: number;
  jobsFailed: number;
  jobsDeadLettered: number;
  jobsDelayedByBudget: number;
  lockMisses: number;
  reconciledRuns: number;
  failClosed: number;
  serperRequests: number;
  mistralRequests: number;
  openaiRequests: number;
  sourcesAdded: number;
  documentsEnqueued: number;
  estimatedCostMicros: number;
  lastDurationMs: number | null;
  finalStatuses: Record<string, number>;
  blockingCauses: Record<string, number>;
  shadowDecisions: Record<string, number>;
}

export class EditorialVerificationMetrics {
  private values: EditorialVerificationMetricsSnapshot = {
    jobsStarted: 0, jobsSucceeded: 0, jobsFailed: 0, jobsDeadLettered: 0,
    jobsDelayedByBudget: 0, lockMisses: 0, reconciledRuns: 0, failClosed: 0,
    serperRequests: 0, mistralRequests: 0, openaiRequests: 0, sourcesAdded: 0,
    documentsEnqueued: 0, estimatedCostMicros: 0, lastDurationMs: null,
    finalStatuses: {}, blockingCauses: {}, shadowDecisions: {},
  };

  increment(metric: Exclude<keyof EditorialVerificationMetricsSnapshot, 'lastDurationMs' | 'finalStatuses' | 'blockingCauses' | 'shadowDecisions'>, amount = 1): void {
    this.values[metric] += amount;
  }

  recordResult(result: EditorialVerificationResult): void {
    this.incrementMap(this.values.finalStatuses, result.outcome);
    this.values.sourcesAdded += result.serperDocuments;
    if (result.outcome === 'HUMAN_REVIEW_REQUIRED') this.values.failClosed++;
    for (const reason of result.mistralReasons) this.incrementMap(this.values.blockingCauses, reason);
  }

  recordShadow(decision: EditorialShadowPublicationDecision): void {
    this.incrementMap(this.values.shadowDecisions, decision);
  }

  recordDuration(durationMs: number): void { this.values.lastDurationMs = durationMs; }
  snapshot(): EditorialVerificationMetricsSnapshot {
    return {
      ...this.values,
      finalStatuses: { ...this.values.finalStatuses },
      blockingCauses: { ...this.values.blockingCauses },
      shadowDecisions: { ...this.values.shadowDecisions },
    };
  }

  private incrementMap(target: Record<string, number>, key: string): void {
    target[key] = (target[key] ?? 0) + 1;
  }
}
