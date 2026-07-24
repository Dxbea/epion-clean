import { describe, expect, it, vi } from 'vitest';
import {
  buildEditorialVerificationJobId,
  enqueueEditorialVerificationJob,
  prepareEditorialVerificationJob,
} from '../src/lib/editorial-verification/verification-queue.js';
import { resolveEditorialVerificationRuntimeFlags } from '../src/lib/editorial-verification/runtime-flags.js';

describe('editorial verification queue', () => {
  it('is disabled and kill-switched by default', () => {
    expect(resolveEditorialVerificationRuntimeFlags({})).toMatchObject({ enabled: false, killSwitch: true });
  });

  it('uses a deterministic id independent of enqueue time and trigger', async () => {
    const first = prepareEditorialVerificationJob({
      draftId: 'draft-1', revisionId: 'revision-1', expectedContentHash: 'hash-1',
      trigger: 'ADMIN', requestedAt: new Date('2026-07-18T00:00:00Z'),
    });
    const second = { ...first, trigger: 'RECONCILIATION' as const, requestedAt: '2026-07-19T00:00:00.000Z' };
    expect(buildEditorialVerificationJobId(first)).toBe(buildEditorialVerificationJobId(second));
    const add = vi.fn().mockResolvedValue({});
    const jobId = await enqueueEditorialVerificationJob({ add } as never, first);
    expect(add).toHaveBeenCalledWith('verify-editorial-draft', first, { jobId });
  });

  it('changes identity for a controlled retry reason and attempt', () => {
    const first = prepareEditorialVerificationJob({
      draftId: 'draft-1', revisionId: 'revision-1', expectedContentHash: 'hash-1', trigger: 'ADMIN',
    });
    const retry = prepareEditorialVerificationJob({
      draftId: 'draft-1', revisionId: 'revision-1', expectedContentHash: 'hash-1', trigger: 'ADMIN',
      retryReason: 'ARTICLE_SOURCES_INCOMPLETE', retryAttempt: 1,
    });
    expect(retry.mistralPromptVersion).toBe('editorial-mistral-audit-v2');
    expect(buildEditorialVerificationJobId(retry)).not.toBe(buildEditorialVerificationJobId(first));
  });
});
