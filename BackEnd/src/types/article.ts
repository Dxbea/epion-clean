export type ArticleStyle = 'neutral' | 'explainer' | 'short' | 'indepth';
export type ArticleLanguage = 'fr' | 'en';

export interface GenerateArticleRequest {
    topic: string; // Le prompt utilisateur "Fais-moi un article..."
    language: ArticleLanguage;
    style: ArticleStyle;
    category?: string; // "Politics", "Tech", etc.
    generateImage: boolean; // True si le toggle est sur "Auto"
}
