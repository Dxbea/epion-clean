export const CATEGORY_COLORS: Record<string, string> = {
    // 1. Monde (Indigo)
    'Monde': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
    'monde': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',

    // 2. Politique (Slate)
    'Politique': 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
    'politique': 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',

    // 3. Économie (Blue)
    'Économie': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    'economie': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',

    // 4. Société (Amber)
    'Société': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    'societe': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',

    // 5. Tech (Violet)
    'Tech': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
    'tech': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',

    // 6. Sciences (Fuchsia)
    'Sciences': 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
    'sciences': 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',

    // 7. Santé (Teal)
    'Santé': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
    'sante': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',

    // 8. Environnement (Emerald)
    'Environnement': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    'environnement': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',

    // 9. Culture (Rose)
    'Culture': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
    'culture': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',

    // 10. Sport (Orange)
    'Sport': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    'sport': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',

    // 11. Lifestyle (Cyan)
    'Lifestyle': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
    'lifestyle': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',

    // 12. Insolite (Yellow)
    'Insolite': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    'insolite': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',

    // Fallback
    'default': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
};

export const UNIVERSAL_CATEGORIES = [
    'Monde', 'Politique', 'Économie', 'Société',
    'Tech', 'Sciences', 'Santé', 'Environnement',
    'Culture', 'Sport', 'Lifestyle', 'Insolite'
];

export const getCategoryColor = (categoryName: string | undefined | null): string => {
    if (!categoryName) return CATEGORY_COLORS['default'];
    // Try exact match
    if (CATEGORY_COLORS[categoryName]) return CATEGORY_COLORS[categoryName];
    // Try lowercase slug match logic if needed, or simple normalization
    const normalized = categoryName.toLowerCase();
    // We added lowercase keys to the map for safety
    return CATEGORY_COLORS[normalized] || CATEGORY_COLORS['default'];
};
