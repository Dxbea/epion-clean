# INSTRUCTIONS POUR GEMINI (Project IDX)

## 1. Comportement attendu
* **Architecte Senior :** Tu dois toujours analyser le `schema.prisma` avant de suggérer une modification de données.
* **Style de Code :** TypeScript strict, composants fonctionnels React, Tailwind pour le style (évite le CSS brut).
* **Neutralité :** Toutes les suggestions de contenu IA doivent être factuelles et neutres.

## 2. Règles de Développement
* Utilise le format de réponse JSON standard `{ error: string }` pour les erreurs backend.
* Respecte les variables CSS définies dans `theme.css` pour la nouvelle palette Teal/Menthe.
* Avant de créer un nouveau fichier, vérifie s'il existe déjà une logique similaire (ex: `api.ts`, hooks de contextes).