/**
 * Background Script - Vinted Auto Republisher PRO
 * 🔥 AUTOMATION COMPLÈTE AVEC PERSISTENCE CROSS-PAGE
 * Architecture: webNavigation + chrome.storage.local pour continuité
 */

console.log('[Background PRO] 🚀 Service worker démarré');

// 🔄 AUTOMATION SYSTEM - Détection automatique des changements de page
chrome.webNavigation.onCompleted.addListener((details) => {
    // Ne traiter que les frames principales (pas les iframes)
    if (details.frameId === 0) {
        console.log('[Automation] 📍 Page loaded:', details.url);

        // Notifier tous les content scripts qu'une page est chargée
        chrome.tabs.sendMessage(details.tabId, {
            action: 'pageLoaded',
            url: details.url,
            timestamp: Date.now()
        }).catch(() => {
            // Ignorer les erreurs si pas de content script
            console.log('[Automation] ℹ️ No content script in tab', details.tabId);
        });
    }
});

// État global simplifié
let globalState = {
    currentTabId: null,
    currentUrl: null,
    scannedItems: [],
    isActive: false
};

// 📬 SYSTÈME DE QUEUE POUR CONTENT SCRIPTS (Solution au problème de communication)
const contentScriptQueues = new Map();

// 🎯 GESTIONNAIRE PRINCIPAL DE MESSAGES
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Background PRO] 📨 Message reçu:', request.action, 'de:', sender.tab ? `onglet-${sender.tab.id}` : 'popup');

    try {
        switch (request.action) {
            // === COMMUNICATION AVEC LE POPUP ===
            case 'getGlobalState':
                sendResponse({ success: true, state: globalState });
                break;

            case 'setCurrentTab':
                globalState.currentTabId = request.tabId;
                globalState.currentUrl = request.url;
                globalState.isActive = true;
                console.log('[Background PRO] 🎯 Onglet actif défini:', request.tabId);
                sendResponse({ success: true });
                break;

            // === ENREGISTREMENT DES CONTENT SCRIPTS ===
            case 'registerContentScript':
                const tabId = sender.tab.id;
                console.log('[Background PRO] 📝 Content script enregistré pour onglet:', tabId);

                if (!contentScriptQueues.has(tabId)) {
                    contentScriptQueues.set(tabId, []);
                }

                sendResponse({ success: true, tabId: tabId });
                break;

            // === SYSTÈME DE POLLING POUR CONTENT SCRIPTS ===
            case 'pollForMessages':
                const pollTabId = sender.tab.id;
                const messages = contentScriptQueues.get(pollTabId) || [];

                // Vider la queue après récupération
                contentScriptQueues.set(pollTabId, []);

                console.log('[Background PRO] 📮 Polling onglet', pollTabId, '- Messages:', messages.length);
                sendResponse({ success: true, messages: messages });
                break;

            // === SCAN DES ARTICLES ===
            case 'scanItems':
                handleScanItems(sendResponse);
                return true; // Réponse asynchrone

            case 'republishItem':
                if (globalState.currentTabId) {
                    console.log('[Background PRO] 🔄 Relais republishItem vers onglet:', globalState.currentTabId);

                    // Ajouter à la queue de l'onglet cible
                    const targetQueue = contentScriptQueues.get(globalState.currentTabId) || [];
                    targetQueue.push({
                        id: Date.now(),
                        action: 'republishItem',
                        data: request,
                        timestamp: Date.now()
                    });
                    contentScriptQueues.set(globalState.currentTabId, targetQueue);

                    sendResponse({
                        success: true,
                        message: `Republication demandée pour onglet ${globalState.currentTabId}`,
                        queued: true
                    });
                } else {
                    sendResponse({ success: false, error: 'Aucun onglet Vinted actif' });
                }
                break;

            // === REPUBLICATION AUTOMATIQUE COMPLÈTE ===
            case 'autoRepublishItem':
                handleAutoRepublishItem(request.item, request.settings, sendResponse);
                return true; // Réponse asynchrone

            case 'startFullAutomation':
                handleFullAutomation(request, sendResponse);
                return true; // Réponse asynchrone

            // === MESSAGES D'AUTOMATION ===
            case 'VINTED_AUTOMATION_RESULTS':
                console.log('[Background PRO] 📊 Réception résultats automation');
                handleAutomationResults(request.results, request.settings);
                sendResponse({ success: true });
                break;

            // === RETOUR CONTENT SCRIPT → POPUP ===
            case 'reportScanResult':
                console.log('[Background PRO] 📊 Résultat scan reçu:', request.items?.length, 'articles');
                globalState.scannedItems = request.items || [];

                // Sauvegarder pour que le popup puisse récupérer
                chrome.storage.local.set({
                    lastScanResult: {
                        items: request.items,
                        timestamp: Date.now(),
                        tabId: sender.tab.id
                    }
                });

                sendResponse({ success: true });
                break;

            case 'reportRepublishResult':
                console.log('[Background PRO] 📊 Résultat republication reçu:', request.success ? 'Succès' : 'Échec');

                // Sauvegarder pour que le popup puisse récupérer
                chrome.storage.local.set({
                    lastRepublishResult: {
                        success: request.success,
                        message: request.message,
                        error: request.error,
                        timestamp: Date.now(),
                        tabId: sender.tab.id
                    }
                });

                sendResponse({ success: true });
                break;

            default:
                console.log('[Background PRO] ❓ Action non reconnue:', request.action);
                sendResponse({ success: false, error: 'Action non reconnue' });
        }
    } catch (error) {
        console.error('[Background PRO] ❌ Erreur traitement message:', error);
        sendResponse({ success: false, error: error.message });
    }
});

// 🔍 INJECTION AUTOMATIQUE DU CONTENT SCRIPT
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && isVintedUrl(tab.url)) {
        injectContentScript(tabId, tab.url);
    }
});

async function injectContentScript(tabId, url) {
    try {
        console.log('[Background PRO] 🎯 Page Vinted détectée:', url);

        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content-professional.js']
        });

        console.log('[Background PRO] ✅ Content script injecté dans onglet', tabId);
    } catch (error) {
        // Script déjà injecté ou autre erreur non critique
        console.log('[Background PRO] ⚠️ Script déjà présent ou erreur:', error.message);
    }
}

// 🌍 DÉTECTION DES DOMAINES VINTED
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

// 🧹 NETTOYAGE DES QUEUES LORS DE FERMETURE D'ONGLETS
chrome.tabs.onRemoved.addListener((tabId) => {
    if (contentScriptQueues.has(tabId)) {
        console.log('[Background PRO] 🗑️ Nettoyage queue onglet fermé:', tabId);
        contentScriptQueues.delete(tabId);
    }

    // Si c'est l'onglet actuel, le désactiver
    if (globalState.currentTabId === tabId) {
        globalState.currentTabId = null;
        globalState.currentUrl = null;
        globalState.isActive = false;
        console.log('[Background PRO] 🔄 Onglet actif fermé, état réinitialisé');
    }
});

// === GESTIONNAIRE REPUBLICATION AUTOMATIQUE COMPLÈTE ===
async function handleAutoRepublishItem(item, settings, sendResponse) {
    console.log('[Background PRO] 🚀 Republication automatique complète:', item.title);

    try {
        if (!globalState.currentTabId) {
            sendResponse({ success: false, error: 'Aucun onglet Vinted actif' });
            return;
        }

        // Mettre à jour le statut initial
        await updateRepublishStatus(item.id, {
            status: 'STARTING',
            title: item.title,
            timestamp: Date.now()
        });

        // Injecter le script d'automatisation directe dans l'onglet
        await chrome.scripting.executeScript({
            target: { tabId: globalState.currentTabId },
            func: startDirectRepublishProcess,
            args: [item, settings]
        });

        sendResponse({
            success: true,
            message: `Processus automatique lancé pour: ${item.title}`
        });

    } catch (error) {
        console.error('[Background PRO] ❌ Erreur republication automatique:', error);

        await updateRepublishStatus(item.id, {
            status: 'ERROR',
            title: item.title,
            error: error.message,
            timestamp: Date.now()
        });

        sendResponse({ success: false, error: error.message });
    }
}

// Fonction injectée dans la page pour démarrer le processus
function startAutoRepublishProcess(item, settings) {
    console.log('[Auto-Republish] 🚀 Démarrage du processus pour:', item.title);

    // Attendre que les scripts soient chargés
    const waitForScripts = () => {
        return new Promise((resolve) => {
            const checkScripts = () => {
                if (window.vinted && window.vintedBot && window.republishVinted && window.autoRepublish) {
                    resolve();
                } else {
                    setTimeout(checkScripts, 1000);
                }
            };
            checkScripts();
        });
    };

    waitForScripts().then(async () => {
        try {
            console.log('[Auto-Republish] ✅ Scripts chargés, démarrage...');

            // 1. Configurer les paramètres d'images si nécessaire
            if (window.vinted.setImageSettings) {
                window.vinted.setImageSettings(settings);
            }

            // 2. Extraire et traiter l'article
            console.log('[Auto-Republish] 📋 Extraction et traitement...');
            const extractResult = await window.republishVinted();

            if (!extractResult) {
                throw new Error('Échec de l\'extraction');
            }

            // 3. Lancer le processus automatique complet
            console.log('[Auto-Republish] 🤖 Lancement du processus automatique...');
            const result = await window.autoRepublish(item.id);

            console.log('[Auto-Republish] ✅ Processus terminé:', result);

        } catch (error) {
            console.error('[Auto-Republish] ❌ Erreur:', error);

            // Mettre à jour le statut d'erreur
            chrome.storage.local.set({
                [`republish_status_${item.id}`]: {
                    status: 'ERROR',
                    title: item.title,
                    error: error.message,
                    timestamp: Date.now()
                }
            });
        }
    });
}

// === GESTIONNAIRE SCAN DES ARTICLES ===
async function handleScanItems(sendResponse) {
    console.log('[Background PRO] 🔍 Démarrage du scan des articles');

    try {
        if (!globalState.currentTabId) {
            sendResponse({ success: false, error: 'Aucun onglet Vinted actif' });
            return;
        }

        // Exécuter le scan direct dans la page
        const results = await chrome.scripting.executeScript({
            target: { tabId: globalState.currentTabId },
            func: performDirectScanInPage
        });

        if (results && results[0] && results[0].result) {
            const scanResult = results[0].result;
            console.log('[Background PRO] 📊 Résultat scan reçu:', scanResult.items?.length, 'articles');

            // Sauvegarder directement dans le background
            await chrome.storage.local.set({
                lastScanResult: {
                    items: scanResult.items || [],
                    timestamp: Date.now(),
                    url: scanResult.url || '',
                    error: scanResult.error
                }
            });

            globalState.scannedItems = scanResult.items || [];

            sendResponse({
                success: true,
                message: `${scanResult.items?.length || 0} articles trouvés`,
                items: scanResult.items || []
            });
        } else {
            throw new Error('Aucun résultat reçu du script');
        }

    } catch (error) {
        console.error('[Background PRO] ❌ Erreur scan:', error);

        // Sauvegarder l'erreur
        await chrome.storage.local.set({
            lastScanResult: {
                items: [],
                error: error.message,
                timestamp: Date.now()
            }
        });

        sendResponse({ success: false, error: error.message });
    }
}

// Fonction directe de scan - sans dépendance aux scripts externes
function performDirectScan() {
    console.log('[Scan] 🔍 SCAN DIRECT - Pas d\'attente, scan immédiat');

    try {
        const items = [];

        // Vérifier si on est sur une page d'annonce individuelle
        if (window.location.href.includes('/items/')) {
            console.log('[Scan] 📄 Page d\'annonce individuelle détectée');

            const match = window.location.href.match(/\/items\/(\d+)/);
            if (match) {
                const itemId = match[1];
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

                console.log('[Scan] ✅ Article individuel trouvé:', title);
            }
        } else {
            // Scanner pour les pages de listing
            console.log('[Scan] 📋 Scan des pages de listing...');

            const selectors = [
                '.feed-grid__item',
                '.item-box',
                '.listing-item',
                '.item',
                '[data-testid*="item"]',
                'article',
                '.item-card'
            ];

            let elements = [];
            for (const selector of selectors) {
                elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    console.log('[Scan] ✅ Éléments trouvés avec:', selector, '(', elements.length, ')');
                    break;
                }
            }

            if (elements.length === 0) {
                console.log('[Scan] ⚠️ Aucun élément trouvé, essai avec sélecteur général...');
                elements = document.querySelectorAll('*[href*="/items/"]').slice(0, 50);
                console.log('[Scan] 📊 Liens trouvés:', elements.length);
            }

            console.log(`[Scan] 📊 Processing ${elements.length} éléments...`);

            elements.forEach((element, index) => {
                try {
                    // Extraire l'ID depuis les liens
                    let itemId = null;
                    let linkElement = element.querySelector('a[href*="/items/"]') || (element.href ? element : null);

                    if (linkElement && linkElement.href) {
                        // Filtrer les liens non-articles (favourite_list, etc.)
                        if (linkElement.href.includes('favourite_list') ||
                            linkElement.href.includes('member/items') ||
                            !linkElement.href.match(/\/items\/\d+/)) {
                            return; // Skip les liens non-articles
                        }

                        const match = linkElement.href.match(/\/items\/(\d+)/);
                        if (match) {
                            itemId = match[1];
                        }
                    }

                    if (!itemId) return; // Skip si pas d'ID

                    // Extraire les autres infos
                    const img = element.querySelector('img');
                    const imageUrl = img ? img.src : null;

                    // Logique améliorée pour prix et titre
                    let price = 'N/A';
                    let title = `Article #${itemId}`;

                    // Chercher le prix d'abord (souvent affiché prominemment)
                    const priceSelectors = [
                        '*[class*="price"]',
                        '[data-testid*="price"]',
                        '.price',
                        '.item-price'
                    ];

                    for (const selector of priceSelectors) {
                        const priceEl = element.querySelector(selector);
                        if (priceEl && priceEl.textContent.trim().match(/\d+[,.]?\d*\s*€/)) {
                            price = priceEl.textContent.trim();
                            break;
                        }
                    }

                    // Chercher le titre (éviter les éléments de prix)
                    const titleSelectors = [
                        '[data-testid*="title"]',
                        '.title',
                        'h3',
                        'h4',
                        '.item-title',
                        '*[class*="title"]'
                    ];

                    for (const selector of titleSelectors) {
                        const titleEl = element.querySelector(selector);
                        if (titleEl && titleEl.textContent.trim() &&
                            !titleEl.textContent.trim().match(/^\d+[,.]?\d*\s*€$/)) {
                            title = titleEl.textContent.trim();
                            break;
                        }
                    }

                    // Si le titre ressemble à un prix, utiliser le lien ou un titre par défaut
                    if (title.match(/^\d+[,.]?\d*\s*€$/)) {
                        const linkText = linkElement.textContent.trim();
                        if (linkText && !linkText.match(/^\d+[,.]?\d*\s*€$/)) {
                            title = linkText;
                        } else {
                            title = `Article #${itemId}`;
                        }
                    }

                    const statusElement = element.querySelector('[data-testid*="status"], .status, *[class*="draft"]');
                    const isDraft = statusElement && statusElement.textContent.includes('Brouillon');

                    // Éviter les doublons
                    const exists = items.find(item => item.id === itemId);
                    if (!exists) {
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
                    console.error('[Scan] ❌ Erreur scan élément:', error);
                }
            });
        }

        console.log('[Scan] ✅ Scan direct terminé:', items.length, 'articles uniques');

        return {
            items: items,
            url: window.location.href,
            timestamp: Date.now()
        };

    } catch (error) {
        console.error('[Scan] ❌ Erreur scan direct:', error);
        return {
            items: [],
            error: error.message,
            url: window.location.href
        };
    }
}



// Fonction directe de republication - sans dépendance aux scripts externes
function startDirectRepublishProcess(item, settings) {
    console.log('[Direct-Republish] 🚀 Processus direct pour:', item.title);
    console.log('[Direct-Republish] 🛡️ MODE SÉCURISÉ - Création de brouillon uniquement');

    try {
        // Vérifier si on est sur la bonne page (article individuel)
        if (!window.location.href.includes(`/items/${item.id}`)) {
            console.log('[Direct-Republish] 🔄 Navigation vers l\'article...');
            window.location.href = `https://www.vinted.fr/items/${item.id}`;

            // Sauvegarder l'état pour continuer après la navigation
            localStorage.setItem(`vinted_direct_process_${item.id}`, JSON.stringify({
                item: item,
                settings: settings,
                step: 'NAVIGATE_TO_ITEM',
                timestamp: Date.now()
            }));

            return;
        }

        console.log('[Direct-Republish] 📋 Extraction des données de l\'article...');

        // Extraire les données de l'article actuel
        const itemData = extractItemDataDirect();

        if (!itemData.title) {
            throw new Error('Impossible d\'extraire les données de l\'article');
        }

        console.log('[Direct-Republish] ✅ Données extraites:', itemData.title);

        // Sauvegarder les données
        localStorage.setItem(`vinted_item_${item.id}`, JSON.stringify({
            ...itemData,
            status: 'EXTRACTED',
            extractedAt: new Date().toISOString()
        }));

        // Naviguer vers la page de création
        console.log('[Direct-Republish] 🔄 Navigation vers la création d\'annonce...');

        // Sauvegarder l'état pour continuer après la navigation
        localStorage.setItem(`vinted_direct_process_${item.id}`, JSON.stringify({
            item: item,
            settings: settings,
            step: 'CREATE_DRAFT',
            timestamp: Date.now()
        }));

        window.location.href = 'https://www.vinted.fr/items/new';

    } catch (error) {
        console.error('[Direct-Republish] ❌ Erreur:', error);

        // Nettoyer les données temporaires
        localStorage.removeItem(`vinted_direct_process_${item.id}`);

        // Mettre à jour le statut d'erreur
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.set({
                [`republish_status_${item.id}`]: {
                    status: 'ERROR',
                    title: item.title,
                    error: error.message,
                    timestamp: Date.now()
                }
            });
        }
    }
}

// Fonction d'extraction directe des données d'article
function extractItemDataDirect() {
    const data = {
        title: '',
        price: '',
        description: '',
        brand: '',
        size: '',
        condition: '',
        color: '',
        category: '',
        material: '',
        imageUrls: [],
        itemId: '',
        url: window.location.href
    };

    // Extraire l'ID de l'URL
    const match = window.location.href.match(/\/items\/(\d+)/);
    if (match) {
        data.itemId = match[1];
    }

    // Extraire le titre
    const titleEl = document.querySelector('h1, [data-testid*="title"]');
    if (titleEl) {
        data.title = titleEl.textContent.trim();
    }

    // Extraire le prix
    const priceEl = document.querySelector('[data-testid*="price"], .price');
    if (priceEl) {
        data.price = priceEl.textContent.trim();
    }

    // Extraire la description
    const descEl = document.querySelector('[data-testid*="description"], .description');
    if (descEl) {
        data.description = descEl.textContent.trim();
    }

    // Extraire les images
    const images = document.querySelectorAll('img[src*="images"]');
    images.forEach(img => {
        if (img.src && !data.imageUrls.includes(img.src)) {
            data.imageUrls.push(img.src);
        }
    });

    console.log('[Direct-Extract] ✅ Données extraites:', {
        title: data.title,
        price: data.price,
        images: data.imageUrls.length
    });

    return data;
}

// Mettre à jour le statut de republication
async function updateRepublishStatus(itemId, status) {
    try {
        await chrome.storage.local.set({
            [`republish_status_${itemId}`]: status
        });
        console.log('[Background PRO] 📊 Statut mis à jour:', itemId, status.status);
    } catch (error) {
        console.error('[Background PRO] ❌ Erreur mise à jour statut:', error);
    }
}

// 🎯 DEBUG: Afficher l'état des queues toutes les 30 secondes
setInterval(() => {
    const queueSizes = Array.from(contentScriptQueues.entries()).map(([tabId, queue]) => `${tabId}:${queue.length}`);
    if (queueSizes.length > 0) {
        console.log('[Background PRO] 📊 État queues:', queueSizes.join(', '));
    }
}, 30000);

// === AUTOMATION COMPLÈTE - COMME LES VRAIES EXTENSIONS ===
async function handleFullAutomation(request, sendResponse) {
    console.log('[Background PRO] 🤖 AUTOMATION COMPLÈTE démarrée pour item:', request.itemId);

    try {
        // Récupérer l'onglet actif
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            sendResponse({ success: false, error: 'Aucun onglet actif trouvé' });
            return;
        }

        // Envoyer la commande d'automation au moteur d'automation dans la page
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: startAutomationProcess,
            args: [request.itemId, request.settings]
        });

        console.log('[Background PRO] ✅ Automation lancée avec succès');
        sendResponse({ success: true, message: 'Automation démarrée' });

    } catch (error) {
        console.error('[Background PRO] ❌ Erreur automation complète:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Fonction injectée dans la page pour démarrer l'automation
function startAutomationProcess(items, settings) {
    console.log('[Automation Inject] 🚀 Démarrage processus pour items:', items);

    // Vérifier que le moteur d'automation est prêt
    if (window.VINTED_AUTOMATION_READY) {
        console.log('[Automation Inject] ✅ Moteur d\'automation détecté, envoi du message...');
    } else {
        console.log('[Automation Inject] ⚠️ Moteur d\'automation pas encore prêt, tentative quand même...');
    }

    // Convertir en array si ce n'est pas déjà le cas
    const itemsArray = Array.isArray(items) ? items : [items];

    // Envoyer message au moteur d'automation
    window.postMessage({
        action: 'VINTED_AUTOMATION_START',
        items: itemsArray,
        settings: settings
    }, '*');

    console.log('[Automation Inject] 📤 Message postMessage envoyé pour items:', itemsArray);

    return { success: true, message: 'Commande envoyée au moteur' };
}

// Fonction pour gérer les résultats du scraping
function handleAutomationResults(results, settings) {
    console.log('[Background Results] 📊 Réception des résultats du scraping:', results);

    if (!results || results.length === 0) {
        console.log('[Background Results] ⚠️ Aucun résultat reçu');
        return;
    }

    // Traiter chaque item scrapé
    results.forEach((itemData, index) => {
        console.log(`[Background Results] 📋 Traitement item ${index + 1}:`, itemData.title);

        // Ici on peut ajouter la logique de republication
        // Pour l'instant, on simule juste le processus
        console.log(`[Background Results] 🔄 Simulation republication pour:`, itemData.title);
        console.log(`[Background Results] 💰 Prix:`, itemData.price);
        console.log(`[Background Results] 🖼️ Images:`, itemData.images.length);

        // Envoyer une notification de progression
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Vinted Auto Republisher',
            message: `Traitement de: ${itemData.title}`
        });
    });

    console.log('[Background Results] 🎉 Traitement de tous les items terminé');
}



// === FONCTION DE SCAN INJECTÉE DANS LA PAGE ===
function performDirectScanInPage() {
    console.log('[Scan Direct] 🔍 SCAN DIRECT - Démarrage immédiat');

    try {
        const items = [];

        // Vérifier si on est sur une page d'article individuelle
        if (window.location.href.includes('/items/') && window.location.href.match(/\/items\/\d+/)) {
            console.log('[Scan Direct] 📋 Page d\'article individuelle détectée');

            const match = window.location.href.match(/\/items\/(\d+)/);
            if (match) {
                const itemId = match[1];
                const title = document.querySelector('h1, [data-testid*="title"]')?.textContent?.trim() || `Article #${itemId}`;
                const price = document.querySelector('[data-testid*="price"], .price')?.textContent?.trim() || 'N/A';
                const img = document.querySelector('img[src*="images"]');

                items.push({
                    id: itemId,
                    title: title,
                    price: price,
                    image: img?.src || null,
                    isDraft: false,
                    url: `https://www.vinted.fr/items/${itemId}`
                });

                console.log('[Scan Direct] ✅ Article individuel scanné:', title);
            }
        } else {
            // Scan des pages de listing
            console.log('[Scan Direct] 📋 Scan des pages de listing...');

            const selectors = [
                '.feed-grid__item', '.item-box', '.listing-item', '.item',
                '[data-testid*="item"]', 'article', '.item-card'
            ];

            let elements = [];
            for (const selector of selectors) {
                elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    console.log('[Scan Direct] ✅ Éléments trouvés avec:', selector, '(', elements.length, ')');
                    break;
                }
            }

            if (elements.length === 0) {
                console.log('[Scan Direct] ⚠️ Aucun élément trouvé, essai avec sélecteur général...');
                elements = document.querySelectorAll('*[href*="/items/"]').slice(0, 50);
                console.log('[Scan Direct] 📊 Liens trouvés:', elements.length);
            }

            console.log(`[Scan Direct] 📊 Processing ${elements.length} éléments...`);

            elements.forEach((element, index) => {
                try {
                    let itemId = null;
                    let linkElement = element.querySelector('a[href*="/items/"]') || (element.href ? element : null);

                    if (linkElement && linkElement.href) {
                        // Filtrer les liens non-articles
                        if (linkElement.href.includes('favourite_list') ||
                            linkElement.href.includes('member/items') ||
                            !linkElement.href.match(/\/items\/\d+/)) {
                            return;
                        }

                        const match = linkElement.href.match(/\/items\/(\d+)/);
                        if (match) {
                            itemId = match[1];
                        }
                    }

                    if (!itemId) return;

                    const img = element.querySelector('img');
                    const imageUrl = img ? img.src : null;

                    let price = 'N/A';
                    let title = `Article #${itemId}`;

                    // Chercher le prix
                    const priceSelectors = ['*[class*="price"]', '[data-testid*="price"]', '.price', '.item-price'];
                    for (const selector of priceSelectors) {
                        const priceEl = element.querySelector(selector);
                        if (priceEl && priceEl.textContent.trim().match(/\d+[,.]?\d*\s*€/)) {
                            price = priceEl.textContent.trim();
                            break;
                        }
                    }

                    // Chercher le titre
                    const titleSelectors = ['[data-testid*="title"]', '.title', 'h3', 'h4', '.item-title', '*[class*="title"]'];
                    for (const selector of titleSelectors) {
                        const titleEl = element.querySelector(selector);
                        if (titleEl && titleEl.textContent.trim() &&
                            !titleEl.textContent.trim().match(/^\d+[,.]?\d*\s*€$/)) {
                            title = titleEl.textContent.trim();
                            break;
                        }
                    }

                    // Si le titre ressemble à un prix, utiliser le lien
                    if (title.match(/^\d+[,.]?\d*\s*€$/)) {
                        const linkText = linkElement.textContent.trim();
                        if (linkText && !linkText.match(/^\d+[,.]?\d*\s*€$/)) {
                            title = linkText;
                        } else {
                            title = `Article #${itemId}`;
                        }
                    }

                    // Détecter les brouillons
                    const isDraft = element.textContent.toLowerCase().includes('brouillon') ||
                        element.textContent.toLowerCase().includes('draft');

                    // Éviter les doublons
                    const exists = items.find(item => item.id === itemId);
                    if (!exists) {
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
                    console.error('[Scan Direct] ❌ Erreur scan élément:', error);
                }
            });
        }

        console.log('[Scan Direct] ✅ Scan terminé:', items.length, 'articles uniques');
        return {
            items: items,
            url: window.location.href,
            timestamp: Date.now()
        };

    } catch (error) {
        console.error('[Scan Direct] ❌ Erreur scan:', error);
        return {
            items: [],
            error: error.message,
            url: window.location.href
        };
    }
}

console.log('[Background PRO] 🎯 Architecture de communication professionnelle initialisée');