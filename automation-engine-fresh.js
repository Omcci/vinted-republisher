/**
 * MOTEUR D'AUTOMATION FINAL - Scraping en arrière-plan
 * Traite les annonces sans redirection de page
 * 🔒 PROTECTION ANTI-SPAM ET ANTI-BAN
 */

// Configuration de sécurité
const SECURITY_CONFIG = {
    // Limitation de taux
    MAX_REQUESTS_PER_MINUTE: 3, // Maximum 3 requêtes par minute
    MAX_REQUESTS_PER_HOUR: 15,   // Maximum 15 requêtes par heure
    MAX_REQUESTS_PER_DAY: 50,    // Maximum 50 requêtes par jour

    // Délais entre les requêtes
    MIN_DELAY_BETWEEN_REQUESTS: 20000, // 20 secondes minimum entre chaque requête
    MAX_DELAY_BETWEEN_REQUESTS: 60000, // 60 secondes maximum (aléatoire)

    // Délais entre les items
    MIN_DELAY_BETWEEN_ITEMS: 30000,    // 30 secondes minimum entre les items
    MAX_DELAY_BETWEEN_ITEMS: 120000,   // 2 minutes maximum (aléatoire)

    // Cooldown après erreur
    COOLDOWN_AFTER_ERROR: 300000,      // 5 minutes de pause après une erreur

    // Limite de tentatives
    MAX_RETRY_ATTEMPTS: 2,             // Maximum 2 tentatives par item
};

// Tracker des requêtes pour éviter le spam
const requestTracker = {
    requests: [],
    lastRequestTime: 0,
    errorCount: 0,

    // Ajouter une requête au tracker
    addRequest() {
        const now = Date.now();
        this.requests.push(now);
        this.lastRequestTime = now;

        // Nettoyer les anciennes requêtes (garder seulement les dernières 24h)
        this.requests = this.requests.filter(time => now - time < 24 * 60 * 60 * 1000);
    },

    // Vérifier si on peut faire une requête
    canMakeRequest() {
        const now = Date.now();

        // Vérifier le délai minimum entre les requêtes
        if (now - this.lastRequestTime < SECURITY_CONFIG.MIN_DELAY_BETWEEN_REQUESTS) {
            return false;
        }

        // Vérifier les limites de taux
        const requestsLastMinute = this.requests.filter(time => now - time < 60 * 1000).length;
        const requestsLastHour = this.requests.filter(time => now - time < 60 * 60 * 1000).length;
        const requestsLastDay = this.requests.filter(time => now - time < 24 * 60 * 60 * 1000).length;

        if (requestsLastMinute >= SECURITY_CONFIG.MAX_REQUESTS_PER_MINUTE) {
            console.log('[Security] ⚠️ Limite par minute atteinte');
            return false;
        }

        if (requestsLastHour >= SECURITY_CONFIG.MAX_REQUESTS_PER_HOUR) {
            console.log('[Security] ⚠️ Limite par heure atteinte');
            return false;
        }

        if (requestsLastDay >= SECURITY_CONFIG.MAX_REQUESTS_PER_DAY) {
            console.log('[Security] ⚠️ Limite quotidienne atteinte');
            return false;
        }

        return true;
    },

    // Attendre le délai approprié
    async waitForNextRequest() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < SECURITY_CONFIG.MIN_DELAY_BETWEEN_REQUESTS) {
            const waitTime = SECURITY_CONFIG.MIN_DELAY_BETWEEN_REQUESTS - timeSinceLastRequest;
            console.log(`[Security] ⏳ Attente de ${waitTime / 1000}s avant la prochaine requête...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
            // Délai aléatoire pour éviter la détection
            const randomDelay = Math.random() * (SECURITY_CONFIG.MAX_DELAY_BETWEEN_REQUESTS - SECURITY_CONFIG.MIN_DELAY_BETWEEN_REQUESTS) + SECURITY_CONFIG.MIN_DELAY_BETWEEN_REQUESTS;
            console.log(`[Security] ⏳ Délai aléatoire de ${Math.round(randomDelay / 1000)}s...`);
            await new Promise(resolve => setTimeout(resolve, randomDelay));
        }
    },

    // Gérer une erreur
    handleError() {
        this.errorCount++;
        console.log(`[Security] ❌ Erreur détectée (${this.errorCount}/${SECURITY_CONFIG.MAX_RETRY_ATTEMPTS})`);

        if (this.errorCount >= SECURITY_CONFIG.MAX_RETRY_ATTEMPTS) {
            console.log('[Security] 🛑 Trop d\'erreurs, pause de sécurité activée');
            return false;
        }
        return true;
    },

    // Réinitialiser le compteur d'erreurs
    resetErrorCount() {
        this.errorCount = 0;
    }
};

console.log('[Automation Engine Fresh] 🚀 DÉMARRAGE DU MOTEUR FRESH');

try {
    // Test de base
    console.log('[Automation Engine Fresh] 📍 URL actuelle:', window.location.href);
    console.log('[Automation Engine Fresh] 🕐 Timestamp:', new Date().toISOString());

    // Marquer que le moteur est prêt
    window.VINTED_AUTOMATION_READY = true;
    console.log('[Automation Engine Fresh] ✅ MOTEUR PRÊT - window.VINTED_AUTOMATION_READY = true');

    // Fonction pour extraire les données d'une annonce via fetch
    async function scrapeItemData(itemId) {
        console.log('[Automation Engine Fresh] 🔍 Scraping des données pour item:', itemId);

        try {
            const url = `https://www.vinted.fr/items/${itemId}`;
            console.log('[Automation Engine Fresh] 📡 Fetch URL:', url);

            const response = await fetch(url);
            const html = await response.text();

            // Créer un DOM parser pour extraire les données
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // === DEBUG: Afficher la structure HTML pour analyse ===
            console.log('[Automation Engine Fresh] 🔍 DEBUG: Analyse de la structure HTML...');

            // Extraire les données de l'annonce avec des sélecteurs plus robustes
            const titleElement = doc.querySelector('h1.web_ui__Text__text.web_ui__Text__title.web_ui__Text__left, h1[data-testid="item-title"], h1');
            const title = titleElement ? titleElement.textContent?.trim() : `Article #${itemId}`;
            console.log('[Automation Engine Fresh] 🔍 DEBUG - Titre trouvé:', title);

            const priceElement = doc.querySelector('[data-testid="item-price"] p.web_ui__Text__text.web_ui__Text__subtitle.web_ui__Text__left, [data-testid="item-price"], .price');
            const priceRaw = priceElement ? priceElement.textContent?.trim() : 'N/A';
            const priceMatch = priceRaw.match(/(\d+[,\d]*)\s*€/);
            const price = priceMatch ? priceMatch[1].replace(',', '.') + ' €' : priceRaw;
            console.log('[Automation Engine Fresh] 🔍 DEBUG - Prix trouvé:', price);

            // Description avec sélecteurs multiples
            let description = '';
            const descriptionSelectors = [
                'div[itemprop="description"] span.web_ui__Text__text.web_ui__Text__body.web_ui__Text__left.web_ui__Text__format span',
                '[data-testid="item-description"]',
                '.item-description',
                'div[class*="description"]'
            ];

            for (const selector of descriptionSelectors) {
                const element = doc.querySelector(selector);
                if (element) {
                    description = element.textContent?.trim();
                    console.log('[Automation Engine Fresh] 🔍 DEBUG - Description trouvée avec:', selector, ':', description);
                    break;
                }
            }

            const images = Array.from(doc.querySelectorAll('img[data-testid*="item-photo"][src*="vinted.net"], img[src*="images"]'))
                .map(img => img.src)
                .filter(src => src && !src.includes('avatar') && !src.includes('icon'));
            console.log('[Automation Engine Fresh] 🔍 DEBUG - Images trouvées:', images.length);

            // === EXTRACTION ROBUSTE DES CARACTÉRISTIQUES ===
            // Chercher dans tous les éléments de détails
            const detailsElements = doc.querySelectorAll('.details-list__item, [class*="detail"], [class*="attribute"], [data-testid*="item-attributes"]');
            console.log('[Automation Engine Fresh] 🔍 DEBUG - Éléments de détails trouvés:', detailsElements.length);

            let brand = '';
            let size = '';
            let condition = 'good';
            let material = '';
            let color = '';
            let category = '';

            detailsElements.forEach(element => {
                const text = element.textContent?.trim() || '';
                const label = element.querySelector('.details-list__item-title, .label, [class*="title"]')?.textContent?.trim() || '';
                const value = element.querySelector('.details-list__item-value, .value, [class*="value"]')?.textContent?.trim() || text;

                const lowerLabel = (label || text).toLowerCase();
                const lowerValue = value.toLowerCase();

                console.log('[Automation Engine Fresh] 🔍 DEBUG - Élément:', { label, value, lowerLabel });

                if (lowerLabel.includes('marque') || lowerLabel.includes('brand')) {
                    brand = value;
                    console.log('[Automation Engine Fresh] 🔍 DEBUG - Marque trouvée:', brand);
                }
                else if (lowerLabel.includes('taille') || lowerLabel.includes('size')) {
                    size = value;
                    console.log('[Automation Engine Fresh] 🔍 DEBUG - Taille trouvée:', size);
                }
                else if (lowerLabel.includes('état') || lowerLabel.includes('condition') || lowerLabel.includes('status')) {
                    condition = value;
                    console.log('[Automation Engine Fresh] 🔍 DEBUG - État trouvé:', condition);
                }
                else if (lowerLabel.includes('couleur') || lowerLabel.includes('color')) {
                    color = value;
                    console.log('[Automation Engine Fresh] 🔍 DEBUG - Couleur trouvée:', color);
                }
                else if (lowerLabel.includes('matière') || lowerLabel.includes('material')) {
                    material = value;
                    console.log('[Automation Engine Fresh] 🔍 DEBUG - Matière trouvée:', material);
                }
                else if (lowerLabel.includes('catégorie') || lowerLabel.includes('category')) {
                    category = value;
                    console.log('[Automation Engine Fresh] 🔍 DEBUG - Catégorie trouvée:', category);
                }
            });

            // Si pas trouvé avec les détails, essayer les sélecteurs spécifiques
            if (!brand) {
                const brandElement = doc.querySelector('div.details-list__item-value span[itemprop="name"], [data-testid*="brand"]');
                brand = brandElement ? brandElement.textContent?.trim() : '';
                console.log('[Automation Engine Fresh] 🔍 DEBUG - Marque (sélecteur spécifique):', brand);
            }

            if (!size) {
                const sizeElement = doc.querySelector('[data-testid="item-attributes-size"] span.web_ui__Text__text.web_ui__Text__subtitle.web_ui__Text__left.web_ui__Text__bold, [data-testid*="size"]');
                size = sizeElement ? sizeElement.textContent?.trim() : '';
                console.log('[Automation Engine Fresh] 🔍 DEBUG - Taille (sélecteur spécifique):', size);
            }

            if (!condition || condition === 'good') {
                const conditionElement = doc.querySelector('[data-testid="item-attributes-status"] span.web_ui__Text__text.web_ui__Text__subtitle.web_ui__Text__left.web_ui__Text__bold, [data-testid*="status"]');
                condition = conditionElement ? conditionElement.textContent?.trim() : 'good';
                console.log('[Automation Engine Fresh] 🔍 DEBUG - État (sélecteur spécifique):', condition);
            }

            if (!material) {
                const materialElement = doc.querySelector('[data-testid="item-attributes-material"] span.web_ui__Text__text.web_ui__Text__subtitle.web_ui__Text__left.web_ui__Text__bold, [data-testid*="material"]');
                material = materialElement ? materialElement.textContent?.trim() : '';
                console.log('[Automation Engine Fresh] 🔍 DEBUG - Matière (sélecteur spécifique):', material);
            }

            if (!color) {
                const colorElement = doc.querySelector('[data-testid="item-attributes-color"] span.web_ui__Text__text.web_ui__Text__subtitle.web_ui__Text__left.web_ui__Text__bold, [data-testid*="color"]');
                color = colorElement ? colorElement.textContent?.trim() : '';
                console.log('[Automation Engine Fresh] 🔍 DEBUG - Couleur (sélecteur spécifique):', color);
            }

            // Location and shipping
            const locationElement = doc.querySelector('div.web_ui__Cell__body div.u-flexbox.u-align-items-baseline div, [data-testid*="location"]');
            const location = locationElement ? locationElement.textContent?.trim() : '';

            const shippingElement = doc.querySelector('[data-testid="item-shipping-banner-price"], [data-testid*="shipping"]');
            const shipping = shippingElement ? shippingElement.textContent?.trim() : '';

            const itemData = {
                id: itemId,
                title: title,
                price: price,
                description: description,
                images: images,
                url: url,
                brand: brand,
                size: size,
                color: color,
                condition: condition,
                material: material,
                category: category,
                location: location,
                shipping: shipping,
                scrapedAt: new Date().toISOString(),
                category_id: null,
                brand_id: null,
                size_id: null,
                color_id: null,
                country_id: 73, // France par défaut
                city_id: null,
                shipping_paid_by: 'buyer',
                is_for_swap: false,
                is_urgent: false
            };

            console.log('[Automation Engine Fresh] ✅ Données extraites:', itemData);
            console.log('[Automation Engine Fresh] 📋 Détails extraction:');
            console.log('- Titre:', itemData.title);
            console.log('- Prix:', itemData.price);
            console.log('- Description:', itemData.description);
            console.log('- Marque:', itemData.brand);
            console.log('- Taille:', itemData.size);
            console.log('- État:', itemData.condition);
            console.log('- Matière:', itemData.material);
            console.log('- Couleur:', itemData.color);
            console.log('- Catégorie:', itemData.category);
            console.log('- Localisation:', itemData.location);
            console.log('- Frais de port:', itemData.shipping);
            console.log('- Images:', itemData.images.length > 0 ? itemData.images[0] + '...' : 'No images');

            return itemData;

        } catch (error) {
            console.error('[Automation Engine Fresh] ❌ Erreur scraping item:', itemId, error);
            return null;
        }
    }

    // Fonction pour traiter une liste d'items
    async function processItemsList(items, settings) {
        console.log('[Automation Engine Fresh] 🎯 DÉMARRAGE TRAITEMENT MULTIPLE');
        console.log('[Automation Engine Fresh] 📊 Nombre d\'items à traiter:', items.length);

        const results = [];

        for (let i = 0; i < items.length; i++) {
            const itemId = items[i];
            console.log(`[Automation Engine Fresh] 📋 Traitement item ${i + 1}/${items.length}:`, itemId);

            // Vérifier les limites de sécurité avant chaque item
            if (!requestTracker.canMakeRequest()) {
                console.log('[Security] ⏳ Limite de taux atteinte, pause forcée...');
                await requestTracker.waitForNextRequest();
            }

            // Scraper les données
            const itemData = await scrapeItemData(itemId);

            if (itemData) {
                results.push(itemData);
                console.log(`[Automation Engine Fresh] ✅ Item ${i + 1} traité avec succès`);

                // Démarrer le processus de republication automatique
                console.log(`[Automation Engine Fresh] 🔄 Démarrage republication pour:`, itemData.title);

                try {
                    await startRepublishProcess(itemData, settings);
                    console.log(`[Automation Engine Fresh] ✅ Republication terminée pour:`, itemData.title);
                    requestTracker.resetErrorCount(); // Réinitialiser le compteur d'erreurs en cas de succès
                } catch (error) {
                    console.error(`[Automation Engine Fresh] ❌ Erreur republication pour:`, itemData.title, error);

                    // Gérer l'erreur avec le tracker de sécurité
                    if (!requestTracker.handleError()) {
                        console.log('[Security] 🛑 Trop d\'erreurs consécutives, arrêt du traitement');
                        break;
                    }
                }

                // Attendre le délai approprié entre les items
                if (i < items.length - 1) {
                    const randomDelay = Math.random() * (SECURITY_CONFIG.MAX_DELAY_BETWEEN_ITEMS - SECURITY_CONFIG.MIN_DELAY_BETWEEN_ITEMS) + SECURITY_CONFIG.MIN_DELAY_BETWEEN_ITEMS;
                    console.log(`[Security] ⏳ Pause de ${Math.round(randomDelay / 1000)}s entre les items...`);
                    await new Promise(resolve => setTimeout(resolve, randomDelay));
                }
            } else {
                console.log(`[Automation Engine Fresh] ❌ Échec traitement item ${i + 1}:`, itemId);
            }
        }

        console.log('[Automation Engine Fresh] 🎉 TRAITEMENT TERMINÉ');
        console.log('[Automation Engine Fresh] 📊 Résultats:', results);

        // Envoyer les résultats au background script
        window.postMessage({
            action: 'VINTED_AUTOMATION_RESULTS',
            results: results,
            settings: settings
        }, '*');

        return results;
    }

    // Fonction pour récupérer le CSRF token depuis la page de création (sans navigation)
    async function getCSRFTokenFromCreatePage() {
        console.log('[Automation Engine Fresh] 🔐 Récupération CSRF token depuis la page de création...');

        try {
            // Récupérer le HTML de la page de création sans navigation
            const response = await fetch('https://www.vinted.fr/items/new', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'User-Agent': navigator.userAgent
                }
            });

            if (!response.ok) {
                console.error('[Automation Engine Fresh] ❌ Erreur récupération page création:', response.status);
                return null;
            }

            const html = await response.text();
            console.log('[Automation Engine Fresh] ✅ HTML page création récupéré');

            // Parser le HTML pour extraire le CSRF token
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // ANALYSE COMPLÈTE DU HTML POUR TROUVER LE CSRF TOKEN
            console.log('[Automation Engine Fresh] 🔍 Analyse complète du HTML pour le CSRF token...');

            // 1. Chercher dans les meta tags
            const metaTags = doc.querySelectorAll('meta');
            console.log('[Automation Engine Fresh] 📋 Meta tags trouvés:', metaTags.length);

            for (const meta of metaTags) {
                const name = meta.getAttribute('name') || meta.getAttribute('property');
                const content = meta.getAttribute('content');
                if (name && content) {
                    console.log('[Automation Engine Fresh] 🔍 Meta:', name, ':', content.substring(0, 50) + '...');
                }
            }

            // 2. Chercher dans les inputs cachés
            const hiddenInputs = doc.querySelectorAll('input[type="hidden"]');
            console.log('[Automation Engine Fresh] 📋 Inputs cachés trouvés:', hiddenInputs.length);

            for (const input of hiddenInputs) {
                const name = input.getAttribute('name');
                const value = input.getAttribute('value');
                if (name && value) {
                    console.log('[Automation Engine Fresh] 🔍 Input caché:', name, ':', value.substring(0, 50) + '...');
                }
            }

            // 3. Chercher dans les scripts
            const scripts = doc.querySelectorAll('script');
            console.log('[Automation Engine Fresh] 📋 Scripts trouvés:', scripts.length);

            for (const script of scripts) {
                const content = script.textContent || script.innerHTML;
                if (content && (content.includes('csrf') || content.includes('token') || content.includes('authenticity'))) {
                    console.log('[Automation Engine Fresh] 🔍 Script avec token:', content.substring(0, 200) + '...');
                }
            }

            // 4. Chercher dans les données JSON
            const jsonScripts = doc.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]');
            console.log('[Automation Engine Fresh] 📋 Scripts JSON trouvés:', jsonScripts.length);

            for (const script of jsonScripts) {
                try {
                    const data = JSON.parse(script.textContent);
                    console.log('[Automation Engine Fresh] 🔍 Données JSON:', JSON.stringify(data).substring(0, 200) + '...');
                } catch (e) {
                    // Ignorer les erreurs de parsing
                }
            }

            // 5. Chercher dans les attributs data-*
            const dataElements = doc.querySelectorAll('[data-csrf], [data-token], [data-authenticity]');
            console.log('[Automation Engine Fresh] 📋 Éléments data-* trouvés:', dataElements.length);

            for (const element of dataElements) {
                const attrs = element.attributes;
                for (const attr of attrs) {
                    if (attr.name.startsWith('data-') && attr.value) {
                        console.log('[Automation Engine Fresh] 🔍 Data attr:', attr.name, ':', attr.value.substring(0, 50) + '...');
                    }
                }
            }

            // ESSAIER DIFFÉRENTES STRATÉGIES POUR TROUVER LE CSRF TOKEN
            let csrfToken = null;

            // Stratégie 1: Meta tags classiques
            csrfToken = doc.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
                doc.querySelector('meta[name="csrf-token"]')?.getAttribute('value') ||
                doc.querySelector('meta[name="authenticity-token"]')?.getAttribute('content') ||
                doc.querySelector('meta[name="csrf"]')?.getAttribute('content');

            // Stratégie 2: Inputs cachés
            if (!csrfToken) {
                csrfToken = doc.querySelector('input[name="_token"]')?.value ||
                    doc.querySelector('input[name="csrf_token"]')?.value ||
                    doc.querySelector('input[name="authenticity_token"]')?.value ||
                    doc.querySelector('input[name="csrf-token"]')?.value;
            }

            // Stratégie 3: Attributs data
            if (!csrfToken) {
                csrfToken = doc.querySelector('[data-csrf-token]')?.getAttribute('data-csrf-token') ||
                    doc.querySelector('[data-token]')?.getAttribute('data-token') ||
                    doc.querySelector('[data-authenticity-token]')?.getAttribute('data-authenticity-token');
            }

            // Stratégie 4: Chercher dans le contenu des scripts
            if (!csrfToken) {
                for (const script of scripts) {
                    const content = script.textContent || script.innerHTML;
                    if (content) {
                        // Chercher des patterns comme "csrf_token": "..." ou "token": "..."
                        const csrfMatch = content.match(/"csrf_token"\s*:\s*"([^"]+)"/) ||
                            content.match(/"token"\s*:\s*"([^"]+)"/) ||
                            content.match(/"authenticity_token"\s*:\s*"([^"]+)"/) ||
                            content.match(/csrf_token\s*=\s*['"]([^'"]+)['"]/) ||
                            content.match(/token\s*=\s*['"]([^'"]+)['"]/);

                        if (csrfMatch && csrfMatch[1]) {
                            csrfToken = csrfMatch[1];
                            console.log('[Automation Engine Fresh] ✅ CSRF token trouvé dans script:', csrfToken.substring(0, 20) + '...');
                            break;
                        }
                    }
                }
            }

            if (csrfToken) {
                console.log('[Automation Engine Fresh] ✅ CSRF Token récupéré:', csrfToken.substring(0, 20) + '...');
                return csrfToken;
            } else {
                console.log('[Automation Engine Fresh] ⚠️ Aucun CSRF token trouvé dans la page de création');
                return null;
            }

        } catch (error) {
            console.error('[Automation Engine Fresh] ❌ Erreur récupération CSRF token:', error);
            return null;
        }
    }

    // Fonction pour démarrer le processus de republication
    async function startRepublishProcess(itemData, settings) {
        console.log('[Automation Engine Fresh] 🚀 DÉMARRAGE PROCESSUS REPUBLICATION');
        console.log('[Automation Engine Fresh] 📋 Item à republier:', itemData.title);

        try {
            // ÉTAPE 1: Obtenir la configuration Vinted
            console.log('[Automation Engine Fresh] ⚙️ ÉTAPE 1: Récupération configuration Vinted...');
            const config = await getVintedConfiguration();
            if (!config) {
                throw new Error('Impossible de récupérer la configuration Vinted');
            }

            // ÉTAPE 2: Enrichir les données avec les IDs
            console.log('[Automation Engine Fresh] 🔧 ÉTAPE 2: Enrichissement des données...');
            enrichItemDataWithIds(itemData, config);

            // ÉTAPE 3: Créer le brouillon avec les headers de la vraie requête qui fonctionne
            console.log('[Automation Engine Fresh] 🎯 ÉTAPE 3: Création du brouillon avec les headers de la vraie requête qui fonctionne...');
            const draftResult = await createDraftWithWorkingHeaders(itemData, config, settings);
            if (!draftResult.success) {
                throw new Error('Échec de la création du brouillon');
            }

            console.log('[Automation Engine Fresh] ✅ PROCESSUS REPUBLICATION TERMINÉ - Aucune navigation !');
            return {
                status: 'SUCCESS',
                message: 'Brouillon créé avec succès',
                draftId: draftResult.draftId,
                tempUuid: draftResult.tempUuid,
                endpoint: draftResult.endpoint
            };

        } catch (error) {
            console.error('[Automation Engine Fresh] ❌ Erreur processus republication:', error);
            throw error;
        }
    }

    // Fonction pour récupérer la configuration Vinted
    async function getVintedConfiguration(csrfToken) {
        console.log('[Automation Engine Fresh] ⚙️ Récupération configuration Vinted...');

        try {
            // Headers d'authentification communs
            const headers = {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://www.vinted.fr',
                'Referer': 'https://www.vinted.fr/'
            };

            // Ajouter le CSRF token s'il existe
            if (csrfToken) {
                headers['X-CSRF-Token'] = csrfToken;
            }

            // Ajouter les cookies de session
            const cookies = document.cookie;
            if (cookies) {
                headers['Cookie'] = cookies;
            }

            // Ajouter le token d'authentification
            const authToken = document.querySelector('meta[name="auth-token"]')?.getAttribute('content');
            if (authToken) {
                headers['Authorization'] = `Bearer ${authToken}`;
            }

            // Ajouter le token de session
            const sessionToken = document.querySelector('meta[name="session-token"]')?.getAttribute('content');
            if (sessionToken) {
                headers['X-Session-Token'] = sessionToken;
            }

            console.log('[Automation Engine Fresh] 🔐 Headers d\'authentification:', headers);

            // Récupérer la configuration générale
            const configResponse = await fetch('https://www.vinted.fr/api/v2/items/configuration', {
                method: 'GET',
                headers: headers,
                credentials: 'include'
            });

            if (!configResponse.ok) {
                throw new Error(`Erreur configuration: ${configResponse.status}`);
            }

            const config = await configResponse.json();
            console.log('[Automation Engine Fresh] ✅ Configuration récupérée:', config);

            // Récupérer les marques
            const brandsResponse = await fetch('https://www.vinted.fr/api/v2/brands', {
                method: 'GET',
                headers: headers,
                credentials: 'include'
            });

            if (brandsResponse.ok) {
                const brands = await brandsResponse.json();
                config.brands = brands.brands || [];
                console.log('[Automation Engine Fresh] ✅ Marques récupérées:', config.brands.length);
            }

            // Récupérer les tailles
            const sizesResponse = await fetch('https://www.vinted.fr/api/v2/sizes', {
                method: 'GET',
                headers: headers,
                credentials: 'include'
            });

            if (sizesResponse.ok) {
                const sizes = await sizesResponse.json();
                config.sizes = sizes.sizes || [];
                console.log('[Automation Engine Fresh] ✅ Tailles récupérées:', config.sizes.length);
            }

            // Récupérer les couleurs
            const colorsResponse = await fetch('https://www.vinted.fr/api/v2/colors', {
                method: 'GET',
                headers: headers,
                credentials: 'include'
            });

            if (colorsResponse.ok) {
                const colors = await colorsResponse.json();
                config.colors = colors.colors || [];
                console.log('[Automation Engine Fresh] ✅ Couleurs récupérées:', config.colors.length);
            }

            // Récupérer les catégories
            const catalogsResponse = await fetch('https://www.vinted.fr/api/v2/catalogs', {
                method: 'GET',
                headers: headers,
                credentials: 'include'
            });

            if (catalogsResponse.ok) {
                const catalogs = await catalogsResponse.json();
                config.catalogs = catalogs.catalogs || [];
                console.log('[Automation Engine Fresh] ✅ Catégories récupérées:', config.catalogs.length);
            }

            // Récupérer les matériaux
            const materialsResponse = await fetch('https://www.vinted.fr/api/v2/materials', {
                method: 'GET',
                headers: headers,
                credentials: 'include'
            });

            if (materialsResponse.ok) {
                const materials = await materialsResponse.json();
                config.materials = materials.materials || [];
                console.log('[Automation Engine Fresh] ✅ Matériaux récupérées:', config.materials.length);
            }

            return config;

        } catch (error) {
            console.error('[Automation Engine Fresh] ❌ Erreur configuration:', error);
            return null;
        }
    }

    // Fonction pour créer un brouillon via l'API Vinted
    async function createDraftViaVintedAPI(itemData, config, settings, csrfToken) {
        console.log('[Automation Engine Fresh] 📝 Création brouillon via API Vinted...');

        // Vérifier les limites de sécurité
        if (!requestTracker.canMakeRequest()) {
            console.log('[Security] ⏳ Attente avant création du brouillon...');
            await requestTracker.waitForNextRequest();
        }

        try {
            // Marquer la requête
            requestTracker.addRequest();

            // Générer un UUID temporaire
            const tempUuid = generateUUID();

            // Préparer le payload selon l'API Vinted
            const payload = {
                draft: {
                    id: null,
                    currency: "EUR",
                    temp_uuid: tempUuid,
                    title: settings.safeMode ? modifyTitleForSafety(itemData.title) : itemData.title,
                    description: itemData.description || '',
                    price: settings.safeMode ? modifyPriceForSafety(extractPrice(itemData.price)) : extractPrice(itemData.price),

                    // Catégorisation (valeurs par défaut si non trouvées)
                    brand_id: itemData.brand_id || 60, // Kiabi par défaut
                    catalog_id: itemData.catalog_id || 1773, // Vêtements par défaut
                    size_id: itemData.size_id || 1226, // Taille unique par défaut
                    color_ids: itemData.color_ids || [1], // Noir par défaut

                    // Attributs
                    item_attributes: itemData.material_id ? [{ "code": "material", "ids": [itemData.material_id] }] : [],

                    // Paramètres par défaut
                    package_size_id: 1,
                    status_id: 6, // État "Bon état" par défaut
                    is_unisex: false
                },
                upload_session_id: tempUuid
            };

            console.log('[Automation Engine Fresh] 📤 Payload envoyé:', payload);

            // Récupérer les headers d'authentification complets
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://www.vinted.fr',
                'Referer': 'https://www.vinted.fr/',
                'User-Agent': navigator.userAgent,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            };

            // Ajouter le CSRF token s'il existe
            if (csrfToken) {
                headers['X-CSRF-Token'] = csrfToken;
                console.log('[Automation Engine Fresh] 🔐 CSRF Token ajouté');
            }

            // Ajouter les cookies de session
            const cookies = document.cookie;
            if (cookies) {
                headers['Cookie'] = cookies;
                console.log('[Automation Engine Fresh] 🍪 Cookies ajoutés');
            }

            // Ajouter le token d'authentification
            const authToken = document.querySelector('meta[name="auth-token"]')?.getAttribute('content') ||
                document.querySelector('meta[name="auth-token"]')?.content;
            if (authToken) {
                headers['Authorization'] = `Bearer ${authToken}`;
                console.log('[Automation Engine Fresh] 🔑 Token d\'authentification ajouté');
            }

            // Ajouter le token de session
            const sessionToken = document.querySelector('meta[name="session-token"]')?.getAttribute('content') ||
                document.querySelector('meta[name="session-token"]')?.content;
            if (sessionToken) {
                headers['X-Session-Token'] = sessionToken;
                console.log('[Automation Engine Fresh] 🎫 Token de session ajouté');
            }

            // Essayer de récupérer d'autres tokens potentiels
            const allMetaTags = document.querySelectorAll('meta');
            for (const meta of allMetaTags) {
                const name = meta.getAttribute('name') || meta.getAttribute('property');
                const content = meta.getAttribute('content');
                if (name && content && (name.includes('token') || name.includes('auth') || name.includes('csrf'))) {
                    console.log('[Automation Engine Fresh] 🔍 Token trouvé:', name, ':', content.substring(0, 20) + '...');
                }
            }

            console.log('[Automation Engine Fresh] 🔐 Headers d\'authentification:', headers);

            // Appeler l'API Vinted
            const response = await fetch('https://www.vinted.fr/api/v2/item_upload/drafts', {
                method: 'POST',
                headers: headers,
                credentials: 'include', // Inclure les cookies automatiquement
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[Automation Engine Fresh] ❌ Réponse API:', response.status, errorText);

                // Analyser l'erreur pour comprendre le problème
                if (response.status === 403) {
                    console.error('[Automation Engine Fresh] 🔍 Analyse erreur 403:');
                    console.error('- Headers de réponse:', Object.fromEntries(response.headers.entries()));
                    console.error('- URL actuelle:', window.location.href);
                    console.error('- Cookies présents:', !!document.cookie);
                    console.error('- CSRF Token présent:', !!csrfToken);
                }

                throw new Error(`Erreur API: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('[Automation Engine Fresh] ✅ Brouillon créé:', result);

            return {
                success: true,
                draftId: result.draft?.id,
                tempUuid: tempUuid,
                result: result
            };

        } catch (error) {
            console.error('[Automation Engine Fresh] ❌ Erreur création brouillon:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Fonction pour enrichir itemData avec les bons IDs à partir de la config Vinted
    function enrichItemDataWithIds(itemData, config) {
        console.log('[Automation Engine Fresh] 🔧 Enrichissement des données avec les IDs...');

        // --- MARQUE ---
        console.log('[Automation Engine Fresh] 🔍 Recherche marque:', itemData.brand);
        if (itemData.brand && config.brands && config.brands.length > 0) {
            // Nettoyer la marque (enlever les espaces en trop)
            const cleanBrand = itemData.brand.trim();

            // Recherche exacte d'abord
            let found = config.brands.find(b =>
                b.name && b.name.toLowerCase() === cleanBrand.toLowerCase() ||
                b.title && b.title.toLowerCase() === cleanBrand.toLowerCase()
            );

            // Si pas trouvé, recherche partielle
            if (!found) {
                found = config.brands.find(b =>
                    b.name && b.name.toLowerCase().includes(cleanBrand.toLowerCase()) ||
                    b.title && b.title.toLowerCase().includes(cleanBrand.toLowerCase())
                );
            }

            // Si toujours pas trouvé, chercher dans les suggestions (mots-clés)
            if (!found) {
                found = config.brands.find(b =>
                    b.name && cleanBrand.toLowerCase().includes(b.name.toLowerCase()) ||
                    b.title && cleanBrand.toLowerCase().includes(b.title.toLowerCase())
                );
            }

            if (found) {
                itemData.brand_id = found.id;
                console.log('[Automation Engine Fresh] ✅ Marque trouvée:', found.name || found.title, 'ID:', found.id);
            } else {
                console.log('[Automation Engine Fresh] ⚠️ Marque non trouvée:', cleanBrand);
                console.log('[Automation Engine Fresh] 📋 Marques disponibles:', config.brands.slice(0, 20).map(b => b.name || b.title));

                // Pour les marques non trouvées, essayer de créer une entrée personnalisée
                // ou utiliser une marque similaire
                if (cleanBrand.toLowerCase() === 'miffy') {
                    // Miffy est une marque de peluches, utiliser une marque de jouets
                    const jouetBrand = config.brands.find(b =>
                        b.name && (b.name.toLowerCase().includes('pokémon') || b.name.toLowerCase().includes('orchestra'))
                    );
                    if (jouetBrand) {
                        itemData.brand_id = jouetBrand.id;
                        console.log('[Automation Engine Fresh] ✅ Marque alternative trouvée pour Miffy:', jouetBrand.name, 'ID:', jouetBrand.id);
                    } else {
                        itemData.brand_id = null;
                        console.log('[Automation Engine Fresh] ⚠️ Aucune marque alternative trouvée pour Miffy');
                    }
                } else {
                    itemData.brand_id = null;
                    console.log('[Automation Engine Fresh] ⚠️ Marque non reconnue:', cleanBrand);
                }
            }
        } else {
            console.log('[Automation Engine Fresh] ⚠️ Pas de marque ou pas de config');
            itemData.brand_id = null;
        }

        // --- TAILLE ---
        console.log('[Automation Engine Fresh] 🔍 Recherche taille:', itemData.size);
        if (itemData.size && config.sizes && config.sizes.length > 0) {
            const found = config.sizes.find(s =>
                s.title && s.title.toLowerCase().includes(itemData.size.toLowerCase()) ||
                s.name && s.name.toLowerCase().includes(itemData.size.toLowerCase())
            );
            if (found) {
                itemData.size_id = found.id;
                console.log('[Automation Engine Fresh] ✅ Taille trouvée:', found.title || found.name, 'ID:', found.id);
            } else {
                console.log('[Automation Engine Fresh] ⚠️ Taille non trouvée:', itemData.size);
                console.log('[Automation Engine Fresh] 📋 Tailles disponibles:', config.sizes.slice(0, 5).map(s => s.title || s.name));
                itemData.size_id = null; // Pas de taille par défaut
            }
        } else {
            console.log('[Automation Engine Fresh] ⚠️ Pas de taille ou pas de config');
            itemData.size_id = null;
        }

        // --- ÉTAT ---
        console.log('[Automation Engine Fresh] 🔍 État extrait:', itemData.condition);
        // Mapper l'état vers les IDs Vinted
        if (itemData.condition) {
            const conditionLower = itemData.condition.toLowerCase();
            if (conditionLower.includes('neuf') || conditionLower.includes('étiquette')) {
                itemData.status_id = 6; // Neuf avec étiquette
                console.log('[Automation Engine Fresh] ✅ État mappé: Neuf avec étiquette (ID: 6)');
            } else if (conditionLower.includes('très bon')) {
                itemData.status_id = 5; // Très bon état
                console.log('[Automation Engine Fresh] ✅ État mappé: Très bon état (ID: 5)');
            } else if (conditionLower.includes('bon')) {
                itemData.status_id = 4; // Bon état
                console.log('[Automation Engine Fresh] ✅ État mappé: Bon état (ID: 4)');
            } else {
                itemData.status_id = 6; // Par défaut: Neuf avec étiquette
                console.log('[Automation Engine Fresh] ✅ État par défaut: Neuf avec étiquette (ID: 6)');
            }
        } else {
            itemData.status_id = 6; // Par défaut
            console.log('[Automation Engine Fresh] ✅ État par défaut: Neuf avec étiquette (ID: 6)');
        }

        // --- COULEUR ---
        if (itemData.color && config.colors && config.colors.length > 0) {
            // Peut être plusieurs couleurs séparées par virgule
            const colorNames = itemData.color.split(',').map(c => c.trim().toLowerCase());
            const foundColors = config.colors.filter(col =>
                col.title && colorNames.some(name => col.title.toLowerCase().includes(name)) ||
                col.name && colorNames.some(name => col.name.toLowerCase().includes(name))
            );
            if (foundColors.length > 0) {
                itemData.color_ids = foundColors.map(col => col.id);
                console.log('[Automation Engine Fresh] ✅ Couleurs trouvées:', foundColors.map(c => c.title || c.name), 'IDs:', itemData.color_ids);
            } else {
                console.log('[Automation Engine Fresh] ⚠️ Couleurs non trouvées:', itemData.color);
                itemData.color_ids = [1]; // Noir par défaut
            }
        } else {
            itemData.color_ids = [1]; // Noir par défaut
        }

        // --- MATIÈRE ---
        console.log('[Automation Engine Fresh] 🔍 Matière extraite:', itemData.material);
        if (itemData.material) {
            const materialLower = itemData.material.toLowerCase();
            // Mapper les matières vers les IDs Vinted (approximatif)
            if (materialLower.includes('coton')) {
                itemData.material_id = 468; // Coton
                console.log('[Automation Engine Fresh] ✅ Matière mappée: Coton (ID: 468)');
            } else if (materialLower.includes('polyester')) {
                itemData.material_id = 469; // Polyester
                console.log('[Automation Engine Fresh] ✅ Matière mappée: Polyester (ID: 469)');
            } else if (materialLower.includes('laine')) {
                itemData.material_id = 470; // Laine
                console.log('[Automation Engine Fresh] ✅ Matière mappée: Laine (ID: 470)');
            } else {
                itemData.material_id = 468; // Par défaut: Coton
                console.log('[Automation Engine Fresh] ✅ Matière par défaut: Coton (ID: 468)');
            }
        } else {
            itemData.material_id = 468; // Par défaut
            console.log('[Automation Engine Fresh] ✅ Matière par défaut: Coton (ID: 468)');
        }

        // --- CATÉGORIE ---
        // Pour les peluches, on va chercher dans les catégories enfants
        console.log('[Automation Engine Fresh] 🔍 Recherche catégorie pour peluche...');
        if (config.catalogs && config.catalogs.length > 0) {
            // Chercher d'abord "Peluches" ou "Jeux et jouets" ou "Enfants"
            const found = config.catalogs.find(cat =>
                cat.title && (cat.title.toLowerCase().includes('peluche') ||
                    cat.title.toLowerCase().includes('jouet') ||
                    cat.title.toLowerCase().includes('jeu') ||
                    cat.title.toLowerCase().includes('enfant'))
            );
            if (found) {
                itemData.catalog_id = found.id;
                console.log('[Automation Engine Fresh] ✅ Catégorie trouvée:', found.title, 'ID:', found.id);
            } else {
                console.log('[Automation Engine Fresh] ⚠️ Catégorie peluche non trouvée, utilisation Enfants par défaut');
                // Utiliser "Enfants" comme fallback pour les peluches
                const enfantsCategory = config.catalogs.find(cat => cat.title && cat.title.toLowerCase().includes('enfant'));
                if (enfantsCategory) {
                    itemData.catalog_id = enfantsCategory.id;
                    console.log('[Automation Engine Fresh] ✅ Catégorie fallback trouvée:', enfantsCategory.title, 'ID:', enfantsCategory.id);
                } else {
                    console.log('[Automation Engine Fresh] 📋 Catégories disponibles:', config.catalogs.slice(0, 10).map(c => c.title));
                    itemData.catalog_id = null;
                }
            }
        } else {
            console.log('[Automation Engine Fresh] ⚠️ Pas de config de catégories');
            itemData.catalog_id = null;
        }

        // --- MATIÈRE ---
        if (itemData.material && config.materials && config.materials.length > 0) {
            const found = config.materials.find(mat =>
                mat.title && mat.title.toLowerCase().includes(itemData.material.toLowerCase()) ||
                mat.name && mat.name.toLowerCase().includes(itemData.material.toLowerCase())
            );
            if (found) {
                itemData.material_id = found.id;
                console.log('[Automation Engine Fresh] ✅ Matériau trouvé:', found.title || found.name, 'ID:', found.id);
            } else {
                console.log('[Automation Engine Fresh] ⚠️ Matériau non trouvé:', itemData.material);
                itemData.material_id = 468; // Coton par défaut
            }
        } else {
            itemData.material_id = 468; // Coton par défaut
        }

        console.log('[Automation Engine Fresh] ✅ Données enrichies avec les IDs');
        return itemData;
    }

    // Fonction pour générer un UUID
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // FONCTIONS DÉSACTIVÉES - API Vinted non accessible publiquement
    // Ces fonctions ont été remplacées par l'approche de navigation + remplissage de formulaire

    // async function createDraftViaAPI(itemData, settings) {
    //     // DÉSACTIVÉE - API non disponible
    // }

    // async function fillDraftWithData(draftData, itemData, settings) {
    //     // DÉSACTIVÉE - Remplacée par fillCreateForm
    // }

    // async function saveDraftViaAPI(draftData) {
    //     // DÉSACTIVÉE - Remplacée par saveDraft
    // }

    // FONCTIONS DE NAVIGATION DÉSACTIVÉES - Remplacées par l'API directe
    // async function waitForPageLoad() { /* DÉSACTIVÉE */ }
    // async function getSessionTokens() { /* DÉSACTIVÉE */ }
    // async function fillCreateForm(itemData, settings) { /* DÉSACTIVÉE */ }
    // async function saveDraft() { /* DÉSACTIVÉE */ }
    // async function humanType(element, text) { /* DÉSACTIVÉE */ }
    // async function humanClick(element) { /* DÉSACTIVÉE */ }

    // Fonction utilitaire pour extraire le prix
    function extractPrice(priceString) {
        if (!priceString) return 0;

        // Extraire le premier prix numérique
        const match = priceString.match(/(\d+(?:,\d+)?)/);
        if (match) {
            return parseFloat(match[1].replace(',', '.'));
        }
        return 0;
    }

    // Fonction pour modifier le titre pour éviter la détection
    function modifyTitleForSafety(title) {
        if (!title) return title;

        // Ajouter un petit suffixe aléatoire
        const suffixes = ['', ' - V', ' - V2', ' - Repost', ' - Relist'];
        const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];

        return title + randomSuffix;
    }

    // Fonction pour modifier le prix pour éviter la détection
    function modifyPriceForSafety(price) {
        if (!price || price <= 0) return price;

        // Modifier légèrement le prix (±5%)
        const variation = (Math.random() - 0.5) * 0.1; // ±5%
        const newPrice = price * (1 + variation);

        // Arrondir à 2 décimales
        return Math.round(newPrice * 100) / 100;
    }

    // Fonction pour analyser les requêtes réseau réelles de Vinted
    async function analyzeVintedNetworkRequests() {
        console.log('[Automation Engine Fresh] 🔍 Analyse des requêtes réseau Vinted...');

        try {
            // Récupérer le HTML de la page de création pour voir les vraies requêtes
            const response = await fetch('https://www.vinted.fr/items/new', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'User-Agent': navigator.userAgent,
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-User': '?1'
                }
            });

            if (!response.ok) {
                console.error('[Automation Engine Fresh] ❌ Erreur récupération page création:', response.status);
                return null;
            }

            const html = await response.text();
            console.log('[Automation Engine Fresh] ✅ HTML page création récupéré pour analyse réseau');

            // Analyser les headers de réponse pour comprendre l'authentification
            console.log('[Automation Engine Fresh] 🔍 Headers de réponse de la page création:');
            for (const [key, value] of response.headers.entries()) {
                console.log(`  ${key}: ${value}`);
            }

            // Essayer de récupérer des tokens depuis les cookies de session
            const cookies = document.cookie;
            console.log('[Automation Engine Fresh] 🍪 Cookies de session actuels:', cookies);

            // Chercher des tokens dans les cookies
            const cookieTokens = {};
            cookies.split(';').forEach(cookie => {
                const [name, value] = cookie.trim().split('=');
                if (name && value && (name.includes('token') || name.includes('auth') || name.includes('session'))) {
                    cookieTokens[name] = value;
                    console.log('[Automation Engine Fresh] 🔍 Token dans cookie:', name, ':', value.substring(0, 20) + '...');
                }
            });

            return {
                cookies: cookies,
                cookieTokens: cookieTokens,
                responseHeaders: Object.fromEntries(response.headers.entries())
            };

        } catch (error) {
            console.error('[Automation Engine Fresh] ❌ Erreur analyse réseau:', error);
            return null;
        }
    }

    // Fonction pour créer un brouillon avec authentification avancée
    async function createDraftWithAdvancedAuth(itemData, config, settings) {
        console.log('[Automation Engine Fresh] 🔐 Création brouillon avec authentification avancée...');

        try {
            // Analyser les requêtes réseau réelles
            const networkAnalysis = await analyzeVintedNetworkRequests();
            if (!networkAnalysis) {
                throw new Error('Impossible d\'analyser les requêtes réseau');
            }

            // Générer un UUID temporaire
            const tempUuid = generateUUID();

            // Préparer le payload
            const payload = {
                draft: {
                    id: null,
                    currency: "EUR",
                    temp_uuid: tempUuid,
                    title: settings.safeMode ? modifyTitleForSafety(itemData.title) : itemData.title,
                    description: itemData.description || '',
                    price: settings.safeMode ? modifyPriceForSafety(extractPrice(itemData.price)) : extractPrice(itemData.price),
                    brand_id: itemData.brand_id || 60,
                    catalog_id: itemData.catalog_id || 1773,
                    size_id: itemData.size_id || 1226,
                    color_ids: itemData.color_ids || [1],
                    item_attributes: itemData.material_id ? [{ "code": "material", "ids": [itemData.material_id] }] : [],
                    package_size_id: 1,
                    status_id: 6,
                    is_unisex: false
                },
                upload_session_id: tempUuid
            };

            console.log('[Automation Engine Fresh] 📤 Payload envoyé:', payload);

            // Headers d'authentification avancés basés sur l'analyse réseau
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://www.vinted.fr',
                'Referer': 'https://www.vinted.fr/items/new',
                'User-Agent': navigator.userAgent,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            };

            // Ajouter tous les cookies de session
            if (networkAnalysis.cookies) {
                headers['Cookie'] = networkAnalysis.cookies;
                console.log('[Automation Engine Fresh] 🍪 Cookies ajoutés depuis l\'analyse réseau');
            }

            // Ajouter des tokens spécifiques trouvés dans les cookies
            if (networkAnalysis.cookieTokens) {
                Object.entries(networkAnalysis.cookieTokens).forEach(([name, value]) => {
                    if (name.includes('session') || name.includes('auth')) {
                        headers[`X-${name.charAt(0).toUpperCase() + name.slice(1)}`] = value;
                        console.log('[Automation Engine Fresh] 🔑 Token ajouté:', name, ':', value.substring(0, 20) + '...');
                    }
                });
            }

            console.log('[Automation Engine Fresh] 🔐 Headers d\'authentification avancés:', headers);

            // Appeler l'API avec l'authentification avancée
            const response = await fetch('https://www.vinted.fr/api/v2/item_upload/drafts', {
                method: 'POST',
                headers: headers,
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[Automation Engine Fresh] ❌ Réponse API:', response.status, errorText);

                // Analyse détaillée de l'erreur
                console.error('[Automation Engine Fresh] 🔍 Analyse erreur avancée:');
                console.error('- Status:', response.status);
                console.error('- Status Text:', response.statusText);
                console.error('- Headers de réponse:', Object.fromEntries(response.headers.entries()));
                console.error('- URL appelée:', 'https://www.vinted.fr/api/v2/item_upload/drafts');
                console.error('- Méthode:', 'POST');
                console.error('- Payload envoyé:', JSON.stringify(payload, null, 2));

                throw new Error(`Erreur API: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('[Automation Engine Fresh] ✅ Brouillon créé avec authentification avancée:', result);

            return {
                success: true,
                draftId: result.draft?.id,
                tempUuid: tempUuid,
                result: result
            };

        } catch (error) {
            console.error('[Automation Engine Fresh] ❌ Erreur création brouillon avancée:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Fonction pour tester différents endpoints d'API Vinted
    async function testVintedAPIEndpoints() {
        console.log('[Automation Engine Fresh] 🔍 Test des endpoints d\'API Vinted...');

        const endpoints = [
            '/api/v2/catalog/items/draft',
            '/api/v2/items/draft',
            '/api/v2/drafts',
            '/api/v2/item_upload/drafts',
            '/api/v2/items/create',
            '/api/v2/catalog/items/create',
            '/api/v2/upload/drafts',
            '/api/v2/items/upload/drafts'
        ];

        const results = {};

        for (const endpoint of endpoints) {
            try {
                console.log(`[Automation Engine Fresh] 🔍 Test endpoint: ${endpoint}`);

                const response = await fetch(`https://www.vinted.fr${endpoint}`, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Origin': 'https://www.vinted.fr',
                        'Referer': 'https://www.vinted.fr/items/new'
                    }
                });

                results[endpoint] = {
                    status: response.status,
                    statusText: response.statusText,
                    exists: response.status !== 404 && response.status !== 520
                };

                console.log(`[Automation Engine Fresh] ✅ ${endpoint}: ${response.status} ${response.statusText}`);

            } catch (error) {
                results[endpoint] = {
                    status: 'ERROR',
                    statusText: error.message,
                    exists: false
                };
                console.log(`[Automation Engine Fresh] ❌ ${endpoint}: ${error.message}`);
            }
        }

        console.log('[Automation Engine Fresh] 📊 Résultats des tests d\'endpoints:', results);
        return results;
    }

    // Fonction pour créer un brouillon avec l'endpoint correct
    async function createDraftWithCorrectEndpoint(itemData, config, settings) {
        console.log('[Automation Engine Fresh] 🔍 Recherche du bon endpoint pour créer un brouillon...');

        try {
            // Tester tous les endpoints possibles
            const endpointResults = await testVintedAPIEndpoints();

            // Trouver le premier endpoint qui existe
            const workingEndpoint = Object.entries(endpointResults).find(([endpoint, result]) => result.exists);

            if (!workingEndpoint) {
                throw new Error('Aucun endpoint d\'API Vinted trouvé pour créer des brouillons');
            }

            const [endpoint, endpointResult] = workingEndpoint;
            console.log(`[Automation Engine Fresh] ✅ Endpoint trouvé: ${endpoint} (${endpointResult.status})`);

            // Générer un UUID temporaire
            const tempUuid = generateUUID();

            // Préparer le payload selon l'endpoint
            const payload = {
                draft: {
                    id: null,
                    currency: "EUR",
                    temp_uuid: tempUuid,
                    title: settings.safeMode ? modifyTitleForSafety(itemData.title) : itemData.title,
                    description: itemData.description || '',
                    price: settings.safeMode ? modifyPriceForSafety(extractPrice(itemData.price)) : extractPrice(itemData.price),
                    brand_id: itemData.brand_id || 60,
                    catalog_id: itemData.catalog_id || 1773,
                    size_id: itemData.size_id || 1226,
                    color_ids: itemData.color_ids || [1],
                    item_attributes: itemData.material_id ? [{ "code": "material", "ids": [itemData.material_id] }] : [],
                    package_size_id: 1,
                    status_id: 6,
                    is_unisex: false
                },
                upload_session_id: tempUuid
            };

            console.log(`[Automation Engine Fresh] 📤 Envoi vers ${endpoint}:`, payload);

            // Headers d'authentification
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://www.vinted.fr',
                'Referer': 'https://www.vinted.fr/items/new',
                'User-Agent': navigator.userAgent,
                'Cookie': document.cookie
            };

            // Appeler l'endpoint trouvé
            const response = await fetch(`https://www.vinted.fr${endpoint}`, {
                method: 'POST',
                headers: headers,
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Automation Engine Fresh] ❌ Erreur ${endpoint}:`, response.status, errorText);
                throw new Error(`Erreur API ${endpoint}: ${response.status} - ${errorText}`);
            }

            const apiResult = await response.json();
            console.log(`[Automation Engine Fresh] ✅ Brouillon créé via ${endpoint}:`, apiResult);

            return {
                success: true,
                draftId: apiResult.draft?.id,
                tempUuid: tempUuid,
                endpoint: endpoint,
                result: apiResult
            };

        } catch (error) {
            console.error('[Automation Engine Fresh] ❌ Erreur création brouillon avec endpoint correct:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Fonction pour créer un brouillon avec la vraie API Vinted
    async function createDraftWithRealAPI(itemData, config, settings) {
        console.log('[Automation Engine Fresh] 🎯 Création brouillon avec la vraie API Vinted...');

        try {
            // Générer un UUID temporaire
            const tempUuid = generateUUID();

            // Préparer le payload exactement comme la vraie requête
            const payload = {
                draft: {
                    id: null,
                    currency: "EUR",
                    temp_uuid: tempUuid,
                    title: settings.safeMode ? modifyTitleForSafety(itemData.title) : itemData.title,
                    description: itemData.description || '',
                    price: settings.safeMode ? modifyPriceForSafety(extractPrice(itemData.price)) : extractPrice(itemData.price),
                    brand_id: itemData.brand_id || 60,
                    catalog_id: itemData.catalog_id || 1773,
                    size_id: itemData.size_id || 1226,
                    color_ids: itemData.color_ids || [1],
                    item_attributes: itemData.material_id ? [{ "code": "material", "ids": [itemData.material_id] }] : [],
                    package_size_id: 3, // Utiliser la même valeur que la vraie requête
                    status_id: 6,
                    is_unisex: false,
                    assigned_photos: [],
                    shipment_prices: {
                        domestic: null,
                        international: null
                    }
                },
                upload_session_id: tempUuid
            };

            console.log('[Automation Engine Fresh] 📤 Payload envoyé:', payload);

            // Headers exactement comme la vraie requête
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://www.vinted.fr',
                'Referer': 'https://www.vinted.fr/items/new',
                'User-Agent': navigator.userAgent,
                'Cookie': document.cookie
            };

            // Appeler l'API avec la méthode POST (pas GET)
            const response = await fetch('https://www.vinted.fr/api/v2/item_upload/drafts', {
                method: 'POST', // IMPORTANT: POST, pas GET
                headers: headers,
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[Automation Engine Fresh] ❌ Erreur API:', response.status, errorText);
                throw new Error(`Erreur API: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('[Automation Engine Fresh] ✅ Brouillon créé avec succès:', result);

            return {
                success: true,
                draftId: result.draft?.id,
                tempUuid: tempUuid,
                endpoint: '/api/v2/item_upload/drafts',
                result: result
            };

        } catch (error) {
            console.error('[Automation Engine Fresh] ❌ Erreur création brouillon:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Fonction pour analyser les vraies requêtes réseau de Vinted
    async function analyzeRealVintedRequests() {
        console.log('[Automation Engine Fresh] 🔍 Analyse des vraies requêtes réseau Vinted...');

        try {
            // Récupérer le HTML de la page de création pour voir les vraies requêtes
            const response = await fetch('https://www.vinted.fr/items/new', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'User-Agent': navigator.userAgent,
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-User': '?1'
                }
            });

            if (!response.ok) {
                console.error('[Automation Engine Fresh] ❌ Erreur récupération page création:', response.status);
                return null;
            }

            const html = await response.text();
            console.log('[Automation Engine Fresh] ✅ HTML page création récupéré pour analyse');

            // Parser le HTML pour trouver les vraies requêtes
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Chercher des scripts avec des requêtes API
            const scripts = doc.querySelectorAll('script');
            const apiRequests = [];

            for (const script of scripts) {
                const content = script.textContent || script.innerHTML;
                if (content) {
                    // Chercher des patterns de requêtes API
                    const apiPatterns = [
                        /fetch\(['"`]([^'"`]+)['"`]/g,
                        /\.post\(['"`]([^'"`]+)['"`]/g,
                        /\.get\(['"`]([^'"`]+)['"`]/g,
                        /axios\.(post|get|put|delete)\(['"`]([^'"`]+)['"`]/g,
                        /graphql.*query.*\{/gi,
                        /mutation.*\{/gi
                    ];

                    for (const pattern of apiPatterns) {
                        let match;
                        while ((match = pattern.exec(content)) !== null) {
                            const url = match[1] || match[2];
                            if (url && (url.includes('/api/') || url.includes('graphql') || url.includes('vinted'))) {
                                apiRequests.push({
                                    type: 'API_REQUEST',
                                    url: url,
                                    method: match[1] || 'GET',
                                    context: content.substring(Math.max(0, match.index - 50), match.index + 100)
                                });
                            }
                        }
                    }
                }
            }

            console.log('[Automation Engine Fresh] 🔍 Requêtes API trouvées:', apiRequests);

            // Essayer l'API GraphQL de Vinted
            const graphqlEndpoints = [
                '/graphql',
                '/api/graphql',
                '/v2/graphql',
                '/api/v2/graphql'
            ];

            for (const endpoint of graphqlEndpoints) {
                try {
                    console.log(`[Automation Engine Fresh] 🔍 Test GraphQL endpoint: ${endpoint}`);

                    const graphqlResponse = await fetch(`https://www.vinted.fr${endpoint}`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                            'Origin': 'https://www.vinted.fr',
                            'Referer': 'https://www.vinted.fr/items/new'
                        },
                        body: JSON.stringify({
                            query: `query { __schema { types { name } } }`
                        })
                    });

                    if (graphqlResponse.ok) {
                        console.log(`[Automation Engine Fresh] ✅ GraphQL endpoint trouvé: ${endpoint}`);
                        return {
                            type: 'GRAPHQL',
                            endpoint: endpoint,
                            apiRequests: apiRequests
                        };
                    } else {
                        console.log(`[Automation Engine Fresh] ❌ GraphQL endpoint ${endpoint}: ${graphqlResponse.status}`);
                    }

                } catch (error) {
                    console.log(`[Automation Engine Fresh] ❌ Erreur GraphQL ${endpoint}:`, error.message);
                }
            }

            return {
                type: 'ANALYSIS',
                apiRequests: apiRequests
            };

        } catch (error) {
            console.error('[Automation Engine Fresh] ❌ Erreur analyse requêtes réelles:', error);
            return null;
        }
    }

    // Fonction pour créer un brouillon via GraphQL
    async function createDraftViaGraphQL(itemData, config, settings) {
        console.log('[Automation Engine Fresh] 🔍 Création brouillon via GraphQL...');

        try {
            // Analyser les vraies requêtes
            const analysis = await analyzeRealVintedRequests();
            if (!analysis) {
                throw new Error('Impossible d\'analyser les requêtes réseau');
            }

            if (analysis.type === 'GRAPHQL') {
                console.log('[Automation Engine Fresh] 🎯 Utilisation de l\'API GraphQL:', analysis.endpoint);

                // Mutation GraphQL pour créer un brouillon
                const mutation = `
                    mutation CreateDraft($input: CreateDraftInput!) {
                        createDraft(input: $input) {
                            id
                            title
                            price
                            status
                        }
                    }
                `;

                const variables = {
                    input: {
                        title: settings.safeMode ? modifyTitleForSafety(itemData.title) : itemData.title,
                        description: itemData.description || '',
                        price: settings.safeMode ? modifyPriceForSafety(extractPrice(itemData.price)) : extractPrice(itemData.price),
                        brandId: itemData.brand_id || 60,
                        catalogId: itemData.catalog_id || 1773,
                        sizeId: itemData.size_id || 1226,
                        colorIds: itemData.color_ids || [1],
                        currency: "EUR"
                    }
                };

                const response = await fetch(`https://www.vinted.fr${analysis.endpoint}`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Origin': 'https://www.vinted.fr',
                        'Referer': 'https://www.vinted.fr/items/new',
                        'Cookie': document.cookie
                    },
                    body: JSON.stringify({
                        query: mutation,
                        variables: variables
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[Automation Engine Fresh] ❌ Erreur GraphQL:', response.status, errorText);
                    throw new Error(`Erreur GraphQL: ${response.status} - ${errorText}`);
                }

                const result = await response.json();
                console.log('[Automation Engine Fresh] ✅ Brouillon créé via GraphQL:', result);

                return {
                    success: true,
                    draftId: result.data?.createDraft?.id,
                    tempUuid: generateUUID(),
                    endpoint: analysis.endpoint,
                    result: result
                };
            } else {
                console.log('[Automation Engine Fresh] 📊 Analyse des requêtes trouvées:', analysis.apiRequests);
                throw new Error('Aucun endpoint GraphQL trouvé, analyse des requêtes disponibles');
            }

        } catch (error) {
            console.error('[Automation Engine Fresh] ❌ Erreur création brouillon GraphQL:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Fonction pour intercepter les vraies requêtes réseau de Vinted
    async function interceptVintedNetworkRequests() {
        console.log('[Automation Engine Fresh] 🔍 Interception des vraies requêtes réseau Vinted...');

        return new Promise((resolve) => {
            // Créer un proxy pour intercepter fetch
            const originalFetch = window.fetch;
            const interceptedRequests = [];

            window.fetch = function (...args) {
                const url = args[0];
                const options = args[1] || {};

                // Intercepter les requêtes vers l'API Vinted
                if (typeof url === 'string' && url.includes('vinted.fr/api/')) {
                    console.log('[Automation Engine Fresh] 🔍 Requête interceptée:', {
                        url: url,
                        method: options.method || 'GET',
                        headers: options.headers,
                        body: options.body
                    });

                    interceptedRequests.push({
                        url: url,
                        method: options.method || 'GET',
                        headers: options.headers,
                        body: options.body,
                        timestamp: new Date().toISOString()
                    });
                }

                return originalFetch.apply(this, args);
            };

            // Attendre quelques secondes pour capturer les requêtes
            setTimeout(() => {
                console.log('[Automation Engine Fresh] 📊 Requêtes interceptées:', interceptedRequests);

                // Restaurer fetch original
                window.fetch = originalFetch;

                resolve(interceptedRequests);
            }, 5000);
        });
    }

    // Fonction pour créer un brouillon avec les vrais headers d'authentification
    async function createDraftWithRealHeaders(itemData, config, settings) {
        console.log('[Automation Engine Fresh] 🔐 Création brouillon avec les vrais headers d\'authentification...');

        try {
            // Intercepter les vraies requêtes pour récupérer les headers
            console.log('[Automation Engine Fresh] ⏳ Interception des requêtes réseau en cours...');
            const interceptedRequests = await interceptVintedNetworkRequests();

            // Chercher une requête POST vers l'API de création de brouillon
            const draftRequest = interceptedRequests.find(req =>
                req.url.includes('item_upload/drafts') && req.method === 'POST'
            );

            if (!draftRequest) {
                console.log('[Automation Engine Fresh] ⚠️ Aucune requête de création de brouillon interceptée');
                console.log('[Automation Engine Fresh] 📊 Requêtes disponibles:', interceptedRequests);

                // Essayer avec les headers par défaut
                return await createDraftWithDefaultHeaders(itemData, config, settings);
            }

            console.log('[Automation Engine Fresh] ✅ Requête de création de brouillon interceptée:', draftRequest);

            // Utiliser exactement les mêmes headers que la vraie requête
            const realHeaders = draftRequest.headers;
            console.log('[Automation Engine Fresh] 🔐 Headers réels utilisés:', realHeaders);

            // Générer un UUID temporaire
            const tempUuid = generateUUID();

            // Préparer le payload
            const payload = {
                draft: {
                    id: null,
                    currency: "EUR",
                    temp_uuid: tempUuid,
                    title: settings.safeMode ? modifyTitleForSafety(itemData.title) : itemData.title,
                    description: itemData.description || '',
                    price: settings.safeMode ? modifyPriceForSafety(extractPrice(itemData.price)) : extractPrice(itemData.price),
                    brand_id: itemData.brand_id || 60,
                    catalog_id: itemData.catalog_id || 1773,
                    size_id: itemData.size_id || 1226,
                    color_ids: itemData.color_ids || [1],
                    item_attributes: itemData.material_id ? [{ "code": "material", "ids": [itemData.material_id] }] : [],
                    package_size_id: 3,
                    status_id: 6,
                    is_unisex: false,
                    assigned_photos: [],
                    shipment_prices: {
                        domestic: null,
                        international: null
                    }
                },
                upload_session_id: tempUuid
            };

            console.log('[Automation Engine Fresh] 📤 Payload envoyé:', payload);

            // Appeler l'API avec les vrais headers
            const response = await fetch('https://www.vinted.fr/api/v2/item_upload/drafts', {
                method: 'POST',
                headers: realHeaders,
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[Automation Engine Fresh] ❌ Erreur API avec vrais headers:', response.status, errorText);
                throw new Error(`Erreur API: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('[Automation Engine Fresh] ✅ Brouillon créé avec vrais headers:', result);

            return {
                success: true,
                draftId: result.draft?.id,
                tempUuid: tempUuid,
                endpoint: '/api/v2/item_upload/drafts',
                headers: realHeaders,
                result: result
            };

        } catch (error) {
            console.error('[Automation Engine Fresh] ❌ Erreur création brouillon avec vrais headers:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Fonction de fallback avec headers par défaut
    async function createDraftWithDefaultHeaders(itemData, config, settings) {
        console.log('[Automation Engine Fresh] 🔄 Fallback: Création avec headers par défaut...');

        try {
            // Générer un UUID temporaire
            const tempUuid = generateUUID();

            // Préparer le payload
            const payload = {
                draft: {
                    id: null,
                    currency: "EUR",
                    temp_uuid: tempUuid,
                    title: settings.safeMode ? modifyTitleForSafety(itemData.title) : itemData.title,
                    description: itemData.description || '',
                    price: settings.safeMode ? modifyPriceForSafety(extractPrice(itemData.price)) : extractPrice(itemData.price),
                    brand_id: itemData.brand_id || 60,
                    catalog_id: itemData.catalog_id || 1773,
                    size_id: itemData.size_id || 1226,
                    color_ids: itemData.color_ids || [1],
                    item_attributes: itemData.material_id ? [{ "code": "material", "ids": [itemData.material_id] }] : [],
                    package_size_id: 3,
                    status_id: 6,
                    is_unisex: false,
                    assigned_photos: [],
                    shipment_prices: {
                        domestic: null,
                        international: null
                    }
                },
                upload_session_id: tempUuid
            };

            // Headers par défaut avec plus d'authentification
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://www.vinted.fr',
                'Referer': 'https://www.vinted.fr/items/new',
                'User-Agent': navigator.userAgent,
                'Cookie': document.cookie,
                'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            };

            const response = await fetch('https://www.vinted.fr/api/v2/item_upload/drafts', {
                method: 'POST',
                headers: headers,
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[Automation Engine Fresh] ❌ Erreur API avec headers par défaut:', response.status, errorText);
                throw new Error(`Erreur API: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('[Automation Engine Fresh] ✅ Brouillon créé avec headers par défaut:', result);

            return {
                success: true,
                draftId: result.draft?.id,
                tempUuid: tempUuid,
                endpoint: '/api/v2/item_upload/drafts',
                result: result
            };

        } catch (error) {
            console.error('[Automation Engine Fresh] ❌ Erreur création brouillon avec headers par défaut:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Fonction pour créer un brouillon avec les headers de la vraie requête qui fonctionne
    async function createDraftWithWorkingHeaders(itemData, config, settings) {
        console.log('[Automation Engine Fresh] 🎯 Création brouillon avec les headers de la vraie requête qui fonctionne...');

        try {
            // Générer un UUID temporaire
            const tempUuid = generateUUID();

            // Préparer le payload exactement comme la vraie requête qui fonctionne
            const payload = {
                draft: {
                    id: null,
                    currency: "EUR",
                    temp_uuid: tempUuid,
                    title: settings.safeMode ? modifyTitleForSafety(itemData.title) : itemData.title,
                    description: itemData.description || '',
                    price: settings.safeMode ? modifyPriceForSafety(extractPrice(itemData.price)) : extractPrice(itemData.price),
                    brand_id: itemData.brand_id || null,
                    catalog_id: itemData.catalog_id || null,
                    size_id: itemData.size_id || null,
                    color_ids: itemData.color_ids || [],
                    item_attributes: itemData.material_id ? [{ "code": "material", "ids": [itemData.material_id] }] : [],
                    package_size_id: null,
                    status_id: null,
                    is_unisex: false,
                    assigned_photos: [],
                    shipment_prices: {
                        domestic: null,
                        international: null
                    }
                },
                upload_session_id: tempUuid
            };

            console.log('[Automation Engine Fresh] 📤 Payload envoyé:', payload);

            // Headers EXACTS de la vraie requête qui fonctionne (200 OK)
            // Copiés directement depuis la requête POST https://www.vinted.fr/api/v2/item_upload/drafts
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*,image/webp',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'fr',
                'Cache-Control': 'no-cache',
                'Cookie': document.cookie,
                'Origin': 'https://www.vinted.fr',
                'Pragma': 'no-cache',
                'Priority': 'u=1, i',
                'Referer': 'https://www.vinted.fr/items/new',
                'Sec-Ch-Ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"macOS"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                'X-Anon-Id': '0056b8cd-8dfb-42be-814c-62cc30503c9d',
                'X-Csrf-Token': '75f6c9fa-dc8e-4e52-a000-e09dd4084b3e',
                'X-Enable-Multiple-Size-Groups': 'true'
            };

            console.log('[Automation Engine Fresh] 🔐 Headers exacts de la vraie requête utilisés');

            console.log('[Automation Engine Fresh] 🔐 Headers utilisés:', headers);

            // Appeler l'API avec les headers de la vraie requête
            const response = await fetch('https://www.vinted.fr/api/v2/item_upload/drafts', {
                method: 'POST',
                headers: headers,
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[Automation Engine Fresh] ❌ Erreur API:', response.status, errorText);

                // Analyse détaillée de l'erreur
                console.error('[Automation Engine Fresh] 🔍 Analyse erreur 403:');
                console.error('- Status:', response.status);
                console.error('- Status Text:', response.statusText);
                console.error('- Headers de réponse:', Object.fromEntries(response.headers.entries()));
                console.error('- URL appelée:', 'https://www.vinted.fr/api/v2/item_upload/drafts');
                console.error('- Méthode:', 'POST');
                console.error('- Payload envoyé:', JSON.stringify(payload, null, 2));
                console.error('- Headers envoyés:', JSON.stringify(headers, null, 2));

                throw new Error(`Erreur API: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('[Automation Engine Fresh] ✅ Brouillon créé avec succès:', result);

            return {
                success: true,
                draftId: result.draft?.id,
                tempUuid: tempUuid,
                endpoint: '/api/v2/item_upload/drafts',
                result: result
            };

        } catch (error) {
            console.error('[Automation Engine Fresh] ❌ Erreur création brouillon:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Écouter les messages
    window.addEventListener('message', function (event) {
        console.log('[Automation Engine Fresh] 📬 Message reçu:', event.data);

        if (event.data.action === 'VINTED_AUTOMATION_START') {
            console.log('[Automation Engine Fresh] 🚀 Commande automation reçue');
            console.log('[Automation Engine Fresh] ⚙️ Settings:', event.data.settings);

            // Gérer plusieurs items ou un seul
            const items = Array.isArray(event.data.items) ? event.data.items : [event.data.itemId];
            console.log('[Automation Engine Fresh] 📋 Items à traiter:', items);

            // Démarrer le traitement en arrière-plan
            processItemsList(items, event.data.settings).catch(error => {
                console.error('[Automation Engine Fresh] ❌ Erreur traitement:', error);
            });
        }
    });

    console.log('[Automation Engine Fresh] 🎯 MOTEUR FRESH PRÊT - En attente d\'instructions');

} catch (error) {
    console.error('[Automation Engine Fresh] ❌ ERREUR CRITIQUE:', error);
    console.error('[Automation Engine Fresh] ❌ Stack trace:', error.stack);
} 