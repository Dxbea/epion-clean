
import { evaluateUnknownSource } from "../lib/cold-profiler.js";
import { logger } from "../lib/logger.js";

// Force console logging
logger.transports.forEach((t) => (t.level = "debug"));

async function main() {
    const targets = [
        "optima-energie.fr",
        "ohm-energie.com"
    ];

    console.log("=== COL PROFILER DEBUG ===");

    for (const domain of targets) {
        console.log(`\n\n🧊 PROFILING: ${domain} ...`);
        try {
            const result = await evaluateUnknownSource(domain);

            console.log(`\n📊 VERDICT FOR ${domain}:`);
            console.log(`   🏷️  Reliability: ${result.reliability}`);
            console.log(`   📝 Reasoning: ${result.reasoning}`);

        } catch (error) {
            console.error(`❌ Failed to profile ${domain}:`, error);
        }
    }
}

main();
