# 🧬 Charte Graphique & UI Master (Vivid Edition)

> ⚠️ **DOCUMENT DE RÉFÉRENCE ABSOLUE** - Ce fichier est la source de vérité unique pour le design d'Epion. Toute déviation est interdite.

## 1. Philosophie : La Règle du 90/10
L'interface d'Epion est un instrument de mesure scientifique, pas un média de divertissement ou de décoration.

* **90% Neutre (Structure)** : L'environnement est strictement Noir (`#000000`, `gray-900`) et Blanc (`#FAFAF5`).
* **10% Vivid (Alerte)** : La couleur n'est utilisée que pour la Marque (Gradient), l'Interaction (Solide) ou la Donnée (Scores).
* **Interdits 🚫** : Pas d'effets de verre flou (Glassmorphism), pas de dégradés "mous" ou pastels, pas de titres colorés (les titres sont toujours noirs ou blancs purs).

---

## 2. La Triple Palette (Brand, UI, Data)

Il est IMPÉRATIF de ne pas confondre **l'Identité** (Marque), **l'Interaction** (Outil) et la **Data** (Fiabilité).

### A. La Marque (Brand Identity)
Basée **exclusivement** sur nos 3 couleurs piliers : Bleu Sombre (`#001B72`), Cyan (`#87E8ED`), et Menthe (`#87E89D`).

| Rôle | Couleur / Code CSS | Usage Strict |
| :--- | :--- | :--- |
| **Gradient Signature** | `linear-gradient(90deg, #87E8ED 0%, #87E89D 50%, #001B72 100%)` | • Logos & Branding<br>• Boutons d'Action Primaires (CTA)<br>• Chiffres de numérotation (1., 2.) en `bg-clip-text`<br>• Global Mask sur des groupes d'icônes |

### B. L'Interaction (UI Tool)
La marque s'efface pour laisser place à l'utilisation pure. On extrait l'une des couleurs claires de la marque pour en faire un marqueur d'action.

| Rôle | Couleur / Code CSS | Usage Strict |
| :--- | :--- | :--- |
| **Couleur Solide (Tech)** | **Menthe (`#87E89D`)** ou **Cyan (`#87E8ED`)**<br>*(Toujours unie, jamais en dégradé)* | • **Surlignage de texte** (Focus & Highlight)<br>• **Pastilles/Badges** de Sources<br>• **Bordures d'état actif** (Hover/Focus)<br>• Indicateurs de statut système |

> 🛑 **RÈGLE D'OR** : Ne JAMAIS utiliser le Gradient Signature pour surligner du texte ou un état actif (trop bruyant). Ne JAMAIS utiliser une couleur solide pour le logo principal (trop plat).

### C. La Data Visualisation (Scores & Fact-Checking)
Distinct de la marque. Indique la fiabilité de l'information et les catégories d'analyse. Toujours utilisé en couleurs Vivid/Saturées.

* **Les Scores (Jauges & Badges)** :
    * 🔴 **Critique (0-49)** : `#EF4444` $\to$ `#F87171`
    * 🟠 **Moyen (50-79)** : `#F59E0B` $\to$ `#FBBF24`
    * 🟢 **Confiance (80-100)** : `#10B981` $\to$ `#34D399`

* **Les 4 Piliers d'Analyse (Couleurs Fixes)** :
    * **Transparence** : Bleu Vivid (`#3B82F6`)
    * **Éditorial** : Vert Vivid (`#10B981`)
    * **Sémantique** : Violet Vivid (`#8B5CF6`)
    * **Qualité UX** : Orange Vivid (`#F97316`)

---

## 3. Typographie & Composants

### Textes & Titres
* **Titres (H1, H2...)** : Toujours Noir (`gray-900`) ou Blanc Pur (Dark mode).
* **Corps de texte** : Gris foncé (`gray-700`) ou Gris clair (`gray-300`). Jamais de gris moyen illisible (`gray-400/500`).
* **Gros Chiffres (Hero Score)** : Le score géant utilise le gradient de sa note (ex: Vert 80-100) en `background-clip: text`.

### Interactions Cibles (Double Clic)
L'interaction sur un texte analysé suit une logique de dévoilement progressif :
1. **Premier Clic (Focus)** : Activation du segment.
   * *Visuel* : Fond `bg-[#87E89D]/10`, Bordure `border-[#87E89D]`.
   * *UI* : Apparition de la Bulle Inline (Aperçu rapide).
2. **Deuxième Clic (Action)** : Ouverture du Panneau Latéral (Modal) pour l'analyse en profondeur.

---

## 4. Résumé Technique (Tailwind)

| Élément | Règle CSS / Tailwind |
| :--- | :--- |
| **Fond Site** | `bg-[#FAFAF5]` ou `bg-[#000000]` |
| **Texte Standard** | `text-gray-900` |
| **Bouton Primaire** | `style={{ background: 'linear-gradient(90deg, #87E8ED, #87E89D, #001B72)' }}` |
| **Focus Interaction** | `bg-[#87E89D]/10 border-[#87E89D]` |