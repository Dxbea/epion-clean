import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function finalVerification() {
    console.log('═══════════════════════════════════════════\n');
    console.log('📊 CONSENSUS INGESTION - FINAL VERIFICATION\n');
    console.log('═══════════════════════════════════════════\n');

    try {
        // 1. Total Sources
        const totalSources = await prisma.source.count();
        console.log(`✅ Total sources in database: ${totalSources}`);

        // 2. Consensus-verified sources
        const consensusVerified = await prisma.source.count({
            where: { isConsensusVerified: true }
        });
        console.log(`✅ Consensus-verified sources: ${consensusVerified}`);

        // 3. Sources with MBFC data
        const mbfcCount = await prisma.source.count({
            where: { mbfcRating: { not: null } }
        });
        console.log(`✅ Sources with MBFC rating: ${mbfcCount}`);

        // 4. Sources with AllSides data
        const allsidesCount = await prisma.source.count({
            where: { allSidesRating: { not: null } }
        });
        console.log(`✅ Sources with AllSides rating: ${allsidesCount}`);

        // 5. Sources with BOTH
        const bothCount = await prisma.source.count({
            where: {
                mbfcRating: { not: null },
                allSidesRating: { not: null }
            }
        });
        console.log(`✅ Sources with BOTH ratings: ${bothCount}`);

        // 6. Bias distribution
        console.log('\n🎯 Political Bias Distribution:');
        const biasGroups = await prisma.source.groupBy({
            by: ['politicalBias'],
            _count: true,
            where: { isConsensusVerified: true }
        });
        biasGroups.forEach(g => {
            console.log(`   ${g.politicalBias}: ${g._count} sources`);
        });

        // 7. Reliability distribution
        console.log('\n🛡️  Reliability Distribution:');
        const reliabilityGroups = await prisma.source.groupBy({
            by: ['reliability'],
            _count: true,
            where: { isConsensusVerified: true }
        });
        reliabilityGroups.forEach(g => {
            console.log(`   ${g.reliability}: ${g._count} sources`);
        });

        // 8. Sample consensus sources
        console.log('\n📋 Sample Consensus Sources (First 10):');
        const samples = await prisma.source.findMany({
            where: { isConsensusVerified: true },
            select: {
                domain: true,
                mbfcRating: true,
                allSidesRating: true,
                biasScore: true,
                politicalBias: true,
                reliability: true
            },
            take: 10,
            orderBy: { domain: 'asc' }
        });

        samples.forEach(s => {
            const mbfc = s.mbfcRating || 'N/A';
            const allsides = s.allSidesRating || 'N/A';
            console.log(`   ${s.domain}`);
            console.log(`      MBFC: "${mbfc}" | AllSides: "${allsides}"`);
            console.log(`      Consensus: ${s.politicalBias} (score: ${s.biasScore}) | Reliability: ${s.reliability}`);
        });

        console.log('\n═══════════════════════════════════════════');
        console.log('✨ VERIFICATION COMPLETE');
        console.log('═══════════════════════════════════════════\n');

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

finalVerification();
