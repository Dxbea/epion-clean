import { investigateArticle } from './src/lib/live-analysis/fact-investigator';

async function test() {
    const res = await investigateArticle('bilan de viktor orban', 'bilan de viktor orban');
    console.log(`Sources conservées: ${res.sources.length}`);
    for(const s of res.sources) {
        console.log(`- ${s.domain} : ${s.content.length} chars`);
    }
}

test().catch(console.error);
