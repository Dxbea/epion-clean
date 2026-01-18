import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 ANALYSE DES CATÉGORIES EN BASE DE DONNÉES');
    console.log('-------------------------------------------');

    const categories = await prisma.category.findMany({
        include: {
            _count: {
                select: { articles: true }
            }
        },
        orderBy: { name: 'asc' }
    });

    console.log(`Total catégories trouvées : ${categories.length}\n`);

    console.log('| Nom (Name) | Slug | ID | Nb Articles |');
    console.log('|---|---|---|---|');

    categories.forEach(c => {
        console.log(`| ${c.name} | ${c.slug} | ${c.id} | ${c._count.articles} |`);
    });

    console.log('\n-------------------------------------------');
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
