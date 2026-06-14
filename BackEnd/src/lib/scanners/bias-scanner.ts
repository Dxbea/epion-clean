import { PoliticalBias, Reliability, PrismaClient } from "@prisma/client";
import { KNOWN_MEDIA } from "../data/known-media.js";

// Use a local prisma instance or import from db.ts if available (avoiding circular deps if db.ts imports this)
// Ideally pass prisma client or use singleton. 
// Let's assume we can instantiate for now or import from ../db if no cycle.
// Checking file list... db.ts exists.
import { prisma } from "../db.js";

export async function analyzeBias(domain: string): Promise<{
    bias: PoliticalBias,
    score: number,
    reliability: Reliability,
    detectedCountry: string
}> {
    // 1. Check Database (The Anchor)
    try {
        const dbSource = await prisma.source.findUnique({
            where: { domain },
            select: {
                politicalBias: true,
                biasScore: true,
                reliability: true,
                detectedCountry: true
            }
        });

        if (dbSource && dbSource.politicalBias !== 'UNKNOWN') {
            return {
                bias: dbSource.politicalBias,
                score: dbSource.biasScore,
                reliability: dbSource.reliability,
                detectedCountry: dbSource.detectedCountry || "FR"
            };
        }
    } catch (e) {
        console.error("BiasScanner DB Error:", e);
    }

    // 2. Fallback to Static File (Legacy/Backup)
    const knownMedia = KNOWN_MEDIA[domain];

    if (knownMedia) {
        const bias = knownMedia.bias as PoliticalBias;
        let reliability: Reliability = Reliability.HIGH;

        // Heuristics for reliability based on bias
        if (["SATIRE", "EXTREME_RIGHT", "EXTREME_LEFT"].includes(bias)) {
            reliability = Reliability.MIXED;
            if (bias === "SATIRE") {
                reliability = Reliability.LOW;
            }
        }

        return {
            bias,
            score: knownMedia.score,
            reliability,
            detectedCountry: knownMedia.country
        };
    }

    // 3. Default / Unknown
    return {
        bias: PoliticalBias.UNKNOWN,
        score: 0,
        reliability: Reliability.UNKNOWN,
        detectedCountry: "FR"
    };
}
