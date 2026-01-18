import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    const categories = await prisma.category.findMany({
        include: { _count: { select: { articles: true } } }
    });

    const dumpPath = './dump.json';
    fs.writeFileSync(dumpPath, JSON.stringify(categories, null, 2));
    console.log(`Dump written to ${dumpPath}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
