import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const routeMocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  buildUserDataExport: vi.fn(),
}));

vi.mock('../src/lib/currentUser.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/currentUser.js')>('../src/lib/currentUser.js');
  return {
    ...actual,
    getCurrentUser: routeMocks.getCurrentUser,
  };
});

vi.mock('../src/lib/user-data-export.js', () => ({
  buildUserDataExport: routeMocks.buildUserDataExport,
}));

describe('GET /api/me/export', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    const meModule = await import('../src/routes/me.js');
    app = express();
    app.use('/api/me', meModule.router);
  });

  it('rejects unauthenticated users', async () => {
    routeMocks.getCurrentUser.mockResolvedValue(null);

    const response = await request(app).get('/api/me/export');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'NO_SESSION' });
    expect(routeMocks.buildUserDataExport).not.toHaveBeenCalled();
  });

  it('downloads only the current user export without tokens, hashes, or secrets', async () => {
    routeMocks.getCurrentUser.mockResolvedValue({
      id: 'user-current',
      sessionId: 'session-current',
    });
    routeMocks.buildUserDataExport.mockResolvedValue({
      exportedAt: '2026-06-20T12:00:00.000Z',
      formatVersion: 1,
      account: { id: 'user-current', email: 'current@example.com' },
      auth: {
        sessions: [{ id: 'session-current', current: true }],
      },
      content: {
        authoredArticles: [{ id: 'article-current', title: 'Current user article' }],
        savedArticles: [{ articleId: 'article-saved', article: { title: 'Saved article' } }],
      },
      chat: {
        sessions: [{ id: 'chat-current', messages: [{ content: 'Current user message' }] }],
      },
      interactions: {
        comments: [{ content: 'Current user comment' }],
        reactions: [{ articleId: 'article-current', type: 'HEART' }],
        contributions: [{ text: 'Current user contribution' }],
      },
    });

    const response = await request(app).get('/api/me/export');
    const serialized = response.text.toLowerCase();

    expect(response.status).toBe(200);
    expect(routeMocks.buildUserDataExport).toHaveBeenCalledWith('user-current', 'session-current');
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['content-disposition']).toContain('epion-export-2026-06-20T12-00-00-000Z.json');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toContain('Current user article');
    expect(response.text).not.toContain('Other user private article');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('hash');
    expect(serialized).not.toContain('secret');
  });
});
