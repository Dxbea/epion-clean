// BackEnd/src/server.ts
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
import { router as favoritesRouter } from './routes/favorite';
import { router as authRouter } from './routes/auth';
import { router as adminRouter } from './routes/admin';
import { router as meRouter } from './routes/me';
import { router as statsRouter } from './routes/stats';
import { router as commentsRouter } from './routes/comments';

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
      if(allowedOrigin.includes(origin)) {
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
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use(cookieParser());

// Logs HTTP
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ----------------------------
//  🔧 Health checks
// ----------------------------
app.get('/', (_req, res) => res.type('text').send('epion-api up'));
app.get('/api/ping', (_req, res) => res.json({ pong: true, now: Date.now() }));
app.get('/api/healthz', (_req, res) => res.json({ ok: true, service: 'epion-api' }));
app.get('/api/version', (_req, res) => res.json({ name: 'epion-api', version: '0.1.0' }));

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

// ----------------------------
//  ❌ 404 pour tout le reste
// ----------------------------
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// ----------------------------
//  🚨 Error handler global
// ----------------------------
app.use(
  (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API ERROR]', err);

    return res.status(500).json({
      error: 'INTERNAL_ERROR',
    });
  },
);

// ----------------------------
//  🚀 Launch
// ----------------------------
const PORT = Number(process.env.PORT) || 5175;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
