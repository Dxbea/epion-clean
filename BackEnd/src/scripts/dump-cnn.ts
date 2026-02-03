import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    const cnn = await prisma.source.findUnique({ where: { domain: 'cnn.com' } });
    const nyt = await prisma.source.findUnique({ where: { domain: 'nytimes.com' } });
    const fox = await prisma.source.findUnique({ where: { domain: 'foxnews.com' } });

    const result = { cnn, nyt, fox };
    fs.writeFileSync('dump.json', JSON.stringify(result, null, 2));
    console.log("Written to dump.json");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
