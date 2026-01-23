export const AI_MODELS = {
    SONAR: 'web-sonar',
    SONAR_PRO: 'web-sonar-pro',
    RAG: 'rag',
} as const;

export const MODEL_DETAILS = {
    [AI_MODELS.SONAR]: { label: 'Sonar', description: 'Recherche Web Rapide', tier: 'free' },
    [AI_MODELS.SONAR_PRO]: { label: 'Sonar Pro', description: 'Recherche Approfondie', tier: 'premium' },
    [AI_MODELS.RAG]: { label: 'Base Epion', description: 'Documents Internes (RAG)', tier: 'free' },
};
