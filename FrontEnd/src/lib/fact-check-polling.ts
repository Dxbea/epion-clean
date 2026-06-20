export function isFactCheckFailedPollResponse(pollData: unknown): boolean {
  if (!pollData || typeof pollData !== 'object') return false;
  const data = pollData as { status?: unknown; factCheckStatus?: unknown };
  return data.status === 'failed' || data.factCheckStatus === 'FAILED';
}

export function getFactCheckFailureMessage(pollData: unknown): string {
  if (!pollData || typeof pollData !== 'object') return 'Fact-check failed';
  const data = pollData as { factCheckError?: unknown; error?: unknown; message?: unknown };

  if (typeof data.factCheckError === 'string' && data.factCheckError.trim()) {
    return data.factCheckError;
  }

  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error;
  }

  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message;
  }

  return 'Fact-check failed';
}
