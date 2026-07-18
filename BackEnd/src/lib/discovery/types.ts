import type {
  DiscoveryAccessPolicy,
  DiscoveryConnectorType,
  DiscoveryContentStoragePolicy,
} from '@prisma/client';

export type {
  DiscoveryAccessPolicy,
  DiscoveryConnectorType,
  DiscoveryContentStoragePolicy,
} from '@prisma/client';

export interface DiscoverySourceConfig {
  id: string;
  key: string;
  name: string;
  connectorType: DiscoveryConnectorType;
  endpoint: string;
  enabled: boolean;
  priority: number;
  language?: string | null;
  country?: string | null;
  sourceId?: string | null;
  maxItemsPerRun: number;
  requestTimeoutMs: number;
  rateLimitPerHour?: number | null;
  configuration?: Record<string, unknown> | null;
  cursor?: string | null;
  etag?: string | null;
  lastModified?: string | null;
  accessPolicy: DiscoveryAccessPolicy;
  storagePolicy: DiscoveryContentStoragePolicy;
}

export interface DiscoveryContext {
  source: DiscoverySourceConfig;
  now: Date;
  signal?: AbortSignal;
}

export interface DiscoveredDocumentCandidate {
  externalId?: string;
  url: string;
  canonicalHint?: string;
  title?: string;
  snippet?: string;
  publishedAt?: Date;
  sourceUpdatedAt?: Date;
  language?: string;
  authors?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface DiscoveryBatch {
  candidates: DiscoveredDocumentCandidate[];
  nextCursor?: string;
  etag?: string;
  lastModified?: string;
  rateLimit?: {
    remaining?: number;
    resetAt?: Date;
  };
}

export interface ConnectorHealth {
  status: 'UP' | 'DEGRADED' | 'DOWN';
  checkedAt: Date;
  latencyMs?: number;
  message?: string;
}

export interface DiscoveryConnector {
  readonly type: DiscoveryConnectorType;
  validateConfig(config: DiscoverySourceConfig): void;
  discover(context: DiscoveryContext): Promise<DiscoveryBatch>;
  healthCheck?(context: DiscoveryContext): Promise<ConnectorHealth>;
}
