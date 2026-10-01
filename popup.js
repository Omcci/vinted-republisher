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
    const tabs = document.querySelectorAll('.nav-tab');
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
            if (targetPanelId === 'panelVault') {
                refreshVaultList();
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
        const response = await chrome.runtime.sendMessage({ action: 'getVaultItems' });
        vaultItems = Array.isArray(response?.items) ? response.items : [];
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
                    <button class="btn btn-sm btn-primary vault-prefill-btn" data-id="${item.itemId}" type="button" title="Ouvrir la page Vinted et pré-remplir automatiquement">
                        ⚡ Pré-remplir l'annonce
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
    container.querySelectorAll('.vault-prefill-btn').forEach(btn => {
        btn.addEventListener('click', () => handleVaultPrefill(btn.dataset.id));
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
        addLog('info', `Chargement de l'annonce #${itemId} pour pré-remplissage...`);
        updateStatus('processing', 'Pré-remplissage en cours...');
        const response = await chrome.runtime.sendMessage({
            action: 'restoreVaultItem',
            itemId,
            settings: { autoSave: false, allowDestructiveRepublish: false },
        });
        if (!response?.success) {
            throw new Error(response?.error || 'Échec du pré-remplissage');
        }
        addLog('success', `Annonce #${itemId} chargée sur https://www.vinted.fr/items/new ! Remplissage en cours...`);
        updateStatus('ready', 'Formulaire Vinted en cours de remplissage');
    } catch (error) {
        addLog('error', 'Erreur pré-remplissage: ' + error.message);
        updateStatus('error', error.message);
    }
}

async function handleVaultCopy(itemId, btn) {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getVaultItemDetails',
            itemId,
        });
        const backup = response?.backup;
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
        const response = await chrome.runtime.sendMessage({
            action: 'getVaultItemDetails',
            itemId,
        });
        const backup = response?.backup;
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
        const response = await chrome.runtime.sendMessage({
            action: 'deleteVaultItem',
            itemId,
        });
        if (response?.success) {
            addLog('info', `Annonce #${itemId} supprimée du coffre-fort`);
            await refreshVaultList();
        }
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
        const response = await chrome.runtime.sendMessage({
            action: 'saveCurrentPageToVault',
            options: { applyImageMods: true },
        });
        if (!response || !response.success) {
            throw new Error(response?.error || 'Échec extraction page');
        }
        addLog('success', `✅ Annonce "${response.title}" (${response.photoCount} photo(s)) enregistrée dans le coffre-fort !`);
        if (btn) btn.textContent = '✅ Annonce sauvegardée !';
        await refreshVaultList();
        setTimeout(() => {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '📥 Sauvegarder l\'annonce de la page active';
            }
        }, 2500);
    } catch (err) {
        addLog('error', 'Sauvegarde échouée: ' + err.message);
        if (btn) {
            btn.textContent = '❌ ' + err.message.slice(0, 24);
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = '📥 Sauvegarder l\'annonce de la page active';
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
        const response = await chrome.runtime.sendMessage({
            action: 'saveBatchToVault',
            items: selected,
            options: { applyImageMods: true },
        });
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

console.log('[Popup PRO] 🎯 Popup professionnel initialisé');
