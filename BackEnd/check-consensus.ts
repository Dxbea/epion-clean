
import { getCleanDomain } from './src/utils/domain';
import { getBiasFromScore, getScoreFromBias } from './src/utils/bias-converter';
import { PoliticalBias } from '@prisma/client';
import { parse } from 'csv-parse'; // Check dependency presence

async function check() {
    console.log("🏥 STARTING HEALTH CHECK...\n");

    let errors = 0;

    // 1. CHECK DOMAIN UTILS
    console.log("1. Checking Domain Utils...");
    const domainTests = [
        { input: "https://www.Lemonde.fr/politics", expected: "lemonde.fr" },
        { input: "http://google.com", expected: "google.com" },
        { input: "mediapart.fr", expected: "mediapart.fr" },
        { input: "https://www.theguardian.com/uk/commentisfree", expected: "theguardian.com" }
    ];

    domainTests.forEach(t => {
        const res = getCleanDomain(t.input);
        if (res !== t.expected) {
            console.error(`❌ Domain Mismatch: Input '${t.input}' -> Got '${res}', Expected '${t.expected}'`);
            errors++;
        }
    });

    if (errors === 0) console.log("✅ Domain Utils OK");

    // 2. CHECK BIAS CONVERTER
    console.log("\n2. Checking Bias Converter...");

    // Test Score -> Bias
    const scoreTests = [
        { input: -85, expected: PoliticalBias.EXTREME_LEFT },
        { input: 0, expected: PoliticalBias.CENTER },
        { input: 45, expected: PoliticalBias.RIGHT }
    ];

    scoreTests.forEach(t => {
        const res = getBiasFromScore(t.input);
        if (res !== t.expected) {
            console.error(`❌ Score->Bias Failed: Input ${t.input} -> Got ${res}, Expected ${t.expected}`);
            errors++;
        }
    });

    // Test Bias -> Score -> Bias (Roundtrip Identity check)
    // Note: This won't always be perfect because ranges map to single points, but the ENUM should stay consistent.
    // Example: LEFT (-45) -> getBiasFromScore(-45) should be LEFT.
    const enumTests = [
        PoliticalBias.LEFT,
        PoliticalBias.CENTER_RIGHT,
        PoliticalBias.EXTREME_RIGHT
    ];

    enumTests.forEach(bias => {
        const score = getScoreFromBias(bias);
        const mappedBias = getBiasFromScore(score);
        if (mappedBias !== bias) {
            console.error(`❌ Roundtrip Failed: ${bias} -> Score ${score} -> ${mappedBias}`);
            errors++;
        }
    });

    if (errors === 0) console.log("✅ Bias Converter OK");

    // 3. CHECK DEPENDENCIES
    console.log("\n3. Checking Dependencies...");
    try {
        if (typeof parse === 'function') {
            console.log("✅ 'csv-parse' installed and loading.");
        } else {
            console.error("❌ 'csv-parse' seems broken.");
            errors++;
        }
    } catch (e) {
        console.error("❌ Failed to load dependencies:", e);
        errors++;
    }

    console.log(`\n🏁 Health Check Completed with ${errors} errors.`);
    if (errors > 0) process.exit(1);
}

check();
