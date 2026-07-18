import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceIdentityCard } from './SourceIdentityCard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/i18n/I18nContext', () => ({
    useI18n: () => ({
        locale: 'fr',
        t: (key: string) => ({
            source_section_information: 'Informations sur la source',
            source_fact_description: 'Description',
            source_profile_information_title: 'Informations disponibles pour Epion',
            source_fact_ownership: 'Propriétaire / gouvernance',
            source_fact_business_model: 'Modèle économique',
            source_fact_specialty: 'Spécialité',
            source_fact_location: 'Pays / zone couverte',
            source_fact_type: 'Type',
            source_fact_last_analysis: 'Dernière analyse',
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

describe('SourceIdentityCard', () => {
    it('renders narrative information first, then factual rows without nested cards', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <SourceIdentityCard
                    name="Le Monde"
                    compact
                    profileInformationLabel="Epion dispose d’informations partielles sur cette source."
                    profile={{
                        description: 'Un quotidien généraliste français.',
                        countryLabel: 'France',
                        typeLabel: 'Média',
                        sourceFacts: {
                            ownership: 'Groupe Le Monde',
                            businessModel: 'Abonnements et publicité',
                            specialty: 'Actualité générale',
                            coverageArea: 'International',
                        },
                        editorialPositioning: undefined,
                        generalReputation: undefined,
                        reliabilitySignals: [],
                        misinformationSignals: [],
                        strengths: [],
                        warnings: [],
                        references: [],
                        analyzedAtLabel: '12 juillet 2026',
                    }}
                />,
            );
        });

        const text = container.textContent ?? '';
        expect(text.indexOf('Description')).toBeLessThan(text.indexOf('Informations disponibles pour Epion'));
        expect(text).toContain('Un quotidien généraliste français.');
        expect(text).toContain('Epion dispose d’informations partielles sur cette source.');
        expect(text).toContain('Groupe Le Monde');
        expect(text).toContain('France · International');
        expect(text).toContain('Média');
        expect(text).toContain('12 juillet 2026');
        expect(container.querySelectorAll('.grid > div')).toHaveLength(6);

        const informationItems = container.querySelectorAll<HTMLElement>('[data-source-information-item], [data-source-fact]');
        expect(informationItems).toHaveLength(8);
        informationItems.forEach((item) => {
            expect(item.className).not.toContain('rounded');
            expect(item.className).not.toContain('p-4');
            expect(item.className).not.toContain('px-3.5');
        });
    });
});
