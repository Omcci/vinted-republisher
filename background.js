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

/** Live CSRF / anon_id harvested from real Vinted API traffic (required for delete). */
let latestVintedCsrf = null;
let latestVintedAnonId = null;

function upsertVintedTokensFromHeaders(requestHeaders) {
  if (!Array.isArray(requestHeaders)) return;
  let changed = false;
  for (const h of requestHeaders) {
    if (!h?.name) continue;
    const name = String(h.name).toLowerCase();
    if (name === "x-csrf-token" && h.value) {
      latestVintedCsrf = h.value;
      changed = true;
    } else if (name === "x-anon-id" && h.value) {
      latestVintedAnonId = h.value;
      changed = true;
    }
  }
  if (!changed) return;
  try {
    chrome.storage.local.set({
      vinted_csrf_token: latestVintedCsrf,
      vinted_anon_id: latestVintedAnonId,
    });
  } catch (_) {
    // ignore
  }
}

try {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      try {
        upsertVintedTokensFromHeaders(details.requestHeaders || []);
      } catch (_) {
        // ignore
      }
    },
    {
      urls: [
        "https://*.vinted.fr/api/*",
        "https://*.vinted.com/api/*",
        "https://www.vinted.fr/*",
        "https://www.vinted.com/*",
      ],
    },
    ["requestHeaders"]
  );
} catch (error) {
  console.warn("[Vinted Republisher] webRequest CSRF capture unavailable:", error);
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  (async () => {
    try {
      switch (req.action) {
        case "getVintedAuthTokens": {
          const stored = await chrome.storage.local.get([
            "vinted_csrf_token",
            "vinted_anon_id",
          ]);
          sendResponse({
            success: true,
            csrf: latestVintedCsrf || stored.vinted_csrf_token || null,
            anonId: latestVintedAnonId || stored.vinted_anon_id || null,
          });
          return;
        }

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

        case "finishFromCurrentDraft": {
          const tabId = await resolveActiveTabId();
          const result = await requestTab(tabId, { action: "FINISH_FROM_CURRENT_DRAFT" });
          sendResponse(result || { success: false, error: "Pas de réponse content script" });
          return;
        }

        case "publishCurrentDraft": {
          const tabId = await resolveActiveTabId();
          const result = await requestTab(tabId, {
            action: "PUBLISH_CURRENT_DRAFT",
            draftUrl: req.draftUrl || null,
            title: req.title || null,
            itemId: req.itemId || null,
          });
          sendResponse(result || { success: false, error: "Pas de réponse content script" });
          return;
        }

        case "importBackupAndRestore": {
          const backup = req.backup;
          if (!backup || typeof backup !== "object") {
            sendResponse({ success: false, error: "Backup JSON manquant" });
            return;
          }
          const result = await persistImportedBackupAndOpenDraft(backup, req.settings || {});
          sendResponse(result);
          return;
        }

        case "openDraftAfterImport": {
          // Popup already wrote storage — just navigate to /items/new.
          const draftUrl = "https://www.vinted.fr/items/new";
          let tabId = null;
          try {
            tabId = await resolveActiveTabId();
            const tab = await chrome.tabs.get(tabId);
            if (tab?.url && /vinted\./i.test(tab.url)) {
              await chrome.tabs.update(tabId, { url: draftUrl });
            } else {
              const created = await chrome.tabs.create({ url: draftUrl });
              tabId = created.id;
            }
          } catch (_) {
            const created = await chrome.tabs.create({ url: draftUrl });
            tabId = created.id;
          }
          sendResponse({ success: true, tabId, itemId: req.itemId || null });
          return;
        }

        case "restoreLatestLocalBackup": {
          const result = await restoreLatestLocalBackupAndOpenDraft(req.settings || {});
          sendResponse(result);
          return;
        }

        case "getVaultItems": {
          const indexResult = await chrome.storage.local.get(REPUBLISH_BACKUP_INDEX_KEY);
          const index = Array.isArray(indexResult[REPUBLISH_BACKUP_INDEX_KEY])
            ? indexResult[REPUBLISH_BACKUP_INDEX_KEY]
            : [];
          sendResponse({ success: true, items: index });
          return;
        }

        case "getVaultItemDetails": {
          const key = req.storageKey || `${REPUBLISH_BACKUP_PREFIX}${req.itemId}`;
          const res = await chrome.storage.local.get(key);
          const backup = res[key] || null;
          sendResponse({ success: Boolean(backup), backup });
          return;
        }

        case "deleteVaultItem": {
          const key = req.storageKey || `${REPUBLISH_BACKUP_PREFIX}${req.itemId}`;
          await chrome.storage.local.remove(key);
          const indexResult = await chrome.storage.local.get(REPUBLISH_BACKUP_INDEX_KEY);
          const index = Array.isArray(indexResult[REPUBLISH_BACKUP_INDEX_KEY])
            ? indexResult[REPUBLISH_BACKUP_INDEX_KEY]
            : [];
          const nextIndex = index.filter(
            (entry) => entry.storageKey !== key && String(entry.itemId) !== String(req.itemId)
          );
          await chrome.storage.local.set({ [REPUBLISH_BACKUP_INDEX_KEY]: nextIndex });
          sendResponse({ success: true });
          return;
        }

        case "restoreVaultItem": {
          const key = req.storageKey || `${REPUBLISH_BACKUP_PREFIX}${req.itemId}`;
          const res = await chrome.storage.local.get(key);
          const backup = res[key];
          if (!backup) {
            sendResponse({ success: false, error: "Annonce introuvable dans le coffre-fort" });
            return;
          }
          const outcome = await persistImportedBackupAndOpenDraft(backup, req.settings || {});
          sendResponse(outcome);
          return;
        }

        case "saveCurrentPageToVault": {
          const tabId = await resolveActiveTabId();
          const outcome = await requestTab(tabId, {
            action: "SAVE_CURRENT_PAGE_TO_VAULT",
            options: req.options || {},
          });
          sendResponse(outcome || { success: false, error: "Pas de réponse de la page Vinted" });
          return;
        }

        case "saveBatchToVault": {
          const tabId = await resolveActiveTabId();
          const items = Array.isArray(req.items) ? req.items : [];
          const savedResults = [];
          for (const item of items) {
            try {
              const res = await requestTab(tabId, {
                action: "SAVE_LISTING_BY_ID_TO_VAULT",
                itemId: item.id || item.itemId,
                item: item,
                options: req.options || {},
              });
              savedResults.push({
                itemId: item.id || item.itemId,
                success: !!res?.success,
                title: res?.title || item.title,
                photoCount: res?.photoCount || 0,
              });
            } catch (err) {
              savedResults.push({ itemId: item.id || item.itemId, success: false, error: err.message });
            }
          }
          sendResponse({ success: true, results: savedResults });
          return;
        }

        case "exportFullVault": {
          const indexResult = await chrome.storage.local.get(REPUBLISH_BACKUP_INDEX_KEY);
          const index = Array.isArray(indexResult[REPUBLISH_BACKUP_INDEX_KEY])
            ? indexResult[REPUBLISH_BACKUP_INDEX_KEY]
            : [];
          const keys = index.map((e) => e.storageKey).filter(Boolean);
          const allBackups = keys.length ? await chrome.storage.local.get(keys) : {};
          const vaultPayload = {
            exportedAt: new Date().toISOString(),
            version: 2,
            count: keys.length,
            items: keys.map((k) => allBackups[k]).filter(Boolean),
          };
          sendResponse({ success: true, vault: vaultPayload });
          return;
        }

        case "startSchemaCrawl": {
          const tabId = await resolveActiveTabId();
          const result = await requestTab(tabId, {
            action: "START_SCHEMA_CRAWL",
            options: req.options || {},
          });
          if (result && result.success === false) {
            sendResponse({ success: false, error: result.error || "Cartographie échouée", result });
            return;
          }
          sendResponse({ success: true, result });
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

const PENDING_DOM_DRAFT_KEY = "vinted_pending_dom_draft";
const REPUBLISH_BACKUP_PREFIX = "vinted_republish_backup_";
const REPUBLISH_BACKUP_INDEX_KEY = "vinted_republish_backup_index_v1";
const LAST_BACKUP_KEY = "vinted_republisher_last_backup_key_v1";

function backupPhotoList(backup) {
  const prepared = Array.isArray(backup?.photos?.prepared)
    ? backup.photos.prepared.filter((p) => p?.dataUrl)
    : [];
  if (prepared.length) return prepared;
  return Array.isArray(backup?.photos?.originals)
    ? backup.photos.originals.filter((p) => p?.dataUrl)
    : [];
}

function validateImportedBackup(backup) {
  if (!backup || typeof backup !== "object") {
    throw new Error("Backup invalide");
  }
  const item = backup.item;
  if (!item || typeof item !== "object") {
    throw new Error("Backup sans métadonnées d’annonce (item)");
  }
  if (!item.title && !item.itemId) {
    throw new Error("Backup incomplet: titre/itemId manquants");
  }
  const photos = backupPhotoList(backup);
  if (!photos.length) {
    throw new Error(
      "Backup sans photos binaires. Dépose le JSON complet (pas seulement le presse-papiers) ou ajoute les JPEG."
    );
  }
  return photos;
}

async function persistImportedBackupAndOpenDraft(backup, settings = {}) {
  const photos = validateImportedBackup(backup);
  const item = { ...backup.item };
  if (!item.itemId) item.itemId = String(backup.backupId || "").split("_")[0] || `import_${Date.now()}`;
  item.category = String(item.category || "").replace(/^[A-Z]{2,5}\s+/, "").trim() || item.category;

  if (settings.variations?.title) {
    item.title = settings.variations.title;
  }
  if (settings.variations?.description) {
    item.description = settings.variations.description;
  }

  let draftFiles = photos.map((file, index) => ({
    name: file.name || `vinted_restore_${index}.jpg`,
    type: file.type || "image/jpeg",
    dataUrl: file.dataUrl,
  }));

  if (Array.isArray(settings.variations?.photos) && settings.variations.photos.length > 0) {
    draftFiles = settings.variations.photos.map((p, index) => ({
      name: `vinted_var_${index}.jpg`,
      type: "image/jpeg",
      dataUrl: typeof p === "string" ? p : (p?.dataUrl || p?.sourceUrl || ""),
    })).filter(f => f.dataUrl);
  }

  const storageKey = `${REPUBLISH_BACKUP_PREFIX}${item.itemId}`;
  const nextBackup = {
    ...backup,
    version: backup.version || 2,
    backupId: backup.backupId || `${item.itemId}_${Date.now()}`,
    storageKey,
    item,
    photos: {
      originalCount: Array.isArray(backup.photos?.originals)
        ? backup.photos.originals.filter((p) => p?.dataUrl).length
        : 0,
      preparedCount: draftFiles.length,
      originals: Array.isArray(backup.photos?.originals) ? backup.photos.originals : [],
      prepared: draftFiles,
    },
    lifecycle: {
      ...(backup.lifecycle || {}),
      status: "IMPORTED",
      updatedAt: new Date().toISOString(),
      retainUntilDone: true,
      note: "Imported from downloaded backup file",
    },
    safety: {
      ...(backup.safety || {}),
      deleteOriginalAllowed: false,
      publishNewAllowed: false,
      photosRecoverable: true,
      reason: "Imported backup — destructive actions require fresh confirm",
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
        autoSave: settings.autoSave !== false,
        imageSettings: null,
      },
      files: draftFiles,
    },
  });

  const indexResult = await chrome.storage.local.get(REPUBLISH_BACKUP_INDEX_KEY);
  const index = Array.isArray(indexResult[REPUBLISH_BACKUP_INDEX_KEY])
    ? indexResult[REPUBLISH_BACKUP_INDEX_KEY]
    : [];
  const nextIndex = [
    {
      storageKey,
      backupId: nextBackup.backupId,
      itemId: item.itemId,
      title: item.title,
      createdAt: nextBackup.createdAt || new Date().toISOString(),
      photoCount: draftFiles.length,
      status: "IMPORTED",
    },
    ...index.filter((entry) => entry.storageKey !== storageKey),
  ].slice(0, 30);
  await chrome.storage.local.set({ [REPUBLISH_BACKUP_INDEX_KEY]: nextIndex });

  const draftUrl = "https://www.vinted.fr/items/new";
  let tabId = null;
  try {
    tabId = await resolveActiveTabId();
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url && /vinted\./i.test(tab.url)) {
      await chrome.tabs.update(tabId, { url: draftUrl });
    } else {
      const created = await chrome.tabs.create({ url: draftUrl });
      tabId = created.id;
    }
  } catch (_) {
    const created = await chrome.tabs.create({ url: draftUrl });
    tabId = created.id;
  }

  return {
    success: true,
    itemId: item.itemId,
    backupId: nextBackup.backupId,
    photoCount: draftFiles.length,
    title: item.title || "",
    tabId,
  };
}

async function restoreLatestLocalBackupAndOpenDraft(settings = {}) {
  const pointer = await chrome.storage.local.get(LAST_BACKUP_KEY);
  let key = pointer[LAST_BACKUP_KEY];
  if (!key) {
    const indexResult = await chrome.storage.local.get(REPUBLISH_BACKUP_INDEX_KEY);
    const index = Array.isArray(indexResult[REPUBLISH_BACKUP_INDEX_KEY])
      ? indexResult[REPUBLISH_BACKUP_INDEX_KEY]
      : [];
    key = index[0]?.storageKey || null;
  }
  if (!key) {
    throw new Error("Aucun backup local trouvé — importe un JSON téléchargé");
  }
  const result = await chrome.storage.local.get(key);
  const backup = result[key];
  if (!backup) {
    throw new Error("Backup local introuvable en storage");
  }
  return persistImportedBackupAndOpenDraft(backup, settings);
}
