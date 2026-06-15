import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { toNodeHandler } from 'better-auth/node';

vi.mock('../src/lib/mailer.js', () => ({
  APP_URL: 'http://localhost:5173',
  sendMail: vi.fn(async () => undefined),
}));

const TEST_EMAIL_PREFIX = 'better-auth-context';
const PASSWORD = 'Context-password-123';

describe('Better Auth current-user context', () => {
  let prisma: PrismaClient;
  let app: express.Express;
  let createJwtForSession: (userId: string, sessionId: string) => string;
  let sendMailMock: ReturnType<typeof vi.fn>;

  async function cleanupUsers() {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: TEST_EMAIL_PREFIX } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    if (userIds.length === 0) return;

    await prisma.betterAuthSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.betterAuthAccount.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.passwordReset.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  function uniqueEmail(label: string) {
    return `${TEST_EMAIL_PREFIX}-${label}-${Date.now()}@example.com`;
  }

  function extractCookie(response: request.Response) {
    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie as string];
    return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
  }

  async function signUp(email: string) {
    const response = await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://localhost:5173')
      .send({ name: 'Context User', email, password: PASSWORD });

    expect(response.status).toBe(200);
    return prisma.user.findUniqueOrThrow({ where: { email } });
  }

  async function createVerifiedSession(email: string) {
    const user = await signUp(email);
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    const login = await request(app)
      .post('/api/auth/sign-in/email')
      .set('Origin', 'http://localhost:5173')
      .send({ email, password: PASSWORD });

    expect(login.status).toBe(200);
    return { userId: user.id, cookie: extractCookie(login) };
  }

  beforeAll(async () => {
    const dbModule = await import('../src/lib/db.js');
    const authModule = await import('../src/lib/better-auth.js');
    const currentUserModule = await import('../src/lib/currentUser.js');
    const verifiedModule = await import('../src/lib/requireVerifiedUser.js');
    const sessionModule = await import('../src/lib/session.js');
    const mailerModule = await import('../src/lib/mailer.js');

    prisma = dbModule.prisma;
    createJwtForSession = sessionModule.createJwtForSession;
    sendMailMock = vi.mocked(mailerModule.sendMail);

    app = express();
    app.all('/api/auth/*', toNodeHandler(authModule.auth));
    app.use(express.json());

    app.get('/protected', async (req, res) => {
      const user = await currentUserModule.getCurrentUser(req, res);
      if (!user) return res.status(401).json({ error: 'NO_SESSION' });
      return res.json({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        emailVerified: user.emailVerified,
      });
    });

    app.get('/verified', async (req, res) => {
      const result = await verifiedModule.requireVerifiedUser(req, res);
      if (!result) return;
      return res.json({ id: result.user.id, emailVerified: result.user.emailVerified });
    });

    app.get('/admin', async (req, res) => {
      const user = await currentUserModule.getCurrentUser(req, res);
      if (!user) return res.status(401).json({ error: 'NO_SESSION' });
      if (user.role !== 'ADMIN') return res.status(403).json({ error: 'FORBIDDEN' });
      return res.json({ id: user.id, role: user.role });
    });

    await cleanupUsers();
  });

  beforeEach(() => {
    sendMailMock.mockClear();
  });

  afterAll(async () => {
    await cleanupUsers();
    await prisma.$disconnect();
  });

  it('allows a valid Better Auth session to access a protected Epion route without exposing tokens', async () => {
    const email = uniqueEmail('protected');
    const { cookie } = await createVerifiedSession(email);

    const response = await request(app).get('/protected').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.email).toBe(email);
    expect(response.body.role).toBe('USER');
    expect(response.body).not.toHaveProperty('token');
    expect(response.body).not.toHaveProperty('sessionToken');
    expect(response.body).not.toHaveProperty('sessionId');
  });

  it('rejects missing, revoked, legacy-only, and deleted-user sessions', async () => {
    const email = uniqueEmail('rejected');
    const { userId, cookie } = await createVerifiedSession(email);

    const missing = await request(app).get('/protected');
    expect(missing.status).toBe(401);

    await prisma.betterAuthSession.deleteMany({ where: { userId } });
    const revoked = await request(app).get('/protected').set('Cookie', cookie);
    expect(revoked.status).toBe(401);

    const legacySession = await prisma.session.create({
      data: {
        userId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const legacyCookie = `epion_session=${createJwtForSession(userId, legacySession.id)}`;
    const legacyOnly = await request(app).get('/protected').set('Cookie', legacyCookie);
    expect(legacyOnly.status).toBe(401);

    const deletedEmail = uniqueEmail('deleted');
    const deletedUserSession = await createVerifiedSession(deletedEmail);
    await prisma.user.delete({ where: { id: deletedUserSession.userId } });
    const deletedUser = await request(app)
      .get('/protected')
      .set('Cookie', deletedUserSession.cookie);
    expect(deletedUser.status).toBe(401);
  });

  it('blocks unverified Better Auth users and accepts verified users', async () => {
    const email = uniqueEmail('verified');
    const { userId, cookie } = await createVerifiedSession(email);

    await prisma.user.update({ where: { id: userId }, data: { emailVerified: false } });
    const unverified = await request(app).get('/verified').set('Cookie', cookie);
    expect(unverified.status).toBe(403);
    expect(unverified.body.error).toBe('EMAIL_NOT_VERIFIED');

    await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
    const verified = await request(app).get('/verified').set('Cookie', cookie);
    expect(verified.status).toBe(200);
    expect(verified.body.emailVerified).toBe(true);
  });

  it('uses the current Prisma role for admin authorization without a new account or session', async () => {
    const email = uniqueEmail('admin');
    const { userId, cookie } = await createVerifiedSession(email);

    const userDenied = await request(app).get('/admin').set('Cookie', cookie);
    expect(userDenied.status).toBe(403);

    await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });

    const adminAllowed = await request(app).get('/admin').set('Cookie', cookie);
    expect(adminAllowed.status).toBe(200);
    expect(adminAllowed.body.role).toBe('ADMIN');
  });
});
