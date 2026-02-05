import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const LOCAL_MBFC_PATH = path.join(process.cwd(), 'src/lib/data/mbfc-data.json');

async function main() {
    console.log("🕵️ Debugging Consensus Failure...");

    // 1. Load Local JSON
    if (!fs.existsSync(LOCAL_MBFC_PATH)) {
        console.error("❌ File not found!");
        return;
    }
    const rawData = JSON.parse(fs.readFileSync(LOCAL_MBFC_PATH, 'utf-8'));
    console.log(`📦 Loaded JSON. Version: ${rawData.version}`);

    // 2. Check CNN in JSON
    // const cnnKeys = Object.keys(rawData.sources).filter(k => k.includes('cnn'));
    // console.log(`🔑 CNN Keys in JSON: ${cnnKeys.join(', ')}`);

    const cnnData = rawData.sources['cnn.com'] || rawData.sources['cnn'];
    if (cnnData) {
        console.log("✅ Found CNN in JSON:", JSON.stringify(cnnData, null, 2));
    } else {
        console.log("❌ CNN NOT FOUND in JSON (checked 'cnn.com' and 'cnn')");
    }

    // 3. Check Database
    const dbSource = await prisma.source.findUnique({
        where: { domain: 'cnn.com' }
    });

    if (dbSource) {
        console.log("✅ Found CNN in Database:", JSON.stringify(dbSource, null, 2));

        // Simulate Logic
        if (cnnData) {
            const domain = cnnData.d.toLowerCase().trim();
            console.log(`   JSON Domain: '${domain}'`);
            console.log(`   DB Domain:   '${dbSource.domain}'`);
            console.log(`   Match?       ${domain === dbSource.domain ? "YES" : "NO"}`);

            if (dbSource.allSidesRating && dbSource.biasScore !== 0) {
                console.log("   Consensus Condition: MET (Has AllSides + BiasScore)");
            } else {
                console.log("   Consensus Condition: FAILED");
                console.log(`     - allSidesRating: ${dbSource.allSidesRating}`);
                console.log(`     - biasScore: ${dbSource.biasScore}`);
            }
        }

    } else {
        console.log("❌ CNN NOT FOUND in Database (domain: 'cnn.com')");
        // Search by name?
        const alike = await prisma.source.findFirst({
            where: { name: { contains: 'CNN' } }
        });
        if (alike) console.log(`   But found similar by name: ${alike.domain} (${alike.name})`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
