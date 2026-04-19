const STOP_WORDS = new Set([
    // French
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'où', 'à', 'au', 'aux',
    'en', 'dans', 'sur', 'pour', 'par', 'avec', 'sans', 'sous', 'vers', 'ce', 'cet', 'cette', 'ces',
    'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'qui', 'que', 'quoi', 'dont',
    'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'se',
    'est', 'sont', 'être', 'a', 'ont', 'avoir', 'ne', 'pas', 'plus', 'très', 'trop', 'tout', 'tous',
    'comme', 'mais', 'bien', 'fait', 'faire', 'cela', 'cette', 'cet', 'ces',
    // English
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'am', 'was', 'were', 'be', 'been',
    'to', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
    'of', 'off', 'from', 'up', 'down', 'out', 'over', 'under', 'again', 'further',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'he', 'him', 'his', 'she', 'her', 'hers',
    'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'we', 'us', 'our', 'ours',
    'not', 'no', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'have', 'has', 'had'
]);

function tokenize(text: string): string[] {
    return text.toLowerCase()
        // Replace non-alphanumeric (allowing accents) with spaces
        .replace(/[^a-z0-9àáâãäçèéêëìíîïñòóôõöùúûüýÿœæ]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

const MIN_PARAGRAPH_LENGTH = 80;

export function extractRelevantPassages(
    title: string, 
    articleText: string, 
    queries: string[]
): string | null {
    if (!articleText || articleText.trim().length === 0) return null;

    const queryTokens = new Set<string>();
    queries.forEach(q => {
        if (!q) return;
        tokenize(q).forEach(token => queryTokens.add(token));
    });

    if (queryTokens.size === 0) {
        return `Titre: ${title}\n\n${articleText.substring(0, 1500)}`; // Fallback
    }

    // Split on real paragraph breaks to avoid scoring isolated headings and list fragments.
    const paragraphs = articleText
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(p => p.length >= MIN_PARAGRAPH_LENGTH);
    
    interface ScoredParagraph {
        content: string;
        score: number;
        index: number;
    }

    const scored: ScoredParagraph[] = [];

    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const tokens = tokenize(p);
        if (tokens.length === 0) continue;

        let matchCount = 0;
        const matchedTokens = new Set<string>();
        
        for (const token of tokens) {
            if (queryTokens.has(token) && !matchedTokens.has(token)) {
                matchCount++;
                matchedTokens.add(token);
            }
        }
        
        if (matchCount > 0) {
            const density = matchCount / tokens.length;
            const lengthBonus = Math.max(1, Math.log(p.length));
            const score = density * lengthBonus;
            scored.push({ content: p, score, index: i });
        }
    }

    if (scored.length === 0) {
        return null;
    }

    scored.sort((a, b) => b.score - a.score);

    const topParagraphs = scored.slice(0, 4).map(p => ({
        ...p,
        content: p.content.length > 600 ? p.content.substring(0, 600) + '...' : p.content
    }));

    // Re-trier dans l'ordre chronologique de lecture
    topParagraphs.sort((a, b) => a.index - b.index);

    const extracts = topParagraphs.map(p => `... ${p.content} ...`);

    return `Titre : ${title}\n\n${extracts.join('\n\n')}`;
}
