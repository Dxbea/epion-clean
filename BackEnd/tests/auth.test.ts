import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { router as authRouter } from '../src/routes/auth.js';
import { prisma } from '../src/lib/db.js';

const app = express();
app.use(express.json());
app.use('/api', authRouter);

describe('Remaining auth compatibility routes', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('keeps beta status available', async () => {
    const response = await request(app).get('/api/auth/beta-status');

    expect(response.status).toBe(200);
    expect(typeof response.body.betaMode).toBe('boolean');
  });

  it('rejects missing beta invite validation input', async () => {
    const response = await request(app)
      .post('/api/auth/verify-invite')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('MISSING_CODE');
  });

  it('does not expose removed legacy auth endpoints', async () => {
    const removed = [
      ['post', '/api/auth/signup'],
      ['post', '/api/auth/login'],
      ['post', '/api/auth/logout'],
      ['get', '/api/auth/me'],
      ['post', '/api/auth/forgot-password'],
      ['post', '/api/auth/reset-password'],
      ['post', '/api/auth/change-password'],
      ['get', '/api/auth/sessions'],
      ['delete', '/api/auth/sessions/legacy-id'],
      ['post', '/api/auth/email/verification-link'],
      ['post', '/api/auth/verify-email'],
      ['post', '/api/auth/change-email-request'],
      ['post', '/api/auth/confirm-email-change'],
    ] as const;

    for (const [method, path] of removed) {
      const response = await request(app)[method](path);
      expect(response.status).toBe(404);
    }
  });
});
