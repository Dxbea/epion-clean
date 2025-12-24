
import { JSDOM } from 'jsdom';
const TRIGGER_WORDS = ['choc', 'incroyable', 'secret', 'honteux', 'scandale', 'censuré', 'miracle', 'urgent', 'virus', 'complot', 'découvrez', 'bientôt', 'exclusif'];

function countSyllables(word: string): number { word = word.toLowerCase(); if (word.length <= 3) return 1; word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, ''); word = word.replace(/^y/, ''); const matches = word.match(/[aeiouy]{1,2}/g); return matches ? matches.length : 1; }

export function analyzeRawText(text: string) {
    // 1. Analyse Clickbait 
    const upperCaseCount = (text.match(/[A-Z]/g) || []).length;
    const capsRatio = text.length > 0 ? upperCaseCount / text.length : 0;
    const triggerCount = TRIGGER_WORDS.filter(w => text.toLowerCase().includes(w)).length;
    const isClickbait = (capsRatio > 0.4 || triggerCount > 2);

    // 2. Lisibilité (Flesch-Kincaid simplifiée)
    // On nettoie un peu le texte pour compter les phrases/mots
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.trim().length > 0);

    let readabilityScore = 50;
    if (sentences.length > 0 && words.length > 0) {
        const totalSyllables = words.reduce((acc, word) => acc + countSyllables(word), 0);
        const gradeLevel = (0.39 * (words.length / sentences.length)) + (11.8 * (totalSyllables / words.length)) - 15.59;

        // Grade 8-14 est considéré comme "bien" pour un article grand public sérieux.
        if (gradeLevel >= 8 && gradeLevel <= 14) readabilityScore = 90;
        else readabilityScore = 60;
    }

    // 3. Scoring
    let score = 90;
    if (isClickbait) score -= 30;
    if (triggerCount > 0) score -= (triggerCount * 5);
    score = (score + readabilityScore) / 2;

    return {
        score: Math.round(score),
        isClickbait,
        biasLevel: score < 60 ? 'POTENTIAL_SENSATIONALIST' : 'NEUTRAL',
        readabilityScore
    };
}

export async function analyzeSemantics(domain: string) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000); // Timeout strict 3s

        const response = await fetch(`https://${domain}`, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html'
            }
        });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        // 1. Extraction
        const title = document.title || "";
        const h1s = Array.from(document.querySelectorAll('h1')).map(h => h.textContent || "").join(" ");
        const paragraphs = Array.from(document.querySelectorAll('p')).map(p => p.textContent || "").join(" ");

        const fullText = (title + " " + h1s + " " + paragraphs).trim();

        // 2. Appel de la logique partagée
        return analyzeRawText(fullText);

    } catch (error) {
        return { score: 50, isClickbait: false, biasLevel: 'UNKNOWN' }; // Fail-safe 
    }
}
