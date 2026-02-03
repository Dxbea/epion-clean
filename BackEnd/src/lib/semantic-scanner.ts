import { JSDOM } from 'jsdom';

const TRIGGER_WORDS = [
    'choc', 'incroyable', 'secret', 'honteux', 'scandale', 'censuré',
    'miracle', 'urgent', 'virus', 'complot', 'découvrez', 'bientôt', 'exclusif',
    'tu ne devineras jamais', 'hallucinant', 'banni', 'détestent', 'scandaleux',
    'partagez avant suppression', 'mind-blowing', 'shocking', "you won't believe"
];

function countSyllables(word: string): number {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
}

export interface QualityAnalysisResult {
    score: number;
    isClickbait: boolean;
    biasLevel: string;
    details: {
        capsRatio: number;
        exclamationCount: number;
        triggerCount: number;
        readabilityScore: number;
    };
}

// --- CORE ANALYSIS FUNCTION ---
export function analyzeTextQuality(text: string): QualityAnalysisResult {
    if (!text) return {
        score: 100,
        isClickbait: false,
        biasLevel: 'NEUTRAL',
        details: { capsRatio: 0, exclamationCount: 0, triggerCount: 0, readabilityScore: 100 }
    };

    // 1. Analyse Caps Lock & Ponctuation
    const upperCaseCount = (text.match(/[A-Z]/g) || []).length;
    // On ne compte que les caractères alphabétiques pour le ratio
    const alphaCount = (text.match(/[a-zA-Z]/g) || []).length;
    const capsRatio = alphaCount > 0 ? upperCaseCount / alphaCount : 0;

    // Check for excessive exclamations (either multiple '!!' or just high volume)
    // User requested "points d'exclamation excessifs"
    const exclamationSequenceCount = (text.match(/!{2,}/g) || []).length;
    const totalExclamations = (text.match(/!/g) || []).length;

    // Penalize if too many ! overall, or usage of !!
    const effectiveExclamationPenalty = exclamationSequenceCount + (totalExclamations > 3 ? (totalExclamations - 3) * 0.5 : 0);

    // 2. Trigger Words
    const lowerText = text.toLowerCase();
    const triggerCount = TRIGGER_WORDS.filter(w => lowerText.includes(w)).length;

    // 3. Lisibilité (Flesch-Kincaid simplifiée)
    // On nettoie un peu le texte pour éviter de compter le markdown comme des phrases
    const cleanText = text.replace(/$$\d+$$/g, '').replace(/[*#]/g, '');
    const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = cleanText.split(/\s+/).filter(w => w.trim().length > 0);

    let readabilityScore = 50;
    if (sentences.length > 0 && words.length > 0) {
        const totalSyllables = words.reduce((acc, word) => acc + countSyllables(word), 0);
        const gradeLevel = (0.39 * (words.length / sentences.length)) + (11.8 * (totalSyllables / words.length)) - 15.59;

        // Un bon texte journalistique est entre 8 et 14
        if (gradeLevel >= 8 && gradeLevel <= 14) readabilityScore = 90;
        else if (gradeLevel < 6) readabilityScore = 70; // Trop simple
        else readabilityScore = 60; // Trop complexe
    } else {
        readabilityScore = 90; // Default if text is too short to analyze properly (avoid penalty)
    }

    // Scoring
    let score = 100; // Base Neutrality

    // Penalties
    if (capsRatio > 0.15) score -= 20; // >15% CAPS
    if (effectiveExclamationPenalty > 0) score -= (effectiveExclamationPenalty * 10);
    if (triggerCount > 0) score -= (triggerCount * 15);

    score = Math.max(0, score); // Prevent negative intermediate

    // Combine with Readability (Weighted average? or separate?)
    // User said: "GlobalScore = ... + (ScoreOutput * 0.25)"
    // "Retourne : Un score sur 100"
    // Let's mix Readability lightly into the final score, or mostly rely on Neutrality/Tone.
    // The prompt says: "Neutralité... Lisibilité... Retourne : Un score sur 100"

    const finalScore = Math.round((score * 0.7) + (readabilityScore * 0.3));

    const isClickbait = (capsRatio > 0.3 || triggerCount > 1);

    return {
        score: Math.min(100, Math.max(0, finalScore)),
        isClickbait,
        biasLevel: finalScore < 70 ? 'POTENTIAL_BIAS' : 'NEUTRAL',
        details: {
            capsRatio,
            exclamationCount: totalExclamations,
            triggerCount,
            readabilityScore
        }
    };
}

// --- ALIAS REQUESTED BY USER ---
export function analyzeOutputQuality(text: string): QualityAnalysisResult {
    return analyzeTextQuality(text);
}

// --- LEGACY SUPPORT (For URL Analysis) ---
export { analyzeTextQuality as analyzeRawText }; // Alias for existing code if needed

// --- FONCTION EXISTANTE : Analyse d'URL (utilise la fonction brute) ---
export async function analyzeSemantics(domain: string) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`https://${domain}`, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        // Extraction
        const title = (document.title || "").toLowerCase();
        const h1s = Array.from(document.querySelectorAll('h1')).map(h => h.textContent || "").join(" ");
        const textSample = (title + " " + h1s + " " + (document.body.textContent?.slice(0, 1000) || "")).trim();

        const qualityResult = analyzeTextQuality(textSample);

        // --- HARDENING CLICKBAIT (Sur le Titre) ---
        // Si le titre contient plus de 1 mot déclencheur, c'est du clickbait forcé
        const titleTriggerCount = TRIGGER_WORDS.filter(w => title.includes(w)).length;
        if (titleTriggerCount > 1) {
            qualityResult.isClickbait = true;
            qualityResult.score = Math.min(qualityResult.score, 40); // Penalty max
            qualityResult.biasLevel = 'SENSATIONALIST';
        }

        return qualityResult;

    } catch (error) {
        return {
            score: 50,
            isClickbait: false,
            biasLevel: 'UNKNOWN',
            details: { capsRatio: 0, exclamationCount: 0, triggerCount: 0, readabilityScore: 0 }
        };
    }
}
