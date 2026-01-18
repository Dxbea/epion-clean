import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const KEEP_SLUGS = [
    'monde', 'politique', 'economie', 'societe',
    'tech', 'sciences', 'sante', 'environnement',
    'culture', 'sport', 'lifestyle', 'insolite'
];

async function main() {
    console.log('🧹 STARTING FINAL CLEANUP');

    // 1. Get ALL categories
    const allCats = await prisma.category.findMany();
    console.log(`Found ${allCats.length} total categories.`);

    // 2. Identify intruders
    const toDelete = allCats.filter(c => !KEEP_SLUGS.includes(c.slug));
    const fallback = allCats.find(c => c.slug === 'monde');

    if (!fallback) {
        console.error('❌ CRITICAL: Fallback category "monde" not found. Aborting.');
        return;
    }

    console.log(`Found ${toDelete.length} intruders to delete.`);

    // 3. Process deletions one by one
    for (const cat of toDelete) {
        console.log(`Processing: ${cat.name} (${cat.slug})...`);

        // Move articles first (Safety net)
        const moved = await prisma.article.updateMany({
            where: { categoryId: cat.id },
            data: { categoryId: fallback.id }
        });
        if (moved.count > 0) console.log(`  -> Moved ${moved.count} articles to Monde.`);

        // Delete
        await prisma.category.delete({ where: { id: cat.id } });
        console.log(`  -> 🗑️ DELETED.`);
    }

    console.log('✨ CLEANUP COMPLETE.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
