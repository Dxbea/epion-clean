import React from 'react';
import { STOCK_IMAGES } from '@/lib/stockImages';

// Mappage des mots-clés de catégorie vers les clés de STOCK_IMAGES
const CATEGORY_MAP: Record<string, string> = {
    politique: 'politics',
    monde: 'world',
    tech: 'tech',
    science: 'science',
    economie: 'business',
    business: 'business',
    societe: 'news',
    news: 'news',
    sport: 'sport',
    sante: 'science',
    environnement: 'world',
    culture: 'other',
    lifestyle: 'other',
    insolite: 'other',
};

type Props = {
    imageUrl?: string | null;
    category?: string | null;
    title?: string;
    className?: string;
};

/**
 * Génère un index déterministe basé sur une chaîne de caractères (le titre)
 */
function getDeterministicIndex(seed: string, max: number): number {
    if (!seed || max <= 1) return 0;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % max;
}

export default function ArticleThumbnail({
    imageUrl,
    category,
    title,
    className = '',
}: Props) {
    // 1. Normalisation de la catégorie
    const catKey = (category || '').toLowerCase().trim();

    // 2. Sélection de l'image
    let src = imageUrl;

    if (!src) {
        // Trouver la clé correspondante dans STOCK_IMAGES
        const matchedKey = Object.keys(CATEGORY_MAP).find((k) => catKey.includes(k));
        const stockKey = matchedKey ? CATEGORY_MAP[matchedKey] : 'news';

        const images = STOCK_IMAGES[stockKey] || STOCK_IMAGES.other;

        // Sélection déterministe basée sur le titre pour que l'image reste la même pour un article donné
        const index = getDeterministicIndex(title || '', images.length);
        src = images[index];
    }

    return (
        <img
            src={src}
            alt=""
            className={`object-cover bg-gray-100 ${className}`}
            loading="lazy"
        />
    );
}
