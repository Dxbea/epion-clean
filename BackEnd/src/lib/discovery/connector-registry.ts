import type {
  DiscoveryConnector,
  DiscoveryConnectorType,
  DiscoverySourceConfig,
} from './types.js';

export class DiscoveryConnectorRegistry {
  private readonly connectors = new Map<DiscoveryConnectorType, DiscoveryConnector>();

  register(connector: DiscoveryConnector): void {
    if (this.connectors.has(connector.type)) {
      throw new Error(`Discovery connector already registered: ${connector.type}`);
    }

    this.connectors.set(connector.type, connector);
  }

  get(type: DiscoveryConnectorType): DiscoveryConnector | undefined {
    return this.connectors.get(type);
  }

  require(type: DiscoveryConnectorType): DiscoveryConnector {
    const connector = this.get(type);
    if (!connector) {
      throw new Error(`Discovery connector is not registered: ${type}`);
    }
    return connector;
  }

  validateSource(config: DiscoverySourceConfig): void {
    this.require(config.connectorType).validateConfig(config);
  }

  registeredTypes(): DiscoveryConnectorType[] {
    return [...this.connectors.keys()];
  }
}

export const discoveryConnectorRegistry = new DiscoveryConnectorRegistry();
