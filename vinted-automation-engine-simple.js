/**
 * VINTED AUTOMATION ENGINE - VERSION SIMPLIFIÉE
 * Version de test pour identifier les problèmes
 */

console.log('[Automation Engine Simple] 🚀 DÉMARRAGE DU MOTEUR SIMPLIFIÉ');

try {
    // Test de base
    console.log('[Automation Engine Simple] 📍 URL actuelle:', window.location.href);
    console.log('[Automation Engine Simple] 🕐 Timestamp:', new Date().toISOString());

    // Marquer que le moteur est prêt
    window.VINTED_AUTOMATION_READY = true;
    console.log('[Automation Engine Simple] ✅ MOTEUR PRÊT - window.VINTED_AUTOMATION_READY = true');

    // Écouter les messages
    window.addEventListener('message', function (event) {
        console.log('[Automation Engine Simple] 📬 Message reçu:', event.data);

        if (event.data.type === 'VINTED_AUTOMATION_START') {
            console.log('[Automation Engine Simple] 🚀 Commande automation reçue pour item:', event.data.itemId);
            console.log('[Automation Engine Simple] ⚙️ Settings:', event.data.settings);

            // Simuler le démarrage du processus
            console.log('[Automation Engine Simple] 🎯 DÉMARRAGE AUTOMATION SIMULÉE');
            console.log('[Automation Engine Simple] 📋 Étape 1: Navigation vers l\'article...');

            // Naviguer vers l'article
            const targetUrl = `https://www.vinted.fr/items/${event.data.itemId}`;
            console.log('[Automation Engine Simple] 🔄 Navigation vers:', targetUrl);
            window.location.href = targetUrl;
        }
    });

    console.log('[Automation Engine Simple] 🎯 MOTEUR SIMPLIFIÉ PRÊT - En attente d\'instructions');

} catch (error) {
    console.error('[Automation Engine Simple] ❌ ERREUR CRITIQUE:', error);
    console.error('[Automation Engine Simple] ❌ Stack trace:', error.stack);
} 