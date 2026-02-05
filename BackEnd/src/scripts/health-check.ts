import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("🔍 Running System Health Check...");
    console.log(`🔌 Database: ${process.env.DATABASE_URL}`);
    console.log("----------------------------------------");

    try {
        // 1. Check Source Count
        const totalSources = await prisma.source.count();
        console.log(`📊 Total Sources: ${totalSources}`);

        // 2. Check AllSides Ingestion Status
        const sourcesWithBias = await prisma.source.count({
            where: { biasScore: { not: 0 } }
        });

        const allSidesImported = await prisma.source.count({
            where: {
                metadata: {
                    path: ['importedFrom'],
                    equals: 'AllSides'
                }
            }
        });

        console.log(`✅ Sources with Bias Score: ${sourcesWithBias}`);
        console.log(`✅ Sources from AllSides:   ${allSidesImported}`);

        // 3. Conclusion
        console.log("----------------------------------------");
        if (totalSources > 100 && sourcesWithBias > 100) {
            console.log("🟢 SYSTEM HEALTHY: Data ingestion appears successful.");
        } else {
            console.log("🔴 SYSTEM WARNING: Data counts are lower than expected.");
        }

    } catch (error: any) {
        console.error("🔴 HEALTH CHECK FAILED:", error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
