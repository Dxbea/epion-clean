import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SourceCard from './SourceCard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/i18n/I18nContext', () => ({
    useI18n: () => ({
        locale: 'fr',
        t: (key: string) => ({
            source_quality_short: 'Qualité source',
            source_logo_fallback: 'Initiales de la source',
            source_technical_status_observed: 'Attesté ici',
            source_technical_status_conditional: 'Conditionnel',
            source_technical_status_legacy: 'Legacy actif',
            source_technical_status_not_exposed: 'Non exposé ici',
            source_technical_status_not_attributable: 'Non attribuable ici',
            source_technical_status_used: 'Actif pour cette source',
            source_technical_status_global: 'Actif globalement, non confirmé ici',
            source_technical_status_legacy_read: 'Ancien format encore lu',
            source_technical_status_compatibility: 'Compatibilité uniquement',
            source_technical_claim_reference_counts: '{claims} champs étayés · {links} liens vers des références',
            source_technical_consensus_plain_description: 'Ce mécanisme existe, mais les données de cette source ne permettent pas de dire qu’il a contribué à cette évaluation.',
            source_technical_article_analysis_plain_title: 'Analyse de l’article',
            source_technical_article_analysis_used: 'Cette source a été utilisée pour l’analyse de l’article.',
            source_technical_article_analysis_global: 'Aucune métadonnée d’analyse propre à l’article.',
            source_limit_fact_check_failures: 'Des signaux de vérification sont associés à cette source.',
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

describe('SourceCard logo fallback', () => {
    it('uses local initials when no logo is available', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <SourceCard
                    source={{
                        id: 1,
                        name: 'Agence France-Presse',
                        domain: 'afp.com',
                        score: 88,
                        analysisStatus: 'ANALYZED',
                    }}
                />,
            );
        });

        expect(container.querySelector('img')).toBeNull();
        expect(container.textContent).toContain('AF');
    });

    it('replaces a broken source logo with local initials', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <SourceCard
                    source={{
                        id: 1,
                        name: 'Le Monde',
                        domain: 'lemonde.fr',
                        logo: 'https://invalid.test/logo.png',
                        score: 82,
                        analysisStatus: 'ANALYZED',
                    }}
                />,
            );
        });

        const image = container.querySelector('img');
        expect(image).not.toBeNull();

        await act(async () => {
            image?.dispatchEvent(new Event('error'));
        });

        expect(container.querySelector('img')).toBeNull();
        expect(container.textContent).toContain('LM');
        expect(container.querySelector('[aria-label="Initiales de la source Le Monde"]')).not.toBeNull();
    });
});

describe('SourceCard section layout and borders', () => {
    const completeSource = {
        id: 2,
        name: 'Média Exemple',
        domain: 'media.example',
        url: 'https://media.example/article',
        score: 78,
        supportLevel: 'strong' as const,
        analysisStatus: 'ANALYZED' as const,
        role: 'COUNTERPOINT',
        supportStrength: 'STRONG',
        provenance: 'WEB_SEARCH',
        provider: 'web',
        searchLane: 'CRITICAL',
        durableSourceId: 'source-uuid',
        profileVersion: 1,
        profileConfidence: 'MEDIUM',
        publicTrustLabel: 'strong',
        reliability: 'HIGH',
        metadata: { dbScore: 78, reliability: 'HIGH' },
        profileSnapshot: { snapshotAt: '2026-07-12T10:00:00.000Z', profileConfidence: 'MEDIUM' },
        description: 'Un média généraliste.',
        profileData: {
            methodVersion: 'source-profile-v1',
            sourceFacts: {
                ownership: 'Groupe Exemple',
                businessModel: 'Abonnements',
                specialty: 'Actualité nationale',
                country: 'FR',
                type: 'MEDIA',
            },
            vigilancePoints: ['Positionnement éditorial à contextualiser.'],
            editorialReputation: {
                editorialPositioning: 'Positionnement documenté.',
                reliabilitySignals: ['Politique de correction publiée.'],
            },
            externalReferences: [{
                id: 'ref_1',
                label: 'Notice externe',
                url: 'https://example.org/notice',
                publisher: 'Observatoire Exemple',
            }],
            claimReferences: {
                'editorialReputation.editorialPositioning': ['ref_1'],
            },
        },
    };

    it('renders the five available profile categories as distinct neutral blocks', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <MemoryRouter>
                    <SourceCard source={completeSource} />
                </MemoryRouter>,
            );
        });

        await act(async () => {
            container?.querySelector<HTMLButtonElement>('[aria-label="Ouvrir la fiche source"]')?.click();
        });

        const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-source-section]'));
        expect(sections.map((section) => section.dataset.sourceSection)).toEqual([
            'information',
            'article-role',
            'vigilance',
            'editorial-reputation',
            'references',
        ]);
        sections.forEach((section) => {
            expect(section.className).toContain('rounded-xl');
            expect(section.className).toContain('border-gray-200');
            expect(section.className).toContain('bg-gray-50/60');
        });
    });

    it('uses one centered neutral border when opened normally', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <MemoryRouter>
                    <SourceCard source={completeSource} />
                </MemoryRouter>,
            );
        });
        await act(async () => {
            container?.querySelector<HTMLButtonElement>('[aria-label="Ouvrir la fiche source"]')?.click();
        });

        const card = container.firstElementChild as HTMLElement;
        expect(card.className).toContain('border-gray-300');
        expect(card.className).not.toContain('ring-inset');
    });

    it('toggles from the chevron without opening the source link', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <MemoryRouter>
                    <SourceCard source={completeSource} />
                </MemoryRouter>,
            );
        });

        const sourceLink = container.querySelector<HTMLAnchorElement>('[data-source-link]');
        const linkClick = vi.fn();
        sourceLink?.addEventListener('click', linkClick);

        await act(async () => {
            container?.querySelector<HTMLButtonElement>('[aria-label="Ouvrir la fiche source"]')?.click();
        });

        expect(linkClick).not.toHaveBeenCalled();
        expect(container.querySelector('[aria-expanded="true"]')).not.toBeNull();
    });

    it('opens the source link from the rest of the header without changing expansion', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <MemoryRouter>
                    <SourceCard source={completeSource} />
                </MemoryRouter>,
            );
        });
        await act(async () => {
            container?.querySelector<HTMLButtonElement>('[aria-label="Ouvrir la fiche source"]')?.click();
        });

        const sourceLink = container.querySelector<HTMLAnchorElement>('[data-source-link]');
        const linkClick = vi.fn((event: Event) => event.preventDefault());
        sourceLink?.addEventListener('click', linkClick);

        await act(async () => {
            sourceLink?.click();
        });

        expect(sourceLink?.href).toBe('https://media.example/article');
        expect(sourceLink?.target).toBe('_blank');
        expect(linkClick).toHaveBeenCalledOnce();
        expect(container.querySelector('[aria-expanded="true"]')).not.toBeNull();
    });

    it('matches the focused border color to the support badge family', async () => {
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
            configurable: true,
            value: vi.fn(),
        });
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <MemoryRouter>
                    <SourceCard source={completeSource} isFocused />
                </MemoryRouter>,
            );
        });

        const card = container.firstElementChild as HTMLElement;
        expect(card.className).toContain('border-teal-400');
        expect(card.className).not.toContain('ring-inset');
    });

    it('keeps system transparency collapsed and groups source, global, legacy and compatibility statuses', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <MemoryRouter>
                    <SourceCard source={completeSource} />
                </MemoryRouter>,
            );
        });
        await act(async () => {
            container?.querySelector<HTMLButtonElement>('[aria-label="Ouvrir la fiche source"]')?.click();
        });

        const technicalDetails = container.querySelector<HTMLDetailsElement>('[data-source-technical-details]');
        expect(technicalDetails).not.toBeNull();
        expect(technicalDetails?.open).toBe(false);

        const groups = Array.from(technicalDetails?.querySelectorAll<HTMLElement>('[data-technical-group]') ?? []);
        expect(groups.map((group) => group.dataset.technicalGroup)).toEqual([
            'source-profile',
            'source-reputation',
            'article-analysis',
            'profile-evidence',
            'compatibility',
        ]);
        expect(technicalDetails?.querySelector('[data-technical-system="profile-data"]')?.textContent).toContain('Actif pour cette source');
        expect(technicalDetails?.querySelector('[data-technical-system="cold-profiler"]')?.textContent).toContain('Actif globalement, non confirmé ici');
        expect(technicalDetails?.querySelector('[data-article-analysis-status="observed"]')).not.toBeNull();
        expect(technicalDetails?.querySelector('[data-technical-system="claim-references"]')?.textContent).toContain('1 champs étayés · 1 liens vers des références');
        expect(technicalDetails?.querySelector('[data-technical-system="external-consensus"]')?.textContent).toContain('Ce mécanisme existe, mais les données de cette source ne permettent pas de dire qu’il a contribué à cette évaluation.');
        expect(technicalDetails?.querySelector('[data-technical-system="source-corpus-alias"]')?.textContent).toContain('Compatibilité uniquement');
        expect(technicalDetails?.querySelector('[data-technical-system="score-aliases"]')?.textContent).toContain('Ancien format encore lu');
        expect(technicalDetails?.querySelector('[data-technical-system="score-aliases"]')?.textContent).toContain('metadata.dbScore');
    });

    it('keeps a legacy source compatible without claiming article-specific analysis metadata', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <MemoryRouter>
                    <SourceCard
                        source={{
                            ...completeSource,
                            provenance: 'IMPORTED_LEGACY',
                            provider: undefined,
                            searchLane: undefined,
                        }}
                    />
                </MemoryRouter>,
            );
        });
        await act(async () => {
            container?.querySelector<HTMLButtonElement>('[aria-label="Ouvrir la fiche source"]')?.click();
        });

        const articleSourceSystem = container.querySelector('[data-technical-system="article-source"]');
        const articleAnalysisSystem = container.querySelector('[data-technical-system="article-analysis"]');
        expect(articleSourceSystem?.textContent).toContain('Ancien format encore lu');
        expect(articleAnalysisSystem?.getAttribute('data-article-analysis-status')).toBe('not-attributable');
        expect(articleAnalysisSystem?.textContent).toContain('Aucune métadonnée d’analyse propre à l’article.');
    });

    it.each([
        {
            name: 'une source éditoriale issue du corpus',
            source: { provenance: 'EDITORIAL', provider: 'rag', searchLane: 'CONTEXTUAL' },
        },
        {
            name: 'une source éditoriale enrichie par Serper',
            source: { provenance: 'WEB_SEARCH', provider: 'web', searchLane: 'FACTUAL' },
        },
    ])('uses generic article analysis wording for $name', async ({ source }) => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <MemoryRouter>
                    <SourceCard source={{ ...completeSource, ...source }} />
                </MemoryRouter>,
            );
        });
        await act(async () => {
            container?.querySelector<HTMLButtonElement>('[aria-label="Ouvrir la fiche source"]')?.click();
        });

        const articleAnalysisSystem = container.querySelector('[data-technical-system="article-analysis"]');
        expect(articleAnalysisSystem?.textContent).toContain('Analyse de l’article');
        expect(articleAnalysisSystem?.textContent).toContain('Cette source a été utilisée pour l’analyse de l’article.');
        expect(articleAnalysisSystem?.textContent).not.toContain('Live Analysis');
    });

    it('keeps community article metadata in the generic article-analysis display', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <MemoryRouter>
                    <SourceCard source={{ ...completeSource, provenance: 'WEB_SEARCH', provider: 'web', searchLane: 'CRITICAL' }} />
                </MemoryRouter>,
            );
        });
        await act(async () => {
            container?.querySelector<HTMLButtonElement>('[aria-label="Ouvrir la fiche source"]')?.click();
        });

        expect(container.querySelector('[data-article-analysis-status="observed"]')).not.toBeNull();
        expect(container.textContent).toContain('Qualité source');
    });

    it('shows fact-check failure signals in points to watch', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <MemoryRouter>
                    <SourceCard source={{ ...completeSource, flags: { hasFactCheckFailures: true } }} />
                </MemoryRouter>,
            );
        });
        await act(async () => {
            container?.querySelector<HTMLButtonElement>('[aria-label="Ouvrir la fiche source"]')?.click();
        });

        expect(container.querySelector('[data-source-section="vigilance"]')?.textContent).toContain('Des signaux de vérification sont associés à cette source.');
    });

    it('does not present deprecated reputation, analysis or live score fields as active source-score aliases', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <MemoryRouter>
                    <SourceCard
                        source={{
                            ...completeSource,
                            reputationScore: 70,
                            analysisScore: 65,
                            liveScore: 60,
                        }}
                    />
                </MemoryRouter>,
            );
        });
        await act(async () => {
            container?.querySelector<HTMLButtonElement>('[aria-label="Ouvrir la fiche source"]')?.click();
        });

        const aliases = container.querySelector('[data-technical-system="score-aliases"]');
        expect(aliases?.textContent).toContain('metadata.dbScore');
        expect(aliases?.textContent).not.toContain('reputationScore');
        expect(aliases?.textContent).not.toContain('analysisScore');
        expect(aliases?.textContent).not.toContain('liveScore');
    });
});
