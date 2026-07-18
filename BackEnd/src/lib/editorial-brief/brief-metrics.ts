import type { EditorialBriefBatchResult } from './dossier-service.js';

export class EditorialBriefMetrics {
  private values = {
    jobsStarted: 0, jobsSucceeded: 0, jobsFailed: 0, jobsDeadLettered: 0, runLockMisses: 0,
    candidatesSelected: 0, briefsCompleted: 0, dossiersBlocked: 0, evidenceChunks: 0,
    inputTokens: 0, outputTokens: 0, estimatedCostMicros: 0, lastDurationMs: null as number | null,
  };

  increment(metric: 'jobsStarted' | 'jobsSucceeded' | 'jobsFailed' | 'jobsDeadLettered' | 'runLockMisses', amount = 1): void {
    this.values[metric] += amount;
  }

  recordBatch(result: EditorialBriefBatchResult): void {
    this.values.candidatesSelected += result.selectedCandidates;
    this.values.briefsCompleted += result.completed + result.alreadyCompleted;
    this.values.dossiersBlocked += result.blocked;
    this.values.evidenceChunks += result.evidenceChunks;
    this.values.inputTokens += result.results.reduce((sum, item) => sum + (item.inputTokens ?? 0), 0);
    this.values.outputTokens += result.results.reduce((sum, item) => sum + (item.outputTokens ?? 0), 0);
    this.values.estimatedCostMicros += result.results.reduce((sum, item) => sum + (item.estimatedCostMicros ?? 0), 0);
    this.values.lastDurationMs = result.durationMs;
  }

  snapshot() { return { ...this.values }; }
}
