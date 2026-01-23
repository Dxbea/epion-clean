/**
 * fix-vector-index.ts
 * 
 * Script de réparation One-Shot pour corriger l'index B-Tree fautif
 * sur la colonne `embedding` de `KnowledgeChunk`.
 * 
 * Usage: npx tsx prisma/fix-vector-index.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔧 Démarrage de la réparation des index vectoriels...\n');

    try {
        // 1. Drop l'index B-Tree fautif (créé par Prisma par défaut)
        console.log('➡️  Suppression de l\'index B-Tree fautif...');
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "KnowledgeChunk_embedding_idx";`);
        console.log('   ✅ Index "KnowledgeChunk_embedding_idx" supprimé (ou n\'existait pas).\n');

        // 2. Drop l'index HNSW au cas où il serait malformé
        console.log('➡️  Suppression de l\'ancien index HNSW (nettoyage)...');
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "embedding_index";`);
        console.log('   ✅ Index "embedding_index" supprimé (ou n\'existait pas).\n');

        // 3. Recrée l'index HNSW proprement
        console.log('➡️  Création du nouvel index HNSW...');
        await prisma.$executeRawUnsafe(`
      CREATE INDEX "embedding_index" 
      ON "KnowledgeChunk" 
      USING hnsw ("embedding" vector_cosine_ops);
    `);
        console.log('   ✅ Index HNSW "embedding_index" créé avec succès.\n');

        console.log('═══════════════════════════════════════════════════════════════');
        console.log('✅ RÉPARATION TERMINÉE AVEC SUCCÈS !');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('\n📋 Résumé des actions effectuées:');
        console.log('   • Index B-Tree fautif "KnowledgeChunk_embedding_idx" → supprimé');
        console.log('   • Index HNSW "embedding_index" → recréé proprement');
        console.log('\n💡 L\'insertion de vecteurs devrait maintenant fonctionner.');

    } catch (error) {
        console.error('\n❌ ERREUR lors de la réparation:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
