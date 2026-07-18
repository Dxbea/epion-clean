import { describe, expect, it } from 'vitest';
import { assessEditorialCorpus } from '../src/lib/editorial-verification/sufficiency.js';

const evidence = [
  { evidenceKey: 'ev_1', documentId: 'd1', sourceId: 's1', url: 'https://one.example/a', title: 'One', domain: 'one.example', content: 'One', publishedAt: null, lane: 'PRIMARY' as const, origin: 'CORPUS' as const },
  { evidenceKey: 'ev_2', documentId: 'd2', sourceId: 's2', url: 'https://two.example/b', title: 'Two', domain: 'two.example', content: 'Two', publishedAt: null, lane: 'CONTEXT' as const, origin: 'CORPUS' as const },
];
const brief = {
  contradictions: [{ id: 'c', question: 'Question', assessment: 'Open', sides: [
    { position: 'A', evidenceKeys: ['ev_1'] }, { position: 'B', evidenceKeys: ['ev_2'] },
  ] }],
} as any;
const claims = [{ claimKey: 'c1', text: 'Fact', importance: 'CORE' as const, primaryVerdict: 'SUPPORTED' as const, evidenceKeys: ['ev_1'] }];

describe('editorial corpus sufficiency policy', () => {
  it('does not request Serper for an old, diverse and covered dossier', () => {
    expect(assessEditorialCorpus({
      brief, claims, evidence, riskLevel: 'LOW',
      latestEventAt: new Date('2026-07-01T00:00:00.000Z'),
      now: new Date('2026-07-20T00:00:00.000Z'),
    })).toMatchObject({ sufficient: true, reasons: [] });
  });

  it('enumerates primary, counterpoint, diversity, coverage and recency gaps', () => {
    const result = assessEditorialCorpus({
      brief: { contradictions: [] } as any,
      claims,
      evidence: [],
      riskLevel: 'HIGH',
      latestEventAt: new Date('2026-07-20T00:00:00.000Z'),
      now: new Date('2026-07-20T12:00:00.000Z'),
    });
    expect(result.reasons).toEqual([
      'MISSING_PRIMARY_SOURCE',
      'MISSING_COUNTERPOINT',
      'INSUFFICIENT_DOMAIN_DIVERSITY',
      'INSUFFICIENT_CLAIM_COVERAGE',
      'RECENT_TOPIC_REQUIRES_REFRESH',
    ]);
  });
});
