import { PlanType } from "@prisma/client";
import { prisma } from "./db";

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
 * Vérifie et débite le compte de l'utilisateur pour une action donnée.
 * Gère aussi le reset journalier des crédits.
 */
export async function checkAndChargeUser(
    userId: string,
    action: keyof typeof COSTS
) {
    // 1. Récupération ou Création
    let usage = await prisma.userUsage.findUnique({
        where: { userId },
    });

    if (!usage) {
        usage = await prisma.userUsage.create({
            data: {
                userId,
                plan: PlanType.FREE,
                dailyCredits: DAILY_LIMITS[PlanType.FREE],
            },
        });
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
        });
    }

    // 3. Vérification des Fonds
    const cost = COSTS[action];

    if (usage.dailyCredits < cost) {
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
    });

    if (!usage) {
        // Should generally exist if called after checkAndChargeUser or login
        // but safe to create default if needed, or throw.
        // Assuming usage exists for simplification as strictly this function focuses on Quota
        // But let's be safe and adhere to "Atomic" principle by ensuring it exists.
        usage = await prisma.userUsage.create({
            data: {
                userId,
                plan: PlanType.FREE,
                dailyCredits: DAILY_LIMITS[PlanType.FREE],
            },
        });
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
    });

    return updatedUsage;
}
