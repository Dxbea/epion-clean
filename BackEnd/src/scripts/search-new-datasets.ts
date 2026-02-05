import axios from 'axios';

const SOURCES = {
    "MBFC_Crowe": "https://raw.githubusercontent.com/drmikecrowe/mbfcext/main/docs/v3/combined.json",
    "FakeNews": "https://raw.githubusercontent.com/pixelastic/fake-news/master/data/en/sources.json",
    "Wiki_Reliable": "https://raw.githubusercontent.com/News-Discovery/reliable-sources/main/data/sources.json"
};

async function analyze() {
    console.log("🕵️ Analyzing New Data Sources...");

    for (const [name, url] of Object.entries(SOURCES)) {
        console.log(`\n--- [${name}] ---`);
        try {
            const res = await axios.get(url, { timeout: 10000 });
            const data = res.data;

            if (name === "MBFC_Crowe" && !Array.isArray(data)) {
                console.log(`🔑 MBFC Keys: ${Object.keys(data).join(", ")}`);
                // If there creates 'sources' key, let's look inside
                if (data.sources) {
                    console.log(`📦 MBFC 'sources' count: ${Object.keys(data.sources).length}`);
                    // Check CNN inside sources
                    const cnn = data.sources['cnn.com'] || data.sources['cnn'];
                    console.log(`🔎 CNN Check (in .sources):`, cnn ? "✅ FOUND" : "❌ ABSENT");
                }
            }

            console.log(`✅ Status: OK`);

            // 2. "The CNN Test" (Does it contain major media?)
            const strData = JSON.stringify(data).toLowerCase();
            const hasCNN = strData.includes("cnn.com");
            const hasNYT = strData.includes("nytimes.com") || strData.includes("new york times");

            console.log(`🎯 Coverage Test (String Search):`);
            console.log(`   - Has cnn.com? ${hasCNN ? "YES ✅" : "NO ❌"}`);
            console.log(`   - Has nytimes? ${hasNYT ? "YES ✅" : "NO ❌"}`);

        } catch (e: any) {
            console.error(`❌ FAILURE [${name}]: ${e.message}`);
        }
    }
}

analyze();
