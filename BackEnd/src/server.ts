// BackEnd/src/server.ts
import * as Sentry from '@sentry/node';
import path from 'path';
import './env.js';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { router as csrfRouter } from './routes/csrf.js';
import { csrfRequired } from './lib/csrf.js';

import { env } from './env.js';
import type { Request, Response, NextFunction } from 'express';

import { router as apiRouter } from './routes/index.js';
import logger from './lib/logger.js';
import { router as favoritesRouter } from './routes/favorite.js';
import { router as authRouter } from './routes/auth.js';
import { router as adminRouter } from './routes/admin.js';
import { router as meRouter } from './routes/me.js';
import { router as statsRouter } from './routes/stats.js';
import { router as commentsRouter } from './routes/comments.js';
import { router as aiRouter } from './routes/ai.js';
import { router as debugRouter } from './routes/debug-checks.js';
import { router as socialRouter } from './routes/social.js';
import { router as usersRouter } from './routes/users.js';
import { router as healthRouter } from './routes/health.js';
import { prisma } from './lib/db.js';
import { redis } from './lib/redis.js';
import { betterAuthExpressHandler } from './lib/better-auth-handler.js';

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

// Origines hardcodées — toujours autorisées quelle que soit la config Render.
const CORS_BASE_ORIGINS = [
  // Dev web local
  'http://localhost:5173',
  // Vercel preview
  'https://epion-clean.vercel.app',
  // Production web
  'https://epion.app',
  'https://www.epion.app',
  // Capacitor Android WebView (androidScheme: 'https' → origine interne https://localhost)
  'https://localhost',
];

// Origines supplémentaires via variable d'environnement CORS_EXTRA_ORIGINS (virgule-séparé).
// Permet d'ajouter des origines sur Render sans redéployer le code.
// Exemple Render : CORS_EXTRA_ORIGINS=https://localhost,https://staging.epion.app
const corsExtraOrigins = (env.CORS_EXTRA_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigin = Array.from(new Set([...CORS_BASE_ORIGINS, ...corsExtraOrigins]));

app.use(
  cors({
    origin(origin, callback) {
      // Pas d'Origin (requêtes serveur-à-serveur, curl sans -H Origin) → autorisé.
      if (!origin) return callback(null, true);
      if (allowedOrigin.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);



// Better Auth must receive the raw Node request before Express body parsing.
// Legacy /api/auth routes are explicitly passed through by the handler.
app.all('/api/auth/*', betterAuthExpressHandler);

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

