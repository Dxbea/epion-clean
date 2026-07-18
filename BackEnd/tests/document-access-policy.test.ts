import { describe, expect, it } from 'vitest';
import { evaluateDocumentPolicy } from '../src/lib/document-corpus/access-policy.js';

describe('document corpus access and storage policies', () => {
  it('blocks metadata-only and explicitly blocked documents before network access', () => {
    expect(evaluateDocumentPolicy({
      accessPolicy: 'METADATA_ONLY',
      storagePolicy: 'FULL_TEXT',
    })).toMatchObject({ acquisition: 'BLOCK', reason: 'access_policy_metadata_only' });
    expect(evaluateDocumentPolicy({
      accessPolicy: 'BLOCKED',
      storagePolicy: 'FULL_TEXT',
    })).toMatchObject({ acquisition: 'BLOCK', reason: 'access_policy_blocked' });
  });

  it('uses only already discovered content for FEED_ONLY', () => {
    expect(evaluateDocumentPolicy({
      accessPolicy: 'FEED_ONLY',
      storagePolicy: 'EXCERPT_ONLY',
    })).toEqual({
      acquisition: 'USE_EXISTING',
      persistence: 'EXCERPT',
      shouldIndex: true,
      requiresRobotsCheck: false,
      reason: 'feed_content_only',
    });
  });

  it('requires an explicit positive decision for licensed content', () => {
    expect(evaluateDocumentPolicy({
      accessPolicy: 'LICENSED',
      storagePolicy: 'FULL_TEXT',
      licenseDecision: null,
    })).toMatchObject({ acquisition: 'BLOCK', reason: 'license_not_approved' });
    expect(evaluateDocumentPolicy({
      accessPolicy: 'LICENSED',
      storagePolicy: 'FULL_TEXT',
      licenseDecision: 'licensed',
    })).toMatchObject({ acquisition: 'FETCH', requiresRobotsCheck: true });
  });

  it('allows transient processing but never persistence or indexing', () => {
    expect(evaluateDocumentPolicy({
      accessPolicy: 'OFFICIAL_API',
      storagePolicy: 'TRANSIENT',
    })).toEqual({
      acquisition: 'FETCH',
      persistence: 'NONE',
      shouldIndex: false,
      requiresRobotsCheck: false,
      reason: 'transient_processing_only',
    });
  });
});
