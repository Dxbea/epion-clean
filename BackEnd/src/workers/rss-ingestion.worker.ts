import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import Parser from 'rss-parser';
import { prisma } from '../lib/db';
import { logger } from '../lib/logger';
import { OpenAI } from 'openai';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const parser = new Parser();

// Liste de flux RSS - tu peux ajouter plus tard LeMonde, etc.
const FEEDS = [
    'https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com&hl=fr&gl=FR&ceid=FR:fr',
    'https://www.lemonde.fr/rss/une.xml',
    'https://www.lefigaro.fr/rss/figaro_actualites.xml',
];

/**
 * Fonction pour décoder les URLs Google News (Base64/Protobuf simplifié)
 * Ex: https://news.google.com/rss/articles/CBMi...
 */
function decodeGoogleNewsUrl(encodedUrl: string): string {
    if (!encodedUrl.startsWith('https://news.google.com/rss/articles/')) return encodedUrl;
    
    try {
        const b64 = encodedUrl.split('articles/')[1].split('?')[0];
        
        // Pad and correct base64url to base64
        const padding = '='.repeat((4 - (b64.length % 4)) % 4);
        const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
        
        const buffer = Buffer.from(base64, 'base64');
        const decodedStr = buffer.toString('utf-8');
        
        // Regex pour trouver l'URL HTTP(S) enfouie dans le format binaire Protobuf
        const match = decodedStr.match(/(https?:\/\/[^\s\u0000\u0001-\u001F]+)/);
        if (match) {
            return match[1];
        }
    } catch (e) {
        logger.warn(`[RSS Worker] Failed to decode Google News URL: ${encodedUrl}`);
    }
    return encodedUrl;
}

export const rssIngestionWorker = new Worker('rss-ingestion-queue', async (job: Job) => {
    if (job.name === 'ingest-rss') {
        logger.info('[RSS Worker] Démarrage de l\'ingestion...');
    for (const feedUrl of FEEDS) {
        try {
            logger.info(`[RSS Worker] Parsing du flux : ${feedUrl}`);
            const feed = await parser.parseURL(feedUrl);

            for (const item of feed.items) {
                if (!item.link) continue;
                
                // 1. Décodage
                const realUrl = decodeGoogleNewsUrl(item.link);
                
                // Extraction du domaine
                let domain = '';
                try { 
                    domain = new URL(realUrl).hostname.replace('www.', ''); 
                } catch { 
                    continue; 
                }

                // 2. Filtrage (Déduplication rapide)
                const existing = await (prisma as any).newsCache.findUnique({
                    where: { url: realUrl },
                    select: { id: true }
                });
                if (existing) continue;

                // 3. Extraction Jina Reader
                // r.jina.ai renvoie directement le Markdown
                const jinaUrl = `https://r.jina.ai/${realUrl}`;
                const jinaResponse = await fetch(jinaUrl);
                if (!jinaResponse.ok) {
                    logger.debug(`[RSS Worker] Echec Jina pour : ${realUrl}`);
                    continue;
                }
                
                const content = await jinaResponse.text();
                
                // On saute les articles trop courts ou cassés
                if (!content || content.length < 150) continue;

                const title = item.title || 'Sans Titre';
                logger.info(`[RSS Worker] Nouvel article détecté et extrait : "${title}"`);

                // 4. Vectorisation OpenAI (text-embedding-3-small)
                // Limite le payload pour éviter les erreurs de token (8000 char max approx)
                const textToEmbed = content.slice(0, 8000);
                const embedRes = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: textToEmbed,
                });
                const embedding = embedRes.data[0].embedding;

                // Date de publication ou mode par défaut
                const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();

                // 5. Stockage en Base (SQL Brut pour gérer les objets Vector / pgvector)
                await prisma.$executeRaw`
                    INSERT INTO "NewsCache" (id, url, domain, title, content, "publishedAt", "createdAt", embedding)
                    VALUES (
                        gen_random_uuid()::text,
                        ${realUrl},
                        ${domain},
                        ${title},
                        ${content},
                        ${publishedAt},
                        NOW(),
                        ${JSON.stringify(embedding)}::vector
                    )
                    ON CONFLICT (url) DO NOTHING;
                `;
                
                logger.info(`[RSS Worker] Article stocké avec succès : ${title}`);
                
                // Ratelimit temporel respectueux pour Jina/OpenAI
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        } catch (error: any) {
            logger.error(`[RSS Worker] Erreur globale sur le flux ${feedUrl}:`, error.message);
        }
        }
        
        logger.info('[RSS Worker] Ingestion terminée.');
    } else if (job.name === 'cleanup-news') {
        logger.info('[RSS Worker] Démarrage du nettoyage des anciens articles...');
        try {
            const deletedCount = await prisma.$executeRaw`DELETE FROM "NewsCache" WHERE "publishedAt" < NOW() - INTERVAL '30 days';`;
            logger.info(`[RSS Worker] Nettoyage terminé. ${deletedCount} articles de plus de 30 jours ont été supprimés.`);
        } catch (error: any) {
            logger.error(`[RSS Worker] Erreur pendant le nettoyage : ${error.message}`);
        }
    }
}, { connection: connection as any });

rssIngestionWorker.on('failed', (job, err) => {
    logger.error(`[RSS Worker] Job failed: ${job?.id}`, { error: err.message });
});
