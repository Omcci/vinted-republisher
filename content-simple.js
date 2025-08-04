/**
 * Content Script INTELLIGENT - Injection + Auto-continuation
 */

console.log('[Vinted Extractor] 🚀 Injection de l\'extracteur...');

// Injecter les scripts dans le contexte de la page
function injectScripts() {
    console.log('[Content] 🔧 Début de l\'injection des scripts...');

    // 1. Injecter l'extracteur
    const extractorScript = document.createElement('script');
    const extractorUrl = chrome.runtime.getURL('vinted-extractor.js');
    console.log('[Content] 📄 URL extracteur:', extractorUrl);

    extractorScript.src = extractorUrl;
    extractorScript.onload = function () {
        console.log('[Vinted Extractor] ✅ Extracteur injecté avec succès');
        console.log('[Vinted Extractor] 🔍 Vérification window.vinted:', typeof window.vinted);
        this.remove();

        // 2. Injecter l'automator après l'extracteur
        const automatorScript = document.createElement('script');
        const automatorUrl = chrome.runtime.getURL('vinted-automator.js');
        console.log('[Content] 📄 URL automator:', automatorUrl);

        automatorScript.src = automatorUrl;
        automatorScript.onload = function () {
            console.log('[Vinted Automator] ✅ Automator injecté avec succès');
            console.log('[Vinted Automator] 🔍 Vérification window.vintedBot:', typeof window.vintedBot);
            this.remove();

            // 3. Vérification finale - AUTO-CONTINUATION DÉSACTIVÉE
            setTimeout(() => {
                console.log('[Content] 🔍 VÉRIFICATION FINALE:');
                console.log('[Content] - window.vinted:', typeof window.vinted);
                console.log('[Content] - window.vinted.scanPage:', typeof window.vinted?.scanPage);
                console.log('[Content] - window.vintedBot:', typeof window.vintedBot);

                console.log('[Content] ⚠️ AUTO-CONTINUATION DÉSACTIVÉE POUR SÉCURITÉ');
                // checkDirectProcesses(); // DÉSACTIVÉ
                // checkAndContinueProcess(); // DÉSACTIVÉ
            }, 3000);
        };
        automatorScript.onerror = function () {
            console.error('[Vinted Automator] ❌ Erreur chargement automator');
            this.remove();
        };
        (document.head || document.documentElement).appendChild(automatorScript);
    };
    extractorScript.onerror = function () {
        console.error('[Vinted Extractor] ❌ Erreur chargement extracteur');
        this.remove();
    };
    (document.head || document.documentElement).appendChild(extractorScript);
}

// Vérifier les processus directs en cours
function checkDirectProcesses() {
    // Injecter le script de vérification des processus directs
    const checkScript = document.createElement('script');
    checkScript.src = chrome.runtime.getURL('direct-process-checker.js');
    checkScript.onload = function () {
        console.log('[Direct-Process] ✅ Script de vérification direct injecté');
        this.remove();
    };
    checkScript.onerror = function () {
        console.error('[Direct-Process] ❌ Erreur injection script direct');
        this.remove();
    };

    (document.head || document.documentElement).appendChild(checkScript);
}

// Vérifier et continuer automatiquement les processus en cours
function checkAndContinueProcess() {
    // Injecter le script de vérification des processus
    const checkScript = document.createElement('script');
    checkScript.src = chrome.runtime.getURL('process-checker.js');
    checkScript.onload = function () {
        console.log('[Auto-Continue] ✅ Script de vérification injecté');
        this.remove();
    };
    checkScript.onerror = function () {
        console.error('[Auto-Continue] ❌ Erreur injection script de vérification');
        this.remove();
    };

    (document.head || document.documentElement).appendChild(checkScript);
}

// Injecter le nouveau moteur d'automation
function injectAutomationEngine() {
    console.log('[Content] 🔄 Tentative d\'injection du moteur d\'automation...');

    const engineScript = document.createElement('script');
    engineScript.src = chrome.runtime.getURL('automation-engine-v2.js');

    // Supprimer tous les anciens scripts
    const oldScripts = document.querySelectorAll('script[src*="automation"], script[src*="test-automation"]');
    oldScripts.forEach(script => {
        console.log('[Content] 🧹 Suppression de l\'ancien script:', script.src);
        script.remove();
    });

    console.log('[Content] 📄 URL du script:', engineScript.src);

    engineScript.onload = function () {
        console.log('[Content] 🤖 MOTEUR D\'AUTOMATION INJECTÉ - AUTOMATION COMPLÈTE ACTIVÉE');
        this.remove();
    };

    engineScript.onerror = function (error) {
        console.error('[Content] ❌ Erreur injection moteur automation:', error);
        console.error('[Content] ❌ URL qui a échoué:', engineScript.src);
        this.remove();
    };

    (document.head || document.documentElement).appendChild(engineScript);
    console.log('[Content] 📤 Script moteur d\'automation ajouté au DOM');
}

// Injecter immédiatement
injectScripts();

// Injecter le moteur d'automation avec un délai pour s'assurer qu'il se charge
setTimeout(() => {
    console.log('[Content] ⏰ Injection différée du moteur d\'automation...');
    injectAutomationEngine();
}, 1000);