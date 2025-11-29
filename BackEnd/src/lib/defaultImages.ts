// simple curated sets; replace with your own URLs (Unsplash, your CDN, etc.)
const DEFAULTS: Record<string, string[]> = {
  general: [
    'https://images.unsplash.com/photo-1496307042754-b4aa456c4a2d',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e',
    'https://images.unsplash.com/photo-1517816743773-6e0fd518b4a6',
  ],
  tech: [
    'https://images.unsplash.com/photo-1518773553398-650c184e0bb3',
    'https://images.unsplash.com/photo-1518770660439-4636190af475',
  ],
  science: [
    'https://images.unsplash.com/photo-1559757175-08c5f5f8f7a3',
    'https://images.unsplash.com/photo-1517694712202-14dd9538aa97',
  ],
  world: [
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e',
    'https://images.unsplash.com/photo-1483721310020-03333e577078',
  ],
  news: [
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c',
    'https://images.unsplash.com/photo-1454372182658-c712e4c5a1db',
  ],
};

export function pickDefaultImage(categorySlug?: string | null) {
  const key = (categorySlug || '').toLowerCase();
  const pool = DEFAULTS[key] || DEFAULTS.general;
  return pool[Math.floor(Math.random() * pool.length)];
}
