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
const crawlSchemasButton = document.getElementById('crawlSchemas');
const copySchemaExportButton = document.getElementById('copySchemaExport');
const copyDiagnosticButton = document.getElementById('copyDiagnostic');
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
        await refreshVaultList();

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

            // Détection contextuelle de la page
            const isDraft = tab.url.includes('/items/new') || /\/items\/\d+\/edit/.test(tab.url);
            const isItem = /\/items\/(\d+)/.test(tab.url) && !isDraft;

            const draftCard = document.getElementById('draftContextCard');
            const itemCard = document.getElementById('itemContextCard');

            if (draftCard) draftCard.hidden = !isDraft;
            if (itemCard) itemCard.hidden = !isItem;

            if (isDraft) {
                updateStatus('ready', 'Brouillon Vinted détecté');
            } else if (isItem) {
                updateStatus('ready', 'Annonce Vinted détectée');
                const titleMatch = tab.title ? tab.title.split('|')[0].trim() : '';
                const titleEl = document.getElementById('itemContextTitle');
                if (titleEl && titleMatch) {
                    titleEl.textContent = titleMatch;
                }
            } else if (tab.url.includes('/member/') || tab.url.includes('/dressing')) {
                updateStatus('ready', 'Dressing Vinted détecté');
            } else {
                updateStatus('ready', 'Connecté à Vinted');
            }

            if (scanButton) scanButton.disabled = false;
        } else {
            console.log('[Popup PRO] ❌ Page non-Vinted détectée:', tab.url);
            updateStatus('error', 'Ouvrez Vinted pour utiliser l\'extension');
            if (scanButton) scanButton.disabled = true;

            const draftCard = document.getElementById('draftContextCard');
            const itemCard = document.getElementById('itemContextCard');
            if (draftCard) draftCard.hidden = true;
            if (itemCard) itemCard.hidden = true;
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
    if (crawlSchemasButton) crawlSchemasButton.addEventListener('click', handleCrawlSchemas);
    if (copySchemaExportButton) copySchemaExportButton.addEventListener('click', handleCopySchemaExport);
    if (copyDiagnosticButton) copyDiagnosticButton.addEventListener('click', handleCopyDiagnostic);
    bindClickIfExists('exportAgentLogs', handleExportAgentLogs);
    bindClickIfExists('selectAllItems', handleSelectAllItems);
    bindClickIfExists('saveSelectedToVault', handleSaveSelectedToVault);
    const destructiveToggle = document.getElementById('allowDestructiveRepublish');
    if (destructiveToggle) {
        destructiveToggle.addEventListener('change', updateRepublishButton);
    }
    bindClickIfExists('finalizeCurrentDraft', handleFinalizeCurrentDraft);
    bindClickIfExists('publishCurrentDraft', handlePublishCurrentDraft);

    // Toggle watermark input visibility
    const watermarkCheckbox = document.getElementById('addWatermark');
    const watermarkWrapper = document.getElementById('watermarkFieldWrapper');
    if (watermarkCheckbox && watermarkWrapper) {
        watermarkCheckbox.addEventListener('change', () => {
            watermarkWrapper.style.display = watermarkCheckbox.checked ? 'block' : 'none';
        });
    }

    // Préférence : pré-remplissage en arrière-plan (mode discret)
    const vaultBgToggle = document.getElementById('vaultBackgroundToggle');
    const antiDupBgToggle = document.getElementById('antiDupBackgroundCheck');
    chrome.storage.local.get(['vinted_pref_open_in_background']).then((res) => {
        const isBg = res.vinted_pref_open_in_background !== false; // default true
        if (vaultBgToggle) vaultBgToggle.checked = isBg;
        if (antiDupBgToggle) antiDupBgToggle.checked = isBg;
    });

    const updateBgPref = (checked) => {
        if (vaultBgToggle) vaultBgToggle.checked = checked;
        if (antiDupBgToggle) antiDupBgToggle.checked = checked;
        chrome.storage.local.set({ vinted_pref_open_in_background: checked });
    };

    if (vaultBgToggle) {
        vaultBgToggle.addEventListener('change', (e) => updateBgPref(e.target.checked));
    }
    if (antiDupBgToggle) {
        antiDupBgToggle.addEventListener('change', (e) => updateBgPref(e.target.checked));
    }

    // Toggle import drop zone
    bindClickIfExists('importBackupTrigger', () => {
        const zone = document.getElementById('importZoneWrapper');
        if (zone) {
            zone.style.display = zone.style.display === 'none' ? 'block' : 'none';
        }
    });

    // Clear logs
    bindClickIfExists('clearLogsBtn', () => {
        if (logsContainer) logsContainer.innerHTML = '';
        if (logs) logs.hidden = true;
    });

    // Event listeners pour le mode manuel (optionnels selon la version du popup.html)
    bindClickIfExists('extractData', handleExtractData);
    bindClickIfExists('createDraft', handleCreateDraft);
    bindClickIfExists('viewDrafts', handleViewDrafts);

    setupTabNavigation();
    setupVaultListeners();
    setupBackupImportUi();
    setupPhotoStudioListeners();
    setupAntiDuplicateListeners();
    setupAiConfigListeners();
}


function setupBackupImportUi() {
    const zone = document.getElementById('backupDropZone');
    const input = document.getElementById('backupFileInput');
    const localBtn = document.getElementById('restoreLocalBackup');
    if (!zone || !input) return;

    const setDrag = (on) => zone.classList.toggle('is-dragover', on);

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            input.click();
        }
    });
    zone.addEventListener('dragenter', (event) => {
        event.preventDefault();
        setDrag(true);
    });
    zone.addEventListener('dragover', (event) => {
        event.preventDefault();
        setDrag(true);
    });
    zone.addEventListener('dragleave', (event) => {
        event.preventDefault();
        setDrag(false);
    });
    zone.addEventListener('drop', async (event) => {
        event.preventDefault();
        setDrag(false);
        await handleBackupFiles(event.dataTransfer?.files);
    });
    input.addEventListener('change', async () => {
        await handleBackupFiles(input.files);
        input.value = '';
    });
    if (localBtn) {
        localBtn.addEventListener('click', async () => {
            try {
                setBackupImportBusy(true);
                addLog('info', 'Restauration depuis le dernier backup local…');
                const response = await chrome.runtime.sendMessage({
                    action: 'restoreLatestLocalBackup',
                    settings: { autoSave: true },
                });
                if (!response?.success) {
                    throw new Error(response?.error || 'Restauration locale échouée');
                }
                addLog(
                    'success',
                    `Backup local restauré: ${response.title || response.itemId} (${response.photoCount} photo(s))`
                );
                updateStatus('ready', 'Brouillon en cours depuis backup local');
                document.getElementById('backupImportHint').textContent =
                    `Restauré: ${response.title || response.backupId} · mode safe`;
            } catch (error) {
                addLog('error', error.message || 'Échec restauration locale');
                updateStatus('error', 'Backup local indisponible');
            } finally {
                setBackupImportBusy(false);
            }
        });
    }
}

function setBackupImportBusy(busy) {
    const zone = document.getElementById('backupDropZone');
    if (zone) zone.classList.toggle('is-busy', busy);
    const localBtn = document.getElementById('restoreLocalBackup');
    if (localBtn) localBtn.disabled = busy;
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`Lecture impossible: ${file.name}`));
        reader.readAsDataURL(file);
    });
}

async function buildBackupFromDroppedFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) throw new Error('Aucun fichier déposé');

    const jsonFile = files.find(
        (f) =>
            f.type.includes('json') ||
            /\.json$/i.test(f.name) ||
            /^vinted-backup/i.test(f.name)
    );
    const imageFiles = files
        .filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    if (!jsonFile) {
        throw new Error(
            'Il faut le fichier JSON du backup (ex: vinted-backup-9226….json). Les JPEG seuls ne suffisent pas.'
        );
    }

    let backup;
    try {
        backup = JSON.parse(await jsonFile.text());
    } catch (_) {
        throw new Error('JSON backup illisible — vérifie le fichier téléchargé');
    }

    if (!backup?.item) {
        throw new Error('Ce JSON n’est pas un backup Republisher (champ item manquant)');
    }

    const hasPrepared = Array.isArray(backup.photos?.prepared) && backup.photos.prepared.some((p) => p?.dataUrl);
    const hasOriginals = Array.isArray(backup.photos?.originals) && backup.photos.originals.some((p) => p?.dataUrl);

    if (!hasPrepared && !hasOriginals) {
        if (!imageFiles.length) {
            throw new Error(
                'Ce JSON n’a pas de photos intégrées. Dépose aussi les JPEG téléchargés avec le backup.'
            );
        }
        const prepared = [];
        for (let i = 0; i < imageFiles.length; i++) {
            prepared.push({
                index: i,
                name: imageFiles[i].name,
                type: imageFiles[i].type || 'image/jpeg',
                dataUrl: await fileToDataUrl(imageFiles[i]),
            });
        }
        backup.photos = {
            originalCount: 0,
            preparedCount: prepared.length,
            originals: [],
            prepared,
        };
    } else if (imageFiles.length && !hasPrepared) {
        // Prefer dropped JPEGs as prepared upload set when JSON only has originals.
        const prepared = [];
        for (let i = 0; i < imageFiles.length; i++) {
            prepared.push({
                index: i,
                name: imageFiles[i].name,
                type: imageFiles[i].type || 'image/jpeg',
                dataUrl: await fileToDataUrl(imageFiles[i]),
            });
        }
        backup.photos = {
            ...(backup.photos || {}),
            preparedCount: prepared.length,
            prepared,
        };
    }

    return backup;
}

async function handleBackupFiles(fileList) {
    try {
        setBackupImportBusy(true);
        addLog('info', 'Import backup en cours…');
        const backup = await buildBackupFromDroppedFiles(fileList);
        const persisted = await persistBackupInPopupStorage(backup);
        const response = await chrome.runtime.sendMessage({
            action: 'openDraftAfterImport',
            itemId: persisted.itemId,
        });
        if (!response?.success) {
            throw new Error(response?.error || 'Ouverture brouillon échouée');
        }
        addLog(
            'success',
            `Backup importé: ${persisted.title || persisted.itemId} · ${persisted.photoCount} photo(s) → création brouillon`
        );
        updateStatus('ready', 'Brouillon restauré depuis backup');
        const hint = document.getElementById('backupImportHint');
        if (hint) {
            hint.textContent = `Import OK: ${persisted.title || persisted.backupId} · mode safe (pas de delete auto)`;
        }
    } catch (error) {
        addLog('error', error.message || 'Import backup échoué');
        updateStatus('error', 'Import backup échoué');
    } finally {
        setBackupImportBusy(false);
    }
}

async function persistBackupInPopupStorage(backup) {
    const PENDING_DOM_DRAFT_KEY = 'vinted_pending_dom_draft';
    const REPUBLISH_BACKUP_PREFIX = 'vinted_republish_backup_';
    const REPUBLISH_BACKUP_INDEX_KEY = 'vinted_republish_backup_index_v1';
    const LAST_BACKUP_KEY = 'vinted_republisher_last_backup_key_v1';

    const prepared = Array.isArray(backup?.photos?.prepared)
        ? backup.photos.prepared.filter((p) => p?.dataUrl)
        : [];
    const originals = Array.isArray(backup?.photos?.originals)
        ? backup.photos.originals.filter((p) => p?.dataUrl)
        : [];
    const photos = prepared.length ? prepared : originals;
    if (!photos.length) {
        throw new Error('Backup sans photos binaires');
    }
    if (!backup?.item) {
        throw new Error('Backup sans métadonnées item');
    }

    const item = { ...backup.item };
    if (!item.itemId) {
        item.itemId = String(backup.backupId || '').split('_')[0] || `import_${Date.now()}`;
    }
    if (item.category) {
        item.category = String(item.category).replace(/^[A-Z]{2,5}\s+/, '').trim() || item.category;
    }

    const storageKey = `${REPUBLISH_BACKUP_PREFIX}${item.itemId}`;
    const nextBackup = {
        ...backup,
        version: backup.version || 2,
        backupId: backup.backupId || `${item.itemId}_${Date.now()}`,
        storageKey,
        item,
        photos: {
            originalCount: originals.length,
            preparedCount: photos.length,
            originals: Array.isArray(backup.photos?.originals) ? backup.photos.originals : [],
            prepared: prepared.length ? backup.photos.prepared : photos,
        },
        lifecycle: {
            ...(backup.lifecycle || {}),
            status: 'IMPORTED',
            updatedAt: new Date().toISOString(),
            retainUntilDone: true,
            note: 'Imported from downloaded backup via popup drop-zone',
        },
        safety: {
            ...(backup.safety || {}),
            deleteOriginalAllowed: false,
            publishNewAllowed: false,
            photosRecoverable: true,
            reason: 'Imported backup — destructive actions require fresh confirm',
        },
    };

    await chrome.storage.local.set({
        [storageKey]: nextBackup,
        [LAST_BACKUP_KEY]: storageKey,
        [PENDING_DOM_DRAFT_KEY]: {
            ...item,
            backupId: nextBackup.backupId,
            preparedAt: Date.now(),
            restoredFromBackup: true,
            importedFromFile: true,
            settings: {
                allowDestructiveRepublish: false,
                autoSave: true,
                autoPublishAfterSave: true,
                imageSettings: null,
            },
            files: photos.map((file, index) => ({
                name: file.name || `vinted_restore_${index}.jpg`,
                type: file.type || 'image/jpeg',
                dataUrl: file.dataUrl,
            })),
        },
    });

    const indexResult = await chrome.storage.local.get(REPUBLISH_BACKUP_INDEX_KEY);
    const index = Array.isArray(indexResult[REPUBLISH_BACKUP_INDEX_KEY])
        ? indexResult[REPUBLISH_BACKUP_INDEX_KEY]
        : [];
    await chrome.storage.local.set({
        [REPUBLISH_BACKUP_INDEX_KEY]: [
            {
                storageKey,
                backupId: nextBackup.backupId,
                itemId: item.itemId,
                title: item.title,
                createdAt: nextBackup.createdAt || new Date().toISOString(),
                photoCount: photos.length,
                status: 'IMPORTED',
            },
            ...index.filter((entry) => entry.storageKey !== storageKey),
        ].slice(0, 30),
    });

    return {
        itemId: item.itemId,
        backupId: nextBackup.backupId,
        title: item.title || '',
        photoCount: photos.length,
    };
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
    if (spinner) spinner.hidden = false;

    // Afficher les logs
    if (logs) logs.hidden = false;
    addLog('info', `Brouillon démarré pour ${currentState.selectedItems.length} annonce(s)`);
    const destructive = Boolean(document.getElementById('allowDestructiveRepublish')?.checked);
    addLog(
        destructive ? 'warning' : 'info',
        destructive
            ? 'Destructif ON: après validation + save, un bouton overlay demandera confirmation avant delete/publish'
            : 'Mode safe: pas de suppression/publication auto'
    );

    try {
        // Démarrer l'automation pour chaque article sélectionné
        for (const itemIndex of currentState.selectedItems) {
            const item = currentState.scannedItems[itemIndex];
            addLog('info', `Lancement: ${item.title}`);

            // Envoyer la commande d'automation au moteur
            const response = await chrome.runtime.sendMessage({
                action: 'startFullAutomation',
                itemId: item.id,
                item: item,
                settings: {
                    safeMode: true,
                    autoFill: true,
                    autoSave: true,
                    allowDestructiveRepublish: Boolean(document.getElementById('allowDestructiveRepublish')?.checked),
                    imageSettings: getImageSettings()
                }
            });

            if (response && response.success) {
                addLog('success', `Brouillon lancé: ${item.title}`);
                updateStatus('processing', `Brouillon en cours: ${item.title}`);
            } else {
                addLog('error', `Échec lancement: ${item.title}`);
            }
        }

        addLog('info', 'Processus lancé — suis l’overlay sur la page Vinted');
        updateStatus('monitoring', 'Brouillon en cours — vérifie l’overlay Vinted');

    } catch (error) {
        console.error('[Popup] Erreur automation:', error);
        addLog('error', `Erreur: ${error.message}`);
        updateStatus('error', 'Erreur lors du lancement');
    } finally {
        republishBtn.disabled = false;
        if (spinner) spinner.hidden = true;
        currentState.isProcessing = false;
    }
}

async function handleCrawlSchemas() {
    if (currentState.isProcessing) return;

    currentState.isProcessing = true;
    const spinner = document.getElementById('crawlSchemasSpinner');
    const text = document.getElementById('crawlSchemasText');
    if (crawlSchemasButton) crawlSchemasButton.disabled = true;
    if (spinner) spinner.hidden = false;
    if (text) text.textContent = 'Cartographie...';
    if (logs) logs.hidden = false;
    addLog('info', 'Cartographie des schémas Vinted lancée');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            await chrome.runtime.sendMessage({
                action: 'setCurrentTab',
                tabId: tab.id,
                url: tab.url
            });
        }

        const response = await chrome.runtime.sendMessage({
            action: 'startSchemaCrawl',
            options: {
                maxCategories: 0,
                delayMs: 900,
                useApi: true
            }
        });

        if (!response?.success) {
            throw new Error(response?.error || 'Échec lancement cartographie');
        }

        if (response.result?.navigated) {
            addLog('info', 'Navigation vers /items/new. La cartographie continuera au chargement.');
            updateStatus('processing', 'Cartographie en attente sur /items/new');
        } else {
            const result = response.result || response;
            addLog('success', `Cartographie terminée: ${result.succeeded || 0}/${result.total || 0} schéma(s)`);
            updateStatus('ready', `Schémas: ${result.succeeded || 0}/${result.total || 0}`);
        }
    } catch (error) {
        console.error('[Popup PRO] Erreur cartographie:', error);
        addLog('error', `Cartographie: ${error.message}`);
        updateStatus('error', 'Erreur cartographie schémas');
    } finally {
        currentState.isProcessing = false;
        if (crawlSchemasButton) crawlSchemasButton.disabled = false;
        if (spinner) spinner.hidden = true;
        if (text) text.textContent = 'Cartographier schémas';
    }
}

async function handleCopySchemaExport() {
    try {
        const result = await chrome.storage.local.get('vinted_schema_crawl_last_result_v1');
        const crawlResult = result.vinted_schema_crawl_last_result_v1;
        if (!crawlResult) {
            addLog('warning', 'Aucun export schéma. Lance d’abord la cartographie.');
            return;
        }
        const payload = crawlResult.exportedSchemas || crawlResult;
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        if (logs) logs.hidden = false;
        addLog('success', `Export schémas copié (${Object.keys(payload.schemas || {}).length} schéma(s))`);
    } catch (error) {
        addLog('error', `Copie export impossible: ${error.message}`);
    }
}

async function handleCopyDiagnostic() {
    try {
        const result = await chrome.storage.local.get('vinted_republisher_last_diagnostic_v1');
        const diagnostic = result.vinted_republisher_last_diagnostic_v1;
        if (!diagnostic) {
            addLog('warning', 'Aucun diagnostic. Lance d’abord un brouillon.');
            return;
        }
        await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2));
        if (logs) logs.hidden = false;
        const failed = diagnostic.failedFields?.map((field) => field.fieldId).join(', ') || 'aucun';
        addLog('success', `Diagnostic copié (${diagnostic.status}, échecs: ${failed})`);
    } catch (error) {
        addLog('error', `Copie diagnostic impossible: ${error.message}`);
    }
}

async function handleExportAgentLogs() {
    try {
        if (logs) logs.hidden = false;
        const diagnosticBag = await chrome.storage.local.get('vinted_republisher_last_diagnostic_v1');
        const diagnostic = diagnosticBag.vinted_republisher_last_diagnostic_v1 || null;
        const payload = {
            exportedAt: new Date().toISOString(),
            source: 'vinted-republisher-popup',
            selectedCount: currentState.selectedItems.length,
            imageSettings: getImageSettings(),
            diagnostic,
            popupLogs: Array.from(logsContainer?.querySelectorAll('.log-entry, .log') || []).map((el) => el.textContent?.trim()).filter(Boolean),
        };
        const text = [
            '# VINTED REPUBLISHER AGENT LOG',
            `# ${payload.exportedAt}`,
            '',
            '## Settings',
            JSON.stringify(payload.imageSettings, null, 2),
            '',
            '## Diagnostic',
            JSON.stringify(diagnostic, null, 2),
            '',
            '## Popup logs',
            ...(payload.popupLogs.length ? payload.popupLogs : ['(vide — utilise aussi Copier logs sur l’overlay)']),
            '',
            '## Instructions',
            'Enregistre ce fichier sous: agent-inbox/latest.log',
        ].join('\n');

        await navigator.clipboard.writeText(text);
        // Also offer a downloadable file for drop-in to agent-inbox/
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'latest.log';
        a.click();
        URL.revokeObjectURL(url);
        addLog('success', 'Logs agent copiés + téléchargés (place dans agent-inbox/latest.log)');
    } catch (error) {
        addLog('error', `Export agent impossible: ${error.message}`);
    }
}

function handleSelectAllItems() {
    if (!currentState.scannedItems.length) return;
    const boxes = itemsContainer.querySelectorAll('.item-checkbox');
    const allSelected = currentState.selectedItems.length === currentState.scannedItems.length;
    currentState.selectedItems = [];
    boxes.forEach((box, index) => {
        box.checked = !allSelected;
        const row = box.closest('.item');
        if (!allSelected) {
            currentState.selectedItems.push(index);
            row?.classList.add('selected');
        } else {
            row?.classList.remove('selected');
        }
    });
    updateRepublishButton();
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
    const enabledEl = document.getElementById('photoModsEnabled');
    const noiseEl = document.getElementById('addNoise');
    return {
        enabled: enabledEl ? enabledEl.checked : true,
        cropPercentage: parseFloat(document.getElementById('cropPercentage')?.value || '4'),
        addWatermark: Boolean(document.getElementById('addWatermark')?.checked),
        watermarkText: document.getElementById('watermarkText')?.value || '',
        rotationAngle: parseFloat(document.getElementById('rotationAngle')?.value || '0.6'),
        qualityReduction: parseInt(document.getElementById('qualityReduction')?.value || '6', 10),
        addNoise: noiseEl ? noiseEl.checked : true,
        noiseStrength: 6,
        brightnessJitter: 0.012,
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
        if (itemsList) itemsList.hidden = true;
        updateRepublishButton();
        return;
    }

    itemsContainer.innerHTML = '';
    currentState.selectedItems = [];

    currentState.scannedItems.forEach((item, index) => {
        const itemElement = createItemElement(item, index);
        itemsContainer.appendChild(itemElement);
    });

    itemsCount.textContent = currentState.scannedItems.length;
    if (itemsList) itemsList.hidden = false;
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
    if (republishButton) {
        republishButton.disabled = !hasSelection || currentState.isProcessing;
    }

    const republishText = document.getElementById('republishText');
    const hint = document.getElementById('selectionHint');
    const destructiveOn = Boolean(document.getElementById('allowDestructiveRepublish')?.checked);
    const finalizeBtn = document.getElementById('finalizeCurrentDraft');
    if (finalizeBtn) {
        finalizeBtn.disabled = !destructiveOn || currentState.isProcessing;
    }
    if (republishText) {
        republishText.textContent = hasSelection
            ? `Lancer la republication (${currentState.selectedItems.length})`
            : 'Lancer la republication';
    }
    if (hint) {
        hint.textContent = hasSelection
            ? `${currentState.selectedItems.length} annonce(s) sélectionnée(s) · ${
                destructiveOn
                  ? 'remplacement complet (suppression + nouvelle annonce)'
                  : 'mode sécurisé (brouillon vérifiable sans suppression)'
              }`
            : 'Cochez une ou plusieurs annonces ci-dessus.';
    }
}

async function handleFinalizeCurrentDraft() {
    const destructiveOn = Boolean(document.getElementById('allowDestructiveRepublish')?.checked);
    if (!destructiveOn) {
        addLog('error', 'Active d’abord « Autoriser suppression + publication »');
        return;
    }
    try {
        currentState.isProcessing = true;
        updateRepublishButton();
        if (logs) logs.hidden = false;
        addLog('warning', 'Préflight finalisation sur l’onglet actif…');

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !isVintedUrl(tab.url)) {
            throw new Error('Ouvre d’abord l’onglet du brouillon Vinted');
        }
        if (String(tab.url).includes('/items/new')) {
            throw new Error('Sauvegarde d’abord le brouillon (pas /items/new)');
        }
        await chrome.runtime.sendMessage({
            action: 'setCurrentTab',
            tabId: tab.id,
            url: tab.url,
        });

        const response = await chrome.runtime.sendMessage({
            action: 'finishFromCurrentDraft',
        });
        if (!response?.success) {
            const errs = Array.isArray(response?.errors) ? response.errors.join(' · ') : null;
            throw new Error(errs || response?.error || 'Préflight finalisation échoué');
        }
        addLog('success', 'Préflight OK — confirme sur l’overlay (bouton rouge + dialogue)');
        updateStatus('ready', 'Confirme la finalisation sur l’overlay Vinted');
    } catch (error) {
        addLog('error', error.message || 'Finalisation impossible');
        updateStatus('error', 'Finalisation bloquée');
    } finally {
        currentState.isProcessing = false;
        updateRepublishButton();
    }
}

async function handlePublishCurrentDraft() {
    try {
        currentState.isProcessing = true;
        updateRepublishButton();
        if (logs) logs.hidden = false;
        addLog('info', 'Publication automatique du brouillon ouvert…');

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !isVintedUrl(tab.url)) {
            throw new Error('Ouvre d’abord l’onglet du brouillon Vinted');
        }
        if (String(tab.url).includes('/items/new')) {
            throw new Error('Sauvegarde d’abord le brouillon (pas /items/new)');
        }
        await chrome.runtime.sendMessage({
            action: 'setCurrentTab',
            tabId: tab.id,
            url: tab.url,
        });

        const response = await chrome.runtime.sendMessage({
            action: 'publishCurrentDraft',
            draftUrl: tab.url,
        });
        if (!response?.success) {
            throw new Error(response?.error || 'Publication auto échouée');
        }
        addLog('success', 'Publication lancée — suis l’overlay Vinted');
        updateStatus('ready', 'Publication automatique en cours');
    } catch (error) {
        addLog('error', error.message || 'Publication impossible');
        updateStatus('error', 'Publication bloquée');
    } finally {
        currentState.isProcessing = false;
        updateRepublishButton();
    }
}

function addLog(type, message) {
    if (logs) logs.hidden = false;
    const logDiv = document.createElement('div');
    logDiv.className = `log-entry ${type}`;
    logDiv.innerHTML = `
        <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
        <span class="log-message">${message}</span>
    `;

    const target = logsContainer || logs;
    if (!target) return;

    target.appendChild(logDiv);
    target.scrollTop = target.scrollHeight;

    console.log(`[Popup] Log ${type}:`, message);
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

// === COFFRE-FORT D'ANNONCES (LISTING VAULT) ===
let vaultItems = [];

function setupTabNavigation() {
    const tabs = document.querySelectorAll('.tab-button, .nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetPanelId = tab.dataset.tab;
            tabs.forEach(t => {
                t.classList.toggle('active', t === tab);
                t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
            });
            document.querySelectorAll('.tab-panel').forEach(panel => {
                panel.hidden = panel.id !== targetPanelId;
            });

            // Masquer les bandeaux contextuels de l'onglet Republication quand on est dans le coffre-fort
            const itemContextCard = document.getElementById('itemContextCard');
            const draftContextCard = document.getElementById('draftContextCard');
            if (targetPanelId === 'panelVault') {
                if (itemContextCard) {
                    itemContextCard.dataset.shouldShow = !itemContextCard.hidden;
                    itemContextCard.hidden = true;
                }
                if (draftContextCard) {
                    draftContextCard.dataset.shouldShow = !draftContextCard.hidden;
                    draftContextCard.hidden = true;
                }
                refreshVaultList();
            } else {
                if (itemContextCard && itemContextCard.dataset.shouldShow === 'true') {
                    itemContextCard.hidden = false;
                }
                if (draftContextCard && draftContextCard.dataset.shouldShow === 'true') {
                    draftContextCard.hidden = false;
                }
            }
        });
    });
}

function setupVaultListeners() {
    bindClickIfExists('saveCurrentPageVaultBtn', handleSaveCurrentTabToVault);
    bindClickIfExists('refreshVaultBtn', refreshVaultList);
    bindClickIfExists('exportAllVaultBtn', handleExportAllVault);

    const searchInput = document.getElementById('vaultSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            handleVaultSearch(e.target.value);
        });
    }
}

async function refreshVaultList() {
    try {
        let items = null;
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getVaultItems' });
            if (response && Array.isArray(response.items)) {
                items = response.items;
            }
        } catch (_) {}

        if (!items) {
            const stored = await chrome.storage.local.get('vinted_republish_backup_index_v1');
            items = Array.isArray(stored.vinted_republish_backup_index_v1)
                ? stored.vinted_republish_backup_index_v1
                : [];
        }

        vaultItems = items;
        updateVaultCountBadges(vaultItems.length);
        renderVaultCards(vaultItems);
    } catch (error) {
        console.error('[Popup PRO] Erreur actualisation coffre-fort:', error);
    }
}

function updateVaultCountBadges(count) {
    const tabBadge = document.getElementById('vaultTabBadge');
    if (tabBadge) tabBadge.textContent = count;
    const totalCount = document.getElementById('vaultTotalCount');
    if (totalCount) totalCount.textContent = count;
}

function renderVaultCards(itemsToRender) {
    const container = document.getElementById('vaultCardsContainer');
    if (!container) return;

    if (!itemsToRender || !itemsToRender.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div style="font-size:26px;margin-bottom:6px;">📦</div>
                <strong>Aucune annonce sauvegardée</strong>
                <p style="margin-top:4px;">Naviguez sur une annonce Vinted et cliquez sur "Sauvegarder l'annonce de la page active", ou sélectionnez des articles dans l'onglet Republication.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = itemsToRender.map((item) => {
        const title = escapeHtml(item.title || `Article #${item.itemId}`);
        const price = item.price ? `${escapeHtml(item.price)} €` : 'Prix n/a';
        const brand = item.brand ? `<span class="vault-tag">${escapeHtml(item.brand)}</span>` : '';
        const size = item.size ? `<span class="vault-tag">${escapeHtml(item.size)}</span>` : '';
        const condition = item.condition ? `<span class="vault-tag">${escapeHtml(item.condition)}</span>` : '';
        const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        const thumb = item.thumbnail || 'icons/icon48.png';

        return `
            <div class="vault-card" data-item-id="${item.itemId}">
                <div class="vault-card-body">
                    <img src="${thumb}" class="vault-thumb" alt="" onerror="this.src='icons/icon48.png'">
                    <div class="vault-details">
                        <div class="vault-title" title="${title}">${title}</div>
                        <div class="vault-meta">
                            <span class="vault-price">${price}</span>
                            ${brand}
                            ${size}
                            ${condition}
                        </div>
                        <div class="vault-sub">
                            <span>📸 ${item.photoCount || 0} photo(s)</span> · <span>🕒 ${dateStr}</span>
                        </div>
                    </div>
                </div>
                <div class="vault-card-actions">
                    <button class="btn btn-sm btn-primary vault-antidup-btn" data-id="${item.itemId}" type="button" title="Pré-remplir sur Vinted avec protection anti-doublon">
                        🛡️ Varier & Pré-remplir
                    </button>
                    <button class="btn btn-sm btn-ghost vault-photos-btn" data-id="${item.itemId}" type="button" title="Studio Retouche Photo & Couverture">
                        🎨 Photos
                    </button>
                    <button class="btn btn-sm btn-ghost vault-prefill-btn" data-id="${item.itemId}" type="button" title="Pré-remplir directement tel quel">
                        ⚡ Direct
                    </button>
                    <button class="btn btn-sm btn-ghost vault-copy-btn" data-id="${item.itemId}" type="button" title="Copier le texte et les caractéristiques">
                        📋 Copier
                    </button>
                    <button class="btn btn-sm btn-ghost vault-download-btn" data-id="${item.itemId}" type="button" title="Télécharger le fichier JSON de backup">
                        💾 JSON
                    </button>
                    <button class="btn btn-sm btn-danger vault-delete-btn" data-id="${item.itemId}" type="button" title="Supprimer de la sauvegarde">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Attach card event listeners
    container.querySelectorAll('.vault-antidup-btn').forEach(btn => {
        btn.addEventListener('click', () => handleOpenAntiDuplicateModal(btn.dataset.id));
    });
    container.querySelectorAll('.vault-prefill-btn').forEach(btn => {
        btn.addEventListener('click', () => handleVaultPrefill(btn.dataset.id));
    });
    container.querySelectorAll('.vault-photos-btn').forEach(btn => {
        btn.addEventListener('click', () => handleOpenPhotoStudio(btn.dataset.id));
    });
    container.querySelectorAll('.vault-copy-btn').forEach(btn => {
        btn.addEventListener('click', () => handleVaultCopy(btn.dataset.id, btn));
    });
    container.querySelectorAll('.vault-download-btn').forEach(btn => {
        btn.addEventListener('click', () => handleVaultDownload(btn.dataset.id));
    });
    container.querySelectorAll('.vault-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => handleVaultDelete(btn.dataset.id));
    });
}

async function handleVaultPrefill(itemId) {
    try {
        const inBackground = Boolean(document.getElementById('vaultBackgroundToggle')?.checked ?? true);
        addLog('info', `Chargement de l'annonce #${itemId} (${inBackground ? 'arrière-plan discret' : 'premier plan'})...`);
        updateStatus('processing', 'Pré-remplissage en cours...');
        const response = await chrome.runtime.sendMessage({
            action: 'restoreVaultItem',
            itemId,
            settings: {
                autoSave: false,
                allowDestructiveRepublish: false,
                openInBackground: inBackground,
            },
        });
        if (!response?.success) {
            throw new Error(response?.error || 'Échec du pré-remplissage');
        }
        if (inBackground) {
            addLog('success', `🚀 Annonce #${itemId} en cours de pré-remplissage en arrière-plan ! Une notification vous préviendra dès qu'elle sera prête.`);
            updateStatus('ready', 'Formulaire Vinted en cours (arrière-plan)');
        } else {
            addLog('success', `Annonce #${itemId} chargée sur https://www.vinted.fr/items/new ! Remplissage en cours...`);
            updateStatus('ready', 'Formulaire Vinted en cours de remplissage');
        }
    } catch (error) {
        addLog('error', 'Erreur pré-remplissage: ' + error.message);
        updateStatus('error', error.message);
    }
}

async function handleVaultCopy(itemId, btn) {
    try {
        let backup = null;
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getVaultItemDetails',
                itemId,
            });
            backup = response?.backup;
        } catch (_) {}
        if (!backup) {
            const key = `vinted_republish_backup_${itemId}`;
            const res = await chrome.storage.local.get(key);
            backup = res[key];
        }
        if (!backup || !backup.item) {
            throw new Error('Données introuvables');
        }
        const it = backup.item;
        const textParts = [
            `Titre : ${it.title || ''}`,
            `Prix : ${it.price ? it.price + ' €' : 'N/C'}`,
            it.brand ? `Marque : ${it.brand}` : null,
            it.size ? `Taille : ${it.size}` : null,
            it.condition ? `État : ${it.condition}` : null,
            it.colors && it.colors.length ? `Couleur(s) : ${it.colors.join(', ')}` : null,
            it.material ? `Matière : ${it.material}` : null,
            it.category ? `Catégorie : ${it.category}` : null,
            `\nDescription :\n${it.description || ''}`,
        ].filter(Boolean).join('\n');

        await navigator.clipboard.writeText(textParts);
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Copié !';
        btn.style.color = 'var(--ok)';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.color = '';
        }, 2000);
        addLog('success', `Infos de "${it.title}" copiées dans le presse-papiers`);
    } catch (err) {
        addLog('error', 'Erreur copie presse-papiers: ' + err.message);
    }
}

async function handleVaultDownload(itemId) {
    try {
        let backup = null;
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getVaultItemDetails',
                itemId,
            });
            backup = response?.backup;
        } catch (_) {}
        if (!backup) {
            const key = `vinted_republish_backup_${itemId}`;
            const res = await chrome.storage.local.get(key);
            backup = res[key];
        }
        if (!backup) throw new Error('Données introuvables');

        const json = JSON.stringify(backup, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vinted-backup-${itemId}.json`;
        a.click();
        URL.revokeObjectURL(url);
        addLog('success', `Backup JSON téléchargé pour l'article #${itemId}`);
    } catch (err) {
        addLog('error', 'Erreur téléchargement: ' + err.message);
    }
}

async function handleVaultDelete(itemId) {
    if (!confirm(`Supprimer cette annonce (#${itemId}) du coffre-fort ?`)) return;
    try {
        try {
            await chrome.runtime.sendMessage({
                action: 'deleteVaultItem',
                itemId,
            });
        } catch (_) {}
        const key = `vinted_republish_backup_${itemId}`;
        await chrome.storage.local.remove(key);
        const indexResult = await chrome.storage.local.get('vinted_republish_backup_index_v1');
        const index = Array.isArray(indexResult.vinted_republish_backup_index_v1)
            ? indexResult.vinted_republish_backup_index_v1
            : [];
        const nextIndex = index.filter(
            (entry) => entry.storageKey !== key && String(entry.itemId) !== String(itemId)
        );
        await chrome.storage.local.set({ vinted_republish_backup_index_v1: nextIndex });
        addLog('info', `Annonce #${itemId} supprimée du coffre-fort`);
        await refreshVaultList();
    } catch (err) {
        addLog('error', 'Erreur suppression: ' + err.message);
    }
}

function handleVaultSearch(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        renderVaultCards(vaultItems);
        return;
    }
    const filtered = vaultItems.filter(it => {
        const title = (it.title || '').toLowerCase();
        const brand = (it.brand || '').toLowerCase();
        const size = (it.size || '').toLowerCase();
        const condition = (it.condition || '').toLowerCase();
        const id = String(it.itemId || '');
        return title.includes(q) || brand.includes(q) || size.includes(q) || condition.includes(q) || id.includes(q);
    });
    renderVaultCards(filtered);
}

async function handleSaveCurrentTabToVault() {
    const btn = document.getElementById('saveCurrentPageVaultBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Extraction et téléchargement des photos...';
    }
    addLog('info', 'Sauvegarde de la page Vinted active dans le coffre-fort...');
    try {
        let response = null;
        try {
            response = await chrome.runtime.sendMessage({
                action: 'saveCurrentPageToVault',
                options: { applyImageMods: true },
            });
            if (response && response.error && response.error.includes('Action inconnue')) {
                throw new Error(response.error);
            }
        } catch (bgErr) {
            console.warn('[Popup] Fallback direct sur content script:', bgErr);
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) throw bgErr;
            response = await chrome.tabs.sendMessage(tab.id, {
                action: 'SAVE_CURRENT_PAGE_TO_VAULT',
                options: { applyImageMods: true },
            });
        }
        if (!response || !response.success) {
            throw new Error(response?.error || 'Échec extraction page');
        }
        addLog('success', `✅ Annonce "${response.title}" (${response.photoCount} photo(s)) enregistrée dans le coffre-fort !`);
        if (btn) btn.textContent = '✅ Annonce sauvegardée !';
        await refreshVaultList();
        setTimeout(() => {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '📥 Sauvegarder dans le Coffre-fort';
            }
        }, 2500);
    } catch (err) {
        addLog('error', 'Sauvegarde échouée: ' + err.message);
        if (btn) {
            btn.textContent = '❌ ' + err.message.slice(0, 24);
            setTimeout(() => {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '📥 Sauvegarder dans le Coffre-fort';
                }
            }, 3000);
        }
    }
}

async function handleSaveSelectedToVault() {
    if (!currentState.selectedItems.length) {
        addLog('warning', 'Sélectionnez au moins une annonce à sauvegarder.');
        return;
    }
    const btn = document.getElementById('saveSelectedToVault');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Sauvegarde...';
    }
    addLog('info', `Archivage de ${currentState.selectedItems.length} annonce(s) dans le coffre-fort...`);
    try {
        const selected = currentState.selectedItems.map(i => currentState.scannedItems[i]).filter(Boolean);
        let response = null;
        try {
            response = await chrome.runtime.sendMessage({
                action: 'saveBatchToVault',
                items: selected,
                options: { applyImageMods: true },
            });
            if (response && response.error && response.error.includes('Action inconnue')) {
                throw new Error(response.error);
            }
        } catch (bgErr) {
            console.warn('[Popup] Fallback direct batch sur content script:', bgErr);
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) throw bgErr;
            const results = [];
            for (const it of selected) {
                try {
                    const res = await chrome.tabs.sendMessage(tab.id, {
                        action: 'SAVE_LISTING_BY_ID_TO_VAULT',
                        itemId: it.id || it.itemId,
                        item: it,
                        options: { applyImageMods: true },
                    });
                    results.push(res || { success: true });
                } catch (e) {
                    results.push({ success: false, error: e.message });
                }
            }
            response = { success: true, results };
        }
        const succeeded = (response?.results || []).filter(r => r.success).length;
        addLog('success', `✅ ${succeeded}/${selected.length} annonce(s) sauvegardée(s) dans le coffre-fort !`);
        await refreshVaultList();
    } catch (err) {
        addLog('error', 'Erreur sauvegarde sélection: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '💾 Sauvegarder';
        }
    }
}

async function handleExportAllVault() {
    try {
        addLog('info', 'Préparation de l\'export complet du coffre-fort...');
        const response = await chrome.runtime.sendMessage({ action: 'exportFullVault' });
        const vault = response?.vault;
        if (!vault || !vault.items || !vault.items.length) {
            addLog('warning', 'Aucune annonce dans le coffre-fort à exporter.');
            return;
        }
        const json = JSON.stringify(vault, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vinted-vault-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        addLog('success', `Export de ${vault.items.length} annonces téléchargé avec succès !`);
    } catch (err) {
        addLog('error', 'Erreur export: ' + err.message);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* ==========================================================================
   STUDIO PHOTO ANTI-FLAG (Retouche Canvas & Anti-Doublon Vinted)
   ========================================================================== */

let studioState = {
    itemId: null,
    backup: null,
    photos: [],
    currentIndex: 0,
    cachedImage: null,
    showingOriginal: false,
    debounceTimer: null,
};

function setupPhotoStudioListeners() {
    const modal = document.getElementById('photoStudioModal');
    const closeBtn = document.getElementById('studioCloseBtn');
    const toggleCompareBtn = document.getElementById('studioToggleCompareBtn');
    const cropRange = document.getElementById('studioCropRange');
    const rotRange = document.getElementById('studioRotRange');
    const brightRange = document.getElementById('studioBrightRange');
    const noiseToggle = document.getElementById('studioNoiseToggle');
    const saveAllBtn = document.getElementById('studioSaveAllBtn');
    const downloadAllBtn = document.getElementById('studioDownloadAllBtn');

    if (!modal) return;

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.hidden = true;
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.hidden = true;
        }
    });

    if (cropRange) {
        cropRange.addEventListener('input', () => {
            const valEl = document.getElementById('studioCropVal');
            if (valEl) valEl.textContent = `${cropRange.value}%`;
            triggerStudioDebounced();
        });
    }

    if (rotRange) {
        rotRange.addEventListener('input', () => {
            const valEl = document.getElementById('studioRotVal');
            const v = Number(rotRange.value);
            if (valEl) valEl.textContent = `${v > 0 ? '+' : ''}${v.toFixed(1)}°`;
            triggerStudioDebounced();
        });
    }

    if (brightRange) {
        brightRange.addEventListener('input', () => {
            const valEl = document.getElementById('studioBrightVal');
            const v = Number(brightRange.value);
            if (valEl) valEl.textContent = `${v > 0 ? '+' : ''}${v}%`;
            triggerStudioDebounced();
        });
    }

    if (noiseToggle) {
        noiseToggle.addEventListener('change', () => {
            triggerStudioDebounced();
        });
    }

    if (toggleCompareBtn) {
        toggleCompareBtn.addEventListener('click', () => {
            studioState.showingOriginal = !studioState.showingOriginal;
            updateStudioCompareTag();
            renderStudioActivePhoto();
        });
    }

    if (saveAllBtn) {
        saveAllBtn.addEventListener('click', handleStudioSaveAll);
    }

    if (downloadAllBtn) {
        downloadAllBtn.addEventListener('click', handleStudioDownloadAll);
    }

    const setCoverBtn = document.getElementById('studioSetCoverBtn');
    if (setCoverBtn) {
        setCoverBtn.addEventListener('click', () => {
            if (!studioState.photos || studioState.photos.length <= 1) return;
            const idx = studioState.currentIndex;
            if (idx === 0) {
                addLog('info', 'Cette photo est déjà la photo de couverture.');
                return;
            }
            const [selected] = studioState.photos.splice(idx, 1);
            studioState.photos.unshift(selected);
            studioState.currentIndex = 0;
            renderStudioFilmstrip();
            loadAndRenderStudioIndex(0);
            addLog('success', `Photo ${idx + 1} définie comme nouvelle couverture (position 1) !`);
        });
    }

    const swap12Btn = document.getElementById('studioSwap12Btn');
    if (swap12Btn) {
        swap12Btn.addEventListener('click', () => {
            if (!studioState.photos || studioState.photos.length < 2) {
                addLog('warning', 'Il faut au moins 2 photos pour permuter.');
                return;
            }
            const tmp = studioState.photos[0];
            studioState.photos[0] = studioState.photos[1];
            studioState.photos[1] = tmp;
            studioState.currentIndex = 0;
            renderStudioFilmstrip();
            loadAndRenderStudioIndex(0);
            addLog('success', 'Photos 1 et 2 permutées ! (Photo 2 en couverture)');
        });
    }

    const presetBtn = document.getElementById('studioPresetBtn');
    if (presetBtn) {
        presetBtn.addEventListener('click', () => {
            const cropRange = document.getElementById('studioCropRange');
            const rotRange = document.getElementById('studioRotRange');
            const brightRange = document.getElementById('studioBrightRange');
            const noiseToggle = document.getElementById('studioNoiseToggle');

            if (cropRange) cropRange.value = '5';
            if (rotRange) rotRange.value = '0.7';
            if (brightRange) brightRange.value = '2';
            if (noiseToggle) noiseToggle.checked = true;

            const cVal = document.getElementById('studioCropVal');
            if (cVal) cVal.textContent = '5%';
            const rVal = document.getElementById('studioRotVal');
            if (rVal) rVal.textContent = '+0.7°';
            const bVal = document.getElementById('studioBrightVal');
            if (bVal) bVal.textContent = '+2%';

            triggerStudioDebounced();
            addLog('success', '🛡️ Preset Anti-Flag appliqué : Recadrage 5%, Rotation 0.7°, Luminosité +2%, Bruit sub-pixel.');
        });
    }
}

function triggerStudioDebounced() {
    if (studioState.showingOriginal) {
        studioState.showingOriginal = false;
        updateStudioCompareTag();
    }
    if (studioState.debounceTimer) clearTimeout(studioState.debounceTimer);
    studioState.debounceTimer = setTimeout(() => {
        renderStudioActivePhoto();
    }, 40);
}

function updateStudioCompareTag() {
    const tag = document.getElementById('studioCompareTag');
    if (!tag) return;
    if (studioState.showingOriginal) {
        tag.textContent = 'Photo originale (non modifiée)';
        tag.classList.add('original');
    } else {
        tag.textContent = 'Photo modifiée (Anti-doublon)';
        tag.classList.remove('original');
    }
}

function extractPhotosFromBackup(backup) {
    if (!backup) return [];

    const getUrl = (p) => {
        if (!p) return null;
        if (typeof p === 'string' && p.trim()) return p.trim();
        if (typeof p === 'object') {
            return p.dataUrl || p.sourceUrl || p.url || p.src || null;
        }
        return null;
    };

    // 1. Prepared photos (binary dataUrls prioritized)
    if (Array.isArray(backup.photos?.prepared) && backup.photos.prepared.length > 0) {
        const list = backup.photos.prepared.map(getUrl).filter(Boolean);
        if (list.length) return list;
    }

    // 2. Originals photos (binary dataUrls)
    if (Array.isArray(backup.photos?.originals) && backup.photos.originals.length > 0) {
        const list = backup.photos.originals.map(getUrl).filter(Boolean);
        if (list.length) return list;
    }

    // 3. backup.photos directly as array
    if (Array.isArray(backup.photos) && backup.photos.length > 0) {
        const list = backup.photos.map(getUrl).filter(Boolean);
        if (list.length) return list;
    }

    // 4. backup.item?.photos
    if (Array.isArray(backup.item?.photos) && backup.item.photos.length > 0) {
        const list = backup.item.photos.map(getUrl).filter(Boolean);
        if (list.length) return list;
    }

    // 5. backup.item?.imageUrls
    if (Array.isArray(backup.item?.imageUrls) && backup.item.imageUrls.length > 0) {
        const list = backup.item.imageUrls.map(getUrl).filter(Boolean);
        if (list.length) return list;
    }

    // 6. backup.item?.photoUrls
    if (Array.isArray(backup.item?.photoUrls) && backup.item.photoUrls.length > 0) {
        const list = backup.item.photoUrls.map(getUrl).filter(Boolean);
        if (list.length) return list;
    }

    // 7. backup.preparedFiles
    if (Array.isArray(backup.preparedFiles) && backup.preparedFiles.length > 0) {
        const list = backup.preparedFiles.map(getUrl).filter(Boolean);
        if (list.length) return list;
    }

    // 8. Single thumbnail fallback
    const singleThumb = getUrl(backup.item?.thumbnail) || getUrl(backup.thumbnail);
    if (singleThumb) {
        return [singleThumb];
    }

    return [];
}

async function urlToDataUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('data:') || url.startsWith('blob:')) {
        return url;
    }
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(url);
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.warn('[Popup] Échec conversion URL en dataUrl:', err);
        return url;
    }
}

async function handleOpenPhotoStudio(itemId) {
    try {
        const cleanId = String(itemId || '').trim();
        addLog('info', `Ouverture du Studio Photo pour l'annonce #${cleanId}...`);

        let backup = null;
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getVaultItemDetails',
                itemId: cleanId,
            });
            backup = response?.backup;
        } catch (_) {}

        if (!backup) {
            const key = `vinted_republish_backup_${cleanId}`;
            const res = await chrome.storage.local.get(key);
            backup = res[key];
        }

        if (!backup) {
            const indexRes = await chrome.storage.local.get('vinted_republish_backup_index_v1');
            const index = Array.isArray(indexRes.vinted_republish_backup_index_v1)
                ? indexRes.vinted_republish_backup_index_v1
                : [];
            const entry = index.find(e => String(e.itemId).trim() === cleanId || String(e.storageKey).includes(cleanId));
            if (entry && entry.storageKey) {
                const res = await chrome.storage.local.get(entry.storageKey);
                backup = res[entry.storageKey];
            }
        }

        if (!backup) {
            // Dernier recours : parcourir les clés locales
            const allStorage = await chrome.storage.local.get(null);
            for (const [k, val] of Object.entries(allStorage)) {
                if (k.startsWith('vinted_republish_backup_') && (k.includes(cleanId) || String(val?.item?.itemId) === cleanId)) {
                    backup = val;
                    break;
                }
            }
        }

        if (!backup) {
            throw new Error(`Annonce #${cleanId} introuvable dans le coffre-fort`);
        }

        const photos = extractPhotosFromBackup(backup);

        if (!photos || photos.length === 0) {
            addLog('warning', `Aucune photo binaire exploitable pour l'annonce #${cleanId}.`);
            alert('Aucune photo enregistrée pour cette annonce dans le coffre-fort.');
            return;
        }

        studioState.itemId = cleanId;
        studioState.backup = backup;
        studioState.photos = photos;
        studioState.currentIndex = 0;
        studioState.showingOriginal = false;
        studioState.cachedImage = null;

        const titleEl = document.getElementById('studioItemTitle');
        if (titleEl) titleEl.textContent = backup.item?.title || `Annonce #${cleanId}`;

        updateStudioCompareTag();
        renderStudioFilmstrip();
        await loadAndRenderStudioIndex(0);

        const modal = document.getElementById('photoStudioModal');
        if (modal) modal.hidden = false;
        addLog('success', `Studio Photo prêt : ${photos.length} photo(s) chargée(s).`);
    } catch (err) {
        addLog('error', 'Erreur ouverture Studio: ' + err.message);
    }
}

function renderStudioFilmstrip() {
    const filmstrip = document.getElementById('studioFilmstrip');
    if (!filmstrip) return;
    filmstrip.innerHTML = '';

    studioState.photos.forEach((src, idx) => {
        const thumb = document.createElement('img');
        thumb.src = src;
        thumb.className = `studio-thumb ${idx === studioState.currentIndex ? 'active' : ''}`;
        thumb.title = `Photo ${idx + 1}`;
        thumb.addEventListener('click', async () => {
            if (idx === studioState.currentIndex) return;
            filmstrip.querySelectorAll('.studio-thumb').forEach((el, i) => {
                el.classList.toggle('active', i === idx);
            });
            await loadAndRenderStudioIndex(idx);
        });
        filmstrip.appendChild(thumb);
    });
}

async function loadAndRenderStudioIndex(idx) {
    studioState.currentIndex = idx;
    const counter = document.getElementById('studioPhotoCounter');
    if (counter) {
        counter.textContent = `Photo ${idx + 1} / ${studioState.photos.length}`;
    }

    const filmstrip = document.getElementById('studioFilmstrip');
    if (filmstrip) {
        filmstrip.querySelectorAll('.studio-thumb').forEach((el, i) => {
            const isActive = i === idx;
            el.classList.toggle('active', isActive);
            if (isActive) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        });
    }

    const processor = window.ImageProcessor ? new window.ImageProcessor() : null;
    if (!processor) {
        addLog('error', 'ImageProcessor non initialisé.');
        return;
    }

    try {
        let currentSrc = studioState.photos[idx];
        if (currentSrc && !currentSrc.startsWith('data:') && !currentSrc.startsWith('blob:')) {
            currentSrc = await urlToDataUrl(currentSrc);
            studioState.photos[idx] = currentSrc;
        }
        studioState.cachedImage = await processor.loadImage(currentSrc);
        renderStudioActivePhoto();
    } catch (err) {
        addLog('error', 'Erreur chargement photo: ' + err.message);
    }
}

function renderStudioActivePhoto() {
    const canvas = document.getElementById('studioCanvas');
    const image = studioState.cachedImage;
    if (!canvas || !image) return;

    if (studioState.showingOriginal) {
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
        return;
    }

    const cropRange = document.getElementById('studioCropRange');
    const rotRange = document.getElementById('studioRotRange');
    const brightRange = document.getElementById('studioBrightRange');
    const noiseToggle = document.getElementById('studioNoiseToggle');

    const crop = cropRange ? Number(cropRange.value) : 4;
    const rot = rotRange ? Number(rotRange.value) : 0.6;
    const bright = brightRange ? Number(brightRange.value) : 0;
    const noise = noiseToggle ? noiseToggle.checked : true;

    const processor = window.ImageProcessor ? new window.ImageProcessor() : null;
    if (!processor) return;

    let processed = image;
    if (crop > 0) {
        processed = processor.cropImage(processed, crop);
    }
    if (rot !== 0) {
        processed = processor.rotateImage(processed, rot);
    }

    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = processed.width;
    tmpCanvas.height = processed.height;
    const tctx = tmpCanvas.getContext('2d');
    if (bright !== 0) {
        tctx.filter = `brightness(${1 + bright / 100})`;
    }
    tctx.drawImage(processed, 0, 0);
    tctx.filter = 'none';

    let finalCanvas = tmpCanvas;
    if (noise) {
        finalCanvas = processor.addSubtleNoise(tmpCanvas, {
            strength: 5 + (studioState.currentIndex % 3),
            brightness: 0.008,
        });
    }

    canvas.width = finalCanvas.width;
    canvas.height = finalCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(finalCanvas, 0, 0);
}

async function handleStudioSaveAll() {
    const saveBtn = document.getElementById('studioSaveAllBtn');
    const originalText = saveBtn ? saveBtn.innerHTML : '';
    try {
        if (!studioState.photos || !studioState.photos.length) return;
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = `⏳ Traitement de ${studioState.photos.length} photo(s)...`;
        }

        const cropRange = document.getElementById('studioCropRange');
        const rotRange = document.getElementById('studioRotRange');
        const brightRange = document.getElementById('studioBrightRange');
        const noiseToggle = document.getElementById('studioNoiseToggle');

        const crop = cropRange ? Number(cropRange.value) : 4;
        const rot = rotRange ? Number(rotRange.value) : 0.6;
        const bright = brightRange ? Number(brightRange.value) : 0;
        const noise = noiseToggle ? noiseToggle.checked : true;

        const processor = window.ImageProcessor ? new window.ImageProcessor() : null;
        if (!processor) throw new Error('ImageProcessor non disponible');

        addLog('info', `Application des modifications anti-doublon sur ${studioState.photos.length} photo(s)...`);
        const modifiedPhotos = [];

        for (let i = 0; i < studioState.photos.length; i++) {
            let rawSrc = studioState.photos[i];
            if (rawSrc && !rawSrc.startsWith('data:') && !rawSrc.startsWith('blob:')) {
                rawSrc = await urlToDataUrl(rawSrc);
            }
            const img = await processor.loadImage(rawSrc);

            let proc = img;
            // Variance par index pour unicité maximale entre les photos de l'annonce
            const actualCrop = Math.max(1, crop + (i % 3) * 0.3);
            const actualRot = rot + ((i % 2 === 0 ? 1 : -1) * (0.1 + (i % 3) * 0.05));

            if (actualCrop > 0) proc = processor.cropImage(proc, actualCrop);
            if (actualRot !== 0) proc = processor.rotateImage(proc, actualRot);

            const c = document.createElement('canvas');
            c.width = proc.width;
            c.height = proc.height;
            const ctx = c.getContext('2d');
            if (bright !== 0) {
                ctx.filter = `brightness(${1 + bright / 100})`;
            }
            ctx.drawImage(proc, 0, 0);
            ctx.filter = 'none';

            let finalCanvas = c;
            if (noise) {
                finalCanvas = processor.addSubtleNoise(c, {
                    strength: 5 + (i % 3),
                    brightness: 0.008,
                });
            }

            const base64 = processor.canvasToBase64(finalCanvas, 0.92);
            modifiedPhotos.push(base64);
        }

        // Sauvegarder dans le backup local
        const backup = studioState.backup;
        if (!backup.photos) {
            backup.photos = {};
        }

        const preparedArray = modifiedPhotos.map((dataUrl, idx) => ({
            index: idx,
            name: `vinted_mod_${studioState.itemId}_${idx}.jpg`,
            type: 'image/jpeg',
            dataUrl: dataUrl,
            size: Math.round(String(dataUrl || '').length * 0.75),
        }));

        backup.photos.prepared = preparedArray;
        backup.photos.preparedCount = preparedArray.length;
        if (!Array.isArray(backup.photos.originals) || !backup.photos.originals.length) {
            backup.photos.originals = preparedArray;
            backup.photos.originalCount = preparedArray.length;
        }

        if (!backup.item) backup.item = {};
        backup.item.photos = modifiedPhotos;
        backup.item.thumbnail = modifiedPhotos[0];
        backup.item.photosModifiedAntiFlag = true;
        backup.item.photoCount = modifiedPhotos.length;

        backup.preparedFiles = preparedArray.map(f => ({
            name: f.name,
            type: f.type,
            size: f.size,
            hasDataUrl: true,
        }));

        const storageKey = `vinted_republish_backup_${studioState.itemId}`;
        await chrome.storage.local.set({ [storageKey]: backup });

        // Mettre à jour l'index
        const indexRes = await chrome.storage.local.get('vinted_republish_backup_index_v1');
        const index = Array.isArray(indexRes.vinted_republish_backup_index_v1)
            ? indexRes.vinted_republish_backup_index_v1
            : [];
        const entry = index.find(e => String(e.itemId) === String(studioState.itemId) || e.storageKey === storageKey);
        if (entry) {
            entry.thumbnail = modifiedPhotos[0];
            entry.photoCount = modifiedPhotos.length;
            await chrome.storage.local.set({ vinted_republish_backup_index_v1: index });
        }

        studioState.photos = modifiedPhotos;
        renderStudioFilmstrip();
        await loadAndRenderStudioIndex(studioState.currentIndex);
        await refreshVaultList();

        addLog('success', `✅ ${modifiedPhotos.length} photo(s) anti-flag enregistrées dans le coffre-fort !`);
        if (saveBtn) {
            saveBtn.innerHTML = '✅ Modifications enregistrées !';
            setTimeout(() => {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText;
            }, 2000);
        }
    } catch (err) {
        addLog('error', 'Erreur sauvegarde photos: ' + err.message);
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }
}

async function handleStudioDownloadAll() {
    const btn = document.getElementById('studioDownloadAllBtn');
    const originalText = btn ? btn.textContent : '';
    try {
        if (!studioState.photos || !studioState.photos.length) return;
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Téléchargement...';
        }

        const cropRange = document.getElementById('studioCropRange');
        const rotRange = document.getElementById('studioRotRange');
        const brightRange = document.getElementById('studioBrightRange');
        const noiseToggle = document.getElementById('studioNoiseToggle');

        const crop = cropRange ? Number(cropRange.value) : 4;
        const rot = rotRange ? Number(rotRange.value) : 0.6;
        const bright = brightRange ? Number(brightRange.value) : 0;
        const noise = noiseToggle ? noiseToggle.checked : true;

        const processor = window.ImageProcessor ? new window.ImageProcessor() : null;
        if (!processor) throw new Error('ImageProcessor non disponible');

        const cleanTitle = (studioState.backup?.item?.title || 'vinted-photo')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 30);

        for (let i = 0; i < studioState.photos.length; i++) {
            let rawSrc = studioState.photos[i];
            if (rawSrc && !rawSrc.startsWith('data:') && !rawSrc.startsWith('blob:')) {
                rawSrc = await urlToDataUrl(rawSrc);
            }
            const img = await processor.loadImage(rawSrc);

            let proc = img;
            const actualCrop = Math.max(1, crop + (i % 3) * 0.3);
            const actualRot = rot + ((i % 2 === 0 ? 1 : -1) * (0.1 + (i % 3) * 0.05));

            if (actualCrop > 0) proc = processor.cropImage(proc, actualCrop);
            if (actualRot !== 0) proc = processor.rotateImage(proc, actualRot);

            const c = document.createElement('canvas');
            c.width = proc.width;
            c.height = proc.height;
            const ctx = c.getContext('2d');
            if (bright !== 0) ctx.filter = `brightness(${1 + bright / 100})`;
            ctx.drawImage(proc, 0, 0);
            ctx.filter = 'none';

            let finalCanvas = c;
            if (noise) {
                finalCanvas = processor.addSubtleNoise(c, {
                    strength: 5 + (i % 3),
                    brightness: 0.008,
                });
            }

            const base64 = processor.canvasToBase64(finalCanvas, 0.92);
            const a = document.createElement('a');
            a.href = base64;
            a.download = `${cleanTitle}-antiflag-${i + 1}.jpg`;
            a.click();
            await new Promise(r => setTimeout(r, 200));
        }

        addLog('success', `✅ ${studioState.photos.length} photo(s) retouchées téléchargées en JPEG !`);
    } catch (err) {
        addLog('error', 'Erreur téléchargement photos: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

/* ==========================================================================
   INTELLIGENCE ARTIFICIELLE (OPENAI) CONFIGURATION & REFORMULATION
   ========================================================================== */

function setupAiConfigListeners() {
    const aiEnabledToggle = document.getElementById('aiEnabledToggle');
    const aiApiKeyInput = document.getElementById('aiApiKeyInput');
    const aiToggleKeyVisibilityBtn = document.getElementById('aiToggleKeyVisibilityBtn');
    const aiModelSelect = document.getElementById('aiModelSelect');
    const aiAutoGenerateCheck = document.getElementById('aiAutoGenerateCheck');
    const aiTestKeyBtn = document.getElementById('aiTestKeyBtn');
    const aiStatusMessage = document.getElementById('aiStatusMessage');

    const loadAiConfig = async () => {
        try {
            const config = window.openaiService
                ? await window.openaiService.getOpenAiConfig()
                : { apiKey: '', model: 'gpt-4o-mini', enabled: false, autoGenerate: true };

            if (aiEnabledToggle) aiEnabledToggle.checked = Boolean(config.enabled);
            if (aiApiKeyInput) aiApiKeyInput.value = config.apiKey || '';
            if (aiModelSelect && config.model) aiModelSelect.value = config.model;
            if (aiAutoGenerateCheck) aiAutoGenerateCheck.checked = config.autoGenerate !== false;
        } catch (err) {
            console.warn('[Popup] Erreur chargement config OpenAI:', err);
        }
    };
    loadAiConfig();

    if (aiToggleKeyVisibilityBtn && aiApiKeyInput) {
        aiToggleKeyVisibilityBtn.addEventListener('click', () => {
            const isPassword = aiApiKeyInput.type === 'password';
            aiApiKeyInput.type = isPassword ? 'text' : 'password';
            aiToggleKeyVisibilityBtn.textContent = isPassword ? 'Masquer' : 'Afficher';
        });
    }

    if (aiEnabledToggle) {
        aiEnabledToggle.addEventListener('change', async (e) => {
            const isEnabled = e.target.checked;
            if (window.openaiService) {
                await window.openaiService.saveOpenAiConfig({ enabled: isEnabled });
            }
            if (isEnabled && aiApiKeyInput && !aiApiKeyInput.value.trim()) {
                if (aiStatusMessage) {
                    aiStatusMessage.textContent = "💡 N'oubliez pas de renseigner votre clé API OpenAI ci-dessous.";
                    aiStatusMessage.className = 'helper-text';
                }
            } else if (aiStatusMessage && !isEnabled) {
                aiStatusMessage.textContent = '';
            }
        });
    }

    if (aiApiKeyInput) {
        let keyTimeout = null;
        aiApiKeyInput.addEventListener('input', (e) => {
            clearTimeout(keyTimeout);
            keyTimeout = setTimeout(async () => {
                const cleanKey = e.target.value.trim();
                if (window.openaiService) {
                    await window.openaiService.saveOpenAiConfig({ apiKey: cleanKey });
                }
            }, 400);
        });
    }

    if (aiModelSelect) {
        aiModelSelect.addEventListener('change', async (e) => {
            if (window.openaiService) {
                await window.openaiService.saveOpenAiConfig({ model: e.target.value });
            }
        });
    }

    if (aiAutoGenerateCheck) {
        aiAutoGenerateCheck.addEventListener('change', async (e) => {
            if (window.openaiService) {
                await window.openaiService.saveOpenAiConfig({ autoGenerate: e.target.checked });
            }
        });
    }

    if (aiTestKeyBtn && aiApiKeyInput) {
        aiTestKeyBtn.addEventListener('click', async () => {
            const rawKey = aiApiKeyInput.value.trim();
            if (!rawKey) {
                if (aiStatusMessage) {
                    aiStatusMessage.textContent = '⚠️ Veuillez renseigner une clé API OpenAI (ex: sk-proj-...).';
                    aiStatusMessage.className = 'helper-text text-danger';
                }
                aiApiKeyInput.focus();
                return;
            }

            const originalBtnText = aiTestKeyBtn.innerHTML;
            aiTestKeyBtn.disabled = true;
            aiTestKeyBtn.textContent = '⏳ Test de connexion en cours...';
            if (aiStatusMessage) {
                aiStatusMessage.textContent = 'Test en cours via OpenAI API (0 token consommé)...';
                aiStatusMessage.className = 'helper-text';
            }

            try {
                const res = window.openaiService
                    ? await window.openaiService.testOpenAiApiKey(rawKey)
                    : await new Promise((resolve) => {
                          chrome.runtime.sendMessage({ action: 'OPENAI_TEST_KEY', apiKey: rawKey }, resolve);
                      });

                if (res?.ok) {
                    if (aiStatusMessage) {
                        aiStatusMessage.textContent = '✅ Connexion réussie ! Clé API valide et opérationnelle.';
                        aiStatusMessage.className = 'helper-text text-success';
                    }
                    if (aiEnabledToggle && !aiEnabledToggle.checked) {
                        aiEnabledToggle.checked = true;
                        if (window.openaiService) {
                            await window.openaiService.saveOpenAiConfig({ enabled: true, apiKey: rawKey });
                        }
                    }
                } else {
                    if (aiStatusMessage) {
                        aiStatusMessage.textContent = '❌ Échec : ' + (res?.error || 'Clé API refusée ou quota dépassé.');
                        aiStatusMessage.className = 'helper-text text-danger';
                    }
                }
            } catch (err) {
                if (aiStatusMessage) {
                    aiStatusMessage.textContent = '❌ Erreur de communication : ' + err.message;
                    aiStatusMessage.className = 'helper-text text-danger';
                }
            } finally {
                aiTestKeyBtn.disabled = false;
                aiTestKeyBtn.innerHTML = originalBtnText;
            }
        });
    }
}

/* ==========================================================================
   BOUCLIER ANTI-DOUBLON (REPUBLICATION ANTI-FLAG VINTED)
   ========================================================================== */

let antiDupState = {
    itemId: null,
    backup: null,
    photos: [],
    coverSwapped: true,
    titleVariations: [],
    titleIndex: 0,
    descVariations: [],
    descIndex: 0,
    aiTitles: [],
    aiDescriptions: [],
    aiLoading: false,
    aiLoaded: false,
};

function setupAntiDuplicateListeners() {
    const modal = document.getElementById('antiDuplicateModal');
    const closeBtn = document.getElementById('antiDupCloseBtn');
    const swapBtn = document.getElementById('antiDupSwapCoverBtn');
    const swapCheck = document.getElementById('antiDupSwapCoverCheck');
    const cycleTitleBtn = document.getElementById('antiDupCycleTitleBtn');
    const cycleDescBtn = document.getElementById('antiDupCycleDescBtn');
    const launchBtn = document.getElementById('antiDupLaunchBtn');
    const saveVaultBtn = document.getElementById('antiDupSaveVaultBtn');
    const rawPrefillBtn = document.getElementById('antiDupRawPrefillBtn');
    const magicAiBtn = document.getElementById('antiDupMagicAiBtn');
    const aiTitleBtn = document.getElementById('antiDupAiTitleBtn');
    const aiDescBtn = document.getElementById('antiDupAiDescBtn');

    if (!modal) return;

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.hidden = true;
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.hidden = true;
        }
    });

    if (swapBtn) {
        swapBtn.addEventListener('click', () => {
            if (swapCheck) {
                swapCheck.checked = !swapCheck.checked;
            }
            antiDupState.coverSwapped = swapCheck ? swapCheck.checked : !antiDupState.coverSwapped;
            updateAntiDupCoverPreview();
        });
    }

    if (swapCheck) {
        swapCheck.addEventListener('change', () => {
            antiDupState.coverSwapped = swapCheck.checked;
            updateAntiDupCoverPreview();
        });
    }

    if (cycleTitleBtn) {
        cycleTitleBtn.addEventListener('click', () => {
            if (!antiDupState.titleVariations.length) return;
            antiDupState.titleIndex = (antiDupState.titleIndex + 1) % antiDupState.titleVariations.length;
            const titleInput = document.getElementById('antiDupNewTitle');
            if (titleInput) {
                titleInput.value = antiDupState.titleVariations[antiDupState.titleIndex];
                titleInput.focus();
            }
        });
    }

    if (cycleDescBtn) {
        cycleDescBtn.addEventListener('click', () => {
            if (!antiDupState.descVariations.length) return;
            antiDupState.descIndex = (antiDupState.descIndex + 1) % antiDupState.descVariations.length;
            const descInput = document.getElementById('antiDupNewDesc');
            if (descInput) {
                descInput.value = antiDupState.descVariations[antiDupState.descIndex];
                descInput.focus();
            }
        });
    }

    if (magicAiBtn) {
        magicAiBtn.addEventListener('click', () => {
            triggerAiListingReformulation(true);
        });
    }

    if (aiTitleBtn) {
        aiTitleBtn.addEventListener('click', async () => {
            if (!antiDupState.aiTitles.length) {
                await triggerAiListingReformulation(true);
                return;
            }
            const titleInput = document.getElementById('antiDupNewTitle');
            if (titleInput && antiDupState.aiTitles.length) {
                const curIdx = antiDupState.aiTitles.indexOf(titleInput.value);
                const nextIdx = (curIdx + 1) % antiDupState.aiTitles.length;
                titleInput.value = antiDupState.aiTitles[nextIdx];
                titleInput.focus();
                titleInput.classList.add('input-highlight-pulse');
                setTimeout(() => titleInput.classList.remove('input-highlight-pulse'), 1200);
            }
        });
    }

    if (aiDescBtn) {
        aiDescBtn.addEventListener('click', async () => {
            if (!antiDupState.aiDescriptions.length) {
                await triggerAiListingReformulation(true);
                return;
            }
            const descInput = document.getElementById('antiDupNewDesc');
            if (descInput && antiDupState.aiDescriptions.length) {
                const curIdx = antiDupState.aiDescriptions.indexOf(descInput.value);
                const nextIdx = (curIdx + 1) % antiDupState.aiDescriptions.length;
                descInput.value = antiDupState.aiDescriptions[nextIdx];
                descInput.focus();
                descInput.classList.add('input-highlight-pulse');
                setTimeout(() => descInput.classList.remove('input-highlight-pulse'), 1200);
            }
        });
    }

    if (launchBtn) {
        launchBtn.addEventListener('click', handleApplyAndPrefillVariations);
    }

    if (saveVaultBtn) {
        saveVaultBtn.addEventListener('click', handleSaveVariationsToVault);
    }

    if (rawPrefillBtn) {
        rawPrefillBtn.addEventListener('click', () => {
            modal.hidden = true;
            if (antiDupState.itemId) {
                handleVaultPrefill(antiDupState.itemId);
            }
        });
    }
}


function updateAntiDupCoverPreview() {
    const imgEl = document.getElementById('antiDupCoverImg');
    const tagEl = document.getElementById('antiDupCoverTag');
    const swapCheck = document.getElementById('antiDupSwapCoverCheck');
    if (!imgEl || !antiDupState.photos.length) return;

    const shouldSwap = swapCheck ? swapCheck.checked : antiDupState.coverSwapped;
    if (shouldSwap && antiDupState.photos.length >= 2) {
        imgEl.src = antiDupState.photos[1];
        if (tagEl) {
            tagEl.textContent = 'Nouvelle couverture (Photo 2)';
            tagEl.style.color = '#34d399';
        }
    } else {
        imgEl.src = antiDupState.photos[0];
        if (tagEl) {
            tagEl.textContent = 'Photo 1 (Originale)';
            tagEl.style.color = '#94a3b8';
        }
    }
}

function generateTitleVariations(originalTitle, item = {}) {
    const raw = String(originalTitle || '').trim();
    if (!raw) return ['Article Vinted'];

    const brand = String(item.brand || '').trim();
    const variations = [];

    const formatTitle = (str) => {
        let clean = str.replace(/\s+/g, ' ').trim();
        if (clean.length > 100) clean = clean.slice(0, 97) + '...';
        return clean;
    };

    // 1. Detect segments separated by -, |, /, :, —
    if (/[-|/—:]/.test(raw)) {
        const parts = raw.split(/[-|/—:]/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
            variations.push(formatTitle(`${parts.slice(1).join(' - ')} - ${parts[0]}`));
            variations.push(formatTitle(`${parts[parts.length - 1]} : ${parts.slice(0, -1).join(' ')}`));
        }
    }

    // 2. Put brand or sub-brand in front if not already
    const words = raw.split(/\s+/);
    if (brand && !raw.toLowerCase().startsWith(brand.toLowerCase())) {
        variations.push(formatTitle(`${brand} - ${raw}`));
        variations.push(formatTitle(`${brand} ${raw}`));
    }

    // 3. Move keywords: split words and rearrange chunks
    if (words.length >= 4) {
        const mid = Math.floor(words.length / 2);
        const chunk1 = words.slice(0, mid).join(' ');
        const chunk2 = words.slice(mid).join(' ');
        variations.push(formatTitle(`${chunk2} ${chunk1}`));
    }

    // 4. Subtle synonym replacements on common terms
    let synTitle = raw;
    const synMap = [
        [/\bImport Japon\b/gi, 'Japon Édition'],
        [/\bJapon\b/gi, 'Japon Officiel'],
        [/\bPeluche Chien\b/gi, 'Peluche Chien Kawaii'],
        [/\bTrès bon état\b/gi, 'TBE'],
        [/\bNeuf avec étiquette\b/gi, 'Neuf Étiqueté'],
        [/\bNeuf sans étiquette\b/gi, 'Comme Neuf'],
        [/\bVintage\b/gi, 'Style Vintage'],
        [/\bOversize\b/gi, 'Coupe Oversize'],
    ];
    for (const [rgx, rep] of synMap) {
        if (rgx.test(synTitle)) {
            synTitle = synTitle.replace(rgx, rep);
            break;
        }
    }
    if (synTitle !== raw) {
        variations.push(formatTitle(synTitle));
    }

    if (variations.length < 3 && words.length >= 3) {
        const reordered = [...words.slice(-2), ...words.slice(0, -2)].join(' ');
        variations.push(formatTitle(reordered));
    }

    const unique = Array.from(new Set(variations.filter(v => v && v !== raw)));
    if (!unique.length) {
        unique.push(formatTitle(`${raw} ✨`));
        unique.push(formatTitle(`Authentique ${raw}`));
    }

    return unique;
}

function generateDescriptionVariations(originalDesc, item = {}) {
    const raw = String(originalDesc || '').trim();
    const brand = String(item.brand || '').trim();
    const condition = String(item.condition || '').trim();
    const title = String(item.title || '').trim();
    const colors = Array.isArray(item.colors) ? item.colors.join(', ') : String(item.colors || '');
    const material = String(item.material || '').trim();

    let cleanBody = raw
        .replace(/^(bonjour|bonsoir|salut|hello)[^.\n]*[.\n]*/i, '')
        .replace(/\b(envoi rapide|envoie rapide|colis soigné|frais de port)[^.\n]*[.\n]*/gi, '')
        .trim();

    let enrichedCondition = condition;
    if (condition.toLowerCase().includes('neuf sans étiquette')) {
        enrichedCondition = 'Article neuf, jamais utilisé/porté (sans étiquette)';
    } else if (condition.toLowerCase().includes('très bon état')) {
        enrichedCondition = 'Très bon état général, propre et soigné';
    } else if (condition.toLowerCase().includes('bon état')) {
        enrichedCondition = 'Bon état d\'usage';
    } else if (condition.toLowerCase().includes('neuf avec étiquette')) {
        enrichedCondition = 'Neuf avec son étiquette d\'origine';
    }

    const variations = [];

    // Variation 1: Clean Pro bullet points with Sparkle hook
    variations.push(`✨ Belle trouvaille disponible :

• Présentation : ${cleanBody || title}
${enrichedCondition ? `• État : ${enrichedCondition}` : ''}
${brand ? `• Marque : ${brand}` : ''}
${colors ? `• Couleur(s) : ${colors}` : ''}
${material ? `• Matière : ${material}` : ''}

📦 Expédition rapide et emballage très soigné sous 24h/48h.
💬 N'hésitez pas si vous avez la moindre question ou besoin de photos complémentaires !`);

    // Variation 2: Warm casual bullet points
    variations.push(`🧸 En vente : ${title}

• Détails de l'article : ${cleanBody || 'Voir photos détaillées.'}
${enrichedCondition ? `• Condition : ${enrichedCondition}` : ''}
${brand ? `• Fabricant / Marque : ${brand}` : ''}
${colors ? `• Coloris : ${colors}` : ''}

⭐ Envoi rapide, propre et protégé.
N'hésitez pas à jeter un œil à mon dressing pour faire des lots et économiser sur les frais de port !`);

    // Variation 3: Minimalist bullet points
    variations.push(`Je propose à la vente cet article :

▪️ Description : ${cleanBody || title}
${enrichedCondition ? `▪️ État : ${enrichedCondition}` : ''}
${brand ? `▪️ Marque : ${brand}` : ''}
${material ? `▪️ Composition : ${material}` : ''}

🚚 Envoi rapide et soigné garanti.`);

    return variations;
}

async function triggerAiListingReformulation(isManual = false) {
    if (!antiDupState.backup?.item) return;

    let aiConfig = null;
    try {
        aiConfig = window.openaiService ? await window.openaiService.getOpenAiConfig() : null;
    } catch (_) {}

    const apiKey = aiConfig?.apiKey;
    const model = aiConfig?.model || 'gpt-4o-mini';

    const aiAccordion = document.getElementById('aiConfigAccordion');
    const aiKeyInput = document.getElementById('aiApiKeyInput');
    const magicBtn = document.getElementById('antiDupMagicAiBtn');
    const magicBtnText = document.getElementById('antiDupMagicAiBtnText');
    const spinner = document.getElementById('antiDupAiSpinner');
    const subTitle = document.getElementById('antiDupAiBadgeSubtitle');

    if (!apiKey) {
        if (isManual) {
            if (aiAccordion) aiAccordion.open = true;
            if (aiKeyInput) {
                aiKeyInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                aiKeyInput.focus();
            }
            if (subTitle) {
                subTitle.textContent = "⚠️ Clé API requise — renseignez-la dans l'accordéon IA ci-dessous";
                subTitle.style.color = '#dc2626';
            }
            addLog('warn', 'Veuillez saisir votre clé API OpenAI dans la section IA pour utiliser cette fonction.');
        }
        return;
    }

    if (antiDupState.aiLoading) return;
    antiDupState.aiLoading = true;

    if (spinner) spinner.hidden = false;
    if (magicBtnText) magicBtnText.textContent = '⏳ Analyse IA...';
    if (magicBtn) magicBtn.disabled = true;
    if (subTitle) {
        subTitle.textContent = `Optimisation en cours via ${model}...`;
        subTitle.style.color = '#7e22ce';
    }

    try {
        let result = null;
        if (window.openaiService) {
            result = await window.openaiService.callOpenAiListingReformulation({
                apiKey,
                model,
                title: antiDupState.backup.item.title || '',
                description: antiDupState.backup.item.description || '',
                item: antiDupState.backup.item,
            });
        } else {
            result = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'OPENAI_GENERATE_VARIATIONS',
                    apiKey,
                    model,
                    title: antiDupState.backup.item.title || '',
                    description: antiDupState.backup.item.description || '',
                    item: antiDupState.backup.item,
                }, (res) => {
                    if (res?.success) resolve(res);
                    else reject(new Error(res?.error || 'Erreur OpenAI'));
                });
            });
        }

        if (result && (result.titles?.length || result.descriptions?.length)) {
            antiDupState.aiTitles = result.titles || [];
            antiDupState.aiDescriptions = result.descriptions || [];
            antiDupState.aiLoaded = true;

            // Insérer les variantes IA au début du carrousel de variations sans doublon
            if (antiDupState.aiTitles.length) {
                antiDupState.titleVariations = [
                    ...antiDupState.aiTitles,
                    ...antiDupState.titleVariations.filter(t => !antiDupState.aiTitles.includes(t)),
                ];
                antiDupState.titleIndex = 0;
                const titleInput = document.getElementById('antiDupNewTitle');
                if (titleInput) {
                    titleInput.value = antiDupState.titleVariations[0];
                    titleInput.classList.add('input-highlight-pulse');
                    setTimeout(() => titleInput.classList.remove('input-highlight-pulse'), 1200);
                }
            }

            if (antiDupState.aiDescriptions.length) {
                antiDupState.descVariations = [
                    ...antiDupState.aiDescriptions,
                    ...antiDupState.descVariations.filter(d => !antiDupState.aiDescriptions.includes(d)),
                ];
                antiDupState.descIndex = 0;
                const descInput = document.getElementById('antiDupNewDesc');
                if (descInput) {
                    descInput.value = antiDupState.descVariations[0];
                    descInput.classList.add('input-highlight-pulse');
                    setTimeout(() => descInput.classList.remove('input-highlight-pulse'), 1200);
                }
            }

            if (subTitle) {
                subTitle.textContent = `✨ Variantes IA prêtes (${antiDupState.aiTitles.length} titres, ${antiDupState.aiDescriptions.length} desc.)`;
                subTitle.style.color = '#059669';
            }
            addLog('success', `✨ Intelligence Artificielle (${model}) : reformulations appliquées avec succès.`);
        }
    } catch (err) {
        console.warn('[Anti-Dup AI] Erreur reformulation:', err);
        addLog('warn', `Génération IA non disponible (${err.message}). Les variations locales restent actives.`);
        if (subTitle) {
            let userMsg = err.message || 'Erreur OpenAI';
            if (userMsg.toLowerCase().includes('credit') || userMsg.toLowerCase().includes('billing')) {
                userMsg = 'Compte OpenAI sans crédit (solde 0 $). Ajoutez 5 $ sur platform.openai.com/billing';
            }
            subTitle.textContent = isManual ? `❌ ${userMsg}` : `⚠️ ${userMsg} (variations locales actives)`;
            subTitle.style.color = '#dc2626';
        }
    } finally {

        antiDupState.aiLoading = false;
        if (spinner) spinner.hidden = true;
        if (magicBtnText) magicBtnText.textContent = antiDupState.aiLoaded ? '✨ Régénérer IA' : '✨ Générer avec l\'IA';
        if (magicBtn) magicBtn.disabled = false;
    }
}

async function handleOpenAntiDuplicateModal(itemId) {
    try {
        const cleanId = String(itemId || '').trim();
        addLog('info', `Chargement du Bouclier Anti-Doublon pour l'annonce #${cleanId}...`);

        let backup = null;
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getVaultItemDetails',
                itemId: cleanId,
            });
            backup = response?.backup;
        } catch (_) {}

        if (!backup) {
            const key = `vinted_republish_backup_${cleanId}`;
            const res = await chrome.storage.local.get(key);
            backup = res[key];
        }

        if (!backup) {
            const indexRes = await chrome.storage.local.get('vinted_republish_backup_index_v1');
            const index = Array.isArray(indexRes.vinted_republish_backup_index_v1)
                ? indexRes.vinted_republish_backup_index_v1
                : [];
            const entry = index.find(e => String(e.itemId).trim() === cleanId || String(e.storageKey).includes(cleanId));
            if (entry && entry.storageKey) {
                const res = await chrome.storage.local.get(entry.storageKey);
                backup = res[entry.storageKey];
            }
        }

        if (!backup) {
            throw new Error(`Annonce #${cleanId} introuvable dans le coffre-fort`);
        }

        const photos = extractPhotosFromBackup(backup);
        antiDupState.itemId = cleanId;
        antiDupState.backup = backup;
        antiDupState.photos = photos;
        antiDupState.aiTitles = [];
        antiDupState.aiDescriptions = [];
        antiDupState.aiLoading = false;
        antiDupState.aiLoaded = false;

        // Generer les variations algorithmiques immédiates (0ms, 100% stable)
        const titleVars = generateTitleVariations(backup.item?.title, backup.item);
        antiDupState.titleVariations = titleVars;
        antiDupState.titleIndex = 0;

        const descVars = generateDescriptionVariations(backup.item?.description, backup.item);
        antiDupState.descVariations = descVars;
        antiDupState.descIndex = 0;

        antiDupState.coverSwapped = photos.length >= 2;

        const subtitleEl = document.getElementById('antiDupItemSubtitle');
        if (subtitleEl) subtitleEl.textContent = backup.item?.title || `Annonce #${cleanId}`;

        const origTitleEl = document.getElementById('antiDupOriginalTitle');
        if (origTitleEl) origTitleEl.textContent = backup.item?.title || '—';

        const newTitleInput = document.getElementById('antiDupNewTitle');
        if (newTitleInput) newTitleInput.value = titleVars[0] || backup.item?.title || '';

        const newDescInput = document.getElementById('antiDupNewDesc');
        if (newDescInput) newDescInput.value = descVars[0] || backup.item?.description || '';

        const swapCheck = document.getElementById('antiDupSwapCoverCheck');
        if (swapCheck) swapCheck.checked = antiDupState.coverSwapped;

        const bgCheck = document.getElementById('antiDupBackgroundCheck');
        if (bgCheck) {
            const pref = await chrome.storage.local.get('vinted_pref_open_in_background');
            bgCheck.checked = pref.vinted_pref_open_in_background !== false;
        }

        updateAntiDupCoverPreview();

        const modal = document.getElementById('antiDuplicateModal');
        if (modal) modal.hidden = false;
        addLog('success', '🛡️ Bouclier Anti-Doublon prêt : variations générées avec succès.');

        // Mise à jour de l'état du bandeau IA dans la modale
        const subTitleEl = document.getElementById('antiDupAiBadgeSubtitle');
        const magicBtnText = document.getElementById('antiDupMagicAiBtnText');
        const spinner = document.getElementById('antiDupAiSpinner');
        if (spinner) spinner.hidden = true;

        let aiConfig = null;
        try {
            aiConfig = window.openaiService ? await window.openaiService.getOpenAiConfig() : null;
        } catch (_) {}

        const hasKey = Boolean(aiConfig?.apiKey);

        if (!hasKey) {
            if (subTitleEl) {
                subTitleEl.textContent = "💡 Activez l'IA dans les réglages ci-dessous pour des reformulations encore plus naturelles.";
                subTitleEl.style.color = '#7e22ce';
            }
            if (magicBtnText) magicBtnText.textContent = "✨ Configurer l'IA";
        } else if (!aiConfig?.enabled) {
            if (subTitleEl) {
                subTitleEl.textContent = `IA désactivée — Modèle ${aiConfig.model || 'gpt-4o-mini'} configuré.`;
                subTitleEl.style.color = '#7e22ce';
            }
            if (magicBtnText) magicBtnText.textContent = "✨ Activer & Générer";
        } else {
            if (subTitleEl) {
                subTitleEl.textContent = `Modèle ${aiConfig.model || 'gpt-4o-mini'} prêt`;
                subTitleEl.style.color = '#7e22ce';
            }
            if (magicBtnText) magicBtnText.textContent = "✨ Générer avec l'IA";

            if (aiConfig.autoGenerate !== false) {
                setTimeout(() => {
                    triggerAiListingReformulation(false);
                }, 50);
            }
        }
    } catch (err) {
        addLog('error', 'Erreur ouverture Bouclier Anti-Doublon: ' + err.message);
    }
}


async function handleApplyAndPrefillVariations() {
    const launchBtn = document.getElementById('antiDupLaunchBtn');
    const originalText = launchBtn ? launchBtn.innerHTML : '';
    try {
        if (!antiDupState.itemId || !antiDupState.backup) return;

        if (launchBtn) {
            launchBtn.disabled = true;
            launchBtn.innerHTML = '⏳ Traitement anti-doublon des photos...';
        }

        const newTitleInput = document.getElementById('antiDupNewTitle');
        const newDescInput = document.getElementById('antiDupNewDesc');
        const swapCheck = document.getElementById('antiDupSwapCoverCheck');
        const autoCropCheck = document.getElementById('antiDupAutoCropCheck');

        const title = (newTitleInput?.value || '').trim() || antiDupState.backup.item?.title;
        const description = (newDescInput?.value || '').trim() || antiDupState.backup.item?.description;

        // Reordonnancement des photos
        let orderedPhotos = [...antiDupState.photos];
        const shouldSwap = swapCheck ? swapCheck.checked : antiDupState.coverSwapped;
        if (shouldSwap && orderedPhotos.length >= 2) {
            const [p1, p2, ...rest] = orderedPhotos;
            orderedPhotos = [p2, p1, ...rest];
        }

        let finalPhotos = orderedPhotos;

        // Micro-retouche automatique si cochee (+5% recadrage, +2% lumi, rotation, bruit)
        if (autoCropCheck && autoCropCheck.checked && window.ImageProcessor) {
            addLog('info', 'Application du micro-recadrage et ajustement de luminosité anti-pHash...');
            const processor = new window.ImageProcessor();
            const processedList = [];

            for (let i = 0; i < orderedPhotos.length; i++) {
                let rawSrc = orderedPhotos[i];
                if (rawSrc && !rawSrc.startsWith('data:') && !rawSrc.startsWith('blob:')) {
                    rawSrc = await urlToDataUrl(rawSrc);
                }
                const img = await processor.loadImage(rawSrc);

                // Recadrage 5%, micro-rotation 0.7°, luminosite +2%
                const actualCrop = Math.max(1, 5 + (i % 3) * 0.2);
                const actualRot = 0.7 * (i % 2 === 0 ? 1 : -1);

                let proc = processor.cropImage(img, actualCrop);
                if (actualRot !== 0) proc = processor.rotateImage(proc, actualRot);

                const c = document.createElement('canvas');
                c.width = proc.width;
                c.height = proc.height;
                const ctx = c.getContext('2d');
                ctx.filter = 'brightness(1.02)';
                ctx.drawImage(proc, 0, 0);
                ctx.filter = 'none';

                const finalCanvas = processor.addSubtleNoise(c, {
                    strength: 5 + (i % 3),
                    brightness: 0.008,
                });

                const base64 = processor.canvasToBase64(finalCanvas, 0.92);
                processedList.push(base64);
            }
            finalPhotos = processedList;
        }

        const inBackground = Boolean(document.getElementById('antiDupBackgroundCheck')?.checked ?? true);
        addLog('info', `Envoi de l'annonce avec le nouveau titre: "${title}" (${inBackground ? 'mode discret en arrière-plan' : 'premier plan'})`);
        updateStatus('processing', 'Pré-remplissage avec protection anti-doublon...');

        const response = await chrome.runtime.sendMessage({
            action: 'restoreVaultItem',
            itemId: antiDupState.itemId,
            settings: {
                autoSave: false,
                allowDestructiveRepublish: false,
                openInBackground: inBackground,
                variations: {
                    title,
                    description,
                    photos: finalPhotos,
                },
            },
        });

        if (!response?.success) {
            throw new Error(response?.error || 'Échec du pré-remplissage');
        }

        const modal = document.getElementById('antiDuplicateModal');
        if (modal) modal.hidden = true;

        if (inBackground) {
            addLog('success', `🚀 Annonce lancée en arrière-plan (mode discret) ! Une notification s'affichera dès que le brouillon sera prêt.`);
            updateStatus('ready', 'Pré-remplissage en arrière-plan');
        } else {
            addLog('success', `🚀 Annonce prête sur Vinted avec couverture modifiée, titre reformulé et description aérée !`);
            updateStatus('ready', 'Formulaire Vinted en cours de remplissage');
        }
    } catch (err) {
        addLog('error', 'Erreur republication anti-doublon: ' + err.message);
        updateStatus('error', err.message);
    } finally {
        if (launchBtn) {
            launchBtn.disabled = false;
            launchBtn.innerHTML = originalText;
        }
    }
}

async function handleSaveVariationsToVault() {
    const saveBtn = document.getElementById('antiDupSaveVaultBtn');
    const originalText = saveBtn ? saveBtn.textContent : '';
    try {
        if (!antiDupState.itemId || !antiDupState.backup) return;

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = '⏳ Sauvegarde...';
        }

        const newTitleInput = document.getElementById('antiDupNewTitle');
        const newDescInput = document.getElementById('antiDupNewDesc');
        const swapCheck = document.getElementById('antiDupSwapCoverCheck');

        const title = (newTitleInput?.value || '').trim() || antiDupState.backup.item?.title;
        const description = (newDescInput?.value || '').trim() || antiDupState.backup.item?.description;

        let orderedPhotos = [...antiDupState.photos];
        const shouldSwap = swapCheck ? swapCheck.checked : antiDupState.coverSwapped;
        if (shouldSwap && orderedPhotos.length >= 2) {
            const [p1, p2, ...rest] = orderedPhotos;
            orderedPhotos = [p2, p1, ...rest];
        }

        const backup = antiDupState.backup;
        if (!backup.item) backup.item = {};
        backup.item.title = title;
        backup.item.description = description;

        // Mise a jour des photos dans le backup
        if (orderedPhotos.length) {
            const preparedArray = orderedPhotos.map((dataUrl, idx) => ({
                index: idx,
                name: `vinted_mod_${antiDupState.itemId}_${idx}.jpg`,
                type: 'image/jpeg',
                dataUrl: dataUrl,
                size: Math.round(String(dataUrl || '').length * 0.75),
            }));
            if (!backup.photos) backup.photos = {};
            backup.photos.prepared = preparedArray;
            backup.photos.preparedCount = preparedArray.length;
            backup.item.photos = orderedPhotos;
            backup.item.thumbnail = orderedPhotos[0];
            backup.item.photoCount = orderedPhotos.length;
        }

        const storageKey = `vinted_republish_backup_${antiDupState.itemId}`;
        await chrome.storage.local.set({ [storageKey]: backup });

        // Mettre a jour l'index
        const indexRes = await chrome.storage.local.get('vinted_republish_backup_index_v1');
        const index = Array.isArray(indexRes.vinted_republish_backup_index_v1)
            ? indexRes.vinted_republish_backup_index_v1
            : [];
        const entry = index.find(e => String(e.itemId) === String(antiDupState.itemId) || e.storageKey === storageKey);
        if (entry) {
            entry.title = title;
            if (orderedPhotos.length) entry.thumbnail = orderedPhotos[0];
            await chrome.storage.local.set({ vinted_republish_backup_index_v1: index });
        }

        addLog('success', '✅ Variations (titre, description, couverture) enregistrées dans le Coffre-fort !');
        await refreshVaultList();

        if (saveBtn) {
            saveBtn.textContent = '✅ Enregistré !';
            setTimeout(() => {
                saveBtn.disabled = false;
                saveBtn.textContent = originalText;
            }, 2000);
        }
    } catch (err) {
        addLog('error', 'Erreur sauvegarde variations: ' + err.message);
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    }
}

console.log('[Popup PRO] 🎯 Popup professionnel initialisé');
