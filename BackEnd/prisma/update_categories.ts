import { PrismaClient, ArticleStatus } from '@prisma/client';

const prisma = new PrismaClient();

const UNIVERSAL_CATEGORIES = [
    'Monde', 'Politique', 'Économie', 'Société',
    'Tech', 'Sciences', 'Santé', 'Environnement',
    'Culture', 'Sport', 'Lifestyle', 'Insolite'
];

async function main() {
    console.log('🔄 Starting Hard Update of Categories...');

    // 1. Ensure all Universal Categories exist
    console.log('✅ Upserting 12 Universal Categories...');
    for (const name of UNIVERSAL_CATEGORIES) {
        const slug = name.toLowerCase().replace(/é/g, 'e').replace(/è/g, 'e'); // basic slugify
        await prisma.category.upsert({
            where: { slug: slug },
            update: { name: name }, // Ensure name is correct case
            create: { name: name, slug: slug },
        });
    }

    // 2. Identification
    const officialSlugs = UNIVERSAL_CATEGORIES.map(n => n.toLowerCase().replace(/é/g, 'e').replace(/è/g, 'e'));
    const fallbackSlug = 'monde';
    const fallbackCategory = await prisma.category.findUnique({ where: { slug: fallbackSlug } });

    if (!fallbackCategory) {
        throw new Error('Fallback category "Monde" not found!');
    }

    // 3. Move articles from non-official categories
    console.log('📦 Moving articles from obsolete categories...');
    const moved = await prisma.article.updateMany({
        where: {
            category: {
                slug: { notIn: officialSlugs }
            }
        },
        data: {
            categoryId: fallbackCategory.id
        }
    });
    console.log(`   -> Reassigned ${moved.count} articles to "Monde".`);

    // 4. Delete obsolete categories
    console.log('🗑️ Deleting obsolete categories...');
    const deleted = await prisma.category.deleteMany({
        where: {
            slug: { notIn: officialSlugs }
        }
    });
    console.log(`   -> Deleted ${deleted.count} obsolete categories.`);

    console.log('✨ Hard Update Complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
