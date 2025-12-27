import { callPerplexity, type PerplexityMessage } from '../lib/perplexity';
import { getRichTrustScore } from '../lib/trust-score';
import { buildArticlePrompt } from '../lib/prompts/articlePrompts';
import { GenerateArticleRequest } from '../types/article';
import { analyzeOutputQuality } from '../lib/semantic-scanner';

interface GeneratedArticle {
    title: string;
    summary: string;
    content: string;
    tags: string[];
    category: string;
    estimatedReadTime: string;
    // Metadata calculées
    factScore: number;
    sources: any[];
    imagePrompt?: string; // AJOUT
}

export async function generateArticleContent(request: GenerateArticleRequest): Promise<GeneratedArticle> {
    const { topic } = request;

    // 1. Définition des messages pour l'IA
    const systemPrompt = buildArticlePrompt(request);

    const messages: PerplexityMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Sujet de l'article : "${topic}"` }
    ];

    try {
        // 2. Appel à Perplexity
        console.log(`[ArticleGenerator] Generating article for topic: "${topic}"...`);
        // On utilise 'sonar-pro' pour plus de qualité si disponible, sinon défaut
        // Utilisation de SONAR (ou modèle équivalent) pour la génération longue
        const perplexityResponse = await callPerplexity(messages, 'sonar');

        // Note: callPerplexity retourne un objet { id, model, created, usage, choices: [{ message: { content: ... } }] }
        // Ou un format adapté par le wrapper. Vérifions la signature dans perplexity.ts si possible.
        // D'après les logs précédents, callPerplexity retourne le JSON direct de l'API OpenAI-compatible.
        const rawContent = perplexityResponse.choices[0].message.content;
        const rawCitations = (perplexityResponse as any).citations || [];

        // 3. Parsing du JSON (Robuste)
        let jsonString = rawContent.trim();
        // Nettoyage des balises markdown éventuelles
        if (jsonString.startsWith('```json')) {
            jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonString.startsWith('```')) {
            jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        let parsedArticle: any;
        try {
            parsedArticle = JSON.parse(jsonString);
        } catch (parseError) {
            console.error("[ArticleGenerator] JSON Parse Error. Raw content:", rawContent);
            throw new Error("L'IA n'a pas renvoyé un format JSON valide. Veuillez réessayer.");
        }

        // Validation basique des champs
        if (!parsedArticle.title || !parsedArticle.content) {
            throw new Error("Le contenu généré est incomplet (titre ou content manquant).");
        }

        // 4. Calcul du Trust Score Global (Réutilisation logique chat.ts et trust-score.ts)
        // Map citations to domains
        console.log('Raw sources from AI (JSON):', parsedArticle.detectedSources);

        // Stratégie : Priorité aux citations natives Perplexity (grounding)
        // Mais si vide (cas fréquent avec certains modèles), fallback sur le JSON
        let citationUrls = rawCitations;
        if (!citationUrls || citationUrls.length === 0) {
            citationUrls = parsedArticle.detectedSources || [];
        }

        const sources = await Promise.all(citationUrls.map(async (url: string, idx: number) => {
            let domain = '';
            try { domain = new URL(url).hostname.replace('www.', ''); } catch { }

            // Audit via Trust Engine
            const richScore = await getRichTrustScore(domain);

            return {
                id: idx + 1,
                name: richScore.metadata.name,
                url: url,
                domain: domain,
                trustScore: richScore.globalScore, // Score individuel
                flags: richScore.flags,
                type: richScore.metadata.type,
                // UI Helpers
                logo: `https://logo.clearbit.com/${domain}`,
                description: richScore.metadata.description,
                metrics: richScore.details
            };
        }));

        // Calcul Moyenne Sources (75% du score)
        const validScores = sources.filter(s => s.trustScore > 0).map(s => s.trustScore);
        const sourcesMean = validScores.length > 0
            ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
            : 50; // Défaut si pas de source qualifiée

        // Note Output : Analyse réelle de la qualité du texte généré
        const outputAnalysis = analyzeOutputQuality(parsedArticle.content);
        const outputScore = outputAnalysis.score;

        // Diversité
        const domains = sources.map(s => s.domain).filter(d => !!d);
        let diversityPenalty = 0;
        if (domains.length >= 3) {
            const counts: Record<string, number> = {};
            domains.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
            const maxCount = Math.max(...Object.values(counts));
            if ((maxCount / domains.length) > 0.5) diversityPenalty = 10;
        }

        const calculatedScore = Math.round((sourcesMean * 0.75) + (outputScore * 0.25) - diversityPenalty);
        const finalFactScore = Math.min(100, Math.max(0, calculatedScore));

        // Estimation temps de lecture (200 mots/min)
        const wordCount = parsedArticle.content.split(/\s+/).length;
        const readTime = Math.ceil(wordCount / 200) + " min";

        // 5. Retour Résultat Structuré
        return {
            title: parsedArticle.title,
            summary: parsedArticle.summary || parsedArticle.excerpt || parsedArticle.description || "",
            content: parsedArticle.content,
            tags: Array.isArray(parsedArticle.tags) ? parsedArticle.tags : [],
            category: parsedArticle.category || request.category || "Général",
            estimatedReadTime: readTime,
            factScore: finalFactScore,
            sources: sources,
            imagePrompt: parsedArticle.imagePrompt // Peut être null
        };

    } catch (error) {
        console.error("[ArticleGenerator] Error:", error);
        throw error;
    }

}

export async function transformTextWithAI(instruction: string, content: string, field: string = 'text'): Promise<string> {
    const isEmpty = !content || content.trim().length === 0;

    const systemPrompt = isEmpty
        ? `Tu es un éditeur en chef expert. 
Tu dois RÉDIGER le contenu pour le champ '${field}' basé sur l'instruction : '${instruction}'.
Renvoie UNIQUEMENT le texte rédigé. Pas de guillemets, pas de phrases d'intro.`
        : `Tu es un éditeur en chef expert. Ton but est de modifier le texte fourni en respectant STRICTEMENT l'instruction de l'utilisateur.
Renvoie UNIQUEMENT le texte modifié. Pas de guillemets, pas de phrases d'intro du type "Voici le texte modifié". Si l'instruction est impossible, renvoie le texte original.`;

    const userContent = isEmpty
        ? `Instruction : "${instruction}"`
        : `Instruction : "${instruction}"
Texte original :
"""
${content}
"""`;

    const messages: PerplexityMessage[] = [
        {
            role: 'system',
            content: systemPrompt
        },
        {
            role: 'user',
            content: userContent
        }
    ];

    try {
        const response = await callPerplexity(messages, 'sonar');
        let result = response.choices[0].message.content.trim();

        // Nettoyage basique si l'IA bavarde
        if (result.startsWith('"') && result.endsWith('"')) {
            result = result.slice(1, -1);
        }
        return result;

    } catch (error) {
        console.error("[ArticleGenerator] Edit Error:", error);
        throw new Error("L'IA n'a pas pu modifier le texte.");
    }
}

