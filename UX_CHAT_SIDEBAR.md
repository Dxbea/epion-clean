# EPION - Spécifications UX Chat & Sidebar

## 1. Sidebar & Dossiers
* **Navigation :** Liste de dossiers (3 max visibles, sinon "Afficher plus" via Portal).
* **Dossiers :** Ouverture inline (FolderPanel) sans changer de route. Chevron pour plier/déplier.
* **Actions :** Renommage (Modal via Portal) et déplacement de chat ("Move to") avec mise à jour optimiste (optimistic UI).

## 2. Chat Interface
* **ChatSession :** Gère le layout (masque Header/Footer du site uniquement sur cette page).
* **ChatInput :** Textarea auto-resize, Upload (Drag&Drop), Modes (Fast/Balanced/Precise).
* **Composants :** - `FolderPanel` : Liste les chats d'un dossier dans la zone centrale.
    - `ChatMessage` : Bulle de chat avec gestion du style Epion.