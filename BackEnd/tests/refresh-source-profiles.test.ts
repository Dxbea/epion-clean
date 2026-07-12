import { describe, expect, it, vi } from 'vitest';
import {
  detectProfileRefreshReasons,
  parseRefreshSourceProfilesOptions,
  runRefreshSourceProfiles,
  type RefreshableSource,
  type RefreshSourceProfilesOptions,
} from '../src/scripts/refresh-source-profiles.js';

const completeProfile = {
  profileSummary: 'Média national financé par abonnements et publicité.',
  strengths: ['Politique de correction publiée.'],
  vigilancePoints: ['Positionnement éditorial documenté.'],
  externalReferences: [{ label: 'Notice', url: 'https://reference.example/notice' }],
  methodVersion: 'source-profile-v1',
};

function source(overrides: Partial<RefreshableSource> = {}): RefreshableSource {
  return {
    id: 'source-1',
    domain: 'example.com',
    type: 'MEDIA',
    description: 'Média national couvrant l’actualité politique et économique.',
    detectedCountry: 'FR',
    profileData: completeProfile,
    profileVersion: 1,
    profileConfidence: 'MEDIUM',
    lastProfiledAt: new Date('2026-07-01T00:00:00.000Z'),
    publicTrustLabel: 'strong',
    trustScore: 82,
    isConsensusVerified: false,
    ...overrides,
  };
}

function investigation() {
  return {
    reliability: 'HIGH' as const,
    sourceType: 'MEDIA' as const,
    reasoning: 'Profil documenté.',
    politicalBias: 'UNKNOWN' as const,
    biasScore: 0,
    shortBio: 'Média national documenté.',
    profileSummary: 'Média national détenu par Groupe Exemple et financé par abonnements.',
    ownership: 'Groupe Exemple',
    businessModel: 'Abonnements et publicité',
    editorialPositioning: 'Généraliste',
    specialty: 'Actualité nationale',
    strengths: ['Politique de correction publiée.'],
    vigilancePoints: ['Ligne éditoriale documentée à contextualiser.'],
    externalReferences: [{ label: 'Notice', url: 'https://reference.example/notice' }],
  };
}

function options(overrides: Partial<RefreshSourceProfilesOptions> = {}): RefreshSourceProfilesOptions {
  return {
    mode: 'dry-run',
    limit: 1,
    batchSize: 50,
    onlyLowConfidence: false,
    onlyMissingProfile: false,
    json: false,
    ...overrides,
  };
}

function createClient(rows: RefreshableSource[], writable = false) {
  const findMany = vi.fn(async (args: any) => {
    let filtered = args.where?.domain
      ? rows.filter((row) => row.domain === args.where.domain)
      : rows;
    if (args.cursor?.id) {
      const cursorIndex = filtered.findIndex((row) => row.id === args.cursor.id);
      filtered = cursorIndex >= 0 ? filtered.slice(cursorIndex + (args.skip ?? 0)) : [];
    }
    return filtered.slice(0, args.take);
  });
  const update = vi.fn(async () => ({}));
  return {
    client: { source: writable ? { findMany, update } : { findMany } },
    findMany,
    update,
  };
}

describe('refresh-source-profiles CLI', () => {
  it('parses report-only and bounded profiler modes', () => {
    expect(parseRefreshSourceProfilesOptions(['--report-only'])).toMatchObject({ mode: 'report-only', batchSize: 50 });
    expect(parseRefreshSourceProfilesOptions([
      '--dry-run', '--domain', 'https://WWW.Example.com/path', '--limit', '4', '--batch-size', '2',
      '--only-low-confidence', '--json',
    ])).toMatchObject({
      domain: 'example.com', limit: 4, batchSize: 2, onlyLowConfidence: true, json: true,
    });
  });

  it('rejects unknown and positional arguments', () => {
    expect(() => parseRefreshSourceProfilesOptions(['unexpected'])).toThrow('Unexpected CLI argument');
    expect(() => parseRefreshSourceProfilesOptions(['--unknown'])).toThrow('Unexpected CLI argument');
    expect(() => parseRefreshSourceProfilesOptions([])).toThrow('Choose exactly one mode');
    expect(() => parseRefreshSourceProfilesOptions(['--dry-run', '--write', '--limit', '1']))
      .toThrow('Choose exactly one mode');
  });

  it('refuses unbounded dry-run and write modes', () => {
    expect(() => parseRefreshSourceProfilesOptions(['--dry-run']))
      .toThrow('dry-run requires --limit or --domain');
    expect(() => parseRefreshSourceProfilesOptions(['--write']))
      .toThrow('write requires --limit or --domain');
  });
});

describe('profile refresh detection', () => {
  it('detects an absent profileData', () => {
    expect(detectProfileRefreshReasons(source({ profileData: null }))).toContain('profile_data_missing');
  });

  it('detects missing strengths, vigilance points and references', () => {
    const reasons = detectProfileRefreshReasons(source({
      profileData: { profileSummary: 'Résumé suffisamment détaillé.', methodVersion: 'source-profile-v1' },
    }));
    expect(reasons).toEqual(expect.arrayContaining([
      'strengths_missing', 'vigilance_points_missing', 'external_references_missing',
    ]));
  });

  it('detects a platform description copied from individual content', () => {
    const reasons = detectProfileRefreshReasons(source({
      domain: 'youtube.com',
      description: 'Investissez avec DEGIRO dans cette vidéo : https://youtu.be/example',
      profileData: completeProfile,
    }));
    expect(reasons).toContain('platform_content_description');
  });
});

describe('profile refresh execution safety', () => {
  it('reports candidates locally without invoking the profiler or writes', async () => {
    const fixture = source({ profileData: null, profileConfidence: 'LOW' });
    const { client, update } = createClient([fixture], true);
    const profiler = vi.fn(async () => investigation());

    const report = await runRefreshSourceProfiles(
      client as any,
      options({ mode: 'report-only', limit: undefined }),
      profiler,
    );

    expect(report).toMatchObject({ sourcesScanned: 1, candidatesFound: 1, wouldRefresh: 1, refreshed: 0 });
    expect(profiler).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(report.samples[0].after).toBeNull();
  });

  it('refuses programmatic unbounded profiler execution', async () => {
    const { client } = createClient([source({ profileData: null })]);
    await expect(runRefreshSourceProfiles(
      client as any,
      options({ mode: 'dry-run', limit: undefined }),
      async () => investigation(),
    )).rejects.toThrow('dry-run requires --limit or --domain');
  });

  it('performs no write in dry-run', async () => {
    const fixture = source({ profileData: null, profileConfidence: 'LOW' });
    const { client, update } = createClient([fixture], true);

    const report = await runRefreshSourceProfiles(client as any, options(), async () => investigation());

    expect(report).toMatchObject({ sourcesScanned: 1, candidatesFound: 1, wouldRefresh: 1, refreshed: 0 });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses write mode without an explicit write client', async () => {
    const { client } = createClient([source({ profileData: null })]);
    await expect(runRefreshSourceProfiles(client as any, options({ mode: 'write' }), async () => investigation()))
      .rejects.toThrow('requires an explicit write client');
  });

  it('writes only descriptive Source fields and never touches scores or article models', async () => {
    const fixture = source({ profileData: null, trustScore: 91 });
    const { client, update } = createClient([fixture], true);
    const articleUpdate = vi.fn();
    const articleSourceUpdate = vi.fn();
    Object.assign(client, { article: { update: articleUpdate }, articleSource: { update: articleSourceUpdate } });

    const report = await runRefreshSourceProfiles(client as any, options({ mode: 'write' }), async () => investigation());

    expect(report.refreshed).toBe(1);
    expect(update).toHaveBeenCalledOnce();
    const data = update.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual([
      'lastProfiledAt', 'profileConfidence', 'profileData', 'profileVersion',
    ]);
    expect(data).not.toHaveProperty('trustScore');
    expect(articleUpdate).not.toHaveBeenCalled();
    expect(articleSourceUpdate).not.toHaveBeenCalled();
  });

  it('applies --domain without scanning unrelated sources', async () => {
    const rows = [
      source({ id: 'a', domain: 'first.example', profileData: null }),
      source({ id: 'b', domain: 'target.example', profileData: null }),
    ];
    const { client, findMany } = createClient(rows);

    const report = await runRefreshSourceProfiles(
      client as any,
      options({ domain: 'target.example' }),
      async () => investigation(),
    );

    expect(report.sourcesScanned).toBe(1);
    expect(report.samples[0].domain).toBe('target.example');
    expect(findMany.mock.calls[0][0].where).toEqual({ domain: 'target.example' });
  });

  it('respects --limit and --batch-size during cursor pagination', async () => {
    const rows = [1, 2, 3, 4].map((index) => source({
      id: `source-${index}`,
      domain: `source-${index}.example`,
      profileData: null,
    }));
    const { client, findMany } = createClient(rows);

    const report = await runRefreshSourceProfiles(
      client as any,
      options({ limit: 3, batchSize: 2 }),
      async () => investigation(),
    );

    expect(report.sourcesScanned).toBe(3);
    expect(report.lastCursor).toBe('source-3');
    expect(findMany.mock.calls.map((call) => call[0].take)).toEqual([2, 1]);
  });
});
