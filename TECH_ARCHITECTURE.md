# EPION - Architecture Technique

## 1. Stack Fixe
* **Front :** React (Vite) + TypeScript + Tailwind CSS + Lucide-React.
* **Back :** Node.js + Express + TypeScript.
* **DB :** PostgreSQL via Prisma ORM.

## 2. Infrastructure & Sécurité
* **Auth :** Sessions persistantes en DB (Table Session), Cookie HTTP-only, JWT.
* **Sécurité :** Protection CSRF (helper withCsrf), Rate-limiting, Sanitization HTML backend.
* **Environnement :** Vercel (Front) / Render (Back) / Docker (Local DB).

## 3. État des Lieux (Backend)
* **Auth/Users :** Terminé (Signup, Login, Verify Email).
* **Articles :** CRUD complet avec stats, vues dédupliquées et catégories.
* **Social :** Système de commentaires (imbriqués) et réactions (Heart) opérationnel.
* **Chat :** API de gestion des sessions et dossiers stable.