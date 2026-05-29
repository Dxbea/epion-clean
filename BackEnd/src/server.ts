// BackEnd/src/server.ts
import * as Sentry from '@sentry/node';
import path from 'path';
import './env';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { router as csrfRouter } from './routes/csrf';
import { csrfRequired } from './lib/csrf';

import { env } from './env';
import type { Request, Response, NextFunction } from 'express';

import { router as apiRouter } from './routes';
import logger from './lib/logger';
import { router as favoritesRouter } from './routes/favorite';
import { router as authRouter } from './routes/auth';
import { router as adminRouter } from './routes/admin';
import { router as meRouter } from './routes/me';
import { router as statsRouter } from './routes/stats';
import { router as commentsRouter } from './routes/comments';
import { router as aiRouter } from './routes/ai';
import { router as debugRouter } from './routes/debug-checks';
import { router as socialRouter } from './routes/social';
import { router as usersRouter } from './routes/users';
import { router as healthRouter } from './routes/health';
import { initializeCron } from './cron/dailyReset';
import { NEWS_SITEMAPS } from './lib/news-sitemaps';
import { newsIngestionQueue } from './lib/queue';
import { prisma } from './lib/db';
import { redis } from './lib/redis';
import './workers/embedding.worker'; // 🧠 Initialize Embedding Worker
import './workers/source-enrichment.worker'; // 🔍 Initialize Source Enrichment Worker
import './workers/live-analysis.worker'; // ⚖️ Initialize Live Analysis Worker (Epion 2.0)

import './workers/news-worker'; // Zero-Cost News Ingestion Worker

// ... (existing code)


const app = express();
const log = logger.child({ module: 'Server' });
const httpLog = logger.child({ module: 'HTTP' });
const httpLogStream = {
  write: (message: string) => {
    httpLog.http(message.trim());
  },
};

// ----------------------------
//  🔐  Sécurité globale
// ----------------------------

// Vercel / Render / proxies -> cookies "secure"
app.set('trust proxy', 1);

// Retirer X-Powered-By: Express
app.disable('x-powered-by');

// Helmet (sécurité headers)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// ----------------------------
//  🌍 CORS CORRECT (une seule fois !)
// ----------------------------
const allowedOrigin = [
  'http://localhost:5173',
  'https://epion-clean.vercel.app',
  'https://epion.app',
  'https://www.epion.app',
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigin.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);

// ----------------------------
//  📦 Middleware globaux
// ----------------------------

// Limiter taille des payloads -> anti DoS
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));



// ... (imports)

// ----------------------------
//  📦 Middleware globaux
// ----------------------------

// Servir les fichiers statiques (uploads)
app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

app.use(cookieParser());

// Logs HTTP
if (process.env.NODE_ENV !== 'test') {
  // ----------------------------
  //  🔍 Sentry Context & Request Logging
  // ----------------------------
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // If user is authenticated, set context in Sentry
    if ((req as any).user) {
      Sentry.setUser({
        id: (req as any).user.id,
        email: (req as any).user.email,
      });
    }
    next();
  });

  // Logging requests
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: httpLogStream,
  }));
}

// ----------------------------
//  🔧 Health checks
// ----------------------------
app.get('/', (_req, res) => res.type('text').send('epion-api up'));
app.get('/api/ping', (_req, res) => res.json({ pong: true, now: Date.now() }));
app.get('/api/healthz', (_req, res) => res.json({ ok: true, service: 'epion-api' }));
app.get('/api/version', (_req, res) => res.json({ name: 'epion-api', version: '0.1.0' }));
app.use('/api/health', healthRouter);
if (env.NODE_ENV !== 'production' && process.env.ENABLE_DEBUG_ROUTES === 'true') {
  app.use('/api/debug', debugRouter);

// ----------------------------
//  🔑 Auth en premier
// ----------------------------

// ----------------------------
//  🔧 Debug routes (development/test only — disabled in production)
// ----------------------------
  log.info('Debug routes mounted (/api/debug) — non-production mode');
}

// ----------------------------
//  🔒 CSRF token + protection
// ----------------------------

// endpoint pour récupérer le token (nécessite une session)
app.use('/api', csrfRouter);

// protection CSRF pour toutes les requêtes mutantes sur /api
app.use('/api', csrfRequired);
app.use('/api', authRouter);

// ----------------------------
//  📚 Routes métiers
// ----------------------------
app.use('/api/stats', statsRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api', adminRouter);
app.use('/api', apiRouter);
app.use('/api/me', meRouter);
app.use('/api', commentsRouter);
app.use('/api/ai', aiRouter);
// debug router mounted above CSRF middleware (line ~150)
app.use('/api/social', socialRouter);
app.use('/api/users', usersRouter);

// ----------------------------
//  ❌ 404 pour tout le reste
// ----------------------------
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// ----------------------------
//  🚨 Sentry Error Handler (Must be before custom handlers)
// ----------------------------
Sentry.setupExpressErrorHandler(app);

// ----------------------------
//  🚨 Error handler global
// ----------------------------
app.use(
  (err: any, _req: Request, res: Response, _next: NextFunction) => {
    log.error('[API ERROR]', {
      message: err.message,
      stack: err.stack,
      ...err
    });

    return res.status(err.status || 500).json({
      error: err.code || 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  },
);

// ----------------------------
//  🚀 Launch
// ----------------------------
const PORT = Number(process.env.PORT) || 5175;

// Initialize BullMQ Recurring Jobs
// IMPORTANT: Repeatable jobs persist in Redis with their original config.
// We must remove stale ones before re-adding to apply updated backoff/timing.
async function scheduleRecurringJobs(): Promise<void> {
    const schedulerLog = logger.child({ module: 'Scheduler' });
    // 1. Clean up any stale repeatable jobs from previous config
    try {
        const existingRepeatables = await newsIngestionQueue.getRepeatableJobs();
        for (const job of existingRepeatables) {
            await newsIngestionQueue.removeRepeatableByKey(job.key);
            schedulerLog.info('Removed stale repeatable job', {
                name: job.name,
                pattern: job.pattern,
                key: job.key,
            });
        }
    } catch (err: any) {
        schedulerLog.warn('Failed to clean stale repeatable jobs', {
            error: err.message,
        });
    }

    // 2. Register fresh repeatable jobs with current config
    schedulerLog.info('Scheduling News Ingestion Job (GDELT every 2 hours)');
    await newsIngestionQueue.add('discover-gdelt', {
        query: 'lang:French',
        maxRecords: 15,
    }, {
        repeat: {
            pattern: '0 */2 * * *', // Every 2 hours — respects GDELT rate limits
        },
    });

    schedulerLog.info(`Scheduling News Ingestion Job (${NEWS_SITEMAPS.permissive.label} sitemap daily at 3:30 AM)`);
    await newsIngestionQueue.add('discover-sitemap', {
        sitemapUrl: NEWS_SITEMAPS.permissive.url,
        maxUrls: 100,
    }, {
        repeat: {
            pattern: '30 3 * * *',
        },
    });

    // Dev-local pause: protected sites reopen circuit breakers too easily on Windows
    // while curl-impersonate is unavailable. Keep these definitions visible for prod.
    // schedulerLog.info(`Scheduling News Ingestion Job (${NEWS_SITEMAPS.lemonde.label} sitemap daily at 3 AM)`);
    // await newsIngestionQueue.add('discover-sitemap', {
    //     sitemapUrl: NEWS_SITEMAPS.lemonde.url,
    //     maxUrls: 100,
    // }, {
    //     repeat: {
    //         pattern: '0 3 * * *',
    //     },
    // });

    // schedulerLog.info(`Scheduling News Ingestion Job (${NEWS_SITEMAPS.lefigaro.label} sitemap daily at 3:15 AM)`);
    // await newsIngestionQueue.add('discover-sitemap', {
    //     sitemapUrl: NEWS_SITEMAPS.lefigaro.url,
    //     maxUrls: 100,
    // }, {
    //     repeat: {
    //         pattern: '15 3 * * *',
    //     },
    // });
}

// Auto-seed categories
async function ensureCategories(): Promise<void> {
  const categoriesToEnsure = [
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

  for (const cat of categoriesToEnsure) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: { name: cat.name, slug: cat.slug },
    });
  }
  log.info('Categories seeded/verified');
}

async function validateConfig(): Promise<void> {
  try {
    log.info('Validating infrastructure dependencies before startup');

    const redisPong = await redis.ping();
    log.info('Redis startup check passed', { redisPong });

    await prisma.$queryRaw`SELECT 1`;
    log.info('Prisma startup check passed');

    const queueClient = await newsIngestionQueue.client;
    const bullPong = typeof (queueClient as any).ping === 'function'
      ? await (queueClient as any).ping()
      : 'connected';
    log.info('BullMQ startup check passed', {
      queue: 'news-ingestion-queue',
      bullPong,
    });
  } catch (error: any) {
    log.error('Critical startup dependency check failed', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

async function startServer(): Promise<void> {
  await validateConfig();
  initializeCron();
  await scheduleRecurringJobs();
  await ensureCategories();

  app.listen(PORT, '0.0.0.0', () => {
    log.info(`API listening on http://localhost:${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}

startServer().catch((error: any) => {
  log.error('Server startup crashed unexpectedly', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

