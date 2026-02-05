import { PrismaClient, PoliticalBias, Reliability } from '@prisma/client';

const prisma = new PrismaClient();

// REUSE EXCEPTIONS from fix-domains.ts (Expanded)
const DOMAIN_EXCEPTIONS: Record<string, string> = {
    "bbc": "bbc.com",
    "npr": "npr.org",
    "guardian": "theguardian.com",
    "theguardian": "theguardian.com",
    "ap": "apnews.com",
    "reuters": "reuters.com",
    "abcnews": "abcnews.go.com",
    "whitehouse": "whitehouse.gov",
    "nytimes": "nytimes.com",
    "usatoday": "usatoday.com",
    "cnn": "cnn.com",
    "foxnews": "foxnews.com",
    "nbcnews": "nbcnews.com",
    "cbsnews": "cbsnews.com",
    "washingtonpost": "washingtonpost.com",
    "wsj": "wsj.com",
    "politico": "politico.com",
    "thehill": "thehill.com",
    "huffpost": "huffpost.com",
    "aljazeera": "aljazeera.com",
    "bloomberg": "bloomberg.com",
    "nationalreview": "nationalreview.com",
    "dailywire": "dailywire.com",
    "breitbart": "breitbart.com",
    "newsweek": "newsweek.com",
    "time": "time.com",
    "businessinsider": "businessinsider.com",
    "vox": "vox.com",
    "vice": "vice.com",
    "buzzfeednews": "buzzfeednews.com",
    "economist": "economist.com",
    "ft": "ft.com",
    "propublica": "propublica.org",
    "democracynow": "democracynow.org",
    "jacobin": "jacobin.com",
    "motherjones": "motherjones.com",
    "theintercept": "theintercept.com",
    "axios": "axios.com",
    "slate": "slate.com",
    "salon": "salon.com",
    "vanityfair": "vanityfair.com",
    "newyorker": "newyorker.com",
    "theatlantic": "theatlantic.com",
    "rollingstone": "rollingstone.com",
    "foreignpolicy": "foreignpolicy.com",
    "scientificamerican": "scientificamerican.com",
    "nationalgeographic": "nationalgeographic.com",
    "smithsonianmag": "smithsonianmag.com",
    "techcrunch": "techcrunch.com",
    "theverge": "theverge.com",
    "wired": "wired.com",
    "engadget": "engadget.com",
    "gizmodo": "gizmodo.com",
    "cnet": "cnet.com",
    "mashable": "mashable.com",
    "ign": "ign.com",
    "gamespot": "gamespot.com",
    "espn": "espn.com",
    "si": "si.com",
    "bleacherreport": "bleacherreport.com",
    "christianitytoday": "christianitytoday.com",
    "csmonitor": "csmonitor.com",
    "jta": "jta.org",
    "timesofisrael": "timesofisrael.com",
    "jpost": "jpost.com",
    "haaretz": "haaretz.com",
};

function getScoreFromEnum(bias: PoliticalBias): number {
    switch (bias) {
        case PoliticalBias.EXTREME_LEFT: return -90;
        case PoliticalBias.LEFT: return -60;
        case PoliticalBias.CENTER_LEFT: return -30;
        case PoliticalBias.CENTER: return 0;
        case PoliticalBias.CENTER_RIGHT: return 30;
        case PoliticalBias.RIGHT: return 60;
        case PoliticalBias.EXTREME_RIGHT: return 90;
        default: return 0; // Mixed/Unknown
    }
}

function getEnumFromScore(score: number): PoliticalBias {
    if (score <= -75) return PoliticalBias.EXTREME_LEFT;
    if (score <= -45) return PoliticalBias.LEFT;
    if (score <= -15) return PoliticalBias.CENTER_LEFT;
    if (score <= 15) return PoliticalBias.CENTER;
    if (score <= 45) return PoliticalBias.CENTER_RIGHT;
    if (score <= 75) return PoliticalBias.RIGHT;
    return PoliticalBias.EXTREME_RIGHT;
}

async function main() {
    console.log("🤝 Starting Consensus Merger...");

    // 1. Get all sources imported from MBFC
    const mbfcSources = await prisma.source.findMany({
        where: { metadata: { path: ['importedFrom'], equals: 'MBFC' } }
    });

    console.log(`📋 Found ${mbfcSources.length} MBFC sources to potential merge.`);

    let merged = 0;
    let renamed = 0;
    let skipped = 0;

    let count = 0;
    for (const source of mbfcSources) {
        count++;
        const rawDomain = source.domain; // e.g., "cnn" or "fox-news"
        let targetDomain = rawDomain;

        // Clean: remove dashes matching exceptions logic if needed, but mostly look at raw slug
        const simpleSlug = rawDomain.replace(/-/g, '').toLowerCase();

        // 1. Check Exceptions
        if (DOMAIN_EXCEPTIONS[simpleSlug]) {
            targetDomain = DOMAIN_EXCEPTIONS[simpleSlug];
        } else if (DOMAIN_EXCEPTIONS[rawDomain]) {
            targetDomain = DOMAIN_EXCEPTIONS[rawDomain];
        } else if (!targetDomain.includes('.')) {
            // Heuristic: If no dot, add .com
            targetDomain = simpleSlug + ".com";
        }

        if (count < 10) {
            console.log(`Debug: "${rawDomain}" -> "${targetDomain}" (Slug: ${simpleSlug})`);
        }

        if (targetDomain === rawDomain) {
            skipped++;
            continue; // Already clean or sticking with it
        }

        // 2. Check if Target Exists (The "Real" Source, e.g. from AllSides)
        const existing = await prisma.source.findUnique({
            where: { domain: targetDomain }
        });

        if (existing) {
            // MERGE & CONSENSUS
            // Example:
            // Existing (CNN/AllSides): Left (-60)
            // Current (CNN/MBFC): Left (-60) OR Left-Center (-30)

            // Calculate Average Score
            // Note: existing.biasScore might be 0 if unknown, so fallback to Enum
            const score1 = existing.biasScore !== 0 ? existing.biasScore : getScoreFromEnum(existing.politicalBias);
            const score2 = source.biasScore !== 0 ? source.biasScore : getScoreFromEnum(source.politicalBias);

            // If one is 0/Unknown, trust the other. If both valid, average.
            let finalScore = score2; // Default to MBFC
            if (score1 !== 0 && score2 !== 0) {
                finalScore = Math.round((score1 + score2) / 2);
            } else if (score1 !== 0) {
                finalScore = score1;
            }

            const finalEnum = getEnumFromScore(finalScore);

            console.log(`🔄 Merging ${rawDomain} -> ${targetDomain}`);
            console.log(`   Scores: AllSides(${score1}) + MBFC(${score2}) -> Consensus(${finalScore})`);

            await prisma.source.update({
                where: { id: existing.id },
                data: {
                    mbfcRating: source.mbfcRating,
                    biasScore: finalScore,
                    politicalBias: finalEnum,
                    isConsensusVerified: true, // Verification achieved!
                    // Reliability: Prefer MBFC or whichever is stricter? Or MBFC if existing is Unknown.
                    // Let's assume MBFC is the "Factual Reporting" authority.
                    reliability: source.reliability !== Reliability.UNKNOWN ? source.reliability : existing.reliability,
                    metadata: {
                        ...(existing.metadata as object),
                        mergedWith: rawDomain,
                        consensusMethod: "average"
                    }
                }
            });

            // Delete the temporary MBFC source
            await prisma.source.delete({ where: { id: source.id } });
            merged++;

        } else {
            // RENAME
            // Just move the MBFC source to the correct domain
            // But check if we collide with another renamed one? upsert handle unique constraint?
            // Update might fail if targetDomain exists (handled above)
            try {
                await prisma.source.update({
                    where: { id: source.id },
                    data: { domain: targetDomain }
                });
                renamed++;
            } catch (e) {
                // If collision (e.g. we already renamed another "cnn-news" to "cnn.com"), merge logic should have caught it?
                // No, if we created duplicates in DB, unique constraint fails.
                // We should delete this one if it's a dupe
                console.warn(`⚠️ Collision renaming ${rawDomain} to ${targetDomain}. Deleting duplicate.`);
                await prisma.source.delete({ where: { id: source.id } });
                merged++; // Effectively merged/deduplicated
            }
        }
    }

    console.log("\n🏁 MERGE COMPLETE");
    console.log(`   Merged (Consensus): ${merged}`);
    console.log(`   Renamed (Cleanup):  ${renamed}`);
    console.log(`   Unchanged:          ${skipped}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
