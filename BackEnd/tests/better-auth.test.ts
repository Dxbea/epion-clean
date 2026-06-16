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
let usernameCounter = 0;

describe('Better Auth foundation', () => {
  let prisma: PrismaClient;
  let compatibleApp: express.Express;
  let betterAuthApp: express.Express;
  let meApp: express.Express;
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
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.betterAuthVerification.deleteMany({
      where: {
        OR: [
          { identifier: { startsWith: 'reset-password:' } },
          { value: { in: userIds } },
        ],
      },
    });
    await prisma.inviteCode.deleteMany({
      where: { code: { startsWith: 'BA_TEST_' } },
    });
  }

  function uniqueEmail(label: string) {
    return `${TEST_EMAIL_PREFIX}-${label}-${Date.now()}@example.com`;
  }

  function uniqueUsername() {
    usernameCounter += 1;
    return `ba_${Date.now().toString(36)}_${usernameCounter}`;
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

  async function signUp(email: string, password = PASSWORD, inviteCode?: string, username = uniqueUsername()) {
    return request(betterAuthApp)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://localhost:5173')
      .send({
        name: 'Better Auth Test',
        email,
        password,
        username,
        ...(inviteCode ? { inviteCode } : {}),
        callbackURL: 'http://localhost:5173/verify-email',
      });
  }

  async function verifyLatestEmail() {
    const verificationUrl = extractUrl(latestMail().html);
    verificationUrl.searchParams.delete('callbackURL');
    const response = await request(betterAuthApp)
      .get(`/api/auth/verify-email${verificationUrl.search}`)
      .set('Origin', 'http://localhost:5173');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe(true);
  }

  async function signIn(email: string, password = PASSWORD) {
    return request(betterAuthApp)
      .post('/api/auth/sign-in/email')
      .set('Origin', 'http://localhost:5173')
      .send({ email, password, callbackURL: 'http://localhost:5173/verify-email' });
  }

  async function getSession(cookie: string) {
    return request(betterAuthApp)
      .get('/api/auth/get-session')
      .set('Cookie', cookie);
  }

  async function resendVerificationEmail(email: string) {
    return request(betterAuthApp)
      .post('/api/auth/send-verification-email')
      .set('Origin', 'http://localhost:5173')
      .send({ email, callbackURL: 'http://localhost:5173/verify-email' });
  }

  beforeAll(async () => {
    const dbModule = await import('../src/lib/db.js');
    const handlerModule = await import('../src/lib/better-auth-handler.js');
    const authModule = await import('../src/lib/better-auth.js');
    const meModule = await import('../src/routes/me.js');
    const mailerModule = await import('../src/lib/mailer.js');

    prisma = dbModule.prisma;
    sendMailMock = vi.mocked(mailerModule.sendMail);

    compatibleApp = express();
    compatibleApp.all('/api/auth/*', handlerModule.betterAuthExpressHandler);

    betterAuthApp = express();
    betterAuthApp.all('/api/auth/*', toNodeHandler(authModule.auth));

    meApp = express();
    meApp.all('/api/auth/*', toNodeHandler(authModule.auth));
    meApp.use(express.json());
    meApp.use('/api/me', meModule.router);

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

  it('lets Better Auth own password endpoints in the compatibility handler', async () => {
    const response = await request(compatibleApp)
      .post('/api/auth/request-password-reset')
      .set('Origin', 'http://localhost:5173')
      .send({
        email: uniqueEmail('unknown-reset'),
        redirectTo: 'http://localhost:5173/reset-password',
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/If this email exists/i);
  });

  it('does not serve removed legacy auth endpoints from the compatibility handler', async () => {
    const endpoints = [
      ['post', '/api/auth/signup'],
      ['post', '/api/auth/login'],
      ['post', '/api/auth/logout'],
      ['get', '/api/auth/me'],
      ['post', '/api/auth/request-verify'],
      ['post', '/api/auth/email/verification-link'],
      ['post', '/api/auth/change-email-request'],
      ['post', '/api/auth/confirm-email-change'],
      ['get', '/api/auth/sessions'],
    ] as const;

    for (const [method, path] of endpoints) {
      const response = await request(compatibleApp)[method](path).set('Origin', 'http://localhost:5173');
      expect(response.status).toBe(404);
    }
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
    expect(user?.username).toMatch(/^ba_/);
    expect(user?.betterAuthAccounts).toHaveLength(1);
    expect(user?.betterAuthAccounts[0].providerId).toBe('credential');
    expect(user?.betterAuthAccounts[0].password).toBeTruthy();

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = latestMail();
    expect(mail.to).toBe(email);
    expect(mail.subject).toMatch(/verify/i);
    expect(extractUrl(mail.html).pathname).toBe('/verify-email');
  });

  it('validates and consumes beta invitations atomically during Better Auth sign-up', async () => {
    const invite = await prisma.inviteCode.create({
      data: {
        code: `BA_TEST_${Date.now()}`,
        maxUses: 1,
      },
    });
    const email = uniqueEmail('invite');

    const response = await signUp(email, PASSWORD, invite.code);
    expect(response.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { betterAuthAccounts: true },
    });
    expect(user.username).toMatch(/^ba_/);
    expect(user.inviteCodeId).toBe(invite.id);
    expect(user.betterAuthAccounts).toHaveLength(1);

    const consumed = await prisma.inviteCode.findUniqueOrThrow({ where: { id: invite.id } });
    expect(consumed.usedCount).toBe(1);

    const second = await signUp(uniqueEmail('invite-full'), PASSWORD, invite.code);
    expect(second.status).toBe(400);
    expect(JSON.stringify(second.body)).toContain('INVITE_CODE_FULL');
  });

  it('rejects invalid beta invitations when an invite code is provided', async () => {
    const response = await signUp(uniqueEmail('bad-invite'), PASSWORD, 'BA_TEST_MISSING');

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('INVALID_INVITE_CODE');
  });

  it('denies login before verification, then creates and invalidates a Better Auth session', async () => {
    const email = uniqueEmail('session');
    await signUp(email);

    sendMailMock.mockClear();
    const deniedLogin = await signIn(email);
    expect(deniedLogin.status).toBe(403);
    expect(JSON.stringify(deniedLogin.body)).toContain('Email not verified');
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    await verifyLatestEmail();

    const login = await signIn(email);
    expect(login.status).toBe(200);
    const cookie = extractCookie(login);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { betterAuthSessions: true },
    });
    expect(user.emailVerified).toBe(true);
    expect(user.betterAuthSessions).toHaveLength(2);

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
    expect(sessionsAfterSignOut).toHaveLength(1);

    const sessionAfterSignOut = await request(betterAuthApp)
      .get('/api/auth/get-session')
      .set('Cookie', cookie);
    expect(sessionAfterSignOut.status).toBe(200);
    expect(sessionAfterSignOut.body).toBeNull();
  });

  it('lists and revokes Better Auth sessions without exposing tokens', async () => {
    const email = uniqueEmail('session-list');
    await signUp(email);
    await verifyLatestEmail();

    const firstLogin = await signIn(email);
    expect(firstLogin.status).toBe(200);
    const firstCookie = extractCookie(firstLogin);

    const secondLogin = await signIn(email);
    expect(secondLogin.status).toBe(200);

    const list = await request(meApp)
      .get('/api/me/sessions')
      .set('Cookie', firstCookie);
    expect(list.status).toBe(200);
    expect(list.body.sessions.length).toBeGreaterThan(1);
    expect(JSON.stringify(list.body)).not.toContain('token');

    const otherSession = list.body.sessions.find((session: { current: boolean }) => !session.current);
    expect(otherSession).toBeTruthy();

    const revoked = await request(meApp)
      .delete(`/api/me/sessions/${otherSession.id}`)
      .set('Cookie', firstCookie);
    expect(revoked.status).toBe(200);
    expect(revoked.body.ok).toBe(true);
    expect(JSON.stringify(revoked.body)).not.toContain('token');

    const revokedOthers = await request(meApp)
      .delete('/api/me/sessions/others')
      .set('Cookie', firstCookie);
    expect(revokedOthers.status).toBe(200);
    expect(revokedOthers.body.ok).toBe(true);

    const after = await request(meApp)
      .get('/api/me/sessions')
      .set('Cookie', firstCookie);
    expect(after.status).toBe(200);
    expect(after.body.sessions.every((session: { current: boolean }) => session.current)).toBe(true);
  });

  it('changes email through Better Auth verification and refreshes Epion profile data', async () => {
    const email = uniqueEmail('change-email');
    const newEmail = uniqueEmail('changed-email');
    await signUp(email);
    await verifyLatestEmail();

    const login = await signIn(email);
    expect(login.status).toBe(200);
    const cookie = extractCookie(login);

    sendMailMock.mockClear();
    const requested = await request(betterAuthApp)
      .post('/api/auth/change-email')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie)
      .send({
        newEmail,
        callbackURL: 'http://localhost:5173/verify-email',
      });
    expect(requested.status).toBe(200);
    expect(requested.body.status).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(latestMail().to).toBe(newEmail);

    const verificationUrl = extractUrl(latestMail().html);
    const verified = await request(betterAuthApp)
      .get(`/api/auth/verify-email${verificationUrl.search}`)
      .set('Origin', 'http://localhost:5173');
    expect(verified.status).toBe(200);
    expect(verified.body.status).toBe(true);

    const profile = await request(meApp)
      .get('/api/me')
      .set('Cookie', cookie);
    expect(profile.status).toBe(200);
    expect(profile.body.email).toBe(newEmail);
    expect(profile.body.emailVerified).toBe(true);
    expect(JSON.stringify(profile.body)).not.toContain('token');
  });

  it('manually resends verification email for an existing unverified account without duplicates', async () => {
    const email = uniqueEmail('manual-resend');
    await signUp(email);

    const userBefore = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { betterAuthAccounts: true },
    });
    expect(userBefore.emailVerified).toBe(false);
    expect(userBefore.betterAuthAccounts).toHaveLength(1);

    sendMailMock.mockClear();
    const resend = await resendVerificationEmail(email);
    expect(resend.status).toBe(200);
    expect(resend.body.status).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(latestMail().to).toBe(email);

    const userAfter = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { betterAuthAccounts: true },
    });
    expect(userAfter.id).toBe(userBefore.id);
    expect(userAfter.betterAuthAccounts).toHaveLength(1);

    const userCount = await prisma.user.count({ where: { email } });
    const accountCount = await prisma.betterAuthAccount.count({ where: { userId: userBefore.id } });
    expect(userCount).toBe(1);
    expect(accountCount).toBe(1);
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
    expect(userBeforeReset.betterAuthSessions).toHaveLength(3);

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

  it('rejects invalid password reset tokens', async () => {
    const response = await request(betterAuthApp)
      .post('/api/auth/reset-password')
      .set('Origin', 'http://localhost:5173')
      .send({
        token: 'invalid-reset-token',
        newPassword: NEW_PASSWORD,
      });

    expect(response.status).toBe(400);
  });

  it('changes password for an authenticated user and revokes other sessions', async () => {
    const email = uniqueEmail('change-password');
    await signUp(email);
    await verifyLatestEmail();

    const firstLogin = await signIn(email);
    expect(firstLogin.status).toBe(200);
    const firstCookie = extractCookie(firstLogin);

    const secondLogin = await signIn(email);
    expect(secondLogin.status).toBe(200);
    const secondCookie = extractCookie(secondLogin);

    const wrongCurrent = await request(betterAuthApp)
      .post('/api/auth/change-password')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', firstCookie)
      .send({
        currentPassword: 'wrong-password',
        newPassword: NEW_PASSWORD,
        revokeOtherSessions: true,
      });
    expect(wrongCurrent.status).toBe(400);

    const changed = await request(betterAuthApp)
      .post('/api/auth/change-password')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', firstCookie)
      .send({
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
        revokeOtherSessions: true,
      });
    expect(changed.status).toBe(200);
    const refreshedCookie = extractCookie(changed);

    const oldFirstSession = await getSession(firstCookie);
    expect(oldFirstSession.status).toBe(200);
    expect(oldFirstSession.body).toBeNull();

    const oldSecondSession = await getSession(secondCookie);
    expect(oldSecondSession.status).toBe(200);
    expect(oldSecondSession.body).toBeNull();

    const refreshedSession = await getSession(refreshedCookie);
    expect(refreshedSession.status).toBe(200);
    expect(refreshedSession.body.user.email).toBe(email);

    const rejectedOldPassword = await signIn(email, PASSWORD);
    expect(rejectedOldPassword.status).toBe(401);

    const acceptedNewPassword = await signIn(email, NEW_PASSWORD);
    expect(acceptedNewPassword.status).toBe(200);
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
