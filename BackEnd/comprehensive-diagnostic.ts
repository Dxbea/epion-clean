import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function comprehensiveDiagnostic() {
    console.log('🔬 COMPREHENSIVE DIAGNOSTIC\n');
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    console.log('');

    // 1. List ALL domains in DB
    console.log('📋 ALL DOMAINS CURRENTLY IN DB:\n');
    const allSources = await prisma.source.findMany({
        select: { domain: true, allSidesRating: true },
        orderBy: { domain: 'asc' }
    });

    allSources.forEach((s, i) => {
        console.log(`${(i + 1).toString().padStart(3)}. ${s.domain.padEnd(40)} AllSides: ${s.allSidesRating || 'NULL'}`);
    });

    console.log(`\nTOTAL: ${allSources.length} sources\n`);

    // 2. Test: Does 'nytimes.com' (a common AllSides source) exist?
    const nyt = await prisma.source.findUnique({
        where: { domain: 'nytimes.com' }
    });

    console.log('Test domain: nytimes.com');
    if (nyt) {
        console.log(`  ✅ EXISTS - AllSides: ${nyt.allSidesRating || 'NULL'}`);
    } else {
        console.log(`  ❌ DOES NOT EXIST`);
    }

    // 3. Test: Does 'foxnews.com' exist?
    const fox = await prisma.source.findUnique({
        where: { domain: 'foxnews.com' }
    });

    console.log('\nTest domain: foxnews.com');
    if (fox) {
        console.log(`  ✅ EXISTS - AllSides: ${fox.allSidesRating || 'NULL'}`);
    } else {
        console.log(`  ❌ DOES NOT EXIST`);
    }

    await prisma.$disconnect();
}

comprehensiveDiagnostic();
