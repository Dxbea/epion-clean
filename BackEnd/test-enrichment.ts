import { searchWebContext } from './src/lib/web-chat';
import { enrichChatSources } from './src/lib/chat-source-enrichment';

async function test() {
    console.log('--- Step 1: searchWebContext ---');
    const sources = await searchWebContext('bilan viktor orban', { profile: 'standard' });
    console.log(`searchWebContext returned ${sources.length} sources`);
    for (const s of sources) {
        console.log(`  [${s.domain}] content: ${s.content.length} chars`);
    }

    console.log('\n--- Step 2: enrichChatSources ---');
    try {
        const result = await enrichChatSources(sources);
        console.log(`enrichChatSources returned ${result.sources.length} sources, mean: ${result.sourcesMean}`);
        for (const s of result.sources) {
            console.log(`  [${s.domain}] trustScore: ${s.trustScore}, id: ${s.id}`);
        }
    } catch (err) {
        console.error('enrichChatSources CRASHED:', err);
    }
}

test().catch(console.error);
