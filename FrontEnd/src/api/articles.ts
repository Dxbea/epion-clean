import { API_BASE } from '@/config/api';
import { withCsrf } from '@/lib/csrf';

export type ArticleGenerationStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STALE';

export interface GenerateArticleParams {
    topic: string;
    language: string;
    style: string;
    category?: string; // @deprecated use categoryName
    categoryName?: string; // context for AI
    categoryId?: string; // ID for DB relation
    generateImage: boolean;
    imageUrl?: string;
}

export interface GeneratedArticleShell {
    id: string;
    slug?: string | null;
    status?: string | null;
    factCheckStatus?: ArticleGenerationStatus | null;
}

export interface GenerateArticleResponse {
    articleId?: string;
    slug?: string;
    generationStatus?: ArticleGenerationStatus;
    factCheckStatus?: ArticleGenerationStatus | null;
    idempotentReplay?: boolean;
    article?: GeneratedArticleShell;
    message?: string;
    error?: string;
}

export interface ArticleGenerationStatusResponse {
    articleId: string;
    slug: string;
    status: string;
    generationStatus: ArticleGenerationStatus;
    factCheckStatus?: ArticleGenerationStatus | null;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
}

export function isArticleGenerationInProgress(status: ArticleGenerationStatus | null | undefined): boolean {
    return status === 'PENDING' || status === 'RUNNING';
}

export function isArticleGenerationTerminal(status: ArticleGenerationStatus | null | undefined): boolean {
    return status === 'COMPLETED' || status === 'FAILED';
}

function readErrorMessage(errorData: any, fallback: string): string {
    return errorData?.message || errorData?.error || fallback;
}

/**
 * Appelle l'IA pour demarrer une generation asynchrone d'article.
 * POST /api/articles/generate
 */
export async function generateArticleWithAI(data: GenerateArticleParams): Promise<GenerateArticleResponse> {
    const res = await fetch(
        `${API_BASE}/api/articles/generate`,
        await withCsrf({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    );

    const responseData = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(readErrorMessage(responseData, "Erreur lors de la generation de l'article."));
    }

    return responseData as GenerateArticleResponse;
}

/**
 * Lit l'etat courant d'une generation d'article.
 * GET /api/articles/:id/status
 */
export async function getArticleGenerationStatus(id: string): Promise<ArticleGenerationStatusResponse> {
    const res = await fetch(`${API_BASE}/api/articles/${encodeURIComponent(id)}/status`, {
        credentials: 'include',
    });

    const responseData = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(readErrorMessage(responseData, 'Unable to load article generation status.'));
    }

    return responseData as ArticleGenerationStatusResponse;
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
        throw new Error(readErrorMessage(errorData, 'Erreur lors de la modification par IA.'));
    }

    return res.json(); // { result: "..." }
}
