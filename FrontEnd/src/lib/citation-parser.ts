/**
 * Interface représentant un segment de texte avec ses citations associées.
 */
export interface TextSegment {
    text: string;
    citationIds: number[];
}

/**
 * Parse un texte brut contenant des références de citations (ex: [1], [2][3])
 * et le découpe en segments logiques.
 * 
 * Un segment est défini comme une portion de texte se terminant par une ou plusieurs citations.
 * Le texte restant à la fin sans citation forme un dernier segment.
 * 
 * @param text Le texte brut à parser (Markdown ou Plain text avec marqueurs [x])
 * @returns Un tableau de TextSegment ordonné
 */
export function parseContentWithCitations(text: string): TextSegment[] {
    if (!text) return [];

    const segments: TextSegment[] = [];
    // Regex pour trouver les clusters de citations comme [1] ou [1][2]
    // Capture le cluster entier
    const citationClusterRegex = /((?:\[\d+\])+)/g;

    let lastIndex = 0;
    let match;

    while ((match = citationClusterRegex.exec(text)) !== null) {
        const cluster = match[0]; // ex: "[1]" ou "[1][2]"
        const clusterIndex = match.index;

        // Le texte du segment est tout ce qui se trouve entre la fin du dernier match et le début de celui-ci
        const segmentText = text.slice(lastIndex, clusterIndex);

        // Extraction des IDs individuels depuis le cluster
        const ids: number[] = [];
        const idRegex = /\[(\d+)\]/g;
        let idMatch;
        while ((idMatch = idRegex.exec(cluster)) !== null) {
            ids.push(parseInt(idMatch[1], 10));
        }

        segments.push({
            text: segmentText,
            citationIds: ids
        });

        lastIndex = clusterIndex + cluster.length;
    }

    // Ajouter le reste du texte s'il y en a
    if (lastIndex < text.length) {
        segments.push({
            text: text.slice(lastIndex),
            citationIds: []
        });
    }

    return segments;
}
