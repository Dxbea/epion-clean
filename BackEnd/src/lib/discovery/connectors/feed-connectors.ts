import type {
  DiscoveryBatch,
  DiscoveryConnector,
  DiscoveryConnectorType,
  DiscoveryContext,
  DiscoverySourceConfig,
} from '../types.js';
import {
  assertDiscoveryAllowed,
  readIntegerConfig,
  validateConnectorConfig,
} from './config.js';
import { parseFeedXml } from './xml-parsers.js';
import {
  axiosXmlFetcher,
  rootFetchRequest,
  type XmlFetcher,
} from './xml-fetcher.js';

abstract class FeedDiscoveryConnector implements DiscoveryConnector {
  abstract readonly type: 'RSS' | 'ATOM';

  constructor(private readonly fetcher: XmlFetcher = axiosXmlFetcher) {}

  validateConfig(config: DiscoverySourceConfig): void {
    validateConnectorConfig(config, this.type);
    readIntegerConfig(config, 'maxXmlBytes', 5 * 1024 * 1024, 64 * 1024, 20 * 1024 * 1024);
  }

  async discover(context: DiscoveryContext): Promise<DiscoveryBatch> {
    this.validateConfig(context.source);
    assertDiscoveryAllowed(context.source);

    const maxXmlBytes = readIntegerConfig(
      context.source,
      'maxXmlBytes',
      5 * 1024 * 1024,
      64 * 1024,
      20 * 1024 * 1024,
    );
    const response = await this.fetcher.fetch(
      context.source.endpoint,
      rootFetchRequest(context, maxXmlBytes),
    );

    if (response.notModified) {
      return {
        candidates: [],
        etag: response.etag ?? context.source.etag ?? undefined,
        lastModified: response.lastModified ?? context.source.lastModified ?? undefined,
      };
    }

    const candidates = parseFeedXml(
      response.body,
      this.type,
      context.source.endpoint,
      context.source.maxItemsPerRun,
    ).map((candidate) => ({
      ...candidate,
      language: candidate.language ?? context.source.language ?? undefined,
    }));

    return {
      candidates,
      etag: response.etag,
      lastModified: response.lastModified,
    };
  }
}

export class RssDiscoveryConnector extends FeedDiscoveryConnector {
  readonly type = 'RSS' as const;
}

export class AtomDiscoveryConnector extends FeedDiscoveryConnector {
  readonly type = 'ATOM' as const;
}

export function isFeedConnectorType(type: DiscoveryConnectorType): type is 'RSS' | 'ATOM' {
  return type === 'RSS' || type === 'ATOM';
}
