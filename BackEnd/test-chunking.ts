import { investigateArticle } from './src/lib/live-analysis/fact-investigator';

async function test() {
    const res = await investigateArticle('viktor orban bilan', 'viktor orban bilan');
    console.log(`Sources conservées: ${res.sources.length}`);
    for(const s of res.sources) {
        console.log(`- ${s.domain} : ${s.content.substring(0, 100).replace(/\n/g, ' ')}`);
    }
}

test().catch(console.error);
