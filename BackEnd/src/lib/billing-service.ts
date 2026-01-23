import { PlanType, Role } from "@prisma/client";
import { prisma } from "./db";
import { logger } from "./logger";

export const COSTS = {
    CHAT_FAST: 10,
    CHAT_WEB_STANDARD: 350,
    CHAT_WEB_DEEP: 1000,
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

    // Debit
    const updatedUsage = await prisma.userUsage.update({
        where: { userId },
        data: {
            dailyCredits: {
                decrement: cost,
            },
        },
        include: { user: { select: { role: true } } },
    });

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
    const updatedUsage = await prisma.userUsage.update({
        where: { userId },
        data: {
            dailyCredits: {
                decrement: cost,
            },
        },
        include: { user: { select: { role: true } } },
    });

    return updatedUsage;
}

/**
 * Vérifie le quota hebdomadaire de création d'articles.
 * Gère aussi le reset hebdomadaire.
 */
export async function checkArticleQuota(userId: string) {
    let usage = await prisma.userUsage.findUnique({
        where: { userId },
        include: { user: { select: { role: true } } },
    });

    if (!usage) {
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
        return usage; // No quota check
    }

    // 1. Lazy Reset (Quota Hebdo)
    const now = new Date();
    const nextReset = new Date(usage.articleQuotaResetAt);
    nextReset.setDate(nextReset.getDate() + 7);

    if (now > nextReset) {
        usage = await prisma.userUsage.update({
            where: { userId },
            data: {
                articlesCreated: 0,
                articleQuotaResetAt: now, // New cycle starts now
            },
            include: { user: { select: { role: true } } },
        });
    }

    // 2. Vérification
    const limit = WEEKLY_ARTICLE_LIMITS[usage.plan];

    if (usage.articlesCreated >= limit) {
        throw new Error("WEEKLY_QUOTA_EXCEEDED");
    }

    // 3. Incrémentation
    const updatedUsage = await prisma.userUsage.update({
        where: { userId },
        data: {
            articlesCreated: {
                increment: 1,
            },
        },
        include: { user: { select: { role: true } } },
    });

    return updatedUsage;
}
