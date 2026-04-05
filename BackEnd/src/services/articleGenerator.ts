import { callPerplexity, type PerplexityMessage } from '../lib/perplexity';
import { getRichTrustScore } from '../lib/trust-score';
import { buildArticlePrompt } from '../lib/prompts/articlePrompts';
import { GenerateArticleRequest } from '../types/article';
import { analyzeOutputQuality } from '../lib/semantic-scanner';
import { MODEL_DETAILS, AI_MODELS } from '../config/ai-models';

// Legacy single-generation function removed.
// We now rely entirely on LiveAnalysis for article generation.

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

