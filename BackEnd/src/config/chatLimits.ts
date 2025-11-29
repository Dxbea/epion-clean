// BackEnd/src/config/chatLimits.ts

export type PlanId = 'FREE' | 'PLUS' | 'PRO';

export type ChatLimits = {
  maxMessageChars: number;
  maxMessagesPerUser: number;
  maxSessionsPerUser: number;
  maxFilesPerMessage: number;
  maxFileSizeMB: number;
};

export const CHAT_LIMITS: Record<PlanId, ChatLimits> = {
  FREE: {
    maxMessageChars: 8_000,
    maxMessagesPerUser: 10_000,
    maxSessionsPerUser: 200,
    maxFilesPerMessage: 4,
    maxFileSizeMB: 10,
  },
  PLUS: {
    maxMessageChars: 16_000,
    maxMessagesPerUser: 50_000,
    maxSessionsPerUser: 500,
    maxFilesPerMessage: 10,
    maxFileSizeMB: 25,
  },
  PRO: {
    maxMessageChars: 32_000,
    maxMessagesPerUser: 200_000,
    maxSessionsPerUser: 2_000,
    maxFilesPerMessage: 20,
    maxFileSizeMB: 50,
  },
};

export const DEFAULT_PLAN: PlanId = 'FREE';
