import { prisma } from '../lib/db.js';
import { getArticleImageProposals } from '../lib/images/proposals.js';

async function main() {
  const article = await prisma.article.findFirst({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      generationPrompt: true,
      generationConfig: true,
      factCheckData: true,
      imageUrl: true
    }
  });

  if (!article) {
    console.log('No article found');
    return;
  }

  console.log('--- Latest Article Info ---');
  console.log('ID:', article.id);
  console.log('Title:', article.title);
  
  const config = (article.generationConfig as any) || {};
  const wikiQuery = config.wikipedia_search_query;
  const lang = config.language || 'fr';
  console.log('Wiki Query from Config:', wikiQuery);
  console.log('Language from Config:', lang);

  let sourceUrls: string[] = [];
  if (article.factCheckData) {
    const factData: any = article.factCheckData;
    const sources = Array.isArray(factData) ? factData : (factData.sources || []);
    sourceUrls = sources.map((s: any) => s.url).filter((u: any) => u);
  }
  console.log('Source URLs:', sourceUrls);

  const topic = wikiQuery || article.title;
  console.log('Topic used for search:', topic);

  console.log('\n--- Fetching Image Proposals ---');
  const proposals = await getArticleImageProposals(sourceUrls, topic, lang);
  console.log('Count:', proposals.length);
  console.log('Proposals:', JSON.stringify(proposals, null, 2));
}

main().catch(console.error).finally(() => {
    if (typeof process !== 'undefined') {
        process.exit();
    }
});
