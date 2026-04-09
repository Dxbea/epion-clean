import axios from 'axios';

async function testWiki(query: string, lang: string) {
    const limit = 4;
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=${limit}`;
    
    console.log(`\nTesting ${lang} Wikipedia for "${query}"...`);
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
            return;
        }

        for (const pageId of Object.keys(pages)) {
            const page = pages[pageId];
            if (page?.original?.source) {
                console.log(`- Found image for: ${page.title}`);
                console.log(`  URL: ${page.original.source.slice(0, 100)}...`);
            } else {
                console.log(`- Page found but no original image: ${page.title}`);
            }
        }
    } catch (e: any) {
        console.error(`Error for ${lang}:`, e.message);
    }
}

async function main() {
    await testWiki("Donald Trump", "fr");
    await testWiki("Donald Trump", "en");
}

main();
