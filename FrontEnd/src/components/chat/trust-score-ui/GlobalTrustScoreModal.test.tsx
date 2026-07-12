import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalTrustScoreModal } from './GlobalTrustScoreModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/i18n/I18nContext', () => ({
    useI18n: () => ({
        locale: 'fr',
        t: (key: string) => ({
            support_modal_title: 'Détail du niveau d’appui',
            support_level: 'Niveau d’appui',
            support_explanation_strong: 'Explication solide',
            support_confidence: 'Confiance',
            support_confidence_medium: 'moyenne',
            support_source_structure: 'Comment l’article est appuyé',
            support_metric_usable: 'sources exploitables',
            support_metric_domains: 'domaines distincts',
            support_metric_primary: 'appuis directs',
            support_metric_official: 'sources officielles',
            support_metric_counterpoints: 'contrepoints',
            support_structure_explanation: 'Explication de la structure',
            support_known_limits: 'Limites connues',
            support_uncertainties: 'Points encore incertains',
            support_reason_incomplete_extraction: 'Extraction incomplète traduite',
            support_reason_weak_profiles: 'Profils faibles traduits',
            support_deep_recommended: 'Analyse approfondie recommandée',
            support_deep_recommended_intro: 'Pourquoi approfondir',
            support_deep_available_all: 'Disponible sur demande',
            support_technical_details: 'Détails techniques',
            support_backend_score: 'Score backend',
            support_score_disclaimer: 'Pas une probabilité',
            support_disclaimer: 'Consulter les sources',
        }[key] ?? key),
    }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = '';
});

describe('GlobalTrustScoreModal', () => {
    it('renders the complete light-analysis metrics and deep recommendation', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <GlobalTrustScoreModal
                    isOpen
                    onClose={vi.fn()}
                    data={{
                        sources: [],
                        globalScore: 92,
                        sourceScore: 0,
                        aiScore: 0,
                        lightAnalysis: {
                            supportLevel: 'strong',
                            analysisConfidence: 'MEDIUM',
                            sourceQualitySummary: {
                                totalSources: 24,
                                usableSources: 24,
                                uniqueDomains: 24,
                                profiledSourceCount: 23,
                                metadataOnlyCount: 6,
                                unavailableCount: 0,
                                profileCoverage: 0.96,
                            },
                            sourceUsageSummary: {
                                primaryEvidenceCount: 8,
                                officialStatementCount: 0,
                                contextCount: 10,
                                counterpointCount: 6,
                                backgroundCount: 0,
                                unknownRoleCount: 0,
                                hasPrimaryEvidence: true,
                                domainDiversity: 'HIGH',
                            },
                            limitations: ['INCOMPLETE_SOURCE_EXTRACTION'],
                            uncertainties: ['PROFILE_COVERAGE_PARTIAL'],
                            deepAnalysisAvailable: true,
                            deepAnalysisRecommended: true,
                            deepAnalysisReasons: ['WEAK_SOURCE_PROFILE', 'INCOMPLETE_EXTRACTION'],
                        },
                    }}
                />,
            );
        });

        const text = document.body.textContent ?? '';
        expect(text).toContain('24sources exploitables');
        expect(text).toContain('24domaines distincts');
        expect(text).toContain('8appuis directs');
        expect(text).toContain('0sources officielles');
        expect(text).toContain('6contrepoints');
        expect(text).toContain('Extraction incomplète traduite');
        expect(text).toContain('Profils faibles traduits');
        expect(text).toContain('Analyse approfondie recommandée');
        expect(text).toContain('Disponible sur demande');
    });
});
