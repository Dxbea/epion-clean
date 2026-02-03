import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDomains() {
    console.log("🔍 Checking Domain Formats...");

    // 1. Get 10 AllSides domains
    const allSides = await prisma.source.findMany({
        where: { metadata: { path: ['importedFrom'], equals: 'AllSides' } },
        take: 5,
        select: { domain: true, name: true }
    });

    // 2. Get 10 MBFC domains (look for ones that presumably overlap)
    const mbfc = await prisma.source.findMany({
        where: { metadata: { path: ['importedFrom'], equals: 'MBFC' } },
        take: 5,
        select: { domain: true, name: true }
    });

    // 3. Search for specific major media
    const cnn = await prisma.source.findMany({
        where: {
            OR: [
                { name: { contains: 'CNN', mode: 'insensitive' } },
                { domain: { contains: 'cnn', mode: 'insensitive' } }
            ]
        },
        select: { id: true, domain: true, name: true, mbfcRating: true, allSidesRating: true }
    });

    console.log("--- AllSides Samples ---");
    console.log(JSON.stringify(allSides, null, 2));

    console.log("\n--- MBFC Samples ---");
    console.log(JSON.stringify(mbfc, null, 2));

    console.log("\n--- CNN Search ---");
    console.log(JSON.stringify(cnn, null, 2));
}

checkDomains()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
