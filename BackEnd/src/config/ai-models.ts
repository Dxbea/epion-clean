export const AI_MODELS = {
    STANDARD: 'sonar',                // Rapide (Gratuit)
    ADVANCED: 'sonar-pro',            // Puissant (Premium)
    REASONING: 'sonar-reasoning-pro', // Réfléchi (Premium+)
    RESEARCH: 'sonar-deep-research',  // Exhaustif (Premium+)
} as const;

export const MODEL_DETAILS = {
    [AI_MODELS.STANDARD]: { label: 'Sonar', description: 'Rapide & Efficace', tier: 'free', trustScore: 80 },
    [AI_MODELS.ADVANCED]: { label: 'Sonar Pro', description: 'Recherche Approfondie', tier: 'premium', trustScore: 95 },
    [AI_MODELS.REASONING]: { label: 'Reasoning Pro', description: 'Analyse Logique (Lent)', tier: 'premium', trustScore: 100 },
    [AI_MODELS.RESEARCH]: { label: 'Deep Research', description: 'Rapport Complet (Très lent)', tier: 'premium', trustScore: 100 },
};
