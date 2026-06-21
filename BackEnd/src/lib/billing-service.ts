import { PlanType, Prisma, Role } from "@prisma/client";
import { prisma } from "./db.js";
import { logger } from "./logger.js";

export const COSTS = {
    CHAT_FAST: 10,
    CHAT_WEB_STANDARD: 350,
    CHAT_WEB_DEEP: 1000,
    FACT_CHECK_PREMIUM: 500,  // Epion 2.0: Tavily + GPT + Mistral
    CREATE_ARTICLE: 0,
};

export const DAILY_LIMITS: Record<PlanType, number> = {
    [PlanType.FREE]: 700,
    [PlanType.READER]: 5000,
    [PlanType.PREMIUM]: 45000,
};

export const WEEKLY_ARTICLE_LIMITS: Record<PlanType, number> = {
    [PlanType.FREE]: 0,
    [PlanType.READER]: 1,
    [PlanType.PREMIUM]: 10,
};

export type ArticleQuotaReservation = {
    userId: string;
    consumed: boolean;
    articleQuotaResetAt: Date | null;
};

/**
 * NEW: Vérifie SEULEMENT si l'utilisateur a assez de crédits (READ-ONLY).
 * Ne débite PAS. À utiliser avant un stream pour éviter le débit prématuré.
 */
export async function hasSufficientCredits(
    userId: string,
    action: keyof typeof COSTS
): Promise<boolean> {
    let usage = await prisma.userUsage.findUnique({
        where: { userId },
        include: { user: { select: { role: true } } },
    });

    if (!usage) {
        usage = await prisma.userUsage.create({
            data: {
                userId,
                plan: PlanType.FREE,
                dailyCredits: DAILY_LIMITS[PlanType.FREE],
            },
            include: { user: { select: { role: true } } },
        });
    }

    // ADMIN BYPASS
    if (usage.user.role === Role.ADMIN) {
        return true;
    }

    // Lazy Reset
    const now = new Date();
    const lastReset = new Date(usage.lastResetAt);
    const isDifferentDay =
        now.getFullYear() !== lastReset.getFullYear() ||
        now.getMonth() !== lastReset.getMonth() ||
        now.getDate() !== lastReset.getDate();

    if (isDifferentDay) {
        const dailyLimit = DAILY_LIMITS[usage.plan];
        usage = await prisma.userUsage.update({
            where: { userId },
            data: {
                dailyCredits: dailyLimit,
                lastResetAt: now,
            },
            include: { user: { select: { role: true } } },
        });
    }

    const cost = COSTS[action];
    const isSufficient = usage.dailyCredits >= cost;

    if (!isSufficient && process.env.NODE_ENV === 'production') {
        logger.warn('Insufficient credits check', { userId, action, cost, available: usage.dailyCredits });
    }

    return isSufficient;
}

/**
 * Alias requested for "Check -> Service -> Settlement" pattern.
 * Checks funds without charging (Read-Only).
 */
export const hasSufficientFunds = hasSufficientCredits;

/**
 * NEW: Débite l'utilisateur APRÈS succès du stream.
 * Suppose que hasSufficientCredits a déjà été appelé.
 */
export async function chargeUser(
    userId: string,
    action: keyof typeof COSTS
) {
    const usage = await prisma.userUsage.findUnique({
        where: { userId },
        include: { user: { select: { role: true } } },
    });

    if (!usage) {
        throw new Error('User usage not found');
    }

    // ADMIN BYPASS
    if (usage.user.role === Role.ADMIN) {
        return usage;
    }

    const cost = COSTS[action];

    // Double-check funds (safety)
    if (usage.dailyCredits < cost) {
        throw new Error('INSUFFICIENT_FUNDS_AT_CHARGE_TIME');
    }

    const debit = await prisma.userUsage.updateMany({
        where: {
            userId,
            dailyCredits: { gte: cost },
        },
        data: {
            dailyCredits: {
                decrement: cost,
            },
        },
    });

    if (debit.count !== 1) {
        throw new Error('INSUFFICIENT_FUNDS_AT_CHARGE_TIME');
    }

    const updatedUsage = await prisma.userUsage.findUnique({
        where: { userId },
        include: { user: { select: { role: true } } },
    });

    if (!updatedUsage) {
        throw new Error('User usage not found after charge');
    }

    return updatedUsage;
}

/**
 * LEGACY: Keep for backward compatibility (non-streaming routes).
 * Vérifie et débite le compte de l'utilisateur pour une action donnée.
 */
export async function checkAndChargeUser(
    userId: string,
    action: keyof typeof COSTS
) {
    // 1. Récupération ou Création
    let usage = await prisma.userUsage.findUnique({
        where: { userId },
        include: { user: { select: { role: true } } }, // Fetch Role
    });

    if (!usage) {
        // Fallback create (rare)
        const newUsage = await prisma.userUsage.create({
            data: {
                userId,
                plan: PlanType.FREE,
                dailyCredits: DAILY_LIMITS[PlanType.FREE],
            },
            include: { user: { select: { role: true } } },
        });
        usage = newUsage;
    }

    // 🔥 ADMIN BYPASS
    if (usage.user.role === Role.ADMIN) {
        return usage; // No charge, no limits
    }

    // 2. Lazy Reset (Crédits Journaliers)
    const now = new Date();
    const lastReset = new Date(usage.lastResetAt);

    const isDifferentDay =
        now.getFullYear() !== lastReset.getFullYear() ||
        now.getMonth() !== lastReset.getMonth() ||
        now.getDate() !== lastReset.getDate();

    if (isDifferentDay) {
        const dailyLimit = DAILY_LIMITS[usage.plan];
        usage = await prisma.userUsage.update({
            where: { userId },
            data: {
                dailyCredits: dailyLimit,
                lastResetAt: now,
            },
            include: { user: { select: { role: true } } },
        });
    }

    // 3. Vérification des Fonds
    const cost = COSTS[action];

    if (usage.dailyCredits < cost) {
        logger.warn('Failed billing attempt: Insufficient funds', { userId, action, cost, available: usage.dailyCredits });
        if (action.includes("WEB")) {
            throw new Error("INSUFFICIENT_FUNDS_WEB");
        } else {
            throw new Error("INSUFFICIENT_FUNDS_TOTAL");
        }
    }

    // 4. Exécution (Débit)
    const debit = await prisma.userUsage.updateMany({
        where: {
            userId,
            dailyCredits: { gte: cost },
        },
        data: {
            dailyCredits: {
                decrement: cost,
            },
        },
    });

    if (debit.count !== 1) {
        throw new Error(action.includes("WEB") ? "INSUFFICIENT_FUNDS_WEB" : "INSUFFICIENT_FUNDS_TOTAL");
    }

    const updatedUsage = await prisma.userUsage.findUnique({
        where: { userId },
        include: { user: { select: { role: true } } },
    });

    if (!updatedUsage) {
        throw new Error('User usage not found after charge');
    }

    return updatedUsage;
}

async function getOrCreateUsage(userId: string) {
    let usage = await prisma.userUsage.findUnique({
        where: { userId },
        include: { user: { select: { role: true } } },
    });

    if (!usage) {
        try {
            usage = await prisma.userUsage.create({
                data: {
                    userId,
                    plan: PlanType.FREE,
                    dailyCredits: DAILY_LIMITS[PlanType.FREE],
                },
                include: { user: { select: { role: true } } },
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                usage = await prisma.userUsage.findUnique({
                    where: { userId },
                    include: { user: { select: { role: true } } },
                });
            }
            if (!usage) {
                throw error;
            }
        }
    }

    return usage;
}

/**
 * Réserve atomiquement une place dans le quota hebdomadaire d'articles.
 * La réservation doit être relâchée si aucun article n'est finalement créé.
 */
export async function reserveArticleQuota(userId: string): Promise<ArticleQuotaReservation> {
    let usage = await getOrCreateUsage(userId);

    // 🔥 ADMIN BYPASS
    if (usage.user.role === Role.ADMIN) {
        return {
            userId,
            consumed: false,
            articleQuotaResetAt: null,
        };
    }

    // 1. Lazy Reset (Quota Hebdo)
    const now = new Date();
    const nextReset = new Date(usage.articleQuotaResetAt);
    nextReset.setDate(nextReset.getDate() + 7);

    if (now > nextReset) {
        await prisma.userUsage.updateMany({
            where: {
                userId,
                articleQuotaResetAt: usage.articleQuotaResetAt,
            },
            data: {
                articlesCreated: 0,
                articleQuotaResetAt: now, // New cycle starts now
            },
        });

        usage = await getOrCreateUsage(userId);
    }

    // 2. Vérification
    const limit = WEEKLY_ARTICLE_LIMITS[usage.plan];

    if (limit <= 0) {
        throw new Error("WEEKLY_QUOTA_EXCEEDED");
    }

    // 3. Incrémentation atomique avec condition de quota.
    const reservation = await prisma.userUsage.updateMany({
        where: {
            userId,
            articleQuotaResetAt: usage.articleQuotaResetAt,
            articlesCreated: { lt: limit },
        },
        data: {
            articlesCreated: {
                increment: 1,
            },
        },
    });

    if (reservation.count !== 1) {
        const latestUsage = await getOrCreateUsage(userId);
        if (latestUsage.articleQuotaResetAt.getTime() !== usage.articleQuotaResetAt.getTime()) {
            return reserveArticleQuota(userId);
        }

        throw new Error("WEEKLY_QUOTA_EXCEEDED");
    }

    return {
        userId,
        consumed: true,
        articleQuotaResetAt: usage.articleQuotaResetAt,
    };
}

export const checkArticleQuota = reserveArticleQuota;

export async function releaseArticleQuota(reservation: ArticleQuotaReservation | null | undefined) {
    if (!reservation?.consumed || !reservation.articleQuotaResetAt) {
        return;
    }

    await prisma.userUsage.updateMany({
        where: {
            userId: reservation.userId,
            articleQuotaResetAt: reservation.articleQuotaResetAt,
            articlesCreated: { gt: 0 },
        },
        data: {
            articlesCreated: {
                decrement: 1,
            },
        },
    });
}
