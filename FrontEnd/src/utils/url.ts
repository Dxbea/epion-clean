export function isInternalUrl(url?: string) {
  if (!url) return false;
  return url.startsWith('/') || url.startsWith(window.location.origin);
}
