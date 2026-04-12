export const NEWS_SITEMAPS = {
  permissive: {
    label: 'France Info',
    url: 'https://www.francetvinfo.fr/sitemap.xml',
  },
  lemonde: {
    label: 'Le Monde',
    url: 'https://www.lemonde.fr/sitemap_index.xml',
  },
  lefigaro: {
    label: 'Le Figaro',
    url: 'https://www.lefigaro.fr/sitemap_index.xml',
  },
} as const;

export type NewsSitemapPreset = keyof typeof NEWS_SITEMAPS;

export const DEFAULT_DEBUG_SITEMAP_PRESET: NewsSitemapPreset = 'permissive';
export const DEFAULT_DEBUG_SITEMAP_URL = NEWS_SITEMAPS[DEFAULT_DEBUG_SITEMAP_PRESET].url;
