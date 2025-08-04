/**
 * EXTRACTEUR VINTED - Script injecté dans le contexte de la page
 * Accessible depuis la console du navigateur
 */

console.log('[Vinted Extractor] 🎯 Extracteur Vinted chargé dans le contexte de la page');

// Extracteur principal
class VintedExtractor {
    constructor() {
        console.log('[Vinted Extractor] 🔧 Initialisation');
    }

    // Extraire toutes les données d'une annonce COMPLÈTE
    async extract() {
        console.log('[Vinted Extractor] 📊 EXTRACTION COMPLÈTE - Toutes données + images...');

        const data = {
            // Métadonnées
            id: `vinted_${Date.now()}`,
            itemId: '',
            originalUrl: window.location.href,
            extractedAt: new Date().toISOString(),
            status: 'EXTRACTED',

            // Données de base
            title: '',
            price: '',
            description: '',

            // Détails produit complets
            brand: '',
            size: '',
            condition: '',
            color: '',
            category: '',
            subcategory: '',
            material: '',
            gender: '',

            // Images (URLs + données téléchargées)
            images: [],
            imageUrls: [],
            processedImages: []
        };

        try {
            // === TITRE ===
            const titleSelectors = ['h1[data-testid="item-title"]', 'h1', '[data-testid*="title"]'];
            for (const selector of titleSelectors) {
                const el = document.querySelector(selector);
                if (el?.textContent?.trim()) {
                    data.title = el.textContent.trim();
                    break;
                }
            }

            // === PRIX ===
            const priceSelectors = ['[data-testid="item-price"]', '[data-testid*="price"]', '.price'];
            for (const selector of priceSelectors) {
                const el = document.querySelector(selector);
                if (el?.textContent?.trim()) {
                    data.price = el.textContent.trim();
                    break;
                }
            }

            // === DESCRIPTION ===
            const descSelectors = ['[data-testid="item-description"]', '[data-testid*="description"]', '.item-description'];
            for (const selector of descSelectors) {
                const el = document.querySelector(selector);
                if (el?.textContent?.trim()) {
                    data.description = el.textContent.trim();
                    break;
                }
            }

            // === CARACTÉRISTIQUES ===
            // Recherche dans les éléments de détails
            const detailsElements = document.querySelectorAll('.details-list__item, [class*="detail"], [class*="attribute"]');
            detailsElements.forEach(element => {
                const text = element.textContent?.trim() || '';
                const label = element.querySelector('.details-list__item-title, .label')?.textContent?.trim() || '';
                const value = element.querySelector('.details-list__item-value, .value')?.textContent?.trim() || text;

                const lowerLabel = (label || text).toLowerCase();
                if (lowerLabel.includes('marque') || lowerLabel.includes('brand')) data.brand = value;
                else if (lowerLabel.includes('taille') || lowerLabel.includes('size')) data.size = value;
                else if (lowerLabel.includes('état') || lowerLabel.includes('condition')) data.condition = value;
                else if (lowerLabel.includes('couleur') || lowerLabel.includes('color')) data.color = value;
                else if (lowerLabel.includes('catégorie') || lowerLabel.includes('category')) data.category = value;
            });

            // === IMAGES COMPLÈTES ===
            console.log('[Vinted Extractor] 📸 Extraction et téléchargement des images...');
            const imageElements = document.querySelectorAll('.item-photos img, [data-testid="item-photo"] img, .photo img');

            for (const img of imageElements) {
                if (img.src && !data.imageUrls.includes(img.src)) {
                    // Obtenir l'URL haute résolution
                    let highResUrl = img.src
                        .replace(/\/\d+x\d+\//, '/original/')
                        .replace(/\/thumb\//, '/original/')
                        .replace(/\/small\//, '/original/');

                    data.imageUrls.push(highResUrl);

                    try {
                        // Télécharger l'image
                        const imageData = await this.downloadImage(highResUrl);
                        data.images.push({
                            originalUrl: highResUrl,
                            data: imageData,
                            processed: false
                        });
                        console.log('[Vinted Extractor] ✅ Image téléchargée:', highResUrl);
                    } catch (error) {
                        console.warn('[Vinted Extractor] ⚠️ Erreur téléchargement image:', error);
                        // Garder l'URL même si le téléchargement échoue
                        data.images.push({
                            originalUrl: highResUrl,
                            data: null,
                            processed: false,
                            error: error.message
                        });
                    }
                }
            }

            // === ID ARTICLE ===
            const urlMatch = window.location.href.match(/\/items\/(\d+)/);
            if (urlMatch) data.itemId = urlMatch[1];

            // === VALEURS PAR DÉFAUT ===
            if (!data.title) data.title = 'Article Vinted';
            if (!data.price) data.price = 'Prix non trouvé';

            console.log('[Vinted Extractor] ✅ Extraction terminée:', data);
            return data;

        } catch (error) {
            console.error('[Vinted Extractor] ❌ Erreur:', error);
            return null;
        }
    }

    // Copier les données dans le presse-papiers
    async copyToClipboard() {
        const data = await this.extract();
        if (data) {
            const jsonString = JSON.stringify(data, null, 2);
            await navigator.clipboard.writeText(jsonString);
            console.log('[Vinted Extractor] 📋 Données copiées dans le presse-papiers');
            return jsonString;
        }
    }

    // Télécharger une image et la convertir en base64
    async downloadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    canvas.width = img.width;
                    canvas.height = img.height;

                    ctx.drawImage(img, 0, 0);

                    // Convertir en base64
                    const dataURL = canvas.toDataURL('image/jpeg', 0.95);
                    resolve(dataURL);
                } catch (error) {
                    reject(error);
                }
            };

            img.onerror = () => reject(new Error('Impossible de charger l\'image'));
            img.src = url;
        });
    }

    // Traiter les images (ajouter watermark, rotation, etc.)
    async processImages(data) {
        console.log('[Vinted Extractor] 🎨 Traitement des images...');

        for (let i = 0; i < data.images.length; i++) {
            const image = data.images[i];
            if (image.data && !image.processed) {
                try {
                    const processedData = await this.modifyImage(image.data);
                    data.processedImages.push({
                        originalUrl: image.originalUrl,
                        originalData: image.data,
                        processedData: processedData,
                        processed: true
                    });
                    image.processed = true;
                    console.log('[Vinted Extractor] ✅ Image traitée:', i + 1);
                } catch (error) {
                    console.error('[Vinted Extractor] ❌ Erreur traitement image:', error);
                }
            }
        }

        return data;
    }

    // Modifier une image pour éviter la détection
    async modifyImage(imageDataURL) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                canvas.width = img.width;
                canvas.height = img.height;

                // Rotation légère (1 degré)
                const angle = (Math.random() - 0.5) * 2 * (Math.PI / 180); // -1 à +1 degré
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate(angle);
                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                ctx.rotate(-angle);
                ctx.translate(-canvas.width / 2, -canvas.height / 2);

                // Watermark invisible
                this.addInvisibleWatermark(ctx, canvas.width, canvas.height);

                // Bruit minimal
                this.addMinimalNoise(ctx, canvas.width, canvas.height);

                // Retourner image modifiée
                resolve(canvas.toDataURL('image/jpeg', 0.94 + Math.random() * 0.04)); // Qualité variable
            };
            img.src = imageDataURL;
        });
    }

    // Ajouter un watermark quasi invisible
    addInvisibleWatermark(ctx, width, height) {
        ctx.fillStyle = `rgba(255,255,255,${0.005 + Math.random() * 0.005})`; // Très transparent
        const x = width - 60 - Math.random() * 20;
        const y = height - 25 - Math.random() * 10;
        ctx.fillRect(x, y, 50, 20);
    }

    // Ajouter du bruit minimal
    addMinimalNoise(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Modifier quelques pixels aléatoirement (imperceptible)
        for (let i = 0; i < 50; i++) {
            const randomIndex = Math.floor(Math.random() * (data.length / 4)) * 4;
            data[randomIndex] = Math.min(255, data[randomIndex] + (Math.random() - 0.5) * 2);
            data[randomIndex + 1] = Math.min(255, data[randomIndex + 1] + (Math.random() - 0.5) * 2);
            data[randomIndex + 2] = Math.min(255, data[randomIndex + 2] + (Math.random() - 0.5) * 2);
        }

        ctx.putImageData(imageData, 0, 0);
    }

    // Sauvegarder les données complètes
    async saveToStorage(data) {
        console.log('[Vinted Extractor] 💾 Sauvegarde des données...');
        try {
            // Sauvegarder dans le stockage local du navigateur
            localStorage.setItem(`vinted_item_${data.itemId}`, JSON.stringify(data));
            console.log('[Vinted Extractor] ✅ Données sauvegardées avec ID:', data.itemId);
            return true;
        } catch (error) {
            console.error('[Vinted Extractor] ❌ Erreur sauvegarde:', error);
            return false;
        }
    }

    // Extraction complète avec traitement d'images
    async extractAndProcess() {
        console.log('[Vinted Extractor] 🚀 EXTRACTION COMPLÈTE + TRAITEMENT...');

        try {
            // 1. Extraire les données
            const data = await this.extract();

            // 2. Traiter les images
            await this.processImages(data);

            // 3. Sauvegarder
            await this.saveToStorage(data);

            console.log('[Vinted Extractor] 🎉 EXTRACTION COMPLÈTE TERMINÉE !');
            return data;

        } catch (error) {
            console.error('[Vinted Extractor] ❌ Erreur extraction complète:', error);
            return null;
        }
    }

    // Afficher un résumé propre
    async summary() {
        const data = await this.extract();
        if (data) {
            console.log(`
🏷️  ANNONCE VINTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Titre: ${data.title}
💰 Prix: ${data.price}
🏷️ Marque: ${data.brand || 'Non spécifié'}
📏 Taille: ${data.size || 'Non spécifié'}
🎨 Couleur: ${data.color || 'Non spécifié'}
🔧 État: ${data.condition || 'Non spécifié'}
📂 Catégorie: ${data.category || 'Non spécifié'}
📸 Images: ${data.images.length} téléchargées
🎨 Images traitées: ${data.processedImages.length}
🆔 ID: ${data.itemId}
🔗 URL: ${data.originalUrl}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            `);
            return data;
        }
    }

    // Scanner la page pour trouver des articles
    async scanPage() {
        console.log('[Vinted Extractor] 🔍 Scan de la page pour articles...');

        try {
            const items = [];

            // Vérifier si on est sur une page d'annonce individuelle
            if (window.location.href.includes('/items/')) {
                console.log('[Vinted Extractor] 📄 Page d\'annonce individuelle détectée');

                // Extraire l'ID de l'annonce depuis l'URL
                const match = window.location.href.match(/\/items\/(\d+)/);
                if (match) {
                    const itemId = match[1];

                    // Extraire les infos de l'annonce actuelle
                    const title = document.querySelector('h1, [data-testid*="title"]')?.textContent?.trim() || `Article #${itemId}`;
                    const price = document.querySelector('[data-testid*="price"], .price')?.textContent?.trim() || 'N/A';
                    const img = document.querySelector('img[src*="images"]');

                    items.push({
                        id: itemId,
                        title: title,
                        price: price,
                        image: img?.src || null,
                        isDraft: false,
                        url: window.location.href
                    });

                    console.log('[Vinted Extractor] ✅ Annonce actuelle extraite:', title);
                    return items;
                }
            }

            // Scanner pour les pages de listing
            const selectors = [
                '.feed-grid__item',        // Page d'accueil
                '.item-box',               // Profil utilisateur
                '.listing-item',           // Autres pages
                '.item',                   // Générique
                '[data-testid*="item"]'    // Data attributes
            ];

            let elements = [];
            for (const selector of selectors) {
                elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    console.log('[Vinted Extractor] ✅ Éléments trouvés avec:', selector);
                    break;
                }
            }

            console.log(`[Vinted Extractor] 📊 ${elements.length} éléments trouvés`);

            elements.forEach((element, index) => {
                try {
                    // Extraire l'image
                    const img = element.querySelector('img');
                    const imageUrl = img ? img.src : null;

                    // Extraire le prix
                    const priceElement = element.querySelector('[data-testid*="price"], .price, .item-price');
                    const price = priceElement ? priceElement.textContent.trim() : 'N/A';

                    // Extraire le titre ou ID
                    let title = 'Article sans titre';
                    let itemId = null;

                    // Chercher l'ID dans les liens
                    const linkElement = element.querySelector('a[href*="/items/"]');
                    if (linkElement) {
                        const match = linkElement.href.match(/\/items\/(\d+)/);
                        if (match) {
                            itemId = match[1];
                            title = `Article #${itemId}`;
                        }
                    }

                    // Chercher un titre si disponible
                    const titleElement = element.querySelector('[data-testid*="title"], .title, h3, h4, .item-title');
                    if (titleElement && titleElement.textContent.trim()) {
                        title = titleElement.textContent.trim();
                    }

                    // Vérifier si c'est un brouillon
                    const statusElement = element.querySelector('[data-testid*="status"], .status');
                    const isDraft = statusElement && statusElement.textContent.includes('Brouillon');

                    if (itemId) {
                        items.push({
                            id: itemId,
                            title: title,
                            price: price,
                            image: imageUrl,
                            isDraft: isDraft,
                            url: `https://www.vinted.fr/items/${itemId}`
                        });
                    }

                } catch (error) {
                    console.error('[Vinted Extractor] ❌ Erreur scan élément:', error);
                }
            });

            console.log(`[Vinted Extractor] ✅ ${items.length} articles extraits`);
            return items;

        } catch (error) {
            console.error('[Vinted Extractor] ❌ Erreur scan page:', error);
            return [];
        }
    }
}

// EXPOSER GLOBALEMENT (accessible depuis la console)
window.VintedExtractor = VintedExtractor;
window.vinted = new VintedExtractor();

// Fonctions raccourcies pour la console
window.extractVinted = () => window.vinted.extract();
window.vintedSummary = () => window.vinted.summary();
window.copyVinted = () => window.vinted.copyToClipboard();

// NOUVELLES FONCTIONS POUR REPUBLICATION AUTOMATIQUE
window.republishVinted = () => window.vinted.extractAndProcess();
window.processVintedImages = async () => {
    const data = await window.vinted.extract();
    return await window.vinted.processImages(data);
};
window.saveVintedData = async () => {
    const data = await window.vinted.extract();
    return await window.vinted.saveToStorage(data);
};

console.log(`
🎯 EXTRACTEUR VINTED PRÊT POUR REPUBLICATION AUTOMATIQUE !
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 EXTRACTION SIMPLE :
• extractVinted()     - Extraire les données basiques
• vintedSummary()     - Affichage propre
• copyVinted()        - Copier en JSON

🚀 REPUBLICATION AUTOMATIQUE :
• republishVinted()   - EXTRACTION COMPLÈTE + TRAITEMENT IMAGES
• processVintedImages() - Traiter les images seulement
• saveVintedData()    - Sauvegarder les données

🎨 FONCTIONNALITÉS :
• Téléchargement automatique des images haute résolution
• Modification anti-détection (rotation, watermark, bruit)
• Sauvegarde locale pour republication
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);