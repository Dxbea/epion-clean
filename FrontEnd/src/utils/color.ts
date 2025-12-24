
/**
 * Generates a consistent pastel/cool color (Hex or HSL) from a string.
 * Focused on Teal, Blue, Sea Green tones.
 */
export function stringToColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Limit Hue to strict cool tones: 150 (Green-Teal) to 210 (Blue)
    // 150: Green-Teal
    // 180: Cyan/Teal
    // 210: Blue
    const minHue = 150;
    const maxHue = 210;
    const range = maxHue - minHue;

    const h = (Math.abs(hash) % range) + minHue;

    // Saturation: 40-60% (Subtle but visible)
    const s = 40 + (Math.abs(hash >> 8) % 20);

    // Lightness: 75-85% (Pastel, guarantees readable dark text/white text depending on contrast)
    // User asked for "tons pastels".
    const l = 75 + (Math.abs(hash >> 16) % 10);

    return `hsl(${h}, ${s}%, ${l}%)`;
}
