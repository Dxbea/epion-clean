
import { logger } from "./logger";

export interface FactCheckResult {
    failureCount: number;
    recentFailures: boolean;
}

export async function checkMediaReputation(domain: string): Promise<FactCheckResult> {
    const apiKey = process.env.GOOGLE_FACT_CHECK_KEY;
    if (!apiKey) {
        logger.error('CRITICAL ERROR: No API Key found in env (GOOGLE_FACT_CHECK_KEY). Audit will be skipped.', { module: 'GoogleFactCheck' });
        return { failureCount: 0, recentFailures: false };
    }

    const TIMEOUT_MS = 10000; // 10s timeout
    const MAX_RETRIES = 2; // 1 initial + 1 retry

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const query = `site:${domain}`;
            const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search?key=${apiKey}&query=${encodeURIComponent(query)}&pageSize=15`;

            logger.debug(`Calling Google API (Attempt ${attempt})`, { module: 'GoogleFactCheck', domain });

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);

            logger.debug('HTTP Status', { module: 'GoogleFactCheck', status: response.status });

            if (!response.ok) {
                // Retry only on server errors
                if (response.status >= 500 && attempt < MAX_RETRIES) {
                    throw new Error(`Server Error ${response.status}`);
                }
                logger.error('API Error', { module: 'GoogleFactCheck', status: response.status, statusText: response.statusText });
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
                logger.info('No claims found', { module: 'GoogleFactCheck', count: 0 });
                return { failureCount: 0, recentFailures: false };
            }

            logger.info('Claims found', { module: 'GoogleFactCheck', count: data.claims.length });

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

            logger.info('Negative claims identified', { module: 'GoogleFactCheck', negativeCount: count });

            return {
                failureCount: count,
                recentFailures: count > 0
            };

        } catch (error: any) {
            clearTimeout(timeout);
            logger.warn(`Attempt ${attempt} failed`, { module: 'GoogleFactCheck', error: error.message });

            if (attempt < MAX_RETRIES) {
                logger.warn("Google check timeout or error, retrying...", { module: 'GoogleFactCheck' });
                continue;
            }

            // On final fatal error, return neutral
            logger.error('Critical failure after retries', { module: 'GoogleFactCheck', error });
            return { failureCount: 0, recentFailures: false };
        }
    }

    return { failureCount: 0, recentFailures: false };
}
