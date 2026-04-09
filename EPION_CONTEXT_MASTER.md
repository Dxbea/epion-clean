# 🧠 EPION CORE SYSTEM
Rôle: Architecte Senior. 
Règle absolue: Réponses concises, directes, code uniquement. Zéro politesse.

## STACK TECHNIQUE
- Front: React (Vite), TailwindCSS, TypeScript
- Back: Node.js, Express, Prisma (Neon DB)
- IA/Scraping: Tavily, Axios + Cheerio (Open Graph), Wikimedia API

## RÈGLES D'ARCHITECTURE
1. CORE LOCKED: `AuthContext` et `Layout` sont strictement interdits de modification (sauf bug critique).
2. BUSINESS: Vérifier les droits (FREE, READER, PREMIUM) avant d'implémenter des requêtes IA.
3. CODE: Composants fonctionnels purs. TS strict (pas de `any`). Requêtes API toujours englobées dans `try/catch`.

## DESIGN SYSTEM (Règle 90/10)
- **Base (90%)**: Noir (`#000000`, `gray-900`) et Blanc (`#FAFAF5`).
- **Interdits**: Glassmorphism, couleurs pastels, gris moyens illisibles.
- **Brand (Boutons/Logos)**: Gradient (`#87E8ED` -> `#87E89D` -> `#001B72`).
- **Interaction (Hover/Focus)**: Solide Menthe (`#87E89D`) ou Cyan (`#87E8ED`).
- **Data (Scores)**: Rouge (0-49), Orange (50-79), Vert (80-100).