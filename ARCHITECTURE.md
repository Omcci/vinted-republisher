# 🏗️ ARCHITECTURE EXTENSION VINTED AUTO-REPUBLISHER

## 🎯 OBJECTIF
Extension automatisée complète pour republication d'annonces Vinted avec modification d'images pour éviter la détection.

## 📋 WORKFLOW COMPLET
```
1. SAVE    → Extraire toutes les données de l'annonce (titre, prix, description, images, caractéristiques)
2. DRAFT   → Créer un nouveau brouillon avec ces données
3. MODIFY  → Modifier les images (watermark, rotation, compression)
4. DELETE  → Supprimer l'annonce originale
5. PUBLISH → Publier le nouveau brouillon
```

## 🏛️ ARCHITECTURE TECHNIQUE

### 📁 STRUCTURE DES FICHIERS
```
vinted-republisher/
├── manifest.json              # Configuration extension
├── background.js              # Service worker (communication)
├── popup.html/js/css         # Interface utilisateur
├── content-scripts/
│   ├── vinted-extractor.js   # Extraction données (MAIN world)
│   ├── vinted-automator.js   # Automation actions (ISOLATED world)
│   └── content-main.js       # Content script principal
├── utils/
│   ├── image-processor.js    # Modification d'images
│   ├── storage-manager.js    # Gestion stockage
│   └── tab-manager.js        # Gestion onglets
└── assets/
    └── watermarks/           # Images de watermark
```

### 🔄 COMMUNICATION INTER-ONGLETS

#### Background Service Worker
```javascript
// Gestion des messages entre onglets
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch(message.action) {
    case 'SAVE_ITEM_DATA':
      // Stocker les données extraites
      break;
    case 'OPEN_NEW_DRAFT':
      // Ouvrir nouvel onglet pour création
      break;
    case 'DELETE_ORIGINAL':
      // Retourner à l'onglet original pour suppression
      break;
    case 'PUBLISH_DRAFT':
      // Publier le brouillon final
      break;
  }
});
```

#### Storage System
```javascript
// Structure de données sauvegardées
const itemData = {
  // Métadonnées
  id: "item_12345",
  originalUrl: "https://www.vinted.fr/items/12345",
  timestamp: "2025-01-01T00:00:00Z",
  
  // Données article
  title: "Titre de l'article",
  description: "Description complète",
  price: "25.00",
  
  // Caractéristiques
  brand: "Zara",
  size: "M",
  condition: "Très bon état",
  color: "Bleu",
  category: "Femmes/Hauts",
  
  // Images (base64 ou URLs)
  images: [
    { original: "url1", modified: "base64..." },
    { original: "url2", modified: "base64..." }
  ],
  
  // État du processus
  status: "EXTRACTED|DRAFT_CREATED|IMAGES_MODIFIED|ORIGINAL_DELETED|PUBLISHED"
};
```

## 🎨 MODIFICATION D'IMAGES

### Stratégies Anti-Détection
1. **Watermark transparent** (coin de l'image)
2. **Rotation légère** (1-2 degrés)
3. **Compression/décompression** (changer métadonnées)
4. **Ajout de bruit** (pixels imperceptibles)
5. **Recadrage minimal** (1-2px sur les bords)

### Code de Modification
```javascript
class ImageProcessor {
  async processImage(imageUrl) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    return new Promise((resolve) => {
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Dessiner l'image originale
        ctx.drawImage(img, 0, 0);
        
        // Appliquer modifications
        this.addWatermark(ctx, canvas.width, canvas.height);
        this.addNoise(ctx, canvas.width, canvas.height);
        
        // Retourner image modifiée
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.src = imageUrl;
    });
  }
  
  addWatermark(ctx, width, height) {
    ctx.fillStyle = 'rgba(255,255,255,0.01)'; // Quasi invisible
    ctx.fillRect(width-50, height-20, 45, 15);
  }
  
  addNoise(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    // Ajouter du bruit minimal...
  }
}
```

## 🚀 PHASES D'IMPLÉMENTATION

### PHASE 1: EXTRACTION & SAUVEGARDE ✅
- [x] Extracteur complet de données
- [ ] Téléchargement et traitement des images
- [ ] Système de stockage robuste

### PHASE 2: CRÉATION DE BROUILLON
- [ ] Navigation automatique vers création
- [ ] Remplissage automatique du formulaire
- [ ] Upload des images modifiées
- [ ] Sauvegarde en brouillon

### PHASE 3: SUPPRESSION ORIGINALE
- [ ] Retour à l'annonce originale
- [ ] Localisation du menu de suppression
- [ ] Confirmation automatique

### PHASE 4: PUBLICATION FINALE
- [ ] Navigation vers brouillons
- [ ] Sélection du bon brouillon
- [ ] Publication automatique

### PHASE 5: INTERFACE UTILISATEUR
- [ ] Popup avec statut en temps réel
- [ ] Sélection d'articles multiples
- [ ] Configuration des modifications d'images
- [ ] Logs et rapports d'erreurs

## 🛡️ SÉCURITÉ & ROBUSTESSE

### Gestion d'Erreurs
- Sauvegarde automatique à chaque étape
- Reprise après interruption
- Détection de changements d'interface Vinted
- Timeouts et retry automatiques

### Anti-Détection
- Délais aléatoires entre actions
- Simulation de comportement humain
- Rotation des techniques de modification d'images
- Headers et user-agents variables

## 📊 MÉTRIQUES & MONITORING
- Taux de succès par étape
- Temps moyen de republication
- Détection des échecs et causes
- Statistiques d'utilisation