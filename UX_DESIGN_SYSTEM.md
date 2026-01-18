# 🧬 Charte Graphique Epion (Vivid Edition)

Ce document est la source de vérité unique pour le design d'Epion.
Toute déviation (couleurs pastels, glassmorphism, gris moyens) est interdite.

---

## 1. Philosophie : La Règle du 90/10
L'interface est un instrument de mesure scientifique, pas une décoration.

* **90% Structure (Neutre)** : L'environnement est strictement **Noir** (`#000000`, `gray-900`) et **Blanc** (`#FAFAF5`).
* **10% Âme (Vivid)** : La couleur n'est utilisée que pour la **Marque** (Identité) ou la **Donnée** (Score). Elle doit être saturée et "Néon".
* **Interdit 🚫** : Pas d'effets de verre flou (Glassmorphism), pas de dégradés "mous" ou pastels, pas de titres colorés (les titres sont noirs).

---

## 2. Identité de Marque (Brand Identity)
*C'est la signature visuelle de l'IA Epion. Elle représente la technologie et la fluidité.*

### Le Gradient Signature
Pour les endroits où on met de la couleur je veux soit des dégradés soit des couleurs unies. Pour les dégradés on peut en faire plusieurs à partir de ces 3 couleurs epion qui completent la palette de couleur principale d'epion ave le noir et blanc cassé. 
Un spectre continu qui traverse le Bleu electrique, le vert clair, et le bleu foncé.
* **Code CSS** : `linear-gradient(90deg, #87E8ED 0%, #87E89D 50%, #0031BC 100%)`


### Règles d'Usage (Brand)
* **Boutons d'Action (Actifs)** : Fond Gradient Signature complet.
* **Numérotation (Listes)** : Les chiffres "1.", "2.", "3." utilisent le Gradient en `background-clip: text`.
* **Groupes d'Icônes** : Appliquer un **"Global Gradient Mask"**. Le dégradé traverse le groupe d'icônes de gauche à droite (la 1ère est bleue, la dernière est verte). Ne jamais colorer les icônes individuellement avec la même couleur.
* **Logos & Décoration** : Traits de séparation, puces, logo principal.

---

## 3. Système de Notation (Data Visualization)
*Distinct de la marque. Indique la fiabilité de l'information.*

### Palette Vivid (Scores)
Utiliser exclusivement ces dégradés saturés pour les jauges et badges.

* **🔴 Critique (0-49)** : `#EF4444` (Rouge) $\to$ `#F87171`
* **🟠 Moyen (50-79)** : `#F59E0B` (Orange) $\to$ `#FBBF24`
* **🟢 Confiance (80-100)** : `#10B981` (Vert) $\to$ `#34D399`

### Les 4 Piliers (Fixes)
Chaque pilier d'analyse possède sa propre identité "Vivid" :
* **Transparence** : Bleu Vivid (`#3B82F6`)
* **Éditorial** : Vert Vivid (`#10B981`)
* **Sémantique** : Violet Vivid (`#8B5CF6`)
* **Qualité UX** : Orange Vivid (`#F97316`)

---

## 4. Typographie & Composants

### Textes & Titres
* **Titres (H1, H2...)** : Toujours **Noir** (`gray-900`) ou **Blanc** (Dark mode). Jamais de couleur.
* **Corps de texte** : Gris foncé (`gray-700`) ou Gris clair (`gray-300`). Jamais de gris moyen illisible (`gray-400/500`).
* **Gros Chiffres (Hero)** : Le score géant (ex: "71%") utilise le gradient de sa note en `background-clip: text`.

### Badges & Barres
* **Barres de progression** : Fond utilisant `backgroundImage` (Gradient). Pas de couleur unie (`backgroundColor`).
* **Badges (Pillules)** :
    * **Fond** : Gradient Vivid correspondant au score.
    * **Texte** : **Blanc Pur** (`#FFFFFF`) avec graissage (`font-bold`).
    * **Style** : Pas de bordure, ombre portée légère (`shadow-sm`).

---

## 5. Résumé Technique (Pour les dévs)
| Élément | Règle CSS / Tailwind |
| :--- | :--- |
| **Fond Site** | `bg-white` ou `bg-black` |
| **Texte Standard** | `text-gray-900` |
| **Numéros (1. 2.)** | `bg-gradient-to-r from-blue-500 via-teal-400 to-emerald-500 bg-clip-text text-transparent` |
| **Barre Score** | `style={{ backgroundImage: getVividGradient(score) }}` |
| **Bouton Like** | `bg-gradient-to-r from-blue-500 via-teal-400 to-emerald-500` (si actif) |