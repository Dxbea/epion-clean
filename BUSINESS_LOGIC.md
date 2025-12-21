# EPION - Business Logic & Monetization

## 1. Modèles B2C (Grand Public)

### A. OFFRE FREE (0€) - "L'Observateur"
* **Lecture :** Illimitée (Texte brut). Publicité active.
* **Outils IA :** Désactivés (Cadenas visible).
* **Chat :** 3 requêtes/jour (Modèle `sonar` Eco).

### B. OFFRE READER (4,99€) - "L'Explorateur"
* **Lecture :** Illimitée sans pubs.
* **Outils IA "Light" :** ✅ Actifs (Résumé, Vulgarisation, Traduction).
* **Chat :** 3 requêtes/jour (Identique Free).
* **Tech :** Utilise des modèles rapides et peu coûteux.

### C. OFFRE PREMIUM (14,90€) - "L'Architecte"
* **Lecture :** Illimitée + Audio (TTS).
* **Outils IA "Deep" :** ✅ Actifs (Fact-checking, Deep Dive, Analyse de biais).
* **Chat :** Illimité (Modèle `sonar-deep-research`).
* **Création :** 10 articles IA / mois.

## 2. Modèles B2B (Entreprises)

### D. OFFRE TEAMS (29€ / user / mois)
* **Cible :** Équipes, Agences.
* **Fonctionnalités :** Tout le Premium + Dossiers Partagés + Facturation centralisée + Mode Confidentialité (Zero Data Retention).

## 3. Implémentation Backend (Smart Router)
Le backend doit vérifier le `subscriptionTier` avant chaque appel API Perplexity.
* Si `Tier = FREE` et Outil demandés = "Deep Check" → Erreur 403 (Upgrade requise).
* Si `Tier = READER` et Outil demandés = "Summarize" → Autorisé (Modèle Eco).