import fs from 'fs/promises';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

import { AccountDeletionError, deleteUserAccount } from '../src/lib/account-deletion-service.js';

vi.mock('../src/lib/mailer.js', () => ({
  APP_URL: 'http://localhost:5173',
  sendMail: vi.fn(async () => undefined),
}));

const TEST_EMAIL_PREFIX = 'account-deletion';
const PASSWORD = 'Delete-password-123';
let counter = 0;

describe('account deletion service', () => {
  let prisma: PrismaClient;
  let hashPassword: (password: string) => Promise<string>;
  let generateId: (options?: { model?: string; size?: number }) => string;

  function unique(label: string) {
    counter += 1;
    return `${label}-${Date.now()}-${counter}`;
  }

  function email(label: string) {
    return `${TEST_EMAIL_PREFIX}-${unique(label)}@example.com`;
  }

  async function cleanup() {
    await prisma.article.deleteMany({ where: { slug: { startsWith: TEST_EMAIL_PREFIX } } });
    const users = await prisma.user.findMany({
      where: { email: { startsWith: TEST_EMAIL_PREFIX } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    if (userIds.length > 0) {
      await prisma.betterAuthVerification.deleteMany({ where: { value: { in: userIds } } });
      await prisma.betterAuthSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.betterAuthAccount.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.organization.deleteMany({ where: { name: { startsWith: TEST_EMAIL_PREFIX } } });
  }

  async function createUser(label: string, opts: { credential?: boolean; oauth?: boolean; role?: 'USER' | 'ADMIN' } = {}) {
    const user = await prisma.user.create({
      data: {
        email: email(label),
        name: 'Deletion Test',
        username: `del_${unique(label).replace(/[^a-z0-9_]/gi, '_').slice(0, 18)}`,
        emailVerified: true,
        role: opts.role ?? 'USER',
      },
    });

    if (opts.credential) {
      await prisma.betterAuthAccount.create({
        data: {
          id: generateId({ model: 'account' }),
          accountId: user.id,
          providerId: 'credential',
          userId: user.id,
          password: await hashPassword(PASSWORD),
        },
      });
    }

    if (opts.oauth) {
      await prisma.betterAuthAccount.create({
        data: {
          id: generateId({ model: 'account' }),
          accountId: `oauth-${user.id}`,
          providerId: 'google',
          userId: user.id,
          accessToken: 'access-token',
        },
      });
    }

    return user;
  }

  beforeAll(async () => {
    const dbModule = await import('../src/lib/db.js');
    const authModule = await import('../src/lib/better-auth.js');
    prisma = dbModule.prisma;
    const authContext = await authModule.auth.$context;
    hashPassword = authContext.password.hash;
    generateId = authContext.generateId;
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('refuses platform admin account deletion', async () => {
    const admin = await createUser('admin', { credential: true, role: 'ADMIN' });

    await expect(deleteUserAccount({
      userId: admin.id,
      confirmationEmail: admin.email,
      password: PASSWORD,
    })).rejects.toMatchObject({ code: 'ADMIN_ACCOUNT_DELETION_FORBIDDEN', status: 403 });
  });

  it('refuses deletion for the last organization admin', async () => {
    const org = await prisma.organization.create({ data: { name: `${TEST_EMAIL_PREFIX}-org-${unique('org')}` } });
    const user = await createUser('org-admin', { credential: true });
    await prisma.user.update({
      where: { id: user.id },
      data: { organizationId: org.id, organizationRole: 'ADMIN' },
    });

    await expect(deleteUserAccount({
      userId: user.id,
      confirmationEmail: user.email,
      password: PASSWORD,
    })).rejects.toMatchObject({ code: 'LAST_ORGANIZATION_ADMIN', status: 409 });
  });

  it('refuses credential accounts with a wrong password', async () => {
    const user = await createUser('wrong-password', { credential: true });

    await expect(deleteUserAccount({
      userId: user.id,
      confirmationEmail: user.email,
      password: 'bad-password',
    })).rejects.toMatchObject({ code: 'INVALID_PASSWORD', status: 400 });
  });

  it('refuses OAuth-only accounts with an invalid strong confirmation', async () => {
    const user = await createUser('oauth-confirmation', { oauth: true });

    await expect(deleteUserAccount({
      userId: user.id,
      confirmationEmail: 'someone-else@example.com',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_EMAIL_MISMATCH', status: 400 });
  });

  it('temporarily refuses OAuth-only accounts even with exact email confirmation', async () => {
    const user = await createUser('oauth-blocked', { oauth: true });

    await expect(deleteUserAccount({
      userId: user.id,
      confirmationEmail: user.email,
    })).rejects.toMatchObject({ code: 'OAUTH_ACCOUNT_DELETION_REQUIRES_EMAIL_TOKEN', status: 403 });
  });

  it('anonymizes public content, deletes private data, recalculates counters, and deletes the banner after commit', async () => {
    const victim = await createUser('full', { credential: true });
    const other = await createUser('other', { credential: true });
    const third = await createUser('third', { credential: true });

    const uploadDir = path.resolve(process.cwd(), 'public', 'uploads', 'banners');
    await fs.mkdir(uploadDir, { recursive: true });
    const bannerName = `${victim.id}-${Date.now()}.png`;
    const bannerPath = path.join(uploadDir, bannerName);
    await fs.writeFile(bannerPath, 'banner');
    await prisma.user.update({ where: { id: victim.id }, data: { bannerUrl: `/uploads/banners/${bannerName}` } });

    const published = await prisma.article.create({
      data: { slug: `${TEST_EMAIL_PREFIX}-${unique('published')}`, title: 'Published', status: 'PUBLISHED', authorId: victim.id },
    });
    const draft = await prisma.article.create({
      data: { slug: `${TEST_EMAIL_PREFIX}-${unique('draft')}`, title: 'Draft', status: 'DRAFT', authorId: victim.id },
    });
    const archived = await prisma.article.create({
      data: { slug: `${TEST_EMAIL_PREFIX}-${unique('archived')}`, title: 'Archived', status: 'ARCHIVED', authorId: victim.id },
    });
    await prisma.articleStats.create({ data: { articleId: published.id, savesAll: 1 } });

    await prisma.comment.create({ data: { articleId: published.id, userId: victim.id, content: 'public comment' } });
    await prisma.articleView.create({ data: { articleId: published.id, userId: victim.id } });
    const victimContribution = await prisma.articleContribution.create({
      data: { articleId: published.id, userId: victim.id, type: 'NUANCE', text: 'public contribution' },
    });
    const otherContribution = await prisma.articleContribution.create({
      data: { articleId: published.id, userId: other.id, type: 'SOURCE', text: 'source', sourceUrl: 'https://example.com' },
    });
    await prisma.articleContributionValidation.create({
      data: { contributionId: otherContribution.id, userId: victim.id, type: 'WELL_SOURCED' },
    });
    await prisma.articleContributionReport.create({
      data: { contributionId: otherContribution.id, reporterId: victim.id, reason: 'SPAM', reviewedById: victim.id },
    });

    await prisma.savedArticle.create({ data: { userId: victim.id, articleId: published.id } });
    await prisma.articleReaction.create({ data: { userId: victim.id, articleId: published.id, type: 'LIKE' } });
    await prisma.repost.create({ data: { userId: victim.id, articleId: published.id } });
    await prisma.follow.create({ data: { followerId: victim.id, followingId: other.id } });
    await prisma.follow.create({ data: { followerId: third.id, followingId: victim.id } });
    await prisma.user.update({ where: { id: other.id }, data: { followersCount: 99, followingCount: 99 } });
    await prisma.user.update({ where: { id: third.id }, data: { followersCount: 99, followingCount: 99 } });
    await prisma.articleOpinionPosition.create({
      data: { articleId: published.id, userId: victim.id, selectedPosition: 0.4, confirmedAt: new Date() },
    });
    const folder = await prisma.chatFolder.create({ data: { userId: victim.id, name: 'Private folder' } });
    const chatSession = await prisma.chatSession.create({ data: { userId: victim.id, topic: 'Private', folderId: folder.id } });
    await prisma.chatMessage.create({ data: { sessionId: chatSession.id, userId: victim.id, role: 'user', content: 'secret' } });
    await prisma.userUsage.create({ data: { userId: victim.id } });
    await prisma.betterAuthSession.create({
      data: { id: generateId({ model: 'session' }), token: `token-${unique('session')}`, userId: victim.id, expiresAt: new Date(Date.now() + 3600000) },
    });
    await prisma.betterAuthVerification.create({
      data: { id: generateId({ model: 'verification' }), identifier: `reset-password:${unique('token')}`, value: victim.id, expiresAt: new Date(Date.now() + 3600000) },
    });
    await prisma.betterAuthVerification.create({
      data: { id: generateId({ model: 'verification' }), identifier: `delete-account:${unique('token')}`, value: victim.id, expiresAt: new Date(Date.now() + 3600000) },
    });
    const unrelatedVerification = await prisma.betterAuthVerification.create({
      data: { id: generateId({ model: 'verification' }), identifier: `email-verification:${unique('token')}`, value: victim.id, expiresAt: new Date(Date.now() + 3600000) },
    });

    const bannerCleanup = vi.fn(async () => {
      expect(await prisma.user.findUnique({ where: { id: victim.id } })).toBeNull();
      await fs.unlink(bannerPath);
    });

    const result = await deleteUserAccount({
      userId: victim.id,
      confirmationEmail: victim.email,
      password: PASSWORD,
    }, { deleteBannerFile: bannerCleanup });

    expect(result.counts.publishedArticlesAnonymized).toBe(1);
    expect(result.counts.privateArticlesDeleted).toBe(2);
    expect(bannerCleanup).toHaveBeenCalledTimes(1);
    await expect(fs.access(bannerPath)).rejects.toBeTruthy();

    expect(await prisma.user.findUnique({ where: { id: victim.id } })).toBeNull();
    expect(await prisma.article.findUnique({ where: { id: published.id } })).toMatchObject({ authorId: null });
    expect(await prisma.article.findUnique({ where: { id: draft.id } })).toBeNull();
    expect(await prisma.article.findUnique({ where: { id: archived.id } })).toBeNull();
    expect(await prisma.comment.findFirst({ where: { articleId: published.id } })).toMatchObject({ userId: null });
    expect(await prisma.articleView.findFirst({ where: { articleId: published.id } })).toMatchObject({ userId: null });
    expect(await prisma.articleContribution.findUnique({ where: { id: victimContribution.id } })).toMatchObject({ userId: null });
    expect(await prisma.articleContribution.findUnique({ where: { id: otherContribution.id } })).toMatchObject({ needsRecalc: false, bridgingScore: 0 });
    expect(await prisma.articleContributionReport.findFirst({ where: { contributionId: otherContribution.id } })).toMatchObject({ reporterId: null, reviewedById: null });

    expect(await prisma.savedArticle.count({ where: { userId: victim.id } })).toBe(0);
    expect(await prisma.articleReaction.count({ where: { userId: victim.id } })).toBe(0);
    expect(await prisma.repost.count({ where: { userId: victim.id } })).toBe(0);
    expect(await prisma.follow.count({ where: { OR: [{ followerId: victim.id }, { followingId: victim.id }] } })).toBe(0);
    expect(await prisma.articleOpinionPosition.count({ where: { userId: victim.id } })).toBe(0);
    expect(await prisma.articleContributionValidation.count({ where: { userId: victim.id } })).toBe(0);
    expect(await prisma.chatSession.count({ where: { userId: victim.id } })).toBe(0);
    expect(await prisma.chatFolder.count({ where: { userId: victim.id } })).toBe(0);
    expect(await prisma.betterAuthAccount.count({ where: { userId: victim.id } })).toBe(0);
    expect(await prisma.betterAuthSession.count({ where: { userId: victim.id } })).toBe(0);
    expect(await prisma.betterAuthVerification.findUnique({ where: { id: unrelatedVerification.id } })).toMatchObject({ value: victim.id });
    expect(await prisma.betterAuthVerification.count({
      where: {
        value: victim.id,
        OR: [
          { identifier: { startsWith: 'reset-password:' } },
          { identifier: { startsWith: 'delete-account:' } },
          { identifier: { startsWith: 'delete-account-' } },
        ],
      },
    })).toBe(0);
    expect(await prisma.articleStats.findUnique({ where: { articleId: published.id } })).toMatchObject({ savesAll: 0 });
    expect(await prisma.user.findUnique({ where: { id: other.id } })).toMatchObject({ followersCount: 0, followingCount: 0 });
    expect(await prisma.user.findUnique({ where: { id: third.id } })).toMatchObject({ followersCount: 0, followingCount: 0 });
  });

  it('rolls back all database changes and does not delete files when the transaction fails', async () => {
    const victim = await createUser('rollback', { credential: true });
    const published = await prisma.article.create({
      data: { slug: `${TEST_EMAIL_PREFIX}-${unique('rollback-published')}`, title: 'Published', status: 'PUBLISHED', authorId: victim.id },
    });
    await prisma.comment.create({ data: { articleId: published.id, userId: victim.id, content: 'public comment' } });
    await prisma.savedArticle.create({ data: { userId: victim.id, articleId: published.id } });

    const bannerCleanup = vi.fn(async () => undefined);

    await expect(deleteUserAccount({
      userId: victim.id,
      confirmationEmail: victim.email,
      password: PASSWORD,
    }, {
      deleteBannerFile: bannerCleanup,
      afterPublicDataAnonymized: async () => {
        throw new AccountDeletionError(500, 'TEST_FAILURE');
      },
    })).rejects.toMatchObject({ code: 'TEST_FAILURE' });

    expect(bannerCleanup).not.toHaveBeenCalled();
    expect(await prisma.user.findUnique({ where: { id: victim.id } })).not.toBeNull();
    expect(await prisma.article.findUnique({ where: { id: published.id } })).toMatchObject({ authorId: victim.id });
    expect(await prisma.comment.findFirst({ where: { articleId: published.id } })).toMatchObject({ userId: victim.id });
    expect(await prisma.savedArticle.count({ where: { userId: victim.id } })).toBe(1);
  });
});
