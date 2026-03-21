import { generateArticleContent } from './services/articleGenerator';
import 'dotenv/config';

// test-generator.ts
async function runTest() {
    try {
        console.log("Generating article to test source selection...");
        const result = await generateArticleContent({
            topic: "Les récents débats sur l'intelligence artificielle en Europe et les nouvelles régulations",
            language: "fr",
            style: "indepth",
            generateImage: false,
            category: "Tech"
        });

        console.log("\n--- RESULTATS ---");
        console.log("Nombre de sources détectées :", result.sources.length);
        console.log("\nURLs des sources :");
        result.sources.forEach(s => console.log(`- ${s.url}`));
    } catch (err) {
        console.error("Test failed:", err);
    }
}

runTest();
