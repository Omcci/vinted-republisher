/**
 * Popup Script - Vinted Auto Republisher PRO
 * Interface utilisateur avec nouvelle architecture de communication
 */

// État du popup
let currentState = {
    currentTab: null,
    scannedItems: [],
    selectedItems: [],
    isProcessing: false
};

// Éléments DOM
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const scanButton = document.getElementById('scanItems');
const republishButton = document.getElementById('republishSelected');
const itemsList = document.getElementById('itemsList');
const itemsContainer = document.getElementById('itemsContainer');
const itemsCount = document.getElementById('itemsCount');
const logs = document.getElementById('logs');
const logsContainer = document.getElementById('logsContainer');

// === INITIALISATION ===
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Popup PRO] 🚀 Initialisation du popup');

    await initializePopup();
    setupEventListeners();
    await checkCurrentPage();
    await checkManualProcess(); // Vérifier si un processus manuel est en cours
});

async function initializePopup() {
    try {
        // Récupérer l'état global du background
        const response = await chrome.runtime.sendMessage({
            action: 'getGlobalState'
        });

        if (response.success) {
            currentState.scannedItems = response.state.scannedItems || [];
            console.log('[Popup PRO] 📊 État récupéré:', currentState.scannedItems.length, 'articles');
            displayFoundItems();
        }
    } catch (error) {
        console.error('[Popup PRO] ❌ Erreur initialisation:', error);
    }
}

// === VÉRIFICATION PAGE COURANTE ===
async function checkCurrentPage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentState.currentTab = tab;

        if (isVintedUrl(tab.url)) {
            console.log('[Popup PRO] ✅ Page Vinted détectée:', tab.url);

            // Informer le background de l'onglet actuel
            await chrome.runtime.sendMessage({
                action: 'setCurrentTab',
                tabId: tab.id,
                url: tab.url
            });

            updateStatus('ready', 'Prêt à scanner les annonces');
            scanButton.disabled = false;
        } else {
            console.log('[Popup PRO] ❌ Page non-Vinted détectée:', tab.url);
            updateStatus('error', 'Veuillez ouvrir une page Vinted');
            scanButton.disabled = true;
        }
    } catch (error) {
        console.error('[Popup PRO] ❌ Erreur vérification page:', error);
        updateStatus('error', 'Erreur de communication');
    }
}

// === GESTION DES ÉVÉNEMENTS ===
function setupEventListeners() {
    if (scanButton) scanButton.addEventListener('click', handleScanItems);
    if (republishButton) republishButton.addEventListener('click', handleRepublishSelected);

    // Event listeners pour le mode manuel (optionnels selon la version du popup.html)
    bindClickIfExists('extractData', handleExtractData);
    bindClickIfExists('createDraft', handleCreateDraft);
    bindClickIfExists('viewDrafts', handleViewDrafts);
}

// === SCAN DES ARTICLES ===
async function handleScanItems() {
    if (currentState.isProcessing) return;

    currentState.isProcessing = true;
    updateStatus('scanning', 'Scan en cours...');
    scanButton.disabled = true;

    try {
        console.log('[Popup PRO] 🔍 Démarrage du scan');

        // D'abord, définir l'onglet actif
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            await chrome.runtime.sendMessage({
                action: 'setCurrentTab',
                tabId: tab.id,
                url: tab.url
            });
        }

        // Envoyer la demande de scan au background
        const response = await chrome.runtime.sendMessage({
            action: 'scanItems'
        });

        if (response.success) {
            console.log('[Popup PRO] ✅ Scan terminé, articles reçus:', response.items?.length || 0);

            // Utiliser directement la réponse
            currentState.scannedItems = response.items || [];
            displayFoundItems();
            updateStatus('ready', `${currentState.scannedItems.length} annonces trouvées`);
        } else {
            throw new Error(response.error || 'Échec du scan');
        }

    } catch (error) {
        console.error('[Popup PRO] ❌ Erreur scan:', error);
        updateStatus('error', `Erreur: ${error.message}`);
    } finally {
        currentState.isProcessing = false;
        scanButton.disabled = false;
    }
}

// Attendre le résultat du scan
async function waitForScanResult() {
    const maxWait = 30000; // 30 secondes max
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const checkInterval = setInterval(async () => {
            try {
                // Vérifier si on a dépassé le timeout
                if (Date.now() - startTime > maxWait) {
                    clearInterval(checkInterval);
                    reject(new Error('Timeout du scan'));
                    return;
                }

                // Récupérer le résultat du storage
                const result = await chrome.storage.local.get(['lastScanResult']);

                if (result.lastScanResult && result.lastScanResult.timestamp > startTime) {
                    clearInterval(checkInterval);

                    console.log('[Popup PRO] 📊 Résultat scan reçu:', result.lastScanResult.items?.length, 'articles');

                    currentState.scannedItems = result.lastScanResult.items || [];
                    displayFoundItems();

                    updateStatus('ready', `${currentState.scannedItems.length} annonces trouvées`);
                    resolve();
                }
            } catch (error) {
                clearInterval(checkInterval);
                reject(error);
            }
        }, 500); // Vérifier toutes les 500ms
    });
}

// === AUTOMATION COMPLÈTE ===
async function handleRepublishSelected() {
    if (currentState.isProcessing || currentState.selectedItems.length === 0) return;

    currentState.isProcessing = true;
    const republishBtn = document.getElementById('republishSelected');
    const spinner = document.getElementById('republishSpinner');

    republishBtn.disabled = true;
    spinner.style.display = 'inline-block';

    // Afficher les logs
    logs.style.display = 'block';
    addLog('info', `🤖 AUTOMATION COMPLÈTE démarrée pour ${currentState.selectedItems.length} article(s)`);
    addLog('info', '🔥 Système comme les vraies extensions d\'automation');
    addLog('info', '⚡ Persistence cross-page avec webNavigation + storage');

    try {
        // Démarrer l'automation pour chaque article sélectionné
        for (const itemIndex of currentState.selectedItems) {
            const item = currentState.scannedItems[itemIndex];
            addLog('info', `🚀 Démarrage automation pour: ${item.title}`);

            // Envoyer la commande d'automation au moteur
            const response = await chrome.runtime.sendMessage({
                action: 'startFullAutomation',
                itemId: item.id,
                item: item,
                settings: {
                    safeMode: true, // Mode sécurisé: création de brouillon seulement
                    autoFill: true,
                    autoSave: true
                }
            });

            if (response && response.success) {
                addLog('success', `✅ Automation lancée pour: ${item.title}`);
                updateStatus('processing', `Automation en cours pour ${item.title}...`);
            } else {
                addLog('error', `❌ Échec lancement pour: ${item.title}`);
            }
        }

        addLog('info', '🎯 Tous les processus ont été lancés');
        addLog('info', '📊 Surveillance automatique en cours...');
        updateStatus('monitoring', 'Automation en cours - Processus surveillés automatiquement');

    } catch (error) {
        console.error('[Popup] Erreur automation:', error);
        addLog('error', `❌ Erreur: ${error.message}`);
        updateStatus('error', 'Erreur lors du lancement de l\'automation');
    } finally {
        republishBtn.disabled = false;
        spinner.style.display = 'none';
        currentState.isProcessing = false;
    }
}

// === GESTIONNAIRES DES ÉTAPES MANUELLES ===
async function handleExtractData() {
    if (!currentState.manualMode || currentState.selectedItems.length === 0) return;

    addLog('info', '📋 Étape 1: Redirection vers l\'article...');

    const itemIndex = currentState.selectedItems[0]; // Premier article sélectionné
    const item = currentState.scannedItems[itemIndex];

    addLog('info', `🔍 Redirection vers: ${item.title}`);
    addLog('info', '📋 INSTRUCTIONS: Une fois sur l\'article, notez/copiez:');
    addLog('info', '• 📝 Titre de l\'article');
    addLog('info', '• 💰 Prix');
    addLog('info', '• 📄 Description complète');
    addLog('info', '• 🏷️ Marque, taille, état, etc.');
    addLog('info', '• 📸 Images (clic droit → Copier l\'image)');
    addLog('warning', '⚠️ Puis cliquez sur l\'icône de l\'extension pour continuer');

    // Sauvegarder l'état dans le storage
    await chrome.storage.local.set({
        manualProcess: {
            currentStep: 'EXTRACT_DONE',
            selectedItem: item,
            timestamp: Date.now()
        }
    });

    // Rediriger dans le même onglet
    window.location.href = item.url;
}

async function handleCreateDraft() {
    addLog('info', '📝 Étape 2: Redirection vers la création...');
    addLog('info', '📋 INSTRUCTIONS: Une fois sur la page de création:');
    addLog('info', '• 📝 Collez le titre copié');
    addLog('info', '• 💰 Saisissez le prix');
    addLog('info', '• 📄 Collez la description');
    addLog('info', '• 🏷️ Remplissez marque, taille, état, etc.');
    addLog('info', '• 📸 Ajoutez les images sauvegardées');
    addLog('info', '• 💾 SAUVEGARDEZ COMME BROUILLON (ne publiez pas)');
    addLog('warning', '⚠️ Puis cliquez sur l\'icône de l\'extension pour voir vos brouillons');

    // Sauvegarder l'état dans le storage
    await chrome.storage.local.set({
        manualProcess: {
            currentStep: 'DRAFT_DONE',
            timestamp: Date.now()
        }
    });

    // Rediriger vers la page de création
    window.location.href = 'https://www.vinted.fr/items/new';
}

async function handleViewDrafts() {
    addLog('info', '👀 Étape 3: Redirection vers vos brouillons...');
    addLog('success', '🎉 Processus manuel terminé !');
    addLog('info', '✅ Vérifiez votre brouillon avant de le publier');
    addLog('info', '📝 Si tout est correct, vous pouvez publier manuellement');

    // Nettoyer le processus dans le storage
    await chrome.storage.local.remove('manualProcess');

    // Rediriger vers les brouillons
    window.location.href = 'https://www.vinted.fr/member/general/drafts';
}

// Attendre le résultat de la republication automatique complète
async function waitForAutoRepublishResult(itemId) {
    const maxWait = 300000; // 5 minutes max par article
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const checkInterval = setInterval(async () => {
            try {
                if (Date.now() - startTime > maxWait) {
                    clearInterval(checkInterval);
                    addLog('warning', '⚠️ Timeout - l\'article pourrait encore être en cours de traitement');
                    resolve(); // Ne pas rejeter, continuer avec le suivant
                    return;
                }

                // Vérifier le statut dans le storage
                const result = await chrome.storage.local.get([`republish_status_${itemId}`]);
                const status = result[`republish_status_${itemId}`];

                if (status && status.timestamp > startTime) {
                    clearInterval(checkInterval);

                    switch (status.status) {
                        case 'DRAFT_CREATED_SAFE':
                        case 'DRAFT_CREATED':
                            addLog('success', `✅ ${status.title}: Brouillon créé avec succès - VÉRIFIEZ-LE !`);
                            addLog('info', `🛡️ ${status.title}: Article original préservé`);
                            break;
                        case 'SUPPRESSION_DISABLED':
                            addLog('warning', `⚠️ ${status.title}: Suppression désactivée pour sécurité`);
                            break;
                        case 'PUBLICATION_DISABLED':
                            addLog('warning', `⚠️ ${status.title}: Publication désactivée pour sécurité`);
                            break;
                        case 'ALREADY_DRAFT_CREATED':
                            addLog('info', `ℹ️ ${status.title}: Brouillon déjà créé`);
                            break;
                        case 'ERROR':
                            addLog('error', `❌ ${status.title}: ${status.error}`);
                            break;
                        default:
                            addLog('info', `🔄 ${status.title}: ${status.status}`);
                            // Continuer à attendre pour les autres statuts
                            setTimeout(() => {
                                waitForAutoRepublishResult(itemId).then(resolve).catch(reject);
                            }, 2000);
                            return;
                    }

                    resolve();
                }
            } catch (error) {
                clearInterval(checkInterval);
                reject(error);
            }
        }, 2000); // Vérifier toutes les 2 secondes
    });
}

// Récupérer les paramètres d'images
function getImageSettings() {
    return {
        cropPercentage: parseInt(document.getElementById('cropPercentage').value),
        addWatermark: document.getElementById('addWatermark').checked,
        watermarkText: document.getElementById('watermarkText').value,
        rotationAngle: parseFloat(document.getElementById('rotationAngle').value),
        qualityReduction: parseInt(document.getElementById('qualityReduction').value)
    };
}

// Attendre le résultat de la republication
async function waitForRepublishResult() {
    const maxWait = 60000; // 1 minute max
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
        const checkInterval = setInterval(async () => {
            try {
                if (Date.now() - startTime > maxWait) {
                    clearInterval(checkInterval);
                    reject(new Error('Timeout de la republication'));
                    return;
                }

                const result = await chrome.storage.local.get(['lastRepublishResult']);

                if (result.lastRepublishResult && result.lastRepublishResult.timestamp > startTime) {
                    clearInterval(checkInterval);

                    if (result.lastRepublishResult.success) {
                        console.log('[Popup PRO] ✅ Republication réussie');
                        addLog('success', result.lastRepublishResult.message || 'Republication réussie');
                    } else {
                        console.log('[Popup PRO] ❌ Republication échouée:', result.lastRepublishResult.error);
                        addLog('error', result.lastRepublishResult.error || 'Republication échouée');
                    }

                    resolve();
                }
            } catch (error) {
                clearInterval(checkInterval);
                reject(error);
            }
        }, 1000); // Vérifier toutes les secondes
    });
}

// === AFFICHAGE DES ARTICLES ===
function displayFoundItems() {
    if (currentState.scannedItems.length === 0) {
        itemsList.style.display = 'none';
        return;
    }

    itemsContainer.innerHTML = '';
    currentState.selectedItems = [];

    currentState.scannedItems.forEach((item, index) => {
        const itemElement = createItemElement(item, index);
        itemsContainer.appendChild(itemElement);
    });

    itemsCount.textContent = currentState.scannedItems.length;
    itemsList.style.display = 'block';
    updateRepublishButton();
}

function createItemElement(item, index) {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
        <input type="checkbox" class="item-checkbox" data-index="${index}">
        <img src="${item.image}" alt="Article" class="item-image" onerror="this.style.display='none'">
        <div class="item-info">
            <div class="item-title">${item.title}</div>
            <div class="item-price">${item.price}</div>
        </div>
    `;

    const checkbox = div.querySelector('.item-checkbox');
    checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            currentState.selectedItems.push(index);
            div.classList.add('selected');
        } else {
            currentState.selectedItems = currentState.selectedItems.filter(i => i !== index);
            div.classList.remove('selected');
        }
        updateRepublishButton();
    });

    return div;
}

// === INTERFACE UTILISATEUR ===
function updateStatus(status, message) {
    statusText.textContent = message;

    // Mettre à jour l'indicateur visuel
    statusIndicator.className = 'status-indicator';
    statusIndicator.classList.add(status);

    console.log('[Popup PRO] 📱 Status:', status, '-', message);
}

function updateRepublishButton() {
    const hasSelection = currentState.selectedItems.length > 0;
    republishButton.disabled = !hasSelection || currentState.isProcessing;

    const republishText = document.getElementById('republishText');
    if (republishText) {
        republishText.textContent = hasSelection
            ? `🛡️ Créer brouillons (${currentState.selectedItems.length})`
            : '🛡️ Créer brouillons (Mode sécurisé)';
    } else {
        republishButton.textContent = hasSelection
            ? `🛡️ Créer brouillons (${currentState.selectedItems.length})`
            : '🛡️ Créer brouillons (Mode sécurisé)';
    }
}

function addLog(type, message) {
    const logDiv = document.createElement('div');
    logDiv.className = `log log-${type}`;
    logDiv.innerHTML = `
        <span class="log-time">${new Date().toLocaleTimeString()}</span>
        <span class="log-message">${message}</span>
    `;

    const target = logsContainer || logs;
    if (!target) return;

    target.appendChild(logDiv);
    target.scrollTop = target.scrollHeight;

    console.log(`[Popup PRO] 📝 Log ${type}:`, message);
}

function bindClickIfExists(id, handler) {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener('click', handler);
    } else {
        console.log(`[Popup PRO] ℹ️ Élément optionnel absent: #${id}`);
    }
}

// === UTILITAIRES ===
function isVintedUrl(url) {
    if (!url) return false;

    const vintedDomains = [
        'vinted.fr', 'vinted.be', 'vinted.nl', 'vinted.de', 'vinted.at',
        'vinted.it', 'vinted.es', 'vinted.pt', 'vinted.com', 'vinted.co.uk',
        'vinted.pl', 'vinted.cz', 'vinted.sk', 'vinted.hu', 'vinted.lt',
        'vinted.lv', 'vinted.ee'
    ];

    return vintedDomains.some(domain => url.includes(domain));
}

// Vérifier si un processus manuel est en cours
async function checkManualProcess() {
    try {
        const result = await chrome.storage.local.get('manualProcess');
        if (result.manualProcess) {
            const process = result.manualProcess;

            // Afficher les logs et le mode manuel
            logs.style.display = 'block';
            const manualSteps = document.getElementById('manualSteps');
            manualSteps.style.display = 'block';

            addLog('info', '🔄 Processus manuel en cours récupéré');

            if (process.currentStep === 'EXTRACT_DONE') {
                addLog('success', '✅ Étape 1 terminée - Données extraites');
                addLog('info', '📝 Prêt pour l\'étape 2: Créer le brouillon');

                const extractBtn = document.getElementById('extractData');
                const createBtn = document.getElementById('createDraft');
                if (extractBtn) extractBtn.disabled = true;
                if (createBtn) createBtn.disabled = false;

                updateStatus('manual', 'Étape 2: Cliquez "Créer le brouillon"');

            } else if (process.currentStep === 'DRAFT_DONE') {
                addLog('success', '✅ Étape 1 et 2 terminées');
                addLog('info', '👀 Prêt pour l\'étape 3: Voir les brouillons');

                const extractBtn = document.getElementById('extractData');
                const createBtn = document.getElementById('createDraft');
                const draftsBtn = document.getElementById('viewDrafts');
                if (extractBtn) extractBtn.disabled = true;
                if (createBtn) createBtn.disabled = true;
                if (draftsBtn) draftsBtn.disabled = false;

                updateStatus('manual', 'Étape 3: Cliquez "Voir les brouillons"');
            }

            currentState.manualMode = true;
        }
    } catch (error) {
        console.error('[Popup] Erreur récupération processus manuel:', error);
    }
}

console.log('[Popup PRO] 🎯 Popup professionnel initialisé');