import axios from 'axios';

async function testWiki(query: string, lang: string) {
    const limit = 4;
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${limit}`;
    
    console.log(`Testing ${lang} Wikipedia for "${query}"...`);
    try {
        const response = await axios.get(url, {
            timeout: 5000,
            headers: {
                'User-Agent': 'EpionBot/1.0 (contact@epion.app)'
            }
        });

        const pages = response.data?.query?.pages;
        if (!pages) {
            console.log(`No results for ${lang}`);
            return [];
        }

        const results = [];
        for (const pageId of Object.keys(pages)) {
            const page = pages[pageId];
            if (page?.original?.source) {
                results.push({
                    title: page.title,
                    url: page.original.source
                });
            }
        }
        console.log(`Found ${results.length} results for ${lang}`);
        return results;
    } catch (e: any) {
        console.error(`Error for ${lang}:`, e.message);
        return [];
    }
}

async function main() {
    const q = "œuf de pâques";
    await testWiki(q, 'en');
    await testWiki(q, 'fr');
    
    const q2 = "Ligue des champions";
    await testWiki(q2, 'en');
    await testWiki(q2, 'fr');
}

main();
