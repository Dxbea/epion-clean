// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import { PrismaClient, ReactionType, ArticleStatus, Rigor, ChatRole, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// --- Helpers ----------------------------------------------------
function pick<T>(arr: T[], n: number) {
  const out: T[] = [];
  const used = new Set<number>();
  while (out.length < n && used.size < arr.length) {
    const i = Math.floor(Math.random() * arr.length);
    if (!used.has(i)) { used.add(i); out.push(arr[i]); }
  }
  return out;
}

function nowMinus(minutes: number) {
  return new Date(Date.now() - minutes * 60_000);
}

const IMG = {
  world: 'https://images.unsplash.com/photo-1465447142348-e9952c393450?q=80&w=1200&auto=format&fit=crop',
  science: 'https://images.unsplash.com/photo-1517976487492-576541eeba9c?q=80&w=1200&auto=format&fit=crop',
  sport: 'https://images.unsplash.com/photo-1461897104016-0b3b00cc81ee?q=80&w=1200&auto=format&fit=crop',
  tech: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&auto=format&fit=crop',
  business: 'https://images.unsplash.com/photo-1454165205744-3b78555e5572?q=80&w=1200&auto=format&fit=crop',
  politics: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?q=80&w=1200&auto=format&fit=crop',
};

// --- Seed -------------------------------------------------------
async function main() {
  console.log('🌱 Seeding Epion demo data...');

  // Users
  const demoPwd = await bcrypt.hash('demo1234A!', 12);
  const paulPwd = await bcrypt.hash('Test1234!', 12);

  const demo = await prisma.user.upsert({
    where: { email: 'demo@epion.local' },
    update: { passwordHash: demoPwd, name: 'Demo User', role: Role.USER },
    create: { email: 'demo@epion.local', name: 'Demo User', role: Role.USER, passwordHash: demoPwd },
  });

  const paul = await prisma.user.upsert({
    where: { email: 'paul.hors@estaca.eu' },
    update: { passwordHash: paulPwd, name: 'paul Hors', role: Role.USER },
    create: { email: 'paul.hors@estaca.eu', name: 'paul Hors', role: Role.USER, passwordHash: paulPwd },
  });

  // Categories
  const categoriesData = [
    { slug: 'world', name: 'World' },
    { slug: 'science', name: 'Science' },
    { slug: 'sport', name: 'Sport' },
    { slug: 'tech', name: 'Tech' },
    { slug: 'business', name: 'Business' },
    { slug: 'politics', name: 'Politics' },
  ];
  const categories = await Promise.all(
    categoriesData.map(c =>
      prisma.category.upsert({ where: { slug: c.slug }, update: { name: c.name }, create: c })
    )
  );
  const catId = Object.fromEntries(categories.map(c => [c.slug, c.id]));

  // Articles (3 par catégorie)
  const mkArticle = (slug: string, title: string, img: string, catSlug: keyof typeof catId, authorId: string) => ({
    slug,
    title,
    summary: 'Short summary for demo purposes.',
    content:
      '<p><strong>Demo article.</strong> This is placeholder content used to test Epion features: views, saves, reactions, comments, edit, etc.</p>',
    status: ArticleStatus.PUBLISHED,
    imageUrl: img,
    categoryId: catId[catSlug],
    authorId,
  });

  const toCreate = [
    mkArticle('world-1', 'Global outlook 2025', IMG.world, 'world', demo.id),
    mkArticle('world-2', 'Energy transitions', IMG.world, 'world', demo.id),
    mkArticle('world-3', 'Climate diplomacy', IMG.world, 'world', paul.id),

    mkArticle('science-1', 'Gene editing milestones', IMG.science, 'science', demo.id),
    mkArticle('science-2', 'Quantum breakthroughs', IMG.science, 'science', paul.id),
    mkArticle('science-3', 'Fusion roadmap', IMG.science, 'science', paul.id),

    mkArticle('sport-1', 'Marathon training science', IMG.sport, 'sport', demo.id),
    mkArticle('sport-2', 'Analytics in football', IMG.sport, 'sport', paul.id),
    mkArticle('sport-3', 'Injury prevention 101', IMG.sport, 'sport', demo.id),

    mkArticle('tech-1', 'Edge AI is here', IMG.tech, 'tech', demo.id),
    mkArticle('tech-2', 'Compute economics', IMG.tech, 'tech', paul.id),
    mkArticle('tech-3', 'Secure LLM deployments', IMG.tech, 'tech', paul.id),

    mkArticle('business-1', 'Unit economics explained', IMG.business, 'business', demo.id),
    mkArticle('business-2', 'Pricing playbooks', IMG.business, 'business', paul.id),
    mkArticle('business-3', 'Finops in practice', IMG.business, 'business', demo.id),

    mkArticle('politics-1', 'Policy cycles 101', IMG.politics, 'politics', paul.id),
    mkArticle('politics-2', 'Media & public opinion', IMG.politics, 'politics', demo.id),
    mkArticle('politics-3', 'Elections around the world', IMG.politics, 'politics', paul.id),
  ];

  const articles = [];
  for (const a of toCreate) {
    const art = await prisma.article.upsert({
      where: { slug: a.slug },
      update: { ...a },
      create: a,
      include: { stats: true },
    });
    // Ensure stats exist
    await prisma.articleStats.upsert({
      where: { articleId: art.id },
      update: {},
      create: { articleId: art.id, viewsAll: 0 },
    });
    articles.push(art);
  }

  // Simuler des vues & stats + quelques favoris
  for (const art of articles) {
    // Pour les stats “all time”
    const views = Math.floor(50 + Math.random() * 200);
    const saved = Math.floor(Math.random() * 10);

    // ArticleView (quelques entrées récentes)
    const viewEntries = Array.from({ length: 6 }).map((_, i) => ({
      articleId: art.id,
      userId: i % 2 === 0 ? demo.id : null,
      viewerHash: i % 2 === 0 ? null : `anon_${art.slug}_${i}`,
      createdAt: nowMinus(60 - i * 5),
    }));
    await prisma.articleView.createMany({ data: viewEntries });

    await prisma.articleStats.update({
      where: { articleId: art.id },
      data: {
        viewsAll: views,
        views7d: Math.floor(views * 0.4),
        views30d: Math.floor(views * 0.8),
        savesAll: saved,
        trendingScore: Math.random() * 100,
        lastViewedAt: new Date(),
      },
    });

    // Saved by demo & paul (aléatoire)
    const savers = pick([demo.id, paul.id], Math.random() > 0.5 ? 1 : 2);
    for (const uid of savers) {
      await prisma.savedArticle.upsert({
        where: { userId_articleId: { userId: uid, articleId: art.id } },
        update: {},
        create: { userId: uid, articleId: art.id },
      });
    }

    // Réactions + commentaires
    const reactTypes = [ReactionType.LIKE, ReactionType.CLAP, ReactionType.HEART];
    const who = pick([demo.id, paul.id], 2);
    for (const uid of who) {
      // une réaction
      await prisma.articleReaction.upsert({
        where: { userId_articleId_type: { userId: uid, articleId: art.id, type: reactTypes[Math.floor(Math.random() * reactTypes.length)] } },
        update: {},
        create: { userId: uid, articleId: art.id, type: reactTypes[Math.floor(Math.random() * reactTypes.length)] },
      });
      // un commentaire
      await prisma.comment.create({
        data: {
          articleId: art.id,
          userId: uid,
          content: `Great read on "${art.title}" — demo comment.`,
          createdAt: nowMinus(30),
        },
      });
    }
  }

  // Sessions (auth de connexion)
  await prisma.session.createMany({
    data: [
      { userId: demo.id, createdAt: nowMinus(240), expiresAt: null },
      { userId: paul.id, createdAt: nowMinus(15), expiresAt: null },
    ],
  });

  // Chat Folders + Sessions + Messages
  const general = await prisma.chatFolder.upsert({
    where: { userId_name: { userId: demo.id, name: 'General' } },
    update: {},
    create: { userId: demo.id, name: 'General' },
  });
  const research = await prisma.chatFolder.upsert({
    where: { userId_name: { userId: demo.id, name: 'Research' } },
    update: {},
    create: { userId: demo.id, name: 'Research' },
  });

  const sess1 = await prisma.chatSession.create({
    data: {
      userId: demo.id,
      folderId: general.id,
      mode: Rigor.balanced,
      topic: 'Welcome & tips',
      createdAt: nowMinus(120),
      updatedAt: nowMinus(110),
    },
  });
  const sess2 = await prisma.chatSession.create({
    data: {
      userId: demo.id,
      folderId: research.id,
      mode: Rigor.precise,
      topic: 'Compare articles: energy & climate',
      createdAt: nowMinus(30),
      updatedAt: nowMinus(5),
    },
  });

  await prisma.chatMessage.createMany({
    data: [
      { sessionId: sess1.id, role: ChatRole.user, content: 'How do I save articles?', createdAt: nowMinus(119) },
      { sessionId: sess1.id, role: ChatRole.assistant, content: 'Click the bookmark icon on any article. You’ll find them in “Saved”.', createdAt: nowMinus(118) },

      { sessionId: sess2.id, role: ChatRole.user, content: 'Summarize top climate articles', createdAt: nowMinus(29) },
      { sessionId: sess2.id, role: ChatRole.assistant, content: 'Here is a comparison across world & science categories...', createdAt: nowMinus(28) },
    ],
  });

  console.log('✅ Seed done.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
// FIN BLOC
