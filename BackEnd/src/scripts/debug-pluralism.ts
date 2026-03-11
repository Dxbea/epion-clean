
import { analyzePluralism } from "../lib/scanners/pluralism-scanner";
import fs from 'fs';
import dotenv from 'dotenv';

// Load .env (defaults to CWD/.env)
dotenv.config();

console.log("PERPLEXITY_API_KEY Present:", !!process.env.PERPLEXITY_API_KEY);

// Domains to test (Mix of standard and potential blockers)
const DOMAINS = [
    "lemonde.fr",       // Standard News
    "lefigaro.fr",      // Standard News
    "mediapart.fr",     // Paywall
    "bfmtv.com",        // Heavy JS?
    "francetvinfo.fr",  // Public
    "statista.com"      // Works (50)
];

async function runDebug() {
    const logParams = ["=== DEBUGGING PLURALISM SCANNER ==="];

    for (const domain of DOMAINS) {
        logParams.push(`\n\nTesting: ${domain}...`);
        try {
            const result = await analyzePluralism(domain);
            logParams.push(`Score: ${result.score}`);
            logParams.push(`Details: ${JSON.stringify(result.details)}`);
            logParams.push(`Reasoning: ${result.reasoning}`);
        } catch (error: any) {
            logParams.push(`ERROR for ${domain}: ${error.message}`);
        }
    }

    fs.writeFileSync('debug_pluralism.log', logParams.join('\n'));
    console.log("Done. Check debug_pluralism.log");
}

runDebug();
