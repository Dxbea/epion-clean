// Frontend/src/lib/color-utils.ts

// PALETTE VIVID (Couleurs vives type néon/saturées)
const VIVID_RED_START = '#EF4444';    // Red 500
const VIVID_RED_END = '#F87171';      // Red 400

const VIVID_ORANGE_START = '#F97316'; // Orange 500
const VIVID_ORANGE_END = '#FB923C';   // Orange 400

const VIVID_YELLOW_START = '#EAB308'; // Yellow 500 (NEW: Medium)
const VIVID_YELLOW_END = '#FACC15';   // Yellow 400

const VIVID_GREEN_START = '#10B981';  // Emerald 500
const VIVID_GREEN_END = '#34D399';    // Emerald 400

/**
 * Retourne la couleur principale (Hex) pour un score donné.
 * Utilisé pour le texte coloré simple.
 *
 * PALIERS V2 (4 Niveaux) :
 * 0 - 24   : Critique (Rouge)
 * 25 - 49  : Faible (Orange)
 * 50 - 74  : Moyen (Jaune/Ambre)
 * 75 - 100 : Fiable (Vert)
 */
export function getScoreColor(score: number): string {
    const s = Math.max(0, Math.min(100, score));
    if (s < 25) return VIVID_RED_START;
    if (s < 50) return VIVID_ORANGE_START;
    if (s < 75) return VIVID_YELLOW_START;
    return VIVID_GREEN_START;
}

/**
 * Retourne un gradient linéaire saturé (Style Piliers).
 */
export function getVividGradient(score: number): string {
    const s = Math.max(0, Math.min(100, score));

    if (s < 25) {
        return `linear-gradient(90deg, ${VIVID_RED_START}, ${VIVID_RED_END})`;
    } else if (s < 50) {
        return `linear-gradient(90deg, ${VIVID_ORANGE_START}, ${VIVID_ORANGE_END})`;
    } else if (s < 75) {
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
