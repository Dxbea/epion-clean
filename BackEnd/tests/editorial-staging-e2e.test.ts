import { describe, expect, it } from 'vitest';
import { determineStagingE2ENextStage, parseStagingE2EOptions, type StagingE2EState } from '../src/scripts/editorial-staging-e2e.js';

const complete: StagingE2EState = {
  sourceExists: true, discoveredDocuments: 3, unindexedDocumentIds: [],
  run: { id: 'run-1', status: 'COMPLETED' }, brief: { id: 'brief-1' },
  draft: { id: 'draft-1', status: 'ARTICLE_DRAFT_CREATED', currentRevisionStatus: 'APPROVED', contentHash: 'hash-1', articleStatus: 'DRAFT', humanReviewStatus: 'APPROVED', qualityGateDecision: 'PASSED', qualityGateReasons: [], articleSourcesComplete: true },
  verification: { id: 'verification-1', status: 'PASSED', shadowDecision: 'WOULD_AUTO_PUBLISH', mistralPromptVersion: 'editorial-mistral-audit-v3' },
};

describe('controlled editorial staging E2E planner', () => {
  it('walks every stage without ever containing a publication stage', () => {
    expect(determineStagingE2ENextStage({ ...complete, sourceExists: false, discoveredDocuments: 0 })).toBe('DISCOVERY');
    expect(determineStagingE2ENextStage({ ...complete, unindexedDocumentIds: ['doc-1'] })).toBe('DOCUMENT_INDEXING');
    expect(determineStagingE2ENextStage({ ...complete, run: null, brief: null, draft: null, verification: null })).toBe('CLUSTERING');
    expect(determineStagingE2ENextStage({ ...complete, brief: null, draft: null, verification: null })).toBe('BRIEF');
    expect(determineStagingE2ENextStage({ ...complete, draft: null, verification: null })).toBe('DRAFT');
    expect(determineStagingE2ENextStage({ ...complete, draft: { ...complete.draft!, articleStatus: null }, verification: null })).toBe('WAITING_HUMAN_APPROVAL');
    expect(determineStagingE2ENextStage({ ...complete, verification: null })).toBe('VERIFICATION');
    expect(determineStagingE2ENextStage(complete)).toBe('COMPLETE');
    expect(determineStagingE2ENextStage(complete)).not.toContain('PUBLISH');
  });

  it('is inspection-only unless advance and the staging confirmation are both present', () => {
    expect(parseStagingE2EOptions([]).advance).toBe(false);
    expect(() => parseStagingE2EOptions(['--advance'])).toThrow('--confirm=EPION_STAGING_SHADOW');
    expect(parseStagingE2EOptions(['--advance', '--confirm=EPION_STAGING_SHADOW', '--draft-id=draft-1'])).toMatchObject({ advance: true, draftId: 'draft-1' });
  });

  it('uses only the quality gate when explicitly enabled', () => {
    expect(determineStagingE2ENextStage({
      ...complete,
      draft: { ...complete.draft!, status: 'READY_FOR_REVIEW', currentRevisionStatus: 'GATE_PASSED', articleStatus: null, humanReviewStatus: 'PENDING', qualityGateDecision: 'PASSED', qualityGateReasons: [] },
      verification: null,
    }, { validationMode: 'quality_gate' })).toBe('VERIFICATION');
    expect(determineStagingE2ENextStage({
      ...complete,
      draft: { ...complete.draft!, status: 'QUALITY_FAILED', qualityGateDecision: 'FAILED', qualityGateReasons: ['INSUFFICIENT_INDEPENDENT_DOMAINS'] },
    }, { validationMode: 'quality_gate' })).toBe('QUALITY_GATE_BLOCKED');
    expect(determineStagingE2ENextStage({
      ...complete,
      draft: { ...complete.draft!, status: 'ARTICLE_DRAFT_CREATED', articleStatus: 'DRAFT', humanReviewStatus: 'PENDING', qualityGateDecision: 'PASSED', qualityGateReasons: [] },
      verification: { id: 'verification-1', status: 'PASSED', shadowDecision: 'WOULD_REQUIRE_HUMAN' },
    }, { validationMode: 'quality_gate' })).toBe('COMPLETE');
    expect(determineStagingE2ENextStage({
      ...complete,
      draft: { ...complete.draft!, status: 'ARTICLE_DRAFT_CREATED', articleStatus: 'DRAFT', humanReviewStatus: 'PENDING', qualityGateDecision: 'PASSED', qualityGateReasons: [], articleSourcesComplete: false },
      verification: { id: 'verification-1', status: 'HUMAN_REVIEW_REQUIRED', shadowDecision: null, mistralPromptVersion: 'editorial-mistral-audit-v1' },
    }, { validationMode: 'quality_gate' })).toBe('VERIFICATION');
    expect(determineStagingE2ENextStage({
      ...complete,
      draft: { ...complete.draft!, status: 'ARTICLE_DRAFT_CREATED', articleStatus: 'DRAFT', humanReviewStatus: 'PENDING', qualityGateDecision: 'PASSED', qualityGateReasons: [], articleSourcesComplete: true },
      verification: { id: 'verification-1', status: 'HUMAN_REVIEW_REQUIRED', shadowDecision: null, mistralPromptVersion: 'editorial-mistral-audit-v1' },
    }, { validationMode: 'quality_gate' })).toBe('VERIFICATION_RETRY_REQUIRED');
  });
});
