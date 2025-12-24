
export async function analyzeAdsTxt(domain: string) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000); // Timeout 3s
        const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; EpionBot/1.0; +http://epion.ai)' };

        // Lancement parallèle sécurisé 
        const [adsRes, trustRes] = await Promise.allSettled([
            fetch(`https://${domain}/ads.txt`, { signal: controller.signal, headers }),
            fetch(`https://${domain}/trust.txt`, { signal: controller.signal, headers })
        ]);

        clearTimeout(timeout);

        let adsScore = 50;
        let isAdsTxtValid = false;
        let details = "Ads.txt non trouvé.";

        // Traitement Ads.txt
        if (adsRes.status === 'fulfilled' && adsRes.value.ok) {
            const text = await adsRes.value.text();
            const lines = text.split('\n').filter(l => !l.startsWith('#') && l.trim() !== '');
            const direct = lines.filter(l => l.toUpperCase().includes('DIRECT')).length;
            const reseller = lines.filter(l => l.toUpperCase().includes('RESELLER')).length;

            if (direct + reseller > 0) {
                isAdsTxtValid = true;
                if (direct / (direct + reseller) > 0.5) { adsScore = 90; details = "Ads.txt sain (Direct)."; }
                else if (reseller / (direct + reseller) > 0.9) { adsScore = 30; details = "Ads.txt suspect (MFA)."; }
                else { adsScore = 60; details = "Ads.txt mixte."; }
            }
        }

        // Bonus Trust.txt
        if (trustRes.status === 'fulfilled' && trustRes.value.ok) {
            adsScore += 10;
            details += " + Trust.txt certifié.";
        }

        return { score: Math.min(100, adsScore), isAdsTxtValid, details };

    } catch (error) {
        return { score: 50, isAdsTxtValid: false, details: "Non accessible." };
    }
}
