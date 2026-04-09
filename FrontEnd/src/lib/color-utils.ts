// Frontend/src/lib/color-utils.ts

// PALETTE VIVID (Couleurs vives type néon/saturées)
export const VIVID_RED_START = '#EF4444';    // Red 500
export const VIVID_RED_END = '#F87171';      // Red 400

export const VIVID_ORANGE_START = '#F97316'; // Orange 500
export const VIVID_ORANGE_END = '#FB923C';   // Orange 400

export const VIVID_YELLOW_START = '#EAB308'; // Yellow 500 (NEW: Medium)
export const VIVID_YELLOW_END = '#FACC15';   // Yellow 400

export const VIVID_GREEN_START = '#10B981';  // Emerald 500
export const VIVID_GREEN_END = '#34D399';    // Emerald 400

import { TRUST_SCORE_RANGES } from "../config/trust-constants";

/**
 * Retourne la couleur principale (Hex) pour un score donné.
 * Utilisé pour le texte coloré simple.
 *
 * PALIERS V2 (Alignés avec Backend) :
 * < 20     : Critique (Rouge) - Propaganda
 * 20 - 44  : Faible (Orange) - Low
 * 45 - 79  : Moyen (Jaune/Ambre) - Mixed
 * 80 - 100 : Fiable (Vert) - High
 */
export function getScoreColor(score: number): string {
    const s = Math.max(0, Math.min(100, score));

    if (s < TRUST_SCORE_RANGES.LOW.min) return VIVID_RED_START; // Propaganda (0-19)
    if (s < TRUST_SCORE_RANGES.MIXED.min) return VIVID_ORANGE_START; // Low (20-44)
    if (s < TRUST_SCORE_RANGES.HIGH.min) return VIVID_YELLOW_START; // Mixed (45-79)
    return VIVID_GREEN_START; // High (80+)
}

/**
 * Retourne le couple de couleurs (Start, End) pour un score donné.
 * Utile pour les gradients SVG ou complexes.
 */
export function getScoreColorPair(score: number): { start: string; end: string } {
    const s = Math.max(0, Math.min(100, score));

    if (s < TRUST_SCORE_RANGES.LOW.min) return { start: VIVID_RED_START, end: VIVID_RED_END };
    if (s < TRUST_SCORE_RANGES.MIXED.min) return { start: VIVID_ORANGE_START, end: VIVID_ORANGE_END };
    if (s < TRUST_SCORE_RANGES.HIGH.min) return { start: VIVID_YELLOW_START, end: VIVID_YELLOW_END };
    return { start: VIVID_GREEN_START, end: VIVID_GREEN_END };
}

/**
 * Retourne un gradient linéaire saturé (Style Piliers).
 */
export function getVividGradient(score: number): string {
    const s = Math.max(0, Math.min(100, score));

    if (s < TRUST_SCORE_RANGES.LOW.min) {
        return `linear-gradient(90deg, ${VIVID_RED_START}, ${VIVID_RED_END})`;
    } else if (s < TRUST_SCORE_RANGES.MIXED.min) {
        return `linear-gradient(90deg, ${VIVID_ORANGE_START}, ${VIVID_ORANGE_END})`;
    } else if (s < TRUST_SCORE_RANGES.HIGH.min) {
        return `linear-gradient(90deg, ${VIVID_YELLOW_START}, ${VIVID_YELLOW_END})`;
    } else {
        return `linear-gradient(90deg, ${VIVID_GREEN_START}, ${VIVID_GREEN_END})`;
    }
}

/**
 * Alias pour la compatibilité avec le code existant qui appelle getScoreGradient
 */
export function getScoreGradient(score: number): string {
    return getVividGradient(score);
}

/**
 * Style pour les Badges (Pillules)
 * Fond dégradé vif + Texte Blanc + Pas de bordure glass
 */
export function getBadgeStyle(score: number): React.CSSProperties {
    return {
        backgroundImage: getVividGradient(score),
        color: '#FFFFFF',
        fontWeight: 700,
        border: 'none', // Pas de bordure
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)', // Ombre légère
        padding: '2px 8px',
        borderRadius: '9999px'
    };
}

/**
 * Helper pour éclaircir une couleur (Utilisé par createGlossyGradient si besoin)
 */
function adjustBrightness(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
}

/**
 * Gardé pour la compatibilité avec les MiniGauges de SourceCard qui utilisent des hex fixes
 */
export function createGlossyGradient(hexColor: string): string {
    const lighterColor = adjustBrightness(hexColor, 20);
    return `linear-gradient(135deg, ${hexColor} 0%, ${lighterColor} 100%)`;
}

// Deprecated but kept to prevent break
export function getScoreColorWithOpacity(score: number, opacity: number = 0.15): string {
    const hex = getScoreColor(score);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * NOUVEAU GRADIENT EPION (Soft Tech)
 * Plus doux, moins 'électrique'.
 * Départ : Sky-500 (#0EA5E9) - Un bleu ciel rassurant, pas roi.
 * Milieu : Teal-400 (#2DD4BF) - La touche technologique.
 * Fin : Emerald-400 (#34D399) - Un vert menthe plus doux.
 */
export function getEpionBrandGradient(): string {
    return 'linear-gradient(90deg, #0EA5E9 0%, #2DD4BF 50%, #34D399 100%)';
}

/**
 * Helper pour appliquer le gradient sur du texte (masking).
 * @returns React.CSSProperties
 */
export function getGradientTextStyle(): React.CSSProperties {
    return {
        backgroundImage: getEpionBrandGradient(),
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        display: 'inline-block',
    };
}
