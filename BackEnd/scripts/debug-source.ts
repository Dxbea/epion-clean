import { prisma } from '../src/lib/db';

async function main() {
    const domain = process.argv[2] || 'lemonde.fr';
    console.log(`Checking source: ${domain}`);
    const source = await prisma.source.findUnique({
        where: { domain }
    });
    if (!source) {
        console.log("Source not found");
        return;
    }
    console.log(`Domain: ${source.domain}`);
    console.log(`Trust Score: ${source.trustScore}`);
    console.log(`Reliability: ${source.reliability}`);
    console.log(`Last Audit: ${source.lastAuditDate}`);
    console.log(`Country: ${source.detectedCountry}`);
    console.log(`Explanation: ${JSON.stringify((source.metadata as any)?.['explanation'])}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
