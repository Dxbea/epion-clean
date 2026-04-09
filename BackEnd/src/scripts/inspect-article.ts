import { prisma } from '../lib/db';

async function main() {
  const id = "cmnowyl6r000cf8cob0u3kppo";
  const article = await prisma.article.findUnique({
    where: { id },
    select: {
      title: true,
      generationConfig: true,
      imageUrl: true
    }
  });

  console.log(JSON.stringify(article, null, 2));
}

main().catch(console.error).finally(() => process.exit());
