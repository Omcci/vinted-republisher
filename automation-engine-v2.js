/**
 * VINTED AUTOMATION ENGINE - VERSION SIMPLIFIÉE
 * Version de test pour identifier les problèmes
 */

console.log('[Automation Engine V2] 🚀 DÉMARRAGE DU MOTEUR V2');

try {
    // Test de base
    console.log('[Automation Engine V2] 📍 URL actuelle:', window.location.href);
    console.log('[Automation Engine V2] 🕐 Timestamp:', new Date().toISOString());

    // Marquer que le moteur est prêt
    window.VINTED_AUTOMATION_READY = true;
    console.log('[Automation Engine V2] ✅ MOTEUR PRÊT - window.VINTED_AUTOMATION_READY = true');

    // Écouter les messages
    window.addEventListener('message', function (event) {
        console.log('[Automation Engine V2] 📬 Message reçu:', event.data);

        if (event.data.type === 'VINTED_AUTOMATION_START') {
            console.log('[Automation Engine V2] 🚀 Commande automation reçue pour item:', event.data.itemId);
            console.log('[Automation Engine V2] ⚙️ Settings:', event.data.settings);

            // Simuler le démarrage du processus
            console.log('[Automation Engine V2] 🎯 DÉMARRAGE AUTOMATION SIMULÉE');
            console.log('[Automation Engine V2] 📋 Étape 1: Navigation vers l\'article...');

            // Naviguer vers l'article
            const targetUrl = `https://www.vinted.fr/items/${event.data.itemId}`;
            console.log('[Automation Engine V2] 🔄 Navigation vers:', targetUrl);
            window.location.href = targetUrl;
        }
    });

    console.log('[Automation Engine V2] 🎯 MOTEUR V2 PRÊT - En attente d\'instructions');

} catch (error) {
    console.error('[Automation Engine V2] ❌ ERREUR CRITIQUE:', error);
    console.error('[Automation Engine V2] ❌ Stack trace:', error.stack);
} 