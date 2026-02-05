import axios from 'axios';

async function main() {
    console.log("🔍 Analyzing Wikipedia Perennial Sources...");

    const candidates = [
        'https://raw.githubusercontent.com/dvalcarcel/reliability-estimation-of-news-media-sources/main/CC-NEWS/ALL/08/graph/en/reliability_scores.json',
        'https://raw.githubusercontent.com/News-Discovery/reliable-sources/main/data/sources.json',
        'https://raw.githubusercontent.com/News-Discovery/reliable-sources/master/data/sources.json',
        'https://raw.githubusercontent.com/News-Discovery/reliable-sources/main/sources.json',
        'https://raw.githubusercontent.com/News-Discovery/reliable-sources/main/data/sites.json',
        'https://raw.githubusercontent.com/News-Discovery/reliable-sources/main/reliable-sources.json'
    ];

    let data = null;
    for (const url of candidates) {
        try {
            console.log(`Checking: ${url}`);
            const res = await axios.get(url, { headers: { 'User-Agent': 'Epion-Bot/1.0' }, responseType: 'json' });
            if (res.status === 200) {
                console.log("✅ FOUND!");
                data = res.data;
                if (typeof data === 'string') {
                    try { data = JSON.parse(data); } catch (e) { }
                }
                break;
            }
        } catch (e: any) {
            // console.log(`   -> Failed (${e.response?.status || e.message})`);
        }
    }

    if (!data) {
        console.error("❌ Could not find dataset in any candidate URL.");
        return;
    }

    // Log basic stats
    const isArray = Array.isArray(data);
    const count = isArray ? data.length : Object.keys(data).length;
    console.log(`TYPE: ${isArray ? 'Array' : 'Object'}`);
    console.log(`COUNT: ${count}`);

    // inspect items
    const items = isArray ? data : Object.values(data);
    if (items.length > 0) {
        console.log("\n--- SAMPLE ITEM ---");
        console.log(JSON.stringify(items[0], null, 2));

        console.log("\n--- DATA COVERAGE ---");
        const hasDomain = items.filter((x: any) => x.domain).length;
        const hasUrl = items.filter((x: any) => x.url).length;
        console.log(`With 'domain': ${hasDomain}`);
        console.log(`With 'url': ${hasUrl}`);

        console.log("\n--- CONSENSUS VALUES ---");
        // Check what field holds the rating. usually 'consensus' or 'label'
        // I'll check keys of first item
        const keys = Object.keys(items[0]);
        console.log(`Keys: ${keys.join(', ')}`);

        // Try to find consensus field
        const uniqueConsensus = new Set();
        items.forEach((x: any) => {
            if (x.consensus) uniqueConsensus.add(JSON.stringify(x.consensus));
            if (x.label) uniqueConsensus.add(x.label);
            if (x.rating) uniqueConsensus.add(x.rating);
        });
        console.log("Unique Ratings/Consensus found:", Array.from(uniqueConsensus));
    }
}
main();
