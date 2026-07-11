import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sourceFindUnique: vi.fn(),
  sourceUpsert: vi.fn(),
  analyzeAdsTxt: vi.fn(),
  analyzePluralism: vi.fn(),
  analyzeSemantics: vi.fn(),
  analyzeEditorial: vi.fn(),
  checkMediaReputation: vi.fn(),
  analyzeBias: vi.fn(),
  evaluateUnknownSource: vi.fn(),
}));

vi.mock('../src/lib/db.js', () => ({
  prisma: {
    source: {
      findUnique: mocks.sourceFindUnique,
      upsert: mocks.sourceUpsert,
    },
  },
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../src/lib/ads-scanner.js', () => ({ analyzeAdsTxt: mocks.analyzeAdsTxt }));
vi.mock('../src/lib/scanners/pluralism-scanner.js', () => ({ analyzePluralism: mocks.analyzePluralism }));
vi.mock('../src/lib/semantic-scanner.js', () => ({ analyzeSemantics: mocks.analyzeSemantics }));
vi.mock('../src/lib/scanners/editorial-scanner.js', () => ({ analyzeEditorial: mocks.analyzeEditorial }));
vi.mock('../src/lib/google-fact-check.js', () => ({ checkMediaReputation: mocks.checkMediaReputation }));
vi.mock('../src/lib/scanners/bias-scanner.js', () => ({ analyzeBias: mocks.analyzeBias }));
vi.mock('../src/lib/cold-profiler.js', () => ({ evaluateUnknownSource: mocks.evaluateUnknownSource }));

const { getRichTrustScore } = await import('../src/lib/trust-score.js');

const existingSource = {
  id: 'source-1',
  domain: 'example.com',
  name: 'Example',
  trustScore: 82,
  transparencyScore: 70,
  editorialScore: 70,
  semanticScore: 70,
  pluralismScore: 70,
  pluralismDetails: null,
  politicalBias: 'UNKNOWN',
  biasScore: 0,
  reliability: 'UNKNOWN',
  detectedCountry: null,
  type: 'GENERAL',
  description: null,
  justification: null,
  metadata: null,
  auditCount: 1,
  lastAuditDate: new Date('2020-01-01T00:00:00.000Z'),
  isConsensusVerified: false,
  isAdsTxtValid: false,
  hasFactCheckFailures: false,
  factCheckFailCount: 0,
  isOwnerPublic: false,
  profileData: null,
  profileVersion: null,
  profileConfidence: null,
  lastProfiledAt: null,
  publicTrustLabel: null,
};

describe('trust-score source profile persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sourceFindUnique.mockResolvedValue(existingSource);
    mocks.sourceUpsert.mockImplementation(async ({ update }: { update: Record<string, unknown> }) => ({
      ...existingSource,
      ...update,
    }));
    mocks.analyzeAdsTxt.mockResolvedValue({ score: 70, isAdsTxtValid: true });
    mocks.analyzePluralism.mockResolvedValue({ score: 70, details: null });
    mocks.analyzeSemantics.mockResolvedValue({ score: 70 });
    mocks.analyzeEditorial.mockResolvedValue({ scoreModifier: 0 });
    mocks.checkMediaReputation.mockResolvedValue({ failureCount: 0, recentFailures: false });
    mocks.analyzeBias.mockResolvedValue({ bias: 'UNKNOWN', score: 0, reliability: 'UNKNOWN', detectedCountry: null });
    mocks.evaluateUnknownSource.mockResolvedValue({
      reliability: 'HIGH',
      sourceType: 'MEDIA',
      reasoning: 'Profil construit à partir des résultats disponibles.',
      politicalBias: 'CENTER',
      biasScore: 0,
      shortBio: 'Média généraliste.',
    });
  });

  it('preserves score fields while adding durable source profile fields', async () => {
    const result = await getRichTrustScore('example.com');

    expect(result.durableSourceId).toBe('source-1');

    const call = mocks.sourceUpsert.mock.calls[0][0];
    expect(call.update).toMatchObject({
      trustScore: expect.any(Number),
      reliability: 'HIGH',
      lastAuditDate: expect.any(Date),
      profileVersion: 1,
      profileConfidence: 'LOW',
      lastProfiledAt: expect.any(Date),
      publicTrustLabel: expect.any(String),
    });
    expect(call.update.profileData).toMatchObject({
      description: 'Média généraliste.',
      type: 'Média',
      methodVersion: 'source-profile-v1',
    });
    expect(call.update.profileData).not.toHaveProperty('trustScore');
  });
});
