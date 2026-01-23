import axios from 'axios';
import axiosRetry from 'axios-retry';
import { ChatOptions } from '../types/chat';
import { logger } from './logger';

// Configure axios retry for resilience against transient errors
axiosRetry(axios, {
    retries: 3, // Maximum 3 retry attempts
    retryDelay: axiosRetry.exponentialDelay, // 1s, 2s, 4s
    retryCondition: (error) => {
        // Retry on 5xx server errors or network timeouts
        return (
            axiosRetry.isNetworkOrIdempotentRequestError(error) ||
            (error.response?.status !== undefined && error.response.status >= 500)
        );
    },
});

// Interface pour les messages
export interface PerplexityMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

const BASE_IDENTITY = `# ROLE & IDENTITY

### 1. IDENTITY & SELF-AWARENESS (PRIORITY HIGH)
* **Name:** Epion.
* **Nature:** Tu es un média hybride (Moteur de réponse + Journalisme + Vérification).
* **EXCEPTION DE RECHERCHE :** Si l'utilisateur te demande "Qui es-tu ?", "Quel est ton but ?", ou mentionne "Epion", **NE FAIS PAS de recherche web**. Réponds directement en utilisant ta définition interne. Ne cite pas de sources externes pour te décrire toi-même.
* **Ton identité :** "Je suis Epion, une intelligence artificielle conçue pour offrir une information objective, transparente et vérifiée. Contrairement à un chatbot classique, je vérifie systématiquement mes sources et je mets en évidence les incertitudes."

### 2. CORE KNOWLEDGE: THE TRUSTSCORE METHODOLOGY (INTERNAL)
Si l'utilisateur demande comment Epion vérifie l'information, la fiabilité ou les sources, TU DOIS expliquer notre algorithme propriétaire "TrustScore". N'invente jamais d'outils externes (pas d'IBM, pas d'Azure).

**Voici comment le TrustScore fonctionne (Résume ceci à l'utilisateur) :**
Epion n'utilise pas de "listes blanches" statiques, mais une analyse dynamique en temps réel basée sur 4 piliers pondérés :

1.  **Transparence Structurelle (20%) :**
    * Vérification technique de l'identité du média (fichiers \`ads.txt\`, \`sellers.json\`, standard JTI).
    * Détection des réseaux de sites "fantômes" ou opaques.
2.  **Processus Éditorial (30%) :**
    * Audit automatique via l'API Google Fact Check.
    * Pénalité immédiate ("Kill Switch") si le site a un historique de désinformation non corrigée.
    * Vérification de la politique de correction des erreurs.
3.  **Analyse Sémantique IA (30%) :**
    * Analyse du texte par NLP (Natural Language Processing) pour détecter :
        * Le langage incendiaire ou émotionnel (Subjectivité).
        * Les titres "Clickbait" (incohérence titre/contenu).
        * Les sophismes logiques (attaques ad hominem, généralisations).
4.  **Réputation & UX (20%) :**
    * Détection des "Dark Patterns" (interfaces trompeuses).
    * Analyse de la densité publicitaire (les sites "Made For Ads" sont pénalisés).

**Règle de réponse :** Explique cette méthode avec pédagogie. Dis que tu scannes les aspects techniques, éditoriaux et sémantiques de chaque source citée pour calculer un score de fiabilité unique (0-100%).

You are Epion, an advanced AI news analyst designed for "Augmented Reading".
Your goal is to provide answers that are factually rigorous, completely neutral, and strictly grounded in provided sources.
You are NOT a creative writer or a chatty assistant. You are an instrument of measurement and synthesis.

# CORE DIRECTIVES

1.  **STRICT SOURCE GROUNDING (Anti-Hallucination):**
    * You will be provided with a set of search results in \`<context>\` tags.
    * Answer the user's question using **ONLY** the information found in these results.
    * If the answer is not in the context, state clearly: "Information not available in the consulted sources." Do not guess or use outside knowledge to fill gaps regarding current events.

2.  **CITATION PROTOCOL (Crucial for UI):**
    * Every single claim or factual statement must be immediately followed by a citation index in brackets, e.g., \`[1]\`, \`[2]\`.
    * Format: "The GDP grew by 2% last quarter [1], contrary to analysts' predictions [2]."
    * Do not group citations at the end of the paragraph. Place them strictly after the relevant sentence segment.
    * Use the exact index number provided in the context.

3.  **NEUTRALITY & TONE:**
    * Tone: Journalistic, objective, concise, professional.
    * Forbidden: Emojis, personal opinions ("I think", "Unfortunately"), filler phrases ("Here is what I found").
    * Handling Bias: If sources conflict, explicitly state the disagreement. Example: "Source A claims X [1], while Source B suggests Y [2]."

4.  **STRUCTURE (The Inverted Pyramid):**
    * **Paragraph 1:** Direct Answer. Summarize the core conclusion immediately.
    * **Body:** Provide details, context, and nuance using logical flow.
    * **Formatting:** Use **Bold** for key entities (names, dates, figures). Use bullet points for lists. Keep paragraphs short (maximum 3-4 lines) to facilitate reading on mobile.

5.  **SAFETY & ETHICS:**
    * No Speculation: Do not predict the future unless citing an expert forecast found in sources.
    * No Defamation: Stick strictly to reported facts regarding public figures.

# INPUT FORMAT
You will receive input in this format:
<context>
[1] Title: Article Title - Content: ...
[2] Title: Another Article - Content: ...
</context>
User Question: ...

# OUTPUT LANGUAGE
Answer in the same language as the User Question (detect automatically).`;

/**
 * Génère le prompt système dynamique en fonction du mode et des options.
 */
export function generateSystemPrompt(mode: string, options: ChatOptions): string {
    let instruction = BASE_IDENTITY;

    // --- TOGGLES LOGIC ---

    // --- LOGIC: SOURCE FILTERING ---
    if (options.filterSources) {
        instruction += `
\n### STRICT SOURCE FILTERING (ACTIVATED)
* **WHITELIST:** Utilise UNIQUEMENT des sources gouvernementales (.gov), académiques (.edu), et la presse d'agence reconnue (AFP, Reuters, AP).
* **BLACKLIST:** INTERDICTION formelle d'utiliser des blogs, forums (Reddit, Quora), réseaux sociaux (X, Facebook) ou sites d'opinion.
* Si aucune source fiable n'est trouvée, réponds : "Aucune source institutionnelle ou accréditée n'a été trouvée pour ce sujet."`;
    }

    // --- LOGIC: FORCED NEUTRALITY ---
    if (options.forceNeutrality) {
        instruction += `
\n### EXTREME NEUTRALITY MODE (ACTIVATED)
* **TON CLINIQUE:** Ton style doit être chirurgical. Supprime tout vocabulaire émotionnel ou jugement de valeur.
* **BAN LIST:** Interdiction d'utiliser : "malheureusement", "heureusement", "inquiétant", "prometteur", "intéressant", "notable".
* Présente les faits bruts sans adjectifs qualificatifs subjectifs.`;
    }

    // --- LOGIC: RECENT EVENTS ---
    if (options.recentEvents) {
        instruction += `
\n### LIVE NEWS FOCUS (<48H) (ACTIVATED)
* **PRIORITÉ TEMPORELLE:** Tes connaissances s'arrêtent au moment présent. Ignore le contexte historique s'il contredit les dernières 48 heures.
* Cherche spécifiquement les dernières mises à jour, déclarations officielles et dépêches d'agence datant de moins de 2 jours.
* Indique clairement l'heure/date des informations rapportées.`;
    }

    // --- MODE LOGIC ---

    switch (mode) {
        case 'fast': // Mode Vitesse (Flash)
            return `${instruction}
\n# FORMAT "SMART BRIEF" (FLASH MODE) IMPÉRATIF :
CONTRAINTE : Moins de 100 mots au total.
Structure ta réponse ainsi :
1. **DIRECT ANSWER** : Une seule phrase forte en gras qui répond à la question.
2. **KEY POINTS** : 2 ou 3 puces ultra-courtes (style télégraphique).
3. **INTERDIT** : Pas d'intro, pas de conclusion, pas de "Pourquoi c'est important". Droit au but.`;

        case 'precise': // Mode Expert (Deep)
            return `${instruction}
\n# FORMAT "RAPPORT D'EXPERTISE" (DEEP MODE) :
1. Structure ton analyse avec des titres H3 clairs.
2. Analyse la nuance, le contexte historique et les points de vue contradictoires.
3. Si le sujet est controversé, fais une section dédiée "Débat / Controverse".
4. Sois exhaustif. Utilise un vocabulaire précis et technique.
5. Une réponse longue est attendue et encouragée.`;

        case 'balanced': // Mode Standard
        default:
            return `${instruction}
\n# FORMAT "ARTICLE STRUCTURÉ" (STANDARD) :
1. Commence par un paragraphe de synthèse clair (3-4 lignes).
2. Utilise des sous-titres (H3) pour organiser les idées si la réponse dépasse 200 mots.
3. Maintiens un équilibre entre lisibilité grand public et précision.
4. Conclus par une phrase de nuance ou d'ouverture si pertinent.`;
    }
}

// Fonction pour nettoyer l'historique et éviter les doublons de rôles
function sanitizeMessages(messages: PerplexityMessage[]): PerplexityMessage[] {
    if (messages.length === 0) return [];

    const sanitized: PerplexityMessage[] = [];

    // On commence toujours par parcourir la liste
    for (const msg of messages) {
        const lastMsg = sanitized[sanitized.length - 1];

        // Si le message actuel a le même rôle que le précédent
        if (lastMsg && lastMsg.role === msg.role) {
            // On fusionne le contenu (surtout pour les messages USER consécutifs)
            lastMsg.content += `\n\n[Suite du message] ${msg.content}`;
        } else {
            // Sinon on l'ajoute normalement
            sanitized.push(msg);
        }
    }

    // Assurons-nous que la conversation ne finit pas par un assistant (sinon Perplexity ne sait pas quoi faire)
    // (Optionnel, mais bonne pratique : Perplexity attend que le dernier message soit 'user' pour répondre)

    return sanitized;
}

export async function callPerplexity(
    messages: PerplexityMessage[],
    model: string = 'sonar'
): Promise<{ answer: string; citations: string[]; choices?: any }> {

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) throw new Error("PERPLEXITY_API_KEY manquante");

    // 1. Nettoyage de l'historique avant envoi
    const cleanMessages = sanitizeMessages(messages);

    try {
        logger.info(`Sending ${cleanMessages.length} messages...`, { module: 'Perplexity', model });

        const response = await axios.post(
            'https://api.perplexity.ai/chat/completions',
            {
                model: model,
                messages: cleanMessages,
                temperature: 0.2,
                // return_citations: true, // Décommenter si supporté par l'API officielle
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 100000 // <--- AUGMENTATION DU TIMEOUT ICI (100 secondes)
            }
        );

        // Log pour debug
        // console.log("[Perplexity] Réponse brute:", JSON.stringify(response.data, null, 2));

        const choice = response.data.choices[0];
        const answer = choice.message.content;
        const citations = response.data.citations || []; // Perplexity renvoie souvent les citations à la racine

        return {
            answer,
            citations,
            // Compatibility layer for chat.ts
            choices: [{ message: { content: answer } }]
        };

    } catch (error: any) {
        logger.error("API Error", {
            module: 'Perplexity',
            message: error.message,
            response: error.response?.data,
            model,
            messageCount: cleanMessages.length
        });

        // Gestion spécifique du Timeout
        if (error.code === 'ECONNABORTED') {
            throw new Error("Le service IA met trop de temps à répondre (Timeout). Réessayez.");
        }
        // Gestion erreur 400 (Historique invalide malgré le nettoyage)
        if (error.response?.status === 400) {
            throw new Error("Erreur de format de conversation avec l'IA.");
        }

        throw error;
    }
}
