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
import { logger } from './lib/logger';
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
import './workers/embedding.worker'; // 🧠 Initialize Worker

// ... (existing code)


const app = express();

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
  if (process.env.NODE_ENV === 'production') {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      logger.info(`HTTP ${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      next();
    });
  } else {
    app.use(morgan('dev'));
  }
}

// ----------------------------
//  🔧 Health checks
// ----------------------------
app.get('/', (_req, res) => res.type('text').send('epion-api up'));
app.get('/api/ping', (_req, res) => res.json({ pong: true, now: Date.now() }));
app.get('/api/healthz', (_req, res) => res.json({ ok: true, service: 'epion-api' }));
app.get('/api/version', (_req, res) => res.json({ name: 'epion-api', version: '0.1.0' }));
app.use('/api/health', healthRouter);

// ----------------------------
//  🔑 Auth en premier
// ----------------------------
app.use('/api', authRouter);

// ----------------------------
//  🔒 CSRF token + protection
// ----------------------------

// endpoint pour récupérer le token (nécessite une session)
app.use('/api', csrfRouter);

// protection CSRF pour toutes les requêtes mutantes sur /api
app.use('/api', csrfRequired);

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
app.use('/api/debug', debugRouter);
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
    logger.error('[API ERROR]', {
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

// Initialize Cron Jobs
initializeCron();

// Auto-seed categories
import { prisma } from './lib/db';

(async () => {
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
  logger.info('✅ Categories seeded/verified');

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 API listening on http://localhost:${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
})();
