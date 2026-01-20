# 📘 EPION - Business Logic, Monetization & Architecture
**Version :** 2.0 (Final "Energy" Revision)
**Date :** Janvier 2026
**Statut :** Validé pour Développement

---

## 1. Philosophie Globale
Epion est une plateforme hybride Média/IA. Pour garantir la **fiabilité** (notre promesse) et la **rentabilité** (notre survie), nous ne sommes pas un simple "wrapper" d'API.
Nous utilisons une stratégie **"Algo-First"** : privilégier les données internes (gratuites/rapides) avant d'appeler le Web (coûteux).

Le système économique repose sur une monnaie virtuelle : les **Crédits Épion (Energy)**.

---

## 2. Modèle Économique : "Epion Energy"

### A. Le Concept
Au lieu de limiter par "nombre de messages", chaque utilisateur dispose d'un **Wallet Journalier** de crédits.
* **Reset :** Recharge automatique à 100% chaque nuit à 00:00 (Timezone User).
* **Principe :** "Use it or lose it" (Pas de report de crédits).
* **Logique de débit :** "Le Péage" (Threshold Check). Si `Wallet < Coût Action`, l'action est refusée.

### B. Matrice des Coûts (Le "Menu")

| Action | Mode Technique | Coût (Crédits) | Coût Réel Est. | Note Technique |
| :--- | :--- | :--- | :--- | :--- |
| **Chat "Fast"** | `RAG Interne` | **10** | ~0.0002 $ | GPT-4o-mini sur BDD interne. |
| **Chat "Web Standard"** | `sonar-small` | **350** | ~0.0050 $ | Recherche Web + Synthèse rapide. |
| **Chat "Web Deep"** | `sonar-large` | **1 000** | ~0.0150 $ | **Premium Only.** Raisonnement complexe. |
| **Regenerate** | *(Selon Mode)* | **Prix du Mode** | - | "Retry" = Nouvelle requête payante. |
| **Consultation** | `DB Cache` | **0** | 0.0000 $ | Résumés, Trust Scores, Lecture. |
| **Création Article** | `Workflow` | **Hors-Jauge** | ~0.0500 $ | Géré par un **Quota Hebdomadaire** séparé. |

---

## 3. Les Plans de Souscription (Tiers)

### 🟢 Plan FREE (0€ / mois)
* **Cible :** Découverte. Financé par la Publicité.
* **Wallet :** **700 Crédits / jour**.
* **Modèles Autorisés :**
    * Eco : `GPT-4o-mini` (Fast).
    * Web : `sonar-small` (Standard).
    * Deep : 🚫 **INTERDIT**.
* **Capacité Réelle :** 2 Recherches Web (2x350) OU 70 Messages Fast.
* **Quota Articles :** 🚫 **0**.
* **Publicité :** ✅ Active.

### 🔵 Plan READER (4,99€ / mois)
* **Cible :** Grand Public, Veille.
* **Wallet :** **5 000 Crédits / jour**.
* **Modèles Autorisés :**
    * Eco : `GPT-4o-mini`.
    * Web : `sonar-small` (Standard).
    * Deep : 🚫 **INTERDIT** (Incitation upgrade).
* **Capacité Réelle :** ~14 Recherches Web / jour (Confortable).
* **Quota Articles :** ✅ **1 / SEMAINE** (Bonus découverte).
* **Publicité :** ❌ Aucune.

### 🟣 Plan PREMIUM (14,90€ / mois)
* **Cible :** Pros, Créateurs.
* **Wallet :** **45 000 Crédits / jour**.
* **Modèles Autorisés :**
    * Eco : `GPT-4o-mini`.
    * Web : ✅ **`sonar-large`** (Deep Reasoning).
* **Capacité Réelle :** ~45 Recherches Deep OU ~128 Recherches Standard.
* **Quota Articles :** ✅ **10 / SEMAINE**.
* **Publicité :** ❌ Aucune.

---

## 4. Architecture Technique & Implémentation

### A. Le "Billing Middleware" (Backend)
C'est le gardien des coûts. Il doit s'exécuter **avant** d'appeler Perplexity ou OpenAI.
1.  **Lazy Reset :** Vérifie la date de `last_reset`. Si `date != today`, remet le wallet au max du Plan.
2.  **Check Funds :** Vérifie si `current_credits >= action_cost`.
3.  **Deduct :** Débite le montant.
4.  **Error Handling :** Si fonds insuffisants, renvoie une erreur spécifique (`INSUFFICIENT_FUNDS_WEB`) pour permettre au front de proposer le mode Fast.

### B. Le "Smart Router" (Switch Modèle)
Le choix du modèle dépend de 2 facteurs : Le **Mode Choisi** (Front) et le **Plan User** (DB).

### C. Gestion de la Mémoire (Rolling Window) ⚠️ CRITIQUE
Pour éviter l'explosion des coûts ("Context Window Explosion"), nous n'envoyons jamais tout l'historique à l'API.
* **Règle :** Envoi du `System Prompt` + `Les 6 derniers messages` uniquement.
* **Impact :** Réduit la facture API de 60% sur les longues conversations.

### D. Gestion des Images
* **Règle :** Aucune génération d'image via DALL-E/Midjourney (Trop cher, ~0.04$/img).
* **Solution :** Utilisation exclusive de l'API **Unsplash** (Gratuit) pour illustrer les articles générés.

---

## 5. Nouvelles Technologies Requises

Pour supporter ce modèle V2, la stack technique doit évoluer :

1.  **Stockage Vectoriel (RAG) :** Extension `vector` pour PostgreSQL (via Prisma).
2.  **Token Tracking Précis :** Librairie `tiktoken` (Node.js).
3.  **Schéma Base de Données (Mise à jour) :** Mise à jour du modèle `UserUsage`.

---

## 6. Analyse des Risques (Red Team)

| Risque Identifié | Solution Technique |
| :--- | :--- |
| **Gaspillage Involontaire** | Si l'utilisateur est en mode `WEB` mais dit juste "Merci", le Smart Router force le mode `FAST` (10 crédits) automatiquement. |
| **Spam du bouton "Retry"** | Le bouton "Regenerate" déclenche une nouvelle facturation complète. L'utilisateur doit être averti. |
| **Faille "Deep" Free** | Le Middleware doit rejeter techniquement toute demande de `sonar-large` venant d'un ID User ayant le rôle FREE ou READER. |