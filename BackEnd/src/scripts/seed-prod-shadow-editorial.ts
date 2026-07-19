import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/db.js';
import {
  assertProdShadowSafety,
  PROD_SHADOW_DISCOVERY_SOURCE_KEY,
  readProdShadowFeedUrl,
  requireProdShadowWriteConfirmation,
} from '../lib/editorial-prod-shadow/safety.js';

export { PROD_SHADOW_DISCOVERY_SOURCE_KEY } from '../lib/editorial-prod-shadow/safety.js';

export interface ProdShadowSeedOptions { apply: boolean; enabled: boolean; feedUrl: string | null; }

export function parseProdShadowSeedOptions(argv: string[], values: NodeJS.ProcessEnv = process.env): ProdShadowSeedOptions {
  const apply = argv.includes('--apply');
  const enable = argv.includes('--enable-source');
  const disable = argv.includes('--disable-source');
  if (enable && disable) throw new Error('--enable-source and --disable-source are mutually exclusive');
  if (apply) {
    assertProdShadowSafety(values);
    requireProdShadowWriteConfirmation(argv);
  }
  const feedUrl = values.PROD_SHADOW_EDITORIAL_FEED_URL?.trim() || null;
  if (feedUrl) {
    const parsed = new URL(feedUrl);
    if (parsed.protocol !== 'https:') throw new Error('PROD_SHADOW_EDITORIAL_FEED_URL must use HTTPS');
  }
  return { apply, enabled: enable ? true : disable ? false : false, feedUrl };
}

export async function seedProdShadowEditorial(
  client: PrismaClient,
  options: ProdShadowSeedOptions,
  values: NodeJS.ProcessEnv = process.env,
) {
  assertProdShadowSafety(values);
  const preview = {
    // Keep the test source durable and isolated from the feed host: a production
    // feed domain may already be a real Epion Source and must never be retagged.
    source: { domain: 'prod-shadow-editorial-rss.local', name: 'Epion Production Shadow Feed' },
    discoverySource: { key: PROD_SHADOW_DISCOVERY_SOURCE_KEY, endpoint: options.feedUrl ?? '[PROD_SHADOW_EDITORIAL_FEED_URL]', enabled: options.enabled, connectorType: 'RSS' as const },
  };
  if (!options.apply) return { mode: 'DRY_RUN' as const, shadowOnly: true, maxSources: 1, ...preview };
  const feedUrl = readProdShadowFeedUrl(values);
  const source = await client.source.upsert({
    where: { domain: preview.source.domain },
    create: { domain: preview.source.domain, name: preview.source.name, trustScore: 50, type: 'PROD_SHADOW_TEST', metadata: { productionShadowOnly: true, purpose: 'editorial-shadow-controlled-test' } },
    update: { name: preview.source.name, metadata: { productionShadowOnly: true, purpose: 'editorial-shadow-controlled-test' } },
    select: { id: true, domain: true },
  });
  const discoverySource = await client.discoverySource.upsert({
    where: { key: PROD_SHADOW_DISCOVERY_SOURCE_KEY },
    create: {
      key: PROD_SHADOW_DISCOVERY_SOURCE_KEY, name: 'Epion production shadow RSS', connectorType: 'RSS', endpoint: feedUrl,
      enabled: options.enabled, sourceId: source.id, language: 'fr', country: 'FR', maxItemsPerRun: 1, requestTimeoutMs: 10_000,
      accessPolicy: 'ROBOTS_ALLOWED', storagePolicy: 'EXCERPT_ONLY', configuration: { productionShadowOnly: true, controlledFixture: true, maxDocuments: 1, maxTopics: 1 },
    },
    update: {
      endpoint: feedUrl, enabled: options.enabled, sourceId: source.id, maxItemsPerRun: 1, accessPolicy: 'ROBOTS_ALLOWED', storagePolicy: 'EXCERPT_ONLY',
      disabledReason: options.enabled ? null : 'PROD_SHADOW_MANUAL_DISABLE', configuration: { productionShadowOnly: true, controlledFixture: true, maxDocuments: 1, maxTopics: 1 },
    },
    select: { id: true, key: true, enabled: true, endpoint: true, maxItemsPerRun: true },
  });
  return { mode: 'APPLIED' as const, shadowOnly: true, maxSources: 1, source, discoverySource };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseProdShadowSeedOptions(process.argv.slice(2));
    seedProdShadowEditorial(prisma, options).then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; })
      .finally(() => prisma.$disconnect());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
    void prisma.$disconnect();
  }
}
