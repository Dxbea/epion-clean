import { resolveDocumentPipelineRuntimeFlags } from '../document-corpus/runtime-flags.js';
import { resolveDiscoveryRuntimeFlags } from '../discovery/runtime-flags.js';
import { resolveEditorialDiscoveryProviderFlags } from '../discovery/editorial-provider-flags.js';
import { resolveEditorialBriefRuntimeFlags } from '../editorial-brief/runtime-flags.js';
import { resolveEditorialDraftRuntimeFlags } from '../editorial-draft/runtime-flags.js';
import { resolveEditorialValidationMode } from '../editorial-draft/validation-mode.js';
import { resolveEditorialShadowRuntimeFlags } from '../editorial-shadow/runtime-flags.js';
import { resolveEditorialVerificationRuntimeFlags } from '../editorial-verification/runtime-flags.js';

export type OperationalReadinessLevel = 'PASS' | 'WARN' | 'FAIL';

export interface OperationalReadinessCheck {
  code: string;
  level: OperationalReadinessLevel;
  detail: string;
}

export interface EditorialOperationalReadinessEvidence {
  database: { ok: boolean; detail: string };
  redis: { ok: boolean; detail: string; activeKillSwitches: string[] };
  publicApi: { ok: boolean; detail: string };
  workers: Array<{ queue: string; count: number; failedJobs: number }>;
  systemUser: { id: string; role: string } | null;
  publicationsToday: number;
  configuredSources: Array<{
    key: string;
    enabled: boolean;
    disabledReason: string | null;
    categoryId: string | null;
    sourceId: string | null;
    sourceDomain: string | null;
  }>;
  availableRadarTypes: string[];
}

export interface EditorialOperationalReadinessReport {
  generatedAt: string;
  mode: 'EDITORIAL_PRODUCTION';
  go: boolean;
  checks: OperationalReadinessCheck[];
  publicationsToday: number;
  remainingDailyPublicationQuota: number;
}

export const REQUIRED_EDITORIAL_WORKER_QUEUES = [
  'editorial-discovery-queue',
  'document-corpus-queue',
  'editorial-shadow-queue',
  'editorial-brief-queue',
  'editorial-draft-queue',
  'editorial-verification-queue',
] as const;

export function evaluateEditorialOperationalReadiness(
  values: NodeJS.ProcessEnv,
  evidence: EditorialOperationalReadinessEvidence,
  now = new Date(),
): EditorialOperationalReadinessReport {
  const checks: OperationalReadinessCheck[] = [];
  const verification = resolveEditorialVerificationRuntimeFlags(values);
  const pipelineFlags = [
    ['DISCOVERY', resolveDiscoveryRuntimeFlags(values)],
    ['DOCUMENT_PIPELINE', resolveDocumentPipelineRuntimeFlags(values)],
    ['EDITORIAL_SHADOW', resolveEditorialShadowRuntimeFlags(values)],
    ['EDITORIAL_BRIEF', resolveEditorialBriefRuntimeFlags(values)],
    ['EDITORIAL_DRAFT', resolveEditorialDraftRuntimeFlags(values)],
    ['EDITORIAL_VERIFICATION', verification],
  ] as const;

  checks.push(values.NODE_ENV === 'production'
    ? pass('ENVIRONMENT', 'NODE_ENV=production')
    : fail('ENVIRONMENT', `NODE_ENV=${values.NODE_ENV ?? '[missing]'}; production is required`));
  for (const [name, flag] of pipelineFlags) {
    checks.push(flag.enabled && !flag.killSwitch
      ? pass(`FLAG:${name}`, 'enabled with environment kill switch off')
      : fail(`FLAG:${name}`, `enabled=${flag.enabled}, killSwitch=${flag.killSwitch}`));
  }
  checks.push(verification.automationEnabled && !verification.automationKillSwitch
    ? pass('FLAG:EDITORIAL_AUTOMATION', 'enabled with environment kill switch off')
    : fail('FLAG:EDITORIAL_AUTOMATION', `enabled=${verification.automationEnabled}, killSwitch=${verification.automationKillSwitch}`));
  checks.push(verification.autoPublishEnabled && !verification.autoPublishKillSwitch
    ? pass('FLAG:EDITORIAL_AUTOPUBLISH', 'enabled with environment kill switch off')
    : fail('FLAG:EDITORIAL_AUTOPUBLISH', `enabled=${verification.autoPublishEnabled}, killSwitch=${verification.autoPublishKillSwitch}`));

  const validationMode = resolveEditorialValidationMode(values);
  checks.push(validationMode === 'quality_gate'
    ? pass('PUBLICATION_GATE_MODE', 'EDITORIAL_VALIDATION_MODE=quality_gate')
    : fail('PUBLICATION_GATE_MODE', `validationMode=${validationMode}; quality_gate is required`));
  checks.push(
    verification.autoPublishMaxPerDay === 1
      ? pass('PUBLICATION_DAILY_LIMIT', 'Exactly one automatic publication per UTC day')
      : fail('PUBLICATION_DAILY_LIMIT', `configured=${verification.autoPublishMaxPerDay}; exactly 1 is required`),
  );
  checks.push(
    verification.autoPublishMinimumSources >= 2 && verification.autoPublishMinimumDomains >= 2
      ? pass('PUBLICATION_GATE_THRESHOLDS', `sources>=${verification.autoPublishMinimumSources}, domains>=${verification.autoPublishMinimumDomains}`)
      : fail('PUBLICATION_GATE_THRESHOLDS', 'Publication requires at least two sources and two independent domains'),
  );

  checks.push(evidence.database.ok
    ? pass('POSTGRESQL', evidence.database.detail)
    : fail('POSTGRESQL', evidence.database.detail));
  checks.push(evidence.redis.ok
    ? pass('REDIS', evidence.redis.detail)
    : fail('REDIS', evidence.redis.detail));
  checks.push(evidence.redis.activeKillSwitches.length === 0
    ? pass('REDIS_KILL_SWITCHES', 'All editorial Redis kill switches are inactive')
    : fail('REDIS_KILL_SWITCHES', `Active: ${evidence.redis.activeKillSwitches.join(', ')}`));

  for (const queue of REQUIRED_EDITORIAL_WORKER_QUEUES) {
    const worker = evidence.workers.find((item) => item.queue === queue);
    checks.push(worker && worker.count > 0
      ? pass(`WORKER:${queue}`, `${worker.count} worker(s); failed=${worker.failedJobs}`)
      : fail(`WORKER:${queue}`, 'No BullMQ worker registered'));
  }

  checks.push(
    evidence.systemUser?.role === 'ADMIN'
      ? pass('AUTOPUBLISH_SYSTEM_USER', `ADMIN user ${evidence.systemUser.id}`)
      : fail('AUTOPUBLISH_SYSTEM_USER', evidence.systemUser
          ? `Configured user role is ${evidence.systemUser.role}`
          : 'Configured system user was not found'),
  );
  checks.push(evidence.publicationsToday < 1
    ? pass('AUTOPUBLISH_QUOTA', 'Daily automatic publication quota is available')
    : fail('AUTOPUBLISH_QUOTA', `Already published today: ${evidence.publicationsToday}`));

  const configuredKeys = verification.automationSourceKeys;
  const validSources = evidence.configuredSources.filter((source) =>
    configuredKeys.includes(source.key)
    && source.enabled
    && !source.disabledReason
    && source.categoryId
    && source.sourceId
    && source.sourceDomain);
  const sourceDomains = new Set(validSources.map((source) => source.sourceDomain!.toLowerCase()));
  checks.push(
    configuredKeys.length >= 2
    && validSources.length === configuredKeys.length
    && sourceDomains.size >= 2
      ? pass('EDITORIAL_SOURCES', `${validSources.length} configured sources across ${sourceDomains.size} durable domains`)
      : fail('EDITORIAL_SOURCES', `configured=${configuredKeys.length}, valid=${validSources.length}, durableDomains=${sourceDomains.size}; at least two fully configured independent sources are required`),
  );

  const providerFlags = resolveEditorialDiscoveryProviderFlags(values);
  const enabledRadarTypes = [
    ...(providerFlags.gdeltEnabled && !providerFlags.gdeltKillSwitch ? ['GDELT'] : []),
    ...(providerFlags.googleNewsEnabled && !providerFlags.googleNewsKillSwitch ? ['GOOGLE_NEWS_RSS'] : []),
  ];
  const usableRadarTypes = enabledRadarTypes.filter((type) => evidence.availableRadarTypes.includes(type));
  checks.push(usableRadarTypes.length > 0
    ? pass('EDITORIAL_RADARS', `Available: ${usableRadarTypes.join(', ')}`)
    : fail('EDITORIAL_RADARS', `No low-cost radar is enabled and available; enable GDELT or Google News with its environment kill switch off. env=${enabledRadarTypes.join(', ') || '[none]'}, database=${evidence.availableRadarTypes.join(', ') || '[none]'}`));
  const enabledRadarBudgets = [
    ...(providerFlags.gdeltEnabled && !providerFlags.gdeltKillSwitch
      ? [{ type: 'GDELT', queries: providerFlags.gdeltMaxQueriesPerRun, results: providerFlags.gdeltMaxResultsPerRun }]
      : []),
    ...(providerFlags.googleNewsEnabled && !providerFlags.googleNewsKillSwitch
      ? [{ type: 'GOOGLE_NEWS_RSS', queries: providerFlags.googleNewsMaxQueriesPerRun, results: providerFlags.googleNewsMaxResultsPerRun }]
      : []),
  ];
  const unsafeRadarBudgets = enabledRadarBudgets.filter((radar) =>
    radar.queries > 1 || radar.results > 10);
  checks.push(enabledRadarBudgets.length > 0 && unsafeRadarBudgets.length === 0
    ? pass('EDITORIAL_RADAR_BUDGET', enabledRadarBudgets
        .map((radar) => `${radar.type}: queries=${radar.queries}, results=${radar.results}`)
        .join('; '))
    : fail('EDITORIAL_RADAR_BUDGET', enabledRadarBudgets.length === 0
        ? 'No active radar budget can be validated'
        : `Unsafe: ${unsafeRadarBudgets.map((radar) =>
            `${radar.type}(queries=${radar.queries},results=${radar.results})`).join(', ')}; maximum is 1 query and 10 results per run`));
  checks.push(values.SERPER_API_KEY?.trim()
    ? pass('SERPER_COMPLEMENT', 'Serper complement is configured')
    : warn('SERPER_COMPLEMENT', 'Serper complement is unavailable; low-cost discovery remains required'));

  const publicApiBaseUrl = normalizePublicApiBaseUrl(values.EDITORIAL_PUBLIC_API_BASE_URL);
  checks.push(publicApiBaseUrl
    ? pass('PUBLIC_API', publicApiBaseUrl)
    : fail('PUBLIC_API', 'EDITORIAL_PUBLIC_API_BASE_URL must be an HTTPS origin without credentials'));
  checks.push(evidence.publicApi.ok
    ? pass('PUBLIC_API_HEALTH', evidence.publicApi.detail)
    : fail('PUBLIC_API_HEALTH', evidence.publicApi.detail));

  return {
    generatedAt: now.toISOString(),
    mode: 'EDITORIAL_PRODUCTION',
    checks,
    go: checks.every((check) => check.level !== 'FAIL'),
    publicationsToday: evidence.publicationsToday,
    remainingDailyPublicationQuota: Math.max(0, 1 - evidence.publicationsToday),
  };
}

export function normalizePublicApiBaseUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.search
      || url.hash
      || (url.pathname !== '/' && url.pathname !== '')
    ) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function isOperationalKillSwitchActiveValue(value: string | null): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on';
}

function pass(code: string, detail: string): OperationalReadinessCheck {
  return { code, level: 'PASS', detail };
}
function warn(code: string, detail: string): OperationalReadinessCheck {
  return { code, level: 'WARN', detail };
}
function fail(code: string, detail: string): OperationalReadinessCheck {
  return { code, level: 'FAIL', detail };
}
