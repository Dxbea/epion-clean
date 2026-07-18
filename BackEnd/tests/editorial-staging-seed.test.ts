import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { parseEditorialStagingSeedOptions, seedEditorialStaging, STAGING_DISCOVERY_SOURCE_KEY } from '../src/scripts/seed-editorial-staging.js';

describe('private editorial staging seed', () => {
  it('is dry-run and disabled by default', async () => {
    const options = parseEditorialStagingSeedOptions([], { NODE_ENV: 'staging', STAGING_EDITORIAL_FEED_URL: 'https://staging.example.test/feed.xml' });
    expect(options).toMatchObject({ apply: false, enabled: false });
    await expect(seedEditorialStaging({} as PrismaClient, options, { NODE_ENV: 'staging' })).resolves.toMatchObject({ mode: 'DRY_RUN', discoverySource: { enabled: false } });
  });

  it('requires HTTPS, staging and an explicit confirmation before writes', () => {
    expect(() => parseEditorialStagingSeedOptions(['--apply'], { NODE_ENV: 'staging', STAGING_EDITORIAL_FEED_URL: 'https://example.test/feed' })).toThrow('--confirm=EPION_STAGING_SHADOW');
    expect(() => parseEditorialStagingSeedOptions([], { STAGING_EDITORIAL_FEED_URL: 'http://example.test/feed' })).toThrow('must use HTTPS');
  });

  it('upserts one durable Source and one controlled DiscoverySource', async () => {
    const sourceUpsert = vi.fn().mockResolvedValue({ id: 'source-1', domain: 'staging.example.test' });
    const discoveryUpsert = vi.fn().mockResolvedValue({ id: 'discovery-1', key: STAGING_DISCOVERY_SOURCE_KEY, enabled: true });
    const client = { source: { upsert: sourceUpsert }, discoverySource: { upsert: discoveryUpsert } } as unknown as PrismaClient;
    const options = parseEditorialStagingSeedOptions(
      ['--apply', '--enable-source', '--confirm=EPION_STAGING_SHADOW'],
      { NODE_ENV: 'staging', STAGING_EDITORIAL_FEED_URL: 'https://staging.example.test/feed.xml' },
    );
    await expect(seedEditorialStaging(client, options, { NODE_ENV: 'staging' })).resolves.toMatchObject({ mode: 'APPLIED' });
    expect(sourceUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { domain: 'staging.example.test' } }));
    expect(discoveryUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: STAGING_DISCOVERY_SOURCE_KEY },
      create: expect.objectContaining({ enabled: true, accessPolicy: 'ROBOTS_ALLOWED', storagePolicy: 'EXCERPT_ONLY' }),
    }));
  });
});
