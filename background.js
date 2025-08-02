/**
 * Background Script pour Vinted Auto Republisher
 * Coordonne les actions entre le popup et les content scripts
 */

class BackgroundManager {
    constructor() {
        this.sessions = new Map();
        this.init();
    }

    init() {
        // Écouter les messages des autres scripts
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Indique que la réponse sera asynchrone
        });

        // Écouter les changements d'onglets
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.handleTabUpdate(tabId, changeInfo, tab);
        });

        // Écouter la fermeture d'onglets
        chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
            this.handleTabRemoved(tabId);
        });

        console.log('[Vinted Republisher] Background script initialisé');
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'startSession':
                    const sessionId = await this.startRepublishSession(request.data, sender.tab.id);
                    sendResponse({ success: true, sessionId });
                    break;

                case 'updateSession':
                    await this.updateSession(request.sessionId, request.data);
                    sendResponse({ success: true });
                    break;

                case 'endSession':
                    await this.endSession(request.sessionId);
                    sendResponse({ success: true });
                    break;

                case 'getSession':
                    const session = this.getSession(request.sessionId);
                    sendResponse({ success: true, session });
                    break;

                case 'logActivity':
                    await this.logActivity(request.data);
                    sendResponse({ success: true });
                    break;

                case 'checkPermissions':
                    const hasPermissions = await this.checkPermissions();
                    sendResponse({ success: true, hasPermissions });
                    break;

                default:
                    sendResponse({ success: false, error: 'Action inconnue' });
            }
        } catch (error) {
            console.error('[Vinted Republisher] Erreur background:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async startRepublishSession(data, tabId) {
        const sessionId = this.generateSessionId();
        const session = {
            id: sessionId,
            tabId: tabId,
            startTime: Date.now(),
            status: 'active',
            itemsTotal: data.itemsTotal || 0,
            itemsProcessed: 0,
            itemsSuccessful: 0,
            itemsFailed: 0,
            settings: data.settings || {},
            logs: []
        };

        this.sessions.set(sessionId, session);

        // Sauvegarder en storage pour persistance
        await this.saveSessionToStorage(session);

        console.log(`[Vinted Republisher] Session démarrée: ${sessionId}`);
        return sessionId;
    }

    async updateSession(sessionId, data) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Session introuvable');
        }

        // Mettre à jour les données
        Object.assign(session, data);
        session.lastUpdate = Date.now();

        // Sauvegarder
        await this.saveSessionToStorage(session);

        // Notifier le popup si ouvert
        this.notifyPopupUpdate(sessionId, session);
    }

    async endSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        session.status = 'completed';
        session.endTime = Date.now();
        session.duration = session.endTime - session.startTime;

        // Sauvegarder les statistiques finales
        await this.saveSessionToStorage(session);
        await this.saveSessionStats(session);

        // Nettoyer après 5 minutes
        setTimeout(() => {
            this.sessions.delete(sessionId);
        }, 5 * 60 * 1000);

        console.log(`[Vinted Republisher] Session terminée: ${sessionId}`);
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }

    async logActivity(data) {
        const { sessionId, level, message, timestamp } = data;

        if (sessionId) {
            const session = this.sessions.get(sessionId);
            if (session) {
                session.logs.push({
                    level: level || 'info',
                    message,
                    timestamp: timestamp || Date.now()
                });

                // Limiter le nombre de logs pour éviter la surcharge mémoire
                if (session.logs.length > 100) {
                    session.logs = session.logs.slice(-50);
                }

                await this.saveSessionToStorage(session);
            }
        }

        // Log global
        const logEntry = {
            level: level || 'info',
            message,
            timestamp: timestamp || Date.now(),
            sessionId
        };

        await this.saveGlobalLog(logEntry);
    }

    async checkPermissions() {
        try {
            // Vérifier les permissions de base
            const hasActiveTab = await chrome.permissions.contains({
                permissions: ['activeTab']
            });

            const hasStorage = await chrome.permissions.contains({
                permissions: ['storage']
            });

            const hasHostPermissions = await chrome.permissions.contains({
                origins: ['https://www.vinted.fr/*', 'https://vinted.fr/*']
            });

            return hasActiveTab && hasStorage && hasHostPermissions;
        } catch (error) {
            console.error('Erreur vérification permissions:', error);
            return false;
        }
    }

    handleTabUpdate(tabId, changeInfo, tab) {
        // Injecter le content script si c'est une page Vinted
        if (changeInfo.status === 'complete' && tab.url && this.isVintedUrl(tab.url)) {
            this.injectContentScript(tabId);
        }

        // Vérifier si un onglet avec une session active a changé
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.tabId === tabId && session.status === 'active') {
                if (changeInfo.status === 'complete' && tab.url) {
                    // Notifier le content script que la page est chargée
                    this.notifyContentScriptReady(tabId, sessionId);
                }
            }
        }
    }

    isVintedUrl(url) {
        return url.includes('vinted.fr') || url.includes('vinted.com');
    }

    async injectContentScript(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
            console.log(`[Vinted Republisher] Content script injecté dans l'onglet ${tabId}`);
        } catch (error) {
            console.warn(`[Vinted Republisher] Erreur injection content script:`, error);
        }
    }

    handleTabRemoved(tabId) {
        // Marquer les sessions de cet onglet comme interrompues
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.tabId === tabId && session.status === 'active') {
                session.status = 'interrupted';
                session.endTime = Date.now();
                this.saveSessionToStorage(session);
                console.log(`[Vinted Republisher] Session interrompue: ${sessionId}`);
            }
        }
    }

    async saveSessionToStorage(session) {
        try {
            const key = `session_${session.id}`;
            await chrome.storage.local.set({ [key]: session });
        } catch (error) {
            console.error('Erreur sauvegarde session:', error);
        }
    }

    async saveSessionStats(session) {
        try {
            // Récupérer les stats existantes
            const result = await chrome.storage.local.get(['sessionStats']);
            const stats = result.sessionStats || {
                totalSessions: 0,
                totalItemsProcessed: 0,
                totalItemsSuccessful: 0,
                totalItemsFailed: 0,
                totalDuration: 0,
                lastSession: null
            };

            // Mettre à jour
            stats.totalSessions++;
            stats.totalItemsProcessed += session.itemsProcessed;
            stats.totalItemsSuccessful += session.itemsSuccessful;
            stats.totalItemsFailed += session.itemsFailed;
            stats.totalDuration += session.duration || 0;
            stats.lastSession = Date.now();

            await chrome.storage.local.set({ sessionStats: stats });
        } catch (error) {
            console.error('Erreur sauvegarde stats:', error);
        }
    }

    async saveGlobalLog(logEntry) {
        try {
            const result = await chrome.storage.local.get(['globalLogs']);
            const logs = result.globalLogs || [];

            logs.push(logEntry);

            // Garder seulement les 200 derniers logs
            if (logs.length > 200) {
                logs.splice(0, logs.length - 200);
            }

            await chrome.storage.local.set({ globalLogs: logs });
        } catch (error) {
            console.error('Erreur sauvegarde log global:', error);
        }
    }

    async notifyPopupUpdate(sessionId, session) {
        try {
            // Essayer de notifier tous les onglets popup ouverts
            const views = chrome.extension.getViews({ type: 'popup' });
            views.forEach(view => {
                if (view.updateSessionData) {
                    view.updateSessionData(sessionId, session);
                }
            });
        } catch (error) {
            // Le popup n'est peut-être pas ouvert, c'est normal
        }
    }

    async notifyContentScriptReady(tabId, sessionId) {
        try {
            await chrome.tabs.sendMessage(tabId, {
                action: 'sessionReady',
                sessionId: sessionId
            });
        } catch (error) {
            // Le content script n'est peut-être pas encore chargé
            console.warn('Impossible de notifier le content script:', error);
        }
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    // Méthodes utilitaires pour les statistiques
    async getSessionStats() {
        try {
            const result = await chrome.storage.local.get(['sessionStats']);
            return result.sessionStats || {
                totalSessions: 0,
                totalItemsProcessed: 0,
                totalItemsSuccessful: 0,
                totalItemsFailed: 0,
                totalDuration: 0,
                lastSession: null
            };
        } catch (error) {
            console.error('Erreur récupération stats:', error);
            return null;
        }
    }

    async getRecentSessions(limit = 10) {
        try {
            const result = await chrome.storage.local.get();
            const sessions = [];

            for (const [key, value] of Object.entries(result)) {
                if (key.startsWith('session_') && value.id) {
                    sessions.push(value);
                }
            }

            // Trier par date de début décroissante
            sessions.sort((a, b) => b.startTime - a.startTime);

            return sessions.slice(0, limit);
        } catch (error) {
            console.error('Erreur récupération sessions:', error);
            return [];
        }
    }

    async clearOldSessions(olderThanDays = 7) {
        try {
            const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
            const result = await chrome.storage.local.get();
            const keysToRemove = [];

            for (const [key, value] of Object.entries(result)) {
                if (key.startsWith('session_') && value.startTime && value.startTime < cutoffTime) {
                    keysToRemove.push(key);
                }
            }

            if (keysToRemove.length > 0) {
                await chrome.storage.local.remove(keysToRemove);
                console.log(`[Vinted Republisher] ${keysToRemove.length} sessions anciennes supprimées`);
            }
        } catch (error) {
            console.error('Erreur nettoyage sessions:', error);
        }
    }
}

// Initialiser le gestionnaire background
const backgroundManager = new BackgroundManager();

// Nettoyer les anciennes sessions au démarrage
backgroundManager.clearOldSessions(7);