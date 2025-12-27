// BackEnd/src/lib/sanitizeHtml.ts
import sanitize from 'sanitize-html';

const BASE_CONFIG: sanitize.IOptions = {
  // Allow standard markdown tags including images
  allowedTags: sanitize.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3', 'h4', 'span']),
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    span: ['class', 'className'], // for styling if needed
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  // Avoid script, iframe, object
  disallowedTagsMode: 'discard',
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
