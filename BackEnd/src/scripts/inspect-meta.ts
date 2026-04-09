import { prisma } from '../lib/db';

async function main() {
  const id = "cmnowyl6r000cf8cob0u3kppo";
  const article = await prisma.article.findUnique({
    where: { id },
    select: {
      generationConfig: true
    }
  });

  const config = article?.generationConfig as any;
  console.log("QUERY:", config?.wikipedia_search_query);
  console.log("LANG:", config?.language);
}

main().catch(console.error).finally(() => process.exit());
