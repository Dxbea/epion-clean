import type { PrismaClient } from '@prisma/client';
import type { EditorialVerificationRuntimeFlags } from './runtime-flags.js';

export type EditorialVerificationBudgetKind = 'VERIFICATION' | 'SERPER' | 'MISTRAL' | 'OPENAI';

export class EditorialVerificationBudgetExceededError extends Error {
  readonly resetAt: Date;
  constructor(readonly kind: EditorialVerificationBudgetKind, now: Date) {
    super(`Editorial verification daily ${kind.toLowerCase()} budget exhausted`);
    this.name = 'EditorialVerificationBudgetExceededError';
    this.resetAt = nextUtcDay(now);
  }
}

export class EditorialVerificationBudgetService {
  constructor(
    private readonly client: PrismaClient,
    private readonly flags: EditorialVerificationRuntimeFlags,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async consume(kind: EditorialVerificationBudgetKind, units = 1): Promise<void> {
    if (!Number.isInteger(units) || units < 1) throw new Error('Budget units must be a positive integer');
    const now = this.now();
    const day = utcDay(now);
    const { field, limit, costMicros } = budgetDefinition(kind, this.flags);
    if (limit < units || this.flags.maxEstimatedCostMicrosPerDay < costMicros * units) {
      throw new EditorialVerificationBudgetExceededError(kind, now);
    }
    await this.client.editorialVerificationDailyUsage.upsert({
      where: { day },
      create: { day },
      update: {},
    });
    const reserved = await this.client.editorialVerificationDailyUsage.updateMany({
      where: {
        day,
        [field]: { lte: limit - units },
        estimatedCostMicros: { lte: this.flags.maxEstimatedCostMicrosPerDay - costMicros * units },
      },
      data: {
        [field]: { increment: units },
        estimatedCostMicros: { increment: costMicros * units },
      },
    });
    if (reserved.count !== 1) throw new EditorialVerificationBudgetExceededError(kind, now);
  }
}

function budgetDefinition(kind: EditorialVerificationBudgetKind, flags: EditorialVerificationRuntimeFlags) {
  switch (kind) {
    case 'VERIFICATION': return { field: 'verificationCount' as const, limit: flags.maxVerificationsPerDay, costMicros: 0 };
    case 'SERPER': return { field: 'serperRequestCount' as const, limit: flags.maxSerperRequestsPerDay, costMicros: flags.serperEstimatedCostMicros };
    case 'MISTRAL': return { field: 'mistralRequestCount' as const, limit: flags.maxMistralRequestsPerDay, costMicros: flags.mistralEstimatedCostMicros };
    case 'OPENAI': return { field: 'openaiRequestCount' as const, limit: flags.maxOpenAIRequestsPerDay, costMicros: flags.openAIEstimatedCostMicros };
  }
}

function utcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function nextUtcDay(value: Date): Date {
  const day = utcDay(value);
  day.setUTCDate(day.getUTCDate() + 1);
  return day;
}
