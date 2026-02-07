import { PrismaClient, PoliticalBias, Reliability } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

// --- ANCHOR SCORES (Middle of Range) ---
// HIGH [80-100] -> 90
// MIXED [45-79] -> 62
// LOW [20-44] -> 32
// PROPAGANDA [0-19] -> 10
// UNKNOWN -> 50

const ANCHOR_SCORES = {
    [Reliability.HIGH]: 90,
    [Reliability.MIXED]: 62,
    [Reliability.LOW]: 32,
    [Reliability.PROPAGANDA]: 10,
    [Reliability.UNKNOWN]: 50
};

async function backfillTrustScores() {
    console.log("🚀 Starting Trust Score V2 Backfill...");

    const sources = await prisma.source.findMany();
    console.log(`📊 Found ${sources.length} sources to process.`);

    let updatedCount = 0;
    let biasFixedCount = 0;

    for (const source of sources) {
        let needsUpdate = false;
        let updates: any = {};

        // 1. Calculate Anchor Score
        // We only update if the current score is the default 50 AND reliability is known
        // OR if the reliability is known but score doesn't match the V2 anchor logic at all
        // Actually, let's force update the anchor for anyone who hasn't been audited recently (liveScore)
        // Since we don't store "isLiveAudited", we assume if lastAuditDate is null, it needs anchor.

        const anchor = ANCHOR_SCORES[source.reliability] || 50;

        // If score is 50 (default) or 0 (bug), apply anchor
        if (source.trustScore === 50 || source.trustScore === 0) {
            updates.trustScore = anchor;
            // Also set default pillar scores to reflect the anchor level (roughly)
            // This prevents "0" in UI bars
            const pillarBase = anchor;
            updates.transparencyScore = Math.min(100, pillarBase);
            updates.editorialScore = Math.min(100, pillarBase);
            updates.semanticScore = Math.min(100, pillarBase);
            updates.uxScore = Math.min(100, pillarBase); // Assume good UX if reliability is high

            // Set justification
            updates.justification = `Score de Réputation (Base de données). Fiabilité: ${source.reliability}`;

            needsUpdate = true;
        }

        // 2. Fix Political Bias
        if (source.politicalBias === PoliticalBias.UNKNOWN) {
            let newBias: PoliticalBias = PoliticalBias.UNKNOWN;

            // Try AllSides
            const asRating = source.allSidesRating?.toLowerCase() || "";
            if (asRating.includes("left")) {
                newBias = asRating.includes("center") ? PoliticalBias.CENTER_LEFT : PoliticalBias.LEFT;
            } else if (asRating.includes("right")) {
                newBias = asRating.includes("center") ? PoliticalBias.CENTER_RIGHT : PoliticalBias.RIGHT;
            } else if (asRating.includes("center")) {
                newBias = PoliticalBias.CENTER;
            }

            // Try MBFC Code
            // Format often "left", "right-center" etc in mbfcRating field if raw import worked well
            // Or use mbfcData metadata if needed, but let's stick to simple string check
            const mbfc = source.mbfcRating?.toLowerCase() || "";
            if (newBias === PoliticalBias.UNKNOWN && mbfc) {
                if (mbfc === "left" || mbfc === "l") newBias = PoliticalBias.LEFT;
                else if (mbfc === "left-center" || mbfc === "lc") newBias = PoliticalBias.CENTER_LEFT;
                else if (mbfc === "center" || mbfc === "c") newBias = PoliticalBias.CENTER;
                else if (mbfc === "right-center" || mbfc === "rc") newBias = PoliticalBias.CENTER_RIGHT;
                else if (mbfc === "right" || mbfc === "r") newBias = PoliticalBias.RIGHT;
            }

            if (newBias !== PoliticalBias.UNKNOWN) {
                updates.politicalBias = newBias;
                biasFixedCount++;
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            await prisma.source.update({
                where: { id: source.id },
                data: updates
            });
            updatedCount++;
            if (updatedCount % 100 === 0) process.stdout.write(".");
        }
    }

    console.log(`\n\n✅ Backfill Complete!`);
    console.log(`Updated Trust Scores: ${updatedCount}`);
    console.log(`Fixed Political Biases: ${biasFixedCount}`);

    await prisma.$disconnect();
}

backfillTrustScores()
    .catch(e => {
        console.error(e);
        prisma.$disconnect();
        process.exit(1);
    });
