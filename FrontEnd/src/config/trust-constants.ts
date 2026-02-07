// DUPLICATED FROM BACKEND for consistency
export const TRUST_SCORE_RANGES = {
    HIGH: { min: 80, max: 100 },
    MIXED: { min: 45, max: 79 },
    LOW: { min: 20, max: 44 },
    PROPAGANDA: { min: 0, max: 19 },
    UNKNOWN: { min: 0, max: 100 }
} as const;

export const EDITORIAL_WEIGHT = 0.6;
export const SEMANTIC_WEIGHT = 0.4;
