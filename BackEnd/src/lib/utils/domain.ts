const SPECIAL_SECOND_LEVEL_SUFFIXES = new Set([
    'ac.uk',
    'co.jp',
    'co.uk',
    'com.au',
    'com.br',
    'com.mx',
    'gov.au',
    'gov.uk',
    'gouv.fr',
    'net.au',
    'org.au',
    'org.uk',
]);

export function normalizeHostname(input: string): string {
    const rawValue = input.trim().toLowerCase();
    const hostname = rawValue.includes('://')
        ? new URL(rawValue).hostname.toLowerCase()
        : rawValue;

    return hostname.replace(/^www\./, '');
}

export function getRootDomain(input: string): string {
    const normalized = normalizeHostname(input);
    const parts = normalized.split('.').filter(Boolean);

    if (parts.length <= 2) {
        return normalized;
    }

    const lastTwo = parts.slice(-2).join('.');
    if (SPECIAL_SECOND_LEVEL_SUFFIXES.has(lastTwo)) {
        return parts.slice(-3).join('.');
    }

    return lastTwo;
}
