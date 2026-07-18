import type {
  DiscoveryAccessPolicy,
  DiscoveryContentStoragePolicy,
} from '@prisma/client';

const APPROVED_LICENSE_DECISIONS = new Set([
  'ALLOW',
  'ALLOWED',
  'APPROVED',
  'LICENSED',
]);

export type DocumentAcquisitionMode = 'BLOCK' | 'FETCH' | 'USE_EXISTING';
export type DocumentPersistenceMode = 'NONE' | 'EXCERPT' | 'FULL';

export interface DocumentPolicyInput {
  accessPolicy: DiscoveryAccessPolicy;
  storagePolicy: DiscoveryContentStoragePolicy;
  licenseDecision?: string | null;
}

export interface DocumentPolicyDecision {
  acquisition: DocumentAcquisitionMode;
  persistence: DocumentPersistenceMode;
  shouldIndex: boolean;
  requiresRobotsCheck: boolean;
  reason: string;
}

export function evaluateDocumentPolicy(input: DocumentPolicyInput): DocumentPolicyDecision {
  if (input.accessPolicy === 'BLOCKED') {
    return blocked('access_policy_blocked');
  }
  if (input.accessPolicy === 'METADATA_ONLY') {
    return blocked('access_policy_metadata_only');
  }
  if (input.storagePolicy === 'NONE') {
    return blocked('storage_policy_none');
  }
  if (input.storagePolicy === 'METADATA_ONLY') {
    return blocked('storage_policy_metadata_only');
  }
  if (
    input.accessPolicy === 'LICENSED' &&
    !APPROVED_LICENSE_DECISIONS.has(normalizeLicenseDecision(input.licenseDecision))
  ) {
    return blocked('license_not_approved');
  }

  const acquisition: DocumentAcquisitionMode = input.accessPolicy === 'FEED_ONLY'
    ? 'USE_EXISTING'
    : 'FETCH';
  const persistence = persistenceMode(input.storagePolicy);

  return {
    acquisition,
    persistence,
    shouldIndex: persistence !== 'NONE',
    requiresRobotsCheck: acquisition === 'FETCH' && input.accessPolicy !== 'OFFICIAL_API',
    reason: input.storagePolicy === 'TRANSIENT'
      ? 'transient_processing_only'
      : acquisition === 'USE_EXISTING'
        ? 'feed_content_only'
        : 'fetch_allowed',
  };
}

function persistenceMode(
  storagePolicy: DiscoveryContentStoragePolicy,
): DocumentPersistenceMode {
  if (storagePolicy === 'FULL_TEXT') return 'FULL';
  if (storagePolicy === 'EXCERPT_ONLY') return 'EXCERPT';
  return 'NONE';
}

function normalizeLicenseDecision(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? '';
}

function blocked(reason: string): DocumentPolicyDecision {
  return {
    acquisition: 'BLOCK',
    persistence: 'NONE',
    shouldIndex: false,
    requiresRobotsCheck: false,
    reason,
  };
}
