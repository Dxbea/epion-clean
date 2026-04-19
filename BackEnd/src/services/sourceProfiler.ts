function collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

export function resolveImmediateSourceDescription(
    ...candidates: Array<string | null | undefined>
): string | null {
    for (const candidate of candidates) {
        if (typeof candidate !== 'string') {
            continue;
        }

        const normalized = collapseWhitespace(candidate.replace(/^["']|["']$/g, ''));
        if (normalized) {
            return normalized;
        }
    }

    return null;
}
