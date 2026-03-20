import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyIngestion() {
    console.log('🔍 Verifying Consensus Ingestion Results\n');

    // Count total sources
    const totalSources = await prisma.source.count();
    console.log(`Total sources in database: ${totalSources}`);

    // Count consensus-verified sources
    const consensusVerified = await prisma.source.count({
        where: { isConsensusVerified: true }
    });
    console.log(`Consensus-verified sources: ${consensusVerified}`);

    // Sample some sources with MBFC data
    const mbfcSources = await prisma.source.findMany({
        where: { mbfcRating: { not: null } },
        select: {
            domain: true,
            mbfcRating: true,
            allSidesRating: true,
            biasScore: true,
            politicalBias: true,
            reliability: true,
            isConsensusVerified: true
        },
        take: 5
    });

    console.log('\nSample MBFC sources:');
    mbfcSources.forEach((s: any) => {
        console.log(`  ${s.domain}: MBFC="${s.mbfcRating}" AllSides="${s.allSidesRating}" Score=${s.biasScore} Bias=${s.politicalBias}`);
    });

    // Sample some sources with AllSides data
    const allsidesSources = await prisma.source.findMany({
        where: { allSidesRating: { not: null } },
        select: {
            domain: true,
            mbfcRating: true,
            allSidesRating: true,
            biasScore: true,
            politicalBias: true
        },
        take: 5
    });

    console.log('\nSample AllSides sources:');
    allsidesSources.forEach((s: any) => {
        console.log(`  ${s.domain}: MBFC="${s.mbfcRating}" AllSides="${s.allSidesRating}" Score=${s.biasScore} Bias=${s.politicalBias}`);
    });

    await prisma.$disconnect();
}

verifyIngestion().catch(console.error);
