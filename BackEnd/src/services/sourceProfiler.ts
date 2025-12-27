
import { callPerplexity, PerplexityMessage } from '../lib/perplexity';

/**
 * Génère une description objective et courte (bio) pour un domaine donné.
 * @param domain Le domaine de la source (ex: "lemonde.fr").
 * @returns Une chaîne de caractères contenant la description (max 30 mots) ou null si échec.
 */
export async function generateSourceDescription(domain: string): Promise<string | null> {
    try {
        const messages: PerplexityMessage[] = [
            {
                role: 'system',
                content: `Tu es un expert média objectif. Ta tâche est de fournir une courte bio factuelle pour un site web donné.
        
        RÈGLES :
        1.  **Objectivité Totale :** Pas d'adjectifs subjectifs ("excellent", "mauvais"), juste des faits (date de création, orientation politique connue, propriétaire, type de contenu).
        2.  **Longueur :** MAXIMUM 30 mots. Sois ultra-concis.
        3.  **Format :** Une seule phrase ou deux courtes.
        4.  **Si inconnu :** Réponds exactement "Site web non répertorié à faible notoriété."
        `
            },
            {
                role: 'user',
                content: `Décris objectivement le site : ${domain}`
            }
        ];

        console.log(`[SourceProfiler] Génération de la description pour ${domain}...`);

        // On utilise un modèle rapide si possible, ou le standard 'sonar'
        const response = await callPerplexity(messages, 'sonar');

        let description = response.answer.trim();

        // Nettoyage basique (retirer les guillemets si présents)
        description = description.replace(/^["']|["']$/g, '');

        console.log(`[SourceProfiler] Description générée : "${description}"`);

        return description;

    } catch (error) {
        console.error(`[SourceProfiler] Erreur lors de la génération de la description pour ${domain}:`, error);
        return null; // On ne veut pas bloquer le flux principal pour une bio manquante
    }
}
