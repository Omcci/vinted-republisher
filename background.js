/**
 * background.js - Coordinator for popup/content/page automation messaging.
 * Safe by default: creates drafts only, never deletes/publishes originals.
 */

const globalState = {
  currentTabId: null,
  currentUrl: null,
  scannedItems: [],
  runningAutomations: {},
};

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  (async () => {
    try {
      switch (req.action) {
        case "setCurrentTab": {
          globalState.currentTabId = req.tabId ?? sender.tab?.id ?? null;
          globalState.currentUrl = req.url ?? sender.tab?.url ?? null;
          sendResponse({ success: true });
          return;
        }

        case "getGlobalState": {
          sendResponse({ success: true, state: globalState });
          return;
        }

        case "scanItems": {
          const tabId = await resolveActiveTabId();
          const items = await requestTab(tabId, { action: "SCAN_ITEMS" });
          globalState.scannedItems = Array.isArray(items) ? items : [];
          await chrome.storage.local.set({
            lastScanResult: {
              items: globalState.scannedItems,
              timestamp: Date.now(),
            },
          });
          sendResponse({ success: true, items: globalState.scannedItems });
          return;
        }

        case "startFullAutomation": {
          const tabId = await resolveActiveTabId();
          const itemId = req.itemId;
          if (!itemId) {
            sendResponse({ success: false, error: "itemId manquant" });
            return;
          }

          const settings = {
            safeMode: true,
            autoFill: true,
            autoSave: true,
            ...(req.settings || {}),
          };

          globalState.runningAutomations[itemId] = {
            tabId,
            startedAt: Date.now(),
            status: "STARTED",
            settings,
          };

          await chrome.tabs.sendMessage(tabId, {
            action: "START_SAFE_DOM_DRAFT",
            itemId,
            item: req.item || null,
            settings,
          });

          sendResponse({ success: true, itemId, tabId });
          return;
        }

        case "VINTED_AUTOMATION_RESULTS": {
          const results = Array.isArray(req.results) ? req.results : [];
          const now = Date.now();

          for (const result of results) {
            const key = String(result.itemId || "");
            if (!key) continue;

            const status = result.success ? "DRAFT_CREATED_SAFE" : "ERROR";
            const statusEntry = {
              status,
              title: result.title || `Article ${key}`,
              timestamp: now,
              error: result.error || null,
              imageCount: result.imageCount ?? null,
              draftId: result.draftId ?? null,
              photosAttached: result.photosAttached ?? null,
              photoUploadFailed: !!result.photoUploadFailed,
            };

            await chrome.storage.local.set({
              [`republish_status_${key}`]: statusEntry,
            });

            if (globalState.runningAutomations[key]) {
              globalState.runningAutomations[key].status = status;
              globalState.runningAutomations[key].lastUpdate = now;
              globalState.runningAutomations[key].error = result.error || null;
            }
          }

          sendResponse({ success: true, handled: results.length });
          return;
        }

        case "DOWNLOAD_IMAGE_DATAURL": {
          if (!req.url) {
            sendResponse({ success: false, error: "url manquante" });
            return;
          }
          const data = await downloadImageAsDataUrl(req.url);
          sendResponse({ success: true, ...data });
          return;
        }

        // Legacy path for old popup/content message names
        case "START_REPUBLISH": {
          const tabId = req.tabId ?? (await resolveActiveTabId());
          const data = await requestTab(tabId, { action: "SCRAPE" });
          await chrome.storage.local.set({ republish_data: data });
          sendResponse({ success: true });
          return;
        }

        default:
          sendResponse({ success: false, error: `Action inconnue: ${req.action}` });
      }
    } catch (error) {
      console.error("[Background] ❌", error);
      sendResponse({ success: false, error: error.message || "Erreur inconnue" });
    }
  })();

  return true;
});

async function resolveActiveTabId() {
  if (globalState.currentTabId) return globalState.currentTabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Aucun onglet actif trouvé");
  globalState.currentTabId = tab.id;
  globalState.currentUrl = tab.url || null;
  return tab.id;
}

function requestTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(
          new Error(
            `Impossible de contacter le content script (onglet ${tabId}): ${err.message}`
          )
        );
        return;
      }
      resolve(response);
    });
  });
}

async function downloadImageAsDataUrl(url) {
  const candidates = buildImageUrlCandidates(url);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const resp = await fetch(candidate, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        referrer: "https://www.vinted.fr/",
        referrerPolicy: "strict-origin-when-cross-origin",
      });
      if (!resp.ok) {
        lastError = new Error(`download failed: ${resp.status}`);
        continue;
      }
      const contentType = resp.headers.get("content-type") || "image/jpeg";
      const buffer = await resp.arrayBuffer();
      if (!buffer || buffer.byteLength === 0) {
        lastError = new Error("empty image payload");
        continue;
      }
      const base64 = arrayBufferToBase64(buffer);
      return {
        dataUrl: `data:${contentType};base64,${base64}`,
        contentType,
        byteLength: buffer.byteLength,
        resolvedUrl: candidate,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("image download failed for all candidates");
}

function buildImageUrlCandidates(url) {
  if (!url || typeof url !== "string") return [];
  let normalized = url.trim();
  if (normalized.startsWith("//")) normalized = `https:${normalized}`;
  if (normalized.startsWith("http://")) normalized = normalized.replace("http://", "https://");
  const set = new Set([normalized]);
  set.add(normalized.replace("/original/", "/"));
  set.add(normalized.replace("/thumb/", "/"));
  set.add(normalized.replace("/medium/", "/"));
  set.add(normalized.replace(/\/\d+x\d+\//, "/"));
  return Array.from(set).filter(Boolean);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
