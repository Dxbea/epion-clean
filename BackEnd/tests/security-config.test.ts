import express from 'express';
import cors from 'cors';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { parseEnv } from '../src/env.js';
import {
  createCorsOptions,
  createSecurityHeadersMiddleware,
  resolveAllowedBrowserOrigins,
  permissionsPolicyMiddleware,
} from '../src/lib/security-config.js';

function buildCorsTestApp(allowedOrigins: string[]) {
  const app = express();
  app.use(cors(createCorsOptions(allowedOrigins, 'production')));
  app.get('/api/ping', (_req, res) => res.json({ ok: true }));
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.status || 500).json({ error: err.code || 'INTERNAL_ERROR' });
  });
  return app;
}

function buildHeaderTestApp() {
  const app = express();
  app.use(createSecurityHeadersMiddleware());
  app.use(permissionsPolicyMiddleware());
  app.get('/api/ping', (_req, res) => res.json({ ok: true }));
  return app;
}

const productionEnv = {
  NODE_ENV: 'production',
  APP_ENV: 'production',
  DATABASE_URL: 'postgresql://postgres:postgres@db.example.com:5432/epion',
  FRONTEND_ORIGIN: 'https://app.epion.test',
  BETTER_AUTH_URL: 'https://api.epion.test',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
};

describe('security config', () => {
  it('allows an authorized browser origin with credentials', async () => {
    const app = buildCorsTestApp(['https://app.epion.test']);

    const response = await request(app)
      .get('/api/ping')
      .set('Origin', 'https://app.epion.test');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://app.epion.test');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('refuses an unauthorized browser origin without verbose production details', async () => {
    const app = buildCorsTestApp(['https://app.epion.test']);

    const response = await request(app)
      .get('/api/ping')
      .set('Origin', 'https://evil.example');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'CORS_FORBIDDEN' });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps server-to-server or test requests without Origin compatible', async () => {
    const app = buildCorsTestApp(['https://app.epion.test']);

    const response = await request(app).get('/api/ping');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects empty or unsafe production origin configuration', () => {
    expect(() => parseEnv({ ...productionEnv, CORS_ALLOWED_ORIGINS: '' })).toThrow(
      /CORS_ALLOWED_ORIGINS/,
    );

    expect(() =>
      parseEnv({
        ...productionEnv,
        FRONTEND_ORIGIN: 'http://localhost:5173',
      }),
    ).toThrow(/localhost|https/);
  });

  it('rejects origin paths, query strings, and hashes across CORS and Better Auth inputs', () => {
    expect(() =>
      parseEnv({
        ...productionEnv,
        CORS_ALLOWED_ORIGINS: 'https://extra.epion.test/app',
      }),
    ).toThrow(/path, query or hash/);

    expect(() =>
      parseEnv({
        ...productionEnv,
        BETTER_AUTH_TRUSTED_ORIGINS: 'https://auth.epion.test?next=/app',
      }),
    ).toThrow(/path, query or hash/);
  });

  it('uses one normalized browser-origin set for CORS, Better Auth, and CSRF-protected requests', () => {
    const origins = resolveAllowedBrowserOrigins({
      APP_ENV: 'production',
      FRONTEND_ORIGIN: 'https://app.epion.test',
      CORS_ALLOWED_ORIGINS: 'https://staging.epion.test',
      BETTER_AUTH_TRUSTED_ORIGINS: 'https://auth.epion.test',
    });

    expect(origins).toEqual([
      'https://app.epion.test',
      'https://staging.epion.test',
      'https://auth.epion.test',
    ]);
  });

  it('adds security headers and report-only CSP without breaking API routes', async () => {
    const app = buildHeaderTestApp();

    const response = await request(app).get('/api/ping');

    expect(response.status).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    const csp = response.headers['content-security-policy-report-only'] as string;
    const scriptSrc = csp.match(/script-src ([^;]+)/)?.[1] ?? '';
    const fontSrc = csp.match(/font-src ([^;]+)/)?.[1] ?? '';
    const mediaSrc = csp.match(/media-src ([^;]+)/)?.[1] ?? '';
    const imgSrc = csp.match(/img-src ([^;]+)/)?.[1] ?? '';

    expect(response.headers['permissions-policy']).toContain('camera=()');
    expect(csp).toContain("default-src 'self'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(fontSrc).not.toContain('data:');
    expect(mediaSrc).not.toContain('data:');
    expect(mediaSrc).not.toContain('blob:');
    expect(imgSrc).toContain('data:');
    expect(imgSrc).toContain('blob:');
  });
});



