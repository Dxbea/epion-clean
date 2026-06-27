import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { csrfRequired } from '../src/lib/csrf.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', csrfRequired);

  app.post('/api/articles/:id/view', (_req, res) => res.status(204).end());
  app.post('/api/articles', (_req, res) => res.status(201).json({ ok: true }));
  app.put('/api/articles/:id', (_req, res) => res.json({ ok: true }));
  app.delete('/api/articles/:id', (_req, res) => res.status(204).end());

  return app;
}

describe('article CSRF boundaries', () => {
  it('allows anonymous public article view tracking without a CSRF token', async () => {
    const response = await request(buildApp()).post('/api/articles/public-article-id/view');

    expect(response.status).toBe(204);
  });

  it('keeps article create/edit/delete mutations protected without a CSRF token', async () => {
    const app = buildApp();

    const create = await request(app).post('/api/articles').send({ title: 'Article' });
    const edit = await request(app).put('/api/articles/article-id').send({ title: 'Updated' });
    const destroy = await request(app).delete('/api/articles/article-id');

    expect(create.status).not.toBe(201);
    expect(edit.status).not.toBe(200);
    expect(destroy.status).not.toBe(204);
  });
});
