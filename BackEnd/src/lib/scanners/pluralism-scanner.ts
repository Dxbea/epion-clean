
import { logger } from "../logger";
import { callWebSearchLLM } from "../web-chat";
import { JSDOM } from 'jsdom';
import { searchSerper } from "../serper";

interface PluralismResult {
    score: number;
    details: {
        pivots: number;
        entities: number;
        controversy: number;
    };
    reasoning: string;
}

// Mots-clés pour les pivots de nuance (Regex)
const PIVOT_KEYWORDS = [
    /cependant/i,
    /toutefois/i,
    /néanmoins/i,
    /au contraire/i,
    /en revanche/i,
    /selon les critiques/i,
    /d'après l'opposition/i,
    /bien que/i,
    /malgré/i
];

/**
 * Analyzes the pluralism of a source (Diversity of Viewpoints).
 * Hybrid Strategy:
 * 1. Try to fetch Article/Homepage Content (URL preferred, else Domain).
 * 2. If Content is rich (>2000 chars): Analyze Content (Regex Pivots + LLM Entity/Controversy).
 * 3. If Content is poor (Fetch fail/Anti-bot): Analyze Content via Serper snippets + LLM.
 */
export async function analyzePluralism(domain: string, url?: string): Promise<PluralismResult> {
    const targetUrl = url || `https://${domain}`;
    logger.info(`Starting Pluralism Analysis for ${targetUrl}...`, { module: "PluralismScanner" });

    // 0. FETCH CONTENT
    let content = "";
    let isContentValid = false;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
            }
        });
        clearTimeout(timeout);

        if (response.ok) {
            const html = await response.text();
            const dom = new JSDOM(html);
            const document = dom.window.document;

            // cleanup scripts/styles
            document.querySelectorAll('script, style, nav, footer, iframe').forEach(el => el.remove());

            content = (document.body.textContent || "").replace(/\s+/g, ' ').trim();

            // Threshold: 3000 chars of actual text required to be considered "analyzable" article
            // Helps avoid analyzing cookie banners or nav menus as content.
            if (content.length > 3000) {
                isContentValid = true;
            }
        }
    } catch (e: any) {
        logger.warn(`Failed to fetch content for Pluralism (${domain}): ${e.message}`, { module: "PluralismScanner" });
    }

    // --- STRATEGY A: CONTENT ANALYSIS (If Fetch Success) ---
    if (isContentValid) {
        logger.info(`Pluralism: Content Valid (${content.length} chars). Running Direct Analysis.`, { module: "PluralismScanner" });
        return analyzeContentStrategies(content);
    }

    // --- STRATEGY B: ONLINE SEARCH ANALYSIS (If Fetch Fail/Poor) ---
    else {
        logger.info(`Pluralism: Content Invalid/Blocked. Falling back to Online Search Analysis.`, { module: "PluralismScanner" });
        return analyzeContentViaSearchStrategy(domain);
    }
}

/**
 * Strategy A: Regex + LLM on specific text (Locally Fetched)
 */
async function analyzeContentStrategies(content: string): Promise<PluralismResult> {
    // 1. PIVOTS (Regex) - 20 pts
    let pivotCount = 0;
    PIVOT_KEYWORDS.forEach(regex => {
        const matches = content.match(regex);
        if (matches) pivotCount += matches.length;
    });
    const pivotScore = Math.min(pivotCount * 4, 20);

    // 2. LLM ANALYSIS (Entities & Controversy) - 80 pts
    const prompt = `
    You are an impartial media auditor. Analyze the following article content for PLURALISM.

    **Definitions:**
    - **Pluralism**: The presence of *multiple opposing viewpoints* presented fairly within the same text.
    - **Advocacy/Opinion**: Strong editorial line, one-sided arguments, denunciation of "enemies". (Low Pluralism)
    - **Debate/Nuance**: Citations of disagreeing parties, steel-manning arguments, neutral tone. (High Pluralism)

    **Task 1: Notion & Entity Diversity** (Score 0-10)
    - 0-3: Only citations that support the author's view. Opponents are only mentioned to be mocked/denounced.
    - 4-7: Mainstream diversity (Government vs Opposition), but framed within a specific narrative.
    - 8-10: Wide spectrum (Radical to Conservative), giving voice to all sides equally.

    **Task 2: Openness to Controversy** (Score 0-10)
    - 0-3: Dogmatic. The truth is stated as absolute. No room for doubt. (e.g. "It is undeniable that...", "The corrupt system...")
    - 4-7: Discusses controversy but concludes strongly.
    - 8-10: Open-ended. Acknowledges complexity, trade-offs, and lack of easy answers.

    Return JSON: { "entityDiversityScore": number, "controversyOpennessScore": number, "reasoning": string }

    Content (Truncated):
    ${content.slice(0, 5000)}
    `;

    try {
        const { answer } = await callWebSearchLLM([{ role: 'user', content: prompt }], {
            useSearch: false,
        });
        const parsed = parseLLMResponse(answer);

        const entityScore = (Number(parsed.entityDiversityScore) || 0) * 4;
        const controversyScore = (Number(parsed.controversyOpennessScore) || 0) * 4;

        return {
            score: Math.round(pivotScore + entityScore + controversyScore),
            details: {
                pivots: pivotScore,
                entities: entityScore,
                controversy: controversyScore
            },
            reasoning: parsed.reasoning || "AI Analysis completed."
        };
    } catch (error: any) {
        return { score: 50, details: { pivots: pivotScore, entities: 0, controversy: 0 }, reasoning: "AI Failed on Content." };
    }
}

/**
 * Strategy B: Online Search Analysis (Serper snippets + LLM)
 * Used when we cannot read the site (paywall, anti-bot).
 * We inspect recent indexed coverage for the site without re-running the full article pipeline.
 */
async function analyzeContentViaSearchStrategy(domain: string): Promise<PluralismResult> {
    const results = await searchSerper(`site:${domain}`, {
        maxResults: 5,
        gl: 'fr',
        hl: 'fr',
    });

    if (results.length === 0) {
        return {
            score: 50,
            details: { pivots: 10, entities: 20, controversy: 20 },
            reasoning: "Aucun résultat Serper exploitable pour évaluer le pluralisme."
        };
    }

    const serperContext = results
        .map((result, index) => [
            `[Result ${index + 1}]`,
            `Title: ${result.title}`,
            `URL: ${result.url}`,
            `Snippet: ${result.content || '(no snippet)'}`,
        ].join('\n'))
        .join('\n\n');

    const prompt = `
    You are an impartial media auditor. The user wants to check the **PLURALISM** of the website: ${domain}.
    We cannot access the homepage directly (blocked).
    Base your analysis ONLY on these recent Serper results:

    ${serperContext}

    **ANALYZE**: Based on the content of these search results (titles + snippets):

    **Strict Scoring Criteria:**
    - **Pluralism**: Does the source present multiple conflicting viewpoints neutrally?
    - **Advocacy (Low Score)**: Sources like Mediapart, Valeurs Actuelles, or Activist blogs often have a strict "truth" vs "wrong" narrative. They may be Factually Reliable, but they are NOT Pluralistic (they don't give a platform to the "enemy"). **Score them LOW on Pluralism (0-40).**
    - **Neutral/Debate (High Score)**: Sources that host diverse Op-Eds, or present "He said/She said" reporting without taking a side. **Score them HIGH (60-100).**

    Estimate Metrics:
    1. **Textual Pivots** (0-20): Usage of "However", "On the other hand" vs "Clearly", "Scandalous".
    2. **Entity Diversity** (0-40): Do they quote opposing camps neutrally?
    3. **Controversy Openness** (0-40): Do they accept that the issue is complex?

    Return JSON:
    {
        "estimatedPivotScore": number, // 0-20
        "estimatedEntityScore": number, // 0-40
        "estimatedControversyScore": number, // 0-40
        "reasoning": "Analyze the *editorial tone* of the recent articles found."
    }
    `;

    try {
        const { answer } = await callWebSearchLLM([{ role: 'user', content: prompt }], {
            useSearch: false,
        });
        const parsed = parseLLMResponse(answer);

        // Map fields to our structure. Safe fallbacks.
        const pivots = Number(parsed.estimatedPivotScore) || 5;
        const entities = Number(parsed.estimatedEntityScore) || 15;
        const controversy = Number(parsed.estimatedControversyScore) || 15;

        return {
            score: Math.round(pivots + entities + controversy),
            details: {
                pivots: pivots,
                entities: entities,
                controversy: controversy
            },
            reasoning: `(Online Search Analysis) ${parsed.reasoning || "Based on recent article snippets."}`
        };
    } catch (error) {
        // Ultimate Fallback
        return {
            score: 50,
            details: { pivots: 10, entities: 20, controversy: 20 },
            reasoning: "Analysis unavailable (Access Blocked + AI Search Failed)."
        };
    }
}

// Helper to extract JSON
function parseLLMResponse(text: string): any {
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
    } catch {
        return {};
    }
}
