import { JSDOM } from 'jsdom';
import axios from 'axios';

// Regex for textual citations (French & English)
const CITATION_PATTERNS = [
    /selon\s+([A-Z][a-z]+)/i,           // Selon Le Monde...
    /d'après\s+([A-Z][a-z]+)/i,         // D'après l'étude...
    /source\s*:\s*([A-Z][a-z]+)/i,      // Source : AFP
    /rapporté\s+par\s+([A-Z][a-z]+)/i,   // Rapporté par Reuters
    /according\s+to\s+([A-Z][a-z]+)/i,   // According to CNN
    /reported\s+by\s+([A-Z][a-z]+)/i,    // Reported by AP
    /citing\s+([A-Z][a-z]+)/i,           // Citing Fox News
];

export interface EditorialAnalysisResult {
    scoreModifier: number; // -15 to +10
    details: {
        externalLinkCount: number;
        citationCount: number;
        hasAuthorityLinks: boolean;
    };
}

interface EditorialScannerInput {
    content?: string;
    metaDescription?: string | null;
}

function scoreEditorialFromText(text: string): EditorialAnalysisResult {
    const scanText = text.substring(0, 5000);
    let totalMatches = 0;

    CITATION_PATTERNS.forEach(regex => {
        const globalRegex = new RegExp(regex.source, 'gi');
        const found = scanText.match(globalRegex);
        if (found) totalMatches += found.length;
    });

    const citationCount = totalMatches;
    const externalLinkCount = 0;
    const hasAuthorityLinks = false;
    const totalEvidences = externalLinkCount + citationCount;

    let scoreModifier = -15;
    if (totalEvidences >= 3 || hasAuthorityLinks) {
        scoreModifier = 10;
    } else if (totalEvidences >= 1) {
        scoreModifier = -5;
    }

    return {
        scoreModifier,
        details: {
            externalLinkCount,
            citationCount,
            hasAuthorityLinks,
        },
    };
}

export async function analyzeEditorial(domain: string, input: EditorialScannerInput = {}): Promise<EditorialAnalysisResult> {
    try {
        const providedText = `${input.metaDescription || ''} ${input.content || ''}`.trim();
        if (providedText.length >= 120) {
            return scoreEditorialFromText(providedText);
        }

        const url = `https://${domain}`;

        // 1. Fetch HTML (Timeout 3s)
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const response = await axios.get(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Epion-Bot/1.0 (EditorialScanner)' },
            validateStatus: () => true // Don't throw on 404/500 immediately
        });
        clearTimeout(timeout);

        if (response.status >= 400) {
            return { scoreModifier: 0, details: { externalLinkCount: 0, citationCount: 0, hasAuthorityLinks: false } };
        }

        const dom = new JSDOM(response.data);
        const doc = dom.window.document;
        const bodyText = doc.body.textContent || "";

        // 2. Scan Links (<a> Tags)
        const links = Array.from(doc.querySelectorAll('a'));
        let externalLinkCount = 0;
        let hasAuthorityLinks = false;

        // Authority Domains (Simple list)
        const AUTHORITIES = ['wikipedia.org', 'gouv.fr', '.gov', '.edu', 'reuters.com', 'apnews.com', 'lemonde.fr', 'nytimes.com', 'bbc.com'];

        links.forEach(link => {
            try {
                const href = link.href;
                if (!href.startsWith('http')) return;
                const hostname = new URL(href).hostname;

                // Exclude internal links
                if (!hostname.includes(domain)) {
                    externalLinkCount++;
                    if (AUTHORITIES.some(auth => hostname.includes(auth))) {
                        hasAuthorityLinks = true;
                    }
                }
            } catch (e) { /* ignore invalid URLs */ }
        });

        const textOnlyResult = scoreEditorialFromText(bodyText);
        const citationCount = textOnlyResult.details.citationCount;

        // 4. Scoring Logic (Tiered)
        // - 0 Sources (No link, no text citation): -15 pts
        // - 1-2 Vague Mentions: -5 pts
        // - 3+ Authority Citations: +10 pts

        const totalEvidences = externalLinkCount + citationCount;
        let scoreModifier = -15; // Default Penalty (Opinion/Rumor)

        if (totalEvidences >= 3 || hasAuthorityLinks) {
            scoreModifier = 10; // Bonus
        } else if (totalEvidences >= 1) {
            scoreModifier = -5; // Small Penalty (Vague)
        } else {
            scoreModifier = -15; // Full Penalty
        }

        return {
            scoreModifier,
            details: {
                externalLinkCount,
                citationCount,
                hasAuthorityLinks
            }
        };

    } catch (error) {
        console.error(`[EditorialScanner] Error scanning ${domain}:`, error);
        return {
            scoreModifier: 0, // Fallback Neutral
            details: { externalLinkCount: 0, citationCount: 0, hasAuthorityLinks: false }
        };
    }
}
