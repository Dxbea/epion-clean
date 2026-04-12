export const AI_MODELS = {
    SONAR: 'web-sonar',
    SONAR_PRO: 'web-sonar-pro',
    RAG: 'rag',
} as const;

export const MODEL_DETAILS = {
    [AI_MODELS.SONAR]: { label: 'Web', description: 'Serper + reponse rapide', tier: 'free' },
    [AI_MODELS.SONAR_PRO]: { label: 'Web Deep', description: 'Serper + reponse approfondie', tier: 'premium' },
    [AI_MODELS.RAG]: { label: 'Base Epion', description: 'Documents Internes (RAG)', tier: 'free' },
};
