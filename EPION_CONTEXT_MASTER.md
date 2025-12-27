# EPION CONTEXT MASTER
> ⚠️ **DOCUMENT DE RÉFÉRENCE ABSOLUE** - Ce fichier est le "Cerveau" du projet. Toute session de travail doit commencer par sa lecture.

## 1. Philosophie & Identité Visuelle (La Règle du 90/10)
Epion est un instrument scientifique, pas un média de divertissement.
*   **90% Neutre** : L'interface doit être invisible (Noir/Blanc strict).
*   **10% Vivid** : Seule la DATA et l'INTELLIGENCE doivent "pop".

### La Double Hiérarchie Chromatique
Il est IMPÉRATIF de ne pas confondre **l'Identité** (Marque) et **l'Outil** (Fonction).

| Rôle | Couleur / Dégradé | Usage Strict |
| :--- | :--- | :--- |
| **IDENTITÉ (Brand)** | **Gradient Signature**<br>`Sky Blue (#0EA5E9)` → `Turquoise (#2DD4BF)` → `Mint (#34D399)` | • Logos & Branding<br>• Boutons d'Action Primaires (CTA)<br>• Numérotation de listes<br>• Éléments décoratifs majeurs |
| **INTERACTION (Tool)** | **Electric Mint (#00dc82)**<br>*Couleur Solide, Plate, "Tech"* | • **Surlignage de texte** (Highlight)<br>• **Pastilles de Sources** (Badges)<br>• **Bordures de Focus** (État actif)<br>• Indicateurs de statut système |

> 🛑 **RÈGLE D'OR** : Ne JAMAIS utiliser le Gradient Signature pour surligner du texte (trop bruyant). Ne JAMAIS utiliser le Mint Électrique pour un logo (trop plat).

---

## 2. Synthèse des Fonctionnalités IA

### Le Fact-Score (Algorithme de Confiance)
Agrégation pondérée de 4 piliers fondamentaux. Chaque pilier possède un **Code Couleur Fixe** pour la représentation graphique (Jauges, Graphiques).

1.  **Transparence** (`#3B82F6` - Bleu) : Disponibilité des sources, clarté auteurs.
2.  **Processus Éditorial** (`#10B981` - Vert) : Relecture, corrections, standards.
3.  **Sémantique** (`#8B5CF6` - Violet) : Ton neutre, vocabulaire, biais.
4.  **Qualité UX** (`#F97316` - Orange) : Lisibilité, Ads.txt, Dark Patterns.

### Outils & Business Logic (Smart Router)
Segmentation par `subscriptionTier`.

| Tier | Rôle | Chat | Outils IA Disponibles |
| :--- | :--- | :--- | :--- |
| **FREE** | Observateur | 3 req/j (Eco) | 🔒 Aucun (Cadenas visible) |
| **READER** | Explorateur | 3 req/j (Eco) | ✅ **Light** : Résumé, Vulgarisation, Traduction |
| **PREMIUM** | Architecte | Illimité (Deep) | ✅ **Deep** : Fact-checking, Deep Dive, Analyse de Biais |

---

## 3. Spécifications Interactives (Lecture Augmentée)

### Interaction : Le Double Clic (Smart Focus)
Dans `ChatMessage.tsx`, l'interaction suit une logique de dévoilement progressif :
1.  **Premier Clic (Focus)** : Activation du segment.
    *   *Visuel* : Fond `bg-[#00dc82]/10`, Bordure `border-[#00dc82]`.
    *   *UI* : Apparition de la **Bulle Inline** (Aperçu rapide).
2.  **Deuxième Clic (Action)** : Sur un segment DÉJÀ actif.
    *   *Action* : Ouverture du **Panneau Latéral** (Modal).
    *   *Contenu* : Analyse en profondeur des sources.

### Rendu Technique
*   **ReactMarkdown** : Transformation des symboles bruts.
*   **Nettoyage** : Injection de composants React (`p`, `li`) pour gérer l'interactivité.
*   **Sanitization** : Contrôle strict des classes injectées.

---

## 4. Instructions de Maintenance

### 🛑 NON-NEGOTIABLE (Do Not Touch)
1.  **Séparation des Couleurs** : Il est interdit d'utiliser une couleur fonctionnelle pour du branding et inversement.
2.  **Logique de Parsing** : Ne jamais toucher aux Regex de `ChatMessage.tsx` sans plan de test complet.
3.  **Modules Sanctuaires** : `AuthContext`, `Layout`.

### Cartographie & Stack
*   **Chat** : WebSockets, Streaming (Zone Monétisée).
*   **Actu** : Rendu statique, SEO (Zone Gratuite).
*   **Stack** : Vite, React, Node, Prisma, Perplexity.
