
export interface FactCheckResult {
    failureCount: number;
    recentFailures: boolean;
}

export async function checkMediaReputation(domain: string): Promise<FactCheckResult> {
    const apiKey = process.env.GOOGLE_FACT_CHECK_KEY;
    if (!apiKey) {
        console.error('[GoogleFactCheck] ❌ CRITICAL ERROR: No API Key found in env (GOOGLE_FACT_CHECK_KEY). Audit will be skipped.');
        return { failureCount: 0, recentFailures: false };
    }

    try {
        const query = `site:${domain}`;
        const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search?key=${apiKey}&query=${encodeURIComponent(query)}&pageSize=15`;

        console.log(`[GoogleFactCheck] 📡 Appel Google API pour : ${domain}`);
        const response = await fetch(url);
        console.log(`[GoogleFactCheck] 🔄 Status HTTP: ${response.status}`);

        if (!response.ok) {
            console.error(`[GoogleFactCheck] API Error ${response.status}: ${response.statusText}`);
            return { failureCount: 0, recentFailures: false };
        }

        interface GoogleClaim {
            claimReview?: { textualRating?: string }[];
        }
        interface GoogleResponse {
            claims?: GoogleClaim[];
        }

        const data = await response.json() as GoogleResponse;

        if (!data.claims || !Array.isArray(data.claims)) {
            console.log(`[GoogleFactCheck] 📊 Claims trouvés : 0 (Pas de données)`);
            return { failureCount: 0, recentFailures: false };
        }

        console.log(`[GoogleFactCheck] 📊 Claims trouvés : ${data.claims.length}`);

        const negativeKeywords = [
            "False", "Faux", "Fake", "Incorrect", "Misleading", "Trompeur",
            "Pants on Fire", "Inexact", "Mensonger", "Infondé", "Debunked"
        ];

        let count = 0;

        // Analyse des 15 derniers claims
        for (const claim of data.claims) {
            // On regarde généralement le premier claimReview qui est souvent le plus pertinent
            if (claim.claimReview && claim.claimReview.length > 0) {
                const rating = claim.claimReview[0].textualRating;
                if (rating) {
                    // Check if rating contains any negative keyword (case insensitive)
                    const isNegative = negativeKeywords.some(keyword =>
                        rating.toLowerCase().includes(keyword.toLowerCase())
                    );

                    if (isNegative) {
                        count++;
                    }
                }
            }
        }

        console.log(`[GoogleFactCheck] 🚩 Claims négatifs retenus : ${count}`);

        return {
            failureCount: count,
            recentFailures: count > 0
        };

    } catch (error) {
        console.error('[GoogleFactCheck] Critical failure:', error);
        return { failureCount: 0, recentFailures: false };
    }
}
