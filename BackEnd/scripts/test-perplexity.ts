import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root (one level up from scripts/)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const apiKey = process.env.PERPLEXITY_API_KEY;

console.log('--- PERPLEXITY HEALTH CHECK ---');
console.log(`API Key present: ${apiKey ? 'YES' : 'NO'}`);
if (apiKey) console.log(`API Key (first 5 chars): ${apiKey.substring(0, 5)}...`);

async function testPerplexity() {
    if (!apiKey) {
        console.error('❌ CRITICAL: No API Key found in process.env');
        return;
    }

    // Updated models: using 'sonar' and 'sonar-pro'
    const modelsToTest = ['sonar', 'sonar-pro'];

    for (const model of modelsToTest) {
        console.log(`\nTesting model: ${model}...`);
        try {
            const start = Date.now();
            const response = await axios.post(
                'https://api.perplexity.ai/chat/completions',
                {
                    model: model,
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant.' },
                        { role: 'user', content: 'Say "Hello, World!"' }
                    ]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 20000
                }
            );
            const duration = Date.now() - start;

            console.log(`✅ SUCCESS for ${model} (${duration}ms)`);
            console.log(`   Response: "${response.data.choices[0].message.content}"`);
        } catch (error: any) {
            console.error(`❌ FAILURE for ${model}`);
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
                console.log(`   Data:`, JSON.stringify(error.response.data, null, 2));
            } else {
                console.error(`   Error: ${error.message}`);
            }
        }
    }
}

testPerplexity();
