import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { assertStagingShadowSafety, requireStagingWriteConfirmation, STAGING_DISCOVERY_SOURCE_KEY } from '../lib/editorial-staging/safety.js';
export { STAGING_DISCOVERY_SOURCE_KEY } from '../lib/editorial-staging/safety.js';

export interface EditorialStagingSeedOptions {
  apply: boolean;
  enabled: boolean;
  feedUrl: string | null;
}

export function parseEditorialStagingSeedOptions(argv: string[], values: NodeJS.ProcessEnv = process.env): EditorialStagingSeedOptions {
  const apply = argv.includes('--apply');
  const enable = argv.includes('--enable-source');
  const disable = argv.includes('--disable-source');
  if (enable && disable) throw new Error('--enable-source and --disable-source are mutually exclusive');
  if (apply) requireStagingWriteConfirmation(argv);
  const feedUrl = values.STAGING_EDITORIAL_FEED_URL?.trim() || null;
  if (apply && !feedUrl) throw new Error('STAGING_EDITORIAL_FEED_URL is required in apply mode');
  if (feedUrl) {
    const parsed = new URL(feedUrl);
    if (parsed.protocol !== 'https:') throw new Error('STAGING_EDITORIAL_FEED_URL must use HTTPS');
  }
  return { apply, enabled: enable ? true : disable ? false : false, feedUrl };
}

export async function seedEditorialStaging(
  client: PrismaClient,
  options: EditorialStagingSeedOptions,
  values: NodeJS.ProcessEnv = process.env,
) {
  assertStagingShadowSafety(values);
  const preview = {
    source: { domain: options.feedUrl ? new URL(options.feedUrl).hostname.toLowerCase() : 'staging-feed.example.test', name: 'Epion Staging Editorial Feed' },
    discoverySource: { key: STAGING_DISCOVERY_SOURCE_KEY, endpoint: options.feedUrl ?? '[STAGING_EDITORIAL_FEED_URL]', enabled: options.enabled, connectorType: 'RSS' as const },
  };
  if (!options.apply) return { mode: 'DRY_RUN' as const, ...preview };
  const source = await client.source.upsert({
    where: { domain: preview.source.domain },
    create: {
      domain: preview.source.domain, name: preview.source.name, trustScore: 50,
      type: 'STAGING_TEST', metadata: { stagingOnly: true, purpose: 'editorial-shadow-readiness' },
    },
    update: { name: preview.source.name, metadata: { stagingOnly: true, purpose: 'editorial-shadow-readiness' } },
    select: { id: true, domain: true },
  });
  const discoverySource = await client.discoverySource.upsert({
    where: { key: STAGING_DISCOVERY_SOURCE_KEY },
    create: {
      key: STAGING_DISCOVERY_SOURCE_KEY, name: 'Epion staging editorial RSS', connectorType: 'RSS',
      endpoint: options.feedUrl!, enabled: options.enabled, sourceId: source.id, language: 'fr', country: 'FR',
      maxItemsPerRun: 20, requestTimeoutMs: 10_000, accessPolicy: 'ROBOTS_ALLOWED', storagePolicy: 'EXCERPT_ONLY',
      configuration: { stagingOnly: true, controlledFixture: true },
    },
    update: {
      endpoint: options.feedUrl!, enabled: options.enabled, sourceId: source.id,
      accessPolicy: 'ROBOTS_ALLOWED', storagePolicy: 'EXCERPT_ONLY', disabledReason: options.enabled ? null : 'STAGING_MANUAL_DISABLE',
      configuration: { stagingOnly: true, controlledFixture: true },
    },
    select: { id: true, key: true, enabled: true, endpoint: true },
  });
  return { mode: 'APPLIED' as const, source, discoverySource };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseEditorialStagingSeedOptions(process.argv.slice(2));
    seedEditorialStaging(prisma, options).then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; })
      .finally(() => prisma.$disconnect());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
    void prisma.$disconnect();
  }
}
