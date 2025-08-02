// Variables globales
let currentTab = null;
let foundItems = [];
let selectedItems = [];
let isProcessing = false;

// Éléments DOM
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const scanButton = document.getElementById('scanItems');
const republishButton = document.getElementById('republishSelected');
const itemsList = document.getElementById('itemsList');
const itemsContainer = document.getElementById('itemsContainer');
const itemsCount = document.getElementById('itemsCount');
const progress = document.getElementById('progress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const logs = document.getElementById('logs');
const logsContainer = document.getElementById('logsContainer');

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await checkCurrentPage();
    setupEventListeners();
});

// Chargement des paramètres sauvegardés
async function loadSettings() {
    try {
        const settings = await chrome.storage.sync.get({
            cropPercentage: '5',
            addWatermark: true,
            watermarkText: '',
            rotationAngle: '0.5',
            qualityReduction: '5',
            delayBetweenItems: '60',
            maxItemsPerSession: '10'
        });

        // Appliquer les paramètres aux éléments
        Object.keys(settings).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = settings[key];
                } else {
                    element.value = settings[key];
                }
            }
        });
    } catch (error) {
        logMessage('Erreur lors du chargement des paramètres', 'error');
    }
}

// Sauvegarde des paramètres
async function saveSettings() {
    const settings = {
        cropPercentage: document.getElementById('cropPercentage').value,
        addWatermark: document.getElementById('addWatermark').checked,
        watermarkText: document.getElementById('watermarkText').value,
        rotationAngle: document.getElementById('rotationAngle').value,
        qualityReduction: document.getElementById('qualityReduction').value,
        delayBetweenItems: document.getElementById('delayBetweenItems').value,
        maxItemsPerSession: document.getElementById('maxItemsPerSession').value
    };

    try {
        await chrome.storage.sync.set(settings);
    } catch (error) {
        logMessage('Erreur lors de la sauvegarde des paramètres', 'error');
    }
}

// Vérification de la page actuelle
async function checkCurrentPage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTab = tab;

        if (tab.url.includes('vinted.')) {
            updateStatus('online', 'Connecté à Vinted');
            scanButton.disabled = false;
        } else {
            updateStatus('error', 'Veuillez ouvrir une page Vinted');
            scanButton.disabled = true;
        }
    } catch (error) {
        updateStatus('error', 'Erreur de connexion');
        logMessage('Erreur lors de la vérification de la page', 'error');
    }
}

// Mise à jour du statut
function updateStatus(type, message) {
    statusIndicator.className = `status-indicator ${type}`;
    statusText.textContent = message;
}

// Configuration des événements
function setupEventListeners() {
    // Sauvegarde automatique des paramètres
    const settingsElements = [
        'cropPercentage', 'addWatermark', 'watermarkText',
        'rotationAngle', 'qualityReduction', 'delayBetweenItems',
        'maxItemsPerSession'
    ];

    settingsElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', saveSettings);
        }
    });

    // Bouton scanner
    scanButton.addEventListener('click', scanVintedItems);

    // Bouton republier
    republishButton.addEventListener('click', startRepublishing);
}

// Scanner les annonces Vinted
async function scanVintedItems() {
    if (isProcessing) return;

    try {
        isProcessing = true;
        showSpinner('scan', true);
        updateStatus('online', 'Recherche des annonces...');

        // Envoyer message au content script pour scanner les annonces
        const response = await chrome.tabs.sendMessage(currentTab.id, {
            action: 'scanItems'
        });

        if (response && response.success) {
            foundItems = response.items || [];
            displayFoundItems();
            updateStatus('online', `${foundItems.length} annonces trouvées`);
        } else {
            throw new Error(response?.error || 'Erreur lors du scan');
        }
    } catch (error) {
        logMessage(`Erreur lors du scan: ${error.message}`, 'error');
        updateStatus('error', 'Erreur lors du scan');
    } finally {
        isProcessing = false;
        showSpinner('scan', false);
    }
}

// Afficher les annonces trouvées
function displayFoundItems() {
    if (foundItems.length === 0) {
        itemsList.style.display = 'none';
        return;
    }

    itemsContainer.innerHTML = '';
    selectedItems = [];

    foundItems.forEach((item, index) => {
        const itemElement = createItemElement(item, index);
        itemsContainer.appendChild(itemElement);
    });

    itemsCount.textContent = foundItems.length;
    itemsList.style.display = 'block';
    updateRepublishButton();
}

// Créer un élément d'annonce
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
            selectedItems.push(index);
            div.classList.add('selected');
        } else {
            selectedItems = selectedItems.filter(i => i !== index);
            div.classList.remove('selected');
        }
        updateRepublishButton();
    });

    return div;
}

// Mettre à jour le bouton republier
function updateRepublishButton() {
    republishButton.disabled = selectedItems.length === 0 || isProcessing;
    if (selectedItems.length > 0) {
        republishButton.querySelector('#republishText').textContent =
            `Republier ${selectedItems.length} annonce(s)`;
    } else {
        republishButton.querySelector('#republishText').textContent =
            'Republier les sélectionnées';
    }
}

// Commencer la republication
async function startRepublishing() {
    if (isProcessing || selectedItems.length === 0) return;

    try {
        isProcessing = true;
        showSpinner('republish', true);
        showProgress();
        showLogs();

        const maxItems = parseInt(document.getElementById('maxItemsPerSession').value);
        const itemsToRepublish = selectedItems.slice(0, maxItems);

        logMessage(`Début de la republication de ${itemsToRepublish.length} annonces`, 'info');
        updateStatus('online', 'Republication en cours...');

        let completed = 0;
        for (const itemIndex of itemsToRepublish) {
            const item = foundItems[itemIndex];

            try {
                logMessage(`Republication de: ${item.title}`, 'info');

                // Envoyer les paramètres de modification d'images
                const imageSettings = {
                    cropPercentage: parseInt(document.getElementById('cropPercentage').value),
                    addWatermark: document.getElementById('addWatermark').checked,
                    watermarkText: document.getElementById('watermarkText').value,
                    rotationAngle: parseFloat(document.getElementById('rotationAngle').value),
                    qualityReduction: parseInt(document.getElementById('qualityReduction').value)
                };

                const response = await chrome.tabs.sendMessage(currentTab.id, {
                    action: 'republishItem',
                    item: item,
                    imageSettings: imageSettings
                });

                if (response && response.success) {
                    logMessage(`✓ ${item.title} republié avec succès`, 'success');
                } else {
                    throw new Error(response?.error || 'Erreur inconnue');
                }
            } catch (error) {
                logMessage(`✗ Erreur pour ${item.title}: ${error.message}`, 'error');
            }

            completed++;
            updateProgress(completed, itemsToRepublish.length);

            // Délai entre les republications (sauf pour le dernier)
            if (completed < itemsToRepublish.length) {
                const delay = parseInt(document.getElementById('delayBetweenItems').value) * 1000;
                logMessage(`Attente de ${delay / 1000} secondes...`, 'info');
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        logMessage(`Republication terminée: ${completed} annonces traitées`, 'success');
        updateStatus('online', 'Republication terminée');

    } catch (error) {
        logMessage(`Erreur générale: ${error.message}`, 'error');
        updateStatus('error', 'Erreur lors de la republication');
    } finally {
        isProcessing = false;
        showSpinner('republish', false);
        updateRepublishButton();
    }
}

// Afficher/masquer les spinners
function showSpinner(type, show) {
    const spinner = document.getElementById(`${type}Spinner`);
    const text = document.getElementById(`${type}Text`);

    if (spinner && text) {
        spinner.style.display = show ? 'block' : 'none';
        text.style.display = show ? 'none' : 'block';
    }
}

// Afficher la barre de progression
function showProgress() {
    progress.style.display = 'block';
    updateProgress(0, selectedItems.length);
}

// Mettre à jour la progression
function updateProgress(current, total) {
    const percentage = total > 0 ? (current / total) * 100 : 0;
    progressFill.style.width = `${percentage}%`;
    progressText.textContent = `${current} / ${total}`;
}

// Afficher les logs
function showLogs() {
    logs.style.display = 'block';
    logsContainer.innerHTML = '';
}

// Ajouter un message de log
function logMessage(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `
        <span class="log-timestamp">[${timestamp}]</span>
        <span class="log-message">${message}</span>
    `;

    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;

    console.log(`[Vinted Republisher] ${message}`);
}