export interface DocumentPipelineMetricsSnapshot {
  jobsStarted: number;
  jobsSucceeded: number;
  jobsBlocked: number;
  jobsFailed: number;
  jobsDeadLettered: number;
  documentLockMisses: number;
  exactDuplicates: number;
  chunksIndexed: number;
  embeddingInputTokens: number;
  estimatedCostMicros: number;
  lastDurationMs: number | null;
}

export class DocumentPipelineMetrics {
  private values: DocumentPipelineMetricsSnapshot = {
    jobsStarted: 0,
    jobsSucceeded: 0,
    jobsBlocked: 0,
    jobsFailed: 0,
    jobsDeadLettered: 0,
    documentLockMisses: 0,
    exactDuplicates: 0,
    chunksIndexed: 0,
    embeddingInputTokens: 0,
    estimatedCostMicros: 0,
    lastDurationMs: null,
  };

  increment(
    metric: Exclude<keyof DocumentPipelineMetricsSnapshot, 'lastDurationMs'>,
    amount = 1,
  ): void {
    this.values[metric] += amount;
  }

  recordDuration(durationMs: number): void {
    this.values.lastDurationMs = durationMs;
  }

  snapshot(): DocumentPipelineMetricsSnapshot {
    return { ...this.values };
  }
}
