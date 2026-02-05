
import { PrismaClient, PoliticalBias, Reliability } from '@prisma/client';
import { KNOWN_MEDIA } from '../src/lib/data/known-media';
import { getScoreFromBias } from '../src/utils/bias-converter';

const prisma = new PrismaClient();

async function main() {
    console.log('⚖️  Starting Consensus Seeding...');

    for (const [domain, data] of Object.entries(KNOWN_MEDIA)) {
        // Enforce Consistency: Score is DERIVED from Bias Enum
        const consistentScore = getScoreFromBias(data.bias as PoliticalBias);

        // Name formatting
        const generatedName = domain.charAt(0).toUpperCase() + domain.slice(1);

        await prisma.source.upsert({
            where: { domain },
            update: {
                politicalBias: data.bias as PoliticalBias,
                biasScore: consistentScore, // <--- Utilise la fonction de conversion
                detectedCountry: data.country,
            },
            create: {
                domain,
                name: generatedName,
                politicalBias: data.bias as PoliticalBias,
                biasScore: consistentScore, // <--- Utilise la fonction de conversion
                detectedCountry: data.country,
                reliability: Reliability.UNKNOWN,
                trustScore: 50,
            },
        });
        console.log(`✅ Synced: ${domain} -> ${data.bias} (Score: ${consistentScore})`);
    }

    console.log('🏁 Consensus Seeding completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
