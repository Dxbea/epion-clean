
import { PoliticalBias } from "@prisma/client";

/**
 * Convertit un score numérique (-100 à +100) en Enum PoliticalBias.
 * Paliers:
 * -100 à -60 : EXTREME_LEFT
 *  -60 à -30 : LEFT
 *  -30 à -10 : CENTER_LEFT
 *  -10 à +10 : CENTER
 *  +10 à +30 : CENTER_RIGHT
 *  +30 à +60 : RIGHT
 *  +60 à +100: EXTREME_RIGHT
 */
export function getBiasFromScore(score: number): PoliticalBias {
    if (score < -60) return PoliticalBias.EXTREME_LEFT;
    if (score < -30) return PoliticalBias.LEFT;
    if (score < -10) return PoliticalBias.CENTER_LEFT;
    if (score <= 10) return PoliticalBias.CENTER;
    if (score <= 30) return PoliticalBias.CENTER_RIGHT;
    if (score <= 60) return PoliticalBias.RIGHT;
    return PoliticalBias.EXTREME_RIGHT;
}

/**
 * Convertit un Enum PoliticalBias en score numérique moyen.
 * Valeurs par défaut:
 * EXTREME_LEFT : -80
 * LEFT         : -45
 * CENTER_LEFT  : -20
 * CENTER       : 0
 * CENTER_RIGHT : 20
 * RIGHT        : 45
 * EXTREME_RIGHT: 80
 * SATIRE       : 0 (Cas spécial)
 * UNKNOWN      : 0
 */
export function getScoreFromBias(bias: PoliticalBias): number {
    switch (bias) {
        case PoliticalBias.EXTREME_LEFT: return -80;
        case PoliticalBias.LEFT: return -45;
        case PoliticalBias.CENTER_LEFT: return -20;
        case PoliticalBias.CENTER: return 0;
        case PoliticalBias.CENTER_RIGHT: return 20;
        case PoliticalBias.RIGHT: return 45;
        case PoliticalBias.EXTREME_RIGHT: return 80;
        case PoliticalBias.SATIRE: return 0;
        case PoliticalBias.UNKNOWN: return 0;
        default: return 0;
    }
}
