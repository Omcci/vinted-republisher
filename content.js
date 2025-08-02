/**
 * Content Script pour Vinted Auto Republisher
 * S'injecte dans les pages Vinted pour interagir avec l'interface
 */

console.log('[Vinted Republisher] Démarrage du content script...');

// Créer un objet simple pour le test
window.vintedAutomator = {
    scanVintedItems: async () => {
        console.log('[Vinted Republisher] Scan des annonces...');

        const items = [];
        const selectors = [
            '[data-testid="user-item"]',
            '.feed-grid__item',
            '.item-box',
            '.c-item-box'
        ];

        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            console.log(`[Vinted Republisher] ${selector}: ${elements.length} éléments`);

            elements.forEach(element => {
                try {
                    const img = element.querySelector('img');
                    const title = element.querySelector('h3, h4, [data-testid="item-title"]');
                    const price = element.querySelector('[data-testid="item-price"], .price');

                    if (img && img.src) {
                        items.push({
                            title: title ? title.textContent.trim() : 'Article sans titre',
                            price: price ? price.textContent.trim() : 'Prix non trouvé',
                            image: img.src,
                            element: element
                        });
                    }
                } catch (error) {
                    console.warn('[Vinted Republisher] Erreur extraction item:', error);
                }
            });
        });

        console.log(`[Vinted Republisher] ${items.length} annonces trouvées`);
        return items;
    }
};

// Écouter les messages du popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Vinted Republisher] Message reçu:', request.action);

    if (request.action === 'scanItems') {
        window.vintedAutomator.scanVintedItems()
            .then(items => {
                console.log('[Vinted Republisher] Réponse scan:', items.length, 'items');
                sendResponse({ success: true, items });
            })
            .catch(error => {
                console.error('[Vinted Republisher] Erreur scan:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Indique que la réponse sera asynchrone
    }

    sendResponse({ success: false, error: 'Action non supportée' });
});

console.log('[Vinted Republisher] Content script initialisé et prêt');