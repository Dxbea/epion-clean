/// <reference types="node" />
import { PrismaClient, Role, ArticleStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function getSeedAuthor() {
  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();

  if (seedAdminEmail) {
    const existing = await prisma.user.findUnique({
      where: { email: seedAdminEmail },
      select: { id: true, email: true },
    });

    if (!existing) {
      throw new Error('SEED_ADMIN_EMAIL must match an existing Better Auth user.');
    }

    const admin = await prisma.user.update({
      where: { id: existing.id },
      data: { role: Role.ADMIN },
    });

    await prisma.userUsage.upsert({
      where: { userId: admin.id },
      update: {
        dailyCredits: 10000,
        plan: 'PREMIUM',
      },
      create: {
        userId: admin.id,
        dailyCredits: 10000,
        plan: 'PREMIUM',
      },
    });

    console.log(`Admin user promoted from SEED_ADMIN_EMAIL: ${admin.email}`);
    return admin;
  }

  const seedAuthor = await prisma.user.upsert({
    where: { email: 'seed@local.test' },
    update: {},
    create: {
      email: 'seed@local.test',
      name: 'Seed User',
      role: Role.USER,
      username: 'seed',
    },
  });

  await prisma.userUsage.upsert({
    where: { userId: seedAuthor.id },
    update: {
      dailyCredits: 700,
      plan: 'FREE',
    },
    create: {
      userId: seedAuthor.id,
      dailyCredits: 700,
      plan: 'FREE',
    },
  });

  console.log('No seed admin promoted. Set SEED_ADMIN_EMAIL to promote an existing Better Auth user.');
  return seedAuthor;
}

async function main() {
  console.log('Start seeding...');

  const seedAuthor = await getSeedAuthor();

  const categoriesData = [
    { name: 'Monde', slug: 'monde' },
    { name: 'Politique', slug: 'politique' },
    { name: 'Economie', slug: 'economie' },
    { name: 'Societe', slug: 'societe' },
    { name: 'Tech', slug: 'tech' },
    { name: 'Sciences', slug: 'sciences' },
    { name: 'Sante', slug: 'sante' },
    { name: 'Environnement', slug: 'environnement' },
    { name: 'Culture', slug: 'culture' },
    { name: 'Sport', slug: 'sport' },
    { name: 'Lifestyle', slug: 'lifestyle' },
    { name: 'Insolite', slug: 'insolite' },
  ];

  const categories = [];

  for (const cat of categoriesData) {
    const category = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: {
        name: cat.name,
        slug: cat.slug,
      },
    });
    categories.push(category);
    console.log(`Category created/verified: ${category.name}`);
  }

  try {
    const officialSlugs = categoriesData.map((c) => c.slug);
    const fallbackCategory = categories.find((c) => c.slug === 'monde') || categories[0];

    const moved = await prisma.article.updateMany({
      where: {
        category: {
          slug: { notIn: officialSlugs },
        },
      },
      data: {
        categoryId: fallbackCategory.id,
      },
    });
    if (moved.count > 0) {
      console.log(`Reassigned ${moved.count} articles from obsolete categories to '${fallbackCategory.name}'.`);
    }

    const deleted = await prisma.category.deleteMany({
      where: {
        slug: { notIn: officialSlugs },
      },
    });

    if (deleted.count > 0) {
      console.log(`Deleted ${deleted.count} obsolete categories.`);
    }
  } catch (err) {
    console.warn('Cleanup warning:', err);
  }

  const categoryId = categories[0].id;
  const articlesData = [
    {
      title: "L'avenir de l'IA generative",
      slug: 'avenir-ia-generative',
      summary: "Une exploration des potentiels futurs de l'intelligence artificielle.",
      content: "Contenu detaille sur l'IA generative et ses impacts sur la societe...",
    },
    {
      title: 'Les avancees en medecine personnalisee',
      slug: 'medecine-personnalisee',
      summary: 'Comment la genetique transforme les soins de sante.',
      content: 'Analyse des nouvelles therapies ciblees...',
    },
    {
      title: 'Ethique et algorithmes',
      slug: 'ethique-algorithmes',
      summary: 'Les biais algorithmiques expliques.',
      content: "Discussion sur la justice et l'equite dans les systemes automatises...",
    },
    {
      title: 'La revolution quantique',
      slug: 'revolution-quantique',
      summary: 'Ordinateurs quantiques : bientot une realite ?',
      content: "Explication des principes de base de l'informatique quantique...",
    },
    {
      title: 'Exploration spatiale : Mars 2030',
      slug: 'mars-2030',
      summary: 'Les plans pour la premiere colonie humaine.',
      content: 'Details sur les missions prevues par la NASA et SpaceX...',
    },
  ];

  for (const art of articlesData) {
    const article = await prisma.article.upsert({
      where: { slug: art.slug },
      update: {},
      create: {
        title: art.title,
        slug: art.slug,
        summary: art.summary,
        content: art.content,
        status: ArticleStatus.PUBLISHED,
        authorId: seedAuthor.id,
        categoryId,
        imageUrl: `https://placehold.co/600x400?text=${art.slug}`,
      },
    });
    console.log(`Article created/verified: ${article.title}`);
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
