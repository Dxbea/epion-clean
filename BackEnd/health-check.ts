import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function healthCheck() {
    console.log('🏥 CONSENSUS PROTOCOL HEALTH CHECK\n');
    console.log('═'.repeat(60));

    try {
        // 1. Total Sources
        const total = await prisma.source.count();
        console.log(`\n📊 TOTAL SOURCES: ${total}`);

        // 2. Consensus Status
        const consensusVerified = await prisma.source.count({
            where: { isConsensusVerified: true }
        });
        console.log(`✅ Consensus Verified: ${consensusVerified}`);
        console.log(`❌ Not Verified: ${total - consensusVerified}`);

        // 3. Data Source Breakdown
        const withAllSides = await prisma.source.count({
            where: { allSidesRating: { not: null } }
        });
        const withMBFC = await prisma.source.count({
            where: { mbfcRating: { not: null } }
        });

        console.log(`\n📡 DATA SOURCES:`);
        console.log(`   AllSides: ${withAllSides} sources`);
        console.log(`   MBFC: ${withMBFC} sources`);

        // 4. Bias Distribution
        console.log(`\n🎯 POLITICAL BIAS DISTRIBUTION:`);
        const biasGroups = await prisma.source.groupBy({
            by: ['politicalBias'],
            _count: true
        });
        biasGroups.forEach(g => {
            const percentage = ((g._count / total) * 100).toFixed(1);
            console.log(`   ${g.politicalBias.padEnd(15)} : ${g._count.toString().padStart(3)} (${percentage}%)`);
        });

        // 5. Reliability Distribution
        console.log(`\n🛡️  RELIABILITY DISTRIBUTION:`);
        const reliabilityGroups = await prisma.source.groupBy({
            by: ['reliability'],
            _count: true
        });
        reliabilityGroups.forEach(g => {
            const percentage = ((g._count / total) * 100).toFixed(1);
            console.log(`   ${g.reliability.padEnd(12)} : ${g._count.toString().padStart(3)} (${percentage}%)`);
        });

        // 6. Sample AllSides Sources
        if (withAllSides > 0) {
            console.log(`\n📋 SAMPLE ALLSIDES SOURCES (First 5):`);
            const samples = await prisma.source.findMany({
                where: { allSidesRating: { not: null } },
                select: {
                    domain: true,
                    allSidesRating: true,
                    politicalBias: true,
                    biasScore: true,
                    reliability: true,
                    isConsensusVerified: true
                },
                take: 5,
                orderBy: { domain: 'asc' }
            });

            samples.forEach(s => {
                console.log(`   ${s.domain}`);
                console.log(`      Rating: "${s.allSidesRating}" → ${s.politicalBias} (${s.biasScore})`);
                console.log(`      Reliability: ${s.reliability} | Verified: ${s.isConsensusVerified}`);
            });
        }

        // 7. Check for duplicates
        const duplicates = await prisma.$queryRaw`
            SELECT domain, COUNT(*) as count
            FROM "Source"
            GROUP BY domain
            HAVING COUNT(*) > 1
        `;

        console.log(`\n🔍 DUPLICATE CHECK:`);
        if (Array.isArray(duplicates) && duplicates.length > 0) {
            console.log(`   ⚠️  Found ${duplicates.length} duplicate domains!`);
            duplicates.forEach((d: any) => {
                console.log(`      ${d.domain}: ${d.count} entries`);
            });
        } else {
            console.log(`   ✅ No duplicates found`);
        }

        // 8. Recent Updates
        const recentUpdates = await prisma.source.count({
            where: {
                updatedAt: {
                    gte: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
                }
            }
        });

        console.log(`\n⏰ RECENT ACTIVITY (Last 5 minutes):`);
        console.log(`   Updated: ${recentUpdates} sources`);

        console.log('\n' + '═'.repeat(60));
        console.log('✨ HEALTH CHECK COMPLETE\n');

        // 9. Recommendations
        console.log('💡 RECOMMENDATIONS:');
        if (consensusVerified === 0) {
            console.log('   ⚠️  No consensus-verified sources! Run ingestion:');
            console.log('      npx tsx src/services/consensus-ingestion.ts');
        } else if (consensusVerified < 100) {
            console.log('   ℹ️  Low number of verified sources. Consider re-running ingestion.');
        } else {
            console.log('   ✅ Good coverage of consensus data!');
        }

    } catch (error: any) {
        console.error('\n❌ ERROR during health check:', error.message);
        console.error(error.stack);
    } finally {
        await prisma.$disconnect();
    }
}

healthCheck();
