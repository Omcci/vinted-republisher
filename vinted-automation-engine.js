/**
 * VINTED AUTOMATION ENGINE - Le vrai moteur d'automation
 * Inspiré des meilleures extensions d'automation (Action Replay, Automa, etc.)
 * 
 * FONCTIONNEMENT:
 * 1. Stockage persistant des processus avec chrome.storage.local
 * 2. Détection automatique des changements de page via webNavigation
 * 3. Continuation automatique des processus en cours
 * 4. Gestion robuste des erreurs et timeouts
 */

console.log('[Vinted Automation Engine] 🤖 MOTEUR D\'AUTOMATION ACTIVÉ');

// 🎯 CONSTANTES DE CONFIGURATION
const CONFIG = {
    PROCESS_KEY_PREFIX: 'vinted_auto_process_',
    ITEM_DATA_PREFIX: 'vinted_item_data_',
    MAX_WAIT_TIME: 30000, // 30 secondes max d'attente
    RETRY_DELAY: 2000,     // 2 secondes entre les tentatives
    MAX_RETRIES: 5
};

// 🔄 TYPES DE PROCESSUS SUPPORTÉS
const PROCESS_TYPES = {
    EXTRACT_AND_CREATE: 'extract_and_create',
    NAVIGATE_TO_ITEM: 'navigate_to_item',
    CREATE_DRAFT: 'create_draft',
    FILL_FORM: 'fill_form',
    SAVE_DRAFT: 'save_draft'
};

// 📋 ÉTAT GLOBAL DU PROCESSUS
let currentProcess = null;
let processTimeout = null;

/**
 * 🚀 POINT D'ENTRÉE PRINCIPAL - Auto-démarrage
 */
(function initializeAutomationEngine() {
    console.log('[Automation Engine] 🔄 Initialisation...');

    // Écouter les messages du background script
    chrome.runtime.onMessage.addListener(handleBackgroundMessage);

    // Écouter les messages window.postMessage du background script
    window.addEventListener('message', handleWindowMessage);

    // Vérifier s'il y a un processus en cours à reprendre
    checkForPendingProcess();

    console.log('[Automation Engine] ✅ Moteur prêt - En attente d\'instructions');

    // Test de connectivité
    window.VINTED_AUTOMATION_READY = true;
    console.log('[Automation Engine] 🎯 MOTEUR PRÊT - window.VINTED_AUTOMATION_READY = true');
})();

/**
 * 📨 GESTION DES MESSAGES DU BACKGROUND SCRIPT
 */
function handleBackgroundMessage(request, sender, sendResponse) {
    console.log('[Automation Engine] 📨 Message reçu:', request.action);

    switch (request.action) {
        case 'pageLoaded':
            handlePageLoaded(request);
            break;

        case 'startAutomation':
            startAutomationProcess(request.itemId, request.settings);
            break;

        case 'stopAutomation':
            stopAutomationProcess();
            break;

        case 'getProcessStatus':
            sendResponse({ process: currentProcess });
            break;
    }
}

/**
 * 📬 GESTION DES MESSAGES WINDOW.POSTMESSAGE
 */
function handleWindowMessage(event) {
    // Vérifier que le message vient de notre extension
    if (event.source !== window) return;

    console.log('[Automation Engine] 📬 Message window reçu:', event.data);

    if (event.data.type === 'VINTED_AUTOMATION_START') {
        console.log('[Automation Engine] 🚀 Commande automation reçue via postMessage pour item:', event.data.itemId);
        startAutomationProcess(event.data.itemId, event.data.settings);
    }
}

/**
 * 🔄 GESTION DES CHANGEMENTS DE PAGE
 */
async function handlePageLoaded(pageInfo) {
    console.log('[Automation Engine] 📄 Nouvelle page détectée:', pageInfo.url);

    // Vérifier s'il y a un processus en cours à continuer
    await checkForPendingProcess();
}

/**
 * 🔍 VÉRIFICATION DES PROCESSUS EN ATTENTE
 */
async function checkForPendingProcess() {
    try {
        // Récupérer tous les processus stockés
        const storage = await chrome.storage.local.get(null);
        const processKeys = Object.keys(storage).filter(key =>
            key.startsWith(CONFIG.PROCESS_KEY_PREFIX)
        );

        if (processKeys.length === 0) {
            console.log('[Automation Engine] ℹ️ Aucun processus en attente');
            return;
        }

        // Prendre le premier processus trouvé
        const processKey = processKeys[0];
        const processData = storage[processKey];

        console.log('[Automation Engine] 🔄 Processus trouvé:', processData);

        // Reprendre le processus
        await continueProcess(processData);

    } catch (error) {
        console.error('[Automation Engine] ❌ Erreur lors de la vérification:', error);
    }
}

/**
 * 🚀 DÉMARRAGE D'UN NOUVEAU PROCESSUS D'AUTOMATION
 */
async function startAutomationProcess(itemId, settings = {}) {
    console.log('[Automation Engine] 🚀 Démarrage automation pour item:', itemId);

    const processId = `${CONFIG.PROCESS_KEY_PREFIX}${itemId}`;
    const processData = {
        itemId,
        settings,
        currentStep: PROCESS_TYPES.NAVIGATE_TO_ITEM,
        startTime: Date.now(),
        retryCount: 0,
        status: 'running'
    };

    // Sauvegarder le processus
    await chrome.storage.local.set({ [processId]: processData });

    currentProcess = processData;

    // Démarrer le processus
    await continueProcess(processData);
}

/**
 * ⏭️ CONTINUATION D'UN PROCESSUS
 */
async function continueProcess(processData) {
    currentProcess = processData;

    console.log('[Automation Engine] ⏭️ Continuation processus, étape:', processData.currentStep);

    try {
        switch (processData.currentStep) {
            case PROCESS_TYPES.NAVIGATE_TO_ITEM:
                await handleNavigateToItem(processData);
                break;

            case PROCESS_TYPES.EXTRACT_AND_CREATE:
                await handleExtractAndCreate(processData);
                break;

            case PROCESS_TYPES.CREATE_DRAFT:
                await handleCreateDraft(processData);
                break;

            case PROCESS_TYPES.FILL_FORM:
                await handleFillForm(processData);
                break;

            case PROCESS_TYPES.SAVE_DRAFT:
                await handleSaveDraft(processData);
                break;

            default:
                console.error('[Automation Engine] ❌ Étape inconnue:', processData.currentStep);
                await completeProcess(processData, 'error');
        }

    } catch (error) {
        console.error('[Automation Engine] ❌ Erreur dans le processus:', error);
        await handleProcessError(processData, error);
    }
}

/**
 * 🧭 ÉTAPE 1: NAVIGATION VERS L'ARTICLE
 */
async function handleNavigateToItem(processData) {
    const targetUrl = `https://www.vinted.fr/items/${processData.itemId}`;

    if (window.location.href.includes(`/items/${processData.itemId}`)) {
        console.log('[Automation Engine] ✅ Déjà sur la page de l\'article');

        // Passer à l'étape suivante
        processData.currentStep = PROCESS_TYPES.EXTRACT_AND_CREATE;
        await updateProcess(processData);
        await continueProcess(processData);

    } else {
        console.log('[Automation Engine] 🔄 Navigation vers:', targetUrl);

        // Sauvegarder l'état avant navigation
        await updateProcess(processData);

        // Naviguer vers l'article
        window.location.href = targetUrl;
        // Le processus continuera automatiquement via webNavigation
    }
}

/**
 * 📊 ÉTAPE 2: EXTRACTION DES DONNÉES ET CRÉATION
 */
async function handleExtractAndCreate(processData) {
    console.log('[Automation Engine] 📊 Extraction des données...');

    try {
        // Attendre que la page soit complètement chargée
        await waitForPageReady();

        // Extraire les données de l'article
        const itemData = await extractItemData();

        if (!itemData || !itemData.title) {
            throw new Error('Impossible d\'extraire les données de l\'article');
        }

        console.log('[Automation Engine] ✅ Données extraites:', itemData.title);

        // Sauvegarder les données
        const dataKey = `${CONFIG.ITEM_DATA_PREFIX}${processData.itemId}`;
        await chrome.storage.local.set({ [dataKey]: itemData });

        // Passer à l'étape suivante
        processData.currentStep = PROCESS_TYPES.CREATE_DRAFT;
        await updateProcess(processData);

        // Navigation vers la page de création
        console.log('[Automation Engine] 🔄 Navigation vers la création...');
        window.location.href = 'https://www.vinted.fr/items/new';

    } catch (error) {
        console.error('[Automation Engine] ❌ Erreur extraction:', error);
        await handleProcessError(processData, error);
    }
}

/**
 * 📝 ÉTAPE 3: CRÉATION DU BROUILLON
 */
async function handleCreateDraft(processData) {
    console.log('[Automation Engine] 📝 Création du brouillon...');

    try {
        // Vérifier qu'on est sur la page de création
        if (!window.location.href.includes('/items/new')) {
            console.log('[Automation Engine] ⚠️ Pas sur la page de création');
            return;
        }

        // Attendre que le formulaire soit chargé
        await waitForFormReady();

        // Passer à l'étape de remplissage
        processData.currentStep = PROCESS_TYPES.FILL_FORM;
        await updateProcess(processData);
        await continueProcess(processData);

    } catch (error) {
        console.error('[Automation Engine] ❌ Erreur création brouillon:', error);
        await handleProcessError(processData, error);
    }
}

/**
 * ✏️ ÉTAPE 4: REMPLISSAGE DU FORMULAIRE
 */
async function handleFillForm(processData) {
    console.log('[Automation Engine] ✏️ Remplissage du formulaire...');

    try {
        // Récupérer les données sauvegardées
        const dataKey = `${CONFIG.ITEM_DATA_PREFIX}${processData.itemId}`;
        const result = await chrome.storage.local.get(dataKey);
        const itemData = result[dataKey];

        if (!itemData) {
            throw new Error('Données de l\'article introuvables');
        }

        // Remplir le formulaire
        await fillFormWithData(itemData);

        // Passer à l'étape de sauvegarde
        processData.currentStep = PROCESS_TYPES.SAVE_DRAFT;
        await updateProcess(processData);
        await continueProcess(processData);

    } catch (error) {
        console.error('[Automation Engine] ❌ Erreur remplissage:', error);
        await handleProcessError(processData, error);
    }
}

/**
 * 💾 ÉTAPE 5: SAUVEGARDE DU BROUILLON
 */
async function handleSaveDraft(processData) {
    console.log('[Automation Engine] 💾 Sauvegarde du brouillon...');

    try {
        // Chercher le bouton de sauvegarde
        const saveButton = await waitForElement([
            'button:contains("Sauvegarder")',
            'button:contains("Enregistrer")',
            'button:contains("Save")',
            '[data-testid*="save"]',
            'button[type="submit"]'
        ]);

        if (saveButton) {
            console.log('[Automation Engine] 💾 Clic sur sauvegarder...');
            saveButton.click();

            // Attendre la sauvegarde
            await new Promise(resolve => setTimeout(resolve, 3000));

            console.log('[Automation Engine] 🎉 PROCESSUS TERMINÉ AVEC SUCCÈS!');
            await completeProcess(processData, 'success');

        } else {
            throw new Error('Bouton de sauvegarde introuvable');
        }

    } catch (error) {
        console.error('[Automation Engine] ❌ Erreur sauvegarde:', error);
        await handleProcessError(processData, error);
    }
}

/**
 * 🔄 MISE À JOUR DU PROCESSUS
 */
async function updateProcess(processData) {
    const processId = `${CONFIG.PROCESS_KEY_PREFIX}${processData.itemId}`;
    processData.lastUpdate = Date.now();
    await chrome.storage.local.set({ [processId]: processData });
}

/**
 * ✅ FINALISATION DU PROCESSUS
 */
async function completeProcess(processData, status) {
    console.log('[Automation Engine] ✅ Processus terminé:', status);

    // Nettoyer le stockage
    const processId = `${CONFIG.PROCESS_KEY_PREFIX}${processData.itemId}`;
    const dataKey = `${CONFIG.ITEM_DATA_PREFIX}${processData.itemId}`;

    await chrome.storage.local.remove([processId, dataKey]);

    currentProcess = null;

    if (processTimeout) {
        clearTimeout(processTimeout);
        processTimeout = null;
    }

    // Notifier le background script
    chrome.runtime.sendMessage({
        action: 'processCompleted',
        itemId: processData.itemId,
        status: status,
        timestamp: Date.now()
    });
}

/**
 * ❌ GESTION DES ERREURS DE PROCESSUS
 */
async function handleProcessError(processData, error) {
    processData.retryCount = (processData.retryCount || 0) + 1;

    if (processData.retryCount < CONFIG.MAX_RETRIES) {
        console.log(`[Automation Engine] 🔄 Tentative ${processData.retryCount}/${CONFIG.MAX_RETRIES}`);

        // Attendre avant de réessayer
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));

        // Réessayer
        await updateProcess(processData);
        await continueProcess(processData);

    } else {
        console.error('[Automation Engine] ❌ Échec définitif après', CONFIG.MAX_RETRIES, 'tentatives');
        await completeProcess(processData, 'error');
    }
}

/**
 * ⏹️ ARRÊT FORCÉ DU PROCESSUS
 */
async function stopAutomationProcess() {
    if (currentProcess) {
        console.log('[Automation Engine] ⏹️ Arrêt forcé du processus');
        await completeProcess(currentProcess, 'stopped');
    }
}

// ================== FONCTIONS UTILITAIRES ==================

/**
 * ⏳ ATTENDRE QUE LA PAGE SOIT PRÊTE
 */
async function waitForPageReady() {
    return new Promise((resolve) => {
        if (document.readyState === 'complete') {
            resolve();
        } else {
            window.addEventListener('load', resolve);
        }
    });
}

/**
 * 📋 ATTENDRE QUE LE FORMULAIRE SOIT PRÊT
 */
async function waitForFormReady() {
    return waitForElement([
        'input[data-testid*="title"]',
        'input[name*="title"]',
        'input[placeholder*="titre"]',
        'form'
    ]);
}

/**
 * 🔍 ATTENDRE UN ÉLÉMENT AVEC PLUSIEURS SÉLECTEURS
 */
async function waitForElement(selectors, timeout = CONFIG.MAX_WAIT_TIME) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const check = () => {
            for (const selector of selectors) {
                let element;

                if (selector.includes(':contains(')) {
                    // Gestion des sélecteurs :contains
                    const [baseSelector, text] = selector.split(':contains(');
                    const textToFind = text.replace(/[\(\)"']/g, '');
                    const elements = document.querySelectorAll(baseSelector);

                    for (const el of elements) {
                        if (el.textContent.includes(textToFind)) {
                            element = el;
                            break;
                        }
                    }
                } else {
                    element = document.querySelector(selector);
                }

                if (element) {
                    console.log('[Automation Engine] ✅ Élément trouvé:', selector);
                    resolve(element);
                    return;
                }
            }

            if (Date.now() - startTime > timeout) {
                reject(new Error(`Timeout: Éléments non trouvés après ${timeout}ms`));
                return;
            }

            setTimeout(check, 500);
        };

        check();
    });
}

/**
 * 📊 EXTRACTION DES DONNÉES DE L'ARTICLE
 */
async function extractItemData() {
    const data = {
        title: '',
        price: '',
        description: '',
        brand: '',
        size: '',
        condition: '',
        color: '',
        images: [],
        extractedAt: new Date().toISOString()
    };

    // Titre
    const titleSelectors = ['h1', '[data-testid*="title"]', '.item-title'];
    for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
            data.title = el.textContent.trim();
            break;
        }
    }

    // Prix
    const priceSelectors = ['[data-testid*="price"]', '.price', '.item-price'];
    for (const selector of priceSelectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
            data.price = el.textContent.trim();
            break;
        }
    }

    // Description
    const descSelectors = ['[data-testid*="description"]', '.description', '.item-description'];
    for (const selector of descSelectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
            data.description = el.textContent.trim();
            break;
        }
    }

    console.log('[Automation Engine] 📊 Données extraites:', {
        title: data.title || 'MANQUANT',
        price: data.price || 'MANQUANT',
        description: data.description ? `${data.description.length} chars` : 'MANQUANT'
    });

    return data;
}

/**
 * ✏️ REMPLISSAGE DU FORMULAIRE AVEC LES DONNÉES
 */
async function fillFormWithData(itemData) {
    console.log('[Automation Engine] ✏️ Remplissage avec:', itemData.title);

    // Titre
    if (itemData.title) {
        const titleInput = await waitForElement([
            'input[data-testid*="title"]',
            'input[name*="title"]',
            'input[placeholder*="titre"]'
        ]);

        if (titleInput) {
            titleInput.focus();
            titleInput.value = '';
            titleInput.value = itemData.title;
            titleInput.dispatchEvent(new Event('input', { bubbles: true }));
            titleInput.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('[Automation Engine] ✅ Titre rempli');
        }
    }

    // Prix
    if (itemData.price) {
        const priceInput = await waitForElement([
            'input[data-testid*="price"]',
            'input[name*="price"]',
            'input[placeholder*="prix"]'
        ]);

        if (priceInput) {
            const cleanPrice = itemData.price.replace(/[^\d,]/g, '');
            priceInput.focus();
            priceInput.value = '';
            priceInput.value = cleanPrice;
            priceInput.dispatchEvent(new Event('input', { bubbles: true }));
            priceInput.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('[Automation Engine] ✅ Prix rempli');
        }
    }

    // Description
    if (itemData.description) {
        const descInput = await waitForElement([
            'textarea[data-testid*="description"]',
            'textarea[name*="description"]',
            'textarea[placeholder*="description"]'
        ]);

        if (descInput) {
            descInput.focus();
            descInput.value = '';
            descInput.value = itemData.description;
            descInput.dispatchEvent(new Event('input', { bubbles: true }));
            descInput.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('[Automation Engine] ✅ Description remplie');
        }
    }

    // Attendre que les champs soient remplis
    await new Promise(resolve => setTimeout(resolve, 1000));
}

console.log('[Vinted Automation Engine] 🎯 MOTEUR PRÊT - Automation niveau PRO!');