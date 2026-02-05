import { prisma } from '../db';
import { KNOWN_MEDIA } from './known-media';
import { PoliticalBias, Reliability } from '@prisma/client';

async function main() {
    console.log('🌱 Starting bias seeding...');

    for (const [domain, data] of Object.entries(KNOWN_MEDIA)) {
        // Generate a simple name from domain (e.g. "lemonde.fr" -> "Lemonde.fr")
        const generatedName = domain.charAt(0).toUpperCase() + domain.slice(1);

        await prisma.source.upsert({
            where: { domain },
            update: {
                politicalBias: data.bias as PoliticalBias,
                biasScore: data.score,
                detectedCountry: data.country,
                // Optional: Update reliability if you want to enforce a default or if we had data on it
                // reliability: Reliability.UNKNOWN 
            },
            create: {
                domain,
                name: generatedName,
                politicalBias: data.bias as PoliticalBias,
                biasScore: data.score,
                detectedCountry: data.country,
                reliability: Reliability.UNKNOWN, // Default
                trustScore: 50, // Default
            },
        });
        console.log(`Updated/Created: ${domain} -> ${data.bias} (${data.score})`);
    }

    console.log('✅ Seeding completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
