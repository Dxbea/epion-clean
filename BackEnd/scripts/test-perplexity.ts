import { config } from 'dotenv';
import { resolve } from 'path';
import OpenAI from 'openai';
import {
    callWebSearchLLM,
    formatWebSourcesForPrompt,
    generateWebSystemPrompt,
    searchWebContext,
} from '../src/lib/web-chat';

// Load .env from BackEnd root
config({ path: resolve(__dirname, '../.env') });

async function main() {
    console.log("Testing Tavily + OpenAI call...");
    try {
        const res = await callWebSearchLLM(
            [{ role: 'user', content: 'Bonjour, résume rapidement les dernières infos sur OpenAI.' }],
            { useSearch: true, profile: 'standard' }
        );
        console.log("Success:", res.answer);
    } catch (err: any) {
        console.error("callWebSearchLLM Error:", err.message);
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", err.response.data);
        }
    }

    console.log("\nTesting Tavily + OpenAI streaming...");
    try {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('Missing OPENAI_API_KEY');
        }

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const query = 'Test stream with one recent web fact.';
        const webContext = await searchWebContext(query, { profile: 'standard' });
        const sources = webContext.promptSources;
        const stream = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `${generateWebSystemPrompt('balanced', {
                        filterSources: false,
                        forceNeutrality: false,
                        recentEvents: true,
                    })}

<context>
${formatWebSourcesForPrompt(sources)}
</context>`,
                },
                { role: 'user', content: query },
            ],
            max_tokens: 180,
            temperature: 0.2,
            stream: true,
        });

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || '';
            if (delta) {
                process.stdout.write(delta);
            }
        }
        console.log("\nStream done.");
    } catch (err: any) {
        console.error("stream Error:", err.message);
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", err.response.data);
        }
    }
}

main().catch(console.error);
