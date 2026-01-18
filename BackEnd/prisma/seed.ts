/// <reference types="node" />
import { PrismaClient, Role, ArticleStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Start seeding...');

  // 1. Create Admin User
  const email = 'admin@epion.fr';
  const password = 'admin';
  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Admin Epion',
      role: Role.ADMIN,
      passwordHash: hashedPassword,
      username: 'admin',
    },
  });

  console.log(`👤 Admin user created/verified: ${admin.email}`);

  // 2. Create Categories
  const categoriesData = [
    { name: 'Monde', slug: 'monde' },
    { name: 'Politique', slug: 'politique' },
    { name: 'Économie', slug: 'economie' },
    { name: 'Société', slug: 'societe' },
    { name: 'Tech', slug: 'tech' },
    { name: 'Sciences', slug: 'sciences' },
    { name: 'Santé', slug: 'sante' },
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
    console.log(`📂 Category created/verified: ${category.name}`);
  }

  // Cleanup: Reassign articles from old categories to 'Monde' and delete old categories
  try {
    const officialSlugs = categoriesData.map(c => c.slug);
    const fallbackCategory = categories.find(c => c.slug === 'monde') || categories[0];

    // 1. Reassign articles
    const moved = await prisma.article.updateMany({
      where: {
        category: {
          slug: { notIn: officialSlugs }
        }
      },
      data: {
        categoryId: fallbackCategory.id
      }
    });
    if (moved.count > 0) {
      console.log(`📦 Reassigned ${moved.count} articles from obsolete categories to '${fallbackCategory.name}'.`);
    }

    // 2. Delete obsolete categories
    const deleted = await prisma.category.deleteMany({
      where: {
        slug: { notIn: officialSlugs }
      }
    });

    if (deleted.count > 0) {
      console.log(`🧹 Deleted ${deleted.count} obsolete categories.`);
    }
  } catch (err) {
    console.warn("⚠️ Cleanup warning:", err);
  }

  // 3. Create 5 Dummy Articles
  // Linked to Admin and the first category (or random)
  const categoryId = categories[0].id; // Assign to first category for simplicity

  const articlesData = [
    {
      title: 'L\'avenir de l\'IA générative',
      slug: 'avenir-ia-generative',
      summary: 'Une exploration des potentiels futurs de l\'intelligence artificielle.',
      content: 'Contenu détaillé sur l\'IA générative et ses impacts sur la société...',
    },
    {
      title: 'Les avancées en médecine personnalisée',
      slug: 'medecine-personnalisee',
      summary: 'Comment la génétique transforme les soins de santé.',
      content: 'Analyse des nouvelles thérapies ciblées...',
    },
    {
      title: 'Éthique et algorithmes',
      slug: 'ethique-algorithmes',
      summary: 'Les biais algorithmiques expliqués.',
      content: 'Discussion sur la justice et l\'équité dans les systèmes automatisés...',
    },
    {
      title: 'La révolution quantique',
      slug: 'revolution-quantique',
      summary: 'Ordinateurs quantiques : bientôt une réalité ?',
      content: 'Explication des principes de base de l\'informatique quantique...',
    },
    {
      title: 'Exploration spatiale : Mars 2030',
      slug: 'mars-2030',
      summary: 'Les plans pour la première colonie humaine.',
      content: 'Détails sur les missions prévues par la NASA et SpaceX...',
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
        authorId: admin.id,
        categoryId: categoryId,
        imageUrl: `https://placehold.co/600x400?text=${art.slug}`, // Dummy image
      },
    });
    console.log(`📝 Article created/verified: ${article.title}`);
  }

  console.log('✅ Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
