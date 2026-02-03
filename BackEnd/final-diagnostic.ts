import { PrismaClient, PoliticalBias, Reliability } from '@prisma/client';

const prisma = new PrismaClient();

async function finalDiagnostic() {
    console.log('🔬 DIAGNOSTIC FINAL\n');

    // 1. Vérifier combien de sources on a
    const before = await prisma.source.count();
    console.log(`📊 Sources AVANT: ${before}\n`);

    // 2. Créer 3 sources GARANTIES UNIQUES
    const uniqueSources = [
        { domain: `unique-test-${Date.now()}-a.com`, name: 'Test A', bias: PoliticalBias.LEFT, score: -45 },
        { domain: `unique-test-${Date.now()}-b.com`, name: 'Test B', bias: PoliticalBias.CENTER, score: 0 },
        { domain: `unique-test-${Date.now()}-c.com`, name: 'Test C', bias: PoliticalBias.RIGHT, score: 45 }
    ];

    console.log('💾 Création de 3 sources UNIQUES...\n');

    for (const src of uniqueSources) {
        try {
            await prisma.source.create({
                data: {
                    domain: src.domain,
                    name: src.name,
                    politicalBias: src.bias,
                    biasScore: src.score,
                    reliability: Reliability.HIGH,
                    allSidesRating: 'Test',
                    isConsensusVerified: true,
                    trustScore: 50
                }
            });

            const current = await prisma.source.count();
            console.log(`  ✅ ${src.domain} → Count: ${current}`);

        } catch (error: any) {
            console.error(`  ❌ ${src.domain}: ${error.message}`);
        }
    }

    // 3. Vérifier APRÈS
    const after = await prisma.source.count();
    console.log(`\n📊 Sources APRÈS: ${after}`);
    console.log(`   Différence: +${after - before}\n`);

    if (after === before + 3) {
        console.log('✅ PARFAIT: Les 3 sources ont été ajoutées et PERSISTENT!\n');
        console.log('➡️  Le problème est que les domaines AllSides existent déjà dans la DB.');
        console.log('    Les upserts font des UPDATE au lieu de CREATE.');
    } else {
        console.log('❌ PROBLÈME: Les sources ne persistent pas!\n');
        console.log('   Il y a un vrai bug de persistence en base de données.');
    }

    await prisma.$disconnect();
}

finalDiagnostic();
