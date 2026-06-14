import { describe, it, expect } from 'vitest';
import {
  deriveSupportLevel,
  computeArticleScore,
  computeAnswerScore,
  hashAnalysisInput,
  buildArticleScorePayload,
  buildAnswerScorePayload,
  normalizeArticleScorePayload,
  normalizeAnswerScorePayload,
} from '../src/lib/score-helpers';

// ---------------------------------------------------------------------------
//  deriveSupportLevel
// ---------------------------------------------------------------------------
describe('deriveSupportLevel', () => {
  it('returns very_strong for scores >= 90', () => {
    expect(deriveSupportLevel(90)).toBe('very_strong');
    expect(deriveSupportLevel(100)).toBe('very_strong');
    expect(deriveSupportLevel(95)).toBe('very_strong');
  });

  it('returns strong for scores 70-89', () => {
    expect(deriveSupportLevel(70)).toBe('strong');
    expect(deriveSupportLevel(89)).toBe('strong');
  });

  it('returns nuanced for scores 50-69', () => {
    expect(deriveSupportLevel(50)).toBe('nuanced');
    expect(deriveSupportLevel(69)).toBe('nuanced');
  });

  it('returns fragile for scores 30-49', () => {
    expect(deriveSupportLevel(30)).toBe('fragile');
    expect(deriveSupportLevel(49)).toBe('fragile');
  });

  it('returns unverified for scores 0-29', () => {
    expect(deriveSupportLevel(0)).toBe('unverified');
    expect(deriveSupportLevel(29)).toBe('unverified');
  });

  it('returns unsourced for null/undefined', () => {
    expect(deriveSupportLevel(null)).toBe('unsourced');
    expect(deriveSupportLevel(undefined as any)).toBe('unsourced');
  });

  it('clamps out-of-range values', () => {
    expect(deriveSupportLevel(150)).toBe('very_strong');
    expect(deriveSupportLevel(-10)).toBe('unverified');
  });
});

// ---------------------------------------------------------------------------
//  computeArticleScore
// ---------------------------------------------------------------------------
describe('computeArticleScore', () => {
  it('applies weighted formula: 75% source + 25% content', () => {
    // 80 * 0.75 + 60 * 0.25 = 60 + 15 = 75
    expect(computeArticleScore(80, 60)).toBe(75);
  });

  it('uses contentScore only when sourcesMean is null', () => {
    expect(computeArticleScore(null, 70)).toBe(70);
  });

  it('clamps to 0-100 range', () => {
    expect(computeArticleScore(100, 100)).toBe(100);
    expect(computeArticleScore(0, 0)).toBe(0);
    // Edge: very high values
    expect(computeArticleScore(200, 200)).toBe(100);
  });

  it('handles zero values correctly', () => {
    expect(computeArticleScore(0, 0)).toBe(0);
    expect(computeArticleScore(100, 0)).toBe(75);
    expect(computeArticleScore(0, 100)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
//  computeAnswerScore
// ---------------------------------------------------------------------------
describe('computeAnswerScore', () => {
  it('web mode: applies weighted formula', () => {
    const result = computeAnswerScore(80, 60, 'web');
    // 80 * 0.75 + 60 * 0.25 = 75
    expect(result.score).toBe(75);
    expect(result.formula).toBe('weighted-source-output-v1');
  });

  it('fast mode WITH RAG chunks: uses outputScore only', () => {
    const result = computeAnswerScore(0, 85, 'fast', true);
    expect(result.score).toBe(85);
    expect(result.formula).toBe('output-only-v1');
  });

  it('fast mode WITHOUT RAG chunks: returns null (unsourced)', () => {
    const result = computeAnswerScore(0, 90, 'fast', false);
    expect(result.score).toBeNull();
    expect(result.formula).toBe('unsourced');
  });
});

// ---------------------------------------------------------------------------
//  hashAnalysisInput
// ---------------------------------------------------------------------------
describe('hashAnalysisInput', () => {
  it('produces same hash for identical input', () => {
    const input = { title: 'Test', summary: 'Summary', content: 'Content' };
    const hash1 = hashAnalysisInput(input);
    const hash2 = hashAnalysisInput(input);
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different content', () => {
    const hash1 = hashAnalysisInput({ title: 'A', content: 'X' });
    const hash2 = hashAnalysisInput({ title: 'A', content: 'Y' });
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hash when title changes', () => {
    const hash1 = hashAnalysisInput({ title: 'Title A', content: 'Same' });
    const hash2 = hashAnalysisInput({ title: 'Title B', content: 'Same' });
    expect(hash1).not.toBe(hash2);
  });

  it('includes source domains in hash', () => {
    const hash1 = hashAnalysisInput({ title: 'T', sourceDomains: ['a.com'] });
    const hash2 = hashAnalysisInput({ title: 'T', sourceDomains: ['b.com'] });
    expect(hash1).not.toBe(hash2);
  });

  it('is order-independent for source domains', () => {
    const hash1 = hashAnalysisInput({ title: 'T', sourceDomains: ['a.com', 'b.com'] });
    const hash2 = hashAnalysisInput({ title: 'T', sourceDomains: ['b.com', 'a.com'] });
    expect(hash1).toBe(hash2);
  });

  it('returns a valid SHA-256 hex string', () => {
    const hash = hashAnalysisInput({ title: 'Test' });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
//  buildArticleScorePayload
// ---------------------------------------------------------------------------
describe('buildArticleScorePayload', () => {
  it('returns consistent factCheckScore and factCheckData.score', () => {
    const result = buildArticleScorePayload({
      sourcesMean: 80,
      contentScore: 60,
      contentHash: 'abc123',
      sources: [],
      liveAnalysis: null,
    });

    expect(result.factCheckScore).toBe(result.factCheckData.score);
    expect(result.factCheckData.version).toBe(1);
    expect(result.factCheckData.status).toBe('COMPLETED');
    expect(result.factCheckData.contentHash).toBe('abc123');
  });

  it('includes supportLevel derived from score', () => {
    const result = buildArticleScorePayload({
      sourcesMean: 90,
      contentScore: 95,
      contentHash: 'hash',
      sources: [],
      liveAnalysis: null,
    });

    expect(result.factCheckData.supportLevel).toBe('very_strong');
  });
});

// ---------------------------------------------------------------------------
//  buildAnswerScorePayload
// ---------------------------------------------------------------------------
describe('buildAnswerScorePayload', () => {
  it('web mode produces valid v1 payload', () => {
    const payload = buildAnswerScorePayload({
      sourcesMean: 70,
      outputScore: 80,
      mode: 'web',
      outputAnalysis: { score: 80 },
    });

    expect(payload.version).toBe(1);
    expect(payload.mode).toBe('web');
    expect(payload.score).toBe(73); // 70*0.75 + 80*0.25
    expect(payload.supportLevel).toBe('strong');
  });

  it('fast mode without RAG returns unsourced', () => {
    const payload = buildAnswerScorePayload({
      sourcesMean: 0,
      outputScore: 90,
      mode: 'fast',
      hasRagChunks: false,
      outputAnalysis: null,
    });

    expect(payload.score).toBeNull();
    expect(payload.supportLevel).toBe('unsourced');
  });
});

// ---------------------------------------------------------------------------
//  normalizeArticleScorePayload
// ---------------------------------------------------------------------------
describe('normalizeArticleScorePayload', () => {
  it('returns null for null/undefined input', () => {
    expect(normalizeArticleScorePayload(null, null, null)).toBeNull();
    expect(normalizeArticleScorePayload(undefined, null, null)).toBeNull();
  });

  it('passes through v1 payloads', () => {
    const v1 = {
      version: 1,
      status: 'COMPLETED',
      score: 80,
      supportLevel: 'strong',
      calculation: {
        formula: 'weighted-source-live-v1',
        sourceWeight: 0.75,
        contentWeight: 0.25,
        sourcesMean: 85,
        contentScore: 65,
        finalScore: 80,
      },
      analyzedAt: '2026-01-01T00:00:00Z',
      contentHash: 'hash123',
      sources: [],
      liveAnalysis: null,
    };

    const result = normalizeArticleScorePayload(v1, 80, 'COMPLETED');
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.score).toBe(80);
  });

  it('DB fields override payload when divergent', () => {
    const v1 = {
      version: 1,
      status: 'COMPLETED',
      score: 80,
      supportLevel: 'strong',
      calculation: {} as any,
      analyzedAt: '',
      contentHash: '',
      sources: [],
      liveAnalysis: null,
    };

    // DB has different score and status
    const result = normalizeArticleScorePayload(v1, 75, 'STALE');
    expect(result!.score).toBe(75); // DB wins
    expect(result!.status).toBe('STALE'); // DB wins
    expect(result!.supportLevel).toBe('strong'); // Derived from 75
  });

  it('normalizes legacy format to v1', () => {
    const legacy = {
      factScore: 72,
      sourcesMean: 80,
      liveScore: 55,
      enrichedAt: '2026-01-01T00:00:00Z',
      sources: [{ id: 1, domain: 'test.com' }],
      liveAnalysis: { judges: {} },
    };

    const result = normalizeArticleScorePayload(legacy, 72, null);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.score).toBe(72);
    expect(result!.calculation.sourcesMean).toBe(80);
    expect(result!.calculation.contentScore).toBe(55);
    expect(result!.sources).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
//  normalizeAnswerScorePayload
// ---------------------------------------------------------------------------
describe('normalizeAnswerScorePayload', () => {
  it('returns null for null input', () => {
    expect(normalizeAnswerScorePayload(null)).toBeNull();
  });

  it('passes through v1 payloads', () => {
    const v1 = {
      version: 1,
      score: 75,
      supportLevel: 'strong',
      mode: 'web',
      calculation: {
        formula: 'weighted-source-output-v1',
        sourceWeight: 0.75,
        outputWeight: 0.25,
        sourcesMean: 80,
        outputScore: 60,
        finalScore: 75,
      },
      outputAnalysis: null,
    };

    const result = normalizeAnswerScorePayload(v1);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.score).toBe(75);
  });

  it('normalizes legacy chat metadata', () => {
    const legacy = {
      factScore: 68,
      mode: 'web',
      calculation: {
        sourcesMean: 72,
        outputScore: 55,
        formula: 'weighted-source-output-v1',
      },
      outputAnalysis: { score: 55 },
    };

    const result = normalizeAnswerScorePayload(legacy);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.score).toBe(68);
    expect(result!.mode).toBe('web');
    expect(result!.calculation.sourcesMean).toBe(72);
  });
});
