// BackEnd/src/server.ts
import * as Sentry from '@sentry/node';
import path from 'path';
import { fileURLToPath } from 'url';
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
import type { Server } from 'http';
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
import { prisma, closePrisma } from './lib/db.js';
import { redis, closeRedis } from './lib/redis.js';
import { getBullConnection, closeOpenedQueues } from './lib/queue.js';
import { betterAuthExpressHandler } from './lib/better-auth-handler.js';
import { closeHttpServer, closeSentry, createShutdownManager } from './lib/shutdown.js';

const log = logger.child({ module: 'Server' });
const httpLog = logger.child({ module: 'HTTP' });
const httpLogStream = {
  write: (message: string) => {
    httpLog.http(message.trim());
  },
};

export const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

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

// Better Auth must receive the raw Node request before Express body parsing.
// Legacy /api/auth routes are explicitly passed through by the handler.
app.all('/api/auth/*', betterAuthExpressHandler);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'test') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if ((req as any).user) {
      Sentry.setUser({
        id: (req as any).user.id,
        email: (req as any).user.email,
      });
    }
    next();
  });

  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: httpLogStream,
  }));
}

app.get('/', (_req, res) => res.type('text').send('epion-api up'));
app.get('/api/ping', (_req, res) => res.json({ pong: true, now: Date.now() }));
app.get('/api/healthz', (_req, res) => res.json({ ok: true, service: 'epion-api' }));
app.get('/api/version', (_req, res) => res.json({ name: 'epion-api', version: '0.1.0' }));
app.use('/api/health', healthRouter);

if (env.NODE_ENV !== 'production' && process.env.ENABLE_DEBUG_ROUTES === 'true') {
  app.use('/api/debug', debugRouter);
  log.info('Debug routes mounted (/api/debug) - non-production mode');
}

app.use('/api', csrfRouter);
app.use('/api', csrfRequired);
app.use('/api', authRouter);

app.use('/api/stats', statsRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api', adminRouter);
app.use('/api', apiRouter);
app.use('/api/me', meRouter);
app.use('/api', commentsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/social', socialRouter);
app.use('/api/users', usersRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

Sentry.setupExpressErrorHandler(app);

app.use(
  (err: any, _req: Request, res: Response, _next: NextFunction) => {
    log.error('[API ERROR]', {
      message: err.message,
      stack: err.stack,
      ...err,
    });

    return res.status(err.status || 500).json({
      error: err.code || 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  },
);

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
  log.info('Validating infrastructure dependencies before startup');

  const redisPong = await redis.ping();
  log.info('Redis startup check passed', { redisPong });

  await prisma.$queryRaw`SELECT 1`;
  log.info('Prisma startup check passed');

  const bullConnection = getBullConnection();
  const bullPong = typeof (bullConnection as any).ping === 'function'
    ? await (bullConnection as any).ping()
    : 'connected';
  log.info('BullMQ startup check passed', { bullPong });
}

function listen(port: number): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(port, '0.0.0.0', () => {
      log.info(`API listening on http://localhost:${port} [${process.env.NODE_ENV || 'development'}]`);
      resolve(server);
    });
  });
}

export async function startApi(): Promise<{ server: Server; shutdown: () => Promise<void> }> {
  await validateConfig();
  await ensureCategories();

  const server = await listen(env.PORT);
  const shutdown = createShutdownManager({ name: 'api', logger: log });

  shutdown.add({ name: 'http-server', close: () => closeHttpServer(server) });
  shutdown.add({ name: 'bullmq-queues', close: closeOpenedQueues });
  shutdown.add({ name: 'redis', close: closeRedis });
  shutdown.add({ name: 'prisma', close: closePrisma });
  shutdown.add({ name: 'sentry', close: () => closeSentry() });
  shutdown.installSignalHandlers();

  return {
    server,
    shutdown: () => shutdown.shutdown('manual'),
  };
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isMainModule()) {
  startApi().catch((error: any) => {
    log.error('Server startup crashed unexpectedly', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}