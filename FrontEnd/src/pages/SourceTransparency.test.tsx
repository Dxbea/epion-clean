import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SourceTransparency from './SourceTransparency';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/i18n/I18nContext', () => ({
    useI18n: () => ({
        locale: 'fr',
        t: (key: string) => ({
            source_transparency_back: 'Vue d’ensemble de la transparence',
            source_transparency_eyebrow: 'Transparence des sources',
            source_transparency_title: 'Comment Epion présente les sources',
            source_transparency_lead: 'Une fiche source sépare la qualité de son usage dans un article.',
            source_transparency_what_title: 'Qu’est-ce qu’une source dans Epion ?',
            source_transparency_what_body: 'Un document cité.',
            source_transparency_quality_role_title: 'Qualité et rôle',
            source_transparency_quality_role_body: 'Deux notions différentes.',
            source_transparency_counterpoint_title: 'Contrepoint',
            source_transparency_counterpoint_body: 'Une contradiction peut être utile.',
            source_transparency_score_title: 'Score source',
            source_transparency_score_body: 'Ce n’est pas une probabilité.',
            source_transparency_labels_title: 'Les labels de qualité',
            source_transparency_labels_body: 'Des repères lisibles.',
            source_transparency_label_very_strong: 'Très solide',
            source_transparency_label_very_strong_body: 'Très documenté.',
            source_transparency_label_strong: 'Solide',
            source_transparency_label_strong_body: 'Solide.',
            source_transparency_label_nuanced: 'À nuancer',
            source_transparency_label_nuanced_body: 'Avec réserves.',
            source_transparency_label_fragile: 'Fragile',
            source_transparency_label_fragile_body: 'Fragile.',
            source_transparency_label_verify: 'À vérifier',
            source_transparency_label_verify_body: 'À vérifier.',
            source_transparency_label_unrated: 'Appui non évalué',
            source_transparency_label_unrated_body: 'Informations insuffisantes.',
            source_transparency_information_title: 'Informations disponibles',
            source_transparency_information_body: 'Profil connu.',
            source_transparency_limits_title: 'Les limites connues',
            source_transparency_limits_body: 'Les limites sont affichées.',
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
});

describe('SourceTransparency route content', () => {
    it('renders the /transparence/sources page with a link back to /transparency', async () => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);

        await act(async () => {
            root?.render(
                <MemoryRouter initialEntries={['/transparence/sources']}>
                    <SourceTransparency />
                </MemoryRouter>,
            );
        });

        expect(container.textContent).toContain('Comment Epion présente les sources');
        expect(container.querySelector<HTMLAnchorElement>('a')?.getAttribute('href')).toBe('/transparency');
    });
});
