
import { getRichTrustScore } from "../lib/trust-score.js";
import { logger } from "../lib/logger.js";
import * as fs from 'fs';

// Force console logging
logger.transports.forEach((t) => (t.level = "debug"));

async function main() {
    const targets = [
        "optima-energie.fr",
        "ohm-energie.com",
        "sirenergies.com"
    ];

    let logOutput = "=== STARTING SCORE AUDIT ===\n";

    for (const domain of targets) {
        console.log(`\n\n🔎 AUDITING: ${domain} ...`);
        try {
            const result = await getRichTrustScore(domain);

            const entry = `
📊 RESULT FOR ${domain}:
   🏆 Global Score: ${result.globalScore}
   📏 Reliability Range: ${result.metadata.explanation?.range}
   📉 Penalties: ${result.metadata.explanation?.penalties.join(", ") || "None"}
   🧠 Analysis Breakdown:
       - Editorial (40%): ${result.details.editorial}
       - Semantic (30%): ${result.details.semantic}
       - Pluralism (30%): ${result.details.pluralism}
       - Transparency: ${result.details.transparency}
   🏷️  Reliability Label: ${result.metadata.reliability}
   📝 Justification: ${result.metadata.justification}
   ------------------------------------------------
`;
            logOutput += entry;
            console.log(entry);

        } catch (error) {
            console.error(`❌ Failed to audit ${domain}:`, error);
        }
    }
    fs.writeFileSync('audit_results.log', logOutput);
    console.log("Done. Results in audit_results.log");
}

main();
