import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});

async function ultimateTest() {
    console.log('DATABASE_URL:', process.env.DATABASE_URL || 'NOT SET');
    console.log('\n=== ULTIMATE TEST ===\n');

    // Count via Prisma
    const prismaCount = await prisma.source.count();
    console.log(`Prisma count: ${prismaCount}`);

    // Count via raw SQL
    const rawResult = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Source"`;
    console.log(`Raw SQL count:`, rawResult);

    // List all domains
    const allDomains = await prisma.source.findMany({
        select: { id: true, domain: true, allSidesRating: true },
        orderBy: { domain: 'asc' }
    });

    console.log(`\nAll ${allDomains.length} sources:`);
    allDomains.forEach((s, i) => {
        console.log(`${(i + 1).toString().padStart(3)}. ${s.domain.padEnd(30)} AllSides: ${s.allSidesRating || 'null'}`);
    });

    await prisma.$disconnect();
}

ultimateTest();
