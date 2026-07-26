import { describe, expect, it } from 'vitest';
import {
  evaluateEditorialOperationalReadiness,
  isOperationalKillSwitchActiveValue,
  REQUIRED_EDITORIAL_WORKER_QUEUES,
  type EditorialOperationalReadinessEvidence,
} from '../src/lib/editorial-automation/operational-readiness.js';

function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    DISCOVERY_ENABLED: 'true',
    DISCOVERY_KILL_SWITCH: 'false',
    DOCUMENT_PIPELINE_ENABLED: 'true',
    DOCUMENT_PIPELINE_KILL_SWITCH: 'false',
    EDITORIAL_SHADOW_ENABLED: 'true',
    EDITORIAL_SHADOW_KILL_SWITCH: 'false',
    EDITORIAL_BRIEF_ENABLED: 'true',
    EDITORIAL_BRIEF_KILL_SWITCH: 'false',
    EDITORIAL_DRAFT_ENABLED: 'true',
    EDITORIAL_DRAFT_KILL_SWITCH: 'false',
    EDITORIAL_VERIFICATION_WORKER_ENABLED: 'true',
    EDITORIAL_VERIFICATION_KILL_SWITCH: 'false',
    EDITORIAL_AUTOMATION_ENABLED: 'true',
    EDITORIAL_AUTOMATION_KILL_SWITCH: 'false',
    EDITORIAL_AUTOMATION_SOURCE_KEYS: 'source-a,source-b',
    EDITORIAL_AUTOPUBLISH_ENABLED: 'true',
    EDITORIAL_AUTOPUBLISH_KILL_SWITCH: 'false',
    EDITORIAL_AUTOPUBLISH_MAX_PER_DAY: '1',
    EDITORIAL_AUTOPUBLISH_MINIMUM_SOURCES: '2',
    EDITORIAL_AUTOPUBLISH_MINIMUM_DOMAINS: '2',
    EDITORIAL_AUTOPUBLISH_SYSTEM_USER_ID: 'system-admin',
    EDITORIAL_VALIDATION_MODE: 'quality_gate',
    EDITORIAL_GDELT_DISCOVERY_ENABLED: 'true',
    EDITORIAL_GDELT_DISCOVERY_KILL_SWITCH: 'false',
    EDITORIAL_GDELT_MAX_QUERIES_PER_RUN: '1',
    EDITORIAL_GDELT_MAX_RESULTS_PER_RUN: '10',
    EDITORIAL_GOOGLE_NEWS_DISCOVERY_ENABLED: 'false',
    EDITORIAL_GOOGLE_NEWS_DISCOVERY_KILL_SWITCH: 'true',
    EDITORIAL_PUBLIC_API_BASE_URL: 'https://epion.app',
    SERPER_API_KEY: 'configured',
    ...overrides,
  };
}

function evidence(overrides: Partial<EditorialOperationalReadinessEvidence> = {}): EditorialOperationalReadinessEvidence {
  return {
    database: { ok: true, detail: 'PostgreSQL' },
    redis: { ok: true, detail: 'Redis', activeKillSwitches: [] },
    publicApi: { ok: true, detail: 'HTTP 200' },
    workers: REQUIRED_EDITORIAL_WORKER_QUEUES.map((queue) => ({ queue, count: 1, failedJobs: 0 })),
    systemUser: { id: 'system-admin', role: 'ADMIN' },
    publicationsToday: 0,
    configuredSources: [
      { key: 'source-a', enabled: true, disabledReason: null, categoryId: 'cat-a', sourceId: 'durable-a', sourceDomain: 'a.example' },
      { key: 'source-b', enabled: true, disabledReason: null, categoryId: 'cat-b', sourceId: 'durable-b', sourceDomain: 'b.example' },
    ],
    availableRadarTypes: ['GDELT'],
    ...overrides,
  };
}

describe('editorial operational readiness', () => {
  it('accepts only the stable production configuration with one available daily slot', () => {
    const report = evaluateEditorialOperationalReadiness(environment(), evidence());

    expect(report).toMatchObject({
      go: true,
      publicationsToday: 0,
      remainingDailyPublicationQuota: 1,
    });
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PUBLICATION_DAILY_LIMIT', level: 'PASS' }),
      expect.objectContaining({ code: 'AUTOPUBLISH_SYSTEM_USER', level: 'PASS' }),
      expect.objectContaining({ code: 'EDITORIAL_RADARS', level: 'PASS' }),
      expect.objectContaining({ code: 'EDITORIAL_RADAR_BUDGET', level: 'PASS' }),
    ]));
  });

  it('is NO-GO with a clear reason when no low-cost radar is active', () => {
    const report = evaluateEditorialOperationalReadiness(environment({
      EDITORIAL_GDELT_DISCOVERY_ENABLED: 'false',
      EDITORIAL_GDELT_DISCOVERY_KILL_SWITCH: 'true',
      EDITORIAL_GOOGLE_NEWS_DISCOVERY_ENABLED: 'false',
      EDITORIAL_GOOGLE_NEWS_DISCOVERY_KILL_SWITCH: 'true',
    }), evidence());

    expect(report.go).toBe(false);
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'EDITORIAL_RADARS',
        level: 'FAIL',
        detail: expect.stringContaining('enable GDELT or Google News'),
      }),
      expect.objectContaining({
        code: 'EDITORIAL_RADAR_BUDGET',
        level: 'FAIL',
      }),
    ]));
  });

  it('is NO-GO when an active radar exceeds the controlled production budget', () => {
    const report = evaluateEditorialOperationalReadiness(environment({
      EDITORIAL_GDELT_MAX_QUERIES_PER_RUN: '2',
      EDITORIAL_GDELT_MAX_RESULTS_PER_RUN: '20',
    }), evidence());

    expect(report.go).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({
      code: 'EDITORIAL_RADAR_BUDGET',
      level: 'FAIL',
      detail: expect.stringContaining('maximum is 1 query and 10 results'),
    }));
  });

  it('fails closed for a dangerous quota, active Redis switch or missing worker', () => {
    const report = evaluateEditorialOperationalReadiness(
      environment({ EDITORIAL_AUTOPUBLISH_MAX_PER_DAY: '2' }),
      evidence({
        redis: { ok: true, detail: 'Redis', activeKillSwitches: ['epion:editorial-autopublish:kill-switch'] },
        workers: REQUIRED_EDITORIAL_WORKER_QUEUES.slice(1).map((queue) => ({ queue, count: 1, failedJobs: 0 })),
      }),
    );

    expect(report.go).toBe(false);
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PUBLICATION_DAILY_LIMIT', level: 'FAIL' }),
      expect.objectContaining({ code: 'REDIS_KILL_SWITCHES', level: 'FAIL' }),
      expect.objectContaining({ code: `WORKER:${REQUIRED_EDITORIAL_WORKER_QUEUES[0]}`, level: 'FAIL' }),
    ]));
  });

  it('does not require Redis kill-switch keys to be deleted when they contain an inactive value', () => {
    expect([null, '0', 'false', 'off', ''].every((value) =>
      !isOperationalKillSwitchActiveValue(value))).toBe(true);
    expect(['1', 'true', 'on', ' TRUE '].every((value) =>
      isOperationalKillSwitchActiveValue(value))).toBe(true);
  });
});
