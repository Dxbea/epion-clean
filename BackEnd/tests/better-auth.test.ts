import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { toNodeHandler } from 'better-auth/node';

vi.mock('../src/lib/mailer.js', () => ({
  APP_URL: 'http://localhost:5173',
  sendMail: vi.fn(async () => undefined),
}));

const TEST_EMAIL_PREFIX = 'better-auth-foundation';
const PASSWORD = 'Original-password-123';
const NEW_PASSWORD = 'New-password-456';

describe('Better Auth foundation', () => {
  let prisma: PrismaClient;
  let compatibleApp: express.Express;
  let betterAuthApp: express.Express;
  let sendMailMock: ReturnType<typeof vi.fn>;

  async function cleanupUsers() {
    const users = await prisma.user.findMany({
      where: {
        email: {
          startsWith: TEST_EMAIL_PREFIX,
        },
      },
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
    await prisma.betterAuthVerification.deleteMany({
      where: {
        OR: [
          { identifier: { startsWith: 'reset-password:' } },
          { value: { in: userIds } },
        ],
      },
    });
  }

  function uniqueEmail(label: string) {
    return `${TEST_EMAIL_PREFIX}-${label}-${Date.now()}@example.com`;
  }

  function latestMail() {
    const calls = sendMailMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][0] as { to: string; subject: string; text?: string; html: string };
  }

  function extractUrl(value: string) {
    const match = value.match(/https?:\/\/[^"'\s<>]+/);
    expect(match?.[0]).toBeTruthy();
    return new URL(match![0]);
  }

  function extractCookie(response: request.Response) {
    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie as string];
    expect(cookies.some((cookie) => cookie.includes('better-auth'))).toBe(true);
    return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
  }

  async function signUp(email: string, password = PASSWORD) {
    return request(betterAuthApp)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://localhost:5173')
      .send({
        name: 'Better Auth Test',
        email,
        password,
        callbackURL: 'http://localhost:5173/auth/verified',
      });
  }

  async function verifyLatestEmail() {
    const verificationUrl = extractUrl(latestMail().html);
    verificationUrl.searchParams.delete('callbackURL');
    const response = await request(betterAuthApp)
      .get(`${verificationUrl.pathname}${verificationUrl.search}`)
      .set('Origin', 'http://localhost:5173');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe(true);
  }

  async function signIn(email: string, password = PASSWORD) {
    return request(betterAuthApp)
      .post('/api/auth/sign-in/email')
      .set('Origin', 'http://localhost:5173')
      .send({ email, password });
  }

  beforeAll(async () => {
    const dbModule = await import('../src/lib/db.js');
    const handlerModule = await import('../src/lib/better-auth-handler.js');
    const authModule = await import('../src/lib/better-auth.js');
    const mailerModule = await import('../src/lib/mailer.js');

    prisma = dbModule.prisma;
    sendMailMock = vi.mocked(mailerModule.sendMail);

    compatibleApp = express();
    compatibleApp.all('/api/auth/*', handlerModule.betterAuthExpressHandler);

    betterAuthApp = express();
    betterAuthApp.all('/api/auth/*', toNodeHandler(authModule.auth));

    await cleanupUsers();
  });

  beforeEach(() => {
    sendMailMock.mockClear();
  });

  afterAll(async () => {
    await cleanupUsers();
    await prisma.$disconnect();
  });

  it('responds on /api/auth/ok', async () => {
    const response = await request(compatibleApp).get('/api/auth/ok');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('signs up with email/password, persists User and BetterAuthAccount, and sends verification email', async () => {
    const email = uniqueEmail('signup');
    const response = await signUp(email);

    expect(response.status).toBe(200);
    expect(response.body.token).toBeNull();
    expect(response.body.user.email).toBe(email);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { betterAuthAccounts: true },
    });

    expect(user).toBeTruthy();
    expect(user?.emailVerified).toBe(false);
    expect(user?.betterAuthAccounts).toHaveLength(1);
    expect(user?.betterAuthAccounts[0].providerId).toBe('credential');
    expect(user?.betterAuthAccounts[0].password).toBeTruthy();

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = latestMail();
    expect(mail.to).toBe(email);
    expect(mail.subject).toMatch(/verify/i);
    expect(extractUrl(mail.html).pathname).toBe('/api/auth/verify-email');
  });

  it('denies login before verification, then creates and invalidates a Better Auth session', async () => {
    const email = uniqueEmail('session');
    await signUp(email);

    const deniedLogin = await signIn(email);
    expect(deniedLogin.status).toBe(403);

    await verifyLatestEmail();

    const login = await signIn(email);
    expect(login.status).toBe(200);
    const cookie = extractCookie(login);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { betterAuthSessions: true },
    });
    expect(user.emailVerified).toBe(true);
    expect(user.betterAuthSessions).toHaveLength(1);

    const sessionResponse = await request(betterAuthApp)
      .get('/api/auth/get-session')
      .set('Cookie', cookie);
    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.body.user.email).toBe(email);

    const signOutResponse = await request(betterAuthApp)
      .post('/api/auth/sign-out')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie);
    expect(signOutResponse.status).toBe(200);

    const sessionsAfterSignOut = await prisma.betterAuthSession.findMany({
      where: { userId: user.id },
    });
    expect(sessionsAfterSignOut).toHaveLength(0);

    const sessionAfterSignOut = await request(betterAuthApp)
      .get('/api/auth/get-session')
      .set('Cookie', cookie);
    expect(sessionAfterSignOut.status).toBe(200);
    expect(sessionAfterSignOut.body).toBeNull();
  });

  it('requests password reset, resets password, and revokes other Better Auth sessions', async () => {
    const email = uniqueEmail('reset');
    await signUp(email);
    await verifyLatestEmail();

    const firstLogin = await signIn(email);
    const firstCookie = extractCookie(firstLogin);
    const secondLogin = await signIn(email);
    expect(secondLogin.status).toBe(200);

    const userBeforeReset = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { betterAuthSessions: true },
    });
    expect(userBeforeReset.betterAuthSessions).toHaveLength(2);

    sendMailMock.mockClear();
    const resetRequest = await request(betterAuthApp)
      .post('/api/auth/request-password-reset')
      .set('Origin', 'http://localhost:5173')
      .send({
        email,
        redirectTo: 'http://localhost:5173/reset-password',
      });
    expect(resetRequest.status).toBe(200);
    expect(resetRequest.body.message).toMatch(/If this email exists/i);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const resetUrl = extractUrl(latestMail().html);
    const resetTokenFromPath = resetUrl.pathname.split('/').pop();
    expect(resetTokenFromPath).toBeTruthy();

    const resetResponse = await request(betterAuthApp)
      .post('/api/auth/reset-password')
      .set('Origin', 'http://localhost:5173')
      .send({
        token: resetTokenFromPath,
        newPassword: NEW_PASSWORD,
      });
    expect(resetResponse.status).toBe(200);
    expect(resetResponse.body.status).toBe(true);

    const rejectedOldPassword = await signIn(email, PASSWORD);
    expect(rejectedOldPassword.status).toBe(401);

    const acceptedNewPassword = await signIn(email, NEW_PASSWORD);
    expect(acceptedNewPassword.status).toBe(200);

    const userAfterReset = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { betterAuthSessions: true },
    });
    expect(userAfterReset.betterAuthSessions).toHaveLength(1);

    const oldSession = await request(betterAuthApp)
      .get('/api/auth/get-session')
      .set('Cookie', firstCookie);
    expect(oldSession.status).toBe(200);
    expect(oldSession.body).toBeNull();
  });

  it('uses generic behavior for duplicate sign-up and unknown password reset requests', async () => {
    const email = uniqueEmail('duplicate');
    const unknownEmail = uniqueEmail('unknown');

    const firstSignUp = await signUp(email);
    expect(firstSignUp.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    sendMailMock.mockClear();
    const duplicateSignUp = await signUp(email);
    expect(duplicateSignUp.status).toBe(200);
    expect(duplicateSignUp.body.token).toBeNull();
    expect(duplicateSignUp.body.user.email).toBe(email);
    expect(sendMailMock).not.toHaveBeenCalled();

    const resetKnown = await request(betterAuthApp)
      .post('/api/auth/request-password-reset')
      .set('Origin', 'http://localhost:5173')
      .send({ email });
    expect(resetKnown.status).toBe(200);
    expect(resetKnown.body.message).toMatch(/If this email exists/i);

    sendMailMock.mockClear();
    const resetUnknown = await request(betterAuthApp)
      .post('/api/auth/request-password-reset')
      .set('Origin', 'http://localhost:5173')
      .send({ email: unknownEmail });
    expect(resetUnknown.status).toBe(200);
    expect(resetUnknown.body.message).toBe(resetKnown.body.message);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
