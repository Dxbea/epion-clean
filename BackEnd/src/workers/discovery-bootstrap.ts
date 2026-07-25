import { DiscoveryConnectorRegistry } from '../lib/discovery/connector-registry.js';
import {
  AtomDiscoveryConnector,
  GdeltDiscoveryConnector,
  GoogleNewsRssDiscoveryConnector,
  RssDiscoveryConnector,
  SitemapDiscoveryConnector,
  SitemapIndexDiscoveryConnector,
} from '../lib/discovery/connectors/index.js';

export function createWorkerDiscoveryConnectorRegistry(): DiscoveryConnectorRegistry {
  const registry = new DiscoveryConnectorRegistry();
  registry.register(new RssDiscoveryConnector());
  registry.register(new AtomDiscoveryConnector());
  registry.register(new SitemapDiscoveryConnector());
  registry.register(new SitemapIndexDiscoveryConnector());
  registry.register(new GdeltDiscoveryConnector());
  registry.register(new GoogleNewsRssDiscoveryConnector());
  return registry;
}
