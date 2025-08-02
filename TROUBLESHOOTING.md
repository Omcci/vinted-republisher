# 🛠️ Dépannage - Vinted Auto Republisher

## ❌ "Erreur lors du scan" - Solutions rapides

### 🚨 **Action immédiate** (Essayez dans cet ordre)

#### 1️⃣ **Vérifiez votre page Vinted**
- ✅ Êtes-vous sur votre **profil** Vinted ?
- ✅ Ou sur la page **"Mes articles"** ?
- ✅ Êtes-vous **connecté** à votre compte ?

#### 2️⃣ **Changez de page**
1. Allez sur [vinted.fr](https://www.vinted.fr)
2. Cliquez sur votre **photo de profil** (coin supérieur droit)
3. Sélectionnez **"Mes articles"** dans le menu
4. **Actualisez** la page (F5)
5. **Réessayez** le scan

#### 3️⃣ **Diagnostic automatique**
1. Sur la page Vinted, appuyez sur **F12** (ouvrir la console)
2. Cliquez sur l'onglet **"Console"**
3. **Copiez-collez** ce code et appuyez sur Entrée :

```javascript
// Test rapide - copiez tout ce code dans la console Chrome
console.log('🧪 Test rapide Vinted Auto Republisher');

// Test de l'extension
if (typeof chrome !== 'undefined' && chrome.runtime) {
    console.log('✅ Extension active');
} else {
    console.log('❌ Extension non active');
}

// Test du content script
if (window.vintedAutomator) {
    console.log('✅ Content script chargé');
} else {
    console.log('❌ Content script non chargé');
}

// Test des annonces
const selectors = ['[data-testid="user-item"]', '.feed-grid__item', '.item-box'];
let found = 0;
selectors.forEach(sel => {
    const items = document.querySelectorAll(sel);
    console.log(`${sel}: ${items.length} éléments`);
    found += items.length;
});

console.log(`Total annonces: ${found}`);
if (found === 0) {
    console.log('💡 Allez sur "Mes articles" et actualisez la page');
}
```

## 🔧 **Solutions par problème**

### **Problème : Aucune annonce détectée**

**Causes possibles :**
- Page incorrecte (pas sur vos articles)
- Pas connecté à Vinted
- Vinted a changé sa structure

**Solutions :**
1. **URL correcte** : Assurez-vous d'être sur une de ces pages :
   - `https://www.vinted.fr/member/[votre-id]/items`
   - `https://www.vinted.fr/member/[votre-id]`

2. **Test manuel** : Voyez-vous vos articles sur la page ? Si non, le plugin ne peut pas les détecter.

3. **Actualiser** : F5 pour recharger la page

### **Problème : Extension non chargée**

**Symptômes :**
- L'icône du plugin n'apparaît pas
- Le popup ne s'ouvre pas

**Solutions :**
1. Allez sur `chrome://extensions/`
2. Trouvez "Vinted Auto Republisher"
3. Cliquez sur **"Recharger"** (🔄)
4. Vérifiez que l'extension est **activée**

### **Problème : Permissions**

**Solutions :**
1. Dans `chrome://extensions/`
2. Cliquez sur **"Détails"** de l'extension
3. Vérifiez les **"Autorisations du site"**
4. Assurez-vous que Vinted est autorisé

## 📱 **Test étape par étape**

### **Étape 1 : Page correcte**
- [ ] Je suis sur vinted.fr
- [ ] Je suis connecté (je vois mon profil)
- [ ] Je vois mes articles sur la page

### **Étape 2 : Extension active**
- [ ] L'icône du plugin est visible dans Chrome
- [ ] Le popup s'ouvre quand je clique dessus
- [ ] Le statut affiche "Connecté à Vinted" (pas "Erreur")

### **Étape 3 : Test de scan**
- [ ] Je clique sur "Scanner les annonces"
- [ ] Les annonces apparaissent dans la liste
- [ ] Je peux les sélectionner

## 🆘 **Si rien ne fonctionne**

### **Réinstallation propre**
1. Désinstaller l'extension :
   - `chrome://extensions/` → "Supprimer"

2. Redémarrer Chrome complètement

3. Réinstaller :
   - Mode développeur ON
   - "Charger l'extension non empaquetée"
   - Sélectionner le dossier

### **Test sur différentes pages**
Essayez ces URLs (remplacez par votre profil) :
- `https://www.vinted.fr/member/[votre-id]`
- `https://www.vinted.fr/member/[votre-id]/items`

### **Vérification manuelle**
1. **F12** → Console
2. Cherchez les **erreurs rouges**
3. Si vous voyez des erreurs, copiez-les pour diagnostic

## 💡 **Messages d'erreur courants**

| Message | Cause | Solution |
|---------|-------|----------|
| "Veuillez ouvrir une page Vinted" | Pas sur Vinted | Aller sur vinted.fr |
| "Erreur lors du scan" | Pas d'annonces détectées | Aller sur "Mes articles" |
| "Erreur de connexion" | Extension non chargée | Recharger l'extension |
| Popup ne s'ouvre pas | Permissions manquantes | Vérifier les autorisations |

## 📞 **Support avancé**

Si le problème persiste :

1. **Diagnostic complet** :
   - Ouvrir `debug-selectors.js`
   - Copier tout le code dans la console Chrome
   - Envoyer le résultat

2. **Informations système** :
   - Version de Chrome
   - URL exacte de la page Vinted
   - Messages d'erreur dans la console

---

**💡 Astuce** : 90% des problèmes se résolvent en allant sur la page "Mes articles" et en actualisant !