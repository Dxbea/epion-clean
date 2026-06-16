import { APIError } from 'better-auth/api';

import { prisma } from './db.js';

const BETA_MODE = process.env.NODE_ENV !== 'test' && process.env.BETA_MODE === 'true';
const USERNAME_RX = /^[a-z0-9_]{3,20}$/i;

function normalizeInviteCode(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

export function normalizeSignupUsername(value: unknown) {
  return String(value || '').trim();
}

function badRequest(code: string, message: string): never {
  throw new APIError('BAD_REQUEST', {
    code,
    message,
  });
}

export async function prepareBetterAuthSignupUser(
  user: Record<string, unknown>,
  context: { body?: Record<string, unknown> } | null,
): Promise<{ data: Record<string, unknown> }> {
  const email = String(user.email || '').toLowerCase().trim();
  const username = normalizeSignupUsername(user.username);

  const existingEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingEmail) {
    return {
      data: {
        ...user,
        email,
        username,
      },
    };
  }

  if (!USERNAME_RX.test(username)) {
    badRequest('INVALID_USERNAME', 'Username is invalid.');
  }

  const existingUsername = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existingUsername) {
    badRequest('USERNAME_TAKEN', 'Username is already taken.');
  }

  const code = normalizeInviteCode(context?.body?.inviteCode);
  let inviteCodeId: string | null = null;

  if (BETA_MODE || code) {
    if (!code) badRequest('MISSING_INVITE_CODE', 'Invite code is required.');

    const invite = await prisma.inviteCode.findUnique({
      where: { code },
      select: { id: true, expiresAt: true, usedCount: true, maxUses: true },
    });

    if (!invite) badRequest('INVALID_INVITE_CODE', 'Invite code is invalid.');
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      badRequest('EXPIRED_INVITE_CODE', 'Invite code has expired.');
    }
    if (invite.usedCount >= invite.maxUses) {
      badRequest('INVITE_CODE_FULL', 'Invite code has reached its usage limit.');
    }

    const consumed = await prisma.inviteCode.updateMany({
      where: {
        id: invite.id,
        usedCount: { lt: invite.maxUses },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      data: { usedCount: { increment: 1 } },
    });

    if (consumed.count !== 1) {
      badRequest('INVITE_CODE_FULL', 'Invite code has reached its usage limit.');
    }

    inviteCodeId = invite.id;
  }

  return {
    data: {
      ...user,
      email,
      username,
      inviteCodeId,
    },
  };
}
