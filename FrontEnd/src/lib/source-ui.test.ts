import { describe, expect, it } from 'vitest';

import { getSourceAnalysisLabel, isSourceAnalysisPending } from './source-ui';

describe('source analysis display state', () => {
    it('uses terminal backend statuses instead of inferring pending from a missing score', () => {
        expect(isSourceAnalysisPending({ analysisStatus: 'METADATA_ONLY', trustScore: null })).toBe(false);
        expect(isSourceAnalysisPending({ analysisStatus: 'UNAVAILABLE', trustScore: null, type: 'PENDING' })).toBe(false);
        expect(isSourceAnalysisPending({ analysisStatus: 'PENDING', trustScore: 72 })).toBe(true);
    });

    it('labels metadata-only sources explicitly', () => {
        expect(getSourceAnalysisLabel({ analysisStatus: 'METADATA_ONLY' }, 'fr')).toBe('M\u00e9tadonn\u00e9es seules');
        expect(getSourceAnalysisLabel({ analysisStatus: 'METADATA_ONLY' }, 'en')).toBe('Metadata only');
    });

    it('keeps the legacy fallback only when the backend status is absent', () => {
        expect(isSourceAnalysisPending({ trustScore: null, type: 'PENDING' })).toBe(true);
        expect(isSourceAnalysisPending({ trustScore: 82, type: 'news' })).toBe(false);
    });
});
