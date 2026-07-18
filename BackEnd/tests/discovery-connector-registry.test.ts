import { describe, expect, it, vi } from 'vitest';
import { DiscoveryConnectorRegistry } from '../src/lib/discovery/connector-registry.js';
import type {
  DiscoveryConnector,
  DiscoverySourceConfig,
} from '../src/lib/discovery/types.js';

function sourceConfig(overrides: Partial<DiscoverySourceConfig> = {}): DiscoverySourceConfig {
  return {
    id: 'source-1',
    key: 'example-rss',
    name: 'Example RSS',
    connectorType: 'RSS',
    endpoint: 'https://example.com/feed.xml',
    enabled: false,
    priority: 0,
    maxItemsPerRun: 100,
    requestTimeoutMs: 20_000,
    accessPolicy: 'FEED_ONLY',
    storagePolicy: 'METADATA_ONLY',
    ...overrides,
  };
}

function connector(validateConfig = vi.fn()): DiscoveryConnector {
  return {
    type: 'RSS',
    validateConfig,
    discover: vi.fn(async () => ({ candidates: [] })),
  };
}

describe('DiscoveryConnectorRegistry', () => {
  it('registers and resolves an inert connector by type', () => {
    const registry = new DiscoveryConnectorRegistry();
    const rssConnector = connector();

    registry.register(rssConnector);

    expect(registry.get('RSS')).toBe(rssConnector);
    expect(registry.registeredTypes()).toEqual(['RSS']);
  });

  it('rejects duplicate connector implementations', () => {
    const registry = new DiscoveryConnectorRegistry();
    registry.register(connector());

    expect(() => registry.register(connector()))
      .toThrow('Discovery connector already registered: RSS');
  });

  it('requires an implementation before validating a configured source', () => {
    const registry = new DiscoveryConnectorRegistry();

    expect(() => registry.validateSource(sourceConfig()))
      .toThrow('Discovery connector is not registered: RSS');
  });

  it('delegates source validation without running discovery', () => {
    const validateConfig = vi.fn();
    const rssConnector = connector(validateConfig);
    const registry = new DiscoveryConnectorRegistry();
    const config = sourceConfig();
    registry.register(rssConnector);

    registry.validateSource(config);

    expect(validateConfig).toHaveBeenCalledWith(config);
    expect(rssConnector.discover).not.toHaveBeenCalled();
  });
});
