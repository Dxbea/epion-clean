import type { DiscoveryConnectorType } from './types.js';

const DEFAULT_INTERVAL_MS: Record<DiscoveryConnectorType, number> = {
  RSS: 15 * 60_000,
  ATOM: 15 * 60_000,
  SITEMAP: 6 * 60 * 60_000,
  SITEMAP_INDEX: 12 * 60 * 60_000,
  GDELT: 60 * 60_000,
  GOOGLE_NEWS_RSS: 15 * 60_000,
  OFFICIAL_API: 60 * 60_000,
  HTML_LISTING: 60 * 60_000,
  MANUAL: 24 * 60 * 60_000,
};

export function calculateNextDiscoveryRun(
  schedule: string | null | undefined,
  connectorType: DiscoveryConnectorType,
  from: Date,
): Date {
  const intervalMs = parseDiscoveryInterval(schedule, connectorType);
  return new Date(from.getTime() + intervalMs);
}

export function parseDiscoveryInterval(
  schedule: string | null | undefined,
  connectorType: DiscoveryConnectorType,
): number {
  const normalized = schedule?.trim().toLowerCase();
  if (!normalized) return DEFAULT_INTERVAL_MS[connectorType];
  if (normalized === '@hourly') return 60 * 60_000;
  if (normalized === '@daily') return 24 * 60 * 60_000;

  const match = normalized.match(/^@every\s+([1-9]\d*)(m|h|d)$/);
  if (!match) {
    throw new Error('Discovery schedule must use @every <n>m|h|d, @hourly, or @daily');
  }

  const amount = Number(match[1]);
  const multiplier = match[2] === 'm'
    ? 60_000
    : match[2] === 'h'
      ? 60 * 60_000
      : 24 * 60 * 60_000;
  const intervalMs = amount * multiplier;
  if (intervalMs < 60_000 || intervalMs > 30 * 24 * 60 * 60_000) {
    throw new Error('Discovery schedule interval must be between 1 minute and 30 days');
  }
  return intervalMs;
}

export function calculateDiscoveryFailureRetry(
  consecutiveFailures: number,
  from: Date,
): Date {
  const exponent = Math.max(0, Math.min(consecutiveFailures - 1, 6));
  const delayMs = Math.min(5 * 60_000 * (2 ** exponent), 6 * 60 * 60_000);
  return new Date(from.getTime() + delayMs);
}
