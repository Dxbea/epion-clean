
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

        // --- NEW: INTRUSIVENESS ANALYSIS ("Fair Play") ---
        let intrusivenessScore = 0; // 0 = Clean, 10 = Hell

        // 1. Popup / Overlay Detection (Heuristic via Class/IDs)
        // JSDOM doesn't render, so we look for intent in the code.
        const popupKeywords = ['modal', 'popup', 'overlay', 'interstitial', 'subscribe-wall'];
        const suspectElements = Array.from(doc.querySelectorAll('div, section, aside'));

        let foundPopup = false;
        for (const el of suspectElements) {
            const id = el.id.toLowerCase();
            const cls = el.className.toLowerCase();
            if (popupKeywords.some(kw => id.includes(kw) || cls.includes(kw))) {
                // Refinement: Ignore "login-modal" or "search-modal" (User triggered)
                // We focus on "newsletter", "ad", "promo"
                if (id.includes('subscribe') || cls.includes('newsletter') || id.includes('promo')) {
                    foundPopup = true;
                    break;
                }
            }
        }
        if (foundPopup) intrusivenessScore += 4; // Big penalty for proactive popups

        // 2. Autoplay Video (Critical Penalty)
        // Look for <video autoplay> or <iframe allow="autoplay">
        let hasAutoplay = false;
        if (htmlContent.includes('<video') && htmlContent.includes('autoplay')) {
            hasAutoplay = true;
        }
        if (hasAutoplay) intrusivenessScore += 5; // User hates this

        // 3. Sticky Ads / Footer Ads
        const stickyKeywords = ['sticky-footer', 'bottom-bar', 'floating-ad'];
        if (stickyKeywords.some(kw => htmlContent.includes(kw))) {
            intrusivenessScore += 2; // Annoying but standard
        }

        // 4. Fallback: Script density (Ad Networks)
        // We still count them but with less weight (0.5 pts each)
        // Just to detect "MFA" (Made For Ads) sites that have 50 trackers.
        let adScriptCount = 0;
        AD_NETWORKS.forEach(net => {
            const matches = htmlContent.match(new RegExp(net, 'g'));
            if (matches) adScriptCount += matches.length;
        });

        // MFA Detection: If > 15 scripts, it's an ad farm.
        if (adScriptCount > 15) intrusivenessScore += 3;


        // Calculate Final UX Score
        // Base 100 - (Intrusiveness * 10)
        let uxScore = Math.max(0, 100 - (intrusivenessScore * 10));

        // Map to Legacy "AdDensity" for DB
        let adDensity = 'LOW';
        if (intrusivenessScore >= 7) adDensity = 'HIGH';
        else if (intrusivenessScore >= 3) adDensity = 'MEDIUM';


        // Analyse Dark Patterns
        let hasDarkPatterns = false;
        DARK_PATTERNS.forEach(p => { if (textContent.includes(p)) hasDarkPatterns = true; });
        if (hasDarkPatterns) uxScore -= 20;

        // Indicateurs Structurels
        const hasAbout = textContent.includes("mentions légales") || textContent.includes("qui sommes-nous") || textContent.includes("about us");
        const hasCorrectionPolicy = textContent.includes("politique de correction") || textContent.includes("charte déontologique");

        // Detection Propriétaire (isOwnerPublic)
        const ownerKeywords = [
            "directeur de la publication", "édité par", "edite par", "mentions légales", "siège social", "rcs", "capital social",
            "published by", "editorial board", "masthead", "owned by"
        ];
        const isOwnerPublic = ownerKeywords.some(kw => textContent.includes(kw));

        return { score: Math.max(0, uxScore), adDensity, hasDarkPatterns, hasAbout, hasCorrectionPolicy, isOwnerPublic, intrusivenessScore };

    } catch (error) {
        return { score: 60, adDensity: 'UNKNOWN', hasDarkPatterns: false, hasAbout: false, hasCorrectionPolicy: false, isOwnerPublic: false, intrusivenessScore: 0 };
    }
}
