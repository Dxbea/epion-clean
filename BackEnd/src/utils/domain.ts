
/**
 * Extrait et nettoie le nom de domaine principal d'une URL.
 * Retire le protocole, le 'www.' et les chemins/paramètres.
 * 
 * Ex: 
 * - "https://www.lemonde.fr/politique" -> "lemonde.fr"
 * - "google.com" -> "google.com"
 * 
 * @param url L'URL brute à nettoyer
 * @returns Le nom de domaine normalisé (minuscule, sans www)
 */
export function getCleanDomain(url: string): string {
    if (!url || typeof url !== 'string') return '';

    let cleanUrl = url.trim().toLowerCase();

    try {
        // Ajout d'un protocole par défaut si absent pour satisfaire le constructeur URL
        // (new URL("google.com") throw une erreur, new URL("https://google.com") fonctionne)
        const urlToParse = (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'))
            ? cleanUrl
            : `https://${cleanUrl}`;

        const parsedUrl = new URL(urlToParse);
        let hostname = parsedUrl.hostname;

        // Suppression du 'www.' s'il est présent
        if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
        }

        return hostname;

    } catch (error) {
        // Fallback : Nettoyage manuel si l'URL est vraiment malformée
        // Retire http://, https://, www. via regex
        let fallback = cleanUrl.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '');

        // Garde uniquement ce qui est avant le premier '/' ou '?'
        fallback = fallback.split('/')[0];
        fallback = fallback.split('?')[0];

        return fallback;
    }
}
