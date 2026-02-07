import { Reliability } from "@prisma/client";

export const TRUST_SCORE_RANGES = {
    [Reliability.HIGH]: { min: 80, max: 100 },
    [Reliability.MIXED]: { min: 45, max: 79 },
    [Reliability.LOW]: { min: 20, max: 44 },
    [Reliability.PROPAGANDA]: { min: 0, max: 19 },
    [Reliability.UNKNOWN]: { min: 0, max: 100 }
} as const;

export const EDITORIAL_WEIGHT = 0.6;
export const SEMANTIC_WEIGHT = 0.4;
