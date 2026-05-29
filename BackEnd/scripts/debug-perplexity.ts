import 'dotenv/config';
import OpenAI from 'openai';
import {
    formatWebSourcesForPrompt,
    generateWebSystemPrompt,
    searchWebContext,
    type WebChatMessage,
} from '../src/lib/web-chat';
import { logger } from '../src/lib/logger';

logger.info = console.log as any;
logger.error = console.error as any;
logger.warn = console.warn as any;
logger.debug = console.debug as any;

async function testStream() {
    console.log('--- Starting Tavily + OpenAI Stream Debug ---');

    if (!process.env.TAVILY_API_KEY) {
        console.error('ERROR: TAVILY_API_KEY is missing in .env');
        process.exit(1);
    }

    if (!process.env.OPENAI_API_KEY) {
        console.error('ERROR: OPENAI_API_KEY is missing in .env');
        process.exit(1);
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const question = 'Tell me a short joke about programming with one source citation.';
    const webContext = await searchWebContext(question, { profile: 'standard' });
    const sources = webContext.promptSources;
    const messages: WebChatMessage[] = [{ role: 'user', content: question }];

    try {
        const stream = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `${generateWebSystemPrompt('balanced', {
                        filterSources: false,
                        forceNeutrality: false,
                        recentEvents: false,
                    })}

<context>
${formatWebSourcesForPrompt(sources)}
</context>`,
                },
                ...messages,
            ],
            max_tokens: 200,
            temperature: 0.2,
            stream: true,
            user: 'epion-debug-user',
        });

        console.log('Stream created. Starting consumption...');

        let fullContent = '';
        for await (const chunk of stream) {
            const refusal = chunk.choices[0]?.delta?.refusal;
            if (refusal) {
                throw new Error(`OpenAI stream was refused: ${refusal}`);
            }
            const delta = chunk.choices[0]?.delta?.content || '';
            if (!delta) continue;
            process.stdout.write(delta);
            fullContent += delta;
        }

        console.log('\n\n--- Stream Completed ---');
        console.log('Total received length:', fullContent.length);

        if (fullContent.length === 0) {
            console.error('FAILURE: Received empty response.');
        } else {
            console.log('SUCCESS: Stream received data.');
        }
    } catch (error) {
        console.error('\nFATAL ERROR:', error);
    }
}

testStream();
