import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from BackEnd root
config({ path: resolve(__dirname, '../.env') });

import { streamPerplexity, callPerplexity } from '../src/lib/perplexity';

async function main() {
    console.log("Testing callPerplexity...");
    try {
        const res = await callPerplexity([{ role: 'user', content: 'Bonjour' }], 'sonar');
        console.log("Success:", res.answer);
    } catch (err: any) {
        console.error("callPerplexity Error:", err.message);
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", err.response.data);
        }
    }

    console.log("\nTesting streamPerplexity...");
    try {
        const stream = streamPerplexity([{ role: 'user', content: 'Test stream' }], 'sonar');
        for await (const chunk of stream) {
            process.stdout.write(chunk);
        }
        console.log("\nStream done.");
    } catch (err: any) {
        console.error("streamPerplexity Error:", err.message);
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", err.response.data);
        }
    }
}

main().catch(console.error);
