import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const targetId = 'cmkis0qnf0004u3m8gpuqmg01'; // Business
    console.log(`Trying to delete category ID: ${targetId}`);

    try {
        const deleted = await prisma.category.delete({
            where: { id: targetId }
        });
        console.log('✅ Success! Deleted:', deleted.name);
    } catch (err) {
        console.error('❌ Failed to delete:', err);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
