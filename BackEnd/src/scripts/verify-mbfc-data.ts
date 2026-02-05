import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("🔍 Deep Dive into CNN & MBFC Data...");

    // 1. Find anything looking like CNN
    const cnnLike = await prisma.source.findMany({
        where: {
            OR: [
                { name: { contains: 'CNN', mode: 'insensitive' } },
                { domain: { contains: 'cnn', mode: 'insensitive' } },
            ]
        }
    });
    console.log(`FOUND ${cnnLike.length} CNN-like sources:`);
    console.log(JSON.stringify(cnnLike, null, 2));

    // 2. Find a sample of MBFC imported sources to see their domains
    const mbfcSample = await prisma.source.findMany({
        where: { metadata: { path: ['importedFrom'], equals: 'MBFC' } },
        take: 10
    });
    console.log(`\nMBFC Sample Domains:`);
    mbfcSample.forEach(s => console.log(`- "${s.domain}" (Name: "${s.name}")`));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
