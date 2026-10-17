# Vinted Republisher PRO

Extension Chrome (Manifest V3) pour automatiser la republication, l'archivage local et le contournement des détections de doublons sur Vinted, sans dégradation de la qualité des annonces.

---

## Vue d'ensemble

Vinted Republisher PRO modernise la gestion d'un dressing Vinted grâce à trois piliers :

1. **Coffre-fort local (Vault)** : Sauvegarde intégrale des annonces (photos haute résolution, descriptions, prix, attributs catalogue) avec import et export JSON.
2. **Bouclier Anti-Doublon** : Sublimation d'images Studio Pro et reformulation textuelle (IA ou locale) pour modifier l'empreinte algorithmique sans dégrader la qualité visuelle.
3. **Moteur d'automatisation DOM** : Remplissage complet, dynamique et résilient des formulaires Vinted, avec exécution possible en tâche de fond (mode discret).

---

## Fonctionnalités principales

### Coffre-fort d'annonces (Vault)
- **Archivage complet** : Capture en un clic depuis n'importe quelle annonce active ou scan global du dressing.
- **Stockage local persistant** : Conservation des photos originales en pleine résolution et de l'ensemble des attributs (catégorie, marque, taille, état, couleur, matière, format de colis).
- **Import / Export JSON** : Sauvegarde externe, transfert entre postes ou archivage de sécurité au format `vinted-backup-*.json`.
- **Recherche instantanée** : Filtre rapide par titre, marque ou taille.

### Bouclier Anti-Doublon & Studio Photo
Les algorithmes de détection de doublons (pHash/DCT) comparent les matrices de fréquences spatiales. Vinted Republisher PRO modifie ces empreintes en valorisant l'annonce plutôt qu'en la détériorant :

| Traitement | Mécanisme technique | Effet visuel |
| :--- | :--- | :--- |
| **Netteté HD** | Masque de convolution spatial 3x3 | Renforce le piqué des matières, coutures et logos |
| **Éclairage Studio** | +3% luminosité, +4% contraste, +5% vivacité | Corrige les photos d'intérieur ternes |
| **Micro-recadrage** | Cadrage doux asymétrique (1.5% à 2%) | Décale la grille DCT sans couper le produit |
| **Encodage HD** | Qualité JPEG 96% | Zéro bruit numérique, zéro flou de rotation |
| **Permutation couverture** | Échange de la photo 1 avec la photo 2 ou 3 | Casse immédiatement l'empreinte principale |

### Reformulation de texte (IA & Locale)
- **Intégration OpenAI (`gpt-4o-mini`)** : Reformulation fluide et humaine du titre et de la description via l'API OpenAI (~0,00008 $ par annonce).
- **Variations locales (hors ligne)** : Moteur de synonymes et réorganisation structurelle sans dépendance externe.
- **Directives de style strictes** : Suppression intégrale des emojis, des superlatifs commerciaux et du markdown non supporté par Vinted.

### Moteur de formulaire (Form Engine)
- **Découverte dynamique du schéma** : Détection automatique des champs conditionnels spécifiques à la catégorie choisie (matière, dimensions, etc.).
- **Résolution précise des sélecteurs** : Prise en charge fiabilisée des listes hiérarchiques de catégories, marques, tailles, formats de colis et prix.
- **Mode discret en arrière-plan** : Pré-remplissage autonome sans basculement forcé d'onglet.

---

## Installation

### Prérequis
- Navigateur Google Chrome ou tout navigateur basé sur Chromium (Brave, Edge, Opera, Vivaldi).

### Procédure
1. **Cloner ou télécharger le dépôt** :
   ```bash
   git clone https://github.com/Omcci/vinted-republisher.git
   ```
2. **Charger l'extension dans Chrome** :
   - Ouvrez `chrome://extensions/`.
   - Activez le **Mode développeur** (interrupteur en haut à droite).
   - Cliquez sur **Charger l'extension non empaquetée**.
   - Sélectionnez le dossier du projet `vinted-republisher`.
3. L'icône de l'extension apparaît dans la barre d'outils Chrome.

---

## Guide d'utilisation

### 1. Archiver une annonce
- **Depuis une fiche produit** : Naviguez sur une annonce Vinted, ouvrez l'extension et cliquez sur **Sauvegarder dans le Coffre-fort**.
- **Depuis votre dressing** : Cliquez sur **Scanner mon dressing**, cochez les articles souhaités et cliquez sur **Sauvegarder**.

### 2. Republier avec le Bouclier Anti-Doublon
1. Dans l'onglet **Coffre-fort**, localisez l'article à republier.
2. Cliquez sur **Varier & Pré-remplir**.
3. Configurez les options du bouclier :
   - Permutation de la photo de couverture.
   - Embellissement Studio Pro (Netteté HD, Éclat & Contraste, recadrage doux).
   - Reformulation du titre et de la description (locale ou IA).
4. Cliquez sur **Appliquer & Pré-remplir** : le formulaire de publication Vinted s'ouvre et se remplit automatiquement.
5. Vérifiez les informations saisies et validez la publication.

### 3. Configuration IA (Optionnel)
1. Dans le panneau principal de l'extension, dépliez la section **Intelligence Artificielle (OpenAI)**.
2. Saisissez votre clé API OpenAI (`sk-proj-...`).
3. Sélectionnez le modèle souhaité (`gpt-4o-mini` recommandé).
4. Cliquez sur **Tester la clé** pour valider la communication avec l'API.

---

## Architecture du projet

```
vinted-republisher/
├── manifest.json                  # Déclaration Manifest V3 (permissions, scripts, ressources)
├── popup.html / popup.css / popup.js # Interface utilisateur, gestion du Vault et modales
├── content.js                     # Script de contenu, injection et orchestration dans Vinted
├── vinted-form-engine.js          # Moteur d'automatisation et remplissage des champs DOM
├── vinted-field-matrix.js         # Matrice de correspondance des champs Vinted
├── vinted-schema-discovery.js     # Découverte et validation des schémas de catalogue
├── vinted-schema-store.js         # Gestionnaire de cache local des schémas par catégorie
├── image-processor.js             # Pipeline Studio Pro (convolution HD, colorimétrie, recadrage)
├── openai-service.js              # Service client pour l'API OpenAI
├── background.js                  # Service worker (gestion des onglets et communication)
├── icons/                         # Icônes de l'extension (16, 32, 48, 128 px)
└── scripts/                       # Suites de tests automatisés et utilitaires
```

---

## Tests et validation

Le projet intègre une suite de tests unitaires et d'intégration validant le traitement des images et le moteur de formulaire :

```bash
# Test du pipeline d'image Studio Pro
node scripts/test-image-processor.js

# Test des sélecteurs DOM et du moteur de formulaire
node test-selectors.js

# Test d'intégrité globale et de sécurité
node scripts/self-test.js
```

---

## Recommandations d'usage

- **Délais entre republications** : Respectez un délai d'au moins 1 à 2 minutes entre deux publications pour simuler un comportement naturel.
- **Contrôle avant validation** : Prenez l'habitude de vérifier les champs pré-remplis sur la page de brouillon avant de confirmer la mise en ligne.
- **Sauvegarde préventive** : Exportez régulièrement votre coffre-fort au format JSON (**Exporter tout**) pour conserver une copie de sécurité de votre inventaire.

---

## Licence

Ce projet est distribué sous licence MIT.

*Avertissement : Cette extension est un outil indépendant et n'est ni affiliée à, ni soutenue par Vinted.*