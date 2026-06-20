import fs from 'fs/promises';
import path from 'path';
import { Prisma, type PrismaClient } from '@prisma/client';

import { prisma } from './db.js';
import { auth } from './better-auth.js';

export type DeleteAccountInput = {
  userId: string;
  confirmationEmail?: string;
  password?: string;
};

type DeleteAccountDeps = {
  prismaClient?: PrismaClient;
  deleteBannerFile?: (bannerUrl: string | null, userId: string) => Promise<void>;
  afterPublicDataAnonymized?: (tx: Prisma.TransactionClient) => Promise<void>;
};

export type DeleteAccountResult = {
  deletedUserId: string;
  bannerDeleted: boolean;
  bannerDeleteError?: string;
  counts: {
    publishedArticlesAnonymized: number;
    privateArticlesDeleted: number;
    commentsAnonymized: number;
    articleViewsAnonymized: number;
    contributionsAnonymized: number;
    reportsReporterAnonymized: number;
    reportsReviewerAnonymized: number;
    savedArticlesDeleted: number;
    reactionsDeleted: number;
    repostsDeleted: number;
    followsDeleted: number;
    opinionPositionsDeleted: number;
    contributionValidationsDeleted: number;
    chatSessionsDeleted: number;
    chatFoldersDeleted: number;
    betterAuthSessionsDeleted: number;
    betterAuthAccountsDeleted: number;
    betterAuthVerificationsDeleted: number;
  };
};

export class AccountDeletionError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function assertExactEmailConfirmation(actual: string | undefined, expected: string) {
  if (!actual || actual.trim().toLowerCase() !== expected.toLowerCase()) {
    throw new AccountDeletionError(400, 'CONFIRMATION_EMAIL_MISMATCH');
  }
}

async function verifyCredentialPassword(userId: string, password: string | undefined, passwordHash: string) {
  if (!password) {
    throw new AccountDeletionError(400, 'PASSWORD_REQUIRED');
  }

  const ctx = await auth.$context;
  const valid = await ctx.password.verify({ hash: passwordHash, password });
  if (!valid) {
    throw new AccountDeletionError(400, 'INVALID_PASSWORD');
  }
}

export function resolveLocalBannerPath(bannerUrl: string | null, userId: string): string | null {
  if (!bannerUrl) return null;
  if (!bannerUrl.startsWith('/uploads/banners/')) return null;

  const filename = path.basename(bannerUrl);
  if (filename !== bannerUrl.slice('/uploads/banners/'.length)) return null;
  if (!filename.startsWith(`${userId}-`)) return null;
  if (!/^[a-z0-9_-]+-\d+\.(png|jpg|jpeg|webp)$/i.test(filename)) return null;

  const uploadDir = path.resolve(process.cwd(), 'public', 'uploads', 'banners');
  const filePath = path.resolve(uploadDir, filename);
  const relative = path.relative(uploadDir, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;

  return filePath;
}

export async function deleteLocalBannerFile(bannerUrl: string | null, userId: string): Promise<void> {
  const filePath = resolveLocalBannerPath(bannerUrl, userId);
  if (!filePath) return;

  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

async function recalculateAffectedBridgingScores(tx: Prisma.TransactionClient, contributionIds: string[]) {
  if (contributionIds.length === 0) return 0;

  const contributions = await tx.articleContribution.findMany({
    where: { id: { in: contributionIds }, status: 'ACTIVE' },
    select: {
      id: true,
      articleId: true,
      validations: {
        where: {
          type: { in: ['WELL_SOURCED', 'ADDS_NUANCE'] },
        },
        select: { userId: true },
      },
    },
  });

  let processed = 0;
  for (const contribution of contributions) {
    const validatorIds = contribution.validations.map((validation) => validation.userId);

    if (validatorIds.length <= 1) {
      await tx.articleContribution.update({
        where: { id: contribution.id },
        data: { bridgingScore: 0, needsRecalc: false },
      });
      processed++;
      continue;
    }

    const positions = await tx.articleOpinionPosition.findMany({
      where: {
        articleId: contribution.articleId,
        userId: { in: validatorIds },
        selectedPosition: { not: null },
      },
      select: { selectedPosition: true },
    });

    const values = positions
      .map((position) => position.selectedPosition)
      .filter((value): value is number => value !== null);

    if (values.length <= 1) {
      await tx.articleContribution.update({
        where: { id: contribution.id },
        data: { bridgingScore: 0, needsRecalc: false },
      });
      processed++;
      continue;
    }

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const bridgingScore = variance * Math.log(1 + values.length);

    await tx.articleContribution.update({
      where: { id: contribution.id },
      data: { bridgingScore, needsRecalc: false },
    });
    processed++;
  }

  return processed;
}

export async function deleteUserAccount(
  input: DeleteAccountInput,
  deps: DeleteAccountDeps = {},
): Promise<DeleteAccountResult> {
  const client = deps.prismaClient ?? prisma;
  const deleteBanner = deps.deleteBannerFile ?? deleteLocalBannerFile;

  let bannerUrl: string | null = null;
  const result = await client.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          role: true,
          bannerUrl: true,
          organizationId: true,
          organizationRole: true,
          betterAuthAccounts: {
            select: {
              id: true,
              providerId: true,
              password: true,
            },
          },
        },
      });

      if (!user) {
        throw new AccountDeletionError(404, 'USER_NOT_FOUND');
      }
      if (user.role === 'ADMIN') {
        throw new AccountDeletionError(403, 'ADMIN_ACCOUNT_DELETION_FORBIDDEN');
      }

      if (user.organizationId && user.organizationRole === 'ADMIN') {
        const otherOrgAdmins = await tx.user.count({
          where: {
            organizationId: user.organizationId,
            organizationRole: 'ADMIN',
            id: { not: user.id },
          },
        });
        if (otherOrgAdmins === 0) {
          throw new AccountDeletionError(409, 'LAST_ORGANIZATION_ADMIN');
        }
      }

      assertExactEmailConfirmation(input.confirmationEmail, user.email);

      const credentialAccount = user.betterAuthAccounts.find(
        (account) => account.providerId === 'credential' && Boolean(account.password),
      );
      if (credentialAccount?.password) {
        await verifyCredentialPassword(user.id, input.password, credentialAccount.password);
      } else {
        throw new AccountDeletionError(403, 'OAUTH_ACCOUNT_DELETION_REQUIRES_EMAIL_TOKEN');
      }

      bannerUrl = user.bannerUrl;

      const [savedRows, followRows, validationRows] = await Promise.all([
        tx.savedArticle.findMany({ where: { userId: user.id }, select: { articleId: true } }),
        tx.follow.findMany({
          where: { OR: [{ followerId: user.id }, { followingId: user.id }] },
          select: { followerId: true, followingId: true },
        }),
        tx.articleContributionValidation.findMany({
          where: { userId: user.id },
          select: { contributionId: true },
        }),
      ]);

      const affectedArticleIds = unique(savedRows.map((row) => row.articleId));
      const affectedUserIds = unique(
        followRows.flatMap((row) => [row.followerId, row.followingId]).filter((id) => id !== user.id),
      );
      const affectedContributionIds = unique(validationRows.map((row) => row.contributionId));

      const privateArticlesDeleted = await tx.article.deleteMany({
        where: { authorId: user.id, status: { in: ['DRAFT', 'ARCHIVED'] } },
      });

      const publishedArticlesAnonymized = await tx.article.updateMany({
        where: { authorId: user.id, status: 'PUBLISHED' },
        data: { authorId: null },
      });

      const [commentsAnonymized, articleViewsAnonymized, contributionsAnonymized, reportsReporterAnonymized, reportsReviewerAnonymized] = await Promise.all([
        tx.comment.updateMany({ where: { userId: user.id }, data: { userId: null } }),
        tx.articleView.updateMany({ where: { userId: user.id }, data: { userId: null } }),
        tx.articleContribution.updateMany({ where: { userId: user.id }, data: { userId: null } }),
        tx.articleContributionReport.updateMany({ where: { reporterId: user.id }, data: { reporterId: null } }),
        tx.articleContributionReport.updateMany({ where: { reviewedById: user.id }, data: { reviewedById: null } }),
      ]);

      if (deps.afterPublicDataAnonymized) {
        await deps.afterPublicDataAnonymized(tx);
      }

      const contributionValidationsDeleted = await tx.articleContributionValidation.deleteMany({ where: { userId: user.id } });
      if (affectedContributionIds.length > 0) {
        await tx.articleContribution.updateMany({
          where: { id: { in: affectedContributionIds } },
          data: { needsRecalc: true },
        });
      }

      const [opinionPositionsDeleted, reactionsDeleted, repostsDeleted, savedArticlesDeleted, followsDeleted] = await Promise.all([
        tx.articleOpinionPosition.deleteMany({ where: { userId: user.id } }),
        tx.articleReaction.deleteMany({ where: { userId: user.id } }),
        tx.repost.deleteMany({ where: { userId: user.id } }),
        tx.savedArticle.deleteMany({ where: { userId: user.id } }),
        tx.follow.deleteMany({ where: { OR: [{ followerId: user.id }, { followingId: user.id }] } }),
      ]);

      await recalculateAffectedBridgingScores(tx, affectedContributionIds);

      for (const affectedUserId of affectedUserIds) {
        const [followersCount, followingCount] = await Promise.all([
          tx.follow.count({ where: { followingId: affectedUserId } }),
          tx.follow.count({ where: { followerId: affectedUserId } }),
        ]);
        await tx.user.update({
          where: { id: affectedUserId },
          data: { followersCount, followingCount },
        });
      }

      for (const articleId of affectedArticleIds) {
        const savesAll = await tx.savedArticle.count({ where: { articleId } });
        await tx.articleStats.updateMany({
          where: { articleId },
          data: { savesAll },
        });
      }

      const chatSessionsDeleted = await tx.chatSession.deleteMany({ where: { userId: user.id } });
      await tx.chatMessage.deleteMany({ where: { userId: user.id } });
      const chatFoldersDeleted = await tx.chatFolder.deleteMany({ where: { userId: user.id } });
      await tx.userUsage.deleteMany({ where: { userId: user.id } });

      const betterAuthVerificationsDeleted = await tx.betterAuthVerification.deleteMany({
        where: {
          value: user.id,
          OR: [
            { identifier: { startsWith: 'reset-password:' } },
            { identifier: { startsWith: 'delete-account:' } },
            { identifier: { startsWith: 'delete-account-' } },
          ],
        },
      });
      const betterAuthSessionsDeleted = await tx.betterAuthSession.deleteMany({ where: { userId: user.id } });
      const betterAuthAccountsDeleted = await tx.betterAuthAccount.deleteMany({ where: { userId: user.id } });

      await tx.user.delete({ where: { id: user.id } });

      return {
        deletedUserId: user.id,
        bannerDeleted: false,
        counts: {
          publishedArticlesAnonymized: publishedArticlesAnonymized.count,
          privateArticlesDeleted: privateArticlesDeleted.count,
          commentsAnonymized: commentsAnonymized.count,
          articleViewsAnonymized: articleViewsAnonymized.count,
          contributionsAnonymized: contributionsAnonymized.count,
          reportsReporterAnonymized: reportsReporterAnonymized.count,
          reportsReviewerAnonymized: reportsReviewerAnonymized.count,
          savedArticlesDeleted: savedArticlesDeleted.count,
          reactionsDeleted: reactionsDeleted.count,
          repostsDeleted: repostsDeleted.count,
          followsDeleted: followsDeleted.count,
          opinionPositionsDeleted: opinionPositionsDeleted.count,
          contributionValidationsDeleted: contributionValidationsDeleted.count,
          chatSessionsDeleted: chatSessionsDeleted.count,
          chatFoldersDeleted: chatFoldersDeleted.count,
          betterAuthSessionsDeleted: betterAuthSessionsDeleted.count,
          betterAuthAccountsDeleted: betterAuthAccountsDeleted.count,
          betterAuthVerificationsDeleted: betterAuthVerificationsDeleted.count,
        },
      } satisfies DeleteAccountResult;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  try {
    await deleteBanner(bannerUrl, result.deletedUserId);
    return { ...result, bannerDeleted: Boolean(resolveLocalBannerPath(bannerUrl, result.deletedUserId)) };
  } catch (error) {
    return {
      ...result,
      bannerDeleted: false,
      bannerDeleteError: error instanceof Error ? error.message : String(error),
    };
  }
}
