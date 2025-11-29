// BackEnd/src/lib/sanitizeHtml.ts
import sanitize from 'sanitize-html';

const BASE_CONFIG: sanitize.IOptions = {
  allowedTags: [
    'p',
    'br',
    'ul',
    'ol',
    'li',
    'strong',
    'b',
    'em',
    'i',
    'u',
    'blockquote',
    'code',
    'pre',
    'h1',
    'h2',
    'h3',
    'h4',
    'a',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  // évite <script>, on supprime tout ce qui est dangereux
};

export function sanitizeArticleHtml(input: string): string {
  return sanitize(input, BASE_CONFIG).trim();
}

export function sanitizeCommentHtml(input: string): string {
  // pour l’instant même config que les articles
  return sanitize(input, {
    ...BASE_CONFIG,
    // si tu veux être encore plus strict sur les commentaires:
    // allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'code'],
  }).trim();
}
