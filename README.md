# Vinted Auto Republisher

Un plugin Chrome avancé pour automatiser la republication de vos annonces Vinted avec modification intelligente des images pour éviter la détection de doublons.

## 🚀 Fonctionnalités

### 📸 Modification intelligente des images
- **Recadrage automatique** : Supprime 3-10% des bords de chaque image
- **Watermarks invisibles** : Ajoute des modifications imperceptibles pour changer le hash
- **Rotation légère** : Applique une rotation de 0.5-2° pour éviter la détection
- **Compression variable** : Ajuste la qualité JPEG pour créer des fichiers uniques
- **Bruit numérique** : Modifie quelques pixels de manière imperceptible

### 🔄 Automatisation complète
- **Scan automatique** : Détecte toutes vos annonces Vinted
- **Sélection multiple** : Choisissez quelles annonces republier
- **Traitement par lot** : Republie plusieurs annonces avec délais configurables
- **Gestion d'erreurs** : Continue même en cas d'échec sur une annonce
- **Logs détaillés** : Suivez le progrès en temps réel

### ⚙️ Paramètres configurables
- Pourcentage de recadrage (3-10%)
- Texte de watermark personnalisé
- Angle de rotation (0-2°)
- Réduction de qualité (0-15%)
- Délai entre republications (30s-5min)
- Limite d'articles par session

### 🛡️ Sécurité et discrétion
- **Évite la détection** : Techniques avancées de modification d'images
- **Délais réalistes** : Simule un comportement humain
- **Logs privés** : Toutes les données restent locales
- **Interface discrète** : Se fond dans l'interface Vinted

## 📦 Installation

### 1. Téléchargement
1. Téléchargez ou clonez ce repository
2. Décompressez le fichier dans un dossier local

### 2. Génération des icônes
Les icônes ne sont pas incluses dans le repository. Vous devez les générer :

1. Ouvrez le fichier `generate-icons.html` dans votre navigateur
2. Cliquez sur "Télécharger toutes les icônes"
3. Placez les fichiers téléchargés dans le dossier `icons/` :
   - `icon16.png`
   - `icon32.png` 
   - `icon48.png`
   - `icon128.png`

### 3. Installation dans Chrome
1. Ouvrez Chrome et allez à `chrome://extensions/`
2. Activez le "Mode développeur" (coin supérieur droit)
3. Cliquez sur "Charger l'extension non empaquetée"
4. Sélectionnez le dossier contenant les fichiers du plugin
5. L'extension apparaît dans votre barre d'outils

## 🎯 Utilisation

### 1. Accès au plugin
1. Connectez-vous à votre compte Vinted
2. Allez sur votre profil ou la page "Mes articles"
3. Cliquez sur l'icône du plugin dans la barre d'outils

### 2. Configuration initiale
1. **Paramètres d'images** : Ajustez selon vos préférences
   - Recadrage recommandé : 5%
   - Watermark : Activé (laissez le texte vide pour un watermark invisible)
   - Rotation : 0.5°
   - Qualité : 5% de réduction

2. **Paramètres de republication** :
   - Délai recommandé : 1-2 minutes entre chaque annonce
   - Maximum : 10-20 articles par session

### 3. Republication
1. Cliquez sur "Scanner les annonces" pour détecter vos articles
2. Sélectionnez les annonces à republier (cochage des cases)
3. Cliquez sur "Republier les sélectionnées"
4. Suivez le progrès dans les logs en temps réel

### 4. Bonnes pratiques
- **Ne pas abuser** : Limitez-vous à 1-2 sessions par jour
- **Varier les délais** : Changez régulièrement les paramètres
- **Surveiller les résultats** : Vérifiez que vos annonces sont bien publiées
- **Sauvegarder** : Notez vos paramètres préférés

## ⚠️ Avertissements et limitations

### Responsabilité
- Ce plugin est fourni "tel quel" sans garantie
- L'utilisation se fait à vos propres risques
- Respectez les conditions d'utilisation de Vinted
- L'auteur n'est pas responsable des suspensions de compte

### Limitations techniques
- Fonctionne uniquement sur les versions françaises de Vinted (.fr)
- Nécessite Chrome ou un navigateur compatible
- Peut nécessiter des ajustements selon les mises à jour de Vinted
- Les sélecteurs CSS peuvent changer avec les mises à jour du site

### Détection possible
Bien que le plugin utilise des techniques avancées pour éviter la détection :
- Aucune méthode n'est 100% infaillible
- Vinted peut améliorer ses systèmes de détection
- Utilisez avec modération pour réduire les risques

## 🔧 Développement

### Structure du projet
```
vinted-republisher/
├── manifest.json           # Configuration du plugin Chrome
├── popup.html              # Interface utilisateur
├── popup.css               # Styles de l'interface
├── popup.js                # Logique de l'interface
├── content.js              # Script d'injection dans Vinted
├── content.css             # Styles pour l'injection
├── background.js           # Service worker
├── image-processor.js      # Traitement des images
├── icons/                  # Icônes du plugin
└── README.md              # Documentation
```

### Technologies utilisées
- **Manifest V3** : Standard actuel pour les extensions Chrome
- **Canvas API** : Traitement des images côté client
- **Chrome Extension APIs** : Interaction avec le navigateur
- **Vanilla JavaScript** : Pas de dépendances externes

### Contribution
Les contributions sont les bienvenues ! Pour contribuer :

1. Forkez le repository
2. Créez une branche pour votre fonctionnalité
3. Testez thoroughly sur différentes pages Vinted
4. Soumettez une pull request avec une description détaillée

## 📝 Changelog

### Version 1.0.0 (Initial)
- ✅ Scan automatique des annonces Vinted
- ✅ Modification intelligente des images (recadrage, watermark, rotation)
- ✅ Interface utilisateur intuitive
- ✅ Logs détaillés et suivi de progression
- ✅ Paramètres configurables
- ✅ Gestion d'erreurs robuste
- ✅ Support des délais réalistes

## 🛠️ Dépannage

### Le plugin ne détecte pas les annonces
1. Vérifiez que vous êtes sur une page Vinted avec vos articles
2. Actualisez la page et réessayez
3. Vérifiez la console Chrome (F12) pour les erreurs

### Les images ne se modifient pas correctement
1. Vérifiez que les images sont accessibles (pas de CORS)
2. Essayez de réduire le pourcentage de recadrage
3. Désactivez temporairement le watermark

### La republication échoue
1. Vérifiez votre connexion internet
2. Assurez-vous d'être connecté à Vinted
3. Réduisez le nombre d'articles par session
4. Augmentez le délai entre les republications

### Problèmes de permissions
1. Vérifiez que l'extension a accès aux sites Vinted
2. Rechargez l'extension dans chrome://extensions/
3. Redémarrez Chrome si nécessaire

## 📞 Support

Pour obtenir de l'aide :

1. **Issues GitHub** : Signalez les bugs et demandez des fonctionnalités
2. **Wiki** : Consultez la documentation détaillée
3. **Discussions** : Partagez vos expériences avec la communauté

## ⚖️ Licence

Ce projet est sous licence MIT. Voir le fichier LICENSE pour plus de détails.

---

**Avertissement** : Ce plugin n'est pas affilié à Vinted. Utilisez-le de manière responsable et respectez les conditions d'utilisation de Vinted.