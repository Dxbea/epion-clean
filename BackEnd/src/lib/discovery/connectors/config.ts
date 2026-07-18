import type { DiscoveryConnectorType, DiscoverySourceConfig } from '../types.js';

const MAX_ITEMS_PER_RUN = 1_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;

export class DiscoveryConnectorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscoveryConnectorConfigError';
  }
}

export function validateConnectorConfig(
  config: DiscoverySourceConfig,
  expectedType: DiscoveryConnectorType,
): void {
  if (config.connectorType !== expectedType) {
    throw new DiscoveryConnectorConfigError(
      `Expected ${expectedType} discovery source, received ${config.connectorType}`,
    );
  }

  assertHttpEndpoint(
    config.endpoint,
    config.configuration?.allowPrivateNetwork === true,
  );

  if (!Number.isInteger(config.maxItemsPerRun) ||
      config.maxItemsPerRun < 1 ||
      config.maxItemsPerRun > MAX_ITEMS_PER_RUN) {
    throw new DiscoveryConnectorConfigError(
      `maxItemsPerRun must be an integer between 1 and ${MAX_ITEMS_PER_RUN}`,
    );
  }

  if (!Number.isInteger(config.requestTimeoutMs) ||
      config.requestTimeoutMs < MIN_TIMEOUT_MS ||
      config.requestTimeoutMs > MAX_TIMEOUT_MS) {
    throw new DiscoveryConnectorConfigError(
      `requestTimeoutMs must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}`,
    );
  }
}

export function assertDiscoveryAllowed(config: DiscoverySourceConfig): void {
  if (config.accessPolicy === 'BLOCKED') {
    throw new DiscoveryConnectorConfigError(`Discovery source is blocked: ${config.key}`);
  }
}

export function readIntegerConfig(
  config: DiscoverySourceConfig,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = config.configuration?.[key];
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new DiscoveryConnectorConfigError(
      `${key} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value as number;
}

function assertHttpEndpoint(endpoint: string, allowPrivateNetwork: boolean): void {
  try {
    const parsed = new URL(endpoint);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
        !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('invalid endpoint');
    }
    if (!allowPrivateNetwork && isPrivateHostname(parsed.hostname)) {
      throw new DiscoveryConnectorConfigError(
        'endpoint targets a local or private network; explicit allowPrivateNetwork is required',
      );
    }
  } catch (error) {
    if (error instanceof DiscoveryConnectorConfigError) throw error;
    throw new DiscoveryConnectorConfigError('endpoint must be an absolute HTTP(S) URL without credentials');
  }
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) {
    return true;
  }
  if (normalized.includes(':') && (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  )) {
    return true;
  }

  const octets = normalized.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  return octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}
