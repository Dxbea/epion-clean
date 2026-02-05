import 'dotenv/config'; // Ensure local env vars are loaded
import { streamPerplexity, PerplexityMessage } from '../src/lib/perplexity';
import { logger } from '../src/lib/logger';

// Mock logger to print to console
logger.info = console.log as any;
logger.error = console.error as any;
logger.warn = console.warn as any;
logger.debug = console.debug as any;

async function testStream() {
    console.log("--- Starting Perplexity Stream Debug ---");

    if (!process.env.PERPLEXITY_API_KEY) {
        console.error("ERROR: PERPLEXITY_API_KEY is missing in .env");
        process.exit(1);
    }

    const messages: PerplexityMessage[] = [
        { role: 'user', content: 'Tell me a short joke about programming.' }
    ];

    try {
        const stream = streamPerplexity(messages, 'sonar');
        console.log("Stream generator created. Starting consumption...");

        let fullContent = "";
        for await (const chunk of stream) {
            process.stdout.write(chunk); // Print chunks as they arrive
            fullContent += chunk;
        }

        console.log("\n\n--- Stream Completed ---");
        console.log("Total received length:", fullContent.length);

        if (fullContent.length === 0) {
            console.error("FAILURE: Received empty response.");
        } else {
            console.log("SUCCESS: Stream received data.");
        }

    } catch (error) {
        console.error("\nFATAL ERROR:", error);
    }
}

testStream();
