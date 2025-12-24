import React from 'react';

// Images officielles par défaut (Unsplash HD)
const CATEGORY_DEFAULTS: Record<string, string> = {
    politics: 'https://images.unsplash.com/photo-1541872703-74c5963631df?auto=format&fit=crop&q=80', // Assemblée
    world: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&q=80', // Globe
    tech: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80', // Puce
    science: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&q=80', // Espace
    business: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80', // Bureau
    finance: 'https://images.unsplash.com/photo-1591696205602-2f950c417cb9?auto=format&fit=crop&q=80', // Graphiques
    sport: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&q=80', // Stade
    health: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&q=80', // Médical
    default: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80', // Journal
};

type Props = {
    imageUrl?: string | null;
    category?: string | null;
    title?: string; // Gardé pour compatibilité mais non utilisé
    className?: string;
};

export default function ArticleThumbnail({
    imageUrl,
    category,
    className = '',
}: Props) {
    // 1. Normalisation de la catégorie
    const catKey = (category || '').toLowerCase().trim();

    // 2. Sélection de l'image
    // Priorité : Image DB > Image Catégorie (match partiel) > Image Default
    let src = imageUrl;

    if (!src) {
        const foundKey = Object.keys(CATEGORY_DEFAULTS).find((k) =>
            catKey.includes(k)
        );
        src = foundKey ? CATEGORY_DEFAULTS[foundKey] : CATEGORY_DEFAULTS.default;
    }

    return (
        <img
            src={src}
            // alt décoratif, on le laisse vide
            alt=""
            className={`object-cover bg-gray-100 ${className}`}
            loading="lazy"
        />
    );
}
