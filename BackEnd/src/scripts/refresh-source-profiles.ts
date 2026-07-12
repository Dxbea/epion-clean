import { fileURLToPath } from 'node:url';
import type { ConfidenceLevel, Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { evaluateUnknownSource, type InvestigationResult } from '../lib/cold-profiler.js';
import {
  buildSourceProfileDataFromTrustScore,
  normalizeSourceDomain,
  resolveSourceProfileConfidence,
  type SourceProfileDataV1,
} from '../lib/source-profile.js';

const CURRENT_METHOD_VERSION = 'source-profile-v1';
const DEFAULT_BATCH_SIZE = 50;
const SAMPLE_LIMIT = 5;

export interface RefreshSourceProfilesOptions {
  mode: 'dry-run' | 'write';
  limit?: number;
  batchSize: number;
  domain?: string;
  onlyLowConfidence: boolean;
  onlyMissingProfile: boolean;
  json: boolean;
}

export interface RefreshableSource {
  id: string;
  domain: string;
  type: string;
  description: string | null;
  detectedCountry: string | null;
  profileData: unknown;
  profileVersion: number | null;
  profileConfidence: ConfidenceLevel | null;
  lastProfiledAt: Date | null;
  publicTrustLabel: string | null;
  trustScore: number;
  isConsensusVerified: boolean;
}

export interface ProfileRefreshSample {
  domain: string;
  reasons: string[];
  before: unknown;
  after: unknown;
}

export interface RefreshSourceProfilesReport {
  sourcesScanned: number;
  candidatesFound: number;
  wouldRefresh: number;
  refreshed: number;
  skipped: number;
  errors: number;
  selectionReasons: Record<string, number>;
  samples: ProfileRefreshSample[];
  lastCursor: string | null;
}

export interface RefreshSourceProfilesReadClient {
  source: {
    findMany(args: any): Promise<RefreshableSource[]>;
  };
}

export interface RefreshSourceProfilesWriteClient extends RefreshSourceProfilesReadClient {
  source: RefreshSourceProfilesReadClient['source'] & {
    update(args: {
      where: { id: string };
      data: {
        profileData: Prisma.InputJsonValue;
        profileVersion: number;
        profileConfidence: ConfidenceLevel;
        lastProfiledAt: Date;
      };
    }): Promise<unknown>;
  };
}

type ProfileSource = (domain: string) => Promise<InvestigationResult>;
type Log = (message: string) => void;

export function parseRefreshSourceProfilesOptions(argv: string[]): RefreshSourceProfilesOptions {
  assertKnownArguments(argv);
  const hasDryRun = argv.includes('--dry-run');
  const hasWrite = argv.includes('--write');
  if (hasDryRun && hasWrite) throw new Error('Choose only one mode: --dry-run or --write.');

  return {
    mode: hasWrite ? 'write' : 'dry-run',
    limit: readPositiveIntegerOption(argv, '--limit'),
    batchSize: readPositiveIntegerOption(argv, '--batch-size') ?? DEFAULT_BATCH_SIZE,
    domain: normalizeRequestedDomain(readStringOption(argv, '--domain')),
    onlyLowConfidence: argv.includes('--only-low-confidence'),
    onlyMissingProfile: argv.includes('--only-missing-profile'),
    json: argv.includes('--json'),
  };
}

export function detectProfileRefreshReasons(source: RefreshableSource): string[] {
  const profile = asRecord(source.profileData);
  const editorialReputation = asRecord(profile.editorialReputation);
  const reasons: string[] = [];

  if (!source.profileData || Object.keys(profile).length === 0) reasons.push('profile_data_missing');
  if (!cleanText(profile.profileSummary)) reasons.push('profile_summary_missing');
  if (!hasNonEmptyArray(editorialReputation.reliabilitySignals) && !hasNonEmptyArray(profile.strengths)) reasons.push('strengths_missing');
  if (!hasNonEmptyArray(profile.vigilancePoints)) reasons.push('vigilance_points_missing');
  if (!hasNonEmptyArray(profile.externalReferences)) reasons.push('external_references_missing');
  if (source.profileConfidence === 'LOW') reasons.push('low_confidence');
  if (isDescriptionTooPoor(source.description, profile.profileSummary)) reasons.push('description_too_short_or_generic');
  if (isPlatformContentDescription(source.domain, source.description, profile)) reasons.push('platform_content_description');
  if (profile.methodVersion !== CURRENT_METHOD_VERSION) reasons.push('method_version_missing_or_old');

  return reasons;
}

export async function runRefreshSourceProfiles(
  client: RefreshSourceProfilesReadClient | RefreshSourceProfilesWriteClient,
  options: RefreshSourceProfilesOptions,
  profileSource: ProfileSource = evaluateUnknownSource,
  log: Log = console.log,
): Promise<RefreshSourceProfilesReport> {
  if (options.mode === 'write' && !isWriteClient(client)) {
    throw new Error('Write mode requires an explicit write client and the --write flag.');
  }

  const report: RefreshSourceProfilesReport = {
    sourcesScanned: 0,
    candidatesFound: 0,
    wouldRefresh: 0,
    refreshed: 0,
    skipped: 0,
    errors: 0,
    selectionReasons: {},
    samples: [],
    lastCursor: null,
  };
  let cursor: string | undefined;

  while (options.limit === undefined || report.sourcesScanned < options.limit) {
    const remaining = options.limit === undefined
      ? options.batchSize
      : Math.min(options.batchSize, options.limit - report.sourcesScanned);
    if (remaining <= 0) break;

    let sources: RefreshableSource[];
    try {
      sources = await client.source.findMany({
        take: remaining,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        ...(options.domain ? { where: { domain: options.domain } } : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true,
          domain: true,
          type: true,
          description: true,
          detectedCountry: true,
          profileData: true,
          profileVersion: true,
          profileConfidence: true,
          lastProfiledAt: true,
          publicTrustLabel: true,
          trustScore: true,
          isConsensusVerified: true,
        },
      });
    } catch (error) {
      report.errors++;
      log(`[ERROR] Source batch read failed: ${errorMessage(error)}`);
      break;
    }

    if (sources.length === 0) break;
    report.sourcesScanned += sources.length;
    cursor = sources[sources.length - 1].id;
    report.lastCursor = cursor;

    for (const source of sources) {
      const allReasons = detectProfileRefreshReasons(source);
      const selectedReasons = filterReasons(allReasons, options);
      if (selectedReasons.length === 0) {
        report.skipped++;
        continue;
      }

      report.candidatesFound++;
      for (const reason of selectedReasons) {
        report.selectionReasons[reason] = (report.selectionReasons[reason] ?? 0) + 1;
      }

      try {
        const investigation = await profileSource(source.domain);
        const rebuiltProfile = buildRebuiltProfile(source, investigation);
        if (!isDocumentedProfile(rebuiltProfile)) {
          report.skipped++;
          log(`[SKIP] ${source.domain}: profiler returned no documented profile.`);
          continue;
        }

        const documented = Boolean(rebuiltProfile?.externalReferences?.length);
        const profileConfidence = resolveSourceProfileConfidence(
          source.profileConfidence,
          source.isConsensusVerified,
          documented,
        ) as ConfidenceLevel;
        const after = {
          profileData: rebuiltProfile,
          profileVersion: Math.max(source.profileVersion ?? 0, 1),
          profileConfidence,
          lastProfiledAt: new Date(),
        };

        report.wouldRefresh++;
        if (report.samples.length < SAMPLE_LIMIT) {
          report.samples.push({
            domain: source.domain,
            reasons: selectedReasons,
            before: {
              profileData: source.profileData,
              profileVersion: source.profileVersion,
              profileConfidence: source.profileConfidence,
              lastProfiledAt: source.lastProfiledAt,
            },
            after,
          });
        }

        if (options.mode === 'write') {
          await (client as RefreshSourceProfilesWriteClient).source.update({
            where: { id: source.id },
            data: {
              profileData: rebuiltProfile as unknown as Prisma.InputJsonValue,
              profileVersion: after.profileVersion,
              profileConfidence: after.profileConfidence,
              lastProfiledAt: after.lastProfiledAt,
            },
          });
          report.refreshed++;
        }
      } catch (error) {
        report.errors++;
        log(`[ERROR] ${source.domain}: ${errorMessage(error)}`);
      }
    }

    if (options.domain || sources.length < remaining) break;
  }

  return report;
}

export function formatRefreshSourceProfilesReport(report: RefreshSourceProfilesReport, json: boolean): string {
  if (json) return JSON.stringify(report, null, 2);
  return [
    'Source profile refresh report',
    `sources scanned: ${report.sourcesScanned}`,
    `candidates found: ${report.candidatesFound}`,
    `would refresh: ${report.wouldRefresh}`,
    `refreshed: ${report.refreshed}`,
    `skipped: ${report.skipped}`,
    `errors: ${report.errors}`,
    `selection reasons: ${JSON.stringify(report.selectionReasons)}`,
    `last cursor: ${report.lastCursor ?? 'none'}`,
    `samples: ${JSON.stringify(report.samples, null, 2)}`,
  ].join('\n');
}

function buildRebuiltProfile(source: RefreshableSource, investigation: InvestigationResult): SourceProfileDataV1 | null {
  return buildSourceProfileDataFromTrustScore({
    domain: source.domain,
    metadata: {
      description: investigation.profileSummary ?? investigation.shortBio ?? source.description,
      country: source.detectedCountry,
      type: source.type,
    },
    profileSummary: investigation.profileSummary,
    ownership: investigation.ownership,
    businessModel: investigation.businessModel,
    editorialPositioning: investigation.editorialPositioning,
    specialty: investigation.specialty,
    coverageArea: investigation.coverageArea,
    generalReputation: investigation.generalReputation,
    misinformationSignals: investigation.misinformationSignals,
    correctionHistory: investigation.correctionHistory,
    editorialPolicy: investigation.editorialPolicy,
    strengths: investigation.strengths,
    vigilancePoints: investigation.vigilancePoints,
    externalReferences: investigation.externalReferences,
  });
}

function filterReasons(reasons: string[], options: RefreshSourceProfilesOptions): string[] {
  if (options.onlyMissingProfile) return reasons.includes('profile_data_missing') ? ['profile_data_missing'] : [];
  if (options.onlyLowConfidence) return reasons.includes('low_confidence') ? ['low_confidence'] : [];
  return reasons;
}

function isDocumentedProfile(profile: SourceProfileDataV1 | null): profile is SourceProfileDataV1 {
  return Boolean(profile?.profileSummary && profile.externalReferences?.length);
}

function isDescriptionTooPoor(description: unknown, profileSummary: unknown): boolean {
  const value = cleanText(profileSummary) ?? cleanText(description);
  if (!value || value.length < 40) return true;
  return /^(média|media|site|source|plateforme|blog|journal)\b.{0,45}$/i.test(value);
}

function isPlatformContentDescription(domain: string, description: unknown, profile: Record<string, unknown>): boolean {
  const normalizedDomain = normalizeSourceDomain(domain);
  const platforms = new Set([
    'youtube.com', 'youtu.be', 'reddit.com', 'x.com', 'twitter.com', 'instagram.com',
    'facebook.com', 'fb.watch', 'tiktok.com', 'dailymotion.com',
  ]);
  if (!normalizedDomain || !platforms.has(normalizedDomain)) return false;

  const value = `${cleanText(profile.profileSummary) ?? ''} ${cleanText(description) ?? ''}`.trim();
  if (!value) return false;
  return /(https?:\/\/|www\.|abonnez-vous|regardez|dans cette vid[ée]o|cette vid[ée]o|ce post|cette publication|investissez|code promo|sponsor)/i.test(value)
    || value.length > 300;
}

function hasNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => {
    if (typeof item === 'string') return item.trim().length > 0;
    return Boolean(item && typeof item === 'object' && Object.keys(item as object).length > 0);
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.replace(/\s+/g, ' ').trim() : undefined;
}

function normalizeRequestedDomain(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const domain = normalizeSourceDomain(value);
  if (!domain) throw new Error('--domain requires a valid domain.');
  return domain;
}

function assertKnownArguments(argv: string[]): void {
  const flags = new Set([
    '--dry-run', '--write', '--only-low-confidence', '--only-missing-profile', '--json',
  ]);
  const valued = new Set(['--limit', '--batch-size', '--domain']);

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (flags.has(argument)) continue;
    if (valued.has(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      index++;
      continue;
    }
    throw new Error(`Unexpected CLI argument: ${argument}. Use named options only.`);
  }
}

function readPositiveIntegerOption(argv: string[], name: string): number | undefined {
  const raw = readStringOption(argv, name);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function readStringOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function isWriteClient(client: RefreshSourceProfilesReadClient | RefreshSourceProfilesWriteClient): client is RefreshSourceProfilesWriteClient {
  return typeof (client.source as { update?: unknown }).update === 'function';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const options = parseRefreshSourceProfilesOptions(process.argv.slice(2));
  if (!options.json) {
    console.log(options.mode === 'write'
      ? '[WRITE] Only descriptive Source profile fields may be updated.'
      : '[DRY-RUN] Default safe mode. No database writes will be performed.');
  }
  try {
    const report = await runRefreshSourceProfiles(prisma, options);
    console.log(formatRefreshSourceProfilesReport(report, options.json));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
