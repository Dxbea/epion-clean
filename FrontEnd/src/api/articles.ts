import { API_BASE } from '@/config/api';
import { withCsrf } from '@/lib/csrf';

export interface GenerateArticleParams {
    topic: string;
    language: string;
    style: string;
    category: string;
    generateImage: boolean;
}

/**
 * Appelle l'IA pour générer un article complet.
 * POST /api/articles/generate
 */
export async function generateArticleWithAI(data: GenerateArticleParams) {
    const res = await fetch(
        `${API_BASE}/api/articles/generate`,
        await withCsrf({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    );

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de la génération de l\'article.');
    }

    return res.json(); // Retourne { article: ..., message: ... }
}

/**
 * Appelle l'IA pour modifier un champ spécifique (titre, résumé, contenu).
 * POST /api/articles/:id/edit-ai
 */
export async function editArticleWithAI(id: string, data: { instruction: string; currentContent: string; field: string }) {
    const res = await fetch(
        `${API_BASE}/api/articles/${id}/edit-ai`,
        await withCsrf({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    );

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de la modification par IA.');
    }

    return res.json(); // { result: "..." }
}
