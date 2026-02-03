import axios from 'axios';

const URL = "https://raw.githubusercontent.com/drmikecrowe/mbfcext/main/docs/v3/combined.json";

async function main() {
    console.log("🕵️ Analyzing DrMikeCrowe/mbfcext...");
    try {
        const res = await axios.get(URL);
        const data = res.data;

        console.log(`✅ Fetched! Keys: ${Object.keys(data).join(", ")}`);

        // It seems to have "sources" key based on my hypothesis?
        // Let's check
        if (data.sources) {
            const keys = Object.keys(data.sources);
            console.log(`📦 Source Count: ${keys.length}`);
            console.log(`📋 First 5 keys: ${keys.slice(0, 5).join(", ")}`);

            // Check Majors
            const cnn = data.sources['cnn'] || data.sources['cnn.com'];
            const nyt = data.sources['nytimes'] || data.sources['nytimes.com'];
            console.log(`🔎 CNN:`, cnn ? "FOUND" : "MISSING");
            console.log(`🔎 NYT:`, nyt ? "FOUND" : "MISSING");

            if (cnn) console.log("Sample CNN:", JSON.stringify(cnn, null, 2));
        } else {
            console.warn("⚠️ No 'sources' key found. Dumping first level keys/values type:");
            for (const k of Object.keys(data).slice(0, 5)) {
                console.log(`${k}: ${typeof data[k]}`);
            }
        }

    } catch (e: any) {
        console.error("❌ Failed:", e.message);
    }
}

main();
