import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/db.js';

const WHITELIST_URL = new URL('../../config/rss-institutional-whitelist.json', import.meta.url);

export interface InstitutionalWhitelistSource {
  key: string; name: string; domain: string; rssUrl: string; category: string; country: string;
  institutionType: string; priority: number; language: string; licenseNote: string; validated: true;
  validation: { sampleUrl?: string; checkedAt: string };
}

export interface InstitutionalRssSeedOptions { apply: boolean; enabled: boolean; }

export function parseInstitutionalRssSeedOptions(argv: string[]): InstitutionalRssSeedOptions {
  const enable = argv.includes('--enable');
  const disable = argv.includes('--disable');
  if (enable && disable) throw new Error('--enable and --disable are mutually exclusive');
  return { apply: argv.includes('--apply'), enabled: enable };
}

export async function loadInstitutionalWhitelist(): Promise<InstitutionalWhitelistSource[]> {
  const parsed = JSON.parse(await readFile(WHITELIST_URL, 'utf8')) as { sources?: InstitutionalWhitelistSource[] };
  return (parsed.sources ?? []).filter((source) => source.validated === true);
}

export async function seedInstitutionalRssSources(
  client: Pick<PrismaClient, 'source' | 'discoverySource'>,
  options: InstitutionalRssSeedOptions,
  sources?: InstitutionalWhitelistSource[],
) {
  const whitelist = sources ?? await loadInstitutionalWhitelist();
  const preview = whitelist.map((source) => ({ key: source.key, domain: source.domain, endpoint: source.rssUrl, enabled: options.enabled }));
  if (!options.apply) return { mode: 'DRY_RUN' as const, count: preview.length, sources: preview };
  const seeded = [];
  for (const source of whitelist) {
    const durableSource = await client.source.upsert({
      where: { domain: source.domain },
      create: { domain: source.domain, name: source.name, type: 'INSTITUTIONAL', metadata: { institutional: true, institutionType: source.institutionType, country: source.country, licenseNote: source.licenseNote } },
      update: { name: source.name, metadata: { institutional: true, institutionType: source.institutionType, country: source.country, licenseNote: source.licenseNote } },
      select: { id: true, domain: true },
    });
    seeded.push(await client.discoverySource.upsert({
      where: { key: source.key },
      create: { key: source.key, name: source.name, connectorType: 'RSS', endpoint: source.rssUrl, enabled: options.enabled, priority: source.priority, sourceId: durableSource.id, language: source.language, country: source.country, maxItemsPerRun: 25, requestTimeoutMs: 15_000, rateLimitPerHour: 30, accessPolicy: 'ROBOTS_ALLOWED', storagePolicy: 'FULL_TEXT', licenseNotes: source.licenseNote, configuration: { institutional: true, category: source.category, institutionType: source.institutionType, validatedAt: source.validation.checkedAt, validationSampleUrl: source.validation.sampleUrl ?? null } },
      update: { name: source.name, connectorType: 'RSS', endpoint: source.rssUrl, enabled: options.enabled, priority: source.priority, sourceId: durableSource.id, language: source.language, country: source.country, maxItemsPerRun: 25, requestTimeoutMs: 15_000, rateLimitPerHour: 30, accessPolicy: 'ROBOTS_ALLOWED', storagePolicy: 'FULL_TEXT', licenseNotes: source.licenseNote, disabledReason: options.enabled ? null : 'INSTITUTIONAL_RSS_MANUAL_DISABLE', configuration: { institutional: true, category: source.category, institutionType: source.institutionType, validatedAt: source.validation.checkedAt, validationSampleUrl: source.validation.sampleUrl ?? null } },
      select: { id: true, key: true, enabled: true, endpoint: true },
    }));
  }
  return { mode: 'APPLIED' as const, count: seeded.length, sources: seeded };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseInstitutionalRssSeedOptions(process.argv.slice(2));
  seedInstitutionalRssSources(prisma, options).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
