# EPION - Architecture Technique

## 1. Stack Fixe
* **Front :** React (Vite) + TypeScript + Tailwind CSS + Lucide-React.
* **Back :** Node.js + Express + TypeScript.
* **DB :** PostgreSQL via Prisma ORM (Hébergé sur Render/Docker).
* **IA Engine :** Perplexity API (via helper `src/lib/perplexity.ts`).

## 2. Zones Validées (⛔ NE PAS TOUCHER)
Les modules suivants sont audités et fonctionnels. Ne pas refactoriser sans raison critique :
* **Authentification :** Système de Sessions, Cookies HTTP-only, JWT, Middleware `requireSession`.
* **Layouts :** `MainLayout`, Header, Navigation Responsive.
* **Chat UI :** Composants visuels, Sidebar, gestion des dossiers.
* **Articles :** CRUD, Catégories, Commentaires, Likes.

## 3. Zones à Développer (🚧 CHANTIER EN COURS)
* **Smart Router IA :** Logique de sélection du modèle Perplexity selon l'abonnement.
* **Integration API :** Connecter le Chat UI (existant) au helper Perplexity.
* **Paywall Soft :** Implémentation des "Cadenas" sur les boutons IA pour les utilisateurs Free.