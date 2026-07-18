import type { ControlledEditorialDraftResult } from './draft-service.js';

export class EditorialDraftMetrics {
  private values = {
    jobsStarted: 0, jobsSucceeded: 0, jobsFailed: 0, jobsDeadLettered: 0, lockMisses: 0,
    readyForReview: 0, qualityFailed: 0, claimsReviewed: 0, inputTokens: 0, outputTokens: 0, estimatedCostMicros: 0,
  };
  increment(metric: 'jobsStarted' | 'jobsSucceeded' | 'jobsFailed' | 'jobsDeadLettered' | 'lockMisses', amount = 1): void { this.values[metric] += amount; }
  record(result: ControlledEditorialDraftResult): void {
    if (result.outcome === 'READY_FOR_REVIEW' || result.outcome === 'ALREADY_READY') this.values.readyForReview++;
    if (result.outcome === 'QUALITY_FAILED' || result.outcome === 'ALREADY_FAILED') this.values.qualityFailed++;
    this.values.claimsReviewed += result.claims;
    this.values.inputTokens += result.inputTokens ?? 0;
    this.values.outputTokens += result.outputTokens ?? 0;
    this.values.estimatedCostMicros += result.estimatedCostMicros ?? 0;
  }
  snapshot() { return { ...this.values }; }
}
