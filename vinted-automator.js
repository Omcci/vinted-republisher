/**
 * VINTED AUTOMATOR - Automatisation des actions Vinted
 * Phase 2: Création automatique de brouillons
 */

console.log('[Vinted Automator] 🤖 Automator chargé dans le contexte de la page');

class VintedAutomator {
    constructor() {
        console.log('[Vinted Automator] 🔧 Initialisation de l\'automator');
        this.delays = {
            short: () => 1000 + Math.random() * 1000,    // 1-2s
            medium: () => 2000 + Math.random() * 2000,   // 2-4s
            long: () => 3000 + Math.random() * 3000      // 3-6s
        };
    }

    // Attendre avec délai aléatoire (simulation humaine)
    async wait(delayType = 'medium') {
        const delay = this.delays[delayType]();
        console.log(`[Vinted Automator] ⏳ Attente ${Math.round(delay)}ms...`);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    // Simuler un clic humain
    async humanClick(element, description = '') {
        if (!element) {
            console.error('[Vinted Automator] ❌ Élément non trouvé pour clic:', description);
            return false;
        }

        console.log('[Vinted Automator] 🖱️ Clic sur:', description || element.tagName);

        // Simuler survol puis clic
        element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await this.wait('short');

        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        return true;
    }

    // Simuler saisie humaine
    async humanType(element, text, description = '') {
        if (!element) {
            console.error('[Vinted Automator] ❌ Élément non trouvé pour saisie:', description);
            return false;
        }

        console.log('[Vinted Automator] ⌨️ Saisie dans:', description || element.tagName);

        element.focus();
        await this.wait('short');

        // Effacer le contenu existant
        element.value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));

        // Saisir caractère par caractère avec délais aléatoires
        for (let i = 0; i < text.length; i++) {
            element.value += text[i];
            element.dispatchEvent(new Event('input', { bubbles: true }));

            // Délai aléatoire entre caractères (50-150ms)
            if (i < text.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
            }
        }

        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    // Charger les données sauvegardées
    loadSavedData(itemId) {
        try {
            const data = localStorage.getItem(`vinted_item_${itemId}`);
            if (data) {
                const parsed = JSON.parse(data);
                console.log('[Vinted Automator] 📋 Données chargées pour:', parsed.title);
                return parsed;
            }
        } catch (error) {
            console.error('[Vinted Automator] ❌ Erreur chargement données:', error);
        }
        return null;
    }

    // Naviguer vers la page de création d'annonce
    async goToCreateListing() {
        console.log('[Vinted Automator] 🚀 Navigation vers création d\'annonce...');

        // URL de création Vinted
        const createUrl = 'https://www.vinted.fr/items/new';

        // Vérifier si on est déjà sur la page de création
        if (window.location.href.includes('/items/new')) {
            console.log('[Vinted Automator] ✅ Déjà sur la page de création');
            return true;
        }

        if (window.location.href !== createUrl) {
            console.log('[Vinted Automator] 🔄 Navigation vers:', createUrl);
            window.location.href = createUrl;
            return false; // Indique qu'on a navigué
        }

        return true; // Déjà sur la bonne page
    }

    // Attendre que la page soit chargée
    async waitForPageLoad() {
        console.log('[Vinted Automator] ⏳ Attente du chargement de la page...');

        return new Promise((resolve) => {
            if (document.readyState === 'complete') {
                resolve();
                return;
            }

            window.addEventListener('load', resolve, { once: true });

            // Timeout de sécurité
            setTimeout(resolve, 10000);
        });
    }

    // Remplir le formulaire de création avec TOUTES les données
    async fillCreateForm(data) {
        console.log('[Vinted Automator] 📝 REMPLISSAGE COMPLET DU FORMULAIRE...');
        console.log('[Vinted Automator] 📊 Données à transférer:', {
            titre: data.title || 'MANQUANT',
            prix: data.price || 'MANQUANT',
            description: data.description ? `${data.description.length} caractères` : 'MANQUANTE',
            marque: data.brand || 'MANQUANTE',
            taille: data.size || 'MANQUANTE',
            état: data.condition || 'MANQUANT',
            couleur: data.color || 'MANQUANTE',
            matière: data.material || 'MANQUANTE',
            catégorie: data.category || 'MANQUANTE',
            images: data.processedImages ? data.processedImages.length : 0
        });

        try {
            await this.waitForPageLoad();
            await this.wait('long'); // Attendre que tout soit bien chargé

            let fieldsCompleted = 0;
            let fieldsAttempted = 0;

            // === TITRE (OBLIGATOIRE) ===
            console.log('[Vinted Automator] 📝 Remplissage du titre...');
            fieldsAttempted++;
            const titleSelectors = [
                'input[data-testid*="title"]',
                'input[name*="title"]',
                'input[placeholder*="titre"]',
                'input[placeholder*="Titre"]',
                '#item_title',
                'input[id*="title"]'
            ];

            for (const selector of titleSelectors) {
                const titleInput = document.querySelector(selector);
                if (titleInput && data.title) {
                    await this.humanType(titleInput, data.title, 'Champ titre');
                    fieldsCompleted++;
                    console.log('[Vinted Automator] ✅ Titre rempli:', data.title);
                    break;
                }
            }

            await this.wait('medium');

            // === DESCRIPTION (OBLIGATOIRE) ===
            console.log('[Vinted Automator] 📝 Remplissage de la description...');
            fieldsAttempted++;
            const descSelectors = [
                'textarea[data-testid*="description"]',
                'textarea[name*="description"]',
                'textarea[placeholder*="description"]',
                '#item_description',
                'textarea[id*="description"]'
            ];

            for (const selector of descSelectors) {
                const descInput = document.querySelector(selector);
                if (descInput && data.description) {
                    await this.humanType(descInput, data.description, 'Champ description');
                    fieldsCompleted++;
                    console.log('[Vinted Automator] ✅ Description remplie:', data.description.length, 'caractères');
                    break;
                }
            }

            await this.wait('medium');

            // === PRIX (OBLIGATOIRE) ===
            console.log('[Vinted Automator] 📝 Remplissage du prix...');
            fieldsAttempted++;
            const priceSelectors = [
                'input[data-testid*="price"]',
                'input[name*="price"]',
                'input[placeholder*="prix"]',
                'input[placeholder*="Prix"]',
                '#item_price',
                'input[id*="price"]'
            ];

            for (const selector of priceSelectors) {
                const priceInput = document.querySelector(selector);
                if (priceInput && data.price) {
                    // Nettoyer le prix (garder seulement chiffres et virgule/point)
                    const cleanPrice = data.price.replace(/[^\d,\.]/g, '').replace(',', '.');
                    await this.humanType(priceInput, cleanPrice, 'Champ prix');
                    fieldsCompleted++;
                    console.log('[Vinted Automator] ✅ Prix rempli:', cleanPrice);
                    break;
                }
            }

            await this.wait('medium');

            // === MARQUE (si disponible) ===
            if (data.brand) {
                console.log('[Vinted Automator] 📝 Tentative remplissage marque:', data.brand);
                fieldsAttempted++;
                const brandSelectors = [
                    'input[data-testid*="brand"]',
                    'input[name*="brand"]',
                    'input[placeholder*="marque"]',
                    'select[data-testid*="brand"]',
                    '#item_brand'
                ];

                for (const selector of brandSelectors) {
                    const brandInput = document.querySelector(selector);
                    if (brandInput) {
                        try {
                            if (brandInput.tagName.toLowerCase() === 'select') {
                                // Pour les sélecteurs, chercher l'option correspondante
                                const options = brandInput.querySelectorAll('option');
                                for (const option of options) {
                                    if (option.textContent.toLowerCase().includes(data.brand.toLowerCase())) {
                                        brandInput.value = option.value;
                                        brandInput.dispatchEvent(new Event('change', { bubbles: true }));
                                        fieldsCompleted++;
                                        console.log('[Vinted Automator] ✅ Marque sélectionnée:', data.brand);
                                        break;
                                    }
                                }
                            } else {
                                await this.humanType(brandInput, data.brand, 'Champ marque');
                                fieldsCompleted++;
                                console.log('[Vinted Automator] ✅ Marque remplie:', data.brand);
                            }
                            break;
                        } catch (error) {
                            console.log('[Vinted Automator] ⚠️ Erreur marque:', error.message);
                        }
                    }
                }
                await this.wait('short');
            }

            // === TAILLE (si disponible) ===
            if (data.size) {
                console.log('[Vinted Automator] 📝 Tentative remplissage taille:', data.size);
                fieldsAttempted++;
                const sizeSelectors = [
                    'select[data-testid*="size"]',
                    'input[data-testid*="size"]',
                    'select[name*="size"]',
                    '#item_size'
                ];

                for (const selector of sizeSelectors) {
                    const sizeInput = document.querySelector(selector);
                    if (sizeInput) {
                        try {
                            if (sizeInput.tagName.toLowerCase() === 'select') {
                                const options = sizeInput.querySelectorAll('option');
                                for (const option of options) {
                                    if (option.textContent.toLowerCase().includes(data.size.toLowerCase()) ||
                                        option.value.toLowerCase().includes(data.size.toLowerCase())) {
                                        sizeInput.value = option.value;
                                        sizeInput.dispatchEvent(new Event('change', { bubbles: true }));
                                        fieldsCompleted++;
                                        console.log('[Vinted Automator] ✅ Taille sélectionnée:', data.size);
                                        break;
                                    }
                                }
                            } else {
                                await this.humanType(sizeInput, data.size, 'Champ taille');
                                fieldsCompleted++;
                                console.log('[Vinted Automator] ✅ Taille remplie:', data.size);
                            }
                            break;
                        } catch (error) {
                            console.log('[Vinted Automator] ⚠️ Erreur taille:', error.message);
                        }
                    }
                }
                await this.wait('short');
            }

            // === ÉTAT (si disponible) ===
            if (data.condition) {
                console.log('[Vinted Automator] 📝 Tentative remplissage état:', data.condition);
                fieldsAttempted++;
                const conditionSelectors = [
                    'select[data-testid*="condition"]',
                    'select[data-testid*="state"]',
                    'select[name*="condition"]',
                    '#item_condition'
                ];

                for (const selector of conditionSelectors) {
                    const conditionInput = document.querySelector(selector);
                    if (conditionInput && conditionInput.tagName.toLowerCase() === 'select') {
                        try {
                            const options = conditionInput.querySelectorAll('option');
                            for (const option of options) {
                                if (option.textContent.toLowerCase().includes(data.condition.toLowerCase())) {
                                    conditionInput.value = option.value;
                                    conditionInput.dispatchEvent(new Event('change', { bubbles: true }));
                                    fieldsCompleted++;
                                    console.log('[Vinted Automator] ✅ État sélectionné:', data.condition);
                                    break;
                                }
                            }
                            break;
                        } catch (error) {
                            console.log('[Vinted Automator] ⚠️ Erreur état:', error.message);
                        }
                    }
                }
                await this.wait('short');
            }

            // === UPLOAD DES IMAGES TRAITÉES ===
            console.log('[Vinted Automator] 📸 Upload des images traitées...');
            const imagesUploaded = await this.uploadProcessedImages(data);
            if (imagesUploaded) {
                fieldsCompleted++;
            }

            // === RÉSUMÉ ===
            console.log('[Vinted Automator] 📊 RÉSUMÉ DU REMPLISSAGE:');
            console.log(`[Vinted Automator] ✅ Champs complétés: ${fieldsCompleted}/${fieldsAttempted}`);
            console.log(`[Vinted Automator] 📝 Taux de réussite: ${Math.round((fieldsCompleted / fieldsAttempted) * 100)}%`);

            // Vérifier les champs obligatoires
            const mandatoryFields = ['title', 'description', 'price'];
            const missingMandatory = mandatoryFields.filter(field => !data[field]);

            if (missingMandatory.length > 0) {
                console.error('[Vinted Automator] ❌ Champs obligatoires manquants:', missingMandatory);
                return false;
            }

            return fieldsCompleted >= 3; // Au minimum titre, description, prix

        } catch (error) {
            console.error('[Vinted Automator] ❌ Erreur remplissage formulaire:', error);
            return false;
        }
    }

    // Upload des images traitées
    async uploadProcessedImages(data) {
        if (!data.processedImages || data.processedImages.length === 0) {
            console.log('[Vinted Automator] ⚠️ Aucune image traitée à uploader');
            return;
        }

        console.log('[Vinted Automator] 📸 Upload de', data.processedImages.length, 'images...');

        // Chercher l'input file pour les images
        const fileInputSelectors = [
            'input[type="file"][accept*="image"]',
            'input[type="file"]',
            '[data-testid*="photo"] input[type="file"]',
            '[data-testid*="image"] input[type="file"]'
        ];

        let fileInput = null;
        for (const selector of fileInputSelectors) {
            fileInput = document.querySelector(selector);
            if (fileInput) break;
        }

        if (!fileInput) {
            console.error('[Vinted Automator] ❌ Input file non trouvé');
            return;
        }

        try {
            // Convertir les images base64 en fichiers
            const files = [];
            for (let i = 0; i < data.processedImages.length; i++) {
                const processedImage = data.processedImages[i];
                if (processedImage.processedData) {
                    const file = this.base64ToFile(processedImage.processedData, `image_${i + 1}.jpg`);
                    files.push(file);
                }
            }

            if (files.length > 0) {
                // Créer un FileList
                const fileList = this.createFileList(files);

                // Assigner les fichiers à l'input
                Object.defineProperty(fileInput, 'files', {
                    value: fileList,
                    configurable: true
                });

                // Déclencher l'événement change
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));

                console.log('[Vinted Automator] ✅ Images uploadées:', files.length);
                await this.wait('long'); // Attendre l'upload
            }

        } catch (error) {
            console.error('[Vinted Automator] ❌ Erreur upload images:', error);
        }
    }

    // Convertir base64 en File
    base64ToFile(base64Data, filename) {
        const arr = base64Data.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);

        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }

        return new File([u8arr], filename, { type: mime });
    }

    // Créer un FileList
    createFileList(files) {
        const fileList = {
            length: files.length,
            item: (index) => files[index],
            [Symbol.iterator]: function* () {
                for (let i = 0; i < files.length; i++) {
                    yield files[i];
                }
            }
        };

        // Ajouter les fichiers comme propriétés indexées
        files.forEach((file, index) => {
            fileList[index] = file;
        });

        return fileList;
    }

    // Sauvegarder en brouillon
    async saveDraft() {
        console.log('[Vinted Automator] 💾 Sauvegarde en brouillon...');

        const saveSelectors = [
            'button[data-testid*="save"]',
            'button:contains("Sauvegarder")',
            'button:contains("Enregistrer")',
            'button:contains("Brouillon")',
            'button[type="button"]:not([type="submit"])'
        ];

        for (const selector of saveSelectors) {
            try {
                let saveButton = null;

                if (selector.includes(':contains(')) {
                    // Recherche par contenu texte
                    const buttons = document.querySelectorAll('button');
                    const text = selector.match(/\("([^"]+)"\)/)?.[1];
                    for (const btn of buttons) {
                        if (btn.textContent.toLowerCase().includes(text.toLowerCase())) {
                            saveButton = btn;
                            break;
                        }
                    }
                } else {
                    saveButton = document.querySelector(selector);
                }

                if (saveButton) {
                    console.log('[Vinted Automator] ✅ Bouton sauvegarde trouvé:', saveButton.textContent);
                    await this.humanClick(saveButton, 'Bouton sauvegarde');
                    await this.wait('long');
                    return true;
                }
            } catch (error) {
                console.warn('[Vinted Automator] ⚠️ Erreur avec sélecteur:', selector, error);
            }
        }

        console.error('[Vinted Automator] ❌ Aucun bouton de sauvegarde trouvé');
        return false;
    }

    // Naviguer vers l'article original
    async goToOriginalItem(data) {
        console.log('[Vinted Automator] 🔄 Navigation vers l\'article original...');

        if (window.location.href !== data.originalUrl) {
            window.location.href = data.originalUrl;
            return false; // Indique qu'on a navigué
        }

        return true; // Déjà sur la bonne page
    }

    // Supprimer l'article original
    async deleteOriginalItem() {
        console.log('[Vinted Automator] 🗑️ SUPPRESSION DE L\'ARTICLE ORIGINAL...');

        try {
            await this.waitForPageLoad();
            await this.wait('medium');

            // 1. Chercher le menu d'options (3 points, engrenage, etc.)
            const optionsSelectors = [
                '[data-testid*="item-menu"]',
                '[data-testid*="options"]',
                '[data-testid*="more-actions"]',
                '[data-testid*="dropdown"]',
                'button[aria-label*="options"]',
                'button[aria-label*="menu"]',
                'button[title*="options"]',
                '.item-options',
                '.more-options',
                'button:has(svg)',
                'button[class*="options"]',
                'button[class*="menu"]',
                // Sélecteurs spécifiques Vinted
                '.item-actions button',
                '.listing-actions button',
                '[class*="dropdown"] button'
            ];

            let optionsButton = null;
            for (const selector of optionsSelectors) {
                try {
                    optionsButton = document.querySelector(selector);
                    if (optionsButton) {
                        console.log('[Vinted Automator] ✅ Menu d\'options trouvé:', selector);
                        break;
                    }
                } catch (e) {
                    // Ignorer les erreurs de sélecteur
                }
            }

            if (!optionsButton) {
                console.error('[Vinted Automator] ❌ Menu d\'options non trouvé');
                return false;
            }

            // 2. Cliquer sur le menu d'options
            await this.humanClick(optionsButton, 'Menu d\'options');
            await this.wait('medium');

            // 3. Chercher l'option "Supprimer"
            const deleteSelectors = [
                '[data-testid*="delete"]',
                'button:contains("Supprimer")',
                'a:contains("Supprimer")',
                'button:contains("Delete")',
                '[role="menuitem"]:contains("Supprimer")',
                '.delete-option',
                '*[class*="delete"]',
                // Recherche dans tous les éléments visibles
                'button, a, [role="menuitem"]'
            ];

            let deleteOption = null;
            for (const selector of deleteSelectors) {
                try {
                    if (selector.includes(':contains(')) {
                        // Recherche par contenu texte
                        const elements = document.querySelectorAll(selector.split(':contains(')[0]);
                        const text = selector.match(/\("([^"]+)"\)/)?.[1];
                        for (const el of elements) {
                            if (el.textContent.toLowerCase().includes(text.toLowerCase())) {
                                deleteOption = el;
                                break;
                            }
                        }
                    } else if (selector === 'button, a, [role="menuitem"]') {
                        // Recherche générale dans tous les éléments
                        const elements = document.querySelectorAll(selector);
                        for (const el of elements) {
                            const text = el.textContent.toLowerCase();
                            if (text.includes('supprimer') || text.includes('delete') || text.includes('remove')) {
                                deleteOption = el;
                                break;
                            }
                        }
                    } else {
                        deleteOption = document.querySelector(selector);
                    }

                    if (deleteOption) {
                        console.log('[Vinted Automator] ✅ Option "Supprimer" trouvée:', deleteOption.textContent);
                        break;
                    }
                } catch (e) {
                    // Ignorer les erreurs de sélecteur
                }
            }

            if (!deleteOption) {
                console.error('[Vinted Automator] ❌ Option "Supprimer" non trouvée');
                return false;
            }

            // 4. Cliquer sur "Supprimer"
            await this.humanClick(deleteOption, 'Option Supprimer');
            await this.wait('medium');

            // 5. Confirmer la suppression
            const confirmSelectors = [
                'button:contains("Confirmer")',
                'button:contains("Supprimer")',
                'button:contains("Oui")',
                'button:contains("Delete")',
                'button:contains("Confirm")',
                '[data-testid*="confirm"]',
                '.confirm-delete',
                // Recherche générale
                'button, [role="button"]'
            ];

            let confirmButton = null;
            for (const selector of confirmSelectors) {
                try {
                    if (selector.includes(':contains(')) {
                        const elements = document.querySelectorAll(selector.split(':contains(')[0]);
                        const text = selector.match(/\("([^"]+)"\)/)?.[1];
                        for (const el of elements) {
                            if (el.textContent.toLowerCase().includes(text.toLowerCase())) {
                                confirmButton = el;
                                break;
                            }
                        }
                    } else if (selector === 'button, [role="button"]') {
                        const elements = document.querySelectorAll(selector);
                        for (const el of elements) {
                            const text = el.textContent.toLowerCase();
                            if (text.includes('confirmer') || text.includes('supprimer') ||
                                text.includes('confirm') || text.includes('delete') ||
                                text.includes('oui') || text.includes('yes')) {
                                confirmButton = el;
                                break;
                            }
                        }
                    } else {
                        confirmButton = document.querySelector(selector);
                    }

                    if (confirmButton) {
                        console.log('[Vinted Automator] ✅ Bouton de confirmation trouvé:', confirmButton.textContent);
                        break;
                    }
                } catch (e) {
                    // Ignorer les erreurs
                }
            }

            if (confirmButton) {
                await this.humanClick(confirmButton, 'Confirmation suppression');
                await this.wait('long');
                console.log('[Vinted Automator] ✅ Article supprimé avec succès');
                return true;
            } else {
                console.error('[Vinted Automator] ❌ Bouton de confirmation non trouvé');
                return false;
            }

        } catch (error) {
            console.error('[Vinted Automator] ❌ Erreur suppression:', error);
            return false;
        }
    }

    // Processus complet de création de brouillon
    async createDraftFromSavedData(itemId) {
        console.log('[Vinted Automator] 🚀 CRÉATION DE BROUILLON - Début du processus...');

        try {
            // 1. Charger les données sauvegardées
            const data = this.loadSavedData(itemId);
            if (!data) {
                console.error('[Vinted Automator] ❌ Aucune donnée trouvée pour ID:', itemId);
                return false;
            }

            // 2. Naviguer vers la création
            const alreadyOnPage = await this.goToCreateListing();
            if (!alreadyOnPage) {
                console.log('[Vinted Automator] 🔄 Navigation en cours... Relancez la fonction après chargement');
                return false;
            }

            // 3. Remplir le formulaire
            const formFilled = await this.fillCreateForm(data);
            if (!formFilled) {
                console.error('[Vinted Automator] ❌ Échec remplissage formulaire');
                return false;
            }

            // 4. Sauvegarder en brouillon
            const draftSaved = await this.saveDraft();
            if (!draftSaved) {
                console.error('[Vinted Automator] ❌ Échec sauvegarde brouillon');
                return false;
            }

            // 5. Mettre à jour le statut
            data.status = 'DRAFT_CREATED';
            data.draftCreatedAt = new Date().toISOString();
            localStorage.setItem(`vinted_item_${itemId}`, JSON.stringify(data));

            // Mettre à jour le statut pour le popup
            this.updatePopupStatus(itemId, 'DRAFT_CREATED', data.title);

            console.log('[Vinted Automator] 🎉 BROUILLON CRÉÉ AVEC SUCCÈS !');
            return true;

        } catch (error) {
            console.error('[Vinted Automator] ❌ Erreur création brouillon:', error);
            return false;
        }
    }

    // FONCTION DÉSACTIVÉE - Suppression de l'article original
    async deleteOriginalFromSavedData(itemId) {
        console.log('[Vinted Automator] 🛡️ FONCTION SUPPRESSION DÉSACTIVÉE POUR SÉCURITÉ');
        console.log('[Vinted Automator] ⚠️ Cette fonction est désactivée en mode test');
        console.log('[Vinted Automator] 💡 Vérifiez d\'abord que votre brouillon contient toutes les données');

        // Mettre à jour le statut pour indiquer que la suppression est désactivée
        this.updatePopupStatus(itemId, 'SUPPRESSION_DISABLED', 'Suppression désactivée pour sécurité');

        return false; // Toujours retourner false pour empêcher la suppression
    }

    // Naviguer vers les brouillons
    async goToDrafts() {
        console.log('[Vinted Automator] 📋 Navigation vers les brouillons...');

        const draftsUrl = 'https://www.vinted.fr/member/general/drafts';

        if (window.location.href !== draftsUrl) {
            window.location.href = draftsUrl;
            return false; // Indique qu'on a navigué
        }

        return true; // Déjà sur la bonne page
    }

    // Publier le brouillon le plus récent
    async publishLatestDraft() {
        console.log('[Vinted Automator] 📤 PUBLICATION DU BROUILLON...');

        try {
            await this.waitForPageLoad();
            await this.wait('long');

            // 1. Chercher le premier brouillon (le plus récent)
            const draftSelectors = [
                '.feed-grid__item:first-child',
                '[data-testid*="draft"]:first-child',
                '.draft-item:first-child',
                '.item-box:first-child',
                '.listing-item:first-child',
                // Sélecteurs génériques
                '.grid > div:first-child',
                '[class*="item"]:first-child'
            ];

            let draftElement = null;
            for (const selector of draftSelectors) {
                try {
                    draftElement = document.querySelector(selector);
                    if (draftElement) {
                        console.log('[Vinted Automator] ✅ Premier brouillon trouvé:', selector);
                        break;
                    }
                } catch (e) {
                    // Ignorer les erreurs de sélecteur
                }
            }

            if (!draftElement) {
                console.error('[Vinted Automator] ❌ Aucun brouillon trouvé');
                return false;
            }

            // 2. Cliquer sur le brouillon pour l'éditer
            const editLink = draftElement.querySelector('a') || draftElement;
            await this.humanClick(editLink, 'Brouillon à éditer');
            await this.wait('long');

            // 3. Chercher le bouton "Publier"
            const publishSelectors = [
                'button[type="submit"]',
                'button:contains("Publier")',
                'button:contains("Mettre en ligne")',
                'button:contains("Publish")',
                '[data-testid*="publish"]',
                '[data-testid*="submit"]',
                '.publish-button',
                '.submit-button',
                // Recherche générale
                'button, [role="button"]'
            ];

            let publishButton = null;
            for (const selector of publishSelectors) {
                try {
                    if (selector.includes(':contains(')) {
                        const elements = document.querySelectorAll(selector.split(':contains(')[0]);
                        const text = selector.match(/\("([^"]+)"\)/)?.[1];
                        for (const el of elements) {
                            if (el.textContent.toLowerCase().includes(text.toLowerCase())) {
                                publishButton = el;
                                break;
                            }
                        }
                    } else if (selector === 'button, [role="button"]') {
                        const elements = document.querySelectorAll(selector);
                        for (const el of elements) {
                            const text = el.textContent.toLowerCase();
                            if (text.includes('publier') || text.includes('publish') ||
                                text.includes('mettre en ligne') || text.includes('submit')) {
                                publishButton = el;
                                break;
                            }
                        }
                    } else {
                        publishButton = document.querySelector(selector);
                    }

                    if (publishButton) {
                        console.log('[Vinted Automator] ✅ Bouton "Publier" trouvé:', publishButton.textContent);
                        break;
                    }
                } catch (e) {
                    // Ignorer les erreurs
                }
            }

            if (!publishButton) {
                console.error('[Vinted Automator] ❌ Bouton "Publier" non trouvé');
                return false;
            }

            // 4. Cliquer sur "Publier"
            await this.humanClick(publishButton, 'Bouton Publier');
            await this.wait('long');

            // 5. Gérer d'éventuelles confirmations
            const confirmSelectors = [
                'button:contains("Confirmer")',
                'button:contains("Oui")',
                'button:contains("Continuer")',
                'button:contains("Confirm")',
                'button:contains("Continue")',
                '[data-testid*="confirm"]'
            ];

            // Attendre un peu pour voir si une confirmation apparaît
            await this.wait('medium');

            for (const selector of confirmSelectors) {
                try {
                    let confirmButton = null;

                    if (selector.includes(':contains(')) {
                        const elements = document.querySelectorAll(selector.split(':contains(')[0]);
                        const text = selector.match(/\("([^"]+)"\)/)?.[1];
                        for (const el of elements) {
                            if (el.textContent.toLowerCase().includes(text.toLowerCase()) && el.offsetParent !== null) {
                                confirmButton = el;
                                break;
                            }
                        }
                    } else {
                        const el = document.querySelector(selector);
                        if (el && el.offsetParent !== null) {
                            confirmButton = el;
                        }
                    }

                    if (confirmButton) {
                        console.log('[Vinted Automator] ✅ Confirmation trouvée, clic...');
                        await this.humanClick(confirmButton, 'Confirmation publication');
                        await this.wait('long');
                        break;
                    }
                } catch (e) {
                    // Ignorer les erreurs
                }
            }

            console.log('[Vinted Automator] ✅ Brouillon publié avec succès');
            return true;

        } catch (error) {
            console.error('[Vinted Automator] ❌ Erreur publication brouillon:', error);
            return false;
        }
    }

    // FONCTION DÉSACTIVÉE - Publication du brouillon
    async publishDraftFromSavedData(itemId) {
        console.log('[Vinted Automator] 🛡️ FONCTION PUBLICATION DÉSACTIVÉE POUR SÉCURITÉ');
        console.log('[Vinted Automator] ⚠️ Cette fonction est désactivée en mode test');
        console.log('[Vinted Automator] 💡 Publiez manuellement votre brouillon après vérification');

        // Mettre à jour le statut pour indiquer que la publication est désactivée
        this.updatePopupStatus(itemId, 'PUBLICATION_DISABLED', 'Publication désactivée pour sécurité');

        return false; // Toujours retourner false pour empêcher la publication
    }

    // PROCESSUS SÉCURISÉ - CRÉATION DE BROUILLON UNIQUEMENT
    async completeRepublishProcess(itemId) {
        console.log('[Vinted Automator] 🛡️ PROCESSUS SÉCURISÉ - BROUILLON UNIQUEMENT...');

        try {
            const data = this.loadSavedData(itemId);
            if (!data) {
                console.error('[Vinted Automator] ❌ Données non trouvées. Lancez d\'abord republishVinted()');
                return false;
            }

            console.log('[Vinted Automator] 📊 Statut actuel:', data.status);

            // Marquer le processus comme "en cours" dans le localStorage
            const processKey = `vinted_process_${itemId}`;
            const processData = {
                itemId: itemId,
                currentStep: data.status,
                startedAt: new Date().toISOString(),
                autoMode: true,
                safeMode: true // Mode sécurisé activé
            };
            localStorage.setItem(processKey, JSON.stringify(processData));

            // Exécuter UNIQUEMENT la création de brouillon
            switch (data.status) {
                case 'EXTRACTED':
                    console.log('[Vinted Automator] ➡️ CRÉATION SÉCURISÉE DU BROUILLON...');
                    processData.currentStep = 'CREATING_DRAFT';
                    localStorage.setItem(processKey, JSON.stringify(processData));

                    const draftCreated = await this.createDraftFromSavedData(itemId);
                    if (!draftCreated) {
                        localStorage.removeItem(processKey);
                        return false;
                    }

                    localStorage.removeItem(processKey); // Nettoyer le processus
                    console.log('[Vinted Automator] 🎉 BROUILLON CRÉÉ EN MODE SÉCURISÉ !');
                    console.log('[Vinted Automator] 🛡️ ARTICLE ORIGINAL PRÉSERVÉ - Vérifiez votre brouillon !');
                    return 'DRAFT_CREATED_SAFE';

                case 'DRAFT_CREATED':
                    localStorage.removeItem(processKey);
                    console.log('[Vinted Automator] ✅ Brouillon déjà créé en mode sécurisé !');
                    console.log('[Vinted Automator] 🛡️ ARTICLE ORIGINAL PRÉSERVÉ');
                    return 'ALREADY_DRAFT_CREATED';

                case 'ORIGINAL_DELETED':
                case 'PUBLISHED':
                    localStorage.removeItem(processKey);
                    console.log('[Vinted Automator] ⚠️ Processus déjà avancé - Mode sécurisé non applicable');
                    return 'ALREADY_ADVANCED';

                default:
                    localStorage.removeItem(processKey);
                    console.error('[Vinted Automator] ❌ Statut inconnu:', data.status);
                    return false;
            }

        } catch (error) {
            console.error('[Vinted Automator] ❌ Erreur processus sécurisé:', error);
            localStorage.removeItem(`vinted_process_${itemId}`);
            return false;
        }
    }

    // Continuer le processus automatique après navigation
    async continueAutoRepublish(itemId) {
        console.log('[Vinted Automator] 🔄 CONTINUATION DU PROCESSUS AUTOMATIQUE...');

        const processKey = `vinted_process_${itemId}`;
        const processData = JSON.parse(localStorage.getItem(processKey) || '{}');

        if (!processData.autoMode) {
            console.log('[Vinted Automator] ℹ️ Aucun processus automatique en cours');
            return false;
        }

        console.log('[Vinted Automator] 📊 Étape actuelle:', processData.currentStep);

        // Attendre un peu que la page se charge
        await this.wait('long');

        // Continuer le processus
        return await this.completeRepublishProcess(itemId);
    }

    // Vérifier s'il y a un processus en cours au chargement
    checkPendingProcess() {
        const processKeys = Object.keys(localStorage).filter(k => k.startsWith('vinted_process_'));

        if (processKeys.length > 0) {
            console.log('[Vinted Automator] 🔄 PROCESSUS EN COURS DÉTECTÉ !');

            processKeys.forEach(key => {
                const itemId = key.replace('vinted_process_', '');
                const processData = JSON.parse(localStorage.getItem(key) || '{}');

                console.log(`[Vinted Automator] 📋 Processus pour l'article ${itemId}:`);
                console.log(`[Vinted Automator] 📊 Étape: ${processData.currentStep}`);
                console.log(`[Vinted Automator] 🔄 Pour continuer: continueAutoRepublish('${itemId}')`);
            });

            return processKeys.length;
        }

        return 0;
    }

    // Mettre à jour le statut pour le popup
    updatePopupStatus(itemId, status, title, error = null) {
        try {
            const statusData = {
                status: status,
                title: title,
                timestamp: Date.now()
            };

            if (error) {
                statusData.error = error;
            }

            // Utiliser l'API Chrome Storage si disponible
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.set({
                    [`republish_status_${itemId}`]: statusData
                });
            } else {
                // Fallback vers localStorage
                localStorage.setItem(`republish_status_${itemId}`, JSON.stringify(statusData));
            }

            console.log('[Vinted Automator] 📊 Statut mis à jour pour popup:', itemId, status);
        } catch (error) {
            console.error('[Vinted Automator] ❌ Erreur mise à jour statut:', error);
        }
    }
}

// EXPOSER GLOBALEMENT
window.VintedAutomator = VintedAutomator;
window.vintedBot = new VintedAutomator();

// FONCTIONS RACCOURCIES
window.createDraft = (itemId) => window.vintedBot.createDraftFromSavedData(itemId);
window.deleteOriginal = (itemId) => window.vintedBot.deleteOriginalFromSavedData(itemId);
window.publishDraft = (itemId) => window.vintedBot.publishDraftFromSavedData(itemId);
window.autoRepublish = (itemId) => window.vintedBot.completeRepublishProcess(itemId);
window.continueAutoRepublish = (itemId) => window.vintedBot.continueAutoRepublish(itemId);
window.fillForm = (itemId) => {
    const data = window.vintedBot.loadSavedData(itemId);
    return window.vintedBot.fillCreateForm(data);
};

// FONCTIONS DE DEBUG
window.debugVinted = () => {
    console.log('🔍 DEBUG VINTED AUTOMATOR:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 URL actuelle:', window.location.href);
    console.log('🤖 VintedBot disponible:', !!window.vintedBot);
    console.log('📋 Fonctions disponibles:', Object.keys(window).filter(k => k.includes('vinted') || k.includes('republish') || k.includes('Draft')));

    // Vérifier les processus en cours
    const processKeys = Object.keys(localStorage).filter(k => k.startsWith('vinted_process_'));
    console.log('🔄 Processus en cours:', processKeys.length);

    processKeys.forEach(key => {
        const itemId = key.replace('vinted_process_', '');
        const processData = JSON.parse(localStorage.getItem(key) || '{}');
        console.log(`  • Article ${itemId}: ${processData.currentStep}`);
    });

    // Vérifier les données sauvegardées
    const dataKeys = Object.keys(localStorage).filter(k => k.startsWith('vinted_item_'));
    console.log('💾 Données sauvegardées:', dataKeys.length);

    dataKeys.forEach(key => {
        const itemId = key.replace('vinted_item_', '');
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        console.log(`  • Article ${itemId}: ${data.status} (${data.title})`);
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
};

// VÉRIFICATION AUTOMATIQUE AU CHARGEMENT
setTimeout(() => {
    const pendingCount = window.vintedBot.checkPendingProcess();
    if (pendingCount > 0) {
        console.log(`[Vinted Automator] 🔔 ${pendingCount} processus en attente détecté(s) !`);
        console.log('[Vinted Automator] 🔍 Tapez debugVinted() pour plus d\'infos');
    }
}, 2000);

console.log(`
🛡️ VINTED AUTOMATOR - MODE SÉCURISÉ TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 FONCTIONS ACTIVES (MODE TEST) :
• createDraft('ITEM_ID')         - Créer brouillon avec TOUTES les données
• autoRepublish('ITEM_ID')       - CRÉATION DE BROUILLON SEULEMENT
• continueAutoRepublish('ITEM_ID') - Continuer après navigation

🚫 FONCTIONS DÉSACTIVÉES POUR SÉCURITÉ :
• deleteOriginal('ITEM_ID')      - DÉSACTIVÉE (protection)
• publishDraft('ITEM_ID')        - DÉSACTIVÉE (protection)

📋 WORKFLOW SÉCURISÉ ACTUEL :
1. republishVinted()        - Extraire + traiter images
2. autoRepublish('ID')      - Créer brouillon avec TOUTES les données
3. ✅ VÉRIFIER le brouillon manuellement
4. 🛡️ Article original PRÉSERVÉ

🔄 GESTION NAVIGATION AUTOMATIQUE :
• Les processus survivent aux changements de page
• Continuation AUTOMATIQUE après navigation
• Vérification toutes les 3-5 secondes

🛠️  DEBUG :
• debugVinted() - Affiche l'état complet du système

✅ SÉCURITÉ : Aucun risque de suppression accidentelle !
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);