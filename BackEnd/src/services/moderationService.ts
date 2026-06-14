import { env } from '../env.js';

/**
 * Service de modération via OpenAI
 * Documentation: https://platform.openai.com/docs/guides/moderation
 */
export const moderationService = {
    /**
     * Vérifie si le texte viole les règles de sécurité.
     * @param text Le contenu à vérifier
     * @returns true si le contenu est OK, false s'il est flaggé (refusé)
     */
    async moderateContent(text: string): Promise<boolean> {
        // Si pas de clé API configurée, on laisse passer (ou on bloque, selon politique. Ici on log et laisse passer en dev)
        if (!env.OPENAI_API_KEY) {
            console.warn('[Moderation] OPENAI_API_KEY missing. Skipping moderation.');
            return env.NODE_ENV !== 'production';
        }

        try {
            const response = await fetch('https://api.openai.com/v1/moderations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify({ input: text }),
            });

            if (!response.ok) {
                console.error(`[Moderation] API Error: ${response.status} ${response.statusText}`);
                // En cas d'erreur technique, on laisse passer (fail open) ou on bloque (fail closed).
                // Ici on fail open pour ne pas bloquer les users si l'API OpenAI est down.
                return env.NODE_ENV !== 'production';
            }

            const data = await response.json();
            const result = data.results?.[0];

            if (result && result.flagged) {
                console.log('[Moderation] Content Flagged:', JSON.stringify(result.categories, null, 2));
                return false; // Contenu refusé
            }

            return true; // Contenu OK
        } catch (error) {
            console.error('[Moderation] Exception:', error);
            return env.NODE_ENV !== 'production';
        }
    },
};
