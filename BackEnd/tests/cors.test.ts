// BackEnd/tests/cors.test.ts
//
// Vérifie que la configuration CORS autorise les bonnes origines et rejette les inconnues.
// La logique buildAllowedOrigin() est une réplique exacte de server.ts :
//   - origines hardcodées de base (CORS_BASE_ORIGINS)
//   - origines extensibles via CORS_EXTRA_ORIGINS (virgule-séparé)
// ⚠️  CORS_EXTRA_ORIGINS ≠ BETTER_AUTH_TRUSTED_ORIGINS : deux systèmes distincts.

import cors from 'cors';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

// Réplique exacte de la logique server.ts — à maintenir synchronisée si server.ts change.
const CORS_BASE_ORIGINS = [
  'http://localhost:5173',
  'https://epion-clean.vercel.app',
  'https://epion.app',
  'https://www.epion.app',
  'https://localhost', // Capacitor Android WebView
];

function buildAllowedOrigin(corsExtraOriginsEnv?: string): string[] {
  const extra = (corsExtraOriginsEnv ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return Array.from(new Set([...CORS_BASE_ORIGINS, ...extra]));
}

function buildCorsApp(corsExtraOriginsEnv?: string) {
  const allowedOrigin = buildAllowedOrigin(corsExtraOriginsEnv);
  const app = express();
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigin.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }),
  );
  app.get('/api/ping', (_req, res) => res.json({ ok: true }));
  app.options('/api/auth/sign-in/email', (_req, res) => res.sendStatus(204));
  return app;
}

describe('CORS policy', () => {
  it('répond au preflight OPTIONS depuis https://localhost (Capacitor Android)', async () => {
    const res = await request(buildCorsApp())
      .options('/api/auth/sign-in/email')
      .set('Origin', 'https://localhost')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type,X-CSRF-Token');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://localhost');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('inclut Access-Control-Allow-Origin sur une vraie requête depuis https://localhost', async () => {
    const res = await request(buildCorsApp())
      .get('/api/ping')
      .set('Origin', 'https://localhost');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://localhost');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('autorise l\'origine web de production https://epion.app', async () => {
    const res = await request(buildCorsApp())
      .get('/api/ping')
      .set('Origin', 'https://epion.app');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://epion.app');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('autorise l\'origine web de production https://www.epion.app', async () => {
    const res = await request(buildCorsApp())
      .get('/api/ping')
      .set('Origin', 'https://www.epion.app');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://www.epion.app');
  });

  it('autorise l\'origine de dev local http://localhost:5173', async () => {
    const res = await request(buildCorsApp())
      .get('/api/ping')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('rejette une origine inconnue', async () => {
    const res = await request(buildCorsApp())
      .get('/api/ping')
      .set('Origin', 'https://evil.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejette http://localhost (non-https) — variante non Capacitor', async () => {
    const res = await request(buildCorsApp())
      .get('/api/ping')
      .set('Origin', 'http://localhost');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('accepte les requêtes sans Origin (serveur-à-serveur, curl)', async () => {
    const res = await request(buildCorsApp()).get('/api/ping');
    // Pas d'Origin → CORS laisse passer (callback(null, true))
    expect(res.status).toBe(200);
  });

  it('CORS_EXTRA_ORIGINS ajoute des origines dynamiquement sans redéploiement de code', async () => {
    const app = buildCorsApp('https://staging.epion.app,https://beta.epion.app');

    const res = await request(app)
      .get('/api/ping')
      .set('Origin', 'https://staging.epion.app');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://staging.epion.app');
  });

  it('CORS_EXTRA_ORIGINS ignore les entrées vides et tolère les espaces', async () => {
    const app = buildCorsApp(' https://staging.epion.app , , ');

    const res = await request(app)
      .get('/api/ping')
      .set('Origin', 'https://staging.epion.app');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://staging.epion.app');
  });
});
