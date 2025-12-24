
import { JSDOM } from 'jsdom';
const AD_NETWORKS = ['googlesyndication', 'doubleclick', 'outbrain', 'taboola', 'criteo', 'rubicon', 'pubmatic', 'amazon-adsystem'];
const DARK_PATTERNS = ['offre limitée', 'expire dans', 'personnes regardent cet article', 'ne ratez pas', 'last chance'];

export async function analyzeUX(domain: string) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500); // Timeout 3.5s

        const response = await fetch(`https://${domain}`, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        clearTimeout(timeout);
        if (!response.ok) throw new Error('Fetch failed');

        const html = await response.text();
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        const textContent = doc.body.textContent?.toLowerCase() || "";
        const htmlContent = html.toLowerCase();

        // Analyse Pubs
        let adCount = 0;
        AD_NETWORKS.forEach(net => { if (htmlContent.match(new RegExp(net, 'g'))) adCount++; });

        let uxScore = 90;
        let adDensity = 'LOW';
        if (adCount > 8) { uxScore = 40; adDensity = 'HIGH'; }
        else if (adCount > 3) { uxScore = 70; adDensity = 'MEDIUM'; }

        // Analyse Dark Patterns
        let hasDarkPatterns = false;
        DARK_PATTERNS.forEach(p => { if (textContent.includes(p)) hasDarkPatterns = true; });
        if (hasDarkPatterns) uxScore -= 20;

        // Indicateurs Structurels
        const hasAbout = textContent.includes("mentions légales") || textContent.includes("qui sommes-nous") || textContent.includes("about us");
        const hasCorrectionPolicy = textContent.includes("politique de correction") || textContent.includes("charte déontologique");

        return { score: Math.max(0, uxScore), adDensity, hasDarkPatterns, hasAbout, hasCorrectionPolicy };

    } catch (error) {
        return { score: 60, adDensity: 'UNKNOWN', hasDarkPatterns: false, hasAbout: false, hasCorrectionPolicy: false };
    }
}
