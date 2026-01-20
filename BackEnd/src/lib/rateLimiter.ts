import { prisma } from './db';

// Limite par défaut : 10 messages / jour pour les users gratuits
const MAX_DAILY_MESSAGES = 10;
// Limite pour les invités (IP)
const MAX_GUEST_DAILY_MESSAGES = 5;

/**
 * Vérifie et incrémente le quota journalier de manière atomique via une Transaction.
 * Supporte les IDs utilisateurs (string simple) et les IPs (préfixés par "ip:")
 */
export async function checkAndIncrement(identifier: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // IP usage logic for Guests
  if (identifier.startsWith('ip:')) {
    const dbKey = identifier.replace('ip:', '');
    const max = MAX_GUEST_DAILY_MESSAGES;

    return await prisma.$transaction(async (tx) => {
      const currentUsage = await tx.ipUsage.upsert({
        where: { ipAddress: dbKey },
        update: {},
        create: {
          ipAddress: dbKey,
          messageCount: 0,
          lastMessageAt: now,
        },
      });

      const lastAt = new Date(currentUsage.lastMessageAt);
      const lastDay = new Date(lastAt.getFullYear(), lastAt.getMonth(), lastAt.getDate());
      let count = currentUsage.messageCount;

      if (lastDay.getTime() < today.getTime()) {
        count = 0;
      }

      if (count >= max) {
        const err: any = new Error('Guest daily limit reached.');
        err.code = 'RateLimitExceeded';
        err.status = 429;
        throw err;
      }

      const newCount = count + 1;
      await tx.ipUsage.update({
        where: { ipAddress: dbKey },
        data: { messageCount: newCount, lastMessageAt: now },
      });

      return {
        allowed: true,
        remaining: max - newCount,
      };
    });
  }

  // Users: No rate limit (controlled by Billing or removed)
  // We return allowed=true to not break existing calls in comments/articles
  return {
    allowed: true,
    remaining: 9999,
  };
}
